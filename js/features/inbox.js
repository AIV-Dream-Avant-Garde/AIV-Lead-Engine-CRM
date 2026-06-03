/* ── FEATURE: "Responder ahora" — leads awaiting a human reply ──────────────
   Speed-to-lead queue. Surfaces every lead whose latest message is INBOUND
   (the ball is in our court) so a rep answers fast. Responding quickly is the
   single biggest conversion lever in outreach. The pure selectors at the top
   are unit-tested in tests/cases.js; the render functions below touch the DOM. */

// Leads whose most recent interaction is inbound and who aren't terminal
// (opted-out / closed). Returns [{lead, repliedAt, lastMsg}], newest first. Pure.
function leadsNeedingResponse(leads, interactions) {
  const lastIn = {}, lastOut = {}, lastMsg = {};
  (interactions || []).forEach(it => {
    if (!it || !it.leadId) return;
    const t = it.createdAt ? new Date(it.createdAt).getTime() : 0;
    if (it.direction === 'in') {
      if (t >= (lastIn[it.leadId] || 0)) { lastIn[it.leadId] = t; lastMsg[it.leadId] = it.body || ''; }
    } else if (it.direction === 'out') {
      if (t > (lastOut[it.leadId] || 0)) lastOut[it.leadId] = t;
    }
  });
  const terminal = { 'No llamar': 1, 'Cerrado': 1 };
  return (leads || [])
    .filter(l => l && lastIn[l.id] && !terminal[l.status] && lastIn[l.id] > (lastOut[l.id] || 0))
    .map(l => ({ lead: l, repliedAt: lastIn[l.id], lastMsg: lastMsg[l.id] || '' }))
    .sort((a, b) => b.repliedAt - a.repliedAt);
}

// Compact "time waited" label from a past timestamp to now. Pure.
function waitedLabel(ts, nowMs) {
  const m = Math.max(0, Math.floor((nowMs - ts) / 60000));
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}

// ── Render (DOM) ───────────────────────────────────────────────────────────
function responderCount() { return leadsNeedingResponse(S.leads, S.interactions).length; }

// ── Near-real-time reply alerts (browser notification + sound) ───────────────
// The background poll (main.js) syncs every ~75s; api.js calls notifyNewReplies()
// when fresh inbound messages arrive, so a rep is alerted to respond fast.
let _replyAlertsAsked = false;
function requestReplyAlerts() {
  if (_replyAlertsAsked) return; _replyAlertsAsked = true;
  try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
}
function _replyBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
    const ctx = new Ctx(), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.start(); o.stop(ctx.currentTime + 0.26);
  } catch (e) {}
}
function notifyNewReplies(items) {
  if (!Array.isArray(items) || !items.length) return;
  _replyBeep();
  const n = items.length, first = items[0] || {};
  const who   = first.leadName || 'Un lead';
  const title = n === 1 ? 'Nueva respuesta — ' + who : n + ' respuestas nuevas';
  const body  = n === 1 ? String(first.body || '').slice(0, 120) : 'Ábrelas en "Responder ahora".';
  try {
    if (window.Notification && Notification.permission === 'granted') {
      const note = new Notification(title, { body, tag: 'aiv-reply' });
      note.onclick = () => { try { window.focus(); navigate('responder'); note.close(); } catch (e) {} };
    }
  } catch (e) {}
  if (typeof toast === 'function') toast(title + (n === 1 ? '' : ''), 'success', 6000);
  if (typeof updateBadges === 'function') updateBadges();
}

function renderResponder() {
  requestReplyAlerts();   // ask for notification permission on first visit (user gesture)
  const wrap = document.getElementById('responder-list'); if (!wrap) return;
  const items = leadsNeedingResponse(S.leads, S.interactions);
  const cEl = document.getElementById('responder-count');
  if (cEl) cEl.textContent = items.length
    ? items.length + (items.length === 1 ? ' lead espera respuesta' : ' leads esperan respuesta')
    : '';
  if (!items.length) {
    wrap.innerHTML = '<div class="notes-empty">Nadie espera respuesta ahora mismo. En cuanto un lead conteste, aparece aquí para que lo atiendas de inmediato. Responder rápido es lo que más sube la conversión.</div>';
    return;
  }
  const now = Date.now();
  wrap.innerHTML = items.map(({ lead, repliedAt, lastMsg }) => `
    <div class="team-row" style="margin-bottom:6px;cursor:pointer" onclick="openLead('${esc(lead.id)}')">
      <div class="team-info" style="min-width:0">
        <div class="team-name">${esc(lead.name || 'Sin nombre')}<span class="pill" style="margin-left:8px">${esc(waitedLabel(repliedAt, now))} esperando</span></div>
        <div class="team-meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:52ch">${esc((lastMsg || '').slice(0, 100)) || '—'}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        ${(lead.phone && lead.phone !== 'N/A') ? `<button class="btn btn-success btn-xs" onclick="event.stopPropagation();makeCall('${esc(lead.id)}')">Llamar</button>` : ''}
        <button class="btn btn-primary btn-xs" onclick="event.stopPropagation();openLead('${esc(lead.id)}')">Responder</button>
      </div>
    </div>`).join('');
}
