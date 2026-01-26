// Cookie Banner - Enhanced with ACCEPT, REJECT, and PREFERENCES
(function() {
  'use strict';

  // Check if user has already made a choice
  const consent = localStorage.getItem('cookieConsent');
  if (consent === 'accepted' || consent === 'rejected' || (consent && JSON.parse(consent).status)) {
    return; // Don't show banner if already made a choice
  }

  // Cookie consent management
  function saveConsent(status, preferences) {
    const consentData = {
      status: status,
      preferences: preferences || {},
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('cookieConsent', JSON.stringify(consentData));
    
    // Trigger analytics load if accepted
    if (status === 'accepted' || (preferences && preferences.analytics)) {
      window.dispatchEvent(new CustomEvent('cookieConsentAccepted'));
    }
  }

  // Create banner HTML
  const banner = document.createElement('div');
  banner.id = 'cookie-banner';
  banner.className = 'fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg';
  banner.style.display = 'none';
  
  banner.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="flex-1">
          <p class="text-sm sm:text-base text-white">
            We use cookies to improve your experience and analyze website traffic. 
            <a href="/privacy.html" class="underline hover:text-blue-200 transition-colors">Learn more in our Privacy Policy</a>.
          </p>
        </div>
        <div class="flex flex-wrap gap-3">
          <button 
            id="cookie-reject-btn" 
            class="bg-transparent border-2 border-white text-white px-5 py-2 rounded-xl font-semibold hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-600 whitespace-nowrap"
            aria-label="Reject cookies"
          >
            Reject
          </button>
          <button 
            id="cookie-preferences-btn" 
            class="bg-transparent border-2 border-white text-white px-5 py-2 rounded-xl font-semibold hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-600 whitespace-nowrap"
            aria-label="Cookie preferences"
          >
            Preferences
          </button>
          <button 
            id="cookie-accept-btn" 
            class="bg-white text-blue-600 px-6 py-2 rounded-xl font-semibold hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-600 whitespace-nowrap"
            aria-label="Accept cookies"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  `;

  // Create preferences modal
  const modal = document.createElement('div');
  modal.id = 'cookie-preferences-modal';
  modal.className = 'fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm hidden items-center justify-center';
  modal.style.display = 'none';
  
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
      <div class="p-6 sm:p-8">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-2xl font-bold text-gray-900">Cookie Preferences</h2>
          <button 
            id="cookie-modal-close" 
            class="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close preferences"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        
        <p class="text-gray-600 mb-6">
          Manage your cookie preferences. You can enable or disable different types of cookies below.
        </p>
        
        <div class="space-y-4 mb-6">
          <div class="flex items-start justify-between p-4 border border-gray-200 rounded-lg">
            <div class="flex-1">
              <h3 class="font-semibold text-gray-900 mb-1">Analytics Cookies</h3>
              <p class="text-sm text-gray-600">
                These cookies help us understand how visitors interact with our website by collecting and reporting information anonymously.
              </p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer ml-4">
              <input type="checkbox" id="pref-analytics" class="sr-only peer" checked>
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          
          <div class="flex items-start justify-between p-4 border border-gray-200 rounded-lg">
            <div class="flex-1">
              <h3 class="font-semibold text-gray-900 mb-1">Essential Cookies</h3>
              <p class="text-sm text-gray-600">
                These cookies are necessary for the website to function and cannot be switched off. They are usually set in response to actions made by you.
              </p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer ml-4">
              <input type="checkbox" id="pref-essential" class="sr-only peer" checked disabled>
              <div class="w-11 h-6 bg-gray-200 rounded-full opacity-50 cursor-not-allowed">
                <div class="w-5 h-5 bg-white border border-gray-300 rounded-full absolute top-[2px] left-[2px] translate-x-full"></div>
              </div>
            </label>
          </div>
        </div>
        
        <div class="flex flex-col sm:flex-row gap-3 justify-end">
          <button 
            id="cookie-save-preferences" 
            class="bg-blue-600 text-white px-6 py-2 rounded-xl font-semibold hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  `;

  // Add to page
  document.body.appendChild(banner);
  document.body.appendChild(modal);

  // Show banner with animation
  setTimeout(() => {
    banner.style.display = 'block';
    banner.style.animation = 'slideUp 0.3s ease-out';
  }, 100);

  // Handle accept button
  document.getElementById('cookie-accept-btn').addEventListener('click', function() {
    saveConsent('accepted', { analytics: true, essential: true });
    hideBanner();
  });

  // Handle reject button
  document.getElementById('cookie-reject-btn').addEventListener('click', function() {
    saveConsent('rejected', { analytics: false, essential: true });
    hideBanner();
  });

  // Handle preferences button
  document.getElementById('cookie-preferences-btn').addEventListener('click', function() {
    modal.style.display = 'flex';
    modal.style.animation = 'fadeIn 0.2s ease-out';
  });

  // Handle modal close
  document.getElementById('cookie-modal-close').addEventListener('click', function() {
    hideModal();
  });

  // Handle save preferences
  document.getElementById('cookie-save-preferences').addEventListener('click', function() {
    const analytics = document.getElementById('pref-analytics').checked;
    saveConsent('custom', { analytics: analytics, essential: true });
    hideModal();
    hideBanner();
  });

  // Close modal on backdrop click
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      hideModal();
    }
  });

  function hideBanner() {
    banner.style.animation = 'slideDown 0.3s ease-out';
    setTimeout(() => {
      banner.remove();
    }, 300);
  }

  function hideModal() {
    modal.style.animation = 'fadeOut 0.2s ease-out';
    setTimeout(() => {
      modal.style.display = 'none';
    }, 200);
  }

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
      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes fadeOut {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }
      #cookie-banner {
        box-shadow: 0 -4px 6px -1px rgba(0, 0, 0, 0.1), 0 -2px 4px -1px rgba(0, 0, 0, 0.06);
      }
      #cookie-preferences-modal {
        display: flex;
      }
    `;
    document.head.appendChild(style);
  }
})();
