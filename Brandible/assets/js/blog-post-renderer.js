// Individual Blog Post Renderer
// Renders a single blog post from markdown file

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

// Format date
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Load and render blog post
async function loadBlogPost() {
  const postContainer = document.getElementById('blog-post-content');
  if (!postContainer) return;

  // Get slug from URL query parameter or path
  const urlParams = new URLSearchParams(window.location.search);
  let slug = urlParams.get('slug');
  
  // If no query param, try to get from path
  if (!slug) {
    const pathParts = window.location.pathname.split('/');
    slug = pathParts[pathParts.length - 2]; // Get second-to-last part (before trailing slash)
  }
  
  if (!slug || slug === 'blogs' || slug === 'post.html') {
    postContainer.innerHTML = '<p class="text-red-500">Post not found</p>';
    return;
  }

  try {
    // Try to find the post file - check common date patterns
    let postFile = null;
    const possibleFiles = [
      `${slug}.md`,
      `20*-*-*-${slug}.md` // Pattern for date-prefixed files
    ];

    // First, try to get from posts index
    try {
      const indexResponse = await fetch('/blogs/posts/index.json');
      if (indexResponse.ok) {
        const postsList = await indexResponse.json();
        // Find post that matches slug
        postFile = postsList.find(file => 
          file.includes(slug) || file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '') === slug
        );
      }
    } catch (e) {
      console.log('No posts index found');
    }

    // If not found in index, try direct filename patterns
    if (!postFile) {
      // Try with date prefix patterns
      const currentYear = new Date().getFullYear();
      for (let year = currentYear; year >= currentYear - 2; year--) {
        for (let month = 12; month >= 1; month--) {
          for (let day = 31; day >= 1; day--) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const testFile = `${dateStr}-${slug}.md`;
            try {
              const testResponse = await fetch(`/blogs/posts/${testFile}`);
              if (testResponse.ok) {
                postFile = testFile;
                break;
              }
            } catch (e) {
              // Continue searching
            }
          }
          if (postFile) break;
        }
        if (postFile) break;
      }
    }

    if (!postFile) {
      postContainer.innerHTML = '<p class="text-red-500">Post not found</p>';
      return;
    }

    // Load the markdown file
    const response = await fetch(`/blogs/posts/${postFile}`);
    if (!response.ok) {
      throw new Error('Post not found');
    }

    const markdown = await response.text();
    const { frontmatter, body } = parseFrontmatter(markdown);

    // Load marked.js if not already loaded
    if (typeof marked === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js';
      script.onload = () => renderPost(frontmatter, body, postContainer);
      document.head.appendChild(script);
    } else {
      renderPost(frontmatter, body, postContainer);
    }

    // Update page metadata
    if (frontmatter.title) {
      document.title = `${frontmatter.title} | Brandible Marketing Group`;
    }
    if (frontmatter.excerpt) {
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', frontmatter.excerpt);
      }
    }

    // Update canonical URL to point to actual page URL (fixes canonical pointing to redirect issue)
    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink && slug) {
      const postUrl = `https://www.brandiblemg.com/blogs/post.html?slug=${slug}`;
      canonicalLink.setAttribute('href', postUrl);
    }

    // Add Article structured data
    addArticleSchema(frontmatter, postFile);

  } catch (error) {
    console.error('Error loading blog post:', error);
    postContainer.innerHTML = `
      <div class="text-center py-12">
        <p class="text-red-500 text-lg mb-2">Error loading blog post</p>
        <p class="text-gray-400 text-sm">Please try again later</p>
      </div>
    `;
  }
}

