// Generate sitemap including blog posts
const fs = require('fs');
const path = require('path');

const postsDir = path.join(__dirname, '../blogs/posts');
const sitemapPath = path.join(__dirname, '../sitemap.xml');

// Base sitemap entries
const baseUrls = [
  { loc: 'https://www.brandiblemg.com/', priority: '1.0', changefreq: 'weekly', lastmod: '2025-12-04' },
  { loc: 'https://www.brandiblemg.com/about/', priority: '0.8', changefreq: 'monthly', lastmod: '2025-12-04' },
  { loc: 'https://www.brandiblemg.com/careers/', priority: '0.7', changefreq: 'monthly', lastmod: '2025-12-04' },
  { loc: 'https://www.brandiblemg.com/services/', priority: '0.9', changefreq: 'weekly', lastmod: '2025-12-04' },
  { loc: 'https://www.brandiblemg.com/services/web-design/', priority: '0.8', changefreq: 'monthly', lastmod: '2025-12-04' },
  { loc: 'https://www.brandiblemg.com/services/digital-marketing/', priority: '0.8', changefreq: 'monthly', lastmod: '2025-12-04' },
  { loc: 'https://www.brandiblemg.com/services/branding/', priority: '0.8', changefreq: 'monthly', lastmod: '2025-12-04' },
  { loc: 'https://www.brandiblemg.com/services/media-management/', priority: '0.8', changefreq: 'monthly', lastmod: '2025-12-04' },
  { loc: 'https://www.brandiblemg.com/portfolio/', priority: '0.8', changefreq: 'weekly', lastmod: '2025-12-04' },
  { loc: 'https://www.brandiblemg.com/contact/', priority: '0.9', changefreq: 'monthly', lastmod: '2025-12-04' },
  { loc: 'https://www.brandiblemg.com/faqs/', priority: '0.7', changefreq: 'monthly', lastmod: '2025-12-04' },
  { loc: 'https://www.brandiblemg.com/blogs/', priority: '0.8', changefreq: 'weekly', lastmod: '2025-12-04' },
  { loc: 'https://www.brandiblemg.com/privacy', priority: '0.3', changefreq: 'yearly', lastmod: '2025-12-04' },
  { loc: 'https://www.brandiblemg.com/terms', priority: '0.3', changefreq: 'yearly', lastmod: '2025-12-04' }
];

// Try to read posts index
let blogPosts = [];
try {
  const indexPath = path.join(postsDir, 'index.json');
  if (fs.existsSync(indexPath)) {
    const postsIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    
    // Generate blog post URLs
    blogPosts = postsIndex.map(postFile => {
      // Extract date from filename (format: YYYY-MM-DD-slug.md)
      const dateMatch = postFile.match(/^(\d{4}-\d{2}-\d{2})-/);
      const lastmod = dateMatch ? dateMatch[1] : '2025-12-04';
      
      // Generate slug from filename
      const slug = postFile.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '');
      
      return {
        loc: `https://www.brandiblemg.com/blogs/${slug}/`,
        priority: '0.7',
        changefreq: 'monthly',
        lastmod: lastmod
      };
    });
  }
} catch (error) {
  console.warn('Warning: Could not read blog posts index:', error.message);
}

// Combine all URLs
const allUrls = [...baseUrls, ...blogPosts];

// Generate XML
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

// Write sitemap
fs.writeFileSync(sitemapPath, sitemapXml, 'utf8');
console.log(`✅ Generated sitemap with ${allUrls.length} URLs (${blogPosts.length} blog posts)`);

