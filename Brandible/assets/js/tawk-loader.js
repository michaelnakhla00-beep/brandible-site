// Tawk.to Chat Widget - Loads after page interaction or 3s delay
// Externalized from inline scripts for CSP compliance
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
  
  // Load on scroll (user is engaged) or after 3 seconds
  window.addEventListener('scroll', loadTawk, { once: true, passive: true });
  setTimeout(loadTawk, 3000);
})();
