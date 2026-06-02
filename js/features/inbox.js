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

function renderResponder() {
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
