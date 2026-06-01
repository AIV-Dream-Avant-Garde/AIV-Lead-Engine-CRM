/* ── FEATURE: Outreach — channel routing, message rendering, opt-out (Project A) ──
   Slice 1 = pure logic only (no DOM, no network) so it is fully unit-tested.
   The manual composer + sendMessage (DOM/backend) arrive in a later slice.     */

// Which channel to use for a lead, by country. US → SMS, Colombia → WhatsApp,
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
// gracefully (never leave a literal "{ciudad}"); whitespace is tidied. Pure.
function renderTemplate(body, lead, agent) {
  lead = lead || {};
  const company = (typeof S !== 'undefined' && S.config && S.config.companyName) ? S.config.companyName : 'AXIUS';
  const map = {
    negocio:   lead.name    || '',
    ciudad:    lead.city    || '',
    barrio:    lead.barrio  || '',
    categoria: lead.keyword || '',
    nombre:    lead.contactName || lead.name || '',
    empresa:   company,
    agente:    agent || '',
    seguimiento: lead.followUpDate ? (typeof fmtD === 'function' ? fmtD(lead.followUpDate) : String(lead.followUpDate)) : '',
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
  if (lead.status === 'No llamar') { toast('Este lead está en "No llamar" / opt-out — no se envía.', 'error'); return null; }
  const agent = ((S.session && S.session.userName) || '').split(' ')[0] || '';
  const text  = renderTemplate(body, lead, agent);
  if (!text.trim()) { toast('El mensaje está vacío.', 'error'); return null; }

  // Resolve recipient by channel: email → lead.email; sms/whatsapp → E.164 phone.
  let phoneE164 = '', email = '', subject = '';
  if (channel === 'email') {
    email = (lead.email || '').trim();
    if (!email) { toast('El lead no tiene email.', 'error'); return null; }
    subject = renderTemplate(opts.subject || 'AXIUS', lead, agent) || 'AXIUS';
  } else {
    phoneE164 = toE164(lead.phone, lead.country);
    if (!phoneE164) { toast('El número del lead no es válido para enviar.', 'error'); return null; }
  }

  const logBody = channel === 'email' ? ('[Asunto: ' + subject + '] ' + text) : text;
  const it = addInteraction({ leadId:lead.id, leadName:lead.name, phone:lead.phone, channel, direction:'out', stepTag:opts.stepTag||'', body:logBody, status:'queued' });
  lead.lastTouchAt = new Date().toISOString();
  if (typeof pushLead === 'function') pushLead(lead);

  // Demo mode: local-only success (no backend), so the composer demos cleanly.
  if (S.demoMode) { it.status = 'sent'; it.sid = 'demo'; it._synced = true; saveLocal(); toast('Mensaje enviado (demo).', 'success'); if (typeof renderAll === 'function') renderAll(); return it; }

  if (!S.config.scriptUrl) { it.status = 'failed'; it.error = 'sin conexión'; persistInteraction(it); toast('Sin Apps Script configurado: el mensaje quedó registrado pero no se envió.', 'error', 6000); return it; }

  const req = channel === 'email'
    ? { action:'sendEmail', id:it.id, leadId:lead.id, email, subject, body:text, stepTag:it.stepTag }
    : { action:'sendMessage', id:it.id, leadId:lead.id, phoneE164, channel, body:text, stepTag:it.stepTag };
  const res = await sheetsCall(req);
  if (res && res.success) { it.status = 'sent'; it.sid = res.sid || res.id || ''; toast('Enviado por ' + (CHANNEL_LABELS[channel] || channel) + '.', 'success'); }
  else { it.status = 'failed'; it.error = (res && res.error) || 'sin respuesta'; toast('No se pudo enviar: ' + it.error, 'error', 6000); }
  persistInteraction(it);
  if (typeof renderAll === 'function') renderAll();
  return it;
}

// ── Lead-modal composer (manual send) ─────────────────────────────────
let _composerTpls = [];
function _composerChannel() { return document.getElementById('msg-channel')?.value || 'sms'; }
function _toggleSubject() { const w = document.getElementById('msg-subject-wrap'); if (w) w.style.display = (_composerChannel() === 'email') ? '' : 'none'; }

function renderComposer(lead) {
  const csel = document.getElementById('msg-channel');
  if (!csel || !lead) return;
  const def = pickChannel(lead);
  csel.innerHTML = ['sms','whatsapp','email'].map(c => `<option value="${c}"${c===def?' selected':''}>${CHANNEL_LABELS[c]||c}</option>`).join('');
  csel.onchange = () => { _toggleSubject(); _fillComposerTemplates(lead); renderMsgPreview(); };
  const body = document.getElementById('msg-body'); if (body) body.value = '';
  const subj = document.getElementById('msg-subject'); if (subj) subj.value = '';
  _toggleSubject();
  _fillComposerTemplates(lead);
  renderMsgPreview();
  const optedOut = lead.status === 'No llamar';
  const note = document.getElementById('msg-optout-note');
  const btn  = document.getElementById('msg-send-btn');
  if (note) { note.style.display = optedOut ? 'block' : 'none'; note.textContent = optedOut ? 'Lead en "No llamar" / opt-out — no se puede enviar.' : ''; }
  if (btn) btn.disabled = optedOut;
}

function _fillComposerTemplates(lead) {
  const ch = _composerChannel();
  const seeded = (typeof OUTREACH_TEMPLATES !== 'undefined' && OUTREACH_TEMPLATES[lead.country] && OUTREACH_TEMPLATES[lead.country][ch]) || [];
  const custom = (S.smsTemplates || []).map(t => ({ name: t.name, body: t.body }));
  _composerTpls = seeded.concat(custom);
  const sel = document.getElementById('msg-template');
  if (sel) sel.innerHTML = '<option value="">— plantilla —</option>' + _composerTpls.map((t,i) => `<option value="${i}">${esc(t.name)}</option>`).join('');
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
  if (pv) pv.textContent = body ? renderTemplate(body, lead, agent) : 'La vista previa del mensaje aparecerá aquí.';
}

async function sendComposer() {
  const lead = S.leads.find(l => l.id === S.curLeadId);
  if (!lead) return;
  const body = document.getElementById('msg-body')?.value || '';
  const subject = document.getElementById('msg-subject')?.value || '';
  await sendMessage(lead, body, { channel: _composerChannel(), subject });
  const b = document.getElementById('msg-body'); if (b) b.value = '';
  renderMsgPreview();
  if (typeof renderLeadTimeline === 'function') renderLeadTimeline(lead);
  switchModalTab('timeline');
}

// ── Cadence (Secuencias) — control surface for the CRM-native engine ──────
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
    'active':'Activa', 'paused:claimed':'Pausada (reclamada)', 'paused:replied':'Respondió — handoff',
    'paused:manual':'Pausada (manual)', 'stopped:closed':'Cerrada', 'stopped:optout':'Opt-out',
    'stopped:rejected':'Rechazada', 'stopped:manual':'Retirada', 'done':'Completada',
  })[st] || st || '—';
}

