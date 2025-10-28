// /assets/js/script.js
document.addEventListener('DOMContentLoaded', () => {
  /* ===========================
   * Mobile menu toggle
   * =========================== */
  const menuBtn = document.getElementById('mobile-menu-btn');
  const menu = document.getElementById('mobile-menu');
  if (menuBtn && menu) menuBtn.addEventListener('click', () => menu.classList.toggle('hidden'));

  /* ===========================
   * Contact form -> Netlify (AJAX) + inline validation
   * =========================== */
  const form = document.getElementById('contactForm');

  if (form) {
    // make sure Netlify will parse it at build time
    if (!form.getAttribute('name')) form.setAttribute('name', 'contact');
    if (!form.querySelector('input[name="form-name"]')) {
      const hidden = document.createElement('input');
      hidden.type = 'hidden'; hidden.name = 'form-name'; hidden.value = form.getAttribute('name');
      form.prepend(hidden);
    }
    form.setAttribute('novalidate', 'novalidate');
    form.setAttribute('data-netlify', 'true');

    const submitBtn     = document.getElementById('submitBtn');
    const submitText    = document.getElementById('submitText');
    const submitSpinner = document.getElementById('submitSpinner');
    const submitIcon    = document.getElementById('submitIcon');
    const createdAt     = document.getElementById('createdAt');

    // fields we validate
    const fields = [
      { el: document.getElementById('fullName'),     id: 'fullName',     msg: 'Please enter your full name.' },
      { el: document.getElementById('emailAddress'), id: 'emailAddress', msg: 'Enter a valid email address.' },
      { el: document.getElementById('phoneNumber'),  id: 'phoneNumber',  msg: 'Enter a valid phone number.' },
      { el: document.getElementById('userMessage'),  id: 'userMessage',  msg: 'Please add a short message.' }
    ].filter(f => f.el);

    // create <p> error nodes after each input (no HTML edits needed)
    fields.forEach(f => {
      const p = document.createElement('p');
      p.id = f.id + '-error';
      p.className = 'mt-2 text-sm text-red-600 hidden';
      p.textContent = f.msg;
      p.setAttribute('role', 'status');
      p.setAttribute('aria-live', 'polite');
      f.el.setAttribute('aria-describedby', p.id);
      f.el.setAttribute('aria-invalid', 'false');
      f.el.insertAdjacentElement('afterend', p);
    });

    const showError = (f, customMsg) => {
      const p = document.getElementById(f.id + '-error');
      if (p) { if (customMsg) p.textContent = customMsg; p.classList.remove('hidden'); }
      f.el.classList.add('border-red-500','focus:border-red-500','focus:ring-red-500/20','bg-red-50');
      f.el.setAttribute('aria-invalid','true');
    };
    const clearError = (f) => {
      const p = document.getElementById(f.id + '-error');
      if (p) p.classList.add('hidden');
      f.el.classList.remove('border-red-500','focus:border-red-500','focus:ring-red-500/20','bg-red-50');
      f.el.setAttribute('aria-invalid','false');
    };
    const validPhone = v => /^[\d\s\-()+]{7,}$/.test(v || '');
    const validateField = (f) => {
      const v = (f.el.value || '').trim();
      if (!v) { showError(f, f.msg); return false; }
      if (f.id === 'emailAddress' && f.el.validity.typeMismatch) { showError(f, 'Enter a valid email address.'); return false; }
      if (f.id === 'phoneNumber' && !validPhone(v)) { showError(f, 'Enter a valid phone number.'); return false; }
      if (f.id === 'userMessage' && v.length < 5) { showError(f, 'Please add a short message.'); return false; }
      clearError(f); return true;
    };

    fields.forEach(f => {
      f.el.addEventListener('blur', () => validateField(f));
      f.el.addEventListener('input', () => { if (f.el.getAttribute('aria-invalid') === 'true') validateField(f); });
    });

    // consent inline validation
    const consent = document.getElementById('consent');
    let consentError;
    if (consent) {
      const consentLabel = document.querySelector('label[for="consent"]');
      consentError = document.createElement('p');
      consentError.id = 'consent-error';
      consentError.className = 'mt-2 text-sm text-red-600 hidden';
      consentError.textContent = 'Please agree to proceed.';
      consentError.setAttribute('role', 'status');
      consentError.setAttribute('aria-live', 'polite');
      consentLabel?.insertAdjacentElement('afterend', consentError);
      consent.addEventListener('change', () => { if (consent.checked) consentError.classList.add('hidden'); });
    }
    const setLoading = (isLoading) => {
      submitBtn && (submitBtn.disabled = isLoading);
      submitText?.classList.toggle('hidden', isLoading);
      submitIcon?.classList.toggle('hidden', isLoading);
      submitSpinner?.classList.toggle('hidden', !isLoading);
    };

    // helper: encode data for Netlify (x-www-form-urlencoded)
    const encode = (formData) => new URLSearchParams(formData).toString();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Honeypot
      const honeypot = document.getElementById('company');
      if (honeypot && (honeypot.value || '').trim() !== '') return;

      // Consent required
      if (consent && !consent.checked) { consentError?.classList.remove('hidden'); consent.focus(); return; }

      // validate fields
      let firstBad = null;
      fields.forEach(f => { if (!validateField(f) && !firstBad) firstBad = f; });
      if (firstBad) { firstBad.el.focus(); firstBad.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }

      if (createdAt) createdAt.value = new Date().toISOString();

      // Submit to Netlify without page reload
      setLoading(true);
      try {
        const fd = new FormData(form);
        // Netlify requires form-name in payload for AJAX
        if (!fd.get('form-name')) fd.set('form-name', form.getAttribute('name') || 'contact');

        await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: encode(fd),
        });

        // Success UX
        toggleModal(true);
        form.reset();
        fields.forEach(clearError);
        consentError?.classList.add('hidden');
      } catch (err) {
        console.error(err);
        alert('Sorry, there was an error sending your message. Please try again or email hello@brandiblemarketing.com.');
      } finally {
        setLoading(false);
      }
    });
  }

  /* ===========================
   * Success modal controls
   * =========================== */
  const modal = document.getElementById('successModal');
  const dialog = modal ? (modal.querySelector('[role="dialog"]') || modal) : null;

  function onEsc(e) { if (e.key === 'Escape') toggleModal(false); }
  function toggleModal(show) {
    if (!modal) return;
    if (show) {
      modal.classList.remove('hidden');
      if (dialog) { dialog.setAttribute('tabindex', '-1'); dialog.focus(); }
      document.addEventListener('keydown', onEsc);
    } else {
      modal.classList.add('hidden');
      document.removeEventListener('keydown', onEsc);
      const btn = document.getElementById('submitBtn');
      if (btn) btn.focus();
    }
  }
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) toggleModal(false); });

  // expose for inline HTML
  window.closeModal = () => toggleModal(false);
  window.scrollToCalendly = () => {
    toggleModal(false);
    const target = document.getElementById('book-call');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
});

