'use strict';

const { segmentMarkdownSentences } = require('./segments');

const INLINE_LINK_RE = /\[([^\[\]\r\n]+)\]\(([^()\r\n]+)\)/g;

function extractMarkdownLinks(markdown) {
  const links = [];

  for (const segment of segmentMarkdownSentences(markdown)) {
    INLINE_LINK_RE.lastIndex = 0;
    let match;
    while ((match = INLINE_LINK_RE.exec(segment)) !== null) {
      links.push({
        label: match[1],
        href: match[2].trim(),
        rawHref: match[2],
        segment,
        index: match.index
      });
    }
  }

  return links;
}

function extractMarkdownHrefs(markdown) {
  return extractMarkdownLinks(markdown).map((link) => link.href);
}

function markdownLinkMarkup(link) {
  const href = link.rawHref != null ? link.rawHref : link.href;
  return `[${link.label}](${href})`;
}

function stripMarkdownLinks(markdown) {
  const source = String(markdown || '');
  if (!source) return source;
  const seen = new Set();
  let next = source;
  for (const link of extractMarkdownLinks(source)) {
    const full = markdownLinkMarkup(link);
    if (seen.has(full)) continue;
    seen.add(full);
    next = next.split(full).join(link.label);
  }
  return next;
}

module.exports = {
  extractMarkdownLinks,
  extractMarkdownHrefs,
  stripMarkdownLinks
};
