/* ── FEATURE: Twilio VoIP calls, call widget, call log ───── */

// ── initTwilio — single consolidated handler ───────────────
async function initTwilio() {
  if (!S.config.scriptUrl) { toast('Configura el Apps Script URL primero.', 'error'); return; }
  setSyncUI('syncing','Conectando Twilio...');
  try {
    const res = await sheetsCall({action:'getToken', identity:'agent'});
    if (!res || !res.token) {
      setSyncUI('error','Token fallido');
      toast('Error al obtener token Twilio. Verifica las credenciales en el Apps Script.', 'error', 5000);
      return;
    }
    if (CALL.device) CALL.device.destroy();
    CALL.device = new Twilio.Device(res.token, {logLevel:1, codecPreferences:['opus','pcmu']});
    CALL.device.on('registered', () => { setSyncUI('ok','Twilio listo'); toast('Twilio conectado. Ya puedes hacer llamadas desde el CRM.', 'success'); });
    CALL.device.on('error',      err => { setSyncUI('error','Error Twilio'); console.error(err); });
    // Single incoming handler — both banner + CALL.incomingCall state
    CALL.device.on('incoming', call => {
      CALL.incomingCall = call;
      const from  = call.parameters?.From || 'Desconocido';
      const lead  = S.leads.find(l => l.phone && from.includes(l.phone.replace(/[^0-9]/g,'')));
      document.getElementById('ib-name').textContent  = lead?.name || 'Numero desconocido';
      document.getElementById('ib-phone').textContent = from;
      document.getElementById('incoming-banner').classList.add('visible');
    });
    await CALL.device.register();
  } catch(e) {
    setSyncUI('error','Error');
    toast('Error Twilio: ' + e.message, 'error', 5000);
  }
}

// ── makeCall — consolidated (auto-claim + consent + script) ─
function makeCall(leadId) {
  const l = S.leads.find(x => x.id === leadId);
  if (!l) return;
  if (l.status === 'No llamar')              { toast('Este lead tiene estado "No llamar".', 'error'); return; }
  if (!l.phone || l.phone === 'N/A')         { toast('Sin número de teléfono.', 'error'); return; }
  if (S.demoMode) { startDemoCall(leadId); return; }
  if (!CALL.device)                          { toast('Twilio no está conectado. Ve a Setup → Conectar Twilio.', 'error'); return; }

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
  document.getElementById('cw-controls').style.display = 'none';
  document.getElementById('cw-consent').style.display  = 'block';

  // Load consent/call script
  const scriptEl = document.getElementById('cw-consent-script');
  if (scriptEl) scriptEl.textContent = getCallScript();

  const cb = document.getElementById('cw-consent-btn');
  cb.className  = 'cw-consent-btn';
  cb.textContent = 'Informado al prospecto — conectar llamada';

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
  setCWStatus('ringing','Informa al prospecto primero');
  document.getElementById('call-widget').classList.add('visible');
}

