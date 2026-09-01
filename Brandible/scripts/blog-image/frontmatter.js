'use strict';

const fs = require('fs');
const path = require('path');

function yamlQuote(value) {
  const text = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, ' ').trim();
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function unquote(value) {
  const text = String(value).trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return text;
}

function filenameSlug(filePath) {
  return path.basename(filePath).replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/i, '');
}

function filenameDate(filePath) {
  const match = path.basename(filePath).match(/^(\d{4}-\d{2}-\d{2})-/);
  return match ? match[1] : null;
}

function splitFrontmatter(raw) {
  const text = String(raw).replace(/^\uFEFF/, '');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)?$/);
  if (!match) {
    throw new Error('Post must start with YAML frontmatter delimited by ---.');
  }
  return {
    yaml: match[1],
    body: match[2] == null ? '' : match[2]
  };
}

function parseYamlLines(yaml) {
  const fields = {};
  for (const line of yaml.split('\n')) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    if (!key) continue;
    fields[key] = unquote(line.slice(colon + 1));
  }
  return fields;
}

function readPost(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { yaml, body } = splitFrontmatter(raw);
  const fields = parseYamlLines(yaml);
  const slug = filenameSlug(filePath);
  return {
    raw,
    yaml,
    body,
    fields,
    slug,
    dateStamp: filenameDate(filePath),
    title: fields.title || '',
    category: fields.category || '',
    excerpt: fields.excerpt || '',
    featuredImage: fields.featured_image || '',
    featuredImageAlt: fields.featured_image_alt || '',
    draft: fields.draft
  };
}

function firstParagraphs(markdown, maxChars) {
  const blocks = String(markdown || '')
    .replace(/^\r?\n/, '')
    .split(/\n\s*\n/);
  const kept = [];
  let used = 0;
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (/^#{1,6}\s/.test(trimmed) && kept.length >= 2) continue;
    kept.push(trimmed.replace(/\s+/g, ' '));
    used += trimmed.length;
    if (kept.length >= 6 || used >= maxChars) break;
  }
  return kept.join('\n\n').slice(0, maxChars);
}

function patchImageFields(raw, { featuredImage, featuredImageAlt }) {
  const { yaml, body } = splitFrontmatter(raw);
  const lines = yaml.split('\n');
  let hasImage = false;
  let hasAlt = false;
  const next = lines.map((line) => {
    if (/^featured_image\s*:/.test(line)) {
      hasImage = true;
      return `featured_image: ${featuredImage}`;
    }
    if (/^featured_image_alt\s*:/.test(line)) {
      hasAlt = true;
      return `featured_image_alt: ${yamlQuote(featuredImageAlt)}`;
    }
    return line;
  });
  if (!hasImage) next.push(`featured_image: ${featuredImage}`);
  if (!hasAlt) next.push(`featured_image_alt: ${yamlQuote(featuredImageAlt)}`);
  return `---\n${next.join('\n')}\n---${body}`;
}

module.exports = {
  yamlQuote,
  filenameSlug,
  filenameDate,
  readPost,
  firstParagraphs,
  patchImageFields
};