// Add Article structured data
function addArticleSchema(frontmatter, postFile) {
  // Remove existing Article schema if present
  const existingSchema = document.querySelector('script[data-schema="article"]');
  if (existingSchema) {
    existingSchema.remove();
  }

  // Generate slug from filename
  const slug = postFile.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '');
  const postUrl = `https://www.brandiblemg.com/blogs/post.html?slug=${slug}`;
  
  // Build Article schema
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": frontmatter.title || "Blog Post",
    "description": frontmatter.excerpt || frontmatter.title || "",
    "image": frontmatter.featured_image ? `https://www.brandiblemg.com${frontmatter.featured_image}` : "https://www.brandiblemg.com/assets/Brandible.png",
    "datePublished": frontmatter.date || new Date().toISOString(),
    "dateModified": frontmatter.date || new Date().toISOString(),
    "author": {
      "@type": "Organization",
      "name": frontmatter.author || "Brandible Marketing Group",
      "url": "https://www.brandiblemg.com"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Brandible Marketing Group",
      "logo": {
        "@type": "ImageObject",
        "url": "https://www.brandiblemg.com/assets/Brandible.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": postUrl
    },
    "url": postUrl
  };

  // Add category if present
  if (frontmatter.category) {
    articleSchema.articleSection = frontmatter.category;
  }

  // Add keywords/tags if present
  if (frontmatter.tags && frontmatter.tags.length > 0) {
    articleSchema.keywords = frontmatter.tags.join(", ");
  }

  // Inject schema into page
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.setAttribute('data-schema', 'article');
  script.textContent = JSON.stringify(articleSchema);
  document.head.appendChild(script);
}

// Render the post content
function renderPost(frontmatter, body, container) {
  const categoryColors = {
    'Marketing': 'bg-blue-100 text-blue-700',
    'Web Design': 'bg-purple-100 text-purple-700',
    'SEO': 'bg-yellow-100 text-yellow-700',
    'Social Media': 'bg-green-100 text-green-700',
    'Business Tips': 'bg-red-100 text-red-700',
    'Case Studies': 'bg-indigo-100 text-indigo-700'
  };
  
  const categoryColor = categoryColors[frontmatter.category] || 'bg-gray-100 text-gray-700';
  
  // Convert markdown to HTML
  const htmlBody = marked.parse(body);
  
  container.innerHTML = `
    <article class="max-w-4xl mx-auto">
      ${frontmatter.featured_image ? `
        <div class="mb-8">
          <img src="${frontmatter.featured_image}" alt="${frontmatter.title || ''}" class="w-full h-64 md:h-96 object-cover rounded-lg" />
        </div>
      ` : ''}
      
      <header class="mb-8">
        <div class="flex items-center gap-3 text-sm text-gray-500 mb-4">
          <span>${formatDate(frontmatter.date)}</span>
          ${frontmatter.category ? `<span class="px-2 py-1 ${categoryColor} rounded-full text-xs font-medium">${frontmatter.category}</span>` : ''}
          ${frontmatter.author ? `<span>By ${frontmatter.author}</span>` : ''}
        </div>
        <h1 class="text-4xl md:text-5xl font-bold text-gray-900 mb-4">${frontmatter.title || 'Untitled'}</h1>
        ${frontmatter.excerpt ? `<p class="text-xl text-gray-600">${frontmatter.excerpt}</p>` : ''}
      </header>
      
      <div class="prose prose-lg max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-gray-900 prose-ul:text-gray-700 prose-ol:text-gray-700 prose-li:text-gray-700 prose-blockquote:border-blue-600 prose-blockquote:text-gray-600">
        ${htmlBody}
      </div>
      
      ${frontmatter.tags && frontmatter.tags.length > 0 ? `
        <footer class="mt-12 pt-8 border-t border-gray-200">
          <div class="flex flex-wrap gap-2 mb-8">
            <span class="text-sm text-gray-600 font-medium">Tags:</span>
            ${frontmatter.tags.map(tag => `<span class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">${tag}</span>`).join('')}
          </div>
        </footer>
      ` : ''}
      
      <!-- Related Services -->
      <div class="mt-12 pt-8 border-t border-gray-200">
        <h3 class="text-2xl font-bold text-gray-900 mb-6">Related Services</h3>
        <div class="grid md:grid-cols-2 gap-4">
          ${getRelatedServices(frontmatter.category, frontmatter.tags)}
        </div>
      </div>
      
      <!-- Related Posts -->
      <section class="mt-16 pt-12 border-t border-gray-200">
        <h3 class="text-2xl font-bold text-gray-900 mb-6">More from Our Blog</h3>
        <div class="grid md:grid-cols-2 gap-6">
          <article class="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-100 hover:shadow-md transition">
            <h4 class="text-lg font-bold text-gray-900 mb-2">
              <a href="/blogs/post.html?slug=welcome-to-the-brandible-marketing-group-blog-what-to-expect" class="hover:text-blue-600">Welcome to the Brandible Marketing Group Blog</a>
            </h4>
            <p class="text-gray-600 text-sm mb-3">Learn about our blog and what content you can expect from Brandible Marketing Group.</p>
            <a href="/blogs/post.html?slug=welcome-to-the-brandible-marketing-group-blog-what-to-expect" class="text-blue-600 hover:text-blue-700 font-medium text-sm inline-flex items-center gap-1">
              Read More
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </a>
          </article>
        </div>
        <div class="mt-8 text-center">
          <a href="/blogs/" class="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-2">
            View All Blog Posts
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </a>
        </div>
      </section>
    </article>
  `;
}

