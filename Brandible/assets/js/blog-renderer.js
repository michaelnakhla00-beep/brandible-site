// Blog Posts Renderer
// Fetches and displays blog posts from markdown files

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

// Generate slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Format date
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Load and render blog posts
async function loadBlogPosts() {
  const blogContainer = document.getElementById('blog-posts-grid');
  if (!blogContainer) return;

  try {
    // Try to fetch posts index first (if it exists)
    let postsList = [];
    try {
      const indexResponse = await fetch('/blogs/posts/index.json');
      if (indexResponse.ok) {
        postsList = await indexResponse.json();
      }
    } catch (e) {
      console.log('No posts index found, will use placeholder posts');
    }

    // If no posts index, show a message
    if (postsList.length === 0) {
      blogContainer.innerHTML = `
        <div class="col-span-full text-center py-12">
          <p class="text-gray-500 text-lg mb-2">No blog posts yet</p>
          <p class="text-gray-400 text-sm">Check back soon for updates!</p>
        </div>
      `;
      return;
    }

    // Clear container before loading posts
    blogContainer.innerHTML = '';

    // Load each post
    const posts = await Promise.all(
      postsList.map(async (postFile) => {
        try {
          const response = await fetch(`/blogs/posts/${postFile}`);
          if (!response.ok) return null;
          
          const markdown = await response.text();
          const { frontmatter, body } = parseFrontmatter(markdown);
          
          // Generate slug from filename (remove date prefix and .md extension)
          // Format: YYYY-MM-DD-slug.md -> slug
          const slug = postFile.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '');
          
          return {
            slug,
            title: frontmatter.title || 'Untitled',
            date: frontmatter.date || '',
            author: frontmatter.author || 'Brandible Team',
            category: frontmatter.category || '',
            excerpt: frontmatter.excerpt || '',
            featured_image: frontmatter.featured_image || '',
            tags: frontmatter.tags || [],
            body: body
          };
        } catch (error) {
          console.error(`Error loading post ${postFile}:`, error);
          return null;
        }
      })
    );

    // Filter out null posts and sort by date (newest first)
    const validPosts = posts.filter(p => p !== null).sort((a, b) => {
      return new Date(b.date) - new Date(a.date);
    });

    if (validPosts.length === 0) {
      blogContainer.innerHTML = `
        <div class="col-span-full text-center py-12">
          <p class="text-gray-500 text-lg mb-2">No blog posts yet</p>
          <p class="text-gray-400 text-sm">Check back soon for updates!</p>
        </div>
      `;
      return;
    }

    // Render posts
    validPosts.forEach(post => {
      const postCard = createPostCard(post);
      blogContainer.appendChild(postCard);
    });

    // Re-initialize filter functionality with new posts
    initializeFilters();
  } catch (error) {
    console.error('Error loading blog posts:', error);
    blogContainer.innerHTML = `
      <div class="col-span-full text-center py-12">
        <p class="text-red-500 text-lg mb-2">Error loading blog posts</p>
        <p class="text-gray-400 text-sm">Please try again later</p>
      </div>
    `;
  }
}

