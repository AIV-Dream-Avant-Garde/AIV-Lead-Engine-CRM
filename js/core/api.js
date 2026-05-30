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
      headers:{'Content-Type':'text/plain'},
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

  // Push new (never-synced) leads in batches; update edited synced leads.
  // A lead's dirty flag / unsynced state is cleared ONLY on confirmed success,
  // so anything that fails to reach the server stays queued for the next sync.
  const toPush   = S.leads.filter(l => !l._synced);
  const toUpdate = S.leads.filter(l => l._synced && S.dirty.has(l.id));
  let failed = 0, authError = null;

  for (let i = 0; i < toPush.length; i += 20) {
    const batch = toPush.slice(i, i + 20);
    const r = await sheetsCall({action:'push', data: batch});
    if (r && r.success) { batch.forEach(l => { l._synced = true; S.dirty.delete(l.id); }); }
    else { failed += batch.length; if (r && /unauthorized/i.test(String(r.error||''))) authError = r.error; }
    setProgress(5 + Math.round((i + Math.min(20, toPush.length - i)) / Math.max(toPush.length, 1) * 30));
  }
  for (const l of toUpdate) {
    const r = await sheetsCall({action:'update', ...l});
    if (r && r.success) { S.dirty.delete(l.id); }
    else { failed++; if (r && /unauthorized/i.test(String(r.error||''))) authError = r.error; }
  }
  // Push unsynced interactions (append-only; mark _synced on confirmed success)
  for (const it of (S.interactions || []).filter(i => !i._synced)) {
    const r = await sheetsCall({action:'saveInteraction', ...it});
    if (r && r.success) it._synced = true;
  }
  setProgress(40);

  // Pull from server
  const res = await sheetsCall({action:'pull', since: S.lastSyncTimestamp || ''});
  setProgress(85);

  if (res && res.success) {
    if (res.serverTime) S.serverTimeOffset = new Date(res.serverTime) - Date.now();
    // Merge incoming leads — but never clobber a lead with pending local edits
    // (still dirty / failed to push), so unsynced work isn't lost to an older
    // server copy.
    const sm = {};
    (res.leads || []).forEach(l => { if (l.id) sm[l.id] = l; });
    S.leads.forEach(l => {
      if (sm[l.id] && !S.dirty.has(l.id)) { Object.assign(l, sm[l.id]); l.country = l.country || DEFAULT_COUNTRY; l._synced = true; }
    });
    (res.leads || []).forEach(l => {
      if (l.id && !S.leads.find(x => x.id === l.id)) {
        S.leads.push({...l, _synced:true,
          country:     l.country || DEFAULT_COUNTRY,
          notes:       Array.isArray(l.notes)       ? l.notes       : [],
          workHistory: Array.isArray(l.workHistory) ? l.workHistory : [],
        });
      }
    });
    if (!res.isIncremental && res.calls) S.calls = res.calls;
    if (res.team) {
      // Preserve pinPlain (local-only) when merging server team data
      S.team = res.team.map(m => {
        const local = S.team.find(x => x.id === m.id);
        return local ? {...m, pinPlain: local.pinPlain || m.pinPlain || ''} : m;
      });
      localStorage.setItem('aiv-team', JSON.stringify(S.team));
    }
    if (res.commissions) { S.commissions = res.commissions; localStorage.setItem('aiv-comm', JSON.stringify(S.commissions)); }
    if (res.scripts)     { S.scripts     = res.scripts;     localStorage.setItem('aiv-scripts', JSON.stringify(S.scripts)); }
    if (Array.isArray(res.scheduledJobs)) { S.scheduledJobs = res.scheduledJobs; localStorage.setItem('aiv-sched-jobs', JSON.stringify(S.scheduledJobs)); }
    // Merge incoming interactions append-only, by id (never clobber; preserves local optimistic rows)
    if (Array.isArray(res.interactions)) {
      const seen = new Set(S.interactions.map(i => i.id));
      res.interactions.forEach(i => { if (i.id && !seen.has(i.id)) { S.interactions.push({...i, _synced:true}); seen.add(i.id); } });
    }
    // Reflect inbound replies onto the lead so the "Respondió" badge works frontend-side
    // regardless of whether the backend stamped lastReplyAt.
    (S.interactions || []).filter(i => i.direction === 'in' && i.leadId).forEach(i => {
      const l = S.leads.find(x => x.id === i.leadId);
      if (l && i.createdAt && (!l.lastReplyAt || new Date(i.createdAt) > new Date(l.lastReplyAt))) l.lastReplyAt = i.createdAt;
    });
    // Cadence enrollment: engine-authoritative, BUT keep a local copy that was changed
    // more recently (a manual pause/resume the engine hasn't processed yet) so it isn't clobbered.
    if (Array.isArray(res.sequences)) {
      const localByLead = {}; (S.sequences || []).forEach(s => { localByLead[s.leadId] = s; });
      const merged = res.sequences.map(srv => {
        const loc = localByLead[srv.leadId];
        return (loc && loc.updatedAt && (!srv.updatedAt || new Date(loc.updatedAt) > new Date(srv.updatedAt))) ? loc : srv;
      });
      (S.sequences || []).forEach(loc => { if (!res.sequences.find(srv => srv.leadId === loc.leadId)) merged.push(loc); });
      S.sequences = merged;
      localStorage.setItem('aiv-sequences', JSON.stringify(S.sequences));
    }
    S.lastSyncTimestamp = new Date().toISOString();
    saveLocal();
    if (failed > 0) {
      setSyncUI('error', failed + ' sin sincronizar — reintentar');
      toast(failed + ' registro(s) no se guardaron en el servidor' + (authError ? ' (autenticación: revisa CRM_SECRET)' : '') + '. Se reintentarán en el próximo sync.', 'error', 7000);
    } else {
      setSyncUI('ok','Sincronizado');
      setLastSynced();
      setTimeout(showSignalBanner, 200);
    }
  } else {
    // Pull failed: keep all dirty/unsynced state for retry; persist push progress.
    saveLocal();
    const isAuth = (res && /unauthorized/i.test(String(res.error||''))) || authError;
    setSyncUI('error', isAuth ? 'No autorizado — revisa CRM_SECRET' : (res?.error ? 'Error: ' + String(res.error).slice(0,30) : 'Sin conexión — se reintentará'));
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
  // Immediate update for already-synced leads (latency). Clear dirty only on
  // confirmed success; on failure it stays dirty and syncNow retries it.
  if (lead._synced && S.config.scriptUrl) {
    const r = await sheetsCall({action:'update', ...lead});
    if (r && r.success) { S.dirty.delete(lead.id); saveLocal(); }
  }
}
