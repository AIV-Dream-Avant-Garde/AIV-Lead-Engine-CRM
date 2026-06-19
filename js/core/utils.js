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
  try {
    const d = new Date(iso);
    // Show the year only when it isn't the current year, so a financial ledger
    // isn't ambiguous across year boundaries ("Jun 19" vs "Jun 19, 2025").
    const opts = {month:'short', day:'2-digit'};
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('en-US', opts);
  } catch(e) { return iso || '--'; }
}

function fmtT(iso) {
  try { return new Date(iso).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}); }
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

// Phone dedup key: last 10 digits of the numeric-only string (mirror of the
// backend phoneKey in Code.gs). Collapses +57/+1/spacing/leading-zero so the
// same number isn't added twice in a different format. '' when < 10 digits.
function phoneKey(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}

function toast(msg, type, duration) {
  type     = type     || 'info';
  duration = duration || 3500;
  // Stack toasts in a single container so simultaneous messages don't overlap.
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column-reverse;gap:8px;pointer-events:none';
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className   = 'toast toast-' + type;
  // Override the .toast fixed positioning so the container lays them out.
  el.style.position = 'relative'; el.style.bottom = 'auto'; el.style.right = 'auto'; el.style.pointerEvents = 'auto';
  el.textContent = msg;
  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  setTimeout(() => {
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 280);
  }, duration);
}