async function confirmConsentAndCall() {
  if (S.demoMode) { runSimulatedCall(); return; }
  if (!CALL.device) { toast('Twilio no está conectado.', 'error'); return; }
  CALL.consentConfirmed = true;
  const cb = document.getElementById('cw-consent-btn');
  cb.className   = 'cw-consent-btn confirmed';
  cb.textContent = '✓ Consentimiento confirmado';
  document.getElementById('cw-consent').style.display   = 'none';
  document.getElementById('cw-controls').style.display  = 'flex';
  setCWStatus('ringing','Llamando...');
  const l = S.leads.find(x => x.id === CALL.curLeadId);
  if (!l) return;
  try {
    CALL.activeCall = await CALL.device.connect({params:{To: l.phone}});
    CALL.activeCall.on('accept', call => {
      CALL.callSid = call.parameters.CallSid;
      setCWStatus('connected','Conectado');
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

function hangUp() {
  if (S.demoMode) { if (CALL.timer) { clearInterval(CALL.timer); CALL.timer = null; } onCallEnd(); return; }
  if (CALL.activeCall) CALL.activeCall.disconnect(); else onCallEnd();
}

function toggleMute() {
  if (!CALL.activeCall) return;
  CALL.muted = !CALL.muted;
  CALL.activeCall.mute(CALL.muted);
  document.getElementById('cw-mute-btn').classList.toggle('active', CALL.muted);
  document.getElementById('cw-mute-label').textContent = CALL.muted ? 'Unmute' : 'Mute';
}

function onCallEnd() {
  if (CALL.timer) { clearInterval(CALL.timer); CALL.timer = null; }
  setCWStatus('ended','Llamada terminada · ' + fmtSec(CALL.seconds));
  document.getElementById('cw-post').classList.add('visible');
  const smsWrap = document.getElementById('cw-sms-wrap');
  if (smsWrap) smsWrap.style.display = S.config.scriptUrl && !S.demoMode ? '' : 'none';
  const l = S.leads.find(x => x.id === CALL.curLeadId);
  if (l && l.status === 'Nuevo') { l.status = 'Contactado'; l.updatedAt = new Date().toISOString(); pushLead(l); }
}

function setOutcome(val) {
  CALL.outcome = val;
  document.querySelectorAll('.outcome-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.outcome-btn[onclick="setOutcome('${val}')"]`)?.classList.add('active');
}

// saveCallLog — consolidated (goNext support, call note auto-added)
async function saveCallLog(goNext) {
  if (!CALL.outcome) { toast('Selecciona el resultado de la llamada.', 'error'); return; }
  const l   = S.leads.find(x => x.id === CALL.curLeadId);
  const rec = {
    id:uid(), leadId:CALL.curLeadId, leadName:l?.name||'', phone:l?.phone||'',
    callSid:CALL.callSid||'', outcome:CALL.outcome, duration:CALL.seconds,
    notes: document.getElementById('cw-notes').value.trim(),
    recordingUrl:'', driveUrl:'', consentConfirmed:CALL.consentConfirmed,
    calledAt: new Date().toISOString(),
    calledBy: S.session?.userId || '',
    calledByName: S.session?.userName || '',
  };
  S.calls.push(rec);
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'saveCall', ...rec});
  if (l) {
    if (!Array.isArray(l.notes)) l.notes = [];
    l.notes.push({
      date: rec.calledAt,
      text: 'Llamada: ' + (OUTCOME_LABELS[CALL.outcome] || CALL.outcome) + ' · ' + fmtSec(CALL.seconds) + (rec.notes ? ' · ' + rec.notes : ''),
    });
    l.updatedAt = rec.calledAt;
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
    const audio   = c.driveUrl
      ? `<audio class="call-audio" controls src="${esc(c.driveUrl)}"></audio>`
      : c.recordingUrl
        ? `<audio class="call-audio" controls src="${esc(c.recordingUrl)}"></audio>` : '';
    const consent = c.consentConfirmed ? '<span class="consent-tag">✓ Consentimiento</span>' : '';
    return `<div class="call-entry">
      <div class="call-entry-top">
        <span class="call-outcome-badge ${oc2}">${OUTCOME_LABELS[oc2]||oc2}</span>
        <span class="call-lead-link" onclick="${lead ? `openLead('${lead.id}')` : 'void(0)'}">${esc(c.leadName||'--')}</span>
        <span class="call-meta">${esc(c.phone||'--')} · ${dur} · ${fmtD(c.calledAt)} ${fmtT(c.calledAt)}${consent}</span>
      </div>
      ${c.notes ? `<div class="call-notes-text">${esc(c.notes)}</div>` : ''}
      ${audio}
    </div>`;
  }).join('') : '<div style="text-align:center;padding:40px;color:var(--body);font-size:13px">Sin llamadas registradas.</div>';
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
  }).join('') : '<div class="notes-empty">Sin llamadas previas.</div>';
}

