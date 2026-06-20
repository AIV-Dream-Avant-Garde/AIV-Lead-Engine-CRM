/* ── FEATURE: Outreach — channel routing, message rendering, opt-out (Project A) ──
   Slice 1 = pure logic only (no DOM, no network) so it is fully unit-tested.
   The manual composer + sendMessage (DOM/backend) arrive in a later slice.     */

// Which channel to use for a lead, by country. US → SMS,
// anything else → email (Project C). Pure.
function pickChannel(lead) {
  return CHANNEL_BY_COUNTRY[(lead && lead.country) || ''] || 'email';
}

// Format a number as E.164 (+<dial><digits>) for sending. Matching/dedup uses
// phoneKey() (last-10) elsewhere; this is only for the To/From a provider needs.
function toE164(phone, country) {
  const raw = String(phone || '').replace(/[^\d+]/g, '');
  if (!raw) return '';
  if (raw[0] === '+') { const d = raw.slice(1).replace(/\D/g, ''); return d.length >= 8 ? '+' + d : ''; }
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const dial = COUNTRY_DIAL[country] || '';
  if (dial && digits.startsWith(dial) && digits.length >= 11) return '+' + digits; // already includes country code
  return dial ? '+' + dial + digits : '+' + digits;
}

// Merge rich, human personalization tokens. Unknown/empty tokens degrade
// gracefully (never leave a literal "{city}"); whitespace is tidied. Pure.
function renderTemplate(body, lead, agent) {
  lead = lead || {};
  const company = (typeof S !== 'undefined' && S.config && S.config.companyName) ? S.config.companyName : 'AXIUS';
  const map = {
    business:  lead.name    || '',
    city:      lead.city    || '',
    neighborhood: lead.barrio || '',
    category:  lead.keyword || '',
    name:      lead.contactName || lead.name || '',
    company:   company,
    agent:     agent || '',
    booking:   (typeof S !== 'undefined' && S.config && S.config.bookingUrl) || '',
    followup:  lead.followUpDate ? (typeof fmtD === 'function' ? fmtD(lead.followUpDate) : String(lead.followUpDate)) : '',
  };
  return String(body || '')
    .replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : ''))
    .replace(/[ \t]{2,}/g, ' ')   // collapse gaps left by empty tokens
    .replace(/ +([,.!?])/g, '$1') // tidy " ," → ","
    .trim();
}

// Opt-out detection: carrier keywords (whole message / leading token) OR a
// curated natural-language decline. Conservative — neutral replies are NOT
// opt-outs (those become a human-handoff signal in Project B). Pure.
function isOptOut(body) {
  const t = String(body || '').trim().toLowerCase();
  if (!t) return false;
  if (OPT_OUT_KEYWORDS.some(k => t === k || t === k + '.' || t.startsWith(k + ' '))) return true;
  if (OPT_OUT_PHRASES.some(p => t.indexOf(p) !== -1)) return true;
  return false;
}

// ── Interactions (append-only log) + manual send ──────────────────────
// Append a local interaction row and persist it (idempotent upsert by id on
// the backend). Returns the row so the caller can update status/sid later.
function addInteraction(rec) {
  const it = {
    id:        (rec && rec.id) || uid(),
    leadId:    rec.leadId   || '',
    leadName:  rec.leadName || '',
    phone:     rec.phone    || '',
    channel:   rec.channel  || '',
    direction: rec.direction|| 'out',
    body:      rec.body     || '',
    stepTag:   rec.stepTag  || '',
    status:    rec.status   || 'sent',
    sid:       rec.sid      || '',
    error:     rec.error    || '',
    createdAt: new Date().toISOString(),
    createdBy: (S.session && S.session.userId) || 'system',
    _synced:   false,
  };
  if (!Array.isArray(S.interactions)) S.interactions = [];
  S.interactions.push(it);
  saveLocal();
  // Persistence is explicit (persistInteraction) or via syncNow's unsynced push —
  // NOT auto-fired here, to avoid a 3-path write race on the same id.
  return it;
}

// Persist an interaction's updated fields (status/sid/error) — idempotent upsert.
function persistInteraction(it) {
  it._synced = false;
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'saveInteraction', ...it}).then(r => { if (r && r.success) { it._synced = true; saveLocal(); } });
}