// Get related services based on category and tags
function getRelatedServices(category, tags) {
  const serviceMap = {
    'Marketing': '/services/digital-marketing/',
    'Web Design': '/services/web-design/',
    'SEO': '/services/digital-marketing/',
    'Social Media': '/services/media-management/',
    'Business Tips': '/services/',
    'Case Studies': '/portfolio/'
  };

  const tagMap = {
    'website': '/services/web-design/',
    'web design': '/services/web-design/',
    'development': '/services/web-design/',
    'seo': '/services/digital-marketing/',
    'marketing': '/services/digital-marketing/',
    'advertising': '/services/digital-marketing/',
    'social media': '/services/media-management/',
    'branding': '/services/branding/',
    'brand': '/services/branding/'
  };

  let relatedServices = [];
  
  // Add service based on category
  if (category && serviceMap[category]) {
    const serviceName = category === 'Web Design' ? 'Web Design & Development' : 
                       category === 'Marketing' ? 'Digital Marketing' :
                       category === 'Social Media' ? 'Media Management' : category;
    relatedServices.push({
      name: serviceName,
      url: serviceMap[category],
      description: category === 'Web Design' ? 'Custom websites built to convert' :
                   category === 'Marketing' ? 'Data-driven marketing strategies' :
                   category === 'Social Media' ? 'Social media management & content' : 'Professional services'
    });
  }

  // Add services based on tags
  if (tags && Array.isArray(tags)) {
    tags.forEach(tag => {
      const lowerTag = tag.toLowerCase();
      for (const [key, url] of Object.entries(tagMap)) {
        if (lowerTag.includes(key) && !relatedServices.find(s => s.url === url)) {
          const serviceName = key === 'website' || key === 'web design' || key === 'development' ? 'Web Design & Development' :
                            key === 'seo' || key === 'marketing' || key === 'advertising' ? 'Digital Marketing' :
                            key === 'social media' ? 'Media Management' :
                            key === 'branding' || key === 'brand' ? 'Branding & Identity' : '';
          if (serviceName) {
            relatedServices.push({
              name: serviceName,
              url: url,
              description: key === 'website' || key === 'web design' ? 'Custom websites built to convert' :
                          key === 'seo' || key === 'marketing' ? 'Data-driven marketing strategies' :
                          key === 'social media' ? 'Social media management & content' :
                          key === 'branding' ? 'Complete brand identity design' : 'Professional services'
            });
          }
        }
      }
    });
  }

  // Default to main services page if no matches
  if (relatedServices.length === 0) {
    relatedServices = [
      { name: 'Web Design & Development', url: '/services/web-design/', description: 'Custom websites built to convert' },
      { name: 'Digital Marketing', url: '/services/digital-marketing/', description: 'Data-driven marketing strategies' }
    ];
  }

  // Limit to 2 services
  relatedServices = relatedServices.slice(0, 2);

  return relatedServices.map(service => `
    <a href="${service.url}" class="block p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-100 hover:shadow-md transition-all hover:border-blue-200">
      <h4 class="text-lg font-bold text-gray-900 mb-2">${service.name}</h4>
      <p class="text-gray-600 text-sm mb-3">${service.description}</p>
      <span class="text-blue-600 hover:text-blue-700 font-medium text-sm inline-flex items-center gap-1">
        Learn More
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
        </svg>
      </span>
    </a>
  `).join('');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadBlogPost);
} else {
  loadBlogPost();
}

