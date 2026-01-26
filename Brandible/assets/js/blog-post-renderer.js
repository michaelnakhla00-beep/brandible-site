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
  
  // If no query param, try to get from path (e.g., /blogs/[slug]/)
  if (!slug) {
    const pathParts = window.location.pathname.split('/').filter(p => p); // Remove empty strings
    // If path is /blogs/[slug]/, the slug is the last part
    // If path is /blogs/post.html, we don't have a slug
    if (pathParts.length >= 2 && pathParts[0] === 'blogs' && pathParts[1] !== 'post.html') {
      slug = pathParts[1]; // Get the slug part
    }
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

    // Generate post URL for sharing (slug is already defined above)
    // Use the static HTML file format for better SEO and social sharing
    const postUrl = `https://www.brandiblemg.com/blogs/${slug}/`;

    // Update page metadata
    if (frontmatter.title) {
      document.title = `${frontmatter.title} | Brandible Marketing Group`;
      
      // Update static H1 tag for SEO crawlers (visible in HTML before JS executes)
      const staticH1 = document.getElementById('blog-post-title');
      if (staticH1) {
        staticH1.textContent = frontmatter.title;
        staticH1.classList.remove('sr-only'); // Make it visible
      }
      
      // Update Open Graph title (include brand name for SEO)
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        ogTitle.setAttribute('content', `${frontmatter.title} | Brandible Marketing Group`);
      }
      
      // Update Twitter Card title (include brand name for SEO)
      const twitterTitle = document.querySelector('meta[name="twitter:title"]');
      if (twitterTitle) {
        twitterTitle.setAttribute('content', `${frontmatter.title} | Brandible Marketing Group`);
      }
    }
    
    if (frontmatter.excerpt) {
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', frontmatter.excerpt);
      }
      
      // Update Open Graph description
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) {
        ogDesc.setAttribute('content', frontmatter.excerpt);
      }
      
      // Update Twitter Card description
      const twitterDesc = document.querySelector('meta[name="twitter:description"]');
      if (twitterDesc) {
        twitterDesc.setAttribute('content', frontmatter.excerpt);
      }
    }

    // Update Open Graph image with featured image
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) {
      if (frontmatter.featured_image) {
        // Convert relative path to full URL
        const imageUrl = frontmatter.featured_image.startsWith('http') 
          ? frontmatter.featured_image 
          : `https://www.brandiblemg.com${frontmatter.featured_image}`;
        ogImage.setAttribute('content', imageUrl);
      }
      // If no featured_image, keep the default logo (already set in template)
    }

    // Update Twitter Card image with featured image
    const twitterImage = document.querySelector('meta[name="twitter:image"]');
    if (twitterImage) {
      if (frontmatter.featured_image) {
        // Convert relative path to full URL
        const imageUrl = frontmatter.featured_image.startsWith('http') 
          ? frontmatter.featured_image 
          : `https://www.brandiblemg.com${frontmatter.featured_image}`;
        twitterImage.setAttribute('content', imageUrl);
      }
      // If no featured_image, keep the default logo (already set in template)
    }

    // Update Open Graph URL to the actual blog post URL
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl && slug) {
      ogUrl.setAttribute('content', postUrl);
    }

    // Update canonical URL to point to actual page URL (fixes canonical pointing to redirect issue)
    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink && slug) {
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

// Generate social share URLs
function getSocialShareUrls(title, url) {
  const encodedTitle = encodeURIComponent(title);
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(`${title} - Brandible Marketing Group`);
  
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    email: `mailto:?subject=${encodedTitle}&body=${encodedText}%20${encodedUrl}`,
    messages: `sms:?body=${encodedText}%20${encodedUrl}`
  };
}

// Copy URL to clipboard
function copyToClipboard(url) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      // Show feedback
      const button = document.querySelector('.copy-link-btn');
      if (button) {
        const originalHTML = button.innerHTML;
        button.innerHTML = `
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
        `;
        button.classList.remove('bg-purple-50', 'text-purple-600', 'hover:bg-purple-100');
        button.classList.add('bg-green-50', 'text-green-600');
        setTimeout(() => {
          button.innerHTML = originalHTML;
          button.classList.remove('bg-green-50', 'text-green-600');
          button.classList.add('bg-purple-50', 'text-purple-600', 'hover:bg-purple-100');
        }, 2000);
      }
    }).catch(err => {
      console.error('Failed to copy:', err);
      // Fallback for older browsers
      fallbackCopyToClipboard(url);
    });
  } else {
    // Fallback for older browsers
    fallbackCopyToClipboard(url);
  }
}

