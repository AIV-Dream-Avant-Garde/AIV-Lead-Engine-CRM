/* ── FEATURE: Leads table, modal, CRUD ───────────────────── */

// ── Modal focus management (a11y) ─────────────────────────
// Move focus into a modal on open, and restore it to the trigger on close, so
// keyboard / screen-reader users aren't stranded behind the dialog.
var _modalReturnFocus = null;
function focusIntoModal(modalEl) {
  _modalReturnFocus = document.activeElement;
  if (!modalEl) return;
  const t = modalEl.querySelector('.modal-close, input, select, textarea, button, [href]');
  if (t) setTimeout(() => { try { t.focus(); } catch(e) {} }, 30);
}
function restoreModalFocus() {
  if (_modalReturnFocus && typeof _modalReturnFocus.focus === 'function') { try { _modalReturnFocus.focus(); } catch(e) {} }
  _modalReturnFocus = null;
}

// ── Manual add lead (single-lead entry) ───────────────────
function openAddLead() {
  ['al-name','al-phone','al-email','al-website','al-city','al-notes'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  const src = document.getElementById('al-source'); if (src) src.value = 'Manual';
  document.getElementById('addlead-overlay')?.classList.add('open');
  setTimeout(() => document.getElementById('al-name')?.focus(), 50);
}

function saveNewLead() {
  const get = id => document.getElementById(id)?.value?.trim() || '';
  const name = get('al-name'), phoneRaw = get('al-phone'), email = get('al-email').toLowerCase();
  if (!name && !phoneRaw && !email) { toast('Enter at least a name, phone, or email.', 'error'); return; }
  const phone = phoneRaw ? normalizePhone(phoneRaw) : '';
  // Dedup by phone or email — warn before adding a likely duplicate.
  const pk = phoneKey(phone);
  const dup = S.leads.find(l => (pk && phoneKey(l.phone) === pk) || (email && (l.email || '').toLowerCase() === email));
  if (dup && !confirm(`A lead with this contact already exists ("${dup.name}"). Add anyway?`)) return;

  const now  = new Date().toISOString();
  const sess = S.session;
  const isProvider = sess && (sess.role === 'provider' || sess.role === 'solo');
  const lead = {
    id: uid(), name: name || 'No name', phone: phone || 'N/A', email,
    address: 'N/A', website: get('al-website') || 'N/A', rating: 'N/A', reviews: 'N/A',
    country: DEFAULT_COUNTRY, city: get('al-city'), barrio: '', keyword: '',
    source: get('al-source') || 'Manual', sourceDetail: '', status: 'New',
    providerId: isProvider ? sess.userId : '', providerRate: isProvider ? (sess.providerRate || 0) : 0,
    closerId: '', closerRate: 0, dealValue: '',
    providerCommission: '', closerCommission: '', commissionStatus: '',
    lockedBy: '', lockedUntil: '', assignedAt: isProvider ? now : '',
    workHistory: [], dncReason: '', followUpDate: '', notes: [],
    importedAt: now, updatedAt: now, _synced: false,
  };
  const noteText = get('al-notes');
  if (noteText) lead.notes.push({ date: now, text: noteText });
  S.leads.push(lead);
  S.dirty.add(lead.id);
  saveLocal();
  if (typeof auditLog === 'function') auditLog('addLead', lead.id, lead.name);
  document.getElementById('addlead-overlay')?.classList.remove('open');
  toast('Lead added.', 'success');
  S.page = 1; renderAll();
  if (S.config.scriptUrl) syncNow();   // push the new lead to Sheets now
}

// ── Follow-up / source badge helpers ──────────────────────
function isOverdue(lead) {
  if (!lead.followUpDate) return false;
  if (lead.status === 'Closed Won' || lead.status === 'Do Not Call') return false;
  // Compare against the START of today so a follow-up dated TODAY reads as
  // "Today", not "Overdue" (it was flagging red all day before).
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(lead.followUpDate + 'T00:00:00') < today;
}

function isTodayFU(lead) {
  if (!lead.followUpDate) return false;
  return new Date(lead.followUpDate + 'T00:00:00').toDateString() === new Date().toDateString();
}

function fuBadgeHTML(lead) {
  if (!lead.followUpDate) return '';
  if (isOverdue(lead))  return `<span class="fu-badge fu-overdue">Overdue ${fmtD(lead.followUpDate)}</span>`;
  if (isTodayFU(lead))  return `<span class="fu-badge fu-today">Today</span>`;
  return `<span class="fu-badge fu-upcoming">${fmtD(lead.followUpDate)}</span>`;
}

function srcBadgeHTML(source) {
  if (!source) return '';
  const label = source.split(' · ')[0];
  const info  = SOURCES.find(s => source.startsWith(s.val));
  return `<span class="src-badge ${info ? info.cls : 'src-default'}" title="${esc(source)}">${esc(label)}</span>`;
}

// ── Lead scoring ───────────────────────────────────────────
function scoreLead(l) {
  let s = 0;
  const W = SCORE_WEIGHTS;
  if (l.phone && l.phone !== 'N/A')               s += W.hasPhone;
  const rat = parseFloat(l.rating);
  if (!isNaN(rat)) {
    if (rat >= 4.0)                                s += W.ratingHigh;
    else if (rat >= 3.0)                           s += W.ratingMid;
  }
  const rev = parseInt(l.reviews, 10);
  if (!isNaN(rev)) {
    if (rev >= 50)                                 s += W.reviewsHigh;
    else if (rev >= 10)                            s += W.reviewsMid;
  }
  if (l.status === 'New')                        s += W.statusNuevo;
  else if (l.status === 'Contacted')              s += W.statusContact;
  if (isOverdue(l))                                s += W.fuOverdue;
  else if (isTodayFU(l))                           s += W.fuToday;
  if (l.website && l.website !== 'N/A')            s += W.hasWebsite;
  return s;
}

function scoreDotHTML(l) {
  const s    = scoreLead(l);
  const tier = s >= 60 ? 'high' : s >= 30 ? 'mid' : 'low';
  const tips = [
    l.phone && l.phone !== 'N/A' ? '+' + SCORE_WEIGHTS.hasPhone + ' phone' : '',
    parseFloat(l.rating) >= 4 ? '+' + SCORE_WEIGHTS.ratingHigh + ' high rating' : '',
    isOverdue(l) ? '+' + SCORE_WEIGHTS.fuOverdue + ' FU overdue' : isTodayFU(l) ? '+' + SCORE_WEIGHTS.fuToday + ' FU today' : '',
  ].filter(Boolean).join(', ') || 'no data';
  return `<span class="score-chip score-${tier}" title="${s} pts: ${tips}">${s}</span>`;
}

function highlight(text, q) {
  if (!q) return esc(text);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return esc(text);
  return esc(text.slice(0, idx)) + '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>' + esc(text.slice(idx + q.length));
}

// ── Filter / sort ──────────────────────────────────────────
function getFiltered() {
  const q    = (document.getElementById('tbl-q')?.value    || '').toLowerCase();
  const fco  = document.getElementById('f-country')?.value || '';
  const fc   = document.getElementById('f-city')?.value    || '';
  const fb   = document.getElementById('f-barrio')?.value  || '';
  const fsrc = document.getElementById('f-source')?.value  || '';
  const fs   = document.getElementById('f-status')?.value  || '';
  const ff   = document.getElementById('f-followup')?.value || '';
  const fm   = document.getElementById('f-mine')?.value    || '';
  return S.leads.filter(l => {
    if (fco  && l.country !== fco)                         return false;
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
    if (q && !`${l.name} ${l.phone} ${l.address} ${l.country} ${l.city} ${l.barrio} ${l.keyword} ${l.source} ${l.sourceDetail}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function getSorted(arr) {
  const col = S.sortCol, dir = S.sortDir;
  if (col === 'score') {
    return [...arr].sort((a,b) => (scoreLead(b) - scoreLead(a)) * dir);
  }
  // Numeric columns (money, rating, reviews) must compare as numbers, not as
  // strings — lexical order puts "100" before "20". Dates are ISO so they sort
  // correctly as strings; everything else falls back to locale-aware text.
  const NUMERIC = new Set(['dealValue','collectedAmount','rating','reviews','closerCommission','providerCommission']);
  return [...arr].sort((a,b) => {
    if (NUMERIC.has(col)) {
      const an = parseFloat(a[col]), bn = parseFloat(b[col]);
      const af = isNaN(an) ? -Infinity : an, bf = isNaN(bn) ? -Infinity : bn;
      return (af - bf) * dir;
    }
    const av = String(a[col] || ''), bv = String(b[col] || '');
    return av.localeCompare(bv, 'es') * dir;
  });
}

function sortBy(col) {
  if (S.sortCol === col) S.sortDir *= -1;
  else { S.sortCol = col; S.sortDir = -1; }
  renderTable();
}

// ── Search debounce ────────────────────────────────────────
let _searchTimer = null;
function debouncedSearch() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => { S.page = 1; renderTable(); }, 200);
}

// ── Table render ───────────────────────────────────────────
function renderTable() {
  const filtered = getSorted(getFiltered());
  const total    = filtered.length;
  const q        = (document.getElementById('tbl-q')?.value || '').trim();
  const tbody    = document.getElementById('tbl-body');
  if (!tbody) return;

  // When searching, bypass pagination and show all results (up to 200)
  let slice;
  if (q) {
    slice = filtered.slice(0, 200);
    const pag = document.getElementById('tbl-pages');
    if (pag) pag.innerHTML = total > 200
      ? `<span style="font-size:11px;color:var(--sub)">First 200 of ${total} — refine your search</span>`
      : '';
  } else {
    const pages = Math.max(1, Math.ceil(total / S.pageSize));
    S.page      = Math.min(S.page, pages);
    slice       = filtered.slice((S.page - 1) * S.pageSize, S.page * S.pageSize);
    renderPagination(total, pages);
  }

  const hasFilters = ['f-country','f-city','f-barrio','f-source','f-status','f-followup','f-mine'].some(id => {
    const el = document.getElementById(id); return el && el.value;
  });

  if (!slice.length) {
    const trulyEmpty = !q && !hasFilters && S.leads.length === 0;
    const inner = trulyEmpty
      ? `<div style="font-weight:600;color:var(--hl);margin-bottom:4px">No leads yet</div>
         <div style="font-size:12px;color:var(--sub);margin-bottom:14px">${S.config.scriptUrl ? 'Get your first leads in three ways:' : 'First, connect Apps Script in Settings — then get leads in three ways:'}</div>
         <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
           <button class="btn btn-primary" style="font-size:12px" onclick="navigate('scraper')">Scrape leads</button>
           <button class="btn btn-ghost" style="font-size:12px" onclick="navigate('import')">Import CSV</button>
           <button class="btn btn-ghost" style="font-size:12px" onclick="openAddLead()">Add manually</button>
         </div>`
      : `<div style="font-weight:600;color:var(--hl);margin-bottom:4px">No results</div>
         <div style="font-size:12px;color:var(--sub);margin-bottom:12px">${q ? 'No leads found for "' + esc(q) + '"' : 'No leads match the current filters'}</div>
         <button class="btn btn-ghost" style="font-size:12px" onclick="clearFilters()">Clear filters</button>`;
    tbody.innerHTML = `<tr><td colspan="13" class="table-empty">
      <div style="padding:40px;text-align:center">
        <div style="margin-bottom:8px;opacity:.35"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:32px;height:32px"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg></div>
        ${inner}
      </div>
    </td></tr>`;
  } else {
    tbody.innerHTML = slice.map(l => {
      const sc   = STATUS_CLS[l.status] || 'new';
      const sel  = S.selected.has(l.id) ? 'selected' : '';
      const dnc  = l.status === 'Do Not Call' ? 'dnc-row' : '';
      const rat  = l.rating && l.rating !== 'N/A' ? '★ ' + l.rating : '--';
      const lc0  = S.calls.filter(x => x.leadId === l.id)
        .sort((a,b) => new Date(b.calledAt) - new Date(a.calledAt))[0];
      const lc_  = lc0 ? fmtD(lc0.calledAt) + ' ' + esc(OUTCOME_LABELS[lc0.outcome] || lc0.outcome) : '—';
      // Lock column
      let lockCell = '';
      if (isLockedByMe(l))    lockCell = `<span class="lock-badge lock-mine">Mine · ${lockCountdown(l)}</span>`;
      else if (isLockedByOther(l)) lockCell = `<span class="lock-badge lock-other">${esc(getLockerName(l))} · ${lockCountdown(l)}</span>`;
      else                    lockCell = `<button class="claim-btn" onclick="event.stopPropagation();claimLead('${l.id}')">Claim</button>`;
      return `<tr class="${sel} ${dnc}" onclick="rowClick(event,'${l.id}')">
        <td onclick="event.stopPropagation()"><input type="checkbox" ${S.selected.has(l.id)?'checked':''} onchange="toggleSel('${l.id}',this.checked)"></td>
        <td style="text-align:center;width:36px">${scoreDotHTML(l)}</td>
        <td class="name-cell">${highlight(l.name, q)}${l.lastReplyAt && (!l.lastTouchAt || new Date(l.lastReplyAt) > new Date(l.lastTouchAt)) ? ' <span class="sbadge" style="background:var(--pos);color:#04140d;font-size:9px;padding:1px 5px">Replied</span>' : ''}</td>
        <td style="font-family:'Geist Mono',monospace;font-size:11px">${highlight(l.phone || '', q)}</td>
        <td style="font-size:11px">${esc(l.city   || '--')}</td>
        <td style="font-size:11px">${esc(l.barrio || '--')}</td>
        <td>${srcBadgeHTML(l.source)}</td>
        <td>${fuBadgeHTML(l)}</td>
        <td style="font-family:'Geist Mono',monospace;font-size:11px">${esc(rat)}</td>
        <td><span class="sbadge ${sc}">${esc(l.status || 'New')}</span>${l.refundedAt ? '<span style="font-size:9px;background:#c0392b;color:#fff;border-radius:3px;padding:1px 4px;margin-left:3px">Refund</span>' : ''}</td>
        <td style="font-size:11px">${fmtD(l.updatedAt || l.importedAt)}</td>
        <td style="font-size:11px">${lc_}</td>
        <td>${lockCell}</td>
      </tr>`;
    }).join('');
  }

  document.getElementById('tbl-count').textContent = total + ' lead' + (total !== 1 ? 's' : '');
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
  ['tbl-q','f-country','f-city','f-barrio','f-source','f-status','f-followup','f-mine'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  populateFilters();   // restore the full (un-narrowed) city list
  renderTable();
}

// Country filter cascade: narrow the city dropdown to the selected country, then re-render
function onFilterCountryChange() {
  const fc = document.getElementById('f-city'); if (fc) fc.value = '';
  populateFilters();
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
  if (bc) bc.textContent = n + ' selected';
}
function applyBulkStatus() {
  const st = document.getElementById('bulk-status')?.value;
  if (!st) { toast('Select a status.', 'error'); return; }
  // "Closed Won" must capture a deal value and create the commission record — that
  // only happens through the single-lead flow. Block it from the bulk path so a
  // closed-won deal can never be recorded with zero revenue.
  if (st === 'Closed Won') { toast('Open each lead to close it: "Closed Won" requires the deal value.', 'error', 6000); return; }
  const n = S.selected.size;
  if (!confirm(`Change status of ${n} lead${n !== 1 ? 's' : ''} to "${st}"? This cannot be undone.`)) return;
  S.leads.forEach(l => { if (S.selected.has(l.id)) { l.status = st; l.updatedAt = new Date().toISOString(); pushLead(l); } });
  clearSelection(); renderAll();
}

function onBulkActionChange() {
  const act  = document.getElementById('bulk-action')?.value || '';
  const date = document.getElementById('bulk-action-date');
  const text = document.getElementById('bulk-action-text');
  if (date) date.style.display = 'none';
  if (text) text.style.display = 'none';
  if (act === 'followup' && date) { date.style.display = ''; }
  if (act === 'source'   && text) { text.style.display = ''; text.placeholder = 'New source...'; }
  if (act === 'dnc'      && text) { text.style.display = ''; text.placeholder = 'DNC reason...'; }
}

function applyBulkAction() {
  const act  = document.getElementById('bulk-action')?.value || '';
  if (!act) { toast('Select an action.', 'error'); return; }
  if (S.selected.size === 0) { toast('Select at least one lead.', 'error'); return; }
  const now  = new Date().toISOString();
  const sess = S.session;

  if (act === 'followup') {
    const d = document.getElementById('bulk-action-date')?.value;
    if (!d) { toast('Select a follow-up date.', 'error'); return; }
    S.leads.forEach(l => { if (S.selected.has(l.id)) { l.followUpDate = d; l.updatedAt = now; pushLead(l); } });
  } else if (act === 'source') {
    const src = document.getElementById('bulk-action-text')?.value?.trim();
    if (!src) { toast('Enter the new source.', 'error'); return; }
    S.leads.forEach(l => { if (S.selected.has(l.id)) { l.source = src; l.updatedAt = now; pushLead(l); } });
  } else if (act === 'closer') {
    if (!sess) { toast('You must be logged in.', 'error'); return; }
    S.leads.forEach(l => {
      if (S.selected.has(l.id)) {
        l.closerId   = sess.userId;
        l.closerRate = sess.closerRate || 0;
        l.assignedAt = l.assignedAt || now;
        l.updatedAt  = now;
        pushLead(l);
      }
    });
  } else if (act === 'dnc') {
    const reason = document.getElementById('bulk-action-text')?.value?.trim();
    if (!reason) { toast('Enter the DNC reason — required as a legal record.', 'error'); return; }
    if (!confirm(`Mark ${S.selected.size} lead(s) as "Do Not Call"?`)) return;
    S.leads.forEach(l => {
      if (S.selected.has(l.id)) {
        l.status    = 'Do Not Call';
        l.dncReason = reason;
        l.updatedAt = now;
        pushLead(l);
      }
    });
  }

  document.getElementById('bulk-action').value = '';
  onBulkActionChange();
  clearSelection(); renderAll();
}
function deleteSelected() {
  if (S.selected.size === 0) return;
  const n = S.selected.size;
  if (!confirm(`Delete ${n} lead${n !== 1 ? 's' : ''}? This cannot be undone.`)) return;
  S.selected.forEach(id => {
    if (S.config.scriptUrl) sheetsCall({action:'delete', id});
    S.deletedIds.add(id);   // tombstone — keeps a failed/slow server delete from resurrecting it on pull
    S.dirty.delete(id);
  });
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
    titleEl.title           = 'Click to edit';
  }
  const _seq = (typeof getSequence === 'function') ? getSequence(l.id) : null;
  document.getElementById('m-meta').textContent =
    [l.country, l.city, l.barrio, l.keyword].filter(Boolean).join(' · ')
    + (_seq ? ' · Sequence: ' + seqStateLabel(_seq.state) : '');
  renderLeadOutreach(l, _seq);
  document.getElementById('m-status').value    = l.status     || 'New';
  document.getElementById('m-followup').value  = l.followUpDate || '';

  const dvEl = document.getElementById('m-deal-value');
  if (dvEl) dvEl.value = l.dealValue || '';
  renderDealPreview(l);

  const dncWrap = document.getElementById('m-dnc-wrap');
  if (dncWrap) dncWrap.style.display = l.status === 'Do Not Call' ? 'block' : 'none';
  if (l.dncReason) { const dr = document.getElementById('m-dnc-reason'); if (dr) dr.value = l.dncReason; }

  // Detail grid with editable phone + address
  const detailRows = [
    {lb:'Phone', v:`<input value="${esc(l.phone||'')}" id="edit-phone" placeholder="No phone">`},
    {lb:'Email',    v:`<input value="${esc(l.email||'')}" id="edit-email" placeholder="No email">`},
    {lb:'Rating',   v: l.rating && l.rating !== 'N/A' ? `★ ${l.rating} (${l.reviews} reviews)` : '--'},
    {lb:'Address',v:`<input value="${esc(l.address||'')}" id="edit-address" placeholder="No address">`},
    {lb:'Website',  v: l.website && l.website !== 'N/A'
      ? `<a href="${esc(l.website)}" target="_blank">${esc(l.website.replace(/^https?:\/\//,''))}</a>` : '--'},
    {lb:'Source',   v: esc(l.source||'--') + (l.sourceDetail ? ' · ' + esc(l.sourceDetail) : '')},
    {lb:'Follow-up', v: l.followUpDate
      ? (isOverdue(l) ? `<span class="fu-badge fu-overdue">Overdue ${fmtD(l.followUpDate)}</span>` : fmtD(l.followUpDate))
      : 'Not set'},
    {lb:'Imported',  v: fmtD(l.importedAt)},
    {lb:'Updated',v: fmtD(l.updatedAt)},
  ];
  // Partial collection indicator
  if (l.collectedAmount && parseFloat(l.collectedAmount) !== parseFloat(l.dealValue || 0)) {
    detailRows.push({lb:'Collected', v:`<span style="color:var(--amber);font-weight:600">${fmtUSD(l.collectedAmount)}</span> of ${fmtUSD(l.dealValue)}`});
  }
  // Refund indicator
  if (l.refundedAt) {
    detailRows.push({lb:'Refund', v:`<span style="color:#c0392b;font-weight:600">${fmtUSD(l.refundAmount)}</span>${l.refundReason ? ' — ' + esc(l.refundReason) : ''}`});
  }
  document.getElementById('m-details').innerHTML = detailRows
    .map(({lb,v}) => `<div class="detail-item${['Phone','Address'].includes(lb)?' editable':''}"><div class="detail-label">${lb}</div><div class="detail-val">${v}</div></div>`).join('');

  // Lock/claim UI
  const lockWrap = document.getElementById('m-lock-wrap');
  if (lockWrap) {
    if (isLockedByMe(l))
      lockWrap.innerHTML = `<span class="lock-badge lock-mine">Claimed by you · ${lockCountdown(l)}</span>
        <button class="btn btn-ghost" style="font-size:11px;padding:4px 9px;margin-left:8px" onclick="releaseLead('${l.id}')">Release</button>`;
    else if (isLockedByOther(l))
      lockWrap.innerHTML = `<span class="lock-badge lock-other">Claimed by ${esc(getLockerName(l))} · ${lockCountdown(l)}</span>`;
    else
      lockWrap.innerHTML = `<button class="claim-btn" onclick="claimLead('${l.id}')">Claim this lead</button>`;
  }

  // Work history
  const whWrap = document.getElementById('m-work-history');
  if (whWrap) {
    const wh = Array.isArray(l.workHistory) ? l.workHistory : [];
    whWrap.innerHTML = wh.length
      ? wh.map(w => `<div class="wh-item"><strong>${esc(w.closerName||w.closerId||'--')}</strong> · ${esc(w.outcome||'--')} · ${fmtD(w.closedAt||w.releasedAt||w.claimedAt)}</div>`).join('')
      : '<div class="notes-empty" style="font-size:11px">No prior history.</div>';
  }

  // Action buttons
  const addr    = l.address && l.address !== 'N/A' ? l.address : l.name;
  const mapsLink = addr ? `<a class="action-btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}" target="_blank"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:12px;height:12px;vertical-align:middle;margin-right:4px"><path d="M8 1a5 5 0 0 0-5 5c0 3.5 5 9 5 9s5-5.5 5-9a5 5 0 0 0-5-5z"/><circle cx="8" cy="6" r="1.5"/></svg>Maps</a>` : '';
  const canCall  = l.status !== 'Do Not Call' && l.phone && l.phone !== 'N/A';
  const callBtn  = canCall
    ? `<button class="action-btn" onclick="startCallFromModal('${l.id}')"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:12px;height:12px;vertical-align:middle;margin-right:4px"><path d="M5 1.5H3.5A1.5 1.5 0 0 0 2 3C2 9.6 6.4 14 13 14a1.5 1.5 0 0 0 1.5-1.5V11l-3-1-1 1.5C9 10.7 5.3 7 4.5 5.5L6 4.5l-1-3z"/></svg>Call</button>`
    : `<span class="action-btn red-btn"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:12px;height:12px;vertical-align:middle;margin-right:4px"><circle cx="8" cy="8" r="6.5"/><path d="M3.5 3.5l9 9"/></svg>Do Not Call</span>`;
  document.getElementById('m-action-btns').innerHTML = mapsLink + callBtn;

  renderLeadCallHistory(id);
  renderModalNotes(l);
  renderLeadTimeline(l);
  if (typeof renderComposer === 'function') renderComposer(l);
  switchModalTab('notes');
  const ni = document.getElementById('m-note-inp');
  if (ni) ni.value = '';

  // Audit
  auditLog('viewLead', id, l.name);

  document.getElementById('modal').classList.add('open');
  focusIntoModal(document.getElementById('modal'));
}

function renderModalNotes(l) {
  const notes = Array.isArray(l.notes) ? l.notes : [];
  document.getElementById('m-notes').innerHTML = notes.length
    ? notes.map((n,i) =>
        `<div class="note-item">
          <div class="note-date">${fmtD(n.date)} ${fmtT(n.date)}</div>
          <div class="note-text">${esc(n.text)}</div>
          <button class="note-del" onclick="delNote(${i})" title="Delete note" aria-label="Delete note">&times;</button>
        </div>`).join('')
    : '<div class="notes-empty">No notes yet.</div>';
}

function switchModalTab(tab) {
  ['notes','mensaje','timeline'].forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.style.display = (t === tab) ? '' : 'none';
  });
  document.querySelectorAll('.modal-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-btn-' + tab)?.classList.add('active');
}

// At-a-glance outreach status for a lead: how many messages we've sent, how many
// they've replied with, when we last reached out, and the cadence state.
function renderLeadOutreach(l, seq) {
  const el = document.getElementById('m-outreach');
  if (!el) return;
  const ints = (S.interactions || []).filter(i => i.leadId === l.id);
  const out  = ints.filter(i => i.direction === 'out' && i.status !== 'failed');
  const ins  = ints.filter(i => i.direction === 'in');
  const lastOut = out.map(i => i.createdAt).filter(Boolean).sort().pop();
  const lastIn  = ins.map(i => i.createdAt).filter(Boolean).sort().pop();
  const waited  = d => { if (!d) return ''; const ms = Date.now() - new Date(d).getTime(); const day = 864e5; return ms < 36e5 ? Math.max(1, Math.round(ms/6e4)) + 'm' : ms < day ? Math.round(ms/36e5) + 'h' : Math.round(ms/day) + 'd'; };
  const chip = (txt, tone) => `<span class="m-outreach-chip${tone ? ' ' + tone : ''}">${txt}</span>`;

  if (!out.length && !ins.length) {
    el.innerHTML = `<span class="label-sm" style="margin:0">Outreach</span>` + chip('No messages sent yet');
    return;
  }
  const parts = [`<span class="label-sm" style="margin:0">Outreach</span>`];
  parts.push(chip(`${out.length} sent`));
  if (lastOut) parts.push(chip(`last ${waited(lastOut)} ago`, 'muted'));
  if (ins.length) parts.push(chip(`${ins.length} repl${ins.length === 1 ? 'y' : 'ies'}`, 'pos'));
  const needsReply = lastIn && (!lastOut || new Date(lastIn) > new Date(lastOut));
  if (needsReply) parts.push(chip('awaiting your reply', 'warn'));
  if (seq) parts.push(chip(seqStateLabel(seq.state), 'muted'));
  el.innerHTML = parts.join('');
}

function renderLeadTimeline(l) {
  const el = document.getElementById('m-timeline');
  if (!el) return;
  const events = [];

  S.calls.filter(c => c.leadId === l.id).forEach(c => {
    events.push({
      date: c.calledAt,
      icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:13px;height:13px"><path d="M5 1.5H3.5A1.5 1.5 0 0 0 2 3C2 9.6 6.4 14 13 14a1.5 1.5 0 0 0 1.5-1.5V11l-3-1-1 1.5C9 10.7 5.3 7 4.5 5.5L6 4.5l-1-3z"/></svg>',
      text: 'Call: ' + (OUTCOME_LABELS[c.outcome] || c.outcome) + ' · ' + fmtSec(parseInt(c.duration || 0)) + (c.notes ? ' — ' + c.notes : ''),
    });
  });

  (S.interactions || []).filter(i => i.leadId === l.id).forEach(i => {
    const arrow = i.direction === 'in' ? '←' : '→';
    const ch = (CHANNEL_LABELS && CHANNEL_LABELS[i.channel]) || i.channel || '';
    const fail = i.status === 'failed' ? ' (failed)' : '';
    events.push({
      date: i.createdAt,
      icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:13px;height:13px"><path d="M2 3.5h12v8H4l-2 2z"/></svg>',
      text: arrow + ' ' + ch + fail + ': ' + (i.body || ''),
    });
  });

  (Array.isArray(l.notes) ? l.notes : []).forEach(n => {
    events.push({date: n.date, icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:13px;height:13px"><path d="M11.5 2a1.5 1.5 0 0 1 2.1 2.1L4.5 13.1l-3 .5.5-3L11.5 2z"/></svg>', text: n.text});
  });

  (Array.isArray(l.workHistory) ? l.workHistory : []).forEach(w => {
    const ts = w.closedAt || w.releasedAt || w.claimedAt || '';
    events.push({date: ts, icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:13px;height:13px"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 2.5"/></svg>', text: (w.closerName || w.closerId || '—') + ': ' + (w.outcome || '')});
  });

  if (l.importedAt) events.push({date: l.importedAt, icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:13px;height:13px"><path d="M8 3v10M3 8h10"/></svg>', text: 'Lead imported'});

  events.sort((a, b) => new Date(b.date) - new Date(a.date));

  el.innerHTML = events.length
    ? events.map(e => `<div class="timeline-item">
        <span class="tl-icon">${e.icon}</span>
        <div class="tl-body">
          <div class="tl-text">${esc(e.text)}</div>
          <div class="tl-date">${fmtD(e.date)} ${fmtT(e.date)}</div>
        </div>
      </div>`).join('')
    : '<div class="notes-empty">No activity recorded.</div>';
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  S.curLeadId = null;
  restoreModalFocus();
}

function onModalStatusChange() {
  const val  = document.getElementById('m-status')?.value;
  const wrap = document.getElementById('m-dnc-wrap');
  if (wrap) wrap.style.display = val === 'Do Not Call' ? 'block' : 'none';
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
  const ne = document.getElementById('edit-email');
  const nn = document.getElementById('m-name')?.textContent?.trim();
  if (ne && (ne.value.trim() !== (l.email || ''))) l.email = ne.value.trim();
  if (np) {
    const normPhone = normalizePhone(np);
    if (normPhone !== normalizePhone(l.phone || '')) {
      const dup = S.leads.find(x => x.id !== l.id && normalizePhone(x.phone || '') === normPhone && normPhone);
      if (dup && !confirm(`That phone number already exists on lead "${dup.name}". Continue anyway?`)) return;
      l.phone = normPhone;
    }
  }
  if (na && na !== l.address) l.address = na;
  if (nn && nn !== l.name)    l.name    = nn;

  // Save deal value
  const dv = parseFloat(document.getElementById('m-deal-value')?.value || 0);
  if (dv > 0) l.dealValue = dv;

  const newStatus = document.getElementById('m-status')?.value;

  // Intercept Closed Won — require deal value. Persist the field edits captured
  // above FIRST: the deal-value overlay can be cancelled, and without this the
  // name/phone/email/address edits would be lost (in-memory only, never saved).
  if (newStatus === 'Closed Won' && l.status !== 'Closed Won') {
    l.updatedAt = new Date().toISOString();
    pushLead(l);
    interceptCerrado(l.id);
    return;
  }

  // Closed Lost — release closer, cancel pending commission
  if (newStatus === 'Closed Lost' && l.status !== 'Closed Lost') {
    if (!Array.isArray(l.workHistory)) l.workHistory = [];
    if (l.closerId) {
      l.workHistory.push({
        closerId:   l.closerId,
        closerName: S.team.find(m => m.id === l.closerId)?.name || l.closerId,
        outcome:    'Closed Lost',
        releasedAt: new Date().toISOString(),
      });
    }
    if (!cancelLeadCommission(l.id, 'Deal marked Closed Lost') && l.commissionStatus === 'pending') l.commissionStatus = 'cancelled';
    l.residualActive = false;   // churned — stop generating monthly residuals
    l.closerId = ''; l.lockedBy = ''; l.lockedUntil = ''; l.assignedAt = '';
  }

  // DNC guard — require reason
  if (newStatus === 'Do Not Call' && l.status !== 'Do Not Call') {
    const reason = document.getElementById('m-dnc-reason')?.value?.trim();
    if (!reason) { toast('Please enter the DNC reason — required as a legal record.', 'error'); return; }
    l.dncReason = reason;
  }

  // Assign closer at Interested
  if (newStatus === 'Interested' && l.status !== 'Interested' && !l.closerId && S.session) {
    l.closerId   = S.session.userId;
    l.closerRate = S.session.closerRate || 0;
    l.assignedAt = new Date().toISOString();
    l.lockedBy   = S.session.userId;
    l.lockedUntil = ''; // permanent assignment — no 4h expiry at Interested
  }

  l.status       = newStatus;
  l.followUpDate = document.getElementById('m-followup')?.value || '';
  l.updatedAt    = new Date().toISOString();
  pushLead(l);
  closeModal();
  toast('Lead saved', 'success');
  renderAll();
}

function deleteLeadModal() {
  const l = S.leads.find(x => x.id === S.curLeadId);
  if (!l) return;
  if (l.status === 'Do Not Call' && S.session?.role !== 'admin') {
    toast('Only an admin can delete leads marked "Do Not Call".', 'error');
    return;
  }
  if (S.config.scriptUrl) sheetsCall({action:'delete', id:S.curLeadId});
  S.deletedIds.add(S.curLeadId);   // tombstone — see deleteSelected
  S.dirty.delete(S.curLeadId);
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

function normalizePhone(raw) {
  let p = String(raw || '').replace(/[\s\-\(\)\.]/g, '');
  if (/^\d{10}$/.test(p))   p = '+1' + p;   // US 10-digit → +1 (e.g. 3055550199)
  if (/^1\d{10}$/.test(p))  p = '+' + p;    // 1xxxxxxxxxx → +1xxxxxxxxxx
  return p;
}

function onDealValueInput() {
  const l = S.leads.find(x => x.id === S.curLeadId);
  if (l) renderDealPreview(l);
}

function renderDealPreview(lead) {
  const wrap = document.getElementById('m-deal-preview');
  if (!wrap) return;
  const val = parseFloat(document.getElementById('m-deal-value')?.value || lead.dealValue || 0);
  if (!val) { wrap.textContent = ''; return; }
  const {closerAmount} = calcCommissions(lead, val);
  const cName = S.team.find(m => m.id === lead.closerId)?.name || S.session?.userName || '—';
  wrap.innerHTML = `Closer (${esc(cName)}): <strong>${fmtUSD(closerAmount)}</strong>`;
}

function startCallFromModal(leadId) { closeModal(); makeCall(leadId); }

// Close modal on outside click / Escape
document.getElementById('modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('modal')) closeModal();
});