function getSequence(leadId) { return (S.sequences || []).find(s => s.leadId === leadId) || null; }
function _seqLeadName(leadId) { const l = S.leads.find(x => x.id === leadId); return l ? l.name : leadId; }

function renderSequences() {
  if (typeof renderCadenceEngine === 'function') renderCadenceEngine();
  const wrap = document.getElementById('admin-seq-list'); if (!wrap) return;
  const seqs = S.sequences || [];
  const c = sequenceCounts(seqs);
  const cEl = document.getElementById('admin-seq-counts');
  if (cEl) cEl.textContent = `${c.active} activas · ${c.paused} pausadas · ${c.replied} respondieron · ${c.stopped} detenidas · ${c.done} completadas`;
  if (!seqs.length) { wrap.innerHTML = '<div class="notes-empty">Sin leads en secuencia.</div>'; return; }
  wrap.innerHTML = seqs.slice(0, 100).map(s => {
    const st = String(s.state || '');
    const stopped = st.indexOf('stopped:') === 0 || st === 'done';
    const paused  = st.indexOf('paused:') === 0;
    const next = s.nextRunAt ? '· Próx: ' + fmtD(s.nextRunAt) : '';
    return `<div class="team-row" style="margin-bottom:6px">
      <div class="team-info">
        <div class="team-name">${esc(_seqLeadName(s.leadId))}</div>
        <div class="team-meta">${esc(seqStateLabel(st))} · Paso ${esc(String(s.stepIndex ?? 0))} ${esc(next)}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        ${paused ? `<button class="btn btn-success" style="font-size:11px;padding:4px 9px" onclick="resumeSequence('${esc(s.leadId)}')">Reanudar</button>`
                 : (!stopped ? `<button class="btn btn-ghost" style="font-size:11px;padding:4px 9px" onclick="pauseSequence('${esc(s.leadId)}')">Pausar</button>` : '')}
        ${!stopped ? `<button class="btn btn-danger" style="font-size:11px;padding:4px 9px" onclick="unenrollSequence('${esc(s.leadId)}')">Sacar</button>` : ''}
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
  if (S.config.scriptUrl) sheetsCall({ action:'saveSequence', ...s });
  renderSequences();
}
function pauseSequence(leadId)   { _updateSequence(leadId, { state:'paused:manual', pausedReason:'manual' }); toast('Secuencia pausada.', 'success'); }
function resumeSequence(leadId)  { _updateSequence(leadId, { state:'active', pausedReason:'' }); toast('Secuencia reanudada.', 'success'); }
function unenrollSequence(leadId){ if (!confirm('¿Sacar este lead de la secuencia?')) return; _updateSequence(leadId, { state:'stopped:manual', pausedReason:'manual' }); toast('Lead retirado de la secuencia.', 'success'); }

// ── Cadence engine status + controls (the deterministic backend engine) ──────
// Reads trigger/live state from S.triggerStatus (set by checkTriggerStatus).
function renderCadenceEngine() {
  const wrap = document.getElementById('admin-seq-engine'); if (!wrap) return;
  const ts = S.triggerStatus || {};
  const active = !!ts.cadence;          // hourly runCadence trigger installed?
  const live   = !!ts.cadenceEnabled;   // CADENCE_ENABLED in Code.gs
  const lr = ts.lastCadenceRun;
  const modeBadge = live
    ? `<span style="font-size:11px;font-weight:600;color:var(--pos)">● EN VIVO</span>`
    : `<span style="font-size:11px;font-weight:600;color:var(--amber)">○ SIMULACIÓN (dry-run)</span>`;
  const lastLine = lr && lr.ranAt
    ? `<div style="font-size:11px;color:var(--sub);margin-top:8px">Última corrida: ${fmtD(lr.ranAt)} ${fmtT(lr.ranAt)} · ${lr.mode==='live'?'inscritos':'inscribiría'} ${lr.enrolled||0} · ${lr.mode==='live'?'enviados':'enviaría'} ${lr.sent||0}</div>`
    : `<div style="font-size:11px;color:var(--sub);margin-top:8px">Sin corridas registradas aún.</div>`;
  const liveNote = live ? '' : `<div style="font-size:11px;color:var(--amber);margin-top:6px">Modo simulación: registra lo que enviaría, sin enviar nada. Para activar envíos reales, pon <code>CADENCE_ENABLED = true</code> en Code.gs (tras aprovisionar Twilio/WhatsApp).</div>`;
  wrap.innerHTML = `
    <div class="card" style="background:var(--surface-hi);padding:12px 14px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:13px;font-weight:600;color:var(--hl)">Motor de cadencia</span>
        ${modeBadge}
        <span style="font-size:13px;color:var(--body)">· Trigger horario:</span>
        <span style="font-size:13px;font-weight:600;color:${active?'var(--pos)':'var(--body)'}">${active?'● Activo':'○ Inactivo'}</span>
        <button class="btn ${active?'btn-danger':'btn-success'}" style="font-size:11px;padding:4px 10px" onclick="setTrigger('runCadence',${!active})">${active?'Desactivar':'Activar'}</button>
        <button id="run-cadence-now-btn" class="btn btn-primary" style="font-size:11px;padding:4px 10px" onclick="runCadenceNow()">Ejecutar ahora</button>
      </div>
      ${lastLine}
      ${liveNote}
    </div>`;
}

// On-demand cadence pass (dry-run while CADENCE_ENABLED=false). Previews/verifies
// enrollment + intended sends without waiting for the hourly trigger.
async function runCadenceNow() {
  if (!S.config.scriptUrl) { toast('Configura el Apps Script URL primero.', 'error'); return; }
  const btn = document.getElementById('run-cadence-now-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Ejecutando...'; }
  const res = await sheetsCall({ action:'runCadenceNow' });
  if (btn) { btn.disabled = false; btn.textContent = 'Ejecutar ahora'; }
  if (res?.success && res.skipped) {
    toast('Otra corrida del motor está en progreso. Intenta de nuevo en un momento.', 'error', 5000);
    return;
  }
  if (res?.success) {
    if (!S.triggerStatus) S.triggerStatus = {};
    S.triggerStatus.lastCadenceRun = { ranAt: res.ranAt, mode: res.mode, enrolled: res.enrolled, sent: res.sent };
    const verb = res.mode === 'live'
      ? `inscritos ${res.enrolled||0}, enviados ${res.sent||0}`
      : `simulación: inscribiría ${res.enrolled||0}, enviaría ${res.sent||0}`;
    toast('Motor de cadencia ejecutado — ' + verb + '.', 'success', 5000);
    if (res.mode === 'live') await syncNow();   // bring newly-enrolled sequences into view
    renderCadenceEngine();
    renderSequences();
  } else {
    toast('Error al ejecutar el motor de cadencia. Verifica el Apps Script.', 'error', 5000);
  }
}
