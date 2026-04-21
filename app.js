const NS          = 'counter_';
const KEY_RESET   = NS + 'last_reset';
const RESET_MS    = 24 * 60 * 60 * 1000;
const RAGE_MAX    = 10;
const MAX_HISTORY = 15; // cap so base64 photos don't blow localStorage

const MODES = {
  lines: { label: 'lines', histKey: NS + 'lines_hist' },
  bags:  { label: 'bags',  histKey: NS + 'bags_hist'  },
};

const RAGE_LEVELS = [
  { min: 0,  label: 'CALM',            color: '#7c4dff' },
  { min: 3,  label: 'HEATING UP',      color: '#ff9800' },
  { min: 5,  label: 'KEEP IT BUMPIN',  color: '#ff6d00' },
  { min: 8,  label: 'RACKED',          color: '#f44336' },
  { min: 10, label: 'POSEIDON STATUS', color: '#ff1744' },
];

let mode        = 'lines';
let pendingPhoto = null;

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  ensureReset();

  document.querySelectorAll('.mode-btn').forEach(btn =>
    btn.addEventListener('click', () => switchMode(btn.dataset.mode))
  );

  const fileInput = document.getElementById('photo-input');
  document.getElementById('upload-btn').addEventListener('click',  () => fileInput.click());
  document.getElementById('photo-wrapper').addEventListener('click', () => fileInput.click());
  document.getElementById('photo-wrapper').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });
  fileInput.addEventListener('change', handleUpload);

  document.getElementById('name-confirm').addEventListener('click', confirmName);
  document.getElementById('name-skip').addEventListener('click', () => commitUpload(''));
  document.getElementById('name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmName();
  });

  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-backdrop').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

  document.getElementById('reset-btn').addEventListener('click', resetAll);

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
  const hist  = loadHistory();
  const total = calcTotal(hist);
  document.getElementById('count-number').textContent = total;
  document.getElementById('count-label').textContent  = MODES[mode].label;
  updateRageMeter(total);
  updateCurrentPhoto(hist);
  renderHistory(hist);
}

// ── Count ─────────────────────────────────────────────────────────────────────
// Total is always derived from history — never stored separately
function calcTotal(hist) {
  return hist.reduce((sum, e) => sum + (e.entryCount || 1), 0);
}

// ── Current photo ─────────────────────────────────────────────────────────────
function updateCurrentPhoto(hist) {
  const img = document.getElementById('display-photo');
  const ph  = document.getElementById('photo-placeholder');
  if (hist && hist.length) {
    img.src           = hist[0].photo;
    img.style.display = 'block';
    ph.style.display  = 'none';
  } else {
    img.src           = 'cover.jpg';
    img.style.display = 'block';
    ph.style.display  = 'none';
  }
}

// ── Upload flow ───────────────────────────────────────────────────────────────
function handleUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    pendingPhoto = ev.target.result;
    document.getElementById('name-modal').style.display = 'flex';
    const input = document.getElementById('name-input');
    input.value = '';
    setTimeout(() => input.focus(), 50);
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function confirmName() {
  commitUpload(document.getElementById('name-input').value.trim());
}

function commitUpload(name) {
  document.getElementById('name-modal').style.display = 'none';
  if (!pendingPhoto) return;

  const photo = pendingPhoto;
  pendingPhoto = null;

  // Start 24h window on first upload of a new cycle
  if (!localStorage.getItem(KEY_RESET)) {
    localStorage.setItem(KEY_RESET, Date.now().toString());
  }

  const hist = loadHistory();
  hist.unshift({
    id:         Date.now().toString() + Math.random().toString(36).slice(2),
    photo,
    entryCount: 1,
    name:       name || '',
    time:       Date.now(),
  });

  // Hard cap — oldest entry dropped to protect localStorage quota
  if (hist.length > MAX_HISTORY) hist.length = MAX_HISTORY;

  const total = calcTotal(hist);

  // ── UI updates happen BEFORE storage so they always run ──
  const el = document.getElementById('count-number');
  el.textContent = total;
  el.classList.remove('pop');
  requestAnimationFrame(() => el.classList.add('pop'));

  updateRageMeter(total);
  updateCurrentPhoto(hist);

  const wrapper = document.getElementById('photo-wrapper');
  wrapper.classList.remove('photo-flash');
  requestAnimationFrame(() => wrapper.classList.add('photo-flash'));

  renderHistory(hist);

  // ── Persist (storage errors won't break the UI) ──
  try {
    saveHistory(hist);
  } catch (_) {
    // Storage full — drop oldest and retry once
    hist.pop();
    try { saveHistory(hist); } catch (_2) {}
  }
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
  fill.classList.toggle('raging', count >= 10);
}

