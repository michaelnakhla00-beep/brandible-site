// Google Analytics 4 - Respects cookie consent
(function() {
  'use strict';

  function loadAnalytics() {
    // Google tag (gtag.js)
    const script1 = document.createElement('script');
    script1.async = true;
    script1.src = 'https://www.googletagmanager.com/gtag/js?id=G-3E7RE31WYB';
    document.head.appendChild(script1);

    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-3E7RE31WYB');
  }

  // Check existing consent
  function checkConsent() {
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) {
      return false; // No consent yet, wait for user choice
    }

    try {
      const consentData = JSON.parse(consent);
      // Load analytics if accepted or if analytics is enabled in custom preferences
      if (consentData.status === 'accepted' || 
          (consentData.status === 'custom' && consentData.preferences && consentData.preferences.analytics)) {
        return true;
      }
    } catch (e) {
      // Legacy format: 'accepted' string
      if (consent === 'accepted') {
        return true;
      }
    }
    return false;
  }

  // Check consent on load
  if (checkConsent()) {
    loadAnalytics();
  } else {
    // Listen for consent acceptance
    window.addEventListener('cookieConsentAccepted', function() {
      if (checkConsent()) {
        loadAnalytics();
      }
    });
  }
})();
