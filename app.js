import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js';
import {
  getFirestore, doc, collection,
  onSnapshot, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, getDocs, runTransaction,
} from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            'AIzaSyC55QDZz-V2b-ERSRXYsfDxQiml-zxLXIw',
  authDomain:        'linecounter-5511d.firebaseapp.com',
  projectId:         'linecounter-5511d',
  storageBucket:     'linecounter-5511d.firebasestorage.app',
  messagingSenderId: '1052947378797',
  appId:             '1:1052947378797:web:185050a4d31ea4696d0564',
};

const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

const RESET_MS    = 24 * 60 * 60 * 1000;
const RAGE_MAX    = 10;
const MAX_HISTORY = 15;
const MAX_PX      = 600;

const RAGE_LEVELS = [
  { min: 0,  label: 'CALM',            color: '#7c4dff' },
  { min: 3,  label: 'HEATING UP',      color: '#ff9800' },
  { min: 5,  label: 'KEEP IT BUMPIN',  color: '#ff6d00' },
  { min: 8,  label: 'RACKED',          color: '#f44336' },
  { min: 10, label: 'POSEIDON STATUS', color: '#ff1744' },
];

let pendingPhoto    = null;
let lightboxEntryId = null;
let sessionStart    = 0;
let historyCache    = [];
let unsubUploads    = null;

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
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

  document.getElementById('lightbox-count-plus').addEventListener('click',  () => adjustLightboxCount(1));
  document.getElementById('lightbox-count-minus').addEventListener('click', () => adjustLightboxCount(-1));

  document.getElementById('reset-btn').addEventListener('click', resetAll);

  listenToSession();
  startCountdown();
}

// ── Session listener ──────────────────────────────────────────────────────────
function listenToSession() {
  onSnapshot(doc(db, 'meta', 'session'), snap => {
    const newStart = snap.data()?.startTime || 0;
    const expired  = newStart > 0 && Date.now() - newStart > RESET_MS;

    if (expired) {
      setDoc(doc(db, 'meta', 'session'), { startTime: 0 });
      return;
    }

    if (newStart !== sessionStart) {
      sessionStart = newStart;
      subscribeToUploads(sessionStart);
    }
  });
}

