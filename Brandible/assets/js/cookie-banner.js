// Cookie Banner - Simple US-focused implementation
(function() {
  // Check if user has already accepted
  if (localStorage.getItem('cookieConsent') === 'accepted') {
    return; // Don't show banner if already accepted
  }

  // Create banner HTML
  const banner = document.createElement('div');
  banner.id = 'cookie-banner';
  banner.className = 'fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg';
  banner.style.display = 'none'; // Hidden initially, will show with animation
  
  banner.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="flex-1">
          <p class="text-sm sm:text-base text-white">
            We use cookies to improve your experience and analyze website traffic. 
            <a href="/privacy.html" class="underline hover:text-blue-200 transition-colors">Learn more in our Privacy Policy</a>.
          </p>
        </div>
        <button 
          id="cookie-accept-btn" 
          class="bg-white text-blue-600 px-6 py-2 rounded-xl font-semibold hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-600 whitespace-nowrap"
          aria-label="Accept cookies"
        >
          Accept
        </button>
      </div>
    </div>
  `;

  // Add to page
  document.body.appendChild(banner);

  // Show banner with smooth animation
  setTimeout(() => {
    banner.style.display = 'block';
    banner.style.animation = 'slideUp 0.3s ease-out';
  }, 100);

  // Handle accept button click
  const acceptBtn = document.getElementById('cookie-accept-btn');
  acceptBtn.addEventListener('click', function() {
    localStorage.setItem('cookieConsent', 'accepted');
    banner.style.animation = 'slideDown 0.3s ease-out';
    setTimeout(() => {
      banner.remove();
    }, 300);
  });

  // Add CSS animations
  if (!document.getElementById('cookie-banner-styles')) {
    const style = document.createElement('style');
    style.id = 'cookie-banner-styles';
    style.textContent = `
      @keyframes slideUp {
        from {
          transform: translateY(100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      @keyframes slideDown {
        from {
          transform: translateY(0);
          opacity: 1;
        }
        to {
          transform: translateY(100%);
          opacity: 0;
        }
      }
      #cookie-banner {
        box-shadow: 0 -4px 6px -1px rgba(0, 0, 0, 0.1), 0 -2px 4px -1px rgba(0, 0, 0, 0.06);
      }
    `;
    document.head.appendChild(style);
  }
})();

