const NS        = 'counter_';
const KEY_RESET = NS + 'last_reset';
const RESET_MS  = 24 * 60 * 60 * 1000;
const RAGE_MAX  = 30;

const MODES = {
  lines: { label: 'lines', key: NS + 'lines', histKey: NS + 'lines_hist', photoKey: NS + 'lines_photo' },
  bags:  { label: 'bags',  key: NS + 'bags',  histKey: NS + 'bags_hist',  photoKey: NS + 'bags_photo'  },
};

const RAGE_LEVELS = [
  { min: 0,  label: 'CALM',          color: '#7c4dff' },
  { min: 5,  label: 'HEATING UP',    color: '#ff9800' },
  { min: 10, label: 'FURIOUS',       color: '#ff6d00' },
  { min: 18, label: 'RAGING',        color: '#f44336' },
  { min: 24, label: 'MAXIMUM RAGE',  color: '#ff1744' },
];

let mode = 'lines';

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  ensureReset();

  document.querySelectorAll('.mode-btn').forEach(btn =>
    btn.addEventListener('click', () => switchMode(btn.dataset.mode))
  );

  const fileInput = document.getElementById('photo-input');
  document.getElementById('upload-btn').addEventListener('click', () => fileInput.click());
  document.getElementById('photo-wrapper').addEventListener('click', () => fileInput.click());
  document.getElementById('photo-wrapper').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });
  fileInput.addEventListener('change', handleUpload);

  // Lightbox close
  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-backdrop').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

  renderAll();
  startCountdown();
}

// ── Mode ──────────────────────────────────────────────────────────────────────
function switchMode(next) {
  mode = next;
  document.querySelectorAll('.mode-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.mode === mode)
  );
  renderAll();
}

function renderAll() {
  const cfg   = MODES[mode];
  const count = getCount();
  document.getElementById('count-number').textContent = count;
  document.getElementById('count-label').textContent  = cfg.label;
  updateRageMeter(count);
  renderHistory();
  updateCurrentPhoto();
}

function updateCurrentPhoto() {
  const saved = localStorage.getItem(MODES[mode].photoKey);
  const img   = document.getElementById('display-photo');
  const ph    = document.getElementById('photo-placeholder');
  if (saved) {
    img.src           = saved;
    img.style.display = 'block';
    ph.style.display  = 'none';
  } else {
    img.src           = 'cover.jpg';
    img.style.display = 'block';
    ph.style.display  = 'none';
  }
}

// ── Count helpers ─────────────────────────────────────────────────────────────
function getCount() {
  return parseInt(localStorage.getItem(MODES[mode].key) || '0', 10);
}

function setCount(n) {
  localStorage.setItem(MODES[mode].key, n);
}

// ── Upload = +1 ───────────────────────────────────────────────────────────────
function handleUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    const photo = ev.target.result;
    const count = getCount() + 1;
    setCount(count);

    // Save current photo and history entry
    localStorage.setItem(MODES[mode].photoKey, photo);
    const hist = loadHistory();
    hist.unshift({ photo, count, time: Date.now() });
    saveHistory(hist);

    // Update photo circle
    const img = document.getElementById('display-photo');
    img.src           = photo;
    img.style.display = 'block';
    document.getElementById('photo-placeholder').style.display = 'none';

    // Flash animation
    const wrapper = document.getElementById('photo-wrapper');
    wrapper.classList.remove('photo-flash');
    requestAnimationFrame(() => wrapper.classList.add('photo-flash'));

    // Animate count
    const el = document.getElementById('count-number');
    el.textContent = count;
    el.classList.remove('pop');
    requestAnimationFrame(() => el.classList.add('pop'));

    updateRageMeter(count);
    renderHistory();
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

// ── Rage meter ────────────────────────────────────────────────────────────────
function updateRageMeter(count) {
  const pct   = Math.min(count / RAGE_MAX, 1);
  const fill  = document.getElementById('rage-fill');
  const label = document.getElementById('rage-label');
  const frac  = document.getElementById('rage-fraction');

  const level = [...RAGE_LEVELS].reverse().find(l => count >= l.min) || RAGE_LEVELS[0];

  fill.style.width      = (pct * 100) + '%';
  fill.style.background = `linear-gradient(to right, ${level.color}99, ${level.color})`;
  fill.style.boxShadow  = count > 0 ? `0 0 10px ${level.color}88` : 'none';
  label.textContent     = level.label;
  label.style.color     = level.color;
  frac.textContent      = count + ' / ' + RAGE_MAX;
  fill.classList.toggle('raging', count >= 24);
}

// ── History ───────────────────────────────────────────────────────────────────
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(MODES[mode].histKey) || '[]'); }
  catch { return []; }
}

function saveHistory(hist) {
  localStorage.setItem(MODES[mode].histKey, JSON.stringify(hist));
}

function renderHistory() {
  const scroll = document.getElementById('history-strip');
  const hist   = loadHistory();

  scroll.innerHTML = '';

  if (!hist.length) {
    scroll.appendChild(Object.assign(document.createElement('span'), {
      className: 'history-empty',
      textContent: 'No uploads yet',
    }));
    return;
  }

  hist.forEach(entry => {
    const item  = document.createElement('div');
    item.className = 'history-item';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');

    const thumb = document.createElement('div');
    thumb.className = 'history-thumb';

    const img = document.createElement('img');
    img.src = entry.photo;
    img.alt = 'Upload at count ' + entry.count;

    const badge = document.createElement('span');
    badge.className   = 'history-count-badge';
    badge.textContent = entry.count;

    thumb.appendChild(img);
    thumb.appendChild(badge);

    const timeEl = document.createElement('span');
    timeEl.className   = 'history-time';
    timeEl.textContent = relativeTime(entry.time);

    item.appendChild(thumb);
    item.appendChild(timeEl);

    const open = () => openLightbox(entry);
    item.addEventListener('click', open);
    item.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });

    scroll.appendChild(item);
  });
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function openLightbox(entry) {
  document.getElementById('lightbox-img').src       = entry.photo;
  document.getElementById('lightbox-info').textContent =
    'Count: ' + entry.count + '  ·  ' + relativeTime(entry.time);
  document.getElementById('lightbox').style.display = 'flex';
}

function closeLightbox() {
  document.getElementById('lightbox').style.display = 'none';
  document.getElementById('lightbox-img').src = '';
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
    if (remaining === 0) { ensureReset(); renderAll(); }

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
