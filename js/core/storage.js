/* ── CORE: localStorage persistence ──────────────────────── */

function saveLocal() {
  try {
    localStorage.setItem('aiv-cfg',        JSON.stringify(S.config));
    localStorage.setItem('aiv-leads',      JSON.stringify(S.leads.map(l => ({...l, _synced: l._synced === true}))));
    localStorage.setItem('aiv-calls',      JSON.stringify(S.calls));
    localStorage.setItem('aiv-team',       JSON.stringify(S.team));
    localStorage.setItem('aiv-comm',       JSON.stringify(S.commissions));
    localStorage.setItem('aiv-scripts',    JSON.stringify(S.scripts     || []));
    localStorage.setItem('aiv-sms-tpl',   JSON.stringify(S.smsTemplates || []));
    localStorage.setItem('aiv-sched-jobs', JSON.stringify(S.scheduledJobs || []));
    S.dirty.clear();
    checkStorage();
  } catch(e) {
    checkStorage();
    toast('Almacenamiento lleno — sincroniza con Sheets o exporta CSV. Datos seguros en memoria.', 'error', 7000);
  }
}

function loadLocal() {
  try { S.config = {...S.config, ...JSON.parse(localStorage.getItem('aiv-cfg')  || '{}')}; } catch(e) {}
  try { S.leads  = JSON.parse(localStorage.getItem('aiv-leads') || '[]').map(l => ({...l, _synced: l._synced === true})); } catch(e) {}
  try { S.calls  = JSON.parse(localStorage.getItem('aiv-calls') || '[]'); } catch(e) {}
  try { S.team   = JSON.parse(localStorage.getItem('aiv-team')  || '[]'); } catch(e) {}
  try { S.commissions = JSON.parse(localStorage.getItem('aiv-comm')    || '[]'); } catch(e) {}
  try { S.scripts      = JSON.parse(localStorage.getItem('aiv-scripts') || '[]'); } catch(e) {}
  try { S.smsTemplates = JSON.parse(localStorage.getItem('aiv-sms-tpl') || '[]'); } catch(e) {}
  try { S.scheduledJobs = JSON.parse(localStorage.getItem('aiv-sched-jobs') || '[]'); } catch(e) {}
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
      '<div class="card-sub"><strong>Almacenamiento al ' + dp + '%.</strong> Sincroniza con Sheets regularmente.</div></div>';
  } else {
    warn.style.display = 'none';
  }
}
