'use strict';

const { toPlainDisplayText, findAllowedClaim } = require('./allowed-claims');
const { segmentMarkdownSentences, isMarkdownHeading } = require('./segments');
const { assembleCta, assembleArticle, refreshAssemblyState } = require('./assemble');
const { validateGeneratedArticle } = require('./validate');
const { stripMarkdownLinks } = require('./markdown-links');

const MAX_DELETED_SEGMENTS = 6;
const MAX_DELETED_CHAR_RATIO = 0.2;
const MAX_DETERMINISTIC_ROUNDS = 8;
const EM_DASH = '\u2014';
const CLAIM_TOKEN_RE = /\{\{\s*AC\d+\s*\}\}/;
const APPLY_ORDER = [
  'v6_replace_token',
  'v5_attribute',
  'v1_body',
  'v3_body',
  'v7_body',
  'v8_body',
  'v9_body',
  'deleted_segment',
  'drop_sourced_claim',
  'v2_cta',
  'unwrap_link',
  'duplicate_internal_link',
  'limit_internal_destinations',
  'em_dash'
];

function normalizeSnippet(text) {
  return toPlainDisplayText(stripMarkdownLinks(text))
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function quotedFromMessage(message) {
  const match = String(message || '').match(/“([^”]+)”|"([^"]+)"/);
  return match ? match[1] || match[2] : null;
}

function extractAcId(message) {
  const explicit = String(message || '').match(/\{\{\s*(AC\d+)\s*\}\}/);
  if (explicit) return explicit[1];
  const bare = String(message || '').match(/\b(AC\d+)\b/);
  return bare ? bare[1] : null;
}

function extractInternalHref(message) {
  const labeled = String(message || '').match(
    /(?:Internal link repeated|Internal link is not in the approved catalog):\s+(\/\S+)/i
  );
  if (!labeled) return null;
  const href = labeled[1];
  if (!href.startsWith('/') || /^https?:/i.test(href)) return null;
  return href;
}

function extractExternalHref(message) {
  const match = String(message || '').match(/(https?:\/\/[^\s)]+)/i);
  return match ? match[1].replace(/[.,;]+$/, '') : null;
}

function extractPriceToken(message) {
  const price = String(message || '').match(/Price\s+(\$\s*[\d,]+(?:\.\d+)?)/i);
  if (price) return price[1];
  const percent = String(message || '').match(/Percentage\s+“([^”]+)”|Percentage\s+"([^"]+)"/i);
  if (percent) return percent[1] || percent[2];
  if (/in a week or two/i.test(message)) return 'in a week or two';
  return quotedFromMessage(message);
}

function findSentenceInBody(body, test) {
  for (const sentence of segmentMarkdownSentences(body)) {
    if (isMarkdownHeading(sentence)) continue;
    if (test(sentence)) return sentence;
  }
  return null;
}

function isHostPeriod(text, index) {
  const prev = text[index - 1] || '';
  const next = text[index + 1] || '';
  return /[A-Za-z0-9]/.test(prev) && /[A-Za-z0-9]/.test(next);
}

function isSentenceBoundary(text, index) {
  const ch = text[index];
  if (ch !== '.' && ch !== '!' && ch !== '?') return false;
  if (ch === '.' && isHostPeriod(text, index)) return false;
  return true;
}

