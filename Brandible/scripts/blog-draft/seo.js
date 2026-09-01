'use strict';

function checkSeoFields(article) {
  const problems = [];
  const metaTitle = String(article.meta_title || '').trim();
  const metaDescription = String(article.meta_description || '').trim();
  const excerpt = String(article.excerpt || '').trim();
  const slug = String(article.slug || '').trim();

  if (/\|/.test(metaTitle) || /\bBrandible\b/i.test(metaTitle)) {
    problems.push('meta_title must not include a Brandible suffix. The site already appends the brand.');
  }
  if (metaTitle.length < 20 || metaTitle.length > 70) {
    problems.push(`meta_title should be about 20–70 characters (now ${metaTitle.length}).`);
  }
  if (metaDescription.length < 80 || metaDescription.length > 170) {
    problems.push(`meta_description should be about 80–170 characters (now ${metaDescription.length}).`);
  }
  if (excerpt.length < 40 || excerpt.length > 240) {
    problems.push(`excerpt should be about 40–240 characters (now ${excerpt.length}).`);
  }
  if (excerpt && metaDescription && excerpt === metaDescription) {
    problems.push('excerpt must not be a copy of meta_description.');
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    problems.push('slug must be lowercase hyphenated ASCII with no leading slash.');
  }
  if (slug.length > 80) {
    problems.push('slug is too long. Shorten it to the search intent, not the full headline.');
  }
  if (/\d{4}/.test(slug)) {
    problems.push('slug should not include a year.');
  }
  return problems;
}

module.exports = { checkSeoFields };
