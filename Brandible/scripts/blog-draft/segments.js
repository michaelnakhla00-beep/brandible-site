'use strict';

const HEADING_RE = /^#{1,6}\s/;
const LIST_ITEM_RE = /^(?:[-*+]|\d+\.)\s+\S/;
const FENCE_OPEN_RE = /^(`{3,}|~{3,})/;

function isMarkdownHeading(text) {
  return HEADING_RE.test(String(text || '').trim());
}

function fenceMarker(trimmed) {
  const match = String(trimmed || '').match(FENCE_OPEN_RE);
  return match ? match[1] : null;
}

function isFenceClose(trimmed, openMarker) {
  if (!openMarker) return false;
  const char = openMarker[0] === '`' ? '`' : '~';
  const re = new RegExp(`^${char}{${openMarker.length},}\\s*$`);
  return re.test(String(trimmed || ''));
}

function splitProseSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+(?=[A-Z*"“\[])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function flushProse(lines, units) {
  if (!lines.length) return;
  const chunk = lines.join('\n').trim();
  lines.length = 0;
  if (!chunk) return;
  units.push(...splitProseSentences(chunk));
}

function segmentMarkdownSentences(markdown) {
  const units = [];
  const lines = String(markdown || '').split(/\r?\n/);
  const proseLines = [];
  let fence = null;
  let fenceLines = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (fence) {
      fenceLines.push(line);
      if (isFenceClose(trimmed, fence)) {
        const fenced = fenceLines.join('\n').trim();
        if (fenced) units.push(fenced);
        fence = null;
        fenceLines = [];
      }
      continue;
    }

    const openFence = fenceMarker(trimmed);
    if (openFence) {
      flushProse(proseLines, units);
      fence = openFence;
      fenceLines = [line];
      continue;
    }

    if (!trimmed) {
      flushProse(proseLines, units);
      continue;
    }

    if (isMarkdownHeading(trimmed)) {
      flushProse(proseLines, units);
      units.push(trimmed);
      continue;
    }

    if (LIST_ITEM_RE.test(trimmed)) {
      flushProse(proseLines, units);
      units.push(...splitProseSentences(trimmed));
      continue;
    }

    if (trimmed.startsWith('[')) {
      flushProse(proseLines, units);
      units.push(trimmed);
      continue;
    }

    proseLines.push(line);
  }

  if (fence) {
    const fenced = fenceLines.join('\n').trim();
    if (fenced) units.push(fenced);
  }
  flushProse(proseLines, units);
  return units;
}

module.exports = {
  isMarkdownHeading,
  segmentMarkdownSentences
};
