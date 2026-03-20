/* ── FEATURE: Twilio VoIP calls, call widget, call log ───── */

// ── initTwilio — single consolidated handler ───────────────
async function initTwilio() {
  if (!S.config.scriptUrl) { alert('Configura el Apps Script URL primero.'); return; }
  setSyncUI('syncing','Conectando Twilio...');
  try {
    const res = await sheetsCall({action:'getToken', identity:'agent'});
    if (!res || !res.token) {
      setSyncUI('error','Token fallido');
      alert('Error al obtener token Twilio. Verifica las credenciales en el Apps Script.');
      return;
    }
    if (CALL.device) CALL.device.destroy();
    CALL.device = new Twilio.Device(res.token, {logLevel:1, codecPreferences:['opus','pcmu']});
    CALL.device.on('registered', () => { setSyncUI('ok','Twilio listo'); alert('Twilio conectado. Ya puedes hacer llamadas desde el CRM.'); });
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
    alert('Error Twilio: ' + e.message);
  }
}

// ── makeCall — consolidated (auto-claim + consent + script) ─
function makeCall(leadId) {
  const l = S.leads.find(x => x.id === leadId);
  if (!l) return;
  if (l.status === 'No llamar')              { alert('Este lead tiene estado "No llamar".'); return; }
  if (!l.phone || l.phone === 'N/A')         { alert('Sin número de teléfono.'); return; }
  if (!CALL.device)                          { alert('Twilio no está conectado. Ve a Setup y haz click en "Conectar Twilio".'); return; }

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
    const hasContent = S.config.pitchScript || S.config.objectionsScript || S.config.closeScript;
    panel.classList.toggle('visible', !!hasContent);
    if (hasContent) cwTab('pitch');
  }

  document.querySelectorAll('.outcome-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('cw-notes').value = '';
  setCWStatus('ringing','Informa al prospecto primero');
  document.getElementById('call-widget').classList.add('visible');
}

async function confirmConsentAndCall() {
  if (!CALL.device) { alert('Twilio no está conectado.'); return; }
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

function hangUp()     { if (CALL.activeCall) CALL.activeCall.disconnect(); else onCallEnd(); }

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
  if (!CALL.outcome) { alert('Selecciona el resultado de la llamada.'); return; }
  const l   = S.leads.find(x => x.id === CALL.curLeadId);
  const rec = {
    id:uid(), leadId:CALL.curLeadId, leadName:l?.name||'', phone:l?.phone||'',
    callSid:CALL.callSid||'', outcome:CALL.outcome, duration:CALL.seconds,
    notes: document.getElementById('cw-notes').value.trim(),
    recordingUrl:'', driveUrl:'', consentConfirmed:CALL.consentConfirmed,
    calledAt: new Date().toISOString(),
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
  if (goNext) setTimeout(() => goNextLead(), 250);
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
    const audio = c.driveUrl ? `<audio class="call-audio" controls src="${esc(c.driveUrl)}"></audio>` : '';
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
  const next = (S.leads || []).find(l =>
    (l.status === 'Nuevo' || l.status === 'Contactado') &&
    l.status !== 'No llamar' && l.phone && l.phone !== 'N/A' &&
    !isLockedByOther(l)
  );
  if (next) { navigate('leads'); setTimeout(() => openLead(next.id), 150); }
  else       { alert('Sin más leads disponibles. ¡Buen trabajo!'); navigate('leads'); }
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
  document.querySelectorAll('.cw-stab').forEach(b => {
    b.classList.toggle('active',
      (tab === 'pitch'      && b.textContent.trim() === 'Pitch')      ||
      (tab === 'objections' && b.textContent.trim() === 'Objeciones') ||
      (tab === 'close'      && b.textContent.trim() === 'Cierre')
    );
  });
  const el = document.getElementById('cw-script-content');
  if (!el) return;
  if (tab === 'pitch')      el.textContent = S.config.pitchScript      || 'Sin pitch configurado. Ve a Setup → Guion.';
  if (tab === 'objections') el.textContent = S.config.objectionsScript || 'Sin objeciones configuradas.';
  if (tab === 'close')      el.textContent = S.config.closeScript      || 'Sin guion de cierre configurado.';
}

function saveCallScript() {
  S.config.companyName      = document.getElementById('cfg-company')?.value?.trim()    || '';
  S.config.callScript       = document.getElementById('cfg-script')?.value?.trim()     || '';
  S.config.pitchScript      = document.getElementById('cfg-pitch')?.value?.trim()      || '';
  S.config.objectionsScript = document.getElementById('cfg-objections')?.value?.trim() || '';
  S.config.closeScript      = document.getElementById('cfg-close')?.value?.trim()      || '';
  saveLocal();
  previewScript();
  alert('Guion guardado. Aparecerá en el widget de llamada.');
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

function getCallScript() {
  const company = S.config.companyName || '[empresa]';
  return (S.config.callScript || '"Hola, le llamo de [empresa]. Esta llamada puede ser grabada con fines de calidad. ¿Es un buen momento para hablar?"')
    .replace(/\[empresa\]/gi, company)
    .replace(/\[tu empresa\]/gi, company);
}