// Manual outbound send from an agent. Resolves channel by country, renders the
// human template, blocks opted-out leads, logs an optimistic interaction, then
// fires the backend send. The backend `sendMessage` only talks to Twilio;
// persistence is via the (idempotent) interaction rows.
async function sendMessage(lead, body, opts) {
  opts = opts || {};
  if (!lead) return null;
  const channel = opts.channel || pickChannel(lead);
  // SMS/WhatsApp stay OFF until A2P 10DLC registration + the consent gate are
  // finished. Calls + email are the active channels for now. Flip S.config.smsEnabled
  // to true (one switch) once A2P is approved to re-enable texting.
  if ((channel === 'sms' || channel === 'whatsapp') && !S.config.smsEnabled) {
    toast('Texting is disabled until A2P 10DLC registration is complete. Use email or a call for now.', 'warning', 6000);
    return null;
  }
  if (lead.status === 'Do Not Call') { toast('This lead is on "Do Not Call" / opted out — message not sent.', 'error'); return null; }
  const agent = ((S.session && S.session.userName) || '').split(' ')[0] || '';
  const text  = renderTemplate(body, lead, agent);
  if (!text.trim()) { toast('The message is empty.', 'error'); return null; }

  // Resolve recipient by channel: email → lead.email; sms/whatsapp → E.164 phone.
  let phoneE164 = '', email = '', subject = '';
  if (channel === 'email') {
    email = (lead.email || '').trim();
    if (!email) { toast('This lead has no email.', 'error'); return null; }
    subject = renderTemplate(opts.subject || 'AXIUS', lead, agent) || 'AXIUS';
  } else {
    phoneE164 = toE164(lead.phone, lead.country);
    if (!phoneE164) { toast("This lead's phone number isn't valid for sending.", 'error'); return null; }
  }

  const logBody = channel === 'email' ? ('[Subject: ' + subject + '] ' + text) : text;
  const it = addInteraction({ leadId:lead.id, leadName:lead.name, phone:lead.phone, channel, direction:'out', stepTag:opts.stepTag||'', body:logBody, status:'queued' });
  lead.lastTouchAt = new Date().toISOString();
  if (typeof pushLead === 'function') pushLead(lead);

  // Demo mode: local-only success (no backend), so the composer demos cleanly.
  if (S.demoMode) { it.status = 'sent'; it.sid = 'demo'; it._synced = true; saveLocal(); toast('Message sent (demo).', 'success'); if (typeof renderAll === 'function') renderAll(); return it; }

  if (!S.config.scriptUrl) { it.status = 'failed'; it.error = 'no connection'; persistInteraction(it); toast('No Apps Script configured: the message was logged but not sent.', 'error', 6000); return it; }

  const req = channel === 'email'
    ? { action:'sendEmail', id:it.id, leadId:lead.id, email, subject, body:text, stepTag:it.stepTag }
    : { action:'sendMessage', id:it.id, leadId:lead.id, phoneE164, channel, body:text, stepTag:it.stepTag };
  const res = await sheetsCall(req);
  if (res && res.success) { it.status = 'sent'; it.sid = res.sid || res.id || ''; toast('Sent via ' + (CHANNEL_LABELS[channel] || channel) + '.', 'success'); }
  else { it.status = 'failed'; it.error = (res && res.error) || 'no reply'; toast("Couldn't send: " + it.error, 'error', 6000); }
  persistInteraction(it);
  if (typeof renderAll === 'function') renderAll();
  return it;
}

// ── Lead-modal composer (manual send) ─────────────────────────────────
let _composerTpls = [];
function _composerChannel() { return document.getElementById('msg-channel')?.value || (S.config.smsEnabled ? 'sms' : 'email'); }
function _toggleSubject() { const w = document.getElementById('msg-subject-wrap'); if (w) w.style.display = (_composerChannel() === 'email') ? '' : 'none'; }

