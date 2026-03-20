/* ── CORE: Google Apps Script API layer & sync ────────────── */

async function sheetsCall(params) {
  if (S.demoMode) return Promise.resolve({success:true, leads:[], calls:[], team:[], commissions:[], scripts:[], serverTime: new Date().toISOString()});
  const url = S.config.scriptUrl;
  if (!url) return null;
  try {
    if (GET_ACTIONS.has(params.action)) {
      const r = await fetch(url + '?' + new URLSearchParams({...params, _s: S.config.crmSecret}).toString(), {redirect:'follow'});
      return await r.json();
    }
    const r = await fetch(url + '?action=' + params.action, {
      method:'POST', redirect:'follow',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({...params, _secret: S.config.crmSecret}),
    });
    return await r.json();
  } catch(e) {
    return {success:false, error:e.message};
  }
}

function setSyncUI(state, text) {
  document.getElementById('sync-dot').className = 'sync-dot' + (state ? ' ' + state : '');
  document.getElementById('sync-text').textContent = text;
}

function setProgress(pct) {
  const p = document.getElementById('sync-progress');
  const b = document.getElementById('sync-bar');
  p.classList.toggle('visible', pct > 0 && pct < 100);
  b.style.width = pct + '%';
}

function setLastSynced() {
  const el = document.getElementById('tb-sync-time');
  if (el) el.textContent = 'Sync ' + new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
}

async function syncNow() {
  if (!S.config.scriptUrl) { setSyncUI('','Conecta Apps Script en Setup'); return; }
  if (S.isSyncing) return; // prevent concurrent syncs
  S.isSyncing = true;
  const syncBtn = document.getElementById('sync-btn');
  if (syncBtn) { syncBtn.disabled = true; syncBtn.setAttribute('aria-busy','true'); }
  setSyncUI('syncing','Sincronizando...');
  setProgress(5);

  // Push dirty/unsynced leads in batches of 20
  const toSync = S.leads.filter(l => S.dirty.has(l.id) || !l._synced);
  for (let i = 0; i < toSync.length; i += 20) {
    await sheetsCall({action:'push', data: toSync.slice(i, i + 20)});
    setProgress(5 + Math.round((i + Math.min(20, toSync.length - i)) / Math.max(toSync.length, 1) * 30));
  }
  // Update already-synced dirty leads individually
  for (const l of S.leads.filter(x => S.dirty.has(x.id) && x._synced)) {
    await sheetsCall({action:'update', ...l});
  }
  setProgress(40);

  // Pull from server
  const res = await sheetsCall({action:'pull', since: S.lastSyncTimestamp || ''});
  setProgress(85);

  if (res && res.success) {
    if (res.serverTime) S.serverTimeOffset = new Date(res.serverTime) - Date.now();
    // Merge incoming leads
    const sm = {};
    (res.leads || []).forEach(l => { if (l.id) sm[l.id] = l; });
    S.leads.forEach(l => { if (sm[l.id]) { Object.assign(l, sm[l.id]); l._synced = true; } });
    (res.leads || []).forEach(l => {
      if (l.id && !S.leads.find(x => x.id === l.id)) {
        S.leads.push({...l, _synced:true,
          notes:       Array.isArray(l.notes)       ? l.notes       : [],
          workHistory: Array.isArray(l.workHistory) ? l.workHistory : [],
        });
      }
    });
    if (!res.isIncremental && res.calls) S.calls = res.calls;
    if (res.team)        { S.team        = res.team;        localStorage.setItem('aiv-team', JSON.stringify(S.team)); }
    if (res.commissions) { S.commissions = res.commissions; localStorage.setItem('aiv-comm', JSON.stringify(S.commissions)); }
    if (res.scripts)     { S.scripts     = res.scripts;     localStorage.setItem('aiv-scripts', JSON.stringify(S.scripts)); }
    S.lastSyncTimestamp = new Date().toISOString();
    saveLocal();
    setSyncUI('ok','Sincronizado');
    setLastSynced();
    setTimeout(showSignalBanner, 200);
  } else {
    setSyncUI('error', res?.error ? 'Error: ' + String(res.error).slice(0,30) : 'Error de conexion');
  }

  setProgress(100);
  setTimeout(() => setProgress(0), 600);
  S.isSyncing = false;
  if (syncBtn) { syncBtn.disabled = false; syncBtn.removeAttribute('aria-busy'); }
  renderAll();
}

async function testConn() {
  const url = document.getElementById('cfg-url')?.value?.trim();
  if (!url) { toast('Ingresa la URL primero.', 'error'); return; }
  setSyncUI('syncing','Probando...');
  try {
    const r = await fetch(url + '?action=ping', {redirect:'follow'});
    const d = await r.json();
    if (d.ping || d.success) {
      setSyncUI('ok','Conexion OK');
      toast('Apps Script conectado — ' + d.serverTime, 'success', 5000);
    } else {
      setSyncUI('error','Error');
      toast('Error: ' + JSON.stringify(d), 'error');
    }
  } catch(e) {
    setSyncUI('error','Error');
    toast('Error: ' + e.message + ' — Verifica el deploy del Apps Script.', 'error', 6000);
  }
}

function saveConfig() {
  S.config.scriptUrl = document.getElementById('cfg-url')?.value?.trim() || '';
  saveLocal();
  if (S.config.scriptUrl) {
    setSyncUI('','Configurado');
    const webhookEl = document.getElementById('webhook-url-display');
    if (webhookEl) webhookEl.value = S.config.scriptUrl;
  }
  toast('Configuración guardada', 'success');
}

function saveReportEmail() {
  const email = document.getElementById('cfg-report-email')?.value?.trim();
  if (!email) { toast('Ingresa un correo válido.', 'error'); return; }
  if (!S.config.scriptUrl) { toast('Configura el Apps Script URL primero.', 'error'); return; }
  sheetsCall({action:'saveReportEmail', email}).then(() => toast('Correo de reporte guardado', 'success'));
}

async function pushLead(lead) {
  S.dirty.add(lead.id);
  saveLocal();
  if (lead._synced && S.config.scriptUrl) sheetsCall({action:'update', ...lead});
}