/* ===========================
 * FAQs: accordion
 * =========================== */
document.addEventListener('DOMContentLoaded', () => {
  const items = Array.from(document.querySelectorAll('.faq-item'));
  if (!items.length) return;

  items.forEach(item => {
    const btn = item.querySelector('.faq-question');
    const ans = item.querySelector('.faq-answer');
    if (!btn || !ans) return;
    ans.style.maxHeight = '0px';
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => toggle(item, ans, btn));
  });

  function toggle(item, ans, btn, openOverride){
    const isOpen = btn.getAttribute('aria-expanded') === 'true';
    const shouldOpen = openOverride ?? !isOpen;
    if (shouldOpen){
      item.classList.add('faq-open'); btn.setAttribute('aria-expanded', 'true');
      ans.style.maxHeight = ans.scrollHeight + 'px';
      const onEnd = (e) => { if (e.propertyName !== 'max-height') return; ans.style.maxHeight = 'none'; ans.removeEventListener('transitionend', onEnd); };
      ans.addEventListener('transitionend', onEnd);
    } else {
      btn.setAttribute('aria-expanded', 'false'); item.classList.remove('faq-open');
      if (getComputedStyle(ans).maxHeight === 'none') { ans.style.maxHeight = ans.scrollHeight + 'px'; ans.getBoundingClientRect(); }
      ans.style.maxHeight = '0px';
    }
  }

  const expandAll = document.getElementById('expand-all');
  const collapseAll = document.getElementById('collapse-all');
  expandAll?.addEventListener('click', () =>
    items.forEach(i => toggle(i, i.querySelector('.faq-answer'), i.querySelector('.faq-question'), true))
  );
  collapseAll?.addEventListener('click', () =>
    items.forEach(i => toggle(i, i.querySelector('.faq-answer'), i.querySelector('.faq-question'), false))
  );

  window.addEventListener('resize', () => {
    items.forEach(i => {
      const btn = i.querySelector('.faq-question');
      const ans = i.querySelector('.faq-answer');
      if (btn?.getAttribute('aria-expanded') === 'true') ans.style.maxHeight = ans.scrollHeight + 'px';
    });
  });
});