function renderComposer(lead) {
  const csel = document.getElementById('msg-channel');
  if (!csel || !lead) return;
  // Default to email while texting is disabled (A2P pending); SMS/WhatsApp remain
  // listed but labeled so the operator knows why they can't send yet.
  const def = S.config.smsEnabled ? pickChannel(lead) : 'email';
  csel.innerHTML = ['sms','whatsapp','email'].map(c => {
    const off = !S.config.smsEnabled && (c === 'sms' || c === 'whatsapp');
    const label = (CHANNEL_LABELS[c] || c) + (off ? ' (off — A2P pending)' : '');
    return `<option value="${c}"${c===def?' selected':''}>${label}</option>`;
  }).join('');
  csel.onchange = () => { _toggleSubject(); _fillComposerTemplates(lead); renderMsgPreview(); };
  const body = document.getElementById('msg-body'); if (body) body.value = '';
  const subj = document.getElementById('msg-subject'); if (subj) subj.value = '';
  _toggleSubject();
  _fillComposerTemplates(lead);
  renderMsgPreview();
  const optedOut = lead.status === 'Do Not Call';
  const note = document.getElementById('msg-optout-note');
  const btn  = document.getElementById('msg-send-btn');
  if (note) { note.style.display = optedOut ? 'block' : 'none'; note.textContent = optedOut ? 'Lead on "Do Not Call" / opted out — cannot send.' : ''; }
  if (btn) btn.disabled = optedOut;
}

function _fillComposerTemplates(lead) {
  const ch = _composerChannel();
  const seeded = (typeof OUTREACH_TEMPLATES !== 'undefined' && OUTREACH_TEMPLATES[lead.country] && OUTREACH_TEMPLATES[lead.country][ch]) || [];
  const custom = (S.smsTemplates || []).map(t => ({ name: t.name, body: t.body }));
  _composerTpls = seeded.concat(custom);
  const sel = document.getElementById('msg-template');
  if (sel) sel.innerHTML = '<option value="">— template —</option>' + _composerTpls.map((t,i) => `<option value="${i}">${esc(t.name)}</option>`).join('');
}

function applyMsgTemplate() {
  const sel = document.getElementById('msg-template'), body = document.getElementById('msg-body');
  if (!sel || !body) return;
  const t = _composerTpls[parseInt(sel.value)];
  if (t) { body.value = t.body; renderMsgPreview(); }
}

function renderMsgPreview() {
  const lead = S.leads.find(l => l.id === S.curLeadId) || {};
  const agent = ((S.session && S.session.userName) || '').split(' ')[0] || '';
  const body = document.getElementById('msg-body')?.value || '';
  const pv = document.getElementById('msg-preview');
  if (pv) pv.textContent = body ? renderTemplate(body, lead, agent) : 'The message preview will appear here.';
}

// Append the configured booking link to the composer body (drives toward a
// booked discovery call — the conversion action). Templates can also use {booking}.
function insertBookingLink() {
  const url = (S.config && S.config.bookingUrl || '').trim();
  if (!url) { toast('Set your booking link in Settings first.', 'error'); return; }
  const body = document.getElementById('msg-body'); if (!body) return;
  const sep = (body.value && !/[\s]$/.test(body.value)) ? ' ' : '';
  body.value = body.value + sep + url;
  renderMsgPreview();
  body.focus();
}

async function sendComposer() {
  const lead = S.leads.find(l => l.id === S.curLeadId);
  if (!lead) return;
  const sendBtn = document.getElementById('msg-send-btn');
  if (sendBtn && sendBtn.disabled) return;                 // a send is already in flight
  const body = document.getElementById('msg-body')?.value || '';
  const subject = document.getElementById('msg-subject')?.value || '';
  if (sendBtn) { sendBtn.disabled = true; sendBtn.setAttribute('aria-busy', 'true'); }
  try {
    await sendMessage(lead, body, { channel: _composerChannel(), subject });
    const b = document.getElementById('msg-body'); if (b) b.value = '';
    renderMsgPreview();
    if (typeof renderLeadTimeline === 'function') renderLeadTimeline(lead);
    switchModalTab('timeline');
  } finally {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.removeAttribute('aria-busy'); }
  }
}

