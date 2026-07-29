// Cookie Banner - bottom-right popup card with ACCEPT, REJECT, and PREFERENCES
(function() {
  'use strict';

  const consent = localStorage.getItem('cookieConsent');
  if (consent === 'accepted' || consent === 'rejected' || (consent && JSON.parse(consent).status)) {
    return;
  }

  function saveConsent(status, preferences) {
    const consentData = {
      status: status,
      preferences: preferences || {},
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('cookieConsent', JSON.stringify(consentData));

    if (status === 'accepted' || (preferences && preferences.analytics)) {
      window.dispatchEvent(new CustomEvent('cookieConsentAccepted'));
    }
  }

  const banner = document.createElement('div');
  banner.id = 'cookie-banner';
  banner.className = 'cookie-banner-card';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Cookie consent');
  banner.style.display = 'none';

  banner.innerHTML = `
    <div class="cookie-banner-card-inner">
      <div class="cookie-banner-icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="13" r="7.5" fill="#F59E0B" stroke="#D97706" stroke-width=".75"/>
          <circle cx="18.5" cy="6.5" r="4" fill="#FEF9C3"/>
          <circle cx="9" cy="11" r="1.15" fill="#78350F"/>
          <circle cx="13" cy="15.25" r="1" fill="#78350F"/>
          <circle cx="15.75" cy="11.25" r=".9" fill="#78350F"/>
          <circle cx="10.25" cy="15.75" r=".8" fill="#78350F"/>
          <circle cx="14.25" cy="9.5" r=".7" fill="#78350F"/>
        </svg>
      </div>
      <div class="cookie-banner-content">
        <p class="cookie-banner-title">We use cookies</p>
        <p class="cookie-banner-text">
          We use cookies to improve your experience and analyze website traffic.
          <a href="/privacy.html" class="cookie-banner-link">Privacy Policy</a>
        </p>
        <div class="cookie-banner-actions">
          <button
            id="cookie-accept-btn"
            class="cookie-btn cookie-btn-primary"
            aria-label="Accept cookies"
          >
            Accept
          </button>
          <button
            id="cookie-reject-btn"
            class="cookie-btn cookie-btn-secondary"
            aria-label="Reject cookies"
          >
            Reject
          </button>
          <button
            id="cookie-preferences-btn"
            class="cookie-btn cookie-btn-ghost"
            aria-label="Cookie preferences"
          >
            Preferences
          </button>
        </div>
      </div>
    </div>
  `;

  const modal = document.createElement('div');
  modal.id = 'cookie-preferences-modal';
  modal.className = 'fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm hidden items-center justify-center';
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

  document.body.appendChild(banner);
  document.body.appendChild(modal);

  setTimeout(() => {
    banner.style.display = 'block';
    banner.classList.add('cookie-banner-show');
  }, 600);

  document.getElementById('cookie-accept-btn').addEventListener('click', function() {
    saveConsent('accepted', { analytics: true, essential: true });
    hideBanner();
  });

  document.getElementById('cookie-reject-btn').addEventListener('click', function() {
    saveConsent('rejected', { analytics: false, essential: true });
    hideBanner();
  });

  document.getElementById('cookie-preferences-btn').addEventListener('click', function() {
    modal.style.display = 'flex';
    modal.style.animation = 'cookieFadeIn 0.2s ease-out';
  });

  document.getElementById('cookie-modal-close').addEventListener('click', hideModal);

  document.getElementById('cookie-save-preferences').addEventListener('click', function() {
    const analytics = document.getElementById('pref-analytics').checked;
    saveConsent('custom', { analytics: analytics, essential: true });
    hideModal();
    hideBanner();
  });

  modal.addEventListener('click', function(e) {
    if (e.target === modal) hideModal();
  });

  function hideBanner() {
    banner.classList.remove('cookie-banner-show');
    banner.classList.add('cookie-banner-hide');
    setTimeout(() => banner.remove(), 320);
  }

  function hideModal() {
    modal.style.animation = 'cookieFadeOut 0.2s ease-out';
    setTimeout(() => {
      modal.style.display = 'none';
    }, 200);
  }

  if (!document.getElementById('cookie-banner-styles')) {
    const style = document.createElement('style');
    style.id = 'cookie-banner-styles';
    style.textContent = `
      .cookie-banner-card{
        position:fixed;
        bottom:1.25rem;
        right:1.25rem;
        z-index:60;
        width:min(22rem, calc(100vw - 2rem));
        opacity:0;
        transform:translateY(1rem) scale(.96);
        transition:opacity .35s ease, transform .35s cubic-bezier(.4,0,.2,1);
        pointer-events:none;
      }
      .cookie-banner-card.cookie-banner-show{
        opacity:1;
        transform:translateY(0) scale(1);
        pointer-events:auto;
      }
      .cookie-banner-card.cookie-banner-hide{
        opacity:0;
        transform:translateY(.75rem) scale(.96);
        pointer-events:none;
      }
      .cookie-banner-card-inner{
        display:flex;
        gap:.875rem;
        padding:1.125rem 1.25rem;
        background:#fff;
        border:1px solid rgba(15,23,42,.08);
        border-radius:1.125rem;
        box-shadow:0 18px 40px rgba(15,23,42,.14), 0 4px 12px rgba(15,23,42,.06);
      }
      .cookie-banner-icon{
        flex-shrink:0;
        display:flex;
        align-items:center;
        justify-content:center;
        width:2.5rem;
        height:2.5rem;
        margin-top:.0625rem;
        border-radius:.75rem;
        background:linear-gradient(145deg, #FEF9C3, #FDE68A);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.6);
      }
      .cookie-banner-icon svg{
        display:block;
      }
      .cookie-banner-content{
        flex:1;
        min-width:0;
      }
      .cookie-banner-title{
        margin:0 0 .375rem;
        font-size:.9375rem;
        font-weight:700;
        color:#111827;
        letter-spacing:-.01em;
      }
      .cookie-banner-text{
        margin:0 0 .875rem;
        font-size:.8125rem;
        line-height:1.5;
        color:#4B5563;
      }
      .cookie-banner-link{
        color:#2563EB;
        text-decoration:underline;
        text-underline-offset:2px;
      }
      .cookie-banner-link:hover{
        color:#1D4ED8;
      }
      .cookie-banner-actions{
        display:flex;
        flex-wrap:wrap;
        gap:.5rem;
      }
      .cookie-btn{
        border:none;
        border-radius:.625rem;
        padding:.5rem .875rem;
        font-size:.8125rem;
        font-weight:600;
        cursor:pointer;
        transition:background-color .2s ease, color .2s ease, box-shadow .2s ease;
      }
      .cookie-btn-primary{
        background:#1D4ED8;
        color:#fff;
      }
      .cookie-btn-primary:hover{
        background:#2563EB;
        box-shadow:0 4px 12px rgba(37,99,235,.35);
      }
      .cookie-btn-secondary{
        background:#F3F4F6;
        color:#374151;
      }
      .cookie-btn-secondary:hover{
        background:#E5E7EB;
      }
      .cookie-btn-ghost{
        background:transparent;
        color:#6B7280;
        padding-left:.5rem;
        padding-right:.5rem;
      }
      .cookie-btn-ghost:hover{
        color:#111827;
      }
      .cookie-btn:focus-visible{
        outline:2px solid #F97316;
        outline-offset:2px;
      }
      @keyframes cookieFadeIn{
        from{ opacity:0; }
        to{ opacity:1; }
      }
      @keyframes cookieFadeOut{
        from{ opacity:1; }
        to{ opacity:0; }
      }
      #cookie-preferences-modal{
        display:flex;
      }
      @media (max-width:480px){
        .cookie-banner-card{
          bottom:1rem;
          right:1rem;
          left:1rem;
          width:auto;
        }
      }
      @media (prefers-reduced-motion:reduce){
        .cookie-banner-card{
          transition:none;
        }
      }
    `;
    document.head.appendChild(style);
  }
})();
