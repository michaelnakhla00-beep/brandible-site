'use strict';

const { inferSourceProduct } = require('./research');

const UNCERTAIN_MARKERS =
  /\b(?:more likely|may|might|helps?|can help|influence(?:s|d)?|one factor|factor into|together these factors help)\b/i;

const ABSOLUTE_MARKERS =
  /\b(?:will|won't|will not|can't|cannot|there's no way|there is no way|never|always|there's no|there is no|nothing to)\b/i;

function isAbsoluteUpgrade(evidence, claim) {
  const stored = String(evidence || '');
  const proposed = String(claim || '');
  if (!UNCERTAIN_MARKERS.test(stored)) return false;
  return ABSOLUTE_MARKERS.test(proposed) && !ABSOLUTE_MARKERS.test(stored);
}

function stripMarkdownLinks(text) {
  return String(text || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function stripCitationWrappers(text) {
  let next = stripMarkdownLinks(text).trim();
  if (next.startsWith('[') && !/\]\(/.test(next)) {
    next = next.slice(1);
    if (next.endsWith(']') && !next.includes('[')) {
      next = next.slice(0, -1);
    }
  }
  return next.trim();
}

function toSafeWording(quote) {
  let text = stripCitationWrappers(quote)
    .replace(/\u2014/g, ', ')
    .replace(/\u2013/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (!/[.!?]$/.test(text)) text += '.';
  return text;
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 24);
}

function evidenceUnits(source) {
  const units = [];
  const seen = new Set();
  function push(about, quote) {
    const text = String(quote || '').trim();
    if (text.length < 24) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    units.push({ about, quote: text });
  }
  for (const sentence of splitSentences(source.excerpt)) {
    push('excerpt', sentence);
  }
  if (Array.isArray(source.evidence)) {
    for (const item of source.evidence) {
      if (!item) continue;
      const quote = String(item.quote || '').trim();
      if (quote) push(item.about || 'evidence', quote);
    }
  }
  return units;
}

function buildAllowedClaims(sourcePack) {
  if (!sourcePack || !sourcePack.needed || !Array.isArray(sourcePack.sources) || sourcePack.sources.length === 0) {
    return [];
  }
  const claims = [];
  let index = 0;
  for (const source of sourcePack.sources) {
    const product = inferSourceProduct(source);
    for (const unit of evidenceUnits(source)) {
      index += 1;
      const id = `AC${index}`;
      const safe = toSafeWording(unit.quote);
      claims.push({
        id,
        token: `{{${id}}}`,
        claim: safe,
        safe_wording: safe,
        source_id: source.id,
        url: source.url,
        evidence: unit.quote,
        about: unit.about,
        product,
        requires_citation: true
      });
    }
  }
  return claims;
}

function allowedClaimsForPrompt(claims) {
  if (!claims.length) {
    return [
      'No approved external claim tokens.',
      'Do not write externally verifiable platform facts. Do not invent {{AC#}} tokens.'
    ].join('\n');
  }
  const lines = [
    'Approved claim tokens. Insert a token in the body. Do not write or paraphrase the factual sentence.',
    'Code replaces each token with the safe wording and, when required, the markdown source link.',
    'Do not include sourced_fact rows in claims[]. Code derives those from tokens actually used.',
    ''
  ];
  for (const item of claims) {
    lines.push(item.token || `{{${item.id}}}`);
    lines.push(`  safe_wording: ${item.safe_wording || item.claim}`);
    lines.push(`  source_id: ${item.source_id}`);
    lines.push(`  url: ${item.url}`);
    lines.push(`  product/surface: ${item.product || 'unknown'}`);
    lines.push(`  citation: ${item.requires_citation ? 'code will insert' : 'not required'}`);
    lines.push(`  evidence: ${item.evidence}`);
    lines.push('');
  }
  return lines.join('\n');
}

function findAllowedClaim(claims, id) {
  return (claims || []).find((item) => item.id === id) || null;
}

module.exports = {
  buildAllowedClaims,
  allowedClaimsForPrompt,
  findAllowedClaim,
  isAbsoluteUpgrade,
  toSafeWording,
  UNCERTAIN_MARKERS,
  ABSOLUTE_MARKERS
};
