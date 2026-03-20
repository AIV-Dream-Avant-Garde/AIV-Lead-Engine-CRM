/* ── CORE: localStorage persistence ──────────────────────── */

function saveLocal() {
  try {
    localStorage.setItem('aiv-cfg',   JSON.stringify(S.config));
    localStorage.setItem('aiv-leads', JSON.stringify(S.leads));
    localStorage.setItem('aiv-calls', JSON.stringify(S.calls));
    S.dirty.clear();
    checkStorage();
  } catch(e) {
    checkStorage();
    alert(
      'Error al guardar: almacenamiento lleno.\n\n' +
      '1. Sincroniza con Google Sheets\n' +
      '2. Exporta backup CSV\n\n' +
      'Datos en memoria seguros hasta cerrar la pestaña.'
    );
  }
}

function loadLocal() {
  try { S.config = {...S.config, ...JSON.parse(localStorage.getItem('aiv-cfg')  || '{}')}; } catch(e) {}
  try { S.leads  = JSON.parse(localStorage.getItem('aiv-leads') || '[]'); } catch(e) {}
  try { S.calls  = JSON.parse(localStorage.getItem('aiv-calls') || '[]'); } catch(e) {}
  try { S.team   = JSON.parse(localStorage.getItem('aiv-team')  || '[]'); } catch(e) {}
  try { S.commissions = JSON.parse(localStorage.getItem('aiv-comm')    || '[]'); } catch(e) {}
  try { S.scripts      = JSON.parse(localStorage.getItem('aiv-scripts') || '[]'); } catch(e) {}
  try { S.smsTemplates = JSON.parse(localStorage.getItem('aiv-sms-tpl') || '[]'); } catch(e) {}
  try { S.scheduledJobs = JSON.parse(localStorage.getItem('aiv-sched-jobs') || '[]'); } catch(e) {}
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
