const NS = 'arm_counter_';
const RESET_MS = 24 * 60 * 60 * 1000;

let armIndex = 0;
let fingerCount = 0;

function init() {
  const params = new URLSearchParams(location.search);
  armIndex = parseInt(params.get('arm') || '1', 10);

  // Redirect home if this arm no longer exists
  const totalArms = parseInt(localStorage.getItem(NS + 'arms') || '0', 10);
  if (armIndex < 1 || armIndex > totalArms) {
    location.href = 'index.html';
    return;
  }

  document.getElementById('page-title').textContent = 'Arm ' + armIndex + ' Fingers';
  document.title = 'Arm ' + armIndex + ' — Fingers';

  fingerCount = parseInt(localStorage.getItem(NS + 'fingers_' + armIndex) || '0', 10);

  const savedPhoto = localStorage.getItem(NS + 'finger_photo_' + armIndex);
  if (savedPhoto) showPhoto(savedPhoto);

  renderCount(false);

  document.getElementById('finger-plus').addEventListener('click', () => changeCount(1));
  document.getElementById('finger-minus').addEventListener('click', () => changeCount(-1));

  const wrapper = document.getElementById('finger-photo-wrapper');
  const fileInput = document.getElementById('finger-photo-input');
  wrapper.addEventListener('click', () => fileInput.click());
  wrapper.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
  fileInput.addEventListener('change', handlePhotoUpload);
}

function changeCount(delta) {
  const next = Math.max(0, fingerCount + delta);
  if (next === fingerCount) return;

  const increased = next > fingerCount;
  fingerCount = next;
  localStorage.setItem(NS + 'fingers_' + armIndex, fingerCount);

  renderCount(true);

  if (increased) promptPhotoUpload();
}

function renderCount(animate) {
  const el = document.getElementById('finger-count');
  el.textContent = fingerCount;

  if (animate) {
    el.classList.remove('pop');
    requestAnimationFrame(() => el.classList.add('pop'));
  }
}

function promptPhotoUpload() {
  const wrapper = document.getElementById('finger-photo-wrapper');
  wrapper.style.borderColor = 'var(--accent2)';
  wrapper.style.boxShadow = '0 0 32px rgba(224,64,251,0.65)';

  setTimeout(() => {
    wrapper.style.borderColor = '';
    wrapper.style.boxShadow = '';
  }, 3000);
}

function handlePhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    const data = ev.target.result;
    localStorage.setItem(NS + 'finger_photo_' + armIndex, data);
    showPhoto(data);

    const wrapper = document.getElementById('finger-photo-wrapper');
    wrapper.style.borderColor = '';
    wrapper.style.boxShadow = '';
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function showPhoto(dataUrl) {
  const img = document.getElementById('finger-photo');
  const placeholder = document.getElementById('finger-placeholder');
  img.src = dataUrl;
  img.style.display = 'block';
  placeholder.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', init);