function innerQuantifierClause(segment, hit) {
  const text = String(segment || '');
  const token = String(hit || '').trim();
  if (!token) return null;
  const match = text.match(new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i'));
  if (!match) return null;
  const start = match.index;
  let end = start + match[0].length;
  while (end < text.length && text[end] !== '\n' && !isSentenceBoundary(text, end)) end += 1;
  if (end < text.length && isSentenceBoundary(text, end)) end += 1;
  const clause = text.slice(start, end).trim();
  return clause || null;
}

function findShortestSegmentContaining(body, quoted) {
  const target = normalizeSnippet(quoted);
  if (!target) return null;
  let best = null;
  for (const segment of segmentMarkdownSentences(body)) {
    if (isMarkdownHeading(segment)) continue;
    const normalized = normalizeSnippet(segment);
    if (!normalized.includes(target)) continue;
    if (!best || segment.length < best.length) best = segment;
  }
  return best;
}

function bodyHasText(article, text) {
  if (!text) return false;
  return String((article && article.body) || '').includes(text);
}

function cleanupEmptyHeadings(body) {
  const chunks = String(body || '').split(/^(?=#{1,6}\s)/m);
  const kept = [];
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const lines = trimmed.split('\n');
    if (/^#{1,6}\s+/.test(lines[0])) {
      const rest = lines.slice(1).join('\n').trim();
      if (!rest) continue;
    }
    kept.push(trimmed);
  }
  const next = kept.join('\n\n').trim();
  return next ? `${next}\n` : '\n';
}

function deleteSentenceFromBody(body, sentence) {
  const original = String(body || '');
  if (!sentence) return original;
  let next = original;
  if (next.includes(sentence)) {
    next = next.replace(sentence, '');
  } else {
    const target = normalizeSnippet(sentence);
    const found = findSentenceInBody(next, (item) => normalizeSnippet(item) === target || normalizeSnippet(item).includes(target));
    if (!found) return original;
    next = next.replace(found, '');
  }
  next = next.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return cleanupEmptyHeadings(next);
}

function replaceEmDashes(value) {
  return String(value || '').split(EM_DASH).join('-');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unwrapHref(body, targetHref) {
  if (!targetHref) return String(body || '');
  const re = new RegExp(`\\[([^\\[\\]\\r\\n]+)\\]\\(${escapeRegExp(targetHref)}\\)`, 'g');
  return String(body || '').replace(re, '$1');
}

function dedupeInternalLink(body, targetHref) {
  let seen = 0;
  return String(body || '').replace(/\[([^\[\]\r\n]+)\]\((\/[^()\r\n]+)\)/g, (full, label, href) => {
    if (href.trim() !== targetHref) return full;
    seen += 1;
    if (seen === 1) return full;
    return label;
  });
}

function limitInternalDestinations(body, maxUnique) {
  const seen = [];
  return String(body || '').replace(/\[([^\[\]\r\n]+)\]\((\/[^()\r\n]+)\)/g, (full, label, href) => {
    const trimmed = href.trim();
    if (seen.indexOf(trimmed) === -1) {
      if (seen.length >= maxUnique) return label;
      seen.push(trimmed);
    }
    return full;
  });
}

function structurallyComplete(article) {
  const title = String((article && article.title) || '').trim();
  const excerpt = String((article && article.excerpt) || '').trim();
  const meta = String((article && article.meta_description) || '').trim();
  const body = String((article && article.body) || '').trim();
  return Boolean(title && excerpt && meta && body && body.replace(/\s+/g, ' ').length >= 40);
}

function auditFor(repair) {
  const actionByType = {
    em_dash: 'normalized_em_dash',
    duplicate_internal_link: 'unwrapped_duplicate_internal_link',
    unwrap_link: 'unwrapped_link',
    limit_internal_destinations: 'unwrapped_extra_internal_destinations',
    v2_cta: 'assembled_cta',
    v5_attribute: 'attributed_first_party',
    v6_replace_token: 'replaced_with_token',
    drop_sourced_claim: 'dropped_sourced_claim',
    v1_body: 'deleted_segment',
    v3_body: 'deleted_segment',
    v7_body: 'deleted_segment',
    v8_body: 'deleted_segment',
    v9_body: 'deleted_segment',
    deleted_segment: 'deleted_segment'
  };
  return {
    code: repair.code,
    action: repair.action || actionByType[repair.type] || repair.type,
    reason: repair.reason
  };
}

function refuse(reason) {
  return { type: 'refuse', reason };
}

function deletionRepair(type, problem, sentence, reason) {
  return {
    type,
    code: problem.code,
    action: 'deleted_segment',
    reason,
    sentence
  };
}

function repairForProblem(article, problem, options) {
  const code = problem && problem.code;
  const message = String((problem && problem.message) || '');
  const body = String((article && article.body) || '');
  const allowedClaims = (options && options.allowedClaims) || [];

  if (code === 'V4_MISSING_SOURCE_LINK') {
    return refuse('V4_MISSING_SOURCE_LINK is code-owned and cannot be papered over');
  }

  if (code === 'V10_OTHER' && /contains an em dash/i.test(message)) {
    return { type: 'em_dash', code, action: 'normalized_em_dash', reason: 'em dash' };
  }
  if (code === 'V10_OTHER' && /Internal link repeated:/i.test(message)) {
    const href = extractInternalHref(message);
    if (!href) return refuse(message);
    return {
      type: 'duplicate_internal_link',
      code,
      action: 'unwrapped_duplicate_internal_link',
      reason: `duplicate internal link ${href}`,
      href
    };
  }
  if (code === 'V10_OTHER' && /Internal link is not in the approved catalog:/i.test(message)) {
    const href = extractInternalHref(message);
    if (!href) return refuse(message);
    return {
      type: 'unwrap_link',
      code,
      action: 'unwrapped_link',
      reason: `internal link not approved ${href}`,
      href
    };
  }
  if (code === 'V10_OTHER' && /Too many internal destinations/i.test(message)) {
    return {
      type: 'limit_internal_destinations',
      code,
      action: 'unwrapped_extra_internal_destinations',
      reason: 'more than 3 internal destinations'
    };
  }
  if (code === 'V10_OTHER' && /External link is not in the source pack:/i.test(message)) {
    const href = extractExternalHref(message);
    if (!href || !/^https?:\/\//i.test(href)) return refuse(message);
    return {
      type: 'unwrap_link',
      code,
      action: 'unwrapped_link',
      reason: `external link not in source pack ${href}`,
      href
    };
  }
  if (code === 'V10_OTHER') {
    return refuse(`Unrecognized V10 failure: ${message}`);
  }

  if (code === 'V9_QUANTIFIER') {
    if (!/unsupported quantifier in body/i.test(message)) {
      return refuse(`V9 in title/meta/excerpt cannot be repaired: ${message}`);
    }
    const hit = quotedFromMessage(message);
    const sentence = findSentenceInBody(body, (item) => {
      if (hit && new RegExp(`\\b${escapeRegExp(hit)}\\b`, 'i').test(item)) return true;
      return /\b(?:most|the majority of)\s+(?:(?:local|small|service)\s+)*(?:business\s+)?(?:people|businesses|owners|customers|callers|visitors|companies)\b|\bevery(?:one|body)\b/i.test(
        item
      );
    });
    if (!sentence) return refuse(message);
    const clause = innerQuantifierClause(sentence, hit);
    return deletionRepair('v9_body', problem, clause || sentence, 'unsupported quantifier');
  }

  if (code === 'V1_UNAPPROVED_FIRST_PARTY_NUMBER') {
    const token = extractPriceToken(message);
    const sentence = token ? findShortestSegmentContaining(body, token) : null;
    if (!sentence) return refuse(`V1 is not in the body and cannot be repaired: ${message}`);
    return deletionRepair('v1_body', problem, sentence, 'unauthorized first-party figure');
  }

  if (code === 'V2_CTA_SELF_QUALIFY') {
    const cta = article.cta && typeof article.cta === 'object' ? article.cta : {};
    if (!String(cta.fit_case || '').trim() || !String(cta.walk_away_case || '').trim()) {
      return refuse('V2_CTA_SELF_QUALIFY: structured fit_case or walk_away_case is missing');
    }
    return { type: 'v2_cta', code, action: 'assembled_cta', reason: 'deterministic CTA assembly' };
  }

  if (code === 'V5_UNLABELED_FIRST_PARTY') {
    const price = extractPriceToken(message);
    const sentence = price ? findShortestSegmentContaining(body, price) : null;
    if (!sentence || !price) return refuse(`V5 is not in the body and cannot be repaired: ${message}`);
    return {
      type: 'v5_attribute',
      code,
      action: 'attributed_first_party',
      reason: 'label approved first-party figure as Brandible',
      sentence,
      price
    };
  }

  if (code === 'V6_ABSOLUTE_WORDING') {
    const quoted = quotedFromMessage(message);
    const sentence = quoted ? findShortestSegmentContaining(body, quoted) : null;
    const tokenId = extractAcId(message);
    if (tokenId && findAllowedClaim(allowedClaims, tokenId) && sentence) {
      return {
        type: 'v6_replace_token',
        code,
        action: 'replaced_with_token',
        reason: `replace upgraded wording with ${tokenId}`,
        sentence,
        tokenId
      };
    }
    if (sentence) {
      return deletionRepair('deleted_segment', problem, sentence, 'absolute wording without a proven AC mapping');
    }
    return refuse(message);
  }

  if (code === 'V3_SOURCE_ENTAILMENT') {
    const quoted = quotedFromMessage(message);
    const tokenId = extractAcId(message);
    const sentence = quoted ? findShortestSegmentContaining(body, quoted) : null;
    if (tokenId && findAllowedClaim(allowedClaims, tokenId) && sentence && /\{\{\s*AC\d+\s*\}\}/.test(message)) {
      return {
        type: 'v6_replace_token',
        code,
        action: 'replaced_with_token',
        reason: `replace unsupported fact with ${tokenId}`,
        sentence,
        tokenId
      };
    }
    if (sentence) {
      return deletionRepair('v3_body', problem, sentence, /comparative|performance claim/i.test(message)
        ? 'unsupported comparative'
        : 'unsupported source entailment');
    }
    if (/factual categories guidance/i.test(message)) {
      const hit = findSentenceInBody(body, (item) => /primary category|business categor/i.test(item));
      if (hit) return deletionRepair('v3_body', problem, hit, 'unsupported category guidance');
    }
    if (quoted && Array.isArray(article.claims) && article.claims.some((item) => item.kind === 'sourced_fact' && normalizeSnippet(item.claim) === normalizeSnippet(quoted))) {
      return {
        type: 'drop_sourced_claim',
        code,
        action: 'dropped_sourced_claim',
        reason: 'unsupported sourced_fact in claims[]',
        quote: quoted
      };
    }
    return refuse(message);
  }

  if (code === 'V7_CLAIM_LEDGER' && /factual platform assertion is not an approved claim token/i.test(message)) {
    const quoted = quotedFromMessage(message);
    const sentence = quoted ? findShortestSegmentContaining(body, quoted) : null;
    if (!sentence) return refuse(message);
    return deletionRepair('v7_body', problem, sentence, 'raw platform assertion');
  }
  if (
    code === 'V7_CLAIM_LEDGER' &&
    /source-only citation|adjacent source-only|immediately restated|giant evidence anchor/i.test(message)
  ) {
    const quoted = quotedFromMessage(message);
    const sentence = quoted ? findShortestSegmentContaining(body, quoted) : null;
    if (!sentence) return refuse(message);
    return deletionRepair('v7_body', problem, sentence, 'citation quality');
  }
  if (code === 'V7_CLAIM_LEDGER') {
    return refuse(`Unrecognized V7 failure: ${message}`);
  }

  if (code === 'V8_OUT_OF_SCOPE') {
    const quoted = quotedFromMessage(message);
    let sentence = quoted ? findShortestSegmentContaining(body, quoted) : null;
    if (!sentence && /Local Services Ads/i.test(message)) {
      sentence = findSentenceInBody(body, (item) => /local services ads|\bLSA\b/i.test(item));
    }
    if (!sentence && /Google Business Profile category/i.test(message)) {
      sentence = findSentenceInBody(body, (item) => /categor/i.test(item));
    }
    if (!sentence) return refuse(message);
    return deletionRepair('v8_body', problem, sentence, 'out-of-scope guidance');
  }

  return refuse(`Unrecognized problem ${code}: ${message}`);
}

function compileRepairs(article, problems, options) {
  const repairs = [];
  const seen = new Set();
  function remember(key) {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }
  for (const problem of problems || []) {
    const repair = repairForProblem(article, problem, options);
    if (!repair || repair.type === 'refuse') {
      return { repairs: [], refused: true, reason: (repair && repair.reason) || String((problem && problem.message) || 'unrepairable') };
    }
    const key = `${repair.type}:${repair.href || repair.tokenId || repair.sentence || repair.quote || repair.reason}`;
    if (!remember(key)) continue;
    repairs.push(repair);
  }
  return { repairs, refused: false, reason: null };
}

function collectSafetyRepairs(article, problems, options) {
  const compiled = compileRepairs(article, problems, options);
  if (compiled.refused) return [];
  return compiled.repairs;
}

function applyEmDashRepair(article) {
  const cta = article.cta && typeof article.cta === 'object' ? { ...article.cta } : article.cta;
  if (cta) {
    if (cta.fit_case) cta.fit_case = replaceEmDashes(cta.fit_case);
    if (cta.walk_away_case) cta.walk_away_case = replaceEmDashes(cta.walk_away_case);
  }
  return {
    ...article,
    title: replaceEmDashes(article.title),
    meta_title: replaceEmDashes(article.meta_title),
    meta_description: replaceEmDashes(article.meta_description),
    excerpt: replaceEmDashes(article.excerpt),
    body: replaceEmDashes(article.body),
    cta
  };
}

function sortRepairs(repairs) {
  return [...repairs].sort((a, b) => APPLY_ORDER.indexOf(a.type) - APPLY_ORDER.indexOf(b.type));
}

function applySafetyFallback(article, problems, options) {
  const allowedClaims = (options && options.allowedClaims) || [];
  const compiled = compileRepairs(article, problems, options);
  if (compiled.refused) {
    return {
      article,
      applied: [],
      repairs: [],
      refused: true,
      reason: compiled.reason,
      needsAssemble: false,
      deletedSegments: (options && options.priorDeletedSegments) || 0,
      deletedChars: (options && options.priorDeletedChars) || 0
    };
  }
  if (!compiled.repairs.length) {
    return {
      article,
      applied: [],
      repairs: [],
      refused: false,
      needsAssemble: false,
      deletedSegments: (options && options.priorDeletedSegments) || 0,
      deletedChars: (options && options.priorDeletedChars) || 0
    };
  }

  const originalBodyChars =
    options && Number.isFinite(options.originalBodyChars)
      ? options.originalBodyChars
      : String((article && article.body) || '').length;
  const priorDeletedSegments = (options && options.priorDeletedSegments) || 0;
  const priorDeletedChars = (options && options.priorDeletedChars) || 0;
  let next = { ...article };
  const applied = [];
  const audit = [];
  let deletedSegments = 0;
  let deletedChars = 0;
  let needsAssemble = CLAIM_TOKEN_RE.test(String(next.body || ''));

  for (const repair of sortRepairs(compiled.repairs)) {
    if (repair.type === 'em_dash') {
      next = applyEmDashRepair(next);
      applied.push('em_dash');
      audit.push(auditFor(repair));
      continue;
    }
    if (repair.type === 'duplicate_internal_link') {
      next = { ...next, body: dedupeInternalLink(next.body, repair.href) };
      applied.push('duplicate_internal_link');
      audit.push(auditFor(repair));
      continue;
    }
    if (repair.type === 'unwrap_link') {
      next = { ...next, body: unwrapHref(next.body, repair.href) };
      applied.push('unwrap_link');
      audit.push(auditFor(repair));
      continue;
    }
    if (repair.type === 'limit_internal_destinations') {
      next = { ...next, body: limitInternalDestinations(next.body, 3) };
      applied.push('limit_internal_destinations');
      audit.push(auditFor(repair));
      continue;
    }
    if (repair.type === 'v2_cta') {
      next = assembleCta(next);
      applied.push('v2_cta');
      audit.push(auditFor(repair));
      continue;
    }
    if (repair.type === 'v5_attribute') {
      if (bodyHasText(next, repair.sentence) && repair.price && !/Brandible/i.test(repair.sentence)) {
        const labeled = repair.sentence.replace(repair.price, `Brandible's ${repair.price}`);
        next = { ...next, body: String(next.body).replace(repair.sentence, labeled) };
      }
      applied.push('v5_attribute');
      audit.push(auditFor(repair));
      continue;
    }
    if (repair.type === 'v6_replace_token') {
      if (bodyHasText(next, repair.sentence) && repair.tokenId) {
        const allowed = findAllowedClaim(allowedClaims, repair.tokenId);
        const wording = String((allowed && (allowed.safe_wording || allowed.claim)) || '').replace(/\s+/g, ' ').trim();
        const replacement = wording ? `${wording} {{${repair.tokenId}}}` : `{{${repair.tokenId}}}`;
        next = { ...next, body: String(next.body).replace(repair.sentence, replacement) };
        needsAssemble = true;
      }
      applied.push('v6_replace_token');
      audit.push(auditFor(repair));
      continue;
    }
    if (repair.type === 'drop_sourced_claim') {
      next = {
        ...next,
        claims: (next.claims || []).filter((item) => {
          if (item.kind !== 'sourced_fact') return true;
          if (!repair.quote) return false;
          return normalizeSnippet(item.claim) !== normalizeSnippet(repair.quote);
        })
      };
      applied.push('drop_sourced_claim');
      audit.push(auditFor(repair));
      continue;
    }
    if (
      repair.type === 'v9_body' ||
      repair.type === 'v7_body' ||
      repair.type === 'v1_body' ||
      repair.type === 'v3_body' ||
      repair.type === 'v8_body' ||
      repair.type === 'deleted_segment'
    ) {
      const before = String(next.body || '');
      const after = deleteSentenceFromBody(before, repair.sentence);
      if (after !== before) {
        deletedSegments += 1;
        deletedChars += String(repair.sentence || '').length;
        next = { ...next, body: after };
      }
      applied.push(repair.type);
      audit.push(auditFor(repair));
    }
  }

  const totalDeletedSegments = priorDeletedSegments + deletedSegments;
  const totalDeletedChars = priorDeletedChars + deletedChars;
  if (totalDeletedSegments > MAX_DELETED_SEGMENTS) {
    return {
      article,
      applied: [],
      repairs: [],
      refused: true,
      reason: `Deleted ${totalDeletedSegments} Markdown segments; max ${MAX_DELETED_SEGMENTS}`,
      needsAssemble: false,
      deletedSegments: totalDeletedSegments,
      deletedChars: totalDeletedChars
    };
  }
  const budget = Math.floor(originalBodyChars * MAX_DELETED_CHAR_RATIO);
  if (originalBodyChars && totalDeletedChars > budget) {
    return {
      article,
      applied: [],
      repairs: [],
      refused: true,
      reason: `Deleted ${totalDeletedChars} body characters (${Math.round((totalDeletedChars / originalBodyChars) * 100)}%); max 20%`,
      needsAssemble: false,
      deletedSegments: totalDeletedSegments,
      deletedChars: totalDeletedChars
    };
  }
  if (!structurallyComplete(next)) {
    return {
      article,
      applied: [],
      repairs: [],
      refused: true,
      reason: 'Repair left the article without required structure',
      needsAssemble: false,
      deletedSegments: totalDeletedSegments,
      deletedChars: totalDeletedChars
    };
  }

  return {
    article: next,
    applied,
    repairs: audit,
    refused: false,
    needsAssemble: needsAssemble || CLAIM_TOKEN_RE.test(String(next.body || '')),
    deletedSegments: totalDeletedSegments,
    deletedChars: totalDeletedChars
  };
}

function fingerprintProblems(problems) {
  return (problems || [])
    .map((item) => `${item && item.code ? item.code : ''}\t${item && item.message ? item.message : ''}`)
    .sort()
    .join('\n');
}

function snapshotArticle(article) {
  return JSON.stringify({
    title: article && article.title,
    meta_title: article && article.meta_title,
    meta_description: article && article.meta_description,
    excerpt: article && article.excerpt,
    body: article && article.body,
    cta: article && article.cta,
    claims: article && article.claims
  });
}

function refuseFixedPoint(inputArticle, audit, reason, extras) {
  return {
    article: inputArticle,
    applied: [],
    repairs: audit,
    refused: true,
    reason,
    needsAssemble: false,
    rounds: extras && extras.rounds ? extras.rounds : 0,
    deletedSegments: extras && extras.deletedSegments ? extras.deletedSegments : 0,
    deletedChars: extras && extras.deletedChars ? extras.deletedChars : 0,
    originalBodyChars: extras && extras.originalBodyChars ? extras.originalBodyChars : 0,
    problems: extras && extras.problems ? extras.problems : []
  };
}

function runDeterministicRepairsToFixedPoint(input) {
  const article0 = input && input.article;
  const ctx = (input && input.ctx) || {};
  const allowedClaims = (input && input.allowedClaims) || [];
  const catalog = input && input.catalog;
  const validate = input && input.validate ? input.validate : validateGeneratedArticle;
  const originalBodyChars = String((article0 && article0.body) || '').length;
  let article = article0;
  let totalDeletedSegments = 0;
  let totalDeletedChars = 0;
  const audit = [];
  const seenFingerprints = new Set();
  let problems = validate(article, ctx);

  if (!problems.length) {
    return {
      article,
      applied: [],
      repairs: [],
      refused: false,
      reason: null,
      needsAssemble: false,
      rounds: 0,
      deletedSegments: 0,
      deletedChars: 0,
      originalBodyChars,
      problems
    };
  }

  for (let round = 1; round <= MAX_DETERMINISTIC_ROUNDS; round += 1) {
    const fingerprint = fingerprintProblems(problems);
    if (seenFingerprints.has(fingerprint)) {
      return refuseFixedPoint(article0, audit, 'Repeated identical validation state after a repair', {
        rounds: round,
        deletedSegments: totalDeletedSegments,
        deletedChars: totalDeletedChars,
        originalBodyChars,
        problems
      });
    }
    seenFingerprints.add(fingerprint);

    const before = snapshotArticle(article);
    const fallback = applySafetyFallback(article, problems, {
      allowedClaims,
      catalog,
      originalBodyChars,
      priorDeletedSegments: totalDeletedSegments,
      priorDeletedChars: totalDeletedChars
    });
    if (fallback.refused) {
      return refuseFixedPoint(article0, audit, fallback.reason, {
        rounds: round,
        deletedSegments: fallback.deletedSegments,
        deletedChars: fallback.deletedChars,
        originalBodyChars,
        problems
      });
    }
    if (!fallback.applied.length && !fallback.repairs.length) {
      return refuseFixedPoint(article0, audit, 'No deterministic repair produced for current problems', {
        rounds: round,
        deletedSegments: totalDeletedSegments,
        deletedChars: totalDeletedChars,
        originalBodyChars,
        problems
      });
    }
    if (snapshotArticle(fallback.article) === before) {
      return refuseFixedPoint(article0, audit, 'Repair round made no article change', {
        rounds: round,
        deletedSegments: totalDeletedSegments,
        deletedChars: totalDeletedChars,
        originalBodyChars,
        problems
      });
    }

    article = fallback.article;
    totalDeletedSegments = fallback.deletedSegments;
    totalDeletedChars = fallback.deletedChars;
    for (const item of fallback.repairs || []) {
      audit.push({ round, code: item.code, action: item.action, reason: item.reason });
    }
    if (fallback.needsAssemble) {
      article = assembleArticle(article, allowedClaims);
    }
    article = refreshAssemblyState(article, allowedClaims);
    problems = validate(article, ctx);
    if (!problems.length) {
      return {
        article,
        applied: fallback.applied,
        repairs: audit,
        refused: false,
        reason: null,
        needsAssemble: false,
        rounds: round,
        deletedSegments: totalDeletedSegments,
        deletedChars: totalDeletedChars,
        originalBodyChars,
        problems
      };
    }
  }

  return refuseFixedPoint(
    article0,
    audit,
    `Exceeded ${MAX_DETERMINISTIC_ROUNDS} deterministic repair rounds`,
    {
      rounds: MAX_DETERMINISTIC_ROUNDS,
      deletedSegments: totalDeletedSegments,
      deletedChars: totalDeletedChars,
      originalBodyChars,
      problems
    }
  );
}

module.exports = {
  MAX_DELETED_SEGMENTS,
  MAX_DELETED_CHAR_RATIO,
  MAX_DETERMINISTIC_ROUNDS,
  collectSafetyRepairs,
  applySafetyFallback,
  runDeterministicRepairsToFixedPoint,
  fingerprintProblems,
  dedupeInternalLink,
  compileRepairs
};
