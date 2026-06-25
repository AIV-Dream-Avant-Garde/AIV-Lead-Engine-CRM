/* ── CORE: localStorage persistence ──────────────────────── */

function saveLocal() {
  try {
    localStorage.setItem('aiv-cfg',        JSON.stringify(S.config));
    localStorage.setItem('aiv-leads',      JSON.stringify(S.leads.map(l => ({...l, _synced: l._synced === true}))));
    localStorage.setItem('aiv-calls',      JSON.stringify(S.calls));
    localStorage.setItem('aiv-interactions', JSON.stringify(S.interactions || []));
    localStorage.setItem('aiv-sequences',    JSON.stringify(S.sequences || []));
    localStorage.setItem('aiv-team',       JSON.stringify(S.team));
    localStorage.setItem('aiv-comm',       JSON.stringify(S.commissions));
    localStorage.setItem('aiv-scripts',    JSON.stringify(S.scripts     || []));
    localStorage.setItem('aiv-sms-tpl',   JSON.stringify(S.smsTemplates || []));
    localStorage.setItem('aiv-sched-jobs', JSON.stringify(S.scheduledJobs || []));
    localStorage.setItem('aiv-campaigns', JSON.stringify(S.stateCampaigns || []));
    localStorage.setItem('aiv-engagements', JSON.stringify(S.engagements || []));
    // Persist the dirty set so unsynced edits survive a reload. Cleared per-lead
    // only on confirmed sync success (syncNow) — NOT on every local save, or
    // failed edits would be silently dropped.
    localStorage.setItem('aiv-dirty', JSON.stringify([...S.dirty]));
    localStorage.setItem('aiv-deleted', JSON.stringify([...S.deletedIds]));
    checkStorage();
  } catch(e) {
    checkStorage();
    toast('Storage full — sync with Sheets or export CSV. Your data is safe in memory.', 'error', 7000);
  }
}

function loadLocal() {
  try { S.config = {...S.config, ...JSON.parse(localStorage.getItem('aiv-cfg')  || '{}')}; } catch(e) {}
  // Whether the server admin gate is live (set on last sync) — read at login time
  // to decide if the old in-browser admin PIN path is still allowed.
  S.config.adminGateEnabled = localStorage.getItem('aiv-admin-gate') === '1';
  try { S.leads  = JSON.parse(localStorage.getItem('aiv-leads') || '[]').map(l => ({...l, country: l.country || DEFAULT_COUNTRY, _synced: l._synced === true})); } catch(e) {}
  try { S.calls  = JSON.parse(localStorage.getItem('aiv-calls') || '[]'); } catch(e) {}
  try { S.interactions = JSON.parse(localStorage.getItem('aiv-interactions') || '[]'); } catch(e) { S.interactions = []; }
  try { S.sequences    = JSON.parse(localStorage.getItem('aiv-sequences')    || '[]'); } catch(e) { S.sequences = []; }
  try { S.team   = JSON.parse(localStorage.getItem('aiv-team')  || '[]'); } catch(e) {}
  try { S.commissions = JSON.parse(localStorage.getItem('aiv-comm')    || '[]'); } catch(e) {}
  try { S.scripts      = JSON.parse(localStorage.getItem('aiv-scripts') || '[]'); } catch(e) {}
  try { S.smsTemplates = JSON.parse(localStorage.getItem('aiv-sms-tpl') || '[]'); } catch(e) {}
  try { S.scheduledJobs = JSON.parse(localStorage.getItem('aiv-sched-jobs') || '[]'); } catch(e) {}
  try { S.stateCampaigns = JSON.parse(localStorage.getItem('aiv-campaigns') || '[]'); } catch(e) { S.stateCampaigns = []; }
  try { S.engagements    = JSON.parse(localStorage.getItem('aiv-engagements') || '[]'); } catch(e) { S.engagements = []; }
  try { S.dirty = new Set(JSON.parse(localStorage.getItem('aiv-dirty') || '[]')); } catch(e) { S.dirty = new Set(); }
  try { S.deletedIds = new Set(JSON.parse(localStorage.getItem('aiv-deleted') || '[]')); } catch(e) { S.deletedIds = new Set(); }
  purgeDemoData();
}

function purgeDemoData() {
  const isDemo = id => !id || id.startsWith('demo-') || id.startsWith('dl-') || id.startsWith('dc-') || id.startsWith('dcomm-');
  const before = S.leads.length + S.team.length + S.commissions.length + S.calls.length;
  S.leads       = S.leads.filter(l => !isDemo(l.id));
  S.team        = S.team.filter(m => !isDemo(m.id));
  S.commissions = S.commissions.filter(c => !isDemo(c.id));
  S.calls       = S.calls.filter(c => !isDemo(c.id));
  const after = S.leads.length + S.team.length + S.commissions.length + S.calls.length;
  if (before !== after) {
    try {
      localStorage.setItem('aiv-leads', JSON.stringify(S.leads.map(l => ({...l, _synced: l._synced === true}))));
      localStorage.setItem('aiv-team',  JSON.stringify(S.team));
      localStorage.setItem('aiv-comm',  JSON.stringify(S.commissions));
      localStorage.setItem('aiv-calls', JSON.stringify(S.calls));
    } catch(e) {}
  }
}

function checkStorage() {
  const used = lsUsed(), pct = used / LS_LIMIT;
  const fill = document.getElementById('storage-fill');
  const txt  = document.getElementById('storage-txt');
  const warn = document.getElementById('storage-warn');
  if (!fill) return;
  const dp = Math.min(Math.round(pct * 100), 100);
  fill.style.width      = dp + '%';
  fill.style.background = pct >= .92 ? 'var(--red)' : pct >= .75 ? 'var(--amber)' : 'var(--pos)';
  txt.textContent       = (used / 1024 / 1024).toFixed(2) + ' MB / ~5 MB (' + dp + '%)';
  if (pct >= .75) {
    warn.style.display = 'block';
    warn.innerHTML = '<div class="card ' + (pct >= .92 ? 'warn' : 'amber-card') + '" style="margin-bottom:0">' +
      '<div class="card-sub"><strong>Storage at ' + dp + '%.</strong> Sync with Sheets regularly.</div></div>';
  } else {
    warn.style.display = 'none';
  }
}
