'use strict';

const { findAllowedClaim, toPlainDisplayText } = require('./allowed-claims');
const { extractMarkdownLinks } = require('./markdown-links');
const { isMarkdownHeading } = require('./segments');

const CLAIM_TOKEN_RE = /\{\{\s*(AC\d+)\s*\}\}/g;
const SOURCE_LINK_LABEL = 'Source';

function normalizeForMatch(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[^a-z0-9%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bodyContainsIdea(body, idea) {
  const text = String(idea || '').trim();
  if (text.length < 12) return false;
  const nBody = normalizeForMatch(body);
  const nIdea = normalizeForMatch(text);
  if (!nIdea) return false;
  if (nBody.includes(nIdea)) return true;
  const words = nIdea.split(' ').filter((word) => word.length > 2);
  if (words.length < 4) return nBody.includes(nIdea.slice(0, Math.min(20, nIdea.length)));
  const hits = words.filter((word) => nBody.includes(word));
  return hits.length / words.length >= 0.6;
}

function extractClaimTokens(text) {
  const ids = [];
  const seen = new Set();
  const re = new RegExp(CLAIM_TOKEN_RE.source, 'g');
  let match;
  while ((match = re.exec(String(text || ''))) !== null) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function uniqueIds(lists) {
  const seen = new Set();
  const ids = [];
  for (const list of lists) {
    for (const id of list || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function unwrapClaimTokenWrappers(text) {
  let next = String(text || '');
  for (let i = 0; i < 6; i += 1) {
    const before = next;
    next = next.replace(/\[(\{\{\s*AC\d+\s*\}\})\]\([^)]*\)/g, '$1');
    next = next.replace(/\[(\{\{\s*AC\d+\s*\}\})\]/g, '$1');
    next = next.replace(/["'\u201C\u201D\u2018\u2019](\{\{\s*AC\d+\s*\}\})["'\u201C\u201D\u2018\u2019]/g, '$1');
    next = next.replace(/\*\*(\{\{\s*AC\d+\s*\}\})\*\*/g, '$1');
    if (next === before) break;
  }
  return next;
}

function citationMarkup(url) {
  if (!url) return '';
  return `[${SOURCE_LINK_LABEL}](${url})`;
}

function normalizeDisplayClaim(text) {
  let next = String(text || '')
    .replace(/\[Source\]\(https?:\/\/[^)]+\)/gi, ' ')
    .replace(new RegExp(CLAIM_TOKEN_RE.source, 'g'), ' ');
  next = toPlainDisplayText(next);
  next = next.replace(/\s+/g, ' ').trim();
  next = next.replace(/\s+([.!?])/g, '$1');
  next = next.replace(/([.!?]){2,}/g, '$1');
  return next;
}

function hasClaimSubstance(text) {
  const plain = normalizeDisplayClaim(text);
  if (plain.length < 24) return false;
  const words = plain.split(' ').filter((word) => word.length > 2);
  return words.length >= 4;
}

function splitLocalSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+(?=[A-Z*"“\[{])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function precedingProseSentence(text) {
  const trimmed = String(text || '').replace(/[^\S\n]+$/g, '').replace(/\s+$/, '');
  if (!trimmed) return '';
  const paragraphs = trimmed.split(/\n\s*\n/);
  while (paragraphs.length) {
    const para = paragraphs.pop().trim();
    if (!para) continue;
    if (isMarkdownHeading(para)) return '';
    const sentences = splitLocalSentences(para.replace(/\n+/g, ' '));
    if (!sentences.length) continue;
    const last = normalizeDisplayClaim(sentences[sentences.length - 1]);
    return hasClaimSubstance(last) ? last : '';
  }
  return '';
}

function isDirtyHost(text) {
  const plain = String(text || '');
  if (/\bevery(?:one|body)\b/i.test(plain)) return true;
  if (/\[/.test(plain) && !/\]\(/.test(plain)) return true;
  return false;
}

function bindDisplayClaim(text, matchStart, matchEnd) {
  const before = String(text || '').slice(0, matchStart);
  const beforeTrim = before.replace(/[^\S\n]+$/g, '').replace(/\s+$/, '');
  if (/[.!?]$/.test(beforeTrim)) {
    const previous = precedingProseSentence(beforeTrim);
    return isDirtyHost(previous) ? '' : previous;
  }
  const paraStart = Math.max(before.lastIndexOf('\n\n') + 2, 0);
  const rest = String(text || '').slice(matchEnd);
  const paraEndRel = rest.search(/\n\s*\n/);
  const paraEnd = paraEndRel >= 0 ? matchEnd + paraEndRel : String(text || '').length;
  const paragraph = String(text || '').slice(paraStart, paraEnd);
  const localStart = matchStart - paraStart;
  const localEnd = matchEnd - paraStart;
  const withoutToken = `${paragraph.slice(0, localStart)}${paragraph.slice(localEnd)}`;
  const inline = normalizeDisplayClaim(withoutToken.replace(/\n+/g, ' '));
  if (hasClaimSubstance(inline) && !isDirtyHost(inline)) return inline;
  const previous = precedingProseSentence(beforeTrim);
  return isDirtyHost(previous) ? '' : previous;
}

function normalizeCitationPunctuation(text) {
  let next = String(text || '');
  next = next.replace(/[ \t]+\n/g, '\n');
  next = next.replace(/\[\s+Source\s*\]/gi, '[Source]');
  next = next.replace(/\][ \t]+\(/g, '](');
  next = next.replace(/([.!?])\[Source\]/g, '$1 [Source]');
  next = next.replace(/[^\S\n]{2,}/g, ' ');
  next = next.replace(/[^\S\n]+([.!?])/g, '$1');
  next = next.replace(/([.!?]){2,}/g, '$1');
  next = next.replace(/\[Source\]\((https?:\/\/[^)]+)\)[.!?]+/g, '[Source]($1)');
  return next;
}

function renderCitedClaim(claim, options) {
  const cite = !options || options.cite !== false;
  if (!cite) return '';
  if (claim && claim.requires_citation && claim.url) {
    return citationMarkup(claim.url);
  }
  return '';
}

function resolveClaimTokens(text, allowedClaims, options) {
  const byId = new Map((allowedClaims || []).map((item) => [item.id, item]));
  const usedIds = [];
  const unknownIds = [];
  const rendered = [];
  const unwrapped = unwrapClaimTokenWrappers(text);
  const bindings = [];
  const finder = new RegExp(CLAIM_TOKEN_RE.source, 'g');
  let found;
  while ((found = finder.exec(unwrapped)) !== null) {
    bindings.push({
      id: found[1],
      start: found.index,
      display_claim: bindDisplayClaim(unwrapped, found.index, found.index + found[0].length)
    });
  }
  let bindIndex = 0;
  const resolvedRaw = String(unwrapped || '').replace(CLAIM_TOKEN_RE, (match, id) => {
    const claim = byId.get(id);
    const binding = bindings[bindIndex];
    bindIndex += 1;
    if (!claim) {
      unknownIds.push(id);
      return match;
    }
    if (!usedIds.includes(id)) usedIds.push(id);
    const replacement = renderCitedClaim(claim, options);
    rendered.push({
      id,
      text: replacement,
      display_claim: binding && binding.id === id ? binding.display_claim : '',
      url: claim.url
    });
    return replacement;
  });
  return {
    text: normalizeCitationPunctuation(resolvedRaw),
    usedIds,
    unknownIds,
    rendered
  };
}

function overlapScore(display, evidence) {
  const left = normalizeForMatch(display)
    .split(' ')
    .filter((word) => word.length > 3);
  if (!left.length) return 0;
  const right = normalizeForMatch(evidence);
  const hits = left.filter((word) => right.includes(word));
  return hits.length / left.length;
}

function pickBestClaim(display, candidates) {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  let best = candidates[0];
  let bestScore = -1;
  for (const item of candidates) {
    const score = overlapScore(display, `${item.evidence || ''} ${item.claim || ''} ${item.safe_wording || ''}`);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

function displayClaimForCitation(body, link, fromIndex) {
  const href = link.rawHref != null ? link.rawHref : link.href;
  const markup = `[${link.label}](${href})`;
  const idx = String(body || '').indexOf(markup, fromIndex || 0);
  if (idx < 0) return { display: '', nextIndex: fromIndex || 0 };
  return {
    display: bindDisplayClaim(body, idx, idx + markup.length),
    nextIndex: idx + markup.length
  };
}

function buildSourcedClaims(renderedFacts, allowedClaims) {
  const rows = [];
  for (const item of renderedFacts || []) {
    const id = typeof item === 'string' ? item : item && item.id;
    const allowed = findAllowedClaim(allowedClaims, id);
    if (!allowed) continue;
    const display =
      typeof item === 'string' ? '' : normalizeDisplayClaim(item && item.display_claim);
    const claimText = display || String(allowed.safe_wording || allowed.claim || '').trim();
    if (!claimText) continue;
    rows.push({
      claim: claimText,
      kind: 'sourced_fact',
      source_id: allowed.source_id,
      allowed_claim_id: allowed.id
    });
  }
  return rows;
}

function mergeNonSourcedClaims(modelClaims, sourcedRows) {
  const kept = (modelClaims || []).filter((item) => {
    const kind = String((item && item.kind) || '').trim();
    return kind && kind !== 'sourced_fact';
  });
  return [...sourcedRows, ...kept];
}

function ctaNamesBrandible(article) {
  const tail = String(article.body || '').trim().slice(-900);
  const cta = article.cta && typeof article.cta === 'object' ? article.cta : {};
  return Boolean(cta.names_brandible) || /Brandible/i.test(tail);
}

function assembleCta(article) {
  const cta = article.cta && typeof article.cta === 'object' ? article.cta : {};
  const fit = String(cta.fit_case || '').trim();
  const walkAway = String(cta.walk_away_case || '').trim();
  if (!ctaNamesBrandible(article) || !fit || !walkAway) return article;
  const body = String(article.body || '');
  const hasFit = bodyContainsIdea(body, fit);
  const hasWalk = bodyContainsIdea(body, walkAway);
  if (hasFit && hasWalk) {
    return {
      ...article,
      cta: { ...cta, names_brandible: true, fit_case: fit, walk_away_case: walkAway }
    };
  }
  const block = [hasWalk ? '' : walkAway, hasFit ? '' : fit].filter(Boolean).join(' ').trim();
  return {
    ...article,
    body: `${body.trimEnd()}\n\n${block}\n`,
    cta: { ...cta, names_brandible: true, fit_case: fit, walk_away_case: walkAway }
  };
}

function assembleArticle(article, allowedClaims) {
  const plan = allowedClaims || [];
  const bodyResult = resolveClaimTokens(article.body, plan, { cite: true });
  const excerptResult = resolveClaimTokens(article.excerpt, plan, { cite: false });
  const titleTokens = extractClaimTokens(article.title);
  const metaTitleTokens = extractClaimTokens(article.meta_title);
  const metaDescTokens = extractClaimTokens(article.meta_description);
  const usedIds = uniqueIds([bodyResult.usedIds, excerptResult.usedIds]);
  const sourced = buildSourcedClaims(bodyResult.rendered, plan);
  const next = assembleCta({
    ...article,
    excerpt: excerptResult.text,
    body: bodyResult.text,
    claims: mergeNonSourcedClaims(article.claims, sourced),
    unresolved_tokens: uniqueIds([
      bodyResult.unknownIds,
      excerptResult.unknownIds,
      titleTokens,
      metaTitleTokens,
      metaDescTokens
    ]),
    rendered_facts: bodyResult.rendered,
    claim_tokens_used: usedIds
  });
  return next;
}

function refreshAssemblyState(article, allowedClaims) {
  const plan = allowedClaims || [];
  const body = String(article.body || '');
  const rendered_facts = [];
  const usedIds = [];
  const links = extractMarkdownLinks(body).filter((link) => {
    return String(link.label || '').trim() === SOURCE_LINK_LABEL && /^https?:\/\//i.test(link.href);
  });
  let cursor = 0;
  for (const link of links) {
    const bound = displayClaimForCitation(body, link, cursor);
    cursor = bound.nextIndex;
    const display = bound.display;
    const candidates = plan.filter(
      (item) => item && item.requires_citation && item.url === link.href && !usedIds.includes(item.id)
    );
    const matched = pickBestClaim(display, candidates);
    if (!matched) continue;
    usedIds.push(matched.id);
    rendered_facts.push({
      id: matched.id,
      text: citationMarkup(matched.url),
      display_claim: display,
      url: matched.url
    });
  }
  return {
    ...article,
    rendered_facts,
    claim_tokens_used: usedIds,
    claims: mergeNonSourcedClaims(article.claims, buildSourcedClaims(rendered_facts, plan))
  };
}

function isRenderedAllowedFact(sentence, renderedFacts) {
  return Boolean(matchingRenderedFact(sentence, renderedFacts));
}

function matchingRenderedFact(sentence, renderedFacts) {
  const raw = String(sentence || '');
  const plain = normalizeForMatch(sentence);
  if (!plain) return null;
  return (
    (renderedFacts || []).find((item) => {
      const cite = String((item && item.text) || '');
      if (cite && raw.includes(cite)) return true;
      const display = normalizeForMatch(item && item.display_claim);
      if (!display) return false;
      if (plain === display) return true;
      if (cite) {
        const withoutCite = normalizeForMatch(raw.split(cite).join(' '));
        if (withoutCite === display) return true;
      }
      return false;
    }) || null
  );
}

module.exports = {
  CLAIM_TOKEN_RE,
  SOURCE_LINK_LABEL,
  extractClaimTokens,
  unwrapClaimTokenWrappers,
  resolveClaimTokens,
  renderCitedClaim,
  citationMarkup,
  bindDisplayClaim,
  normalizeCitationPunctuation,
  normalizeDisplayClaim,
  buildSourcedClaims,
  mergeNonSourcedClaims,
  assembleCta,
  assembleArticle,
  refreshAssemblyState,
  ctaNamesBrandible,
  isRenderedAllowedFact,
  matchingRenderedFact,
  bodyContainsIdea
};
