// Google Analytics 4 - loads immediately on all pages
(function() {
  // Google tag (gtag.js)
  const script1 = document.createElement('script');
  script1.async = true;
  script1.src = 'https://www.googletagmanager.com/gtag/js?id=G-3E7RE31WYB';
  document.head.appendChild(script1);

  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-3E7RE31WYB');
})();

