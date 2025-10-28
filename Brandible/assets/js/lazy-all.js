// lazy-all.js — apply sane lazy defaults site-wide
(function () {
  // 1) IMAGES
  document.querySelectorAll('img:not([loading])').forEach(img => {
    if (img.dataset.critical === 'true' || img.classList.contains('lcp')) {
      img.setAttribute('fetchpriority', 'high');
      img.setAttribute('decoding', 'async');
    } else {
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
      img.setAttribute('fetchpriority', 'low');
    }
  });

  // 2) IFRAMES
  document.querySelectorAll('iframe:not([loading])').forEach(f => {
    f.setAttribute('loading', 'lazy');
    f.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
  });

  // 3) VIDEOS (don’t block the network)
  document.querySelectorAll('video').forEach(v => {
    if (!v.hasAttribute('autoplay')) v.setAttribute('preload', 'none');
  });

  // 4) BACKGROUND IMAGES (use data-bg="/path.jpg")
  const lazyBgs = document.querySelectorAll('[data-bg]');
  const revealBg = el => {
    const url = el.getAttribute('data-bg');
    if (!url) return;
    el.style.backgroundImage = `url("${url}")`;
    el.removeAttribute('data-bg');
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          revealBg(e.target);
          obs.unobserve(e.target);
        }
      });
    }, { rootMargin: '200px' });
    lazyBgs.forEach(el => io.observe(el));
  } else {
    // older browsers
    lazyBgs.forEach(revealBg);
  }

  // 5) DYNAMIC CONTENT (watch for nodes added later)
  const mo = new MutationObserver(muts => {
    muts.forEach(m => m.addedNodes && m.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.matches?.('img') && !node.hasAttribute('loading') && !node.dataset.critical) {
        node.setAttribute('loading', 'lazy');
        node.setAttribute('decoding', 'async');
        node.setAttribute('fetchpriority', 'low');
      }
      node.querySelectorAll?.('img:not([loading])').forEach(img => {
        if (!img.dataset.critical) {
          img.setAttribute('loading', 'lazy');
          img.setAttribute('decoding', 'async');
          img.setAttribute('fetchpriority', 'low');
        }
      });
      node.querySelectorAll?.('iframe:not([loading])').forEach(f => f.setAttribute('loading', 'lazy'));
    }));
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