// Fallback copy method for older browsers
function fallbackCopyToClipboard(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    const button = document.querySelector('.copy-link-btn');
    if (button) {
      const originalHTML = button.innerHTML;
      button.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
      `;
      button.classList.remove('bg-purple-50', 'text-purple-600', 'hover:bg-purple-100');
      button.classList.add('bg-green-50', 'text-green-600');
      setTimeout(() => {
        button.innerHTML = originalHTML;
        button.classList.remove('bg-green-50', 'text-green-600');
        button.classList.add('bg-purple-50', 'text-purple-600', 'hover:bg-purple-100');
      }, 2000);
    }
  } catch (err) {
    console.error('Fallback copy failed:', err);
  }
  document.body.removeChild(textArea);
}

// Load and render the 2 newest blog posts (excluding current post)
async function loadRelatedPosts(currentSlug) {
  try {
    // Fetch posts index
    const indexResponse = await fetch('/blogs/posts/index.json');
    if (!indexResponse.ok) return '';
    
    const postsList = await indexResponse.json();
    
    // Load all posts and parse frontmatter
    const posts = await Promise.all(
      postsList.map(async (postFile) => {
        try {
          const response = await fetch(`/blogs/posts/${postFile}`);
          if (!response.ok) return null;
          
          const markdown = await response.text();
          const { frontmatter } = parseFrontmatter(markdown);
          
          // Generate slug from filename
          const slug = postFile.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '');
          
          // Skip current post
          if (slug === currentSlug) return null;
          
          return {
            slug,
            title: frontmatter.title || 'Untitled',
            date: frontmatter.date || '',
            excerpt: frontmatter.excerpt || '',
            category: frontmatter.category || ''
          };
        } catch (error) {
          console.error(`Error loading post ${postFile}:`, error);
          return null;
        }
      })
    );
    
    // Filter out null posts and sort by date (newest first)
    const validPosts = posts
      .filter(p => p !== null)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 2); // Get only the 2 newest
    
    if (validPosts.length === 0) return '';
    
    // Generate HTML for related posts (use new URL format)
    return validPosts.map(post => `
      <article class="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-100 hover:shadow-md transition">
        <h4 class="text-lg font-bold text-gray-900 mb-2">
          <a href="/blogs/${post.slug}/" class="hover:text-blue-600">${post.title}</a>
        </h4>
        ${post.excerpt ? `<p class="text-gray-600 text-sm mb-3">${post.excerpt}</p>` : ''}
        <a href="/blogs/${post.slug}/" class="text-blue-600 hover:text-blue-700 font-medium text-sm inline-flex items-center gap-1" aria-label="Read More: ${post.title}">
          Read More<span class="sr-only">: ${post.title}</span>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </a>
      </article>
    `).join('');
    
  } catch (error) {
    console.error('Error loading related posts:', error);
    return '';
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
  const postUrl = `https://www.brandiblemg.com/blogs/${slug}/`;
  
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
    "url": postUrl,
    "inLanguage": "en-US"
  };
  
  // Estimate word count from body if available
  if (body) {
    const wordCount = body.split(/\s+/).length;
    if (wordCount > 0) {
      articleSchema.wordCount = wordCount;
    }
  }

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
  
  // Generate post URL for sharing
  const urlParams = new URLSearchParams(window.location.search);
  let slug = urlParams.get('slug') || window.location.pathname.split('/').slice(-2, -1)[0];
  // If slug is empty or invalid, try to extract from current path
  if (!slug || slug === 'post.html' || slug === 'blogs') {
    const pathParts = window.location.pathname.split('/').filter(p => p);
    slug = pathParts[pathParts.length - 1] || slug;
  }
  // Use the static HTML file format for better SEO and social sharing
  const postUrl = `https://www.brandiblemg.com/blogs/${slug}/`;
  const shareUrls = getSocialShareUrls(frontmatter.title || 'Blog Post', postUrl);
  
  container.innerHTML = `
    <!-- Breadcrumb Navigation -->
    <nav aria-label="Breadcrumb" class="mb-8 pb-4 border-b border-gray-200">
      <ol class="flex items-center space-x-2 text-sm">
        <li>
          <a href="/" class="text-gray-500 hover:text-blue-600 transition">Home</a>
        </li>
        <li class="flex items-center">
          <svg class="w-4 h-4 text-gray-400 mx-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </li>
        <li>
          <a href="/blogs/" class="text-gray-500 hover:text-blue-600 transition">Blog</a>
        </li>
        <li class="flex items-center">
          <svg class="w-4 h-4 text-gray-400 mx-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </li>
        <li class="text-gray-900 font-medium" aria-current="page">${frontmatter.title || 'Post'}</li>
      </ol>
    </nav>

    <article class="max-w-4xl mx-auto">
      ${frontmatter.featured_image ? `
        <div class="mb-8">
          <img src="${frontmatter.featured_image.startsWith('http') ? frontmatter.featured_image : (frontmatter.featured_image.startsWith('/') ? `https://www.brandiblemg.com${frontmatter.featured_image}` : frontmatter.featured_image)}" alt="${frontmatter.title ? `Featured image for ${frontmatter.title}` : 'Blog post featured image'}" class="w-full h-64 md:h-96 object-cover rounded-lg" loading="lazy" decoding="async" />
        </div>
      ` : ''}
      
      <header class="mb-8">
        <div class="flex items-center gap-3 text-sm text-gray-500 mb-4">
          <span>${formatDate(frontmatter.date)}</span>
          ${frontmatter.category ? `<span class="px-2 py-1 ${categoryColor} rounded-full text-xs font-medium">${frontmatter.category}</span>` : ''}
          ${frontmatter.author ? `<span>By ${frontmatter.author}</span>` : ''}
        </div>
        ${frontmatter.excerpt ? `<p class="text-xl text-gray-600 mb-6">${frontmatter.excerpt}</p>` : ''}
        
        <!-- Social Share Buttons -->
        <div class="pt-6 border-t border-gray-200">
          <div class="flex items-center gap-4">
            <span class="text-sm font-medium text-gray-700">Share:</span>
            <div class="flex items-center gap-3">
              <a href="${shareUrls.facebook}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors" aria-label="Share on Facebook">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </a>
              <a href="${shareUrls.linkedin}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors" aria-label="Share on LinkedIn">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
              <a href="${shareUrls.email}" class="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors" aria-label="Share via Email">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              </a>
              <button type="button" data-share-url="${postUrl}" data-share-title="${frontmatter.title || 'Blog Post'}" class="flex items-center justify-center w-10 h-10 rounded-full bg-green-50 hover:bg-green-100 text-green-600 transition-colors messages-share-btn" aria-label="Share via Messages">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                </svg>
              </button>
              <button type="button" data-copy-url="${postUrl.replace(/"/g, '&quot;')}" class="flex items-center justify-center w-10 h-10 rounded-full bg-purple-50 hover:bg-purple-100 text-purple-600 transition-colors copy-link-btn" aria-label="Copy link to clipboard" title="Copy link">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
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
        <div class="grid md:grid-cols-2 gap-6" id="related-posts-container">
          <!-- Related posts will be loaded here -->
          <div class="col-span-full text-center py-4 text-gray-500 text-sm">Loading related posts...</div>
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
  
  // Add event listener for copy button
  const copyButton = container.querySelector('.copy-link-btn');
  if (copyButton) {
    copyButton.addEventListener('click', function() {
      const urlToCopy = this.getAttribute('data-copy-url');
      if (urlToCopy) {
        copyToClipboard(urlToCopy);
      }
    });
  }
  
  // Add event listener for Messages share button (use Web Share API)
  const messagesButtons = container.querySelectorAll('.messages-share-btn');
  messagesButtons.forEach(button => {
    button.addEventListener('click', async function() {
      const url = this.getAttribute('data-share-url');
      const title = this.getAttribute('data-share-title');
      
      if (navigator.share) {
        // Use Web Share API (works on mobile and modern browsers)
        try {
          await navigator.share({
            title: title,
            text: `${title} - Brandible Marketing Group`,
            url: url
          });
        } catch (err) {
          // User cancelled or error - fallback to sms:
          if (err.name !== 'AbortError') {
            window.location.href = `sms:?body=${encodeURIComponent(`${title} - Brandible Marketing Group`)}%20${encodeURIComponent(url)}`;
          }
        }
      } else {
        // Fallback to sms: protocol for older browsers
        window.location.href = `sms:?body=${encodeURIComponent(`${title} - Brandible Marketing Group`)}%20${encodeURIComponent(url)}`;
      }
    });
  });
  
  // Load and render related posts asynchronously
  loadRelatedPosts(slug).then(relatedPostsHTML => {
    const relatedPostsContainer = container.querySelector('#related-posts-container');
    if (relatedPostsContainer && relatedPostsHTML) {
      relatedPostsContainer.innerHTML = relatedPostsHTML;
    } else if (relatedPostsContainer) {
      relatedPostsContainer.innerHTML = `
        <div class="col-span-full text-center py-4 text-gray-500 text-sm">No other posts available</div>
      `;
    }
  });
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

