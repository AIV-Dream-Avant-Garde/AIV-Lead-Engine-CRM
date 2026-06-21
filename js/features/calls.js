/* ── FEATURE: Twilio VoIP calls, call widget, call log ───── */

// ── initTwilio — single consolidated handler ───────────────
// Dedicated Twilio status chip — kept SEPARATE from the Sheets-sync pill so the
// two don't overwrite each other (the 75s sync poll used to wipe "Twilio ready").
function setTwilioUI(state, text) {
  CALL.status = state;
  document.querySelectorAll('.twilio-status').forEach(el => {
    el.textContent = text;
    el.className = 'twilio-status' + (state ? ' ' + state : '');
  });
}

async function initTwilio() {
  if (!S.config.scriptUrl) { toast('Configure the Apps Script URL first.', 'error'); return; }
  setTwilioUI('syncing','Connecting…');
  try {
    const res = await sheetsCall({action:'getToken', identity:'agent'});
    if (!res || !res.token) {
      setTwilioUI('error','Token failed');
      toast('Failed to get a Twilio token — check the Twilio keys in Script Properties (ACCOUNT_SID / API_KEY_SID / API_SECRET / TWIML_APP).', 'error', 6000);
      return;
    }
    if (CALL.device) CALL.device.destroy();
    CALL.device = new Twilio.Device(res.token, {logLevel:1, codecPreferences:['opus','pcmu']});
    // If registration never resolves (SDK/token/network stall), surface it after 15s.
    let registered = false;
    const regTimeout = setTimeout(() => {
      if (!registered) { setTwilioUI('error','Timed out'); toast('Twilio is taking too long to connect. Check the Twilio keys in Script Properties, then retry.', 'error', 6000); }
    }, 15000);
    CALL.device.on('registered', () => { registered = true; clearTimeout(regTimeout); setTwilioUI('ok','Connected'); toast('Twilio connected. You can now make calls from the CRM.', 'success'); });
    CALL.device.on('error',      err => { clearTimeout(regTimeout); setTwilioUI('error','Error'); console.error(err); toast('Twilio error: ' + (err?.message || 'connection problem'), 'error', 6000); });
    // Single incoming handler — both banner + CALL.incomingCall state
    CALL.device.on('incoming', call => {
      CALL.incomingCall = call;
      const from  = call.parameters?.From || 'Unknown';
      const lead  = S.leads.find(l => l.phone && from.includes(l.phone.replace(/[^0-9]/g,'')));
      document.getElementById('ib-name').textContent  = lead?.name || 'Unknown number';
      document.getElementById('ib-phone').textContent = from;
      document.getElementById('incoming-banner').classList.add('visible');
    });
    await CALL.device.register();
  } catch(e) {
    setTwilioUI('error','Error');
    toast('Twilio error: ' + e.message, 'error', 5000);
  }
}

// Auto-connect Twilio when the operator opens Calls — the keys live on the
// server, so there's no manual step. Fires once per session: skips if already
// connected, in demo mode, or before the Apps Script URL is set. The manual
// "Connect Twilio" button in Settings remains as a reconnect fallback.
function autoConnectTwilio() {
  if (S.demoMode || !S.config.scriptUrl || CALL.device) return;
  if (typeof initTwilio === 'function') initTwilio();
}