/* ===========================
 * FAQ: Search + Category filters
 * =========================== */
document.addEventListener('DOMContentLoaded', () => {
  const items     = Array.from(document.querySelectorAll('.faq-item'));
  const searchEl  = document.getElementById('faq-search');
  const catBtns   = Array.from(document.querySelectorAll('button[data-cat]'));
  const empty     = document.getElementById('faq-empty');

  if (!items.length) return;

  let activeCat = 'all';
  let query = '';

  const norm = s => (s || '').toLowerCase().replace(/\s+/g,' ').trim();

  function applyFilters() {
    const q = norm(query);
    let visible = 0;
    items.forEach(item => {
      const matchesCat   = activeCat === 'all' || (item.dataset.cat === activeCat);
      const matchesQuery = !q || norm(item.textContent).includes(q);
      const show = matchesCat && matchesQuery;
      item.classList.toggle('hidden', !show);
      if (show) visible++;
    });
    if (empty) empty.classList.toggle('hidden', visible !== 0);
  }

  catBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      activeCat = btn.dataset.cat;
      catBtns.forEach(b => { b.classList.remove('cat-active'); b.setAttribute('aria-pressed','false'); });
      btn.classList.add('cat-active'); btn.setAttribute('aria-pressed','true');
      applyFilters();
    });
  });

  searchEl?.addEventListener('input', () => { query = searchEl.value; applyFilters(); });
  applyFilters();
});

/* ===========================
 * Services page small modal wiring
 * =========================== */
document.addEventListener('DOMContentLoaded', () => {
  const openBtn  = document.getElementById('important-notes-btn');
  const modal    = document.getElementById('important-notes-modal');
  const closeBtn = document.getElementById('close-modal');
  if (!openBtn || !modal) return;
  const toggle = (show) => modal.classList.toggle('hidden', !show);
  openBtn.addEventListener('click', () => toggle(true));
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target === closeBtn) toggle(false); });
});

/* ===========================
 * Typing animation (hero text)
 * =========================== */
document.querySelectorAll('.typed').forEach(el => {
  const words = JSON.parse(el.dataset.words || '[]');
  if (!words.length) return;

  let i = 0;
  let txt = '';
  let isDeleting = false;
  const caret = el.nextElementSibling; // the blinking bar

  // Independent caret blinking (every 600ms)
  if (caret) {
    setInterval(() => {
      caret.classList.toggle('opacity-0');
    }, 600);
  }

  const type = () => {
    const word = words[i % words.length];
    txt = isDeleting
      ? word.substring(0, txt.length - 1)
      : word.substring(0, txt.length + 1);

    el.textContent = txt;

    let speed = isDeleting ? 60 : 100;
    if (!isDeleting && txt === word) {
      speed = 1800; // pause after full word
      isDeleting = true;
    } else if (isDeleting && txt === '') {
      isDeleting = false;
      i++;
      speed = 500; // pause before next word
    }

    setTimeout(type, speed);
  };

  type();
});
