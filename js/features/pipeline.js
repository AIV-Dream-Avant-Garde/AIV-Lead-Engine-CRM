/* ── FEATURE: Kanban pipeline view ───────────────────────── */

function renderPipeline() {
  const q   = (document.getElementById('kb-q')?.value    || '').toLowerCase();
  const fc  = document.getElementById('kb-city')?.value  || '';
  const CAP = 60;
  const cols = [
    {k:'Nuevo',               c:'var(--s-new)'},
    {k:'Contactado',          c:'var(--s-contact)'},
    {k:'Interesado',          c:'var(--s-interest)'},
    {k:'Cerrado',             c:'var(--s-closed)'},
    {k:'Negociacion fallida', c:'var(--s-failed)'},
    {k:'No interesado',       c:'var(--s-dead)'},
    {k:'No llamar',           c:'var(--s-dnc)'},
  ];

  // Pipeline metrics bar
  const openValue = S.leads
    .filter(l => ['Nuevo','Contactado','Interesado'].includes(l.status || 'Nuevo') && l.dealValue)
    .reduce((s, l) => s + parseFloat(l.dealValue), 0);
  const openCount = S.leads.filter(l => ['Nuevo','Contactado','Interesado'].includes(l.status || 'Nuevo')).length;
  const closedThisMonth = (() => {
    const m = new Date().toISOString().slice(0,7);
    return S.leads.filter(l => l.status === 'Cerrado' && l.updatedAt && l.updatedAt.startsWith(m));
  })();
  const metricsHtml = `<div class="pipeline-metrics">
    <div class="pipeline-metric"><strong>${openCount}</strong>Leads activos</div>
    <div class="pipeline-metric"><strong>${fmtCOP(openValue)}</strong>Pipeline abierto</div>
    <div class="pipeline-metric"><strong>${closedThisMonth.length}</strong>Cerrados este mes</div>
    <div class="pipeline-metric"><strong>${fmtCOP(closedThisMonth.reduce((s,l)=>s+parseFloat(l.dealValue||0),0))}</strong>Revenue este mes</div>
  </div>`;

  const kb = document.getElementById('kanban');
  if (!kb) return;

  const columnsHtml = cols.map(col => {
    let cards = S.leads.filter(l => (l.status || 'Nuevo') === col.k);
    if (fc) cards = cards.filter(l => l.city === fc);
    if (q)  cards = cards.filter(l => `${l.name} ${l.phone} ${l.barrio}`.toLowerCase().includes(q));
    const total = cards.length;
    const now   = Date.now();
    const html  = cards.slice(0, CAP).map(l => {
      const ageDays = l.updatedAt ? Math.floor((now - new Date(l.updatedAt)) / 86400000) : 0;
      const ageBadge = ageDays > 0
        ? `<span style="font-size:10px;background:var(--surface-hi);border-radius:4px;padding:1px 5px;margin-left:4px;color:var(--sub)">${ageDays}d</span>`
        : '';
      const dealChip = col.k === 'Cerrado' && l.dealValue
        ? `<div style="font-size:10px;color:var(--green);font-weight:600;margin-top:3px">${fmtCOP(l.dealValue)}</div>`
        : '';
      return `<div class="kanban-card pipeline-card" draggable="true"
          ondragstart="pipelineDragStart(event,'${l.id}')"
          ondragend="pipelineDragEnd(event)"
          onclick="openLead('${l.id}')">
        <div class="kc-name">${esc(l.name)}${ageBadge}</div>
        <div class="kc-meta">${esc(l.phone || '--')}</div>
        <div class="kc-meta">${esc(l.barrio || l.city || '')}${dealChip}</div>
      </div>`;
    }).join('') +
      (total > CAP
        ? `<div style="font-size:11px;color:var(--body);padding:7px;text-align:center">+${total-CAP} mas</div>`
        : total === 0
          ? '<div style="font-size:11px;color:var(--body);padding:7px">Sin leads</div>'
          : '');
    return `<div class="kanban-col pipeline-col" data-status="${esc(col.k)}"
        ondragover="pipelineDragOver(event)"
        ondragleave="pipelineDragLeave(event)"
        ondrop="pipelineDrop(event,'${esc(col.k)}')">
      <div class="kanban-header">
        <span class="kanban-title" style="color:${col.c}">${col.k}</span>
        <span class="kanban-count">${total}</span>
      </div>
      <div class="kanban-cards">${html}</div>
    </div>`;
  }).join('');

  kb.parentElement.querySelector('.pipeline-metrics')?.remove();
  kb.insertAdjacentHTML('beforebegin', metricsHtml);
  kb.innerHTML = columnsHtml;
}

// ── Drag-and-drop handlers ─────────────────────────────────
function pipelineDragStart(e, leadId) {
  e.dataTransfer.setData('text/plain', leadId);
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.target.classList.add('dragging'), 0);
}

function pipelineDragEnd(e) {
  e.target.classList.remove('dragging');
}

function pipelineDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.closest('.pipeline-col')?.classList.add('drop-target');
}

function pipelineDragLeave(e) {
  const col = e.currentTarget.closest('.pipeline-col');
  if (col && !col.contains(e.relatedTarget)) col.classList.remove('drop-target');
}

function pipelineDrop(e, newStatus) {
  e.preventDefault();
  const leadId = e.dataTransfer.getData('text/plain');
  const col = e.currentTarget.closest('.pipeline-col');
  col?.classList.remove('drop-target');
  const lead = S.leads.find(l => l.id === leadId);
  if (!lead || (lead.status || 'Nuevo') === newStatus) return;
  if (newStatus === 'Cerrado') { interceptCerrado(leadId); return; }
  lead.status    = newStatus;
  lead.updatedAt = new Date().toISOString();
  if (!Array.isArray(lead.workHistory)) lead.workHistory = [];
  lead.workHistory.push({
    closerId:  S.session?.userId || '',
    closerName: S.session?.userName || '',
    outcome:   newStatus,
    closedAt:  lead.updatedAt,
  });
  pushLead(lead);
  toast('Estado actualizado: ' + newStatus, 'success');
  renderPipeline();
}
