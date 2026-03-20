/* ── AUTH: PIN login, sessions, role-based sidebar ───────── */

var pinBuffer      = '';
var failedAttempts = 0;
var pinLockedUntil = 0;
var sessionTimer        = null;
var sessionWarningTimer = null;

// ── SHA-256 via WebCrypto ──────────────────────────────────
async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── PIN numpad ─────────────────────────────────────────────
function pinKey(k) {
  if (Date.now() < pinLockedUntil) return;
  if (pinBuffer.length >= 4) return;
  pinBuffer += k;
  updatePinDots();
  if (pinBuffer.length === 4) setTimeout(tryLogin, 120);
}

function pinDel() {
  if (pinBuffer.length > 0) { pinBuffer = pinBuffer.slice(0,-1); updatePinDots(); }
}

function updatePinDots(state) {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('pd' + i);
    if (!dot) continue;
    dot.className = 'pin-dot';
    if (state === 'error')         dot.classList.add('error');
    else if (i < pinBuffer.length) dot.classList.add('filled');
  }
}

async function tryLogin() {
  if (Date.now() < pinLockedUntil) { pinBuffer = ''; updatePinDots(); return; }
  const entered = pinBuffer;
  pinBuffer = '';

  // Demo shortcut — admin only, undocumented
  if (entered === '0809') { startDemo(); return; }

  const hash = await sha256(entered);

  // Admin PIN check
  if (hash === ADMIN_HASH) {
    startSession({userId:'admin', userName:'Admin', role:'admin', providerRate:0, closerRate:0});
    return;
  }

  // Team member PIN check
  const member = S.team.find(m => m.pinHash === hash && String(m.active) !== 'false');
  if (member) {
    startSession({
      userId:       member.id,
      userName:     member.name,
      role:         member.role || 'closer',
      providerRate: parseFloat(member.providerRate || 0),
      closerRate:   parseFloat(member.closerRate   || 0),
    });
    return;
  }

  // Failed attempt
  failedAttempts++;
  updatePinDots('error');
  if (failedAttempts >= MAX_FAIL_ATTEMPTS) {
    pinLockedUntil = Date.now() + LOCKOUT_MS;
    const el = document.getElementById('login-lockout');
    if (el) { el.style.display = 'block'; el.textContent = 'Demasiados intentos. Bloqueado 15 minutos.'; }
    const np = document.querySelector('.numpad');
    if (np) np.style.opacity = '0.35';
    setTimeout(() => {
      failedAttempts = 0; pinLockedUntil = 0;
      const el2 = document.getElementById('login-lockout');
      if (el2) el2.style.display = 'none';
      const np2 = document.querySelector('.numpad');
      if (np2) np2.style.opacity = '1';
      updatePinDots();
      const hint = document.getElementById('login-hint');
      if (hint) hint.textContent = 'Ingresa tu PIN para acceder';
    }, LOCKOUT_MS);
  } else {
    const hint = document.getElementById('login-hint');
    if (hint) hint.textContent = 'PIN incorrecto. ' + (MAX_FAIL_ATTEMPTS - failedAttempts) + ' intentos restantes.';
    setTimeout(() => {
      updatePinDots();
      const h = document.getElementById('login-hint');
      if (h) h.textContent = 'Ingresa tu PIN para acceder';
    }, 900);
  }
}

// ── Session ────────────────────────────────────────────────
function startSession(user) {
  S.session = user;
  sessionStorage.setItem('aiv-session', JSON.stringify(user));
  failedAttempts = 0;
  document.getElementById('login-overlay').classList.add('hidden');
  applySidebarForRole(user.role);
  updateSidebarUser(user);
  applyAdminNavVisibility();
  resetSessionTimer();
  syncNow().then(() => {
    navigate('leads');
    renderAll();
  });
  // Deferred: show admin nav after sync data loads
  setTimeout(() => applyAdminNavVisibility(), 1200);
}