// ── makeCall — consolidated (auto-claim + consent + script) ─
function makeCall(leadId) {
  const l = S.leads.find(x => x.id === leadId);
  if (!l) return;
  if (l.status === 'Do Not Call')              { toast('This lead has the "Do Not Call" status.', 'error'); return; }
  if (!l.phone || l.phone === 'N/A')         { toast('No phone number.', 'error'); return; }
  if (S.demoMode) { startDemoCall(leadId); return; }
  if (!CALL.device) {
    if (S.session?.role === 'admin') { toast('Twilio isn’t connected — opening Settings so you can connect it.', 'error'); navigate('setup'); }
    else { toast('Twilio isn’t connected. Ask your admin to connect it in Settings.', 'error'); }
    return;
  }

  // Auto-claim if unclaimed
  if (S.session && !isLockedByMe(l) && !isLockedByOther(l)) {
    l.lockedBy    = S.session.userId;
    l.lockedUntil = new Date(serverNow().getTime() + LOCK_DURATION_MS).toISOString();
    pushLead(l);
  }

  // Reset CALL state
  CALL.curLeadId        = leadId;
  CALL.muted            = false;
  CALL.seconds          = 0;
  CALL.callSid          = null;
  CALL.outcome          = null;
  CALL.consentConfirmed = false;
  CALL.incomingCall     = null;

  // Widget UI
  document.getElementById('cw-lead-name').textContent = l.name;
  document.getElementById('cw-phone').textContent     = l.phone;
  document.getElementById('cw-timer').textContent     = '0:00';
  document.getElementById('cw-post').classList.remove('visible');
  const rr0 = document.getElementById('cw-record-reminder'); if (rr0) rr0.style.display = 'none';

  // Consent/call script text (reminder + the gated-flow script)
  const scriptEl = document.getElementById('cw-consent-script');
  if (scriptEl) scriptEl.textContent = getCallScript();

  // Load talking-points panel
  const panel = document.getElementById('cw-script-panel');
  if (panel) {
    const hasContent = (S.scripts||[]).length > 0 || S.config.pitchScript || S.config.objectionsScript || S.config.closeScript;
    panel.classList.toggle('visible', !!hasContent);
    if (hasContent) cwTab('pitch');
  }

  document.querySelectorAll('.outcome-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('cw-notes').value = '';
  const skipBtn = document.getElementById('cw-skip-btn');
  if (skipBtn) skipBtn.style.display = S.dialerMode ? '' : 'none';
  populateSmsTemplates();
  document.getElementById('call-widget').classList.add('visible');

  if (S.config.requireConsentClick) {
    // Gated flow (opt-in via Settings): show the consent step, wait for the click.
    document.getElementById('cw-controls').style.display = 'none';
    document.getElementById('cw-consent').style.display  = 'block';
    const cb = document.getElementById('cw-consent-btn');
    if (cb) { cb.className = 'cw-consent-btn'; cb.textContent = 'Informed the prospect — connect call'; }
    setCWStatus('ringing', 'Inform the prospect first');
  } else {
    // Streamlined default: dial immediately; the recording reminder banner stays
    // up so the rep announces it verbally (FL two-party consent = the spoken line,
    // not a UI click).
    document.getElementById('cw-consent').style.display = 'none';
    CALL.consentConfirmed = true;
    dialNow();
  }
}

// Used only when Settings → "Require consent confirmation" is on.
function confirmConsentAndCall() {
  CALL.consentConfirmed = true;
  const cb = document.getElementById('cw-consent-btn');
  if (cb) { cb.className = 'cw-consent-btn confirmed'; cb.textContent = '✓ Consent confirmed'; }
  dialNow();
}

async function dialNow() {
  if (S.demoMode) { runSimulatedCall(); return; }
  if (!CALL.device) { toast('Twilio is not connected.', 'error'); return; }
  document.getElementById('cw-consent').style.display  = 'none';
  document.getElementById('cw-controls').style.display = 'flex';
  const rr = document.getElementById('cw-record-reminder'); if (rr) rr.style.display = 'block';
  setCWStatus('ringing','Calling...');
  const l = S.leads.find(x => x.id === CALL.curLeadId);
  if (!l) return;
  try {
    // Tag the call with our own id and pass it through to the recording callback,
    // so the saved .mp3 links back to THIS call deterministically. (Twilio's
    // outbound CallSid via call.parameters is unreliable in the browser SDK.)
    const cid = 'rec_' + uid();
    CALL.callSid = cid;
    CALL.activeCall = await CALL.device.connect({params:{To: normalizePhone(l.phone), cid: cid}});
    CALL.activeCall.on('accept', call => {
      setCWStatus('connected','Connected');
      CALL.timer = setInterval(() => {
        CALL.seconds++;
        document.getElementById('cw-timer').textContent = fmtSec(CALL.seconds);
      }, 1000);
    });
    CALL.activeCall.on('disconnect', () => onCallEnd());
    CALL.activeCall.on('cancel',     () => onCallEnd());
    CALL.activeCall.on('reject',     () => onCallEnd());
  } catch(e) {
    setCWStatus('ended','Error: ' + String(e.message).slice(0,30));
    setTimeout(() => document.getElementById('call-widget').classList.remove('visible'), 3000);
  }
}

function setCWStatus(state, text) {
  document.getElementById('cw-dot').className          = 'cw-dot ' + state;
  document.getElementById('cw-status-text').textContent = text;
}

// Settings toggle: restore the explicit "I informed them" click before dialing.
function setRequireConsent(on) {
  S.config.requireConsentClick = !!on;
  saveLocal();
  toast(on ? 'Consent confirmation step enabled (extra click before dialing).'
           : 'Calls now dial immediately — announce recording via the on-screen reminder.', 'success', 5000);
}

// Map number keys 1–7 to call outcomes (used by the keyboard shortcuts).
const CALL_OUTCOME_KEYS = { '1':'answered', '2':'noanswer', '3':'voicemail', '4':'busy', '5':'callback', '6':'wrong', '7':'other' };

function hangUp() {
  if (S.demoMode) { if (CALL.timer) { clearInterval(CALL.timer); CALL.timer = null; } onCallEnd(); return; }
  if (CALL.activeCall) CALL.activeCall.disconnect(); else onCallEnd();
}

function toggleMute() {
  if (!CALL.activeCall) return;
  CALL.muted = !CALL.muted;
  CALL.activeCall.mute(CALL.muted);
  document.getElementById('cw-mute-btn').classList.toggle('active', CALL.muted);
  document.getElementById('cw-mute-label').textContent = CALL.muted ? 'Resume' : 'Mute';
}

function onCallEnd() {
  if (CALL.timer) { clearInterval(CALL.timer); CALL.timer = null; }
  setCWStatus('ended','Call ended · ' + fmtSec(CALL.seconds));
  document.getElementById('cw-controls').style.display = 'none';
  const rr = document.getElementById('cw-record-reminder'); if (rr) rr.style.display = 'none';
  document.getElementById('cw-post').classList.add('visible');
  const smsWrap = document.getElementById('cw-sms-wrap');
  if (smsWrap) smsWrap.style.display = S.config.scriptUrl && !S.demoMode ? '' : 'none';
  const l = S.leads.find(x => x.id === CALL.curLeadId);
  // Only advance to "Contacted" if the call actually connected. Failed/rejected/
  // cancelled calls all route here with 0 seconds and must not inflate contact metrics.
  if (l && l.status === 'New' && CALL.seconds > 0) { l.status = 'Contacted'; l.updatedAt = new Date().toISOString(); pushLead(l); }
}

function setOutcome(val) {
  CALL.outcome = val;
  document.querySelectorAll('.outcome-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.outcome-btn[onclick="setOutcome('${val}')"]`)?.classList.add('active');
}

// Close the call widget WITHOUT logging an outcome (e.g. a mis-dial) — no call
// record is written. Hangs up if still connected, then resets state.
function discardCall() {
  if (CALL.timer) { clearInterval(CALL.timer); CALL.timer = null; }
  if (CALL.activeCall) { try { CALL.activeCall.disconnect(); } catch(e){} CALL.activeCall = null; }
  document.getElementById('call-widget')?.classList.remove('visible');
  CALL.curLeadId = null; CALL.outcome = null; CALL.seconds = 0; CALL.consentConfirmed = false;
}

// saveCallLog — consolidated (goNext support, call note auto-added)
async function saveCallLog(goNext) {
  if (!CALL.outcome) { toast('Select the call outcome.', 'error'); return; }
  const l   = S.leads.find(x => x.id === CALL.curLeadId);
  const rec = {
    id:uid(), leadId:CALL.curLeadId, leadName:l?.name||'', phone:l?.phone||'',
    callSid:CALL.callSid||'', outcome:CALL.outcome, duration:CALL.seconds,
    notes: document.getElementById('cw-notes').value.trim(),
    recordingUrl:'', driveUrl:'', consentConfirmed:CALL.consentConfirmed,
    calledAt: new Date().toISOString(),
    calledBy: S.session?.userId || '',
    calledByName: S.session?.userName || '',
    _synced: false,
  };
  S.calls.push(rec);
  saveLocal();
  // Confirm the server write; on failure the call stays _synced:false and
  // syncNow() retries it — so a transient error can't silently drop the record.
  if (S.config.scriptUrl) {
    sheetsCall({action:'saveCall', ...rec}).then(r => { if (r && r.success) { rec._synced = true; saveLocal(); } });
  }
  if (l) {
    if (!Array.isArray(l.notes)) l.notes = [];
    l.notes.push({
      date: rec.calledAt,
      text: 'Call: ' + (OUTCOME_LABELS[CALL.outcome] || CALL.outcome) + ' · ' + fmtSec(CALL.seconds) + (rec.notes ? ' · ' + rec.notes : ''),
    });
    // A call IS a touch — stamp lastTouchAt so the "needs reply" logic and the
    // cadence engine don't treat a just-called lead as still awaiting first contact.
    l.updatedAt = rec.calledAt;
    l.lastTouchAt = rec.calledAt;
    pushLead(l);
  }
  document.getElementById('call-widget').classList.remove('visible');
  CALL.activeCall = null;
  updateBadges(); renderCallsSection(); renderTable(); renderPerfil();
  if (goNext || S.dialerMode) setTimeout(() => goNextLead(), 250);
}

function renderCallsSection() {
  const q  = (document.getElementById('calls-q')?.value      || '').toLowerCase();
  const oc = document.getElementById('calls-outcome')?.value || '';
  const dt = document.getElementById('calls-date')?.value    || '';
  const now = new Date();

  let calls = S.calls.filter(c => {
    if (oc && c.outcome !== oc) return false;
    if (dt) {
      const d = new Date(c.calledAt);
      if (dt === 'today' && d.toDateString() !== now.toDateString()) return false;
      if (dt === 'week')  { const w = new Date(now); w.setDate(now.getDate()-7);    if (d < w) return false; }
      if (dt === 'month') { const m = new Date(now); m.setMonth(now.getMonth()-1);  if (d < m) return false; }
    }
    if (q && !`${c.leadName} ${c.phone} ${c.notes}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a,b) => new Date(b.calledAt) - new Date(a.calledAt));

  const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setEl('cs-total',    calls.length);
  setEl('cs-answered', calls.filter(c => c.outcome === 'answered').length);
  setEl('cs-today',    calls.filter(c => new Date(c.calledAt).toDateString() === now.toDateString()).length);
  const avg = calls.length ? Math.round(calls.reduce((s,c) => s + parseInt(c.duration||0), 0) / calls.length) : 0;
  setEl('cs-avgdur', avg ? fmtSec(avg) : '0:00');

  const cl = document.getElementById('calls-list');
  if (!cl) return;
  cl.innerHTML = calls.length ? calls.map(c => {
    const oc2  = c.outcome || 'answered';
    const dur  = c.duration ? fmtSec(parseInt(c.duration)) : '--';
    const lead = S.leads.find(l => l.id === c.leadId);
    // Recordings are private PII in Drive (not world-readable), so they can't be
    // streamed inline — link to Drive's player instead. A raw public recordingUrl,
    // if ever present, still plays inline.
    const audio   = c.driveUrl
      ? `<a class="call-rec-link" href="${esc(c.driveUrl)}" target="_blank" rel="noopener" title="Opens in Google Drive">▶ Listen to recording</a>`
      : c.recordingUrl
        ? `<audio class="call-audio" controls src="${esc(c.recordingUrl)}"></audio>` : '';
    const consent = c.consentConfirmed ? '<span class="consent-tag">✓ Consent</span>' : '';
    return `<div class="call-entry">
      <div class="call-entry-top">
        <span class="call-outcome-badge ${oc2}">${OUTCOME_LABELS[oc2]||oc2}</span>
        <span class="call-lead-link" onclick="${lead ? `openLead('${lead.id}')` : 'void(0)'}">${esc(c.leadName||'--')}</span>
        <span class="call-meta">${esc(c.phone||'--')} · ${dur} · ${fmtD(c.calledAt)} ${fmtT(c.calledAt)}${consent}</span>
      </div>
      ${c.notes ? `<div class="call-notes-text">${esc(c.notes)}</div>` : ''}
      ${audio}
    </div>`;
  }).join('') : '<div style="text-align:center;padding:40px;color:var(--body);font-size:13px">No calls yet — open a lead and hit <strong>Call</strong> to start dialing.</div>';
}

function renderLeadCallHistory(leadId) {
  const el = document.getElementById('m-call-history');
  if (!el) return;
  const calls = S.calls.filter(c => c.leadId === leadId)
    .sort((a,b) => new Date(b.calledAt) - new Date(a.calledAt))
    .slice(0, 5);
  el.innerHTML = calls.length ? calls.map(c => {
    const oc2   = c.outcome || 'answered';
    const audio = c.driveUrl
      ? `<audio class="call-audio" controls src="${esc(c.driveUrl)}"></audio>`
      : c.recordingUrl
        ? `<audio class="call-audio" controls src="${esc(c.recordingUrl)}"></audio>` : '';
    return `<div class="call-entry" style="margin-bottom:5px">
      <div class="call-entry-top">
        <span class="call-outcome-badge ${oc2}">${OUTCOME_LABELS[oc2]||oc2}</span>
        <span class="call-meta">${fmtSec(parseInt(c.duration||0))} · ${fmtD(c.calledAt)} ${fmtT(c.calledAt)}</span>
      </div>
      ${c.notes ? `<div class="call-notes-text">${esc(c.notes)}</div>` : ''}
      ${audio}
    </div>`;
  }).join('') : '<div class="notes-empty">No previous calls.</div>';
}

function goNextLead() {
  if (S.dialerMode && S.dialerQueue.length > 0) {
    const nextId = S.dialerQueue.shift();
    updateDialerCounter();
    const lead = S.leads.find(l => l.id === nextId);
    if (lead && lead.status !== 'Do Not Call' && lead.phone && lead.phone !== 'N/A' && !isLockedByOther(lead)) {
      setTimeout(() => makeCall(nextId), 300);
    } else {
      goNextLead(); // skip invalid, try next
    }
    return;
  }
  const next = getFiltered().find(l =>
    (l.status === 'New' || l.status === 'Contacted') &&
    l.status !== 'Do Not Call' && l.phone && l.phone !== 'N/A' &&
    !isLockedByOther(l)
  );
  if (next) { navigate('leads'); setTimeout(() => openLead(next.id), 150); }
  else       { toast('No more leads available. Nice work!', 'success'); navigate('leads'); }
}

function toggleDialer() {
  S.dialerMode = !S.dialerMode;
  if (S.dialerMode) {
    S.dialerQueue = getFiltered()
      .filter(l => (l.status === 'New' || l.status === 'Contacted') && l.phone && l.phone !== 'N/A' && !isLockedByOther(l))
      .map(l => l.id);
    if (!S.dialerQueue.length) { S.dialerMode = false; toast('No leads available to dial with the current filters.', 'error'); return; }
  } else {
    S.dialerQueue = [];
  }
  updateDialerCounter();
  renderTable(); // re-render to show/hide dialer UI
}

function updateDialerCounter() {
  const btn   = document.getElementById('dialer-toggle-btn');
  const count = document.getElementById('dialer-queue-count');
  if (btn) {
    btn.innerHTML = S.dialerMode
      ? `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:12px;height:12px;vertical-align:middle;margin-right:5px"><rect x="3.5" y="3.5" width="9" height="9" rx="1"/></svg>Stop dialer (${S.dialerQueue.length})`
      : `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:12px;height:12px;vertical-align:middle;margin-right:5px"><path d="M5 3.5l7 4.5-7 4.5z"/></svg>Auto-dialer`;
    btn.classList.toggle('btn-danger', S.dialerMode);
    btn.classList.toggle('btn-primary', !S.dialerMode);
  }
  if (count) {
    count.textContent = S.dialerMode ? S.dialerQueue.length + ' in queue' : '';
    count.style.display = S.dialerMode ? '' : 'none';
  }
}

function skipDialerLead() {
  if (!S.dialerMode || !S.dialerQueue.length) return;
  S.dialerQueue.shift();
  updateDialerCounter();
  if (S.dialerQueue.length) goNextLead();
  else { S.dialerMode = false; updateDialerCounter(); toast('Queue finished. All leads worked.', 'success'); navigate('leads'); }
}

function answerIncoming() {
  if (!CALL.incomingCall) return;
  CALL.incomingCall.accept();
  CALL.activeCall   = CALL.incomingCall;
  CALL.incomingCall = null;
  document.getElementById('incoming-banner').classList.remove('visible');
  const from = CALL.activeCall.parameters?.From || '';
  const lead = S.leads.find(l => l.phone && from.includes(l.phone.replace(/[^0-9]/g,'')));
  CALL.curLeadId = lead?.id || null;
  document.getElementById('cw-lead-name').textContent = lead?.name || 'Unknown number';
  document.getElementById('cw-phone').textContent     = lead?.phone || from;
  document.getElementById('cw-consent').style.display  = 'none';
  document.getElementById('cw-controls').style.display = 'flex';
  document.getElementById('cw-post').classList.remove('visible');
  document.getElementById('cw-timer').textContent = '0:00';
  document.getElementById('call-widget').classList.add('visible');
  setCWStatus('connected','Incoming call connected');
  CALL.seconds = 0;
  CALL.timer   = setInterval(() => { CALL.seconds++; document.getElementById('cw-timer').textContent = fmtSec(CALL.seconds); }, 1000);
  CALL.activeCall.on('disconnect', () => onCallEnd());
}

function rejectIncoming() {
  if (CALL.incomingCall) { CALL.incomingCall.reject(); CALL.incomingCall = null; }
  document.getElementById('incoming-banner').classList.remove('visible');
}

function cwTab(tab) {
  document.querySelectorAll('.cw-stab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const el = document.getElementById('cw-script-content');
  if (!el) return;
  // Look for admin-managed scripts for this stage first, fallback to config strings
  const managed = (S.scripts||[]).filter(s => s.stage === tab);
  if (managed.length) {
    el.innerHTML = managed.map(s =>
      `<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:600;color:var(--accent);margin-bottom:3px">${esc(s.name)}</div><div style="white-space:pre-wrap;font-size:12px;line-height:1.7;color:var(--hl)">${esc(s.body)}</div></div>`
    ).join('<hr style="border:none;border-top:1px solid var(--border);margin:8px 0">');
    return;
  }
  const fallbacks = {
    opening:    getCallScript(),
    pitch:      S.config.pitchScript      || 'No pitch configured. Add one in Settings → call scripts.',
    objections: S.config.objectionsScript || 'No objections configured.',
    close:      S.config.closeScript      || 'No closing script configured.',
    rebuttals:  'No quick responses configured. Add one in Admin → Call scripts.',
  };
  el.textContent = fallbacks[tab] || '';
}

function saveCallScript() {
  S.config.companyName      = document.getElementById('cfg-company')?.value?.trim()    || '';
  S.config.bookingUrl       = document.getElementById('cfg-booking')?.value?.trim()    || '';
  S.config.callScript       = document.getElementById('cfg-script')?.value?.trim()     || '';
  S.config.pitchScript      = document.getElementById('cfg-pitch')?.value?.trim()      || '';
  S.config.objectionsScript = document.getElementById('cfg-objections')?.value?.trim() || '';
  S.config.closeScript      = document.getElementById('cfg-close')?.value?.trim()      || '';
  saveLocal();
  previewScript();
  toast('Script saved', 'success');
}

function previewScript() {
  const company = document.getElementById('cfg-company')?.value?.trim() || '[your company]';
  const script  = document.getElementById('cfg-script')?.value?.trim()  || '';
  const box     = document.getElementById('script-preview-box');
  if (!box) return;
  if (script) {
    box.style.display = 'block';
    box.textContent   = script.replace(/\[your company\]/gi, company).replace(/\[empresa\]/gi, company).replace(/\[tu empresa\]/gi, company);
  } else {
    box.style.display = 'none';
  }
}

function populateSmsTemplates() {
  const sel = document.getElementById('cw-sms-tpl');
  if (!sel) return;
  const templates = S.smsTemplates || [];
  sel.innerHTML = templates.length
    ? `<option value="">Select a template...</option>` + templates.map((t,i) => `<option value="${i}">${esc(t.name)}</option>`).join('')
    : `<option value="">No templates — add in Admin</option>`;
}

async function sendPostCallSms() {
  const idx = document.getElementById('cw-sms-tpl')?.value;
  if (idx === '' || idx === undefined) { toast('Select a template.', 'error'); return; }
  const tpl  = (S.smsTemplates||[])[parseInt(idx)];
  if (!tpl)  { toast('Template not found.', 'error'); return; }
  const l    = S.leads.find(x => x.id === CALL.curLeadId);
  if (!l) { toast('Lead not found.', 'error'); return; }
  // Route through the unified sender: channel-aware (Colombia→WhatsApp, US→SMS),
  // logged as an interaction in the timeline, and opt-out / "Do Not Call" gated.
  await sendMessage(l, tpl.body, {});
}

// ── Demo-mode simulated call flow ──────────────────────────
function startDemoCall(leadId) {
  const l = S.leads.find(x => x.id === leadId);
  if (!l) return;

  CALL.curLeadId        = leadId;
  CALL.seconds          = 0;
  CALL.muted            = false;
  CALL.callSid          = null;
  CALL.outcome          = null;
  CALL.consentConfirmed = false;
  CALL.activeCall       = null;
  CALL.incomingCall     = null;

  document.getElementById('cw-lead-name').textContent = l.name;
  document.getElementById('cw-phone').textContent     = l.phone;
  document.getElementById('cw-timer').textContent     = '0:00';
  document.getElementById('cw-post').classList.remove('visible');
  const rr0 = document.getElementById('cw-record-reminder'); if (rr0) rr0.style.display = 'none';

  const scriptEl = document.getElementById('cw-consent-script');
  if (scriptEl) scriptEl.textContent = getCallScript();

  document.querySelectorAll('.outcome-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('cw-notes').value = '';

  const skipBtn = document.getElementById('cw-skip-btn');
  if (skipBtn) skipBtn.style.display = S.dialerMode ? '' : 'none';

  populateSmsTemplates();
  document.getElementById('call-widget').classList.add('visible');

  if (S.config.requireConsentClick) {
    document.getElementById('cw-controls').style.display = 'none';
    document.getElementById('cw-consent').style.display  = 'block';
    const cb = document.getElementById('cw-consent-btn');
    if (cb) { cb.className = 'cw-consent-btn'; cb.textContent = 'Informed the prospect — connect call'; }
    setCWStatus('ringing', 'Inform the prospect first');
  } else {
    document.getElementById('cw-consent').style.display = 'none';
    CALL.consentConfirmed = true;
    runSimulatedCall();
  }
}

function runSimulatedCall() {
  CALL.consentConfirmed = true;
  CALL.callSid = 'CA-demo-' + Math.random().toString(36).slice(2, 10);

  const cb = document.getElementById('cw-consent-btn');
  if (cb) { cb.className = 'cw-consent-btn confirmed'; cb.textContent = '✓ Consent confirmed'; }
  document.getElementById('cw-consent').style.display  = 'none';
  document.getElementById('cw-controls').style.display = 'flex';
  const rr = document.getElementById('cw-record-reminder'); if (rr) rr.style.display = 'block';

  setCWStatus('ringing', 'Dialing…');

  setTimeout(() => {
    setCWStatus('connected', 'Connected');
    CALL.timer = setInterval(() => {
      CALL.seconds++;
      const t = document.getElementById('cw-timer');
      if (t) t.textContent = fmtSec(CALL.seconds);
    }, 1000);
  }, 2000);
}

function getCallScript() {
  const company = S.config.companyName || '[your company]';
  return (S.config.callScript || '"Hi, I\'m calling from [your company]. This call may be recorded for quality and training purposes. Is now a good time to talk?"')
    .replace(/\[your company\]/gi, company)
    .replace(/\[empresa\]/gi, company)        // legacy token, kept for back-compat
    .replace(/\[tu empresa\]/gi, company);
}
