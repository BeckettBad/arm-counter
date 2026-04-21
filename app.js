const NS          = 'arm_counter_';
const KEY_ARMS    = NS + 'arms';
const KEY_RESET   = NS + 'last_reset';
const KEY_POOL    = NS + 'photo_pool';   // JSON array of base64 strings
const RESET_MS    = 24 * 60 * 60 * 1000;
const MAX_ARMS    = 20;

let armCount = 0;

// ── Rage config ───────────────────────────────────────────────────────────────
const RAGE_LEVELS = [
  { max: 0,  label: 'CALM',         color: '#7c4dff' },
  { max: 4,  label: 'HEATING UP',   color: '#ff9800' },
  { max: 8,  label: 'FURIOUS',      color: '#ff6d00' },
  { max: 12, label: 'RAGING',       color: '#f44336' },
  { max: 16, label: 'MAXIMUM RAGE', color: '#ff1744' },
  { max: 20, label: '☠ UNSTOPPABLE',color: '#ff1744' },
];

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  ensureReset();
  armCount = parseInt(localStorage.getItem(KEY_ARMS) || '0', 10);

  rotatePhoto();
  updatePoolBadge();
  renderCount(false);
  updateRageMeter();
  renderArmsList();
  startCountdown();

  document.getElementById('btn-plus').addEventListener('click', () => changeCount(1));
  document.getElementById('btn-minus').addEventListener('click', () => changeCount(-1));
  document.getElementById('arm-slider').addEventListener('input', e => {
    const next = parseInt(e.target.value, 10);
    if (next !== armCount) changeCount(next - armCount);
  });

  const wrapper   = document.getElementById('photo-wrapper');
  const fileInput = document.getElementById('photo-input');
  wrapper.addEventListener('click', () => fileInput.click());
  wrapper.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });
  fileInput.addEventListener('change', handlePhotoUpload);

  document.getElementById('pool-clear').addEventListener('click', clearPool);
}

// ── Count ─────────────────────────────────────────────────────────────────────
function changeCount(delta) {
  const next = Math.max(0, Math.min(MAX_ARMS, armCount + delta));
  if (next === armCount) return;
  armCount = next;
  localStorage.setItem(KEY_ARMS, armCount);
  renderCount(true);
  updateRageMeter();
  renderArmsList();
  rotatePhoto();           // show a new random photo from the pool on each change
}

function renderCount(animate) {
  const el = document.getElementById('arm-count');
  el.textContent = armCount;
  document.getElementById('arm-slider').value = armCount;
  if (animate) {
    el.classList.remove('pop');
    requestAnimationFrame(() => el.classList.add('pop'));
  }
}

// ── Rage meter ────────────────────────────────────────────────────────────────
function updateRageMeter() {
  const pct   = armCount / MAX_ARMS;
  const fill  = document.getElementById('rage-fill');
  const label = document.getElementById('rage-label');
  const frac  = document.getElementById('rage-fraction');

  fill.style.width = (pct * 100) + '%';

  const level = RAGE_LEVELS.find(l => armCount <= l.max) || RAGE_LEVELS[RAGE_LEVELS.length - 1];
  const color = level.color;

  fill.style.background  = `linear-gradient(to right, ${color}bb, ${color})`;
  fill.style.boxShadow   = armCount > 0 ? `0 0 12px ${color}88` : 'none';
  label.textContent      = level.label;
  label.style.color      = color;
  frac.textContent       = armCount + ' / ' + MAX_ARMS;

  if (armCount >= 16) {
    fill.classList.add('raging');
  } else {
    fill.classList.remove('raging');
  }
}

// ── Arm list ──────────────────────────────────────────────────────────────────
function renderArmsList() {
  const list = document.getElementById('arms-list');
  list.innerHTML = '';
  if (armCount === 0) return;

  const lbl = document.createElement('p');
  lbl.className   = 'arms-list-label';
  lbl.textContent = 'Count fingers per arm';
  list.appendChild(lbl);

  for (let i = 1; i <= armCount; i++) {
    const fc = parseInt(localStorage.getItem(NS + 'fingers_' + i) || '0', 10);
    const a  = document.createElement('a');
    a.href      = 'fingers.html?arm=' + i;
    a.className = 'arm-btn';

    const badge = document.createElement('span');
    badge.className   = 'finger-badge';
    badge.textContent = fc + ' ' + (fc === 1 ? 'finger' : 'fingers');

    a.appendChild(document.createTextNode('Arm ' + i));
    a.appendChild(badge);
    list.appendChild(a);
  }
}

// ── Photo pool ────────────────────────────────────────────────────────────────
function loadPool() {
  try { return JSON.parse(localStorage.getItem(KEY_POOL) || '[]'); }
  catch { return []; }
}

function savePool(pool) {
  localStorage.setItem(KEY_POOL, JSON.stringify(pool));
}

function handlePhotoUpload(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  let loaded = 0;
  const pool = loadPool();

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      pool.push(ev.target.result);
      loaded++;
      if (loaded === files.length) {
        savePool(pool);
        updatePoolBadge();
        rotatePhoto();
      }
    };
    reader.readAsDataURL(file);
  });

  e.target.value = '';
}

function rotatePhoto() {
  const pool = loadPool();
  if (!pool.length) return;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  showPhoto(pick);
}

function showPhoto(dataUrl) {
  const img         = document.getElementById('arm-photo');
  const placeholder = document.getElementById('photo-placeholder');
  img.src           = dataUrl;
  img.style.display = 'block';
  placeholder.style.display = 'none';

  // Subtle bump animation on photo change
  const wrapper = document.getElementById('photo-wrapper');
  wrapper.classList.remove('photo-bump');
  requestAnimationFrame(() => wrapper.classList.add('photo-bump'));
}

function updatePoolBadge() {
  const pool  = loadPool();
  const badge = document.getElementById('pool-badge');
  const clear = document.getElementById('pool-clear');
  if (pool.length > 0) {
    badge.textContent  = pool.length + ' photo' + (pool.length > 1 ? 's' : '') + ' in pool';
    badge.style.display = 'inline';
    clear.style.display = 'inline';
  } else {
    badge.style.display = 'none';
    clear.style.display = 'none';
  }
}

function clearPool() {
  if (!confirm('Clear all photos from the pool?')) return;
  savePool([]);
  updatePoolBadge();
  const img         = document.getElementById('arm-photo');
  img.style.display = 'none';
  document.getElementById('photo-placeholder').style.display = 'flex';
}

// ── 24 h reset ────────────────────────────────────────────────────────────────
function ensureReset() {
  const last = parseInt(localStorage.getItem(KEY_RESET) || '0', 10);
  if (Date.now() - last > RESET_MS) {
    Object.keys(localStorage)
      .filter(k => k.startsWith(NS) && k !== KEY_POOL) // keep photo pool across resets
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
      armCount = 0;
      renderCount(false);
      updateRageMeter();
      renderArmsList();
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
