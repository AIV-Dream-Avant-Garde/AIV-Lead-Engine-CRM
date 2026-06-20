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
      body: JSON.stringify({...params, _secret: S.config.crmSecret, adminToken: (S.session && S.session.adminToken) || ''}),
    });
    const data = await r.json();
    // The server rejected our admin token (expired/missing) on an admin-only
    // action — the admin needs to sign in again via the two-gate flow.
    if (data && data.code === 401 && S.session && S.session.role === 'admin') handleAdminAuthExpired();
    return data;
  } catch(e) {
    return {success:false, error:e.message};
  }
}

// Admin token no longer valid: drop the session so the next action goes through
// a fresh two-gate sign-in. Guarded so we only fire once per expiry.
var _adminAuthExpiring = false;
function handleAdminAuthExpired() {
  if (_adminAuthExpiring) return;
  _adminAuthExpiring = true;
  toast('Admin session expired. Please sign in again.', 'error', 6000);
  setTimeout(() => { _adminAuthExpiring = false; if (typeof logout === 'function') logout(); }, 1200);
}

// Fire a backend save the user expects to persist, and surface a failure. These
// writes used to be silent — a rejected save would quietly vanish on the next
// pull (which overwrites local team/commissions/etc. from the server). The local
// copy is already saved, so this just tells the user to retry.
function bgSave(params, label) {
  if (!S.config.scriptUrl) return;            // local-only mode — nothing to sync to
  Promise.resolve(sheetsCall(params)).then(res => {
    if (!res || !res.success) toast((label || 'Change') + " didn't save to the server. Check your connection and try again.", 'error', 6000);
  }).catch(() => toast((label || 'Change') + " didn't save to the server. Check your connection and try again.", 'error', 6000));
}

function setSyncUI(state, text) {
  document.getElementById('sync-dot').className = 'sync-dot' + (state ? ' ' + state : '');
  document.getElementById('sync-text').textContent = text;
  // Surface sync failures the user would otherwise miss — the status dot is tiny
  // and the 75s background poll is silent. Toast ONCE per failure streak (and
  // once on recovery), so a solo founder knows when work isn't reaching Sheets.
  if (state === 'error') {
    if (!S._syncFailing) { S._syncFailing = true; toast(text || 'Sync failed — working offline, will retry.', 'error', 6000); }
  } else if (state === 'ok') {
    if (S._syncFailing) { S._syncFailing = false; toast('Back online — changes synced.', 'success'); }
  }
}

function setProgress(pct) {
  const p = document.getElementById('sync-progress');
  const b = document.getElementById('sync-bar');
  p.classList.toggle('visible', pct > 0 && pct < 100);
  b.style.width = pct + '%';
}

function setLastSynced() {
  const el = document.getElementById('tb-sync-time');
  if (el) el.textContent = 'Sync ' + new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}

