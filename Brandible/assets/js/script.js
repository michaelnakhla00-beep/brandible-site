// /assets/js/script.js
document.addEventListener('DOMContentLoaded', () => {
  /* ===========================
   * Mobile menu toggle
   * =========================== */
  const menuBtn = document.getElementById('mobile-menu-btn');
  const menu = document.getElementById('mobile-menu');
  let submenuToggles = [];
  // overlay for mobile menu
  let overlay = document.getElementById('menu-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'menu-overlay';
    overlay.className = 'overlay';
    document.body.appendChild(overlay);
  }
  const resetSubmenus = () => {
    submenuToggles.forEach(btn => {
      const targetId = btn.getAttribute('data-submenu-toggle');
      const target = targetId ? document.getElementById(targetId) : null;
      const icon = btn.querySelector('[data-submenu-icon]');
      btn.setAttribute('aria-expanded', 'false');
      target?.classList.add('hidden');
      icon?.classList.remove('rotate-180');
    });
  };

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
    resetSubmenus();
  };
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', () => {
      if (menu.classList.contains('hidden') || menu.classList.contains('menu-closed')) openMenu();
      else closeMenu();
    });
    overlay?.addEventListener('click', closeMenu);
    // auto-close on link click
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
    submenuToggles = Array.from(menu.querySelectorAll('[data-submenu-toggle]'));
    submenuToggles.forEach(btn => {
      const targetId = btn.getAttribute('data-submenu-toggle');
      const target = targetId ? document.getElementById(targetId) : null;
      const icon = btn.querySelector('[data-submenu-icon]');
      btn.setAttribute('aria-expanded', 'false');
      if (!target) return;
      btn.addEventListener('click', () => {
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', (!expanded).toString());
        if (expanded) target.classList.add('hidden');
        else target.classList.remove('hidden');
        icon?.classList.toggle('rotate-180', !expanded);
      });
    });
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
        alert('Sorry, there was an error sending your message. Please try again or email hello@brandiblemg.com.');
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
   * Scroll reveal (variants + stagger)
   * =========================== */
  (function(){
    const els = Array.from(document.querySelectorAll('[data-reveal]'));
    if (!els.length) return;

    const onIntersect = (entries, obs) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const el = e.target;
          const baseDelay = parseInt(el.getAttribute('data-reveal-delay') || '0', 10);
          if (baseDelay) el.style.transitionDelay = (baseDelay / 1000) + 's';
          el.classList.add('reveal-show');
          if (el.getAttribute('data-reveal-repeat') !== 'true') {
            obs.unobserve(el);
          }
        }
      });
    };

    if ('IntersectionObserver' in window && matchMedia('(prefers-reduced-motion: no-preference)').matches) {
      const io = new IntersectionObserver(onIntersect, { rootMargin: '80px' });
      els.forEach(el => io.observe(el));
    } else {
      els.forEach(el => el.classList.add('reveal-show'));
    }
  })();

  /* ===========================
   * Supabase init (global)
   * =========================== */
  // Supabase config loaded from config.js (generated during build from environment variables)
  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_PUBLIC_KEY = window.SUPABASE_PUBLIC_KEY;

  // Validate that config was loaded
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) {
    console.error('Supabase configuration is missing. Ensure SUPABASE_URL and SUPABASE_PUBLIC_KEY are set in Netlify environment variables.');
  }

  function ensureSupabase(callback){
    if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) {
      console.error('Cannot initialize Supabase: configuration missing');
      return;
    }
    
    if (window.supabase && window.supabase.createClient){
      return callback(window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY));
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.async = true;
    script.onload = () => {
      if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) {
        console.error('Cannot initialize Supabase: configuration missing');
        return;
      }
      callback(window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY));
    };
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
      toast.className = 'toast-brandible';
      toast.classList.remove('hidden');
      // retrigger animation
      toast.classList.remove('toast-show');
      void toast.offsetWidth; // force reflow
      toast.classList.add('toast-show');
      setTimeout(() => { toast.classList.add('hidden'); toast.classList.remove('toast-show'); }, 3200);
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
    let bookedSlots = new Map(); // cache for booked slots

    const TIMES = ['10:00 AM','11:30 AM','1:00 PM','3:30 PM','5:00 PM'];
    
    // Helper: format date as YYYY-MM-DD
    function formatDate(d) {
      if (!d) return '';
      return d.toISOString().slice(0, 10);
    }
    
    // Helper: format date as YYYY-MM-DD (same as formatDate, keeping for compatibility)
    function toSupabaseDate(d) {
      return formatDate(d);
    }

    // Helper: check if date is in past
    function isPastDate(date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const checkDate = new Date(date);
      checkDate.setHours(0, 0, 0, 0);
      return checkDate < today;
    }
    
    // Helper: parse time string like "10:00 AM" to hour and minute
    function parseTimeStr(timeStr) {
      const [time, meridian] = timeStr.split(' ');
      const [hour, minute] = time.split(':').map(Number);
      let hour24 = hour;
      if (meridian === 'PM' && hour !== 12) hour24 += 12;
      else if (meridian === 'AM' && hour === 12) hour24 = 0;
      return { hour: hour24, minute };
    }
    
    // Helper: check if a time slot has passed today
    function isTimePassed(timeStr) {
      const now = new Date();
      const { hour, minute } = parseTimeStr(timeStr);
      const slotTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
      return slotTime < now;
    }

    function showToast(msg, ok){
      if (!toast) return;
      toast.textContent = msg;
      // Position toast at top of calendar box area (more visible)
      toast.className = 'absolute top-20 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-md bg-gradient-to-r from-green-500 to-emerald-600 text-white px-6 py-4 rounded-xl shadow-2xl font-semibold text-center pointer-events-none';
      toast.classList.remove('hidden');
      // Reset any previous inline styles
      toast.style.display = 'block';
      toast.style.opacity = '0';
      toast.style.transform = 'translate(-50%, -20px)';
      toast.style.visibility = 'visible';
      toast.style.pointerEvents = 'none';
      toast.style.position = 'absolute';
      toast.style.zIndex = '100';
      // Force reflow
      void toast.offsetWidth;
      setTimeout(() => {
        toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, 0)';
      }, 50);
      setTimeout(() => { 
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, -20px)';
        setTimeout(() => { 
          toast.classList.add('hidden'); 
          // Reset inline styles
          toast.style.opacity = '';
          toast.style.transform = '';
          toast.style.transition = '';
          toast.style.display = '';
          toast.style.visibility = '';
          toast.style.pointerEvents = '';
          toast.style.position = '';
          toast.style.zIndex = '';
        }, 400);
      }, 3500);
    }
    
    // Check if slot is booked (using local storage for now - can be enhanced later)
    function isSlotBooked(date, time) {
      if (!date || !time) return false;
      // Check local storage for booked slots (optional feature)
      try {
        const stored = localStorage.getItem('bookedSlots');
        if (stored) {
          const slots = JSON.parse(stored);
          const key = `${formatDate(date)}-${time}`;
          return slots.includes(key);
        }
      } catch (e) {
        // Ignore localStorage errors
      }
      return false;
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
      today.setHours(0, 0, 0, 0);
      for (let d=1; d<=daysInMonth; d++){
        const cell = document.createElement('button');
        cell.type='button';
        const thisDate = new Date(view.getFullYear(), view.getMonth(), d);
        const isToday = sameDay(thisDate, today);
        const isSelected = sameDay(thisDate, selectedDate);
        const isPast = thisDate < today;
        
        // Check if date is fully booked
        const dateKey = formatDate(thisDate);
        const allTimesBooked = TIMES.every(time => bookedSlots.has(`${dateKey}-${time}`));
        
        cell.className = 'text-sm py-2 rounded-lg text-center transition ' +
          (isSelected ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white' : 
          isPast || allTimesBooked ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 
          'hover:bg-gray-100 text-gray-700') +
          (isToday && !isSelected && !isPast ? ' ring-1 ring-blue-300' : '');
        cell.textContent = String(d);
        
        if (isPast) {
          cell.setAttribute('disabled', 'true');
          cell.title = 'Past date';
        } else if (allTimesBooked) {
          cell.setAttribute('disabled', 'true');
          cell.title = 'Fully booked';
        } else {
          cell.addEventListener('click', () => {
            selectedDate = thisDate;
            renderCalendar();
            renderTimes();
          });
        }
        grid.appendChild(cell);
      }
    }

    function renderTimes(){
      timesWrap.innerHTML = '';
      if (!selectedDate) return;
      
      // Check if selected date is today
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const selected = new Date(selectedDate);
      selected.setHours(0, 0, 0, 0);
      const isToday = selected.getTime() === today.getTime();
      
      TIMES.forEach(t => {
        const btn = document.createElement('button');
        btn.type='button';
        const isBooked = isSlotBooked(selectedDate, t);
        const hasPassed = isToday && isTimePassed(t);
        
        if (isBooked || hasPassed) {
          btn.className = 'px-3 py-2 rounded-xl border border-gray-200 bg-gray-100 text-gray-400 text-sm cursor-not-allowed opacity-50';
          btn.setAttribute('disabled', 'true');
          btn.title = isBooked ? 'Already booked' : 'This time has passed';
        } else {
          btn.className = 'px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm transition';
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
        }
        
        btn.textContent = t;
        timesWrap.appendChild(btn);
      });
    }

    prevBtn?.addEventListener('click', () => { view.setMonth(view.getMonth()-1); renderCalendar(); });
    nextBtn?.addEventListener('click', () => { view.setMonth(view.getMonth()+1); renderCalendar(); });
    
    // Handle "Change date or time" button
    const changeBtn = document.getElementById('bk-change-btn');
    if (changeBtn) {
      changeBtn.addEventListener('click', () => {
        // Check if previously selected slot is still valid
        if (selectedDate && selectedTime) {
          const dateStr = formatDate(selectedDate);
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const selected = new Date(selectedDate);
          selected.setHours(0, 0, 0, 0);
          const isToday = selected.getTime() === today.getTime();
          
          const isBooked = isSlotBooked(selectedDate, selectedTime);
          const hasPassed = isToday && isTimePassed(selectedTime);
          
          if (isBooked || hasPassed) {
            showToast('That slot is no longer available. Please select another.', false);
            // Clear the selection so user picks a new one
            selectedDate = null;
            selectedTime = null;
          }
        }
        
        // Switch back to Step 1
        step2.classList.add('opacity-0', 'translate-y-1');
        setTimeout(() => {
          step2.classList.add('hidden');
          step1.classList.remove('hidden');
          step1.classList.add('opacity-0', 'translate-y-1');
          setTimeout(() => {
            step1.classList.remove('opacity-0', 'translate-y-1');
          }, 10);
        }, 180);
        
        // Re-render calendar and times to show current state
        renderCalendar();
        renderTimes();
      });
    }

    // Set up Netlify form handling for booking form
    if (form) {
      // Make sure Netlify will parse it at build time
      if (!form.getAttribute('name')) form.setAttribute('name', 'consultation-booking');
      if (!form.querySelector('input[name="form-name"]')) {
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = 'form-name';
        hidden.value = form.getAttribute('name') || 'consultation-booking';
        form.prepend(hidden);
      }
      form.setAttribute('novalidate', 'novalidate');
      form.setAttribute('data-netlify', 'true');
    }

    // Helper function for encoding form data for Netlify
    const encode = (formData) => new URLSearchParams(formData).toString();

    renderCalendar();

    // Submit booking
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Validate honeypot
      const honeypot = form?.querySelector('input[name="website"]');
      if (honeypot && honeypot.value.trim() !== '') return;
      
      // Validate date/time selection
      if (!selectedDate || !selectedTime){ 
        showToast('Please select a date and time first.', false); 
        return; 
      }
      
      // Check if date is in past
      if (isPastDate(selectedDate)) {
        showToast('You can\'t select a past date. Please choose a future date.', false);
        return;
      }
      
      // Collect form values
      const name = document.getElementById('bk-name')?.value.trim();
      const email = document.getElementById('bk-email')?.value.trim();
      const phone = document.getElementById('bk-phone')?.value.trim();
      const message = document.getElementById('bk-message')?.value.trim();
      const service = document.getElementById('bk-service')?.value.trim();
      
      // Validate required fields
      if (!name || !email || !phone || !message || !service) { 
        showToast('Please complete all fields.', false); 
        return; 
      }
      
      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { 
        showToast('Enter a valid email address.', false); 
        return; 
      }
      
      // Validate phone (basic)
      if (!/^[\d\s\-()+]{7,}$/.test(phone)) {
        showToast('Enter a valid phone number.', false);
        return;
      }

      // Disable submit button
      submitBtn && (submitBtn.disabled = true);
      spin?.classList.remove('hidden');
      
      try {
        // Set the date and time hidden fields
        const dateInput = document.getElementById('bk-date');
        const timeInput = document.getElementById('bk-time');
        const dateStr = formatDate(selectedDate);
        
        if (dateInput && timeInput) {
          dateInput.value = dateStr;
          timeInput.value = selectedTime;
        }

        // Create FormData
        const fd = new FormData(form);
        
        // Ensure form-name is included
        if (!fd.get('form-name')) {
          fd.set('form-name', form.getAttribute('name') || 'consultation-booking');
        }

        // Submit to Netlify
        const response = await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: encode(fd),
        });

        if (!response.ok) {
          throw new Error('Failed to submit booking');
        }

        // Success! Store booked slot locally (optional)
        const key = `${dateStr}-${selectedTime}`;
        try {
          const stored = localStorage.getItem('bookedSlots');
          const slots = stored ? JSON.parse(stored) : [];
          if (!slots.includes(key)) {
            slots.push(key);
            localStorage.setItem('bookedSlots', JSON.stringify(slots));
          }
        } catch (e) {
          // Ignore localStorage errors
        }
        
        form.reset();
        
        // back to step 1
        step2.classList.add('opacity-0','translate-y-1');
        setTimeout(()=>{
          step2.classList.add('hidden');
          step1.classList.remove('hidden');
          step1.classList.remove('opacity-0');
          step1.style.opacity = '1';
          selectedDate = null; selectedTime = null; 
          renderCalendar(); 
          timesWrap.innerHTML='';
          // Show toast AFTER step1 is visible - add small delay to ensure rendering
          setTimeout(() => {
            showToast('✓ Thanks! Your consultation is booked successfully. Check your email for confirmation.', true);
          }, 100);
        }, 180);
      } catch (err){
        console.error(err);
        showToast('Sorry, something went wrong. Please try again or email us directly.', false);
      } finally {
        submitBtn && (submitBtn.disabled = false);
        spin?.classList.add('hidden');
      }
    });
  })();

  /* ===========================
   * Subtle hero parallax
   * =========================== */
  (function(){
    const hero = document.getElementById('hero');
    if (!hero || !matchMedia('(prefers-reduced-motion: no-preference)').matches) return;

    let ticking = false;
    const max = 10;

    function onScroll(){
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const rect = hero.getBoundingClientRect();
        const vh = window.innerHeight || 800;
        const p = Math.max(0, Math.min(1, 1 - (rect.top / vh)));
        const ty = Math.round((p - 0.5) * 2 * max);
        hero.style.transform = `translateY(${ty}px)`;
        hero.style.willChange = 'transform';
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  })();

  /* ===========================
   * Count-up on reveal
   * =========================== */
  (function(){
    const nums = Array.from(document.querySelectorAll('[data-count-to]'));
    if (!nums.length) return;

    function animate(el){
      const to = parseInt(el.getAttribute('data-count-to') || '0', 10);
      const dur = parseInt(el.getAttribute('data-count-duration') || '1200', 10);
      const start = performance.now();
      const fmt = new Intl.NumberFormat();

      function step(now){
        const t = Math.min(1, (now - start) / dur);
        const eased = (t<.5) ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
        el.textContent = fmt.format(Math.round(to * eased));
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    nums.forEach(el => {
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries, obs) => {
          entries.forEach(e => { if (e.isIntersecting) { animate(el); obs.unobserve(el); } });
        }, { rootMargin: '100px' });
        io.observe(el);
      } else {
        animate(el);
      }
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
(function initTypingAnimation() {
  const startTyping = (el) => {
    const words = JSON.parse(el.dataset.words || '[]');
    if (!words.length) return;

    let i = 0;
    let txt = '';
    let isDeleting = false;

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
  };

  const initTyped = () => {
    document.querySelectorAll('.typed').forEach(el => {
      const parent = el.closest('.reveal');
      
      if (parent) {
        const revealDelay = parseInt(parent.getAttribute('data-reveal-delay') || '0', 10);
        const transitionDuration = 600; // CSS transition duration (.6s)
        // Wait for delay + transition + small buffer
        const totalDelay = revealDelay + transitionDuration + 100;
        
        setTimeout(() => {
          startTyping(el);
        }, totalDelay);
      } else {
        // No reveal, start after short delay
        setTimeout(() => {
          startTyping(el);
        }, 200);
      }
    });
  };

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTyped);
  } else {
    // DOM already ready, run immediately
    initTyped();
  }
})();

/* ===========================
 * Character counters for textareas
 * =========================== */
document.addEventListener('DOMContentLoaded', () => {
  // Function to update character counter
  function updateCounter(textarea, counterId) {
    const counter = document.getElementById(counterId);
    if (!counter || !textarea) return;
    
    const current = textarea.value.length;
    const max = textarea.getAttribute('maxlength') || 0;
    
    counter.textContent = `${current} / ${max}`;
    
    // Change color when approaching limit
    if (current > max * 0.9) {
      counter.classList.remove('text-gray-500');
      counter.classList.add('text-red-600', 'font-semibold');
    } else {
      counter.classList.remove('text-red-600', 'font-semibold');
      counter.classList.add('text-gray-500');
    }
  }
  
  // Initialize counters for all textareas with maxlength
  const textareas = [
    { id: 'bk-message', counterId: 'bk-message-counter' },
    { id: 'userMessage', counterId: 'userMessage-counter' },
    { id: 'skills', counterId: 'skills-counter' },
    { id: 'whyJoin', counterId: 'whyJoin-counter' }
  ];
  
  textareas.forEach(({ id, counterId }) => {
    const textarea = document.getElementById(id);
    if (textarea && textarea.hasAttribute('maxlength')) {
      // Update on input
      textarea.addEventListener('input', () => updateCounter(textarea, counterId));
      // Update on load (in case of pre-filled values)
      updateCounter(textarea, counterId);
    }
  });
});
