/* ── FEATURE: Leads table, modal, CRUD ───────────────────── */

// ── Follow-up / source badge helpers ──────────────────────
function isOverdue(lead) {
  if (!lead.followUpDate) return false;
  return new Date(lead.followUpDate) < new Date() &&
    lead.status !== 'Cerrado' && lead.status !== 'No llamar';
}

function isTodayFU(lead) {
  if (!lead.followUpDate) return false;
  return new Date(lead.followUpDate).toDateString() === new Date().toDateString();
}

function fuBadgeHTML(lead) {
  if (!lead.followUpDate) return '';
  if (isOverdue(lead))  return `<span class="fu-badge fu-overdue">Vencido ${fmtD(lead.followUpDate)}</span>`;
  if (isTodayFU(lead))  return `<span class="fu-badge fu-today">Hoy</span>`;
  return `<span class="fu-badge fu-upcoming">${fmtD(lead.followUpDate)}</span>`;
}

function srcBadgeHTML(source) {
  if (!source) return '';
  const label = source.split(' · ')[0];
  const info  = SOURCES.find(s => source.startsWith(s.val));
  return `<span class="src-badge ${info ? info.cls : 'src-default'}" title="${esc(source)}">${esc(label)}</span>`;
}

// ── Filter / sort ──────────────────────────────────────────
function getFiltered() {
  const q    = (document.getElementById('tbl-q')?.value    || '').toLowerCase();
  const fc   = document.getElementById('f-city')?.value    || '';
  const fb   = document.getElementById('f-barrio')?.value  || '';
  const fsrc = document.getElementById('f-source')?.value  || '';
  const fs   = document.getElementById('f-status')?.value  || '';
  const ff   = document.getElementById('f-followup')?.value || '';
  const fm   = document.getElementById('f-mine')?.value    || '';
  return S.leads.filter(l => {
    if (fc   && l.city   !== fc)                           return false;
    if (fb   && l.barrio !== fb)                           return false;
    if (fsrc && !l.source?.startsWith(fsrc))               return false;
    if (fs   && l.status !== fs)                           return false;
    if (fm === 'mine') {
      const u = S.session?.userId || '';
      if (l.closerId !== u && l.lockedBy !== u && l.providerId !== u) return false;
    }
    if (ff === 'overdue' && !isOverdue(l))   return false;
    if (ff === 'today'   && !isTodayFU(l))   return false;
    if (ff === 'has'     && !l.followUpDate) return false;
    if (q && !`${l.name} ${l.phone} ${l.address} ${l.barrio} ${l.keyword} ${l.source} ${l.sourceDetail}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function getSorted(arr) {
  const col = S.sortCol, dir = S.sortDir;
  return [...arr].sort((a,b) => {
    const av = a[col] || '', bv = b[col] || '';
    return av < bv ? -dir : av > bv ? dir : 0;
  });
}

function sortBy(col) {
  if (S.sortCol === col) S.sortDir *= -1;
  else { S.sortCol = col; S.sortDir = -1; }
  renderTable();
}

// ── Table render ───────────────────────────────────────────
function renderTable() {
  const filtered = getSorted(getFiltered());
  const total    = filtered.length;
  const pages    = Math.max(1, Math.ceil(total / S.pageSize));
  S.page         = Math.min(S.page, pages);
  const slice    = filtered.slice((S.page - 1) * S.pageSize, S.page * S.pageSize);
  const tbody    = document.getElementById('tbl-body');
  if (!tbody) return;

  if (!slice.length) {
    // colspan=12: ☐ name phone city barrio source fu rating status updated lastCall + lock
    tbody.innerHTML = '<tr><td colspan="12" class="table-empty">Sin leads con los filtros actuales.</td></tr>';
  } else {
    tbody.innerHTML = slice.map(l => {
      const sc   = STATUS_CLS[l.status] || 'new';
      const sel  = S.selected.has(l.id) ? 'selected' : '';
      const dnc  = l.status === 'No llamar' ? 'dnc-row' : '';
      const rat  = l.rating && l.rating !== 'N/A' ? '★ ' + l.rating : '--';
      const lc0  = S.calls.filter(x => x.leadId === l.id)
        .sort((a,b) => new Date(b.calledAt) - new Date(a.calledAt))[0];
      const lc_  = lc0 ? fmtD(lc0.calledAt) + ' ' + esc(OUTCOME_LABELS[lc0.outcome] || lc0.outcome) : '—';
      // Lock column
      let lockCell = '';
      if (isLockedByMe(l))    lockCell = `<span class="lock-badge lock-mine">Mío · ${lockCountdown(l)}</span>`;
      else if (isLockedByOther(l)) lockCell = `<span class="lock-badge lock-other">${esc(getLockerName(l))} · ${lockCountdown(l)}</span>`;
      else                    lockCell = `<button class="claim-btn" onclick="event.stopPropagation();claimLead('${l.id}')">Reclamar</button>`;
      return `<tr class="${sel} ${dnc}" onclick="rowClick(event,'${l.id}')">
        <td onclick="event.stopPropagation()"><input type="checkbox" ${S.selected.has(l.id)?'checked':''} onchange="toggleSel('${l.id}',this.checked)"></td>
        <td class="name-cell">${esc(l.name)}</td>
        <td style="font-family:'DM Mono',monospace;font-size:11px">${esc(l.phone)}</td>
        <td style="font-size:11px">${esc(l.city   || '--')}</td>
        <td style="font-size:11px">${esc(l.barrio || '--')}</td>
        <td>${srcBadgeHTML(l.source)}</td>
        <td>${fuBadgeHTML(l)}</td>
        <td style="font-family:'DM Mono',monospace;font-size:11px">${esc(rat)}</td>
        <td><span class="sbadge ${sc}">${esc(l.status || 'Nuevo')}</span></td>
        <td style="font-size:11px">${fmtD(l.updatedAt || l.importedAt)}</td>
        <td style="font-size:11px">${lc_}</td>
        <td>${lockCell}</td>
      </tr>`;
    }).join('');
  }

  document.getElementById('tbl-count').textContent = total + ' lead' + (total !== 1 ? 's' : '');
  renderPagination(total, pages);
  updateBulkBar();

  document.querySelectorAll('thead th.sortable').forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    const m = th.getAttribute('onclick')?.match(/'(\w+)'/);
    if (m && m[1] === S.sortCol) th.classList.add(S.sortDir === 1 ? 'sort-asc' : 'sort-desc');
  });
}

function renderPagination(total, pages) {
  const pag = document.getElementById('tbl-pages');
  if (!pag) return;
  if (pages <= 1) { pag.innerHTML = ''; return; }
  const p = S.page;
  let html = `<button class="page-btn" onclick="goPage(${p-1})" ${p===1?'disabled':''}>&#8249;</button>`;
  const show = new Set([1, pages, p, p-1, p+1].filter(x => x >= 1 && x <= pages));
  let prev = 0;
  [...show].sort((a,b) => a-b).forEach(pg => {
    if (prev && pg - prev > 1) html += '<span class="page-ellipsis">...</span>';
    html += `<button class="page-btn${pg===p?' active':''}" onclick="goPage(${pg})">${pg}</button>`;
    prev = pg;
  });
  html += `<button class="page-btn" onclick="goPage(${p+1})" ${p===pages?'disabled':''}>&#8250;</button>`;
  pag.innerHTML = html;
}

function goPage(p)    { S.page = p; renderTable(); }
function clearFilters() {
  ['tbl-q','f-city','f-barrio','f-source','f-status','f-followup'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  renderTable();
}
function rowClick(e, id) { if (!e.target.matches('input')) openLead(id); }
function toggleSel(id, chk)  { if (chk) S.selected.add(id); else S.selected.delete(id); updateBulkBar(); renderTable(); }
function toggleAll(chk)       { getFiltered().forEach(l => chk ? S.selected.add(l.id) : S.selected.delete(l.id)); updateBulkBar(); renderTable(); }
function clearSelection()     { S.selected.clear(); const ca = document.getElementById('chk-all'); if (ca) ca.checked = false; updateBulkBar(); renderTable(); }
function updateBulkBar()      {
  const n = S.selected.size;
  document.getElementById('bulk-bar')?.classList.toggle('visible', n > 0);
  const bc = document.getElementById('bulk-count');
  if (bc) bc.textContent = n + ' seleccionado' + (n !== 1 ? 's' : '');
}
function applyBulkStatus() {
  const st = document.getElementById('bulk-status')?.value;
  if (!st) { alert('Selecciona un estado.'); return; }
  S.leads.forEach(l => { if (S.selected.has(l.id)) { l.status = st; l.updatedAt = new Date().toISOString(); pushLead(l); } });
  clearSelection(); renderAll();
}
function deleteSelected() {
  if (S.selected.size === 0) return;
  S.selected.forEach(id => { if (S.config.scriptUrl) sheetsCall({action:'delete', id}); });
  S.leads = S.leads.filter(l => !S.selected.has(l.id));
  saveLocal(); clearSelection(); renderAll();
}

// ── Lead modal — consolidated (all overrides merged) ───────
function openLead(id) {
  const l = S.leads.find(x => x.id === id);
  if (!l) return;
  S.curLeadId = id;

  // Basic fields
  const titleEl = document.getElementById('m-name');
  if (titleEl) {
    titleEl.textContent     = l.name || '--';
    titleEl.contentEditable = 'true';
    titleEl.style.outline   = 'none';
    titleEl.style.borderBottom = '1px dashed var(--border-hi)';
    titleEl.title           = 'Click para editar';
  }
  document.getElementById('m-meta').textContent =
    (l.city || '') + (l.barrio ? ' · ' + l.barrio : '') + (l.keyword ? ' · ' + l.keyword : '');
  document.getElementById('m-status').value    = l.status     || 'Nuevo';
  document.getElementById('m-followup').value  = l.followUpDate || '';

  const dncWrap = document.getElementById('m-dnc-wrap');
  if (dncWrap) dncWrap.style.display = l.status === 'No llamar' ? 'block' : 'none';
  if (l.dncReason) { const dr = document.getElementById('m-dnc-reason'); if (dr) dr.value = l.dncReason; }

  // Detail grid with editable phone + address
  document.getElementById('m-details').innerHTML = [
    {lb:'Telefono', v:`<input value="${esc(l.phone||'')}" id="edit-phone" placeholder="Sin telefono">`},
    {lb:'Rating',   v: l.rating && l.rating !== 'N/A' ? `★ ${l.rating} (${l.reviews} reseñas)` : '--'},
    {lb:'Direccion',v:`<input value="${esc(l.address||'')}" id="edit-address" placeholder="Sin direccion">`},
    {lb:'Website',  v: l.website && l.website !== 'N/A'
      ? `<a href="${esc(l.website)}" target="_blank">${esc(l.website.replace(/^https?:\/\//,''))}</a>` : '--'},
    {lb:'Fuente',   v: esc(l.source||'--') + (l.sourceDetail ? ' · ' + esc(l.sourceDetail) : '')},
    {lb:'Seguimiento', v: l.followUpDate
      ? (isOverdue(l) ? `<span class="fu-badge fu-overdue">Vencido ${fmtD(l.followUpDate)}</span>` : fmtD(l.followUpDate))
      : 'Sin definir'},
    {lb:'Importado',  v: fmtD(l.importedAt)},
    {lb:'Actualizado',v: fmtD(l.updatedAt)},
  ].map(({lb,v}) => `<div class="detail-item${['Telefono','Direccion'].includes(lb)?' editable':''}"><div class="detail-label">${lb}</div><div class="detail-val">${v}</div></div>`).join('');

  // Lock/claim UI
  const lockWrap = document.getElementById('m-lock-wrap');
  if (lockWrap) {
    if (isLockedByMe(l))
      lockWrap.innerHTML = `<span class="lock-badge lock-mine">Reclamado por ti · ${lockCountdown(l)}</span>
        <button class="btn btn-ghost" style="font-size:11px;padding:4px 9px;margin-left:8px" onclick="releaseLead('${l.id}')">Liberar</button>`;
    else if (isLockedByOther(l))
      lockWrap.innerHTML = `<span class="lock-badge lock-other">Reclamado por ${esc(getLockerName(l))} · ${lockCountdown(l)}</span>`;
    else
      lockWrap.innerHTML = `<button class="claim-btn" onclick="claimLead('${l.id}')">Reclamar este lead</button>`;
  }

  // Work history
  const whWrap = document.getElementById('m-work-history');
  if (whWrap) {
    const wh = Array.isArray(l.workHistory) ? l.workHistory : [];
    whWrap.innerHTML = wh.length
      ? wh.map(w => `<div class="wh-item"><strong>${esc(w.closerName||w.closerId||'--')}</strong> · ${esc(w.outcome||'--')} · ${fmtD(w.closedAt||w.releasedAt||w.claimedAt)}</div>`).join('')
      : '<div class="notes-empty" style="font-size:11px">Sin historial previo.</div>';
  }

  // Action buttons
  const addr    = l.address && l.address !== 'N/A' ? l.address : l.name;
  const mapsLink = addr ? `<a class="action-btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}" target="_blank">📍 Maps</a>` : '';
  const canCall  = l.status !== 'No llamar' && l.phone && l.phone !== 'N/A';
  const callBtn  = canCall
    ? `<button class="action-btn" onclick="startCallFromModal('${l.id}')">📞 Llamar</button>`
    : '<span class="action-btn red-btn">🚫 No llamar</span>';
  document.getElementById('m-action-btns').innerHTML = mapsLink + callBtn;

  renderLeadCallHistory(id);
  renderModalNotes(l);
  const ni = document.getElementById('m-note-inp');
  if (ni) ni.value = '';

  // Audit
  auditLog('viewLead', id, l.name);

  document.getElementById('modal').classList.add('open');
}

function renderModalNotes(l) {
  const notes = Array.isArray(l.notes) ? l.notes : [];
  document.getElementById('m-notes').innerHTML = notes.length
    ? notes.map((n,i) =>
        `<div class="note-item">
          <div class="note-date">${fmtD(n.date)} ${fmtT(n.date)}</div>
          <div class="note-text">${esc(n.text)}</div>
          <button class="note-del" onclick="delNote(${i})" title="Eliminar">&times;</button>
        </div>`).join('')
    : '<div class="notes-empty">Sin notas aun.</div>';
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  S.curLeadId = null;
}

function onModalStatusChange() {
  const val  = document.getElementById('m-status')?.value;
  const wrap = document.getElementById('m-dnc-wrap');
  if (wrap) wrap.style.display = val === 'No llamar' ? 'block' : 'none';
}

function addNote() {
  const txt = document.getElementById('m-note-inp')?.value?.trim();
  if (!txt) return;
  const l = S.leads.find(x => x.id === S.curLeadId);
  if (!l) return;
  if (!Array.isArray(l.notes)) l.notes = [];
  l.notes.push({date: new Date().toISOString(), text: txt});
  l.updatedAt = new Date().toISOString();
  document.getElementById('m-note-inp').value = '';
  renderModalNotes(l);
  pushLead(l);
}

function delNote(idx) {
  const l = S.leads.find(x => x.id === S.curLeadId);
  if (!l || !Array.isArray(l.notes)) return;
  l.notes.splice(idx, 1);
  l.updatedAt = new Date().toISOString();
  renderModalNotes(l);
  pushLead(l);
}

// ── saveLead — consolidated (editable fields + status logic) ─
function saveLead() {
  const l = S.leads.find(x => x.id === S.curLeadId);
  if (!l) return;

  // Capture editable field changes
  const np = document.getElementById('edit-phone')?.value?.trim();
  const na = document.getElementById('edit-address')?.value?.trim();
  const nn = document.getElementById('m-name')?.textContent?.trim();
  if (np && np !== l.phone)   l.phone   = np;
  if (na && na !== l.address) l.address = na;
  if (nn && nn !== l.name)    l.name    = nn;

  const newStatus = document.getElementById('m-status')?.value;

  // Intercept Cerrado — require deal value
  if (newStatus === 'Cerrado' && l.status !== 'Cerrado') {
    interceptCerrado(l.id);
    return;
  }

  // Negociacion fallida — release closer, cancel pending commission
  if (newStatus === 'Negociacion fallida' && l.status !== 'Negociacion fallida') {
    if (!Array.isArray(l.workHistory)) l.workHistory = [];
    if (l.closerId) {
      l.workHistory.push({
        closerId:   l.closerId,
        closerName: S.team.find(m => m.id === l.closerId)?.name || l.closerId,
        outcome:    'Negociacion fallida',
        releasedAt: new Date().toISOString(),
      });
    }
    if (l.commissionStatus === 'pending') l.commissionStatus = 'cancelled';
    l.closerId = ''; l.lockedBy = ''; l.lockedUntil = ''; l.assignedAt = '';
  }

  // DNC guard — require reason
  if (newStatus === 'No llamar' && l.status !== 'No llamar') {
    const reason = document.getElementById('m-dnc-reason')?.value?.trim();
    if (!reason) { alert('Por favor ingresa la razón para "No llamar" — requerido como registro legal.'); return; }
    l.dncReason = reason;
  }

  // Assign closer at Interesado
  if (newStatus === 'Interesado' && l.status !== 'Interesado' && !l.closerId && S.session) {
    l.closerId   = S.session.userId;
    l.closerRate = S.session.closerRate || 0;
    l.assignedAt = new Date().toISOString();
    l.lockedBy   = S.session.userId;
    l.lockedUntil = ''; // permanent assignment — no 4h expiry at Interesado
  }

  l.status       = newStatus;
  l.followUpDate = document.getElementById('m-followup')?.value || '';
  l.updatedAt    = new Date().toISOString();
  pushLead(l);
  closeModal();
  renderAll();
}

function deleteLeadModal() {
  const l = S.leads.find(x => x.id === S.curLeadId);
  if (!l) return;
  if (l.status === 'No llamar' && S.session?.role !== 'admin') {
    alert('Solo admin puede eliminar leads marcados como "No llamar".');
    return;
  }
  if (S.config.scriptUrl) sheetsCall({action:'delete', id:S.curLeadId});
  auditLog('deleteLead', S.curLeadId, l.name);
  S.leads = S.leads.filter(x => x.id !== S.curLeadId);
  saveLocal(); closeModal(); renderAll();
  document.getElementById('delete-confirm')?.classList.remove('visible');
}

function toggleDeleteConfirm() {
  document.getElementById('delete-confirm')?.classList.toggle('visible');
}

function setFuQuick(days) {
  const inp = document.getElementById('m-followup');
  if (!inp) return;
  if (days === 0) { inp.value = ''; return; }
  const d = new Date();
  d.setDate(d.getDate() + days);
  inp.value = d.toISOString().slice(0,10);
}

function startCallFromModal(leadId) { closeModal(); makeCall(leadId); }

// Close modal on outside click / Escape
document.getElementById('modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('modal')) closeModal();
});
