'use strict';

const { findAllowedClaim, toPlainDisplayText } = require('./allowed-claims');

const CLAIM_TOKEN_RE = /\{\{\s*(AC\d+)\s*\}\}/g;

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

function linkSafeWording(wording, url) {
  const text = toPlainDisplayText(wording);
  if (!text || !url) return text;
  const ended = /[.!?]$/.test(text);
  const core = ended ? text.slice(0, -1) : text;
  const mark = ended ? text.slice(-1) : '';
  return `[${core}](${url})${mark}`;
}

function renderCitedClaim(claim, options) {
  const cite = !options || options.cite !== false;
  const wording = String((claim && (claim.safe_wording || claim.claim)) || '').trim();
  if (!wording) return '';
  if (cite && claim.requires_citation && claim.url) {
    return linkSafeWording(wording, claim.url);
  }
  return wording;
}

function resolveClaimTokens(text, allowedClaims, options) {
  const byId = new Map((allowedClaims || []).map((item) => [item.id, item]));
  const usedIds = [];
  const unknownIds = [];
  const rendered = [];
  const resolved = String(text || '').replace(CLAIM_TOKEN_RE, (match, id) => {
    const claim = byId.get(id);
    if (!claim) {
      unknownIds.push(id);
      return match;
    }
    if (!usedIds.includes(id)) usedIds.push(id);
    const replacement = renderCitedClaim(claim, options);
    rendered.push({ id, text: replacement });
    return replacement;
  });
  return { text: resolved, usedIds, unknownIds, rendered };
}

function buildSourcedClaims(usedIds, allowedClaims) {
  const rows = [];
  for (const id of usedIds || []) {
    const allowed = findAllowedClaim(allowedClaims, id);
    if (!allowed) continue;
    rows.push({
      claim: allowed.safe_wording || allowed.claim,
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
  const sourced = buildSourcedClaims(usedIds, plan);
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

function isRenderedAllowedFact(sentence, renderedFacts) {
  const plain = normalizeForMatch(sentence);
  if (!plain) return false;
  return (renderedFacts || []).some((item) => {
    const fact = normalizeForMatch(item && item.text);
    if (!fact) return false;
    return plain === fact || plain.includes(fact) || fact.includes(plain);
  });
}

function matchingRenderedFact(sentence, renderedFacts) {
  const plain = normalizeForMatch(sentence);
  if (!plain) return null;
  return (
    (renderedFacts || []).find((item) => {
      const fact = normalizeForMatch(item && item.text);
      if (!fact) return false;
      return plain === fact || plain.includes(fact) || fact.includes(plain);
    }) || null
  );
}

module.exports = {
  CLAIM_TOKEN_RE,
  extractClaimTokens,
  resolveClaimTokens,
  renderCitedClaim,
  buildSourcedClaims,
  mergeNonSourcedClaims,
  assembleCta,
  assembleArticle,
  ctaNamesBrandible,
  isRenderedAllowedFact,
  matchingRenderedFact,
  bodyContainsIdea
};