function logout() {
  S.session = null;
  sessionStorage.removeItem('aiv-session');
  if (sessionTimer)        clearTimeout(sessionTimer);
  if (sessionWarningTimer) clearTimeout(sessionWarningTimer);
  const wb = document.getElementById('session-warning-banner');
  if (wb) wb.style.display = 'none';
  pinBuffer = '';
  failedAttempts = 0;
  updatePinDots();
  const hint = document.getElementById('login-hint');
  if (hint) hint.textContent = 'Ingresa tu PIN para acceder';
  const lockout = document.getElementById('login-lockout');
  if (lockout) lockout.style.display = 'none';
  document.getElementById('login-overlay').classList.remove('hidden');
  if (S.demoMode) {
    S.demoMode    = false;
    S.leads = []; S.calls = []; S.commissions = []; S.team = [];
    S.scripts = []; S.smsTemplates = []; S.scheduledJobs = []; S.auditLog = [];
    const db = document.getElementById('demo-banner');
    if (db) db.style.display = 'none';
    // Restore real data from localStorage so next login sees correct state
    loadLocal();
  }
}

function resetSessionTimer() {
  if (sessionTimer)        clearTimeout(sessionTimer);
  if (sessionWarningTimer) clearTimeout(sessionWarningTimer);
  const wb = document.getElementById('session-warning-banner');
  if (wb) wb.style.display = 'none';

  sessionWarningTimer = setTimeout(() => {
    if (!S.session) return;
    const banner = document.getElementById('session-warning-banner');
    if (banner) { banner.style.display = 'flex'; startSessionCountdown(2 * 60); }
  }, SESSION_TIMEOUT_MS - 2 * 60 * 1000);

  sessionTimer = setTimeout(() => {
    if (S.session) { toast('Sesión cerrada por inactividad.', 'warning'); logout(); }
  }, SESSION_TIMEOUT_MS);
}

function startSessionCountdown(seconds) {
  const el = document.getElementById('session-countdown');
  const interval = setInterval(() => {
    seconds--;
    if (!el || !S.session) { clearInterval(interval); return; }
    const m = Math.floor(seconds / 60), s = seconds % 60;
    el.textContent = m + ':' + String(s).padStart(2, '0');
    if (seconds <= 0) clearInterval(interval);
  }, 1000);
}

function extendSession() {
  resetSessionTimer();
}

// Reset timer on any user interaction
document.addEventListener('click',   () => { if (S.session) resetSessionTimer(); });
document.addEventListener('keydown', e => {
  if (!S.session) {
    if (e.key >= '0' && e.key <= '9') pinKey(e.key);
    if (e.key === 'Backspace') pinDel();
  } else {
    resetSessionTimer();
    if (e.key === 'Escape') {
      if (S.curLeadId) closeModal();
      if (document.getElementById('deal-overlay')?.classList.contains('open'))
        document.getElementById('deal-overlay').classList.remove('open');
    }
  }
});

// ── Demo mode ──────────────────────────────────────────────
function startDemo() {
  S.demoMode    = true;
  S.leads       = DEMO_DATA.leads.map(l => ({...l}));
  S.calls       = DEMO_DATA.calls.map(c => ({...c}));
  S.team        = DEMO_DATA.team.map(m => ({...m}));
  S.commissions = DEMO_DATA.commissions.map(c => ({...c}));
  const user    = {userId:'demo-admin', userName:'Demo Usuario', role:'admin', providerRate:3, closerRate:12};
  S.session     = user;
  sessionStorage.setItem('aiv-session', JSON.stringify(user));
  failedAttempts = 0;
  document.getElementById('login-overlay').classList.add('hidden');
  document.getElementById('demo-banner').style.display = 'flex';
  resetSessionTimer();
  applySidebarForRole('admin');
  updateSidebarUser(user);
  applyAdminNavVisibility();
  populateFilters();
  navigate('leads');
  renderAll();
}

// ── Role-based sidebar ─────────────────────────────────────
function applySidebarForRole(role) {
  const allowed = ROLE_VISIBLE[role] || ROLE_VISIBLE.closer;
  document.querySelectorAll('.nav-item[data-sec]').forEach(el => {
    el.classList.toggle('role-hidden', !allowed.includes(el.dataset.sec));
  });
}

function updateSidebarUser(user) {
  const row = document.getElementById('sb-user-row');
  if (row) row.style.display = 'flex';
  const av = document.getElementById('sb-avatar');
  if (av) av.textContent = user.userName.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0,2);
  const nm = document.getElementById('sb-user-name');
  if (nm) nm.textContent = user.userName;
  const rl = document.getElementById('sb-user-role');
  const labels = {admin:'Administrador', provider:'Proveedor', closer:'Closer', solo:'Solo Operator'};
  if (rl) rl.textContent = labels[user.role] || user.role;
}
