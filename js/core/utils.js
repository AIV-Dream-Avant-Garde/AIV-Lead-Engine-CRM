/* ── CORE: Utility functions ──────────────────────────────── */

function uid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}

function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtD(iso) {
  try { return new Date(iso).toLocaleDateString('es-CO',{day:'2-digit',month:'short'}); }
  catch(e) { return iso || '--'; }
}

function fmtT(iso) {
  try { return new Date(iso).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}); }
  catch(e) { return ''; }
}

function fmtSec(s) {
  const n = parseInt(s) || 0;
  return Math.floor(n / 60) + ':' + (n % 60 < 10 ? '0' : '') + n % 60;
}

function serverNow() {
  return new Date(Date.now() + S.serverTimeOffset);
}

function lsUsed() {
  let t = 0;
  for (const k of Object.keys(localStorage)) t += (localStorage.getItem(k) || '').length * 2;
  return t;
}

function toast(msg, type, duration) {
  type     = type     || 'info';
  duration = duration || 3500;
  const el = document.createElement('div');
  el.className   = 'toast toast-' + type;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  setTimeout(() => {
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 280);
  }, duration);
}
