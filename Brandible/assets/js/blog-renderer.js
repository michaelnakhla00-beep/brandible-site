// Blog Posts Renderer
// Fetches and displays blog posts from markdown files

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

      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

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

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function isDraftPost(frontmatter) {
  return frontmatter.draft === true;
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function estimateReadTime(body) {
  if (!body) return '';
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min read`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setFilterChipActive(activeButton) {
  const allFilterButtons = document.querySelectorAll('.blog-filter, .blog-filter-active');
  allFilterButtons.forEach(btn => {
    btn.classList.remove('blog-filter-active', 'cat-active', 'bg-blue-600', 'text-white', 'border-blue-600');
    btn.classList.add('blog-filter');
    btn.setAttribute('aria-pressed', 'false');
  });

  activeButton.classList.add('blog-filter', 'blog-filter-active', 'cat-active');
  activeButton.setAttribute('aria-pressed', 'true');
}

async function loadBlogPosts() {
  const blogContainer = document.getElementById('blog-posts-grid');
  if (!blogContainer) return;

  blogContainer.innerHTML = `
    <div class="blog-list-status">
      <p class="text-slate-500 text-sm">Loading blog posts...</p>
    </div>
  `;

  try {
    let postsList = [];
    try {
      const indexResponse = await fetch('/blogs/posts/index.json');
      if (indexResponse.ok) {
        postsList = await indexResponse.json();
      }
    } catch (e) {
      console.log('No posts index found, will use placeholder posts');
    }

    if (postsList.length === 0) {
      blogContainer.innerHTML = `
        <div class="blog-list-status">
          <p class="text-slate-600 text-lg mb-2">No blog posts yet</p>
          <p class="text-slate-400 text-sm">Check back soon for updates!</p>
        </div>
      `;
      return;
    }

    blogContainer.innerHTML = '';

    const posts = await Promise.all(
      postsList.map(async (postFile) => {
        try {
          const response = await fetch(`/blogs/posts/${postFile}`);
          if (!response.ok) return null;

          const markdown = await response.text();
          const { frontmatter, body } = parseFrontmatter(markdown);

          const slug = postFile.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '');

          if (isDraftPost(frontmatter)) return null;

          return {
            slug,
            title: frontmatter.title || 'Untitled',
            date: frontmatter.date || '',
            author: frontmatter.author || 'Brandible Team',
            category: frontmatter.category || '',
            excerpt: frontmatter.excerpt || '',
            featured_image: frontmatter.featured_image || '',
            featured_image_alt: frontmatter.featured_image_alt || '',
            tags: frontmatter.tags || [],
            body: body,
            readTime: estimateReadTime(body)
          };
        } catch (error) {
          console.error(`Error loading post ${postFile}:`, error);
          return null;
        }
      })
    );

    const validPosts = posts.filter(p => p !== null).sort((a, b) => {
      return new Date(b.date) - new Date(a.date);
    });

    if (validPosts.length === 0) {
      blogContainer.innerHTML = `
        <div class="blog-list-status">
          <p class="text-slate-600 text-lg mb-2">No blog posts yet</p>
          <p class="text-slate-400 text-sm">Check back soon for updates!</p>
        </div>
      `;
      return;
    }

    const featuredSlot = document.getElementById('blog-featured');
    const [featured, ...rest] = validPosts;

    if (featuredSlot && featured) {
      featuredSlot.innerHTML = '';
      featuredSlot.appendChild(createFeaturedPost(featured));
    }

    rest.forEach(post => {
      blogContainer.appendChild(createPostCard(post));
    });

    // If only one post, still show it in the list when featured is empty or keep list empty
    if (rest.length === 0 && !featuredSlot) {
      blogContainer.appendChild(createPostCard(featured));
    }

    const staticPosts = document.getElementById('static-blog-posts');
    if (staticPosts) {
      staticPosts.style.display = 'none';
    }

    initializeFilters();
  } catch (error) {
    console.error('Error loading blog posts:', error);
    blogContainer.innerHTML = `
      <div class="blog-list-status">
        <p class="text-red-600 text-lg mb-2">Error loading blog posts</p>
        <p class="text-slate-400 text-sm">Please try again later</p>
      </div>
    `;
  }
}

function createFeaturedPost(post) {
  const article = document.createElement('article');
  article.className = 'blog-featured blog-post';
  article.setAttribute('data-category', post.category || '');

  const title = escapeHtml(post.title);
  const excerpt = post.excerpt ? escapeHtml(post.excerpt) : '';
  const category = post.category ? escapeHtml(post.category) : '';
  const metaParts = [
    formatDate(post.date),
    category,
    post.readTime
  ].filter(Boolean);

  const imgAlt = escapeHtml(post.featured_image_alt || (post.title ? `Featured image for ${post.title}` : 'Blog post featured image'));
  const media = post.featured_image
    ? `<div class="blog-featured-media"><img src="${escapeHtml(post.featured_image)}" alt="${imgAlt}" loading="lazy" decoding="async" width="960" height="540" /></div>`
    : `<div class="blog-featured-media blog-featured-media--fallback" aria-hidden="true"><span>${category || 'Blog'}</span></div>`;

  article.innerHTML = `
    ${media}
    <div class="blog-featured-body">
      <p class="blog-featured-label">Latest</p>
      <p class="blog-list-meta">${metaParts.join(' · ')}</p>
      <h2 class="blog-featured-title">
        <a href="/blogs/${post.slug}/">${title}</a>
      </h2>
      ${excerpt ? `<p class="blog-featured-excerpt">${excerpt}</p>` : ''}
      <a href="/blogs/${post.slug}/" class="blog-list-read" aria-label="Read: ${title}">
        Read article
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
        </svg>
      </a>
    </div>
  `;

  return article;
}

function createPostCard(post) {
  const article = document.createElement('article');
  article.className = 'blog-post blog-list-item';
  article.setAttribute('data-category', post.category || '');

  const title = escapeHtml(post.title);
  const excerpt = post.excerpt ? escapeHtml(post.excerpt) : '';
  const category = post.category ? escapeHtml(post.category) : '';
  const metaParts = [
    formatDate(post.date),
    category,
    post.readTime
  ].filter(Boolean);

  const imgAlt = escapeHtml(post.featured_image_alt || (post.title ? `Featured image for ${post.title}` : 'Blog post featured image'));
  const thumb = post.featured_image
    ? `<a href="/blogs/${post.slug}/" class="blog-list-thumb" tabindex="-1" aria-hidden="true">
        <img src="${escapeHtml(post.featured_image)}" alt="" loading="lazy" decoding="async" width="320" height="200" />
      </a>`
    : `<a href="/blogs/${post.slug}/" class="blog-list-thumb blog-list-thumb--fallback" tabindex="-1" aria-hidden="true">
        <span>${category || 'Blog'}</span>
      </a>`;

  article.innerHTML = `
    ${thumb}
    <div class="blog-list-body">
      <p class="blog-list-meta">${metaParts.join(' · ')}</p>
      <h2 class="blog-list-title">
        <a href="/blogs/${post.slug}/">${title}</a>
      </h2>
      ${excerpt ? `<p class="blog-list-excerpt">${excerpt}</p>` : ''}
      <a href="/blogs/${post.slug}/" class="blog-list-read" aria-label="Read: ${title}">
        Read
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
        </svg>
      </a>
    </div>
  `;

  return article;
}

function initializeFilters() {
  const filterButtons = document.querySelectorAll('.blog-filter, .blog-filter-active');
  const searchInput = document.getElementById('blog-search');
  let currentCategory = 'all';
  let currentSearch = '';

  filterButtons.forEach(button => {
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);

    newButton.addEventListener('click', function() {
      setFilterChipActive(this);
      currentCategory = this.getAttribute('data-category');
      filterPosts();
    });
  });

  if (searchInput) {
    const newInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newInput, searchInput);

    newInput.addEventListener('input', function() {
      currentSearch = this.value.toLowerCase().trim();
      filterPosts();
    });
  }

  function filterPosts() {
    const blogPosts = document.querySelectorAll('#blog-featured .blog-post, #blog-posts-grid .blog-post');
    let visibleCount = 0;

    blogPosts.forEach(post => {
      const category = post.getAttribute('data-category') || '';
      const title = post.querySelector('h2 a')?.textContent.toLowerCase() || '';
      const excerpt = post.querySelector('.blog-list-excerpt, .blog-featured-excerpt')?.textContent.toLowerCase() || '';
      const searchText = title + ' ' + excerpt;

      const matchesCategory = currentCategory === 'all' || category === currentCategory;
      const matchesSearch = !currentSearch || searchText.includes(currentSearch);

      if (matchesCategory && matchesSearch) {
        post.style.display = '';
        visibleCount++;
      } else {
        post.style.display = 'none';
      }
    });

    const grid = document.getElementById('blog-posts-grid');
    if (!grid) return;

    let noResultsMsg = grid.querySelector('.no-results-message');

    if (visibleCount === 0) {
      if (!noResultsMsg) {
        noResultsMsg = document.createElement('div');
        noResultsMsg.className = 'no-results-message blog-list-status';
        noResultsMsg.innerHTML = `
          <p class="text-slate-600 text-lg mb-2">No blog posts found</p>
          <p class="text-slate-400 text-sm">Try adjusting your filters or search terms</p>
        `;
        grid.appendChild(noResultsMsg);
      }
      noResultsMsg.style.display = 'block';
    } else if (noResultsMsg) {
      noResultsMsg.style.display = 'none';
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadBlogPosts);
} else {
  loadBlogPosts();
}
