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

  // Admin PIN check — a rotated PIN (S.config.adminHash) overrides the built-in default
  if (hash === (S.config.adminHash || ADMIN_HASH)) {
    startSession({userId:'admin', userName:(S.config.adminName || 'Andres Toro'), role:'admin', closerRate:0});
    return;
  }

  // Team member PIN check
  const member = S.team.find(m => m.pinHash === hash && String(m.active) !== 'false');
  if (member) {
    startSession({
      userId:       member.id,
      userName:     member.name,
      role:         member.role || 'closer',
      closerRate:   parseFloat(member.closerRate || 0),
      providerRate: parseFloat(member.providerRate || 0),
    });
    return;
  }

  // Failed attempt
  failedAttempts++;
  updatePinDots('error');
  if (failedAttempts >= MAX_FAIL_ATTEMPTS) {
    pinLockedUntil = Date.now() + LOCKOUT_MS;
    const el = document.getElementById('login-lockout');
    if (el) { el.style.display = 'block'; el.textContent = 'Too many attempts. Locked out for 15 minutes.'; }
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
      if (hint) hint.textContent = 'Enter your PIN to sign in';
    }, LOCKOUT_MS);
  } else {
    const hint = document.getElementById('login-hint');
    if (hint) hint.textContent = 'Incorrect PIN. ' + (MAX_FAIL_ATTEMPTS - failedAttempts) + ' attempts remaining.';
    setTimeout(() => {
      updatePinDots();
      const h = document.getElementById('login-hint');
      if (h) h.textContent = 'Enter your PIN to sign in';
    }, 900);
  }
}

// ── Session ────────────────────────────────────────────────
// Tamper-evidence for the per-tab session token. Keyed by the per-install
// crmSecret. This stops casual sessionStorage editing (e.g. a team member
// trying to flip role:'admin' from DevTools). It is NOT a substitute for
// server-side session validation: anyone who also reads crmSecret from
// localStorage could forge a token. True fix = validate identity/role in
// the Apps Script backend on every request.
function sessionSig(user) {
  return sha256(JSON.stringify(user) + '|' + (S.config.crmSecret || ''));
}

function startSession(user) {
  S.session = user;
  sessionStorage.setItem('aiv-session', JSON.stringify(user));
  sessionSig(user).then(sig => { try { sessionStorage.setItem('aiv-session-sig', sig); } catch(e) {} });
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

// Restore a same-tab session on refresh, with tamper-evidence + authoritative
// role re-derivation. A stored token's role/rates are NOT trusted for team
// members — they are re-read from the synced S.team record, so editing the
// stored token cannot grant access the team data doesn't actually allow.
async function restoreSession() {
  const saved = sessionStorage.getItem('aiv-session');
  const clear = () => { sessionStorage.removeItem('aiv-session'); sessionStorage.removeItem('aiv-session-sig'); updatePinDots(); };
  if (!saved) { updatePinDots(); return; }
  let sess;
  try { sess = JSON.parse(saved); } catch(e) { clear(); return; }

  // Reject tampered or legacy-unsigned tokens — force a fresh PIN login.
  const expected = await sessionSig(sess);
  if ((sessionStorage.getItem('aiv-session-sig') || '') !== expected) { clear(); return; }

  if (sess.userId === 'admin' && sess.role === 'admin') { startSession(sess); return; }

  // Team member: authoritative role/rates come from S.team, not the token.
  const member = S.team.find(m => m.id === sess.userId && String(m.active) !== 'false');
  if (member) {
    startSession({
      userId:       member.id,
      userName:     member.name,
      role:         member.role || 'closer',
      closerRate:   parseFloat(member.closerRate   || 0),
      providerRate: parseFloat(member.providerRate || 0),
    });
  } else { clear(); }
}

// Reject trivially guessable 4-digit PINs (all-same, simple sequences).
function isWeakPin(pin) {
  if (!/^\d{4}$/.test(pin)) return false; // length/format handled elsewhere
  if (/^(\d)\1{3}$/.test(pin)) return true;                 // 0000, 1111, ...
  const asc = '0123456789', desc = '9876543210';
  if (asc.includes(pin) || desc.includes(pin)) return true; // 1234, 4321, ...
  return false;
}

function logout() {
  S.session = null;
  sessionStorage.removeItem('aiv-session');
  sessionStorage.removeItem('aiv-session-sig');
  if (sessionTimer)        clearTimeout(sessionTimer);
  if (sessionWarningTimer) clearTimeout(sessionWarningTimer);
  const wb = document.getElementById('session-warning-banner');
  if (wb) wb.style.display = 'none';
  pinBuffer = '';
  failedAttempts = 0;
  updatePinDots();
  const hint = document.getElementById('login-hint');
  if (hint) hint.textContent = 'Enter your PIN to sign in';
  const lockout = document.getElementById('login-lockout');
  if (lockout) lockout.style.display = 'none';
  document.getElementById('login-overlay').classList.remove('hidden');
  if (S.demoMode) {
    S.demoMode    = false;
    S.leads = []; S.calls = []; S.commissions = []; S.team = [];
    S.scripts = []; S.smsTemplates = []; S.scheduledJobs = []; S.auditLog = [];
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
    if (S.session) { toast('Session ended due to inactivity.', 'warning'); logout(); }
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
  const user    = {userId:'demo-admin', userName:'Demo User', role:'admin', closerRate:12};
  S.session     = user;
  // Demo is in-memory only — don't persist a session token (a refresh returns
  // cleanly to the PIN screen rather than restoring an empty, purged demo).
  failedAttempts = 0;
  document.getElementById('login-overlay').classList.add('hidden');
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
  const toolsLabel = document.getElementById('sb-tools-label');
  if (toolsLabel) {
    const hasTools = allowed.some(s => ['setup','scraper','import'].includes(s));
    toolsLabel.classList.toggle('role-hidden', !hasTools);
  }
}

// The admin's display name (shown in the sidebar and used as the {agent} name in
// outbound email/SMS, so messages sign with a real person, not "Admin").
function setAdminName(name) {
  name = String(name || '').trim();
  S.config.adminName = name;
  if (S.session && S.session.userId === 'admin') {
    S.session.userName = name || 'Andres Toro';
    updateSidebarUser(S.session);
  }
  saveLocal();
  if (name) toast('Name updated to "' + name + '".', 'success');
}

function updateSidebarUser(user) {
  const row = document.getElementById('sb-user-row');
  if (row) row.style.display = 'flex';
  const av = document.getElementById('sb-avatar');
  if (av) av.textContent = user.userName.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0,2);
  const nm = document.getElementById('sb-user-name');
  if (nm) nm.textContent = user.userName;
  const rl = document.getElementById('sb-user-role');
  const labels = {admin:'Administrator', closer:'Closer', solo:'Solo Operator'};
  if (rl) rl.textContent = labels[user.role] || user.role;
}
