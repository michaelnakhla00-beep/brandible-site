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
          <div class="flex flex-wrap gap-2">
            <span class="text-sm text-gray-600 font-medium">Tags:</span>
            ${frontmatter.tags.map(tag => `<span class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">${tag}</span>`).join('')}
          </div>
        </footer>
      ` : ''}
    </article>
  `;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadBlogPost);
} else {
  loadBlogPost();
}

