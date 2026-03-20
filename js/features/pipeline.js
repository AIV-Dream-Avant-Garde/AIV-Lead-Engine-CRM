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
  const kb = document.getElementById('kanban');
  if (!kb) return;
  kb.innerHTML = cols.map(col => {
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
      return `<div class="kanban-card" onclick="openLead('${l.id}')">
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
    return `<div class="kanban-col">
      <div class="kanban-header">
        <span class="kanban-title" style="color:${col.c}">${col.k}</span>
        <span class="kanban-count">${total}</span>
      </div>
      <div class="kanban-cards">${html}</div>
    </div>`;
  }).join('');
}