function goNextLead() {
  if (S.dialerMode && S.dialerQueue.length > 0) {
    const nextId = S.dialerQueue.shift();
    updateDialerCounter();
    const lead = S.leads.find(l => l.id === nextId);
    if (lead && lead.status !== 'No llamar' && lead.phone && lead.phone !== 'N/A' && !isLockedByOther(lead)) {
      setTimeout(() => makeCall(nextId), 300);
    } else {
      goNextLead(); // skip invalid, try next
    }
    return;
  }
  const next = getFiltered().find(l =>
    (l.status === 'Nuevo' || l.status === 'Contactado') &&
    l.status !== 'No llamar' && l.phone && l.phone !== 'N/A' &&
    !isLockedByOther(l)
  );
  if (next) { navigate('leads'); setTimeout(() => openLead(next.id), 150); }
  else       { toast('Sin más leads disponibles. ¡Buen trabajo!', 'success'); navigate('leads'); }
}

function toggleDialer() {
  S.dialerMode = !S.dialerMode;
  if (S.dialerMode) {
    S.dialerQueue = getFiltered()
      .filter(l => (l.status === 'Nuevo' || l.status === 'Contactado') && l.phone && l.phone !== 'N/A' && !isLockedByOther(l))
      .map(l => l.id);
    if (!S.dialerQueue.length) { S.dialerMode = false; toast('Sin leads disponibles para marcar con los filtros actuales.', 'error'); return; }
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
    btn.textContent = S.dialerMode ? `⏹ Detener marcador (${S.dialerQueue.length})` : '▶ Marcador automatico';
    btn.classList.toggle('btn-danger', S.dialerMode);
    btn.classList.toggle('btn-primary', !S.dialerMode);
  }
  if (count) {
    count.textContent = S.dialerMode ? S.dialerQueue.length + ' en cola' : '';
    count.style.display = S.dialerMode ? '' : 'none';
  }
}

function skipDialerLead() {
  if (!S.dialerMode || !S.dialerQueue.length) return;
  S.dialerQueue.shift();
  updateDialerCounter();
  if (S.dialerQueue.length) goNextLead();
  else { S.dialerMode = false; updateDialerCounter(); toast('Cola terminada. Todos los leads trabajados.', 'success'); navigate('leads'); }
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
  document.getElementById('cw-lead-name').textContent = lead?.name || 'Numero desconocido';
  document.getElementById('cw-phone').textContent     = lead?.phone || from;
  document.getElementById('cw-consent').style.display  = 'none';
  document.getElementById('cw-controls').style.display = 'flex';
  document.getElementById('cw-post').classList.remove('visible');
  document.getElementById('cw-timer').textContent = '0:00';
  document.getElementById('call-widget').classList.add('visible');
  setCWStatus('connected','Llamada entrante conectada');
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
    pitch:      S.config.pitchScript      || 'Sin pitch configurado. Ve a Setup → Guion.',
    objections: S.config.objectionsScript || 'Sin objeciones configuradas.',
    close:      S.config.closeScript      || 'Sin guion de cierre configurado.',
    rebuttals:  'Sin rebuttals configurados. Agrega uno en Admin → Guiones.',
  };
  el.textContent = fallbacks[tab] || '';
}

function saveCallScript() {
  S.config.companyName      = document.getElementById('cfg-company')?.value?.trim()    || '';
  S.config.callScript       = document.getElementById('cfg-script')?.value?.trim()     || '';
  S.config.pitchScript      = document.getElementById('cfg-pitch')?.value?.trim()      || '';
  S.config.objectionsScript = document.getElementById('cfg-objections')?.value?.trim() || '';
  S.config.closeScript      = document.getElementById('cfg-close')?.value?.trim()      || '';
  saveLocal();
  previewScript();
  toast('Guion guardado', 'success');
}

function previewScript() {
  const company = document.getElementById('cfg-company')?.value?.trim() || '[empresa]';
  const script  = document.getElementById('cfg-script')?.value?.trim()  || '';
  const box     = document.getElementById('script-preview-box');
  if (!box) return;
  if (script) {
    box.style.display = 'block';
    box.textContent   = script.replace(/\[empresa\]/gi, company).replace(/\[tu empresa\]/gi, company);
  } else {
    box.style.display = 'none';
  }
}

