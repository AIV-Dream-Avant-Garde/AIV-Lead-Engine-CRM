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
      body: JSON.stringify({...params, _secret: S.config.crmSecret, adminToken: (S.session && S.session.adminToken) || '', repToken: (S.session && S.session.repToken) || ''}),
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

/* ── Durable outbound writes (mutation queue) ──────────────────────────────────
   team / commissions / engagements / scripts / scheduledJobs / stateCampaigns are
   wholesale-replaced from the server on every pull. A fire-and-forget write that
   failed used to vanish on the next pull. Now every such write goes through the
   queue: it's tried immediately, and on failure it's PERSISTED and retried on each
   sync — and the pull won't overwrite an array that still has unsent writes. */

function mutKey_(params, arrayKey) {
  // Coalesce repeated writes to the same record/array (latest wins) so the queue
  // can't grow unbounded. Whole-array saves (no id) key on the action alone.
  const id = params.engagementId || params.id || params.leadId || '';
  return (arrayKey || '') + '|' + params.action + '|' + id;
}
function enqueueMutation(params, label, arrayKey) {
  S.mutationQueue = S.mutationQueue || [];
  const k = mutKey_(params, arrayKey);
  S.mutationQueue = S.mutationQueue.filter(m => m._key !== k);
  S.mutationQueue.push({ _key:k, params, label: label || 'Change', arrayKey: arrayKey || '', ts: Date.now() });
  saveLocal();
}
// Try a write now; on failure, persist it for retry. arrayKey = which pulled array
// this write owns (so the next pull won't clobber the optimistic local copy).
// opts.onResult(res) runs on success for writes that need the server's response.
async function durableSave(params, label, arrayKey, onResult) {
  if (S.demoMode || !S.config.scriptUrl) return null;
  let res = null;
  try { res = await sheetsCall(params); } catch (e) { res = null; }
  if (res && res.success) { if (onResult) onResult(res); return res; }
  enqueueMutation(params, label, arrayKey);
  toast((label || 'Change') + ' saved locally — couldn’t reach the server. It’ll retry on the next sync.', 'error', 5500);
  return res;
}
// Back-compat shim: existing callers pass (params, label); add arrayKey when known.
function bgSave(params, label, arrayKey) {
  if (!S.config.scriptUrl) return;
  durableSave(params, label, arrayKey);
}
// Drain the queue (called at the start of each sync). Returns the set of arrayKeys
// that STILL have unsent writes, so the pull merge can skip overwriting them.
async function drainMutationQueue() {
  const pending = new Set();
  if (!S.mutationQueue || !S.mutationQueue.length || !S.config.scriptUrl || S.demoMode) return pending;
  const remaining = [];
  for (const m of S.mutationQueue) {
    let okx = false;
    try { const r = await sheetsCall(m.params); okx = !!(r && r.success); } catch (e) { okx = false; }
    if (!okx) { remaining.push(m); if (m.arrayKey) pending.add(m.arrayKey); }
  }
  S.mutationQueue = remaining;
  saveLocal();
  return pending;
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
  // Drain the durable mutation queue (retry any failed team/commission/engagement/
  // script/job/campaign writes). Arrays still holding unsent writes are protected
  // from the pull overwrite below.
  const pendingArrays = await drainMutationQueue();
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
    // Merge pulled calls by id: append unseen, AND fill in server-added recording
    // links on calls we already have. recordingUrl/driveUrl are stamped on the row
    // AFTER the call is saved (by the async recording callback), so an already-local
    // call must pick them up on a later pull — without clobbering other local fields.
    if (Array.isArray(res.calls)) {
      const callById = new Map((S.calls || []).map(c => [c.id, c]));
      res.calls.forEach(c => {
        if (!c || !c.id) return;
        const local = callById.get(c.id);
        if (!local) { const nc = {...c, _synced:true}; S.calls.push(nc); callById.set(c.id, nc); }
        else {
          if (c.recordingUrl && !local.recordingUrl) local.recordingUrl = c.recordingUrl;
          if (c.driveUrl     && !local.driveUrl)     local.driveUrl     = c.driveUrl;
          if (c.transcript   && !local.transcript)   local.transcript   = c.transcript;
          if (c.callSummary  && !local.callSummary)  local.callSummary  = c.callSummary;
        }
      });
    }
    if (res.team && !pendingArrays.has('team')) {
      // Preserve pinPlain (local-only) when merging server team data
      S.team = res.team.map(m => {
        const local = S.team.find(x => x.id === m.id);
        return local ? {...m, pinPlain: local.pinPlain || m.pinPlain || ''} : m;
      });
      localStorage.setItem('aiv-team', JSON.stringify(S.team));
    }
    if (res.commissions && !pendingArrays.has('commissions')) { S.commissions = res.commissions; localStorage.setItem('aiv-comm', JSON.stringify(S.commissions)); }
    if (res.scripts && !pendingArrays.has('scripts'))     { S.scripts     = res.scripts;     localStorage.setItem('aiv-scripts', JSON.stringify(S.scripts)); }
    if (Array.isArray(res.engagements) && !pendingArrays.has('engagements')) { S.engagements = res.engagements; localStorage.setItem('aiv-engagements', JSON.stringify(S.engagements)); }
    if (Array.isArray(res.scheduledJobs) && !pendingArrays.has('scheduledJobs')) { S.scheduledJobs = res.scheduledJobs; localStorage.setItem('aiv-sched-jobs', JSON.stringify(S.scheduledJobs)); }
    // State campaigns: the server is authoritative (it advances cursor/leadsFound
    // as it scrapes), so take its copy on pull — unless we have unsent campaign writes.
    if (Array.isArray(res.stateCampaigns) && !pendingArrays.has('stateCampaigns')) { S.stateCampaigns = res.stateCampaigns; localStorage.setItem('aiv-campaigns', JSON.stringify(S.stateCampaigns)); }
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
    const r = await fetch(url + '?action=ping', {method:'POST', redirect:'follow', headers:{'Content-Type':'text/plain'}, body:'{}'});
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

// Bulk variant: mark all dirty and persist ONCE, then sync each. Avoids the
// O(K·N) re-serialization of calling pushLead (and saveLocal) per lead in a loop.
async function pushLeads(leads) {
  if (!leads || !leads.length) return;
  leads.forEach(l => S.dirty.add(l.id));
  saveLocal();
  if (!S.config.scriptUrl) return;
  let changed = false;
  for (const lead of leads) {
    if (!lead._synced) continue;
    const r = await sheetsCall({action:'update', ...lead});
    if (r && r.success) { S.dirty.delete(lead.id); changed = true; }
  }
  if (changed) saveLocal();
}
