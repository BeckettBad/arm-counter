const NS       = 'counter_';
const KEY_RESET = NS + 'last_reset';
const RESET_MS  = 24 * 60 * 60 * 1000;

const MODES = {
  lines: { label: 'lines', key: NS + 'lines', photo: NS + 'lines_photo' },
  bags:  { label: 'bags',  key: NS + 'bags',  photo: NS + 'bags_photo'  },
};

let mode = 'lines';

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  ensureReset();

  // Mode buttons
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
  });

  // Photo upload triggers
  const fileInput = document.getElementById('photo-input');
  document.getElementById('photo-wrapper').addEventListener('click', () => fileInput.click());
  document.getElementById('photo-wrapper').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });
  document.getElementById('upload-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleUpload);

  renderMode();
  startCountdown();
}

// ── Mode ──────────────────────────────────────────────────────────────────────
function switchMode(next) {
  mode = next;
  document.querySelectorAll('.mode-btn').forEach(btn => {
    const on = btn.dataset.mode === mode;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on);
  });
  renderMode();
}

function renderMode() {
  const cfg   = MODES[mode];
  const count = parseInt(localStorage.getItem(cfg.key) || '0', 10);
  const photo = localStorage.getItem(cfg.photo);

  document.getElementById('count-number').textContent = count;
  document.getElementById('count-label').textContent  = cfg.label;

  const img         = document.getElementById('display-photo');
  const placeholder = document.getElementById('photo-placeholder');

  if (photo) {
    img.src           = photo;
    img.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    // Fall back to cover.jpg; onerror in HTML handles missing file
    img.src           = 'cover.jpg';
    img.style.display = 'block';
    placeholder.style.display = 'none';
  }
}

// ── Upload = +1 ───────────────────────────────────────────────────────────────
function handleUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    const cfg   = MODES[mode];
    const count = parseInt(localStorage.getItem(cfg.key) || '0', 10) + 1;

    localStorage.setItem(cfg.key,   count);
    localStorage.setItem(cfg.photo, ev.target.result);

    // Update photo
    const img         = document.getElementById('display-photo');
    const placeholder = document.getElementById('photo-placeholder');
    img.src           = ev.target.result;
    img.style.display = 'block';
    placeholder.style.display = 'none';

    // Update count with pop
    const el = document.getElementById('count-number');
    el.textContent = count;
    el.classList.remove('pop');
    requestAnimationFrame(() => el.classList.add('pop'));

    // Flash photo
    const wrapper = document.getElementById('photo-wrapper');
    wrapper.classList.remove('photo-flash');
    requestAnimationFrame(() => wrapper.classList.add('photo-flash'));
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

// ── 24 h reset ────────────────────────────────────────────────────────────────
function ensureReset() {
  const last = parseInt(localStorage.getItem(KEY_RESET) || '0', 10);
  if (Date.now() - last > RESET_MS) {
    Object.keys(localStorage)
      .filter(k => k.startsWith(NS))
      .forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY_RESET, Date.now().toString());
  }
}

function startCountdown() {
  function tick() {
    const last      = parseInt(localStorage.getItem(KEY_RESET) || Date.now().toString(), 10);
    const remaining = Math.max(0, last + RESET_MS - Date.now());

    if (remaining === 0) {
      ensureReset();
      renderMode();
    }

    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    document.getElementById('countdown').textContent =
      String(h).padStart(2, '0') + ':' +
      String(m).padStart(2, '0') + ':' +
      String(s).padStart(2, '0');
  }
  tick();
  setInterval(tick, 1000);
}

document.addEventListener('DOMContentLoaded', init);
