// Tawk.to Chat Widget - Optimized loading strategy
// Externalized from inline scripts for CSP compliance
// Uses requestIdleCallback for better performance
(function() {
  'use strict';
  let tawkLoaded = false;
  
  function loadTawk() {
    if (tawkLoaded) return;
    tawkLoaded = true;
    var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
    (function(){
      var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
      s1.async=true;
      s1.src='https://embed.tawk.to/6941bb22e40c3519895fc75f/1jckc5vnb';
      s1.charset='UTF-8';
      s1.setAttribute('crossorigin','*');
      s0.parentNode.insertBefore(s1,s0);
    })();
  }
  
  // Optimized loading strategy: prioritize user engagement
  // 1. Load on scroll (user is actively engaging)
  window.addEventListener('scroll', loadTawk, { once: true, passive: true });
  
  // 2. Load on click/interaction (user is definitely engaged)
  ['click', 'touchstart', 'keydown'].forEach(event => {
    window.addEventListener(event, loadTawk, { once: true, passive: true });
  });
  
  // 3. Use requestIdleCallback if available (load when browser is idle)
  if ('requestIdleCallback' in window) {
    requestIdleCallback(loadTawk, { timeout: 5000 });
  } else {
    // Fallback: load after 5 seconds (increased from 3s for better initial load)
    setTimeout(loadTawk, 5000);
  }
})();