// ── Cadence (Sequences) — control surface for the CRM-native engine ──────
// Pure: tally enrollment states (unit-tested).
function sequenceCounts(seqs) {
  const c = { active:0, paused:0, replied:0, stopped:0, done:0, total:0 };
  (seqs || []).forEach(s => {
    c.total++;
    const st = String(s.state || '');
    if (st === 'active') c.active++;
    else if (st === 'paused:replied') c.replied++;
    else if (st.indexOf('paused:') === 0) c.paused++;
    else if (st.indexOf('stopped:') === 0) c.stopped++;
    else if (st === 'done') c.done++;
  });
  return c;
}

function seqStateLabel(st) {
  return ({
    'active':'Active', 'paused:claimed':'Paused (claimed)', 'paused:replied':'Replied — handoff',
    'paused:manual':'Paused (manual)', 'stopped:closed':'Closed', 'stopped:optout':'Opt-out',
    'stopped:rejected':'Rejected', 'stopped:manual':'Removed', 'done':'Completed',
  })[st] || st || '—';
}

function getSequence(leadId) { return (S.sequences || []).find(s => s.leadId === leadId) || null; }
function _seqLeadName(leadId) { const l = S.leads.find(x => x.id === leadId); return l ? l.name : leadId; }

// Render the whole Outreach section (its own top-level area, promoted out of
// Admin): cadence engine + launch readiness + active sequences, SMS templates,
// and call scripts. Called on navigate('outreach'). NB: named *Section to avoid
// colliding with analytics.js's renderOutreach (the Analytics outreach funnel).
function renderOutreachSection() {
  if (S.session && S.session.role !== 'admin') return;
  renderSequences();                       // cadence engine + readiness + sequence list
  if (typeof renderSmsTemplates === 'function') renderSmsTemplates();
  if (typeof renderScripts === 'function') renderScripts();
  if (typeof checkTriggerStatus === 'function') checkTriggerStatus(); // refresh cadence trigger state
}