// Create a blog post card element
function createPostCard(post) {
  const article = document.createElement('article');
  article.className = 'blog-post bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300 border border-gray-100';
  article.setAttribute('data-category', post.category || '');
  
  const categoryColors = {
    'Marketing': 'bg-blue-100 text-blue-700',
    'Web Design': 'bg-purple-100 text-purple-700',
    'SEO': 'bg-yellow-100 text-yellow-700',
    'Social Media': 'bg-green-100 text-green-700',
    'Business Tips': 'bg-red-100 text-red-700',
    'Case Studies': 'bg-indigo-100 text-indigo-700'
  };
  
  const categoryColor = categoryColors[post.category] || 'bg-gray-100 text-gray-700';
  
  const featuredImage = post.featured_image 
    ? `<img src="${post.featured_image}" alt="${post.title ? `Featured image for ${post.title}` : 'Blog post featured image'}" class="w-full h-48 object-cover" loading="lazy" decoding="async" width="800" height="192" />`
    : `<div class="h-48 bg-gradient-to-br from-blue-400 to-indigo-500"></div>`;
  
  article.innerHTML = `
    ${featuredImage}
    <div class="p-6">
      <div class="flex items-center gap-3 text-sm text-gray-500 mb-3">
        <span>${formatDate(post.date)}</span>
        ${post.category ? `<span class="px-2 py-1 ${categoryColor} rounded-full text-xs font-medium">${post.category}</span>` : ''}
      </div>
      <h2 class="text-2xl font-bold text-gray-900 mb-3">
        <a href="/blogs/post.html?slug=${post.slug}" class="hover:text-blue-600 transition">${post.title}</a>
      </h2>
      ${post.excerpt ? `<p class="text-gray-600 mb-4 line-clamp-3">${post.excerpt}</p>` : ''}
      <a href="/blogs/post.html?slug=${post.slug}" class="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-2">
        Read More
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
        </svg>
      </a>
    </div>
  `;
  
  return article;
}

// Re-initialize filters after posts are loaded
function initializeFilters() {
  const filterButtons = document.querySelectorAll('.blog-filter, .blog-filter-active');
  const searchInput = document.getElementById('blog-search');
  const blogPosts = document.querySelectorAll('.blog-post');
  let currentCategory = 'all';
  let currentSearch = '';

  // Filter by category
  filterButtons.forEach(button => {
    // Remove existing listeners by cloning
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    
    newButton.addEventListener('click', function() {
      // Get fresh reference to all filter buttons (after DOM changes)
      const allFilterButtons = document.querySelectorAll('.blog-filter, .blog-filter-active');
      
      // Update active state on all buttons
      allFilterButtons.forEach(btn => {
        btn.classList.remove('blog-filter-active', 'bg-blue-600', 'text-white', 'border-blue-600');
        btn.classList.add('blog-filter', 'hover:bg-gray-100');
        btn.setAttribute('aria-pressed', 'false');
      });
      
      this.classList.remove('blog-filter', 'hover:bg-gray-100');
      this.classList.add('blog-filter-active', 'bg-blue-600', 'text-white', 'border-blue-600');
      this.setAttribute('aria-pressed', 'true');
      
      currentCategory = this.getAttribute('data-category');
      filterPosts();
    });
  });

  // Search functionality
  if (searchInput) {
    const newInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newInput, searchInput);
    
    newInput.addEventListener('input', function() {
      currentSearch = this.value.toLowerCase().trim();
      filterPosts();
    });
  }

  // Filter posts based on category and search
  function filterPosts() {
    let visibleCount = 0;
    
    blogPosts.forEach(post => {
      const category = post.getAttribute('data-category') || '';
      const title = post.querySelector('h2 a')?.textContent.toLowerCase() || '';
      const excerpt = post.querySelector('p')?.textContent.toLowerCase() || '';
      const searchText = title + ' ' + excerpt;
      
      const matchesCategory = currentCategory === 'all' || category === currentCategory;
      const matchesSearch = !currentSearch || searchText.includes(currentSearch);
      
      if (matchesCategory && matchesSearch) {
        post.style.display = 'block';
        visibleCount++;
      } else {
        post.style.display = 'none';
      }
    });

    // Show message if no posts match
    const grid = document.getElementById('blog-posts-grid');
    let noResultsMsg = grid.querySelector('.no-results-message');
    
    if (visibleCount === 0) {
      if (!noResultsMsg) {
        noResultsMsg = document.createElement('div');
        noResultsMsg.className = 'no-results-message col-span-full text-center py-12';
        noResultsMsg.innerHTML = `
          <p class="text-gray-500 text-lg mb-2">No blog posts found</p>
          <p class="text-gray-400 text-sm">Try adjusting your filters or search terms</p>
        `;
        grid.appendChild(noResultsMsg);
      }
      noResultsMsg.style.display = 'block';
    } else {
      if (noResultsMsg) {
        noResultsMsg.style.display = 'none';
      }
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadBlogPosts);
} else {
  loadBlogPosts();
}

