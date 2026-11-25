// Viji's Beauty Salon: small, dependency-free scripts.
const SALON_WHATSAPP = '14082554800';
const SALON_SMS = '+14082554800';
// Booking requests are sent to the salon's booking API, which texts and emails the owner.
const BOOKING_API = 'https://api.vijisbeautysalon.com/api/book';

// Mobile menu
const menuBtn = document.querySelector('.menu');
const nav = document.getElementById('nav');
if (menuBtn && nav) {
  const setOpen = open => {
    nav.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  menuBtn.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  nav.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
}

document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

// ---- helpers shared by the booking and contact forms
const digits = v => v.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const prettyPhone = v => { const d = digits(v); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : v; };
const flag = (form, name, bad) => {
  const field = form.querySelector(`[data-err="${name}"]`)?.closest('.field');
  if (field) field.classList.toggle('invalid', bad);
  return bad;
};
const sendLinks = (text, wa = SALON_WHATSAPP, sms = SALON_SMS) => ({
  wa: `https://wa.me/${wa}?text=${encodeURIComponent(text)}`,
  // iOS uses "&body=", Android "?body="; "?&body=" works on both.
  sms: `sms:${sms}?&body=${encodeURIComponent(text)}`,
});
const todayLA = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date()); // YYYY-MM-DD
const nowMinutesLA = () => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
  return +p.find(x => x.type === 'hour').value * 60 + +p.find(x => x.type === 'minute').value;
};

// ---- Booking
const book = document.getElementById('book-form');
if (book) {
  const date = document.getElementById('f-date');
  const time = document.getElementById('f-time');
  const service = document.getElementById('f-service');
  const confirm = document.getElementById('confirm');
  const minDate = todayLA();
  date.min = minDate;
  const max = new Date(); max.setDate(max.getDate() + 90);
  date.max = max.toISOString().slice(0, 10);

  // Preselect a service from ?service=slug (links on the services page and blog)
  const wanted = new URLSearchParams(location.search).get('service');
  if (wanted && service.querySelector(`option[value="${CSS.escape(wanted)}"]`)) service.value = wanted;

  // Grey out times that have already passed today
  const refreshTimes = () => {
    const isToday = date.value === minDate;
    const now = nowMinutesLA();
    [...time.options].forEach(o => {
      if (!o.value) return;
      const [h, m] = o.value.split(':').map(Number);
      o.disabled = isToday && h * 60 + m <= now + 30;
    });
    if (time.selectedOptions[0]?.disabled) time.value = '';
  };
  date.addEventListener('change', refreshTimes);

  const label = sel => sel.selectedOptions[0]?.textContent.trim() || '';
  const niceDate = v => new Date(`${v}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  book.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(book);
    refreshTimes();
    const bad = [
      flag(book, 'service', !f.get('service')),
      flag(book, 'date', !f.get('date') || f.get('date') < minDate),
      flag(book, 'time', !f.get('time') || time.selectedOptions[0]?.disabled),
      flag(book, 'name', String(f.get('name')).trim().length < 2),
      flag(book, 'phone', digits(String(f.get('phone'))).length !== 10),
    ];
    if (bad.some(Boolean)) {
      book.querySelector('.invalid input, .invalid select')?.focus();
      return;
    }
    const req = {
      service: label(service), date: niceDate(f.get('date')), time: label(time),
      name: String(f.get('name')).trim(), phone: prettyPhone(String(f.get('phone'))), notes: String(f.get('notes') || '').trim(),
    };
    const btn = document.getElementById('book-submit');
    const err = document.getElementById('book-error');
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    fetch(BOOKING_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req, service: req.service.replace(' · ', ' - '), turnstileToken: f.get('cf-turnstile-response') || '' }),
    })
      .then(r => r.json().then(body => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error || 'Something went wrong.');
        const summary = document.getElementById('summary');
        summary.innerHTML = '';
        [['Service', req.service], ['When', `${req.date}, ${req.time}`], ['Name', req.name], ['Phone', req.phone], ...(req.notes ? [['Notes', req.notes]] : [])]
          .forEach(([k, v]) => {
            const row = document.createElement('div');
            const dt = document.createElement('dt'); dt.textContent = k;
            const dd = document.createElement('dd'); dd.textContent = v;
            row.append(dt, dd);
            summary.append(row);
          });
        try { localStorage.setItem('vijis-last-request', JSON.stringify({ ...req, savedAt: new Date().toISOString() })); } catch (_) { /* storage may be blocked */ }
        book.hidden = true;
        confirm.hidden = false;
        confirm.focus();
        confirm.scrollIntoView({ block: 'start' });
      })
      .catch(e => {
        err.textContent = `${e.message} You can also call us at (408) 255-4800.`;
        err.hidden = false;
        window.turnstile?.reset();
      })
      .finally(() => { btn.disabled = false; btn.textContent = 'Request appointment'; });
  });

  book.addEventListener('input', e => e.target.closest('.field')?.classList.remove('invalid'));
}

// ---- Contact form (sends through WhatsApp or SMS; no server needed)
const msg = document.getElementById('msg-form');
if (msg) {
  msg.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(msg);
    const bad = [
      flag(msg, 'name', String(f.get('name')).trim().length < 2),
      flag(msg, 'phone', digits(String(f.get('phone'))).length !== 10),
      flag(msg, 'message', String(f.get('message')).trim().length < 3),
    ];
    if (bad.some(Boolean)) { msg.querySelector('.invalid input, .invalid textarea')?.focus(); return; }
    const text = `Hi Viji’s Beauty Salon, this is ${String(f.get('name')).trim()} (${prettyPhone(String(f.get('phone')))}).\n\n${String(f.get('message')).trim()}`;
    const links = sendLinks(text);
    document.getElementById('msg-wa').href = links.wa;
    document.getElementById('msg-sms').href = links.sms;
    document.getElementById('msg-done').hidden = false;
    document.getElementById('msg-wa').focus();
  });
  msg.addEventListener('input', e => e.target.closest('.field')?.classList.remove('invalid'));
}

// ---- Gallery filters
const tiles = document.getElementById('tiles');
if (tiles) {
  const empty = document.getElementById('empty');
  document.querySelectorAll('.filter').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.filter;
    document.querySelectorAll('.filter').forEach(b => { const on = b === btn; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
    let shown = 0;
    tiles.querySelectorAll('.tile').forEach(t => {
      const show = key === 'all' || t.dataset.tags.split(' ').includes(key);
      t.hidden = !show; shown += show;
    });
    empty.hidden = shown > 0;
  }));
}