function renderSequences() {
  if (typeof renderCadenceEngine === 'function') renderCadenceEngine();
  const wrap = document.getElementById('admin-seq-list'); if (!wrap) return;
  const seqs = S.sequences || [];
  const c = sequenceCounts(seqs);
  const cEl = document.getElementById('admin-seq-counts');
  if (cEl) cEl.textContent = `${c.active} active · ${c.paused} paused · ${c.replied} replied · ${c.stopped} stopped · ${c.done} completed`;
  if (!seqs.length) { wrap.innerHTML = '<div class="notes-empty">No leads in a sequence.</div>'; return; }
  wrap.innerHTML = seqs.slice(0, 100).map(s => {
    const st = String(s.state || '');
    const stopped = st.indexOf('stopped:') === 0 || st === 'done';
    const paused  = st.indexOf('paused:') === 0;
    const next = s.nextRunAt ? '· Next: ' + fmtD(s.nextRunAt) : '';
    return `<div class="team-row" style="margin-bottom:6px">
      <div class="team-info">
        <div class="team-name">${esc(_seqLeadName(s.leadId))}</div>
        <div class="team-meta">${esc(seqStateLabel(st))} · Step ${esc(String(s.stepIndex ?? 0))} ${esc(next)}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        ${paused ? `<button class="btn btn-success" style="font-size:11px;padding:4px 9px" onclick="resumeSequence('${esc(s.leadId)}')">Resume</button>`
                 : (!stopped ? `<button class="btn btn-ghost" style="font-size:11px;padding:4px 9px" onclick="pauseSequence('${esc(s.leadId)}')">Pause</button>` : '')}
        ${!stopped ? `<button class="btn btn-danger" style="font-size:11px;padding:4px 9px" onclick="unenrollSequence('${esc(s.leadId)}')">Remove</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

// Manual controls — update local state + persist via saveSequence (the engine respects it).
function _updateSequence(leadId, patch) {
  if (!Array.isArray(S.sequences)) S.sequences = [];
  let s = S.sequences.find(x => x.leadId === leadId);
  if (!s) { s = { leadId, stepIndex: 0, enrolledAt: new Date().toISOString() }; S.sequences.push(s); }
  Object.assign(s, patch, { updatedAt: new Date().toISOString() });
  saveLocal();
  bgSave({ action:'saveSequence', ...s }, 'Sequence');
  renderSequences();
}
function pauseSequence(leadId)   { _updateSequence(leadId, { state:'paused:manual', pausedReason:'manual' }); toast('Sequence paused.', 'success'); }
function resumeSequence(leadId)  { _updateSequence(leadId, { state:'active', pausedReason:'' }); toast('Sequence resumed.', 'success'); }
function unenrollSequence(leadId){ if (!confirm('Remove this lead from the sequence?')) return; _updateSequence(leadId, { state:'stopped:manual', pausedReason:'manual' }); toast('Lead removed from the sequence.', 'success'); }

// ── Cadence engine status + editable config (the deterministic backend engine) ─
// Reads trigger/live state + effective config from S.triggerStatus (checkTriggerStatus).
// A quick pre-launch checklist (read-only) so the operator can see whether the
// setup is actually ready before flipping the autopilot live.
function _readinessSendable(l) {
  const e = String(l && l.email || '').trim().toLowerCase();
  return !!e && e !== 'n/a' && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) && !/^(no-?reply|do-?not-?reply|postmaster|mailer-daemon)@/.test(e);
}
function renderLaunchReadiness() {
  const c = (S.triggerStatus && S.triggerStatus.cadenceConfig) || {};
  const ts = S.triggerStatus || {};
  const leads = S.leads || [];
  const withEmail = leads.filter(_readinessSendable).length;
  const newPool = leads.filter(l => (l.status || 'New') === 'New' && _readinessSendable(l)).length;
  const cov = leads.length ? Math.round(withEmail / leads.length * 100) : 0;
  const rows = [
    { ok: !!S.config.scriptUrl, label: 'Apps Script connected', detail: S.config.scriptUrl ? 'Backend reachable.' : 'Connect it in Settings first.' },
    { ok: cov >= 30, warn: cov > 0 && cov < 30, label: 'Email coverage', detail: withEmail + ' of ' + leads.length + ' leads have a usable email (' + cov + '%).' + (cov < 30 ? ' Low — the engine is email-first.' : '') },
    { ok: newPool > 0, label: 'Leads ready to email', detail: newPool + ' New lead' + (newPool === 1 ? '' : 's') + ' with an email.' },
    { ok: !!c.postalAddress, label: 'CAN-SPAM mailing address', detail: c.postalAddress ? 'Set.' : 'Required in the footer — set it in the field above.' },
    { ok: !c.aiPersonalize, warn: !!c.aiPersonalize, label: 'AI off for clean A/B', detail: c.aiPersonalize ? 'On — turn it off to A/B your subject lines cleanly.' : 'Off — your ranked options A/B cleanly.' },
    { info: true, label: 'Send mode', detail: ts.cadenceEnabled ? 'LIVE (sending).' : 'Simulation (dry-run).' },
    { info: true, label: 'Hourly trigger', detail: ts.cadence ? 'Active.' : 'Inactive — autopilot is paused.' },
    { manual: true, label: 'Deliverability DNS', detail: 'Confirm SPF + DKIM + DMARC on your sending domain in Resend (can\'t be checked from here).' },
  ];
  const icon = r => r.manual ? '◇' : r.info ? '·' : r.warn ? '▲' : r.ok ? '✓' : '✕';
  const color = r => (r.manual || r.info) ? 'var(--sub)' : r.warn ? 'var(--amber)' : r.ok ? 'var(--pos)' : 'var(--red)';
  return '<div class="card" style="margin-bottom:12px"><div class="card-title">Launch readiness</div>' +
    '<div class="card-sub" style="margin-bottom:6px">A quick check before you flip the autopilot live.</div>' +
    rows.map(r => '<div style="display:flex;gap:8px;align-items:flex-start;font-size:12px;margin-top:6px">' +
      '<span style="color:' + color(r) + ';font-weight:700;min-width:14px;text-align:center">' + icon(r) + '</span>' +
      '<span><strong style="color:var(--hl)">' + esc(r.label) + '.</strong> <span style="color:var(--sub)">' + esc(r.detail) + '</span></span></div>').join('') +
    '</div>';
}

function renderCadenceEngine() {
  const wrap = document.getElementById('admin-seq-engine'); if (!wrap) return;
  const ts = S.triggerStatus || {};
  const active = !!ts.cadence;          // hourly runCadence trigger installed?
  const live   = !!ts.cadenceEnabled;   // effective enabled (UI config or constant)
  const c  = ts.cadenceConfig || {};
  const v  = (x, d) => (x == null ? d : x);
  const lr = ts.lastCadenceRun;
  const modeBadge = live
    ? `<span style="font-size:11px;font-weight:600;color:var(--pos)">● LIVE</span>`
    : `<span style="font-size:11px;font-weight:600;color:var(--amber)">○ SIMULATION (dry-run)</span>`;
  const lastLine = lr && lr.ranAt
    ? `<div style="font-size:11px;color:var(--sub);margin-top:8px">Last run: ${fmtD(lr.ranAt)} ${fmtT(lr.ranAt)} · ${lr.mode==='live'?'enrolled':'would enroll'} ${lr.enrolled||0} · ${lr.mode==='live'?'sent':'would send'} ${lr.sent||0}</div>`
    : `<div style="font-size:11px;color:var(--sub);margin-top:8px">No runs recorded yet.</div>`;
  wrap.innerHTML = renderLaunchReadiness() + `
    <div class="card" style="background:var(--surface-hi);padding:12px 14px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:13px;font-weight:600;color:var(--hl)">Cadence engine</span>
        ${modeBadge}
        <span style="font-size:13px;color:var(--body)">· Hourly trigger:</span>
        <span style="font-size:13px;font-weight:600;color:${active?'var(--pos)':'var(--body)'}">${active?'● Active':'○ Inactive'}</span>
        <button class="btn ${active?'btn-danger':'btn-success'} btn-xs" onclick="setTrigger('runCadence',${!active})">${active?'Deactivate':'Activate'}</button>
        <button id="run-cadence-now-btn" class="btn btn-primary btn-xs" onclick="runCadenceNow()">Run now</button>
      </div>
      ${lastLine}
      <div class="form-grid" style="margin-top:12px;gap:8px">
        <div class="field"><label>Daily send cap</label><input type="number" id="cad-cap" value="${esc(String(v(c.dailyCap,200)))}" min="1"></div>
        <div class="field"><label>Signing person · {agent}</label><input type="text" id="cad-agent" value="${esc(v(c.agentName,''))}" placeholder="Andres"></div>
        <div class="field"><label>Company · {company}</label><input type="text" id="cad-company" value="${esc(v(c.company,''))}" placeholder="AXIUS"></div>
        <div class="field"><label>Days between touches</label><input type="number" id="cad-gap" value="${esc(String(v(c.gapDays,2)))}" min="1"></div>
        <div class="field"><label>Start hour (0–23)</label><input type="number" id="cad-qstart" value="${esc(String(v(c.quietStart,8)))}" min="0" max="23"></div>
        <div class="field"><label>End hour (1–24)</label><input type="number" id="cad-qend" value="${esc(String(v(c.quietEnd,20)))}" min="1" max="24"></div>
      </div>
      <div class="field" style="margin-top:8px"><label>Mailing address (CAN-SPAM · email footer)</label><input type="text" id="cad-address" value="${esc(v(c.postalAddress,''))}" placeholder="AXIUS, 123 Main St, Austin, TX 78701"></div>
      <label style="display:flex;align-items:flex-start;gap:8px;margin-top:10px;font-size:12px;color:var(--hl);cursor:pointer">
        <input type="checkbox" id="cad-enabled" ${live?'checked':''} style="margin-top:2px">
        <span>Send live messages. Unchecked = simulation: logs what it would send without sending anything.</span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:8px;margin-top:8px;font-size:12px;color:var(--hl);cursor:pointer">
        <input type="checkbox" id="cad-aipersonalize" ${c.aiPersonalize?'checked':''} style="margin-top:2px">
        <span>AI-personalized first email. Analyze each lead (type, city, ratings) and tailor the opening outreach to lift reply rates. Falls back to the template if AI is unavailable.</span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:8px;margin-top:8px;font-size:12px;color:var(--hl);cursor:pointer">
        <input type="checkbox" id="cad-aireplies" ${c.aiReplies?'checked':''} style="margin-top:2px">
        <span>AI auto-replies. When a business replies, draft a tailored response (with your booking link) and send it automatically — looping until they book.</span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:8px;margin-top:8px;font-size:12px;color:var(--hl);cursor:pointer">
        <input type="checkbox" id="cad-sendtime" ${c.sendTimeOptimized?'checked':''} style="margin-top:2px">
        <span>Send Tuesday–Thursday mornings only. Concentrate sends into peak open windows, in each lead's local time. Off = send any weekday within quiet hours (faster, higher volume).</span>
      </label>
      <div style="font-size:11px;color:var(--amber);margin-top:6px">Turn on "live" only with a legal basis for consent. Quiet hours + send timing now use each lead's local time zone. The engine always respects opt-outs and the cap. AI replies are reply-gated and capped per lead.</div>
      <button class="btn btn-primary btn-xs" style="margin-top:10px" onclick="saveCadenceConfig()">Save configuration</button>

      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
        <div style="font-size:12px;font-weight:600;color:var(--hl);margin-bottom:3px">Preview on real leads</div>
        <div style="font-size:11px;color:var(--sub);margin-bottom:8px">Renders the exact outreach for the leads you <strong>select in the Leads tab</strong> (the AI-personalized first email + the follow-up templates) and shows it right here, just as that business would receive it. If you don't select any, it uses your first few leads. <strong>This never sends anything to the leads.</strong> The email box below is optional and only sends copies to <em>your own</em> inbox so you can read them in a real mail client.</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <input type="email" id="cad-test-email" placeholder="optional — email copies to my own inbox" style="flex:1;min-width:200px;font-size:16px">
          <button class="btn btn-primary btn-xs" id="cad-test-btn" onclick="sendCadenceTest()">Generate preview</button>
        </div>
        <div id="cad-preview-output" style="margin-top:10px"></div>
      </div>
    </div>`;
}

// QA preview: ask the server to render the real outreach for the SELECTED leads
// (it owns the AI personalization) and show it on screen. Optionally also emails
// copies. Uses S.selected as-is so it always reflects exactly what you picked.
async function sendCadenceTest() {
  if (!S.config.scriptUrl) { toast('Connect Apps Script first.', 'error'); return; }
  const g = id => document.getElementById(id);
  const to = (g('cad-test-email')?.value || '').trim();
  if (to && !/.+@.+\..+/.test(to)) { toast('That email address looks off. Leave it blank to just preview on screen.', 'error'); return; }
  let ids = [...(S.selected || [])];
  let usingSelection = ids.length > 0;
  if (!ids.length) ids = (S.leads || []).slice(0, 3).map(l => l.id);
  if (!ids.length) { toast('No leads yet. Scrape or import some first.', 'error', 6000); return; }
  ids = ids.slice(0, 8);
  const btn = g('cad-test-btn'), out = g('cad-preview-output');
  if (btn && btn.disabled) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Rendering…'; }
  if (out) out.innerHTML = '<div style="font-size:11px;color:var(--sub)">Rendering ' + ids.length + (usingSelection ? ' selected' : '') + ' lead' + (ids.length !== 1 ? 's' : '') + '…' + (g('cad-aipersonalize')?.checked ? ' (AI personalization can take a few seconds)' : '') + '</div>';
  try {
    const res = await sheetsCall({ action:'previewOutreach', to, leadIds: ids });
    if (res && res.success && res.previews) {
      renderCadencePreviews(res, out, to);
      if (to && res.sent) toast(res.sent + ' preview copies sent to your inbox (' + to + '). Nothing was sent to any lead.', 'success', 7000);
    } else {
      if (out) out.innerHTML = '';
      toast('Preview failed: ' + ((res && res.error) || 'check the Apps Script connection and that you are signed in as admin.'), 'error', 7000);
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Generate preview'; }
  }
}

// Render the returned previews inline so you can read the exact email per lead.
function renderCadencePreviews(res, out, to) {
  if (!out) return;
  const previews = res.previews || [];
  if (!previews.length) { out.innerHTML = '<div class="notes-empty">Nothing to preview for those leads.</div>'; return; }
  const head = '<div style="font-size:11px;color:var(--sub);margin:4px 0 8px">Signed by <strong>' + esc(res.agent || '') + '</strong> · ' + esc(res.company || '') + ' · AI personalization ' + (res.aiOn ? 'ON' : 'OFF') + (to ? ' · copies sent to your inbox (' + esc(to) + ')' : '') + '</div>';
  const cards = previews.map(p => {
    const tag = p.step === 1
      ? ('First email · ' + esc(p.leadName || 'lead') + (p.city ? (', ' + esc(p.city)) : '') + (p.segment ? ' · ' + esc(p.segment) + ' angle' : '') + ' · ' + (p.personalized ? 'AI-personalized' : 'template'))
      : ('Follow-up ' + p.step + ' · template');
    return '<div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;background:var(--surface)">'
      + '<div style="font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--accent)">' + tag + '</div>'
      + '<div style="font-size:12px;color:var(--hl);font-weight:600;margin-top:5px">Subject: ' + esc(p.subject || '') + '</div>'
      + '<div style="font-size:12.5px;color:var(--body);white-space:pre-wrap;margin-top:6px;line-height:1.55">' + esc(p.body || '') + '</div>'
      + '</div>';
  }).join('');
  out.innerHTML = head + cards;
}

// Persist the operator-tunable cadence config. Confirms before flipping to live.
async function saveCadenceConfig() {
  if (!S.config.scriptUrl) { toast('Set the Apps Script URL first.', 'error'); return; }
  const g = id => document.getElementById(id);
  const enabled = !!(g('cad-enabled') && g('cad-enabled').checked);
  const wasLive = !!(S.triggerStatus && S.triggerStatus.cadenceEnabled);
  if (enabled && !wasLive && !confirm('Turn on LIVE sending? Make sure Twilio/WhatsApp are provisioned and approved, and that you have a legal basis for consent. The engine will start sending on the next run.')) return;
  const config = {
    enabled,
    dailyCap:      parseInt(g('cad-cap')?.value) || 200,
    agentName:     g('cad-agent')?.value?.trim() || '',
    company:       g('cad-company')?.value?.trim() || '',
    gapDays:       parseInt(g('cad-gap')?.value) || 2,
    quietStart:    parseInt(g('cad-qstart')?.value),
    quietEnd:      parseInt(g('cad-qend')?.value),
    postalAddress: g('cad-address')?.value?.trim() || '',
    aiReplies:     !!(g('cad-aireplies') && g('cad-aireplies').checked),
    aiPersonalize: !!(g('cad-aipersonalize') && g('cad-aipersonalize').checked),
    sendTimeOptimized: !!(g('cad-sendtime') && g('cad-sendtime').checked),
  };
  const res = await sheetsCall({ action:'saveCadenceConfig', config });
  if (res?.success) {
    if (!S.triggerStatus) S.triggerStatus = {};
    S.triggerStatus.cadenceConfig = res.config;
    S.triggerStatus.cadenceEnabled = res.config.enabled;
    toast('Engine configuration saved.', 'success');
    renderCadenceEngine();
  } else {
    toast('Error saving the engine configuration.', 'error', 5000);
  }
}

// On-demand cadence pass (dry-run while CADENCE_ENABLED=false). Previews/verifies
// enrollment + intended sends without waiting for the hourly trigger.
async function runCadenceNow() {
  if (!S.config.scriptUrl) { toast('Set the Apps Script URL first.', 'error'); return; }
  const btn = document.getElementById('run-cadence-now-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Running...'; }
  const res = await sheetsCall({ action:'runCadenceNow' });
  if (btn) { btn.disabled = false; btn.textContent = 'Run now'; }
  if (res?.success && res.skipped) {
    toast('Another engine run is already in progress. Try again in a moment.', 'error', 5000);
    return;
  }
  if (res?.success) {
    if (!S.triggerStatus) S.triggerStatus = {};
    S.triggerStatus.lastCadenceRun = { ranAt: res.ranAt, mode: res.mode, enrolled: res.enrolled, sent: res.sent };
    const verb = res.mode === 'live'
      ? `enrolled ${res.enrolled||0}, sent ${res.sent||0}`
      : `simulation: would enroll ${res.enrolled||0}, would send ${res.sent||0}`;
    toast('Cadence engine run complete — ' + verb + '.', 'success', 5000);
    if (res.mode === 'live') await syncNow();   // bring newly-enrolled sequences into view
    renderCadenceEngine();
    renderSequences();
  } else {
    toast('Error running the cadence engine. Check the Apps Script.', 'error', 5000);
  }
}
