// Generate static HTML files for blog posts with correct meta tags
// This ensures social media crawlers see the correct Open Graph tags
const fs = require('fs');
const path = require('path');

const postsDir = path.join(__dirname, '../blogs/posts');
const outputDir = path.join(__dirname, '../blogs');

// Parse frontmatter from markdown content
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

// Format date
function formatDate(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) {
    return dateString;
  }
}

// Get category color class
function getCategoryColor(category) {
  const categoryColors = {
    'Marketing': 'bg-blue-100 text-blue-700',
    'Web Design': 'bg-purple-100 text-purple-700',
    'SEO': 'bg-yellow-100 text-yellow-700',
    'Social Media': 'bg-green-100 text-green-700',
    'Business Tips': 'bg-red-100 text-red-700',
    'Case Studies': 'bg-indigo-100 text-indigo-700'
  };
  return categoryColors[category] || 'bg-gray-100 text-gray-700';
}

// Generate full image URL
function getImageUrl(featuredImage) {
  if (!featuredImage) {
    return 'https://www.brandiblemg.com/assets/Brandible.png';
  }
  if (featuredImage.startsWith('http')) {
    return featuredImage;
  }
  return `https://www.brandiblemg.com${featuredImage}`;
}

// Read the post.html template
const templatePath = path.join(outputDir, 'post.html');
const template = fs.readFileSync(templatePath, 'utf8');

try {
  // Read all files in posts directory
  const files = fs.readdirSync(postsDir);
  
  // Filter for .md files
  const mdFiles = files.filter(file => file.endsWith('.md'));
  
  if (mdFiles.length === 0) {
    console.log('⚠️  No blog posts found');
    process.exit(0);
  }
  
  let generatedCount = 0;
  
  // Process each markdown file
  mdFiles.forEach(mdFile => {
    try {
      const filePath = path.join(postsDir, mdFile);
      const content = fs.readFileSync(filePath, 'utf8');
      const { frontmatter } = parseFrontmatter(content);
      
      if (!frontmatter.title) {
        console.log(`⚠️  Skipping ${mdFile} - no title found`);
        return;
      }
      
      const slug = generateSlug(mdFile);
      const postUrl = `https://www.brandiblemg.com/blogs/${slug}/`;
      const imageUrl = getImageUrl(frontmatter.featured_image);
      const title = frontmatter.title;
      const titleWithBrand = `${title} | Brandible Marketing Group`;
      const description = frontmatter.excerpt || `Read our latest blog post: ${title}`;
      
      // Replace meta tags in template
      let html = template;
      
      // Fix asset paths: from /blogs/post.html we use ../assets/
      // but from /blogs/[slug]/index.html we need ../../assets/
      html = html.replace(/href="\.\.\/assets\//g, 'href="../../assets/');
      html = html.replace(/src="\.\.\/assets\//g, 'src="../../assets/');
      
      // Escape HTML entities
      const escapeHtml = (str) => {
        if (!str) return '';
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      };
      
      const escapedTitle = escapeHtml(titleWithBrand);
      const escapedDescription = escapeHtml(description);
      
      // Update title
      html = html.replace(
        /<title>.*?<\/title>/,
        `<title>${escapedTitle}</title>`
      );
      
      // Update meta description
      html = html.replace(
        /<meta name="description" content="[^"]*" \/>/,
        `<meta name="description" content="${escapedDescription}" />`
      );
      
      // Update Open Graph tags
      html = html.replace(
        /<meta property="og:title" content="[^"]*" \/>/,
        `<meta property="og:title" content="${escapedTitle}" />`
      );
      
      html = html.replace(
        /<meta property="og:description" content="[^"]*" \/>/,
        `<meta property="og:description" content="${escapedDescription}" />`
      );
      
      html = html.replace(
        /<meta property="og:image" content="[^"]*" \/>/,
        `<meta property="og:image" content="${imageUrl}" />`
      );
      
      html = html.replace(
        /<meta property="og:url" content="[^"]*" \/>/,
        `<meta property="og:url" content="${postUrl}" />`
      );
      
      // Update Twitter Card tags
      html = html.replace(
        /<meta name="twitter:title" content="[^"]*" \/>/,
        `<meta name="twitter:title" content="${escapedTitle}" />`
      );
      
      html = html.replace(
        /<meta name="twitter:description" content="[^"]*" \/>/,
        `<meta name="twitter:description" content="${escapedDescription}" />`
      );
      
      html = html.replace(
        /<meta name="twitter:image" content="[^"]*" \/>/,
        `<meta name="twitter:image" content="${imageUrl}" />`
      );
      
      // Update canonical URL
      html = html.replace(
        /<link rel="canonical" href="[^"]*" id="canonical-url" \/>/,
        `<link rel="canonical" href="${postUrl}" id="canonical-url" />`
      );
      
      // Update breadcrumb structured data
      const breadcrumbSchema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": "https://www.brandiblemg.com/"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Blog",
            "item": "https://www.brandiblemg.com/blogs/"
          },
          {
            "@type": "ListItem",
            "position": 3,
            "name": title,
            "item": postUrl
          }
        ]
      };
      
      // Find and replace the breadcrumb script tag
      const breadcrumbRegex = /<script type="application\/ld\+json">[\s\S]*?BreadcrumbList[\s\S]*?<\/script>/;
      html = html.replace(
        breadcrumbRegex,
        `<script type="application/ld+json">\n  ${JSON.stringify(breadcrumbSchema, null, 2)}\n  </script>`
      );
      
      // Create output directory for this slug if it doesn't exist
      const slugDir = path.join(outputDir, slug);
      if (!fs.existsSync(slugDir)) {
        fs.mkdirSync(slugDir, { recursive: true });
      }
      
      // Write the generated HTML file
      const outputPath = path.join(slugDir, 'index.html');
      fs.writeFileSync(outputPath, html, 'utf8');
      
      generatedCount++;
      console.log(`✅ Generated: /blogs/${slug}/index.html`);
      
    } catch (error) {
      console.error(`❌ Error processing ${mdFile}:`, error.message);
    }
  });
  
  console.log(`\n✅ Successfully generated ${generatedCount} blog post HTML files with correct meta tags`);
  
} catch (error) {
  console.error('❌ Error generating blog posts:', error.message);
  process.exit(1);
}