function populateSmsTemplates() {
  const sel = document.getElementById('cw-sms-tpl');
  if (!sel) return;
  const templates = S.smsTemplates || [];
  sel.innerHTML = templates.length
    ? `<option value="">Selecciona plantilla...</option>` + templates.map((t,i) => `<option value="${i}">${esc(t.name)}</option>`).join('')
    : `<option value="">Sin plantillas — agrega en Admin</option>`;
}

async function sendPostCallSms() {
  if (!S.config.scriptUrl) { toast('Configura el Apps Script URL primero.', 'error'); return; }
  const idx = document.getElementById('cw-sms-tpl')?.value;
  if (idx === '' || idx === undefined) { toast('Selecciona una plantilla.', 'error'); return; }
  const tpl  = (S.smsTemplates||[])[parseInt(idx)];
  if (!tpl)  { toast('Plantilla no encontrada.', 'error'); return; }
  const l    = S.leads.find(x => x.id === CALL.curLeadId);
  if (!l || !l.phone || l.phone === 'N/A') { toast('Sin número de teléfono para este lead.', 'error'); return; }
  const body = tpl.body
    .replace(/\{nombre\}/gi,      l.name || '')
    .replace(/\{empresa\}/gi,     S.config.companyName || '')
    .replace(/\{seguimiento\}/gi, l.followUpDate || '');
  const res = await sheetsCall({action:'sendSMS', to:l.phone, body});
  if (res?.success) {
    if (!Array.isArray(l.notes)) l.notes = [];
    l.notes.push({date:new Date().toISOString(), text:'SMS enviado: ' + tpl.name});
    l.updatedAt = new Date().toISOString();
    pushLead(l);
    toast('SMS enviado correctamente.', 'success');
  } else {
    toast('Error al enviar SMS: ' + (res?.error || 'Sin respuesta'), 'error');
  }
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
  document.getElementById('cw-controls').style.display = 'none';
  document.getElementById('cw-consent').style.display  = 'block';

  const scriptEl = document.getElementById('cw-consent-script');
  if (scriptEl) scriptEl.textContent = getCallScript();

  const cb = document.getElementById('cw-consent-btn');
  cb.className   = 'cw-consent-btn';
  cb.textContent = 'Informado al prospecto — conectar llamada';

  document.querySelectorAll('.outcome-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('cw-notes').value = '';

  const skipBtn = document.getElementById('cw-skip-btn');
  if (skipBtn) skipBtn.style.display = S.dialerMode ? '' : 'none';

  populateSmsTemplates();
  setCWStatus('ringing', 'Informa al prospecto primero');
  document.getElementById('call-widget').classList.add('visible');
}

function runSimulatedCall() {
  CALL.consentConfirmed = true;
  CALL.callSid = 'CA-demo-' + Math.random().toString(36).slice(2, 10);

  const cb = document.getElementById('cw-consent-btn');
  if (cb) { cb.className = 'cw-consent-btn confirmed'; cb.textContent = '✓ Consentimiento confirmado'; }
  document.getElementById('cw-consent').style.display  = 'none';
  document.getElementById('cw-controls').style.display = 'flex';

  setCWStatus('ringing', 'Marcando…');

  setTimeout(() => {
    setCWStatus('connected', 'Conectado');
    CALL.timer = setInterval(() => {
      CALL.seconds++;
      const t = document.getElementById('cw-timer');
      if (t) t.textContent = fmtSec(CALL.seconds);
    }, 1000);
  }, 2000);
}

function getCallScript() {
  const company = S.config.companyName || '[empresa]';
  return (S.config.callScript || '"Hola, le llamo de [empresa]. Esta llamada puede ser grabada con fines de calidad. ¿Es un buen momento para hablar?"')
    .replace(/\[empresa\]/gi, company)
    .replace(/\[tu empresa\]/gi, company);
}