async function syncNow() {
  if (!S.config.scriptUrl) { setSyncUI('','Connect Apps Script in Settings'); return; }
  if (S.isSyncing) return; // prevent concurrent syncs
  S.isSyncing = true;
  const syncBtn = document.getElementById('sync-btn');
  if (syncBtn) { syncBtn.disabled = true; syncBtn.setAttribute('aria-busy','true'); }
  setSyncUI('syncing','Syncing...');
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
  // Push unsynced calls (append-only) — retries any saveCall that failed at
  // call-end time, so call records aren't lost on a transient error.
  for (const c of (S.calls || []).filter(c => c && c._synced === false)) {
    const r = await sheetsCall({action:'saveCall', ...c});
    if (r && r.success) c._synced = true;
  }
  setProgress(40);

  // Pull from server
  const res = await sheetsCall({action:'pull', since: S.lastSyncTimestamp || ''});
  setProgress(85);

  if (res && res.success) {
    if (res.serverTime) S.serverTimeOffset = new Date(res.serverTime) - Date.now();
    // Persist whether the server-side admin gate is configured, so the login
    // screen knows to retire the old in-browser admin PIN (read before next login).
    if (typeof res.adminGateEnabled === 'boolean') {
      S.config.adminGateEnabled = res.adminGateEnabled;
      try { localStorage.setItem('aiv-admin-gate', res.adminGateEnabled ? '1' : '0'); } catch(e) {}
    }
    // Merge incoming leads — but never clobber a lead with pending local edits
    // (still dirty / failed to push), so unsynced work isn't lost to an older
    // server copy.
    const sm = {};
    (res.leads || []).forEach(l => { if (l.id) sm[l.id] = l; });
    // Prune tombstones the server has already honored (id no longer returned),
    // so the suppress-set can't grow forever and a legitimate future re-add works.
    if (S.deletedIds.size) S.deletedIds.forEach(id => { if (!sm[id]) S.deletedIds.delete(id); });
    S.leads.forEach(l => {
      if (sm[l.id] && !S.dirty.has(l.id)) { Object.assign(l, sm[l.id]); l.country = l.country || DEFAULT_COUNTRY; l._synced = true; }
    });
    (res.leads || []).forEach(l => {
      if (l.id && !S.deletedIds.has(l.id) && !S.leads.find(x => x.id === l.id)) {
        S.leads.push({...l, _synced:true,
          country:     l.country || DEFAULT_COUNTRY,
          notes:       Array.isArray(l.notes)       ? l.notes       : [],
          workHistory: Array.isArray(l.workHistory) ? l.workHistory : [],
        });
      }
    });
    // Merge pulled calls by id (append unseen) instead of replacing the array —
    // a wholesale replace would clobber locally-saved calls not yet pushed.
    if (Array.isArray(res.calls)) {
      const haveCalls = new Set(S.calls.map(c => c.id));
      res.calls.forEach(c => { if (c && c.id && !haveCalls.has(c.id)) { S.calls.push({...c, _synced:true}); haveCalls.add(c.id); } });
    }
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
    // State campaigns: the server is authoritative (it advances cursor/leadsFound
    // as it scrapes), so take its copy on pull.
    if (Array.isArray(res.stateCampaigns)) { S.stateCampaigns = res.stateCampaigns; localStorage.setItem('aiv-campaigns', JSON.stringify(S.stateCampaigns)); }
    // Merge incoming interactions append-only, by id (never clobber; preserves local optimistic rows)
    const freshInbound = [];
    if (Array.isArray(res.interactions)) {
      const seen = new Set(S.interactions.map(i => i.id));
      res.interactions.forEach(i => {
        if (i.id && !seen.has(i.id)) {
          S.interactions.push({...i, _synced:true}); seen.add(i.id);
          if (i.direction === 'in' && S._syncedOnce) freshInbound.push(i);   // a new reply since we went live
        }
      });
    }
    // Near-real-time: alert the rep to fresh replies (skipped on the first sync,
    // which loads history). Speed-to-lead is the #1 conversion lever.
    if (freshInbound.length && typeof notifyNewReplies === 'function') notifyNewReplies(freshInbound);
    // Reflect inbound replies onto the lead so the "Replied" badge works frontend-side
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
    S._syncedOnce = true;   // first sync loads history silently; later syncs alert on fresh replies
    saveLocal();
    if (failed > 0) {
      setSyncUI('error', failed + ' not synced — retry');
      toast(failed + ' record(s) failed to save to the server' + (authError ? ' (authentication: check CRM_SECRET)' : '') + '. They will be retried on the next sync.', 'error', 7000);
    } else {
      setSyncUI('ok','Synced');
      setLastSynced();
      setTimeout(showSignalBanner, 200);
    }
  } else {
    // Pull failed: keep all dirty/unsynced state for retry; persist push progress.
    saveLocal();
    const isAuth = (res && /unauthorized/i.test(String(res.error||''))) || authError;
    setSyncUI('error', isAuth ? 'Unauthorized — check CRM_SECRET' : (res?.error ? 'Error: ' + String(res.error).slice(0,30) : 'Not connected — will retry'));
  }

  setProgress(100);
  setTimeout(() => setProgress(0), 600);
  S.isSyncing = false;
  if (syncBtn) { syncBtn.disabled = false; syncBtn.removeAttribute('aria-busy'); }
  renderAll();
}

async function testConn() {
  const url = document.getElementById('cfg-url')?.value?.trim();
  if (!url) { toast('Enter the URL first.', 'error'); return; }
  setSyncUI('syncing','Testing...');
  try {
    const r = await fetch(url + '?action=ping', {redirect:'follow'});
    const d = await r.json();
    if (d.ping || d.success) {
      setSyncUI('ok','Connection OK');
      toast('Apps Script connected — ' + d.serverTime, 'success', 5000);
    } else {
      setSyncUI('error','Error');
      toast('Error: ' + JSON.stringify(d), 'error');
    }
  } catch(e) {
    setSyncUI('error','Error');
    toast('Error: ' + e.message + ' — Check the Apps Script deployment.', 'error', 6000);
  }
}

function saveConfig() {
  S.config.scriptUrl = document.getElementById('cfg-url')?.value?.trim() || '';
  saveLocal();
  if (S.config.scriptUrl) {
    setSyncUI('','Configured');
    const webhookEl = document.getElementById('webhook-url-display');
    if (webhookEl) webhookEl.value = S.config.scriptUrl;
  }
  toast('Configuration saved', 'success');
}

function saveReportEmail() {
  const email = document.getElementById('cfg-report-email')?.value?.trim();
  if (!email) { toast('Enter a valid email.', 'error'); return; }
  if (!S.config.scriptUrl) { toast('Set the Apps Script URL first.', 'error'); return; }
  sheetsCall({action:'saveReportEmail', email}).then(() => toast('Report email saved', 'success'));
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
