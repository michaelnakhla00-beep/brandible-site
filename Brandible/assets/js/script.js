// /assets/js/script.js
document.addEventListener('DOMContentLoaded', () => {
  /* ===========================
   * Mobile menu toggle
   * =========================== */
  const menuBtn = document.getElementById('mobile-menu-btn');
  const menu = document.getElementById('mobile-menu');
  // overlay for mobile menu
  let overlay = document.getElementById('menu-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'menu-overlay';
    overlay.className = 'overlay';
    document.body.appendChild(overlay);
  }
  const openMenu = () => {
    menu?.classList.remove('hidden');
    menu?.classList.remove('menu-closed');
    menu?.classList.add('menu-open');
    overlay?.classList.add('overlay-show');
    overlay?.setAttribute('aria-hidden','false');
  };
  const closeMenu = () => {
    if (!menu) return;
    menu.classList.remove('menu-open');
    menu.classList.add('menu-closed');
    overlay?.classList.remove('overlay-show');
    overlay?.setAttribute('aria-hidden','true');
    // delay hiding to allow animation
    setTimeout(() => menu.classList.add('hidden'), 200);
  };
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', () => {
      if (menu.classList.contains('hidden') || menu.classList.contains('menu-closed')) openMenu();
      else closeMenu();
    });
    overlay?.addEventListener('click', closeMenu);
    // auto-close on link click
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  }

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

  /* ===========================
   * Scroll reveal (IntersectionObserver)
   * =========================== */
  const revealEls = Array.from(document.querySelectorAll('[data-reveal]'));
  if (revealEls.length) {
    const onIntersect = (entries, obs) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('reveal-show');
          obs.unobserve(e.target);
        }
      });
    };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(onIntersect, { rootMargin: '80px' });
      revealEls.forEach(el => io.observe(el));
    } else {
      revealEls.forEach(el => el.classList.add('reveal-show'));
    }
  }

  /* ===========================
   * Supabase init (global)
   * =========================== */
  const SUPABASE_URL = window.SUPABASE_URL || "https://jijjjpduroyivrd.bgmnqo.supabase.co";
  // Public key safe to expose — only used for client-side Supabase inserts
  const SUPABASE_PUBLIC_KEY = window.SUPABASE_PUBLIC_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqampwZHVyb3lpdnJkYmdtbnFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NjM5NTcsImV4cCI6MjA3NzEzOTk1N30.m_NC1QBvaSdF9S5bIIWIfhAa1L8HfZpSZN9nzVEPiP0";

  function ensureSupabase(callback){
    if (window.supabase && window.supabase.createClient){
      return callback(window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY));
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.async = true;
    script.onload = () => callback(window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY));
    document.head.appendChild(script);
  }

  /* ===========================
   * Homepage booking form (Supabase → leads)
   * =========================== */
  const bookingForm = document.getElementById('bookingFormHome');
  if (bookingForm){
    const nameEl    = document.getElementById('bf-name');
    const emailEl   = document.getElementById('bf-email');
    const msgEl     = document.getElementById('bf-message');
    const serviceEl = document.getElementById('bf-service');
    const btn       = document.getElementById('bf-submit');
    const spin      = document.getElementById('bf-spinner');
    const toast     = document.getElementById('bf-toast');

    function showToast(text, ok){
      if (!toast) return;
      toast.textContent = text;
      toast.className = 'fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-sm font-medium shadow ' + (ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white');
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 3200);
    }

    function setLoading(isLoading){
      if (btn) btn.disabled = isLoading;
      if (spin) spin.classList.toggle('hidden', !isLoading);
    }

    bookingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = (nameEl?.value || '').trim();
      const email = (emailEl?.value || '').trim();
      const message = (msgEl?.value || '').trim();
      const service = (serviceEl?.value || '').trim();

      if (!name || !email || !message || !service){
        showToast('Please complete all fields.', false);
        return;
      }
      // simple email check
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        showToast('Enter a valid email address.', false);
        return;
      }

      setLoading(true);
      ensureSupabase(async (client) => {
        try {
          const { error } = await client
            .from('leads')
            .insert({ name, email, message, service });
          if (error) throw error;
          bookingForm.reset();
          showToast("Thanks for reaching out — we’ll get back to you shortly!", true);
        } catch (err){
          console.error(err);
          showToast('Sorry, something went wrong. Please try again.', false);
        } finally {
          setLoading(false);
        }
      });
    });
  }

  /* ===========================
   * Contact page two‑step booking (calendar → form)
   * =========================== */
  (function(){
    const grid = document.getElementById('bk-grid');
    const monthLabel = document.getElementById('bk-monthLabel');
    const prevBtn = document.getElementById('bk-prev');
    const nextBtn = document.getElementById('bk-next');
    const timesWrap = document.getElementById('bk-times');
    const step1 = document.getElementById('bk-step1');
    const step2 = document.getElementById('bk-step2');
    const toast = document.getElementById('bk-toast');
    const form = document.getElementById('bk-form');
    const selectedLabel = document.getElementById('bk-selected');
    const spin = document.getElementById('bk-spin');
    const submitBtn = document.getElementById('bk-submit');

    if (!grid || !monthLabel || !timesWrap) return;

    let view = new Date();
    view.setDate(1);
    let selectedDate = null;
    let selectedTime = null;

    const TIMES = ['10:00 AM','11:30 AM','1:00 PM','3:30 PM','5:00 PM'];

    function showToast(msg, ok){
      if (!toast) return;
      toast.textContent = msg;
      toast.className = 'fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-sm font-medium shadow ' + (ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white');
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 3200);
    }

    function fmtMonth(d){
      return d.toLocaleDateString(undefined, { month:'long', year:'numeric' });
    }

    function sameDay(a,b){
      return a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
    }

    function renderCalendar(){
      monthLabel.textContent = fmtMonth(view);
      grid.innerHTML = '';
      const firstDay = new Date(view);
      const startWeekday = firstDay.getDay();
      const daysInMonth = new Date(view.getFullYear(), view.getMonth()+1, 0).getDate();
      for (let i=0;i<startWeekday;i++){
        const cell = document.createElement('div');
        grid.appendChild(cell);
      }
      const today = new Date();
      for (let d=1; d<=daysInMonth; d++){
        const cell = document.createElement('button');
        cell.type='button';
        const thisDate = new Date(view.getFullYear(), view.getMonth(), d);
        const isToday = sameDay(thisDate, today);
        const isSelected = sameDay(thisDate, selectedDate);
        cell.className = 'text-sm py-2 rounded-lg text-center transition ' +
          (isSelected ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white' : 'hover:bg-gray-100 text-gray-700') +
          (isToday && !isSelected ? ' ring-1 ring-blue-300' : '');
        cell.textContent = String(d);
        cell.addEventListener('click', () => {
          selectedDate = thisDate;
          renderCalendar();
          renderTimes();
        });
        grid.appendChild(cell);
      }
    }

    function renderTimes(){
      timesWrap.innerHTML = '';
      if (!selectedDate) return;
      TIMES.forEach(t => {
        const btn = document.createElement('button');
        btn.type='button';
        btn.className = 'px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm transition';
        btn.textContent = t;
        btn.addEventListener('click', () => {
          selectedTime = t;
          // transition to step 2
          step1.classList.add('opacity-0','translate-y-1');
          setTimeout(() => {
            step1.classList.add('hidden');
            step2.classList.remove('hidden');
            step2.classList.add('opacity-0','translate-y-1');
            selectedLabel.textContent = selectedDate.toLocaleDateString() + ' at ' + selectedTime;
            setTimeout(()=>{ step2.classList.remove('opacity-0','translate-y-1'); }, 10);
          }, 180);
        });
        timesWrap.appendChild(btn);
      });
    }

    prevBtn?.addEventListener('click', () => { view.setMonth(view.getMonth()-1); renderCalendar(); });
    nextBtn?.addEventListener('click', () => { view.setMonth(view.getMonth()+1); renderCalendar(); });

    renderCalendar();

    // Submit booking
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!selectedDate || !selectedTime){ showToast('Please select a date and time first.', false); return; }
      const name = document.getElementById('bk-name')?.value.trim();
      const email = document.getElementById('bk-email')?.value.trim();
      const phone = document.getElementById('bk-phone')?.value.trim();
      const message = document.getElementById('bk-message')?.value.trim();
      const service = document.getElementById('bk-service')?.value.trim();
      if (!name || !email || !phone || !message || !service){ showToast('Please complete all fields.', false); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ showToast('Enter a valid email address.', false); return; }

      // save
      submitBtn && (submitBtn.disabled = true);
      spin?.classList.remove('hidden');
      ensureSupabase(async (client) => {
        try {
          const payload = {
            name,
            email,
            phone,
            message,
            service,
            date: selectedDate.toISOString().slice(0,10),
            time: selectedTime
          };
          const { error } = await client.from('leads').insert(payload);
          if (error) throw error;
          showToast('Thanks! Your consultation is booked.', true);
          form.reset();
          // back to step 1
          step2.classList.add('opacity-0','translate-y-1');
          setTimeout(()=>{
            step2.classList.add('hidden');
            step1.classList.remove('hidden');
            selectedDate = null; selectedTime = null; renderCalendar(); timesWrap.innerHTML='';
          }, 180);
        } catch (err){
          console.error(err);
          showToast('Sorry, something went wrong. Please try again.', false);
        } finally {
          submitBtn && (submitBtn.disabled = false);
          spin?.classList.add('hidden');
        }
      });
    });
  })();
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

  // Caret blinks via CSS, keep DOM clean

  const type = () => {
    const word = words[i % words.length];
    txt = isDeleting
      ? word.substring(0, txt.length - 1)
      : word.substring(0, txt.length + 1);

    el.textContent = txt;

    let speed = isDeleting ? 60 : 100;
    if (!isDeleting && txt === word) {
      speed = 1400; // shorter pause after full word
      isDeleting = true;
    } else if (isDeleting && txt === '') {
      isDeleting = false;
      i++;
      speed = 400; // shorter pause before next word
    }

    setTimeout(type, speed);
  };

  type();
});
