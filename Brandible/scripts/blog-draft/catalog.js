'use strict';

const fs = require('fs');
const path = require('path');

function parseFrontmatter(content) {
  const match = String(content).match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) return {};
  const fields = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    }
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    fields[key] = value;
  }
  return fields;
}

function filenameSlug(filename) {
  return filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
}

function isPublishedPost(frontmatter) {
  return frontmatter.draft !== true;
}

function buildCatalog({ postsDir, facts }) {
  const posts = [];
  const files = fs.readdirSync(postsDir).filter((name) => name.endsWith('.md'));
  for (const name of files) {
    const frontmatter = parseFrontmatter(fs.readFileSync(path.join(postsDir, name), 'utf8'));
    if (!frontmatter.title || !isPublishedPost(frontmatter)) continue;
    const slug = (frontmatter.slug && String(frontmatter.slug).replace(/^\//, '')) || filenameSlug(name);
    posts.push({
      title: frontmatter.title,
      url: `/blogs/${slug}/`,
      slug,
      category: frontmatter.category || '',
      excerpt: frontmatter.excerpt || '',
      discouraged: /welcome/i.test(slug)
    });
  }

  const services = Object.values(facts.services || {}).map((svc) => ({
    title: svc.name,
    url: svc.url,
    summary: svc.summary || '',
    kind: 'service'
  }));

  const core = (facts.core_pages || []).map((page) => ({
    title: page.label,
    url: page.url,
    summary: page.use_when || '',
    kind: 'core'
  }));

  return { posts, services, core };
}

function catalogForPrompt(catalog) {
  const lines = ['Allowed internal destinations. Link only these URLs. Do not link unpublished drafts.', '', 'Services:'];
  for (const item of catalog.services) {
    lines.push(`- ${item.url} (${item.title}) ${item.summary}`);
  }
  lines.push('', 'Core pages:');
  for (const item of catalog.core) {
    lines.push(`- ${item.url} (${item.title}) ${item.summary}`);
  }
  lines.push('', 'Live published posts:');
  if (catalog.posts.length === 0) {
    lines.push('- (none)');
  } else {
    for (const item of catalog.posts) {
      const flag = item.discouraged ? ' [do not link unless the topic is actually about the blog itself]' : '';
      lines.push(`- ${item.url} (${item.title})${flag}`);
    }
  }
  return lines.join('\n');
}

function extractMarkdownHrefs(markdown) {
  const hrefs = [];
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = re.exec(String(markdown))) !== null) {
    hrefs.push(match[1].trim());
  }
  return hrefs;
}

function allowedUrlSet(catalog) {
  const set = new Set();
  for (const item of [...catalog.posts, ...catalog.services, ...catalog.core]) {
    set.add(item.url);
  }
  return set;
}

module.exports = {
  parseFrontmatter,
  filenameSlug,
  isPublishedPost,
  buildCatalog,
  catalogForPrompt,
  extractMarkdownHrefs,
  allowedUrlSet
};
