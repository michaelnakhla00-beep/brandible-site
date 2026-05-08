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

      if (value === 'true') value = true;
      else if (value === 'false') value = false;

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

function isDraftPost(frontmatter) {
  return frontmatter.draft === true;
}

function toIso8601Date(value) {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function countWords(markdownBody) {
  if (!markdownBody || !String(markdownBody).trim()) return undefined;
  const n = String(markdownBody).trim().split(/\s+/).length;
  return n > 0 ? n : undefined;
}

function escapeHtmlEntity(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Related service URLs for topic clusters — keep in sync with getRelatedServices() in blog-post-renderer.js */
const CATEGORY_SERVICE = {
  Marketing: {
    name: 'Digital Marketing',
    url: '/services/digital-marketing/',
    description: 'Data-driven SEO, ads, and growth strategy for local businesses.'
  },
  'Web Design': {
    name: 'Web Design & Development',
    url: '/services/web-design/',
    description: 'Fast, conversion-focused websites that build trust with visitors.'
  },
  SEO: {
    name: 'Digital Marketing & SEO',
    url: '/services/digital-marketing/',
    description: 'Search visibility, content structure, and measurable growth.'
  },
  'Social Media': {
    name: 'Media Management',
    url: '/services/media-management/',
    description: 'Social content, creative, and channel management.'
  },
  'Business Tips': {
    name: 'Our Services',
    url: '/services/',
    description: 'Full-service marketing support for established local brands.'
  },
  'Case Studies': {
    name: 'Portfolio',
    url: '/portfolio/',
    description: 'Real client work and results from the Brandible team.'
  },
  Branding: {
    name: 'Branding & Identity',
    url: '/services/branding/',
    description: 'Logos, visual systems, and brand strategy.'
  }
};

const CATEGORY_EXTRA_SERVICE = {
  SEO: {
    name: 'Web Design & Development',
    url: '/services/web-design/',
    description: 'Technical SEO and site structure start with a solid website foundation.'
  },
  'Web Design': {
    name: 'Digital Marketing',
    url: '/services/digital-marketing/',
    description: 'Drive traffic to your site with search and paid campaigns.'
  },
  Marketing: {
    name: 'Branding & Identity',
    url: '/services/branding/',
    description: 'Align your look and message across every channel.'
  }
};

const TAG_TO_SERVICE = [
  ['website', CATEGORY_SERVICE['Web Design']],
  ['web design', CATEGORY_SERVICE['Web Design']],
  ['development', CATEGORY_SERVICE['Web Design']],
  ['seo', CATEGORY_SERVICE.SEO],
  ['marketing', CATEGORY_SERVICE.Marketing],
  ['advertising', CATEGORY_SERVICE.Marketing],
  ['social media', CATEGORY_SERVICE['Social Media']],
  ['branding', CATEGORY_SERVICE.Branding],
  ['brand', CATEGORY_SERVICE.Branding]
];

const DEFAULT_SERVICE_FALLBACKS = [
  CATEGORY_SERVICE['Web Design'],
  CATEGORY_SERVICE.SEO,
  CATEGORY_SERVICE.Branding
];

function collectRelatedServiceEntries(frontmatter, max = 3) {
  const entries = [];
  const seen = new Set();

  function push(svc) {
    if (!svc || !svc.url || seen.has(svc.url)) return;
    seen.add(svc.url);
    entries.push(svc);
  }

  const cat = frontmatter.category;
  if (cat && CATEGORY_SERVICE[cat]) {
    push(CATEGORY_SERVICE[cat]);
  }
  if (cat && CATEGORY_EXTRA_SERVICE[cat]) {
    push(CATEGORY_EXTRA_SERVICE[cat]);
  }

  if (frontmatter.tags && Array.isArray(frontmatter.tags)) {
    for (const tag of frontmatter.tags) {
      const lower = String(tag).toLowerCase();
      for (const [key, svc] of TAG_TO_SERVICE) {
        if (lower.includes(key)) {
          push(svc);
          if (entries.length >= max) return entries.slice(0, max);
        }
      }
    }
  }

  for (const svc of DEFAULT_SERVICE_FALLBACKS) {
    push(svc);
    if (entries.length >= max) break;
  }

  return entries.slice(0, max);
}

function buildStaticTopicClusterHtml(frontmatter, slug, publishedPosts) {
  return '';
}

function buildPublishedPostIndex(postsDir, mdFiles) {
  const list = [];
  for (const mdFile of mdFiles) {
    const filePath = path.join(postsDir, mdFile);
    const content = fs.readFileSync(filePath, 'utf8');
    const { frontmatter } = parseFrontmatter(content);
    if (!frontmatter.title || isDraftPost(frontmatter)) continue;
    list.push({ slug: generateSlug(mdFile), title: frontmatter.title });
  }
  return list;
}

function buildBlogPostingSchema(frontmatter, body, postUrl, title, description, imageUrl) {
  const datePublished = toIso8601Date(frontmatter.date);
  const dateModified = toIso8601Date(
    frontmatter.updated || frontmatter.updated_at || frontmatter.date_modified || frontmatter.date
  );

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    image: [imageUrl],
    datePublished,
    dateModified,
    author: {
      '@type': 'Organization',
      name: frontmatter.author || 'Brandible Marketing Group',
      url: 'https://www.brandiblemg.com/'
    },
    publisher: {
      '@type': 'Organization',
      name: 'Brandible Marketing Group',
      url: 'https://www.brandiblemg.com/',
      logo: {
        '@type': 'ImageObject',
        url: 'https://www.brandiblemg.com/assets/Brandible.png'
      }
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': postUrl
    },
    url: postUrl,
    inLanguage: 'en-US',
    isPartOf: {
      '@type': 'Blog',
      '@id': 'https://www.brandiblemg.com/blogs/#blog',
      name: 'Brandible Marketing Group Blog',
      publisher: {
        '@type': 'Organization',
        name: 'Brandible Marketing Group',
        url: 'https://www.brandiblemg.com/'
      }
    }
  };

  const wc = countWords(body);
  if (wc) schema.wordCount = wc;
  if (frontmatter.category) schema.articleSection = frontmatter.category;
  if (frontmatter.tags && Array.isArray(frontmatter.tags) && frontmatter.tags.length > 0) {
    schema.keywords = frontmatter.tags.join(', ');
  }

  return schema;
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

// Generate full image URL (paths from CMS are usually absolute on site, e.g. /assets/...)
function getImageUrl(imagePath) {
  if (!imagePath) {
    return 'https://www.brandiblemg.com/assets/Brandible.png';
  }
  if (imagePath.startsWith('http')) {
    return imagePath;
  }
  return `https://www.brandiblemg.com${imagePath.startsWith('/') ? imagePath : `/${imagePath}`}`;
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

  const publishedPosts = buildPublishedPostIndex(postsDir, mdFiles);

  let generatedCount = 0;
  
  // Process each markdown file
  mdFiles.forEach(mdFile => {
    try {
      const filePath = path.join(postsDir, mdFile);
      const content = fs.readFileSync(filePath, 'utf8');
      const { frontmatter, body } = parseFrontmatter(content);
      
      if (!frontmatter.title) {
        console.log(`⚠️  Skipping ${mdFile} - no title found`);
        return;
      }

      const slug = generateSlug(mdFile);
      const slugDir = path.join(outputDir, slug);
      const outputPath = path.join(slugDir, 'index.html');

      if (isDraftPost(frontmatter)) {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
          try {
            fs.rmdirSync(slugDir);
          } catch (e) {
            /* directory not empty or other */
          }
        }
        console.log(`⏭️  Skipped (draft): ${mdFile}`);
        return;
      }

      const postUrl = `https://www.brandiblemg.com/blogs/${slug}/`;
      const imageUrl = getImageUrl(frontmatter.og_image || frontmatter.featured_image);
      const title = frontmatter.title;
      const seoHeadline = frontmatter.meta_title || title;
      const titleWithBrand = `${seoHeadline} | Brandible Marketing Group`;
      const description =
        frontmatter.meta_description ||
        frontmatter.excerpt ||
        `Read our latest blog post: ${title}`;
      
      // Replace meta tags in template
      let html = template;
      
      // Fix asset paths: from /blogs/post.html we use ../assets/
      // but from /blogs/[slug]/index.html we need ../../assets/
      // Replace every occurrence (e.g. both URLs in srcset) so logo and all assets load
      html = html.replace(/\.\.\/assets\//g, '../../assets/');
      
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
      const escapedTitleForH1 = escapeHtml(title);
      const escapedDescription = escapeHtml(description);
      
      // Update H1 for SEO (crawlers see this without JavaScript)
      html = html.replace(/\{\{BLOG_POST_TITLE\}\}/g, escapedTitleForH1);
      
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
      
      // Update og:image first - this is critical for Facebook
      html = html.replace(
        /<meta property="og:image" content="[^"]*" \/>/,
        `<meta property="og:image" content="${imageUrl}" />`
      );
      
      // Add og:image:secure_url and other image meta tags for better iMessage support
      // Detect image type from file extension
      let imageType = 'image/jpeg'; // default
      if (imageUrl.endsWith('.svg') || imageUrl.includes('.svg')) {
        imageType = 'image/svg+xml';
      } else if (imageUrl.endsWith('.png') || imageUrl.includes('.png')) {
        imageType = 'image/png';
      } else if (imageUrl.endsWith('.webp') || imageUrl.includes('.webp')) {
        imageType = 'image/webp';
      } else if (imageUrl.endsWith('.gif') || imageUrl.includes('.gif')) {
        imageType = 'image/gif';
      }
      
      // Insert og:image:secure_url right after og:image tag
      // Match the og:image tag we just updated (use generic pattern to avoid regex escaping issues)
      if (!html.includes('og:image:secure_url')) {
        // Insert secure_url and type tags right after og:image
        html = html.replace(
          /(<meta property="og:image" content="[^"]*" \/>)/,
          `$1\n  <meta property="og:image:secure_url" content="${imageUrl}" />\n  <meta property="og:image:type" content="${imageType}" />`
        );
      } else {
        // Update existing og:image:secure_url
        html = html.replace(
          /<meta property="og:image:secure_url" content="[^"]*" \/>/,
          `<meta property="og:image:secure_url" content="${imageUrl}" />`
        );
        // Update image type if it exists
        if (html.includes('og:image:type')) {
          html = html.replace(
            /<meta property="og:image:type" content="[^"]*" \/>/,
            `<meta property="og:image:type" content="${imageType}" />`
          );
        }
      }
      
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
      
      // Update canonical URL (single preferred URL; no runtime window.location override)
      html = html.replace(
        /<link rel="canonical" href="[^"]*" \/>/,
        `<link rel="canonical" href="${postUrl}" />`
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

      const blogPostingSchema = buildBlogPostingSchema(
        frontmatter,
        body,
        postUrl,
        title,
        description,
        imageUrl
      );
      const blogPostingScript = `<script type="application/ld+json" data-schema="blog-posting">\n  ${JSON.stringify(blogPostingSchema, null, 2)}\n  </script>`;
      if (!html.includes('<!-- INJECT_BLOG_POSTING_SCHEMA -->')) {
        console.warn(`⚠️  BlogPosting placeholder missing in template for ${mdFile}`);
      } else {
        html = html.replace('  <!-- INJECT_BLOG_POSTING_SCHEMA -->\n', `  ${blogPostingScript}\n`);
      }

      const topicClusterHtml = buildStaticTopicClusterHtml(frontmatter, slug, publishedPosts);
      if (!html.includes('<!-- INJECT_STATIC_TOPIC_CLUSTER -->')) {
        console.warn(`⚠️  Topic cluster placeholder missing for ${mdFile}`);
      } else {
        html = html.replace(
          '        <!-- INJECT_STATIC_TOPIC_CLUSTER -->\n',
          `${topicClusterHtml}\n`
        );
      }

      if (!fs.existsSync(slugDir)) {
        fs.mkdirSync(slugDir, { recursive: true });
      }

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
