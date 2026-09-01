'use strict';

const { toPlainDisplayText } = require('./allowed-claims');

const MAX_SAFETY_REPAIRS = 3;
const EM_DASH = '\u2014';
const CLAIM_TOKEN_RE = /\{\{\s*AC\d+\s*\}\}/;

function stripMarkdownLinks(text) {
  return String(text || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

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

function splitSentences(text) {
  return String(text || '')
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z*"“\[])/)
    .map((item) => item.trim())
    .filter((item) => item.length > 20);
}

function bodyParagraphs(body) {
  return String(body || '').split(/\n\s*\n/);
}

function findSentenceInBody(body, test) {
  for (const paragraph of bodyParagraphs(body)) {
    if (/^##\s+/.test(paragraph.trim()) && !paragraph.includes('\n')) continue;
    const sentences = splitSentences(paragraph);
    for (const sentence of sentences) {
      if (test(sentence)) return sentence;
    }
    if (sentences.length === 0 && test(paragraph.trim())) return paragraph.trim();
  }
  return null;
}

function cleanupEmptyHeadings(body) {
  const chunks = String(body || '').split(/^(?=##\s)/m);
  const kept = [];
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const lines = trimmed.split('\n');
    if (/^##\s+/.test(lines[0])) {
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

function collectSafetyRepairs(article, problems) {
  const repairs = [];
  let emDashQueued = false;
  for (const problem of problems || []) {
    const code = problem && problem.code;
    const message = String((problem && problem.message) || '');
    if (code === 'V10_OTHER' && /contains an em dash/i.test(message)) {
      if (!emDashQueued) {
        repairs.push({ type: 'em_dash' });
        emDashQueued = true;
      }
      continue;
    }
    if (code === 'V9_QUANTIFIER' && /unsupported quantifier in body/i.test(message)) {
      const hit = quotedFromMessage(message);
      const sentence = findSentenceInBody(article.body, (item) => {
        if (hit && new RegExp(`\\b${hit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(item)) return true;
        return /\b(?:most|the majority of)\s+(?:(?:local|small|service)\s+)*(?:business\s+)?(?:people|businesses|owners|customers|callers|visitors|companies)\b|\bevery(?:one|body)\b/i.test(
          item
        );
      });
      if (sentence) repairs.push({ type: 'v9_body', sentence });
      continue;
    }
    if (code === 'V7_CLAIM_LEDGER' && /factual platform assertion is not an approved claim token/i.test(message)) {
      const quoted = quotedFromMessage(message);
      const sentence =
        quoted &&
        findSentenceInBody(
          article.body,
          (item) =>
            normalizeSnippet(item) === normalizeSnippet(quoted) || normalizeSnippet(item).includes(normalizeSnippet(quoted))
        );
      if (sentence) repairs.push({ type: 'v7_body', sentence });
    }
  }
  return repairs;
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

function applySafetyFallback(article, problems) {
  const repairs = collectSafetyRepairs(article, problems);
  if (!repairs.length) {
    return { article, applied: [], refused: false, needsAssemble: false };
  }
  if (repairs.length > MAX_SAFETY_REPAIRS) {
    return {
      article,
      applied: [],
      refused: true,
      reason: `${repairs.length} deterministic repairs required; max ${MAX_SAFETY_REPAIRS}`,
      needsAssemble: false
    };
  }
  let next = { ...article };
  const applied = [];
  for (const repair of repairs) {
    if (repair.type === 'em_dash') {
      next = applyEmDashRepair(next);
      applied.push('em_dash');
      continue;
    }
    if (repair.type === 'v9_body' || repair.type === 'v7_body') {
      next = { ...next, body: deleteSentenceFromBody(next.body, repair.sentence) };
      applied.push(repair.type);
    }
  }
  return {
    article: next,
    applied,
    refused: false,
    needsAssemble: CLAIM_TOKEN_RE.test(String(next.body || ''))
  };
}

module.exports = {
  MAX_SAFETY_REPAIRS,
  collectSafetyRepairs,
  applySafetyFallback
};