// ── History ───────────────────────────────────────────────────────────────────
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(MODES[mode].histKey) || '[]'); }
  catch { return []; }
}

function saveHistory(hist) {
  localStorage.setItem(MODES[mode].histKey, JSON.stringify(hist));
}

function renderHistory(hist) {
  hist = hist || loadHistory();
  const strip = document.getElementById('history-strip');
  strip.innerHTML = '';

  if (!hist.length) {
    const empty = document.createElement('span');
    empty.className   = 'history-empty';
    empty.textContent = 'No uploads yet';
    strip.appendChild(empty);
    return;
  }

  hist.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');

    const thumb = document.createElement('div');
    thumb.className = 'history-thumb';

    const img   = document.createElement('img');
    img.src = entry.photo;
    img.alt = entry.name || 'Upload';

    const badge = document.createElement('span');
    badge.className   = 'history-badge';
    badge.textContent = entry.entryCount || 1;

    thumb.appendChild(img);
    thumb.appendChild(badge);
    item.appendChild(thumb);

    if (entry.name) {
      const nameEl = document.createElement('span');
      nameEl.className   = 'history-name';
      nameEl.textContent = entry.name;
      item.appendChild(nameEl);
    }

    const timeEl = document.createElement('span');
    timeEl.className   = 'history-time';
    timeEl.textContent = relativeTime(entry.time);
    item.appendChild(timeEl);

    const open = () => openLightbox(entry);
    item.addEventListener('click', open);
    item.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });

    strip.appendChild(item);
  });
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const m    = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function openLightbox(entry) {
  document.getElementById('lightbox-img').src = entry.photo;
  const who = entry.name ? entry.name + '  ·  ' : '';
  document.getElementById('lightbox-info').textContent =
    who + 'Count: ' + (entry.entryCount || 1) + '  ·  ' + relativeTime(entry.time);
  document.getElementById('lightbox').style.display = 'flex';
}

function closeLightbox() {
  document.getElementById('lightbox').style.display = 'none';
  document.getElementById('lightbox-img').src = '';
}

// ── Reset ─────────────────────────────────────────────────────────────────────
function resetAll() {
  if (!confirm('Clear all history and reset the timer?')) return;
  Object.keys(localStorage)
    .filter(k => k.startsWith(NS))
    .forEach(k => localStorage.removeItem(k));
  renderAll();
}

// ── 24h window ────────────────────────────────────────────────────────────────
function ensureReset() {
  const last = parseInt(localStorage.getItem(KEY_RESET) || '0', 10);
  if (last > 0 && Date.now() - last > RESET_MS) {
    Object.keys(localStorage)
      .filter(k => k.startsWith(NS))
      .forEach(k => localStorage.removeItem(k));
  }
}

function startCountdown() {
  function tick() {
    const last = parseInt(localStorage.getItem(KEY_RESET) || '0', 10);

    if (!last) {
      document.getElementById('countdown').textContent = 'Upload to start';
      return;
    }

    const remaining = Math.max(0, last + RESET_MS - Date.now());
    if (remaining === 0) {
      ensureReset();
      renderAll();
      document.getElementById('countdown').textContent = 'Upload to start';
      return;
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