// ── Uploads real-time listener ────────────────────────────────────────────────
function subscribeToUploads(sid) {
  if (unsubUploads) unsubUploads();
  historyCache = [];

  if (!sid) {
    renderAll();
    return;
  }

  const q = query(collection(db, 'uploads'), where('sessionId', '==', sid));
  unsubUploads = onSnapshot(q, snap => {
    historyCache = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => b.time - a.time)
      .slice(0, MAX_HISTORY);
    renderAll();
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderAll() {
  const total = calcTotal(historyCache);
  document.getElementById('count-number').textContent = total;
  updateRageMeter(total);
  updateCurrentPhoto(historyCache);
  renderHistory(historyCache);
}

function calcTotal(hist) {
  return hist.reduce((sum, e) => sum + (e.entryCount ?? 1), 0);
}

function updateCurrentPhoto(hist) {
  const img = document.getElementById('display-photo');
  const ph  = document.getElementById('photo-placeholder');
  if (hist.length) {
    img.src           = hist[0].photo;
    img.style.display = 'block';
    ph.style.display  = 'none';
  } else {
    img.src           = 'cover.jpg';
    img.style.display = 'block';
    ph.style.display  = 'none';
  }
}

// ── Image compression ─────────────────────────────────────────────────────────
function compressImage(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale  = Math.min(1, MAX_PX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
    };
    img.src = dataUrl;
  });
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

async function commitUpload(name) {
  document.getElementById('name-modal').style.display = 'none';
  if (!pendingPhoto) return;

  const rawPhoto = pendingPhoto;
  pendingPhoto = null;

  const photo = await compressImage(rawPhoto);

  // Immediate visual feedback before Firestore round-trip
  const previewTotal = calcTotal(historyCache) + 1;
  const countEl = document.getElementById('count-number');
  countEl.textContent = previewTotal;
  countEl.classList.remove('pop');
  requestAnimationFrame(() => countEl.classList.add('pop'));
  updateRageMeter(previewTotal);

  const imgEl = document.getElementById('display-photo');
  imgEl.src           = photo;
  imgEl.style.display = 'block';
  document.getElementById('photo-placeholder').style.display = 'none';

  const wrapper = document.getElementById('photo-wrapper');
  wrapper.classList.remove('photo-flash');
  requestAnimationFrame(() => wrapper.classList.add('photo-flash'));

  const sid = await ensureSessionActive();

  await addDoc(collection(db, 'uploads'), {
    sessionId:  sid,
    photo,
    entryCount: 1,
    name:       name || '',
    time:       Date.now(),
  });
  // onSnapshot fires → historyCache updates → renderAll() shows authoritative state
}

async function ensureSessionActive() {
  const sessionRef = doc(db, 'meta', 'session');
  return runTransaction(db, async tx => {
    const snap     = await tx.get(sessionRef);
    const existing = snap.data()?.startTime || 0;
    if (existing && Date.now() - existing <= RESET_MS) return existing;
    const newStart = Date.now();
    tx.set(sessionRef, { startTime: newStart });
    return newStart;
  });
}

// ── Rage meter ────────────────────────────────────────────────────────────────
function updateRageMeter(count) {
  const fill  = document.getElementById('rage-fill');
  const label = document.getElementById('rage-label');
  const frac  = document.getElementById('rage-fraction');
  const level = [...RAGE_LEVELS].reverse().find(l => count >= l.min) || RAGE_LEVELS[0];
  const pct   = Math.min(count / RAGE_MAX, 1);

  fill.style.width      = (pct * 100) + '%';
  fill.style.background = `linear-gradient(to right, ${level.color}99, ${level.color})`;
  fill.style.boxShadow  = count > 0 ? `0 0 10px ${level.color}88` : 'none';
  label.textContent     = level.label;
  label.style.color     = level.color;
  frac.textContent      = count + ' / ' + RAGE_MAX;
  fill.classList.toggle('raging', count >= 10);
}

// ── History ───────────────────────────────────────────────────────────────────
function renderHistory(hist) {
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

    const img = document.createElement('img');
    img.src = entry.photo;
    img.alt = entry.name || 'Upload';

    const badge = document.createElement('span');
    badge.className   = 'history-badge';
    badge.textContent = entry.entryCount ?? 1;

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
  lightboxEntryId = entry.id;
  document.getElementById('lightbox-img').src = entry.photo;
  renderLightboxEntry(entry);
  document.getElementById('lightbox').style.display = 'flex';
}

function renderLightboxEntry(entry) {
  const who = entry.name ? entry.name + '  ·  ' : '';
  document.getElementById('lightbox-info').textContent = who + relativeTime(entry.time);
  document.getElementById('lightbox-count-val').textContent = entry.entryCount ?? 1;
}

async function adjustLightboxCount(delta) {
  if (!lightboxEntryId) return;
  const entry = historyCache.find(e => e.id === lightboxEntryId);
  if (!entry) return;

  const newCount   = Math.max(0, (entry.entryCount ?? 1) + delta);
  entry.entryCount = newCount;
  renderLightboxEntry(entry);
  renderAll();

  await updateDoc(doc(db, 'uploads', lightboxEntryId), { entryCount: newCount });
}

function closeLightbox() {
  lightboxEntryId = null;
  document.getElementById('lightbox').style.display = 'none';
  document.getElementById('lightbox-img').src = '';
}

// ── Reset ─────────────────────────────────────────────────────────────────────
async function resetAll() {
  if (!confirm('Clear all history and reset the timer?')) return;

  if (sessionStart) {
    const snap = await getDocs(
      query(collection(db, 'uploads'), where('sessionId', '==', sessionStart))
    );
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  }

  await setDoc(doc(db, 'meta', 'session'), { startTime: 0 });
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function startCountdown() {
  function tick() {
    if (!sessionStart) {
      document.getElementById('countdown').textContent = 'Upload to start';
      return;
    }
    const remaining = Math.max(0, sessionStart + RESET_MS - Date.now());
    if (remaining === 0) {
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
