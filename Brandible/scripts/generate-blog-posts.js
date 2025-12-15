// Generate static HTML files for blog posts with correct meta tags
// This script updates post.html with the latest post's meta tags
// The JavaScript will still update tags dynamically for the actual post being viewed
const fs = require('fs');
const path = require('path');

const postsDir = path.join(__dirname, '../blogs/posts');
const templatePath = path.join(__dirname, '../blogs/post.html');
const outputBaseDir = path.join(__dirname, '../blogs');

// Parse frontmatter from markdown
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  
  const frontmatterText = match[1];
  const body = match[2];
  const frontmatter = {};
  
  frontmatterText.split('\n').forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();
      
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      // Handle arrays (tags)
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(v => v.trim().replace(/['"]/g, ''));
      }
      
      frontmatter[key] = value;
    }
  });
  
  return { frontmatter, body };
}

// Generate slug from filename
function generateSlug(filename) {
  return filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '');
}

// Escape HTML
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

try {
  // Read template
  const template = fs.readFileSync(templatePath, 'utf8');
  
  // Read all markdown files
  const files = fs.readdirSync(postsDir);
  const mdFiles = files.filter(file => file.endsWith('.md'));
  
  if (mdFiles.length === 0) {
    console.log('⚠️  No blog posts found');
    process.exit(0);
  }
  
  // Sort by date (newest first) - get the most recent post
  const postsWithDates = mdFiles.map(mdFile => {
    const mdPath = path.join(postsDir, mdFile);
    const markdown = fs.readFileSync(mdPath, 'utf8');
    const { frontmatter } = parseFrontmatter(markdown);
    const date = frontmatter.date ? new Date(frontmatter.date) : new Date(0);
    return { mdFile, date, frontmatter };
  }).sort((a, b) => b.date - a.date);
  
  const latestPost = postsWithDates[0];
  const { frontmatter } = latestPost;
  const slug = generateSlug(latestPost.mdFile);
  const postUrl = `https://www.brandiblemg.com/blogs/post.html?slug=${slug}`;
  
  // Get values with fallbacks
  const title = frontmatter.title || 'Blog Post';
  const fullTitle = `${title} | Brandible Marketing Group`;
  const excerpt = frontmatter.excerpt || 'Read our latest blog post on digital marketing, web design, and growing your local business.';
  const featuredImage = frontmatter.featured_image 
    ? (frontmatter.featured_image.startsWith('http') 
        ? frontmatter.featured_image 
        : `https://www.brandiblemg.com${frontmatter.featured_image}`)
    : 'https://www.brandiblemg.com/assets/Brandible.png';
  
  console.log(`📝 Updating post.html with meta tags for latest post: ${title}\n`);
  
  // Start with template and replace meta tags
  let html = template;
  
  // Update title
  html = html.replace(
    /<title>.*?<\/title>/,
    `<title>${escapeHtml(fullTitle)}</title>`
  );
  
  // Update description
  html = html.replace(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${escapeHtml(excerpt)}" />`
  );
  
  // Update Open Graph title
  html = html.replace(
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${escapeHtml(fullTitle)}" />`
  );
  
  // Update Open Graph description
  html = html.replace(
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${escapeHtml(excerpt)}" />`
  );
  
  // Update Open Graph image
  html = html.replace(
    /<meta property="og:image" content="[^"]*" \/>/,
    `<meta property="og:image" content="${escapeHtml(featuredImage)}" />`
  );
  
  // Update Open Graph URL
  html = html.replace(
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${escapeHtml(postUrl)}" />`
  );
  
  // Update Twitter Card title
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${escapeHtml(fullTitle)}" />`
  );
  
  // Update Twitter Card description
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${escapeHtml(excerpt)}" />`
  );
  
  // Update Twitter Card image
  html = html.replace(
    /<meta name="twitter:image" content="[^"]*" \/>/,
    `<meta name="twitter:image" content="${escapeHtml(featuredImage)}" />`
  );
  
  // Update canonical URL - keep the id for JavaScript but set the default
  html = html.replace(
    /<link rel="canonical" href="[^"]*" id="canonical-url" \/>/,
    `<link rel="canonical" href="${escapeHtml(postUrl)}" id="canonical-url" />`
  );
  
  // Write the updated HTML file
  fs.writeFileSync(templatePath, html, 'utf8');
  
  console.log(`✅ Updated post.html with meta tags for: ${title}`);
  console.log(`   Slug: ${slug}`);
  console.log(`   Image: ${featuredImage}`);
  console.log(`\n📌 Note: The JavaScript will still update tags dynamically based on the slug parameter.`);
  console.log(`   Social platforms will see correct meta tags for the latest post when crawling.`);
  
} catch (error) {
  console.error('❌ Error generating blog posts:', error.message);
  process.exit(1);
}
