// Blog Filter & Search Script (for placeholder posts)
// Externalized from inline scripts for CSP compliance
(function() {
  'use strict';
  // This script handles filtering for placeholder posts
  // Once real posts are loaded, blog-renderer.js will re-initialize filters
  const filterButtons = document.querySelectorAll('.blog-filter, .blog-filter-active');
  const searchInput = document.getElementById('blog-search');
  const blogPosts = document.querySelectorAll('.blog-post');
  let currentCategory = 'all';
  let currentSearch = '';

  // Filter by category
  filterButtons.forEach(button => {
    button.addEventListener('click', function() {
      // Update active state
      filterButtons.forEach(btn => {
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
    searchInput.addEventListener('input', function() {
      currentSearch = this.value.toLowerCase().trim();
      filterPosts();
    });
  }

  // Filter posts based on category and search
  function filterPosts() {
    let visibleCount = 0;
    
    blogPosts.forEach(post => {
      const category = post.getAttribute('data-category');
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
    let noResultsMsg = grid?.querySelector('.no-results-message');
    
    if (visibleCount === 0 && grid) {
      if (!noResultsMsg) {
        noResultsMsg = document.createElement('div');
        noResultsMsg.className = 'no-results-message col-span-full text-center py-12';
        noResultsMsg.innerHTML = `
          <p class="text-gray-600 text-lg mb-2">No blog posts found</p>
          <p class="text-gray-500 text-sm">Try adjusting your filters or search terms</p>
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
})();
