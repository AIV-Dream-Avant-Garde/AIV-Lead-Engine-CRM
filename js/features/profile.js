/* ── FEATURE: Mi Perfil section ──────────────────────────── */

// renderPerfil — consolidated (base stats + call stats + funnel + solo split)
function renderPerfil() {
  if (!S.session) return;
  const user   = S.session;
  const uid_   = user.userId;
  const role   = user.role;
  const initials = user.userName.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0,2);

  // Header
  const ph = document.getElementById('perfil-header');
  if (ph) ph.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${initials}</div>
      <div>
        <div class="profile-name">${esc(user.userName)}</div>
        <div class="profile-role-label">${role}</div>
        <div class="profile-rates">
          ${user.providerRate > 0 ? `<span class="rate-badge rate-provider">Proveedor: ${user.providerRate}%</span>` : ''}
          ${user.closerRate   > 0 ? `<span class="rate-badge rate-closer">Closer: ${user.closerRate}%</span>`   : ''}
        </div>
      </div>
    </div>`;

  // Lead stats
  const myLeads  = S.leads.filter(l => l.providerId === uid_ || l.closerId === uid_);
  const myClosed = myLeads.filter(l => l.status === 'Cerrado');
  const myComm   = S.commissions.filter(c => c.providerId === uid_ || c.closerId === uid_);
  // Include clawbacks (negative amounts) to accurately reduce totalPaid on refunds
  const totalPaid = myComm.filter(c => c.status === 'paid' || c.status === 'clawback').reduce((s,c) => {
    let a = 0;
    if (c.closerId   === uid_) a += parseFloat(c.closerAmount   || 0);
    if (c.providerId === uid_) a += parseFloat(c.providerAmount || 0);
    return s + a;
  }, 0);
  const totalPending = myComm.filter(c => c.status === 'pending').reduce((s,c) => {
    let a = 0;
    if (c.closerId   === uid_) a += parseFloat(c.closerAmount   || 0);
    if (c.providerId === uid_) a += parseFloat(c.providerAmount || 0);
    return s + a;
  }, 0);
  const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setEl('pst-leads',   myLeads.length);
  setEl('pst-closed',  myClosed.length);
  setEl('pst-earned',  fmtCOP(totalPaid));
  setEl('pst-pending', fmtCOP(totalPending));

  // Call stats
  const myCalls  = S.calls.filter(c => {
    const lead = S.leads.find(l => l.id === c.leadId);
    return lead && (lead.closerId === uid_ || lead.providerId === uid_);
  });
  const answered = myCalls.filter(c => c.outcome === 'answered');
  const avgDur   = myCalls.length
    ? Math.round(myCalls.reduce((s,c) => s + parseInt(c.duration||0), 0) / myCalls.length) : 0;
  setEl('pcs-total',    myCalls.length);
  setEl('pcs-answered', answered.length);
  setEl('pcs-rate',     myCalls.length ? Math.round(answered.length / myCalls.length * 100) + '%' : '0%');
  setEl('pcs-duration', avgDur ? fmtSec(avgDur) : '0:00');

  // Follow-up queue (overdue)
  const myFU = S.leads
    .filter(l => (l.closerId === uid_ || l.lockedBy === uid_) && isOverdue(l))
    .sort((a,b) => new Date(a.followUpDate) - new Date(b.followUpDate));
  const fuList = document.getElementById('perfil-followup-list');
  if (fuList) {
    fuList.innerHTML = myFU.length
      ? myFU.map(l => `
        <div class="fu-queue-item overdue" onclick="openLead('${l.id}')">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500;color:var(--hl);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.name)}</div>
            <div style="font-size:11px;color:var(--body)">${esc(l.phone)} · ${esc(l.city||'')} ${esc(l.barrio||'')}</div>
          </div>
          <span class="fu-badge fu-overdue">Vencido ${fmtD(l.followUpDate)}</span>
        </div>`).join('')
      : '<div class="notes-empty">Sin seguimientos vencidos. Bien hecho.</div>';
  }

  // Funnel
  const total = myLeads.length;
  const funnelWrap = document.getElementById('perfil-funnel');
  if (funnelWrap && total > 0) {
    const steps = [
      {label:'Nuevo',        count:myLeads.filter(l=>l.status==='Nuevo').length,              color:'var(--s-new)'},
      {label:'Contactado',   count:myLeads.filter(l=>l.status==='Contactado').length,         color:'var(--s-contact)'},
      {label:'Interesado',   count:myLeads.filter(l=>l.status==='Interesado').length,         color:'var(--s-interest)'},
      {label:'Cerrado',      count:myLeads.filter(l=>l.status==='Cerrado').length,            color:'var(--s-closed)'},
      {label:'Neg. fallida', count:myLeads.filter(l=>l.status==='Negociacion fallida').length,color:'var(--s-failed)'},
    ];
    funnelWrap.innerHTML = steps.map(s =>
      `<div class="funnel-row">
        <div class="funnel-label">${s.label}</div>
        <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${Math.round(s.count/total*100)}%;background:${s.color}"></div></div>
        <div class="funnel-count">${s.count}</div>
        <div class="funnel-pct">${Math.round(s.count/total*100)}%</div>
      </div>`
    ).join('');
  }

  // Commission ledger
  const commList = document.getElementById('perfil-comm-list');
  if (commList) {
    // Solo operator: show provider/closer split summary first
    if (role === 'solo') {
      let asProvider = 0, asCloser = 0;
      myComm.forEach(c => {
        if (c.providerId === uid_) asProvider += parseFloat(c.providerAmount || 0);
        if (c.closerId   === uid_) asCloser   += parseFloat(c.closerAmount   || 0);
      });
      commList.insertAdjacentHTML('beforebegin',
        `<div style="display:flex;gap:10px;margin-bottom:10px">
          <div class="perf-stat" style="flex:1"><div class="perf-val">${fmtCOP(asProvider)}</div><div class="perf-lbl">Como proveedor</div></div>
          <div class="perf-stat" style="flex:1"><div class="perf-val">${fmtCOP(asCloser)}</div><div class="perf-lbl">Como closer</div></div>
        </div>`
      );
    }
    commList.innerHTML = myComm.length
      ? myComm.slice(0,20).map(c => {
          let amt = 0;
          if (c.closerId   === uid_) amt += parseFloat(c.closerAmount   || 0);
          if (c.providerId === uid_) amt += parseFloat(c.providerAmount || 0);
          const statusCls = {pending:'comm-pending', paid:'comm-paid', cancelled:'comm-cancelled', clawback:'comm-cancelled'}[c.status] || 'comm-pending';
          const statusLbl = {pending:'Pendiente', paid:'Pagado', cancelled:'Cancelado', clawback:'Reembolso'}[c.status] || c.status;
          return `<div class="comm-item">
            <div class="comm-info">
              <div class="comm-lead">${esc(c.leadName||'--')}</div>
              <div class="comm-detail">Negocio: ${fmtCOP(c.dealValue)} · ${fmtD(c.createdAt)}</div>
            </div>
            <span class="comm-amount">${fmtCOP(amt)}</span>
            <span class="comm-status-badge ${statusCls}">${statusLbl}</span>
          </div>`;
        }).join('')
      : '<div class="notes-empty">Sin comisiones registradas aun.</div>';
  }
}

function updatePerfilBadge() {
  if (!S.session) return;
  const uid_    = S.session.userId;
  const overdue = S.leads.filter(l => (l.closerId === uid_ || l.lockedBy === uid_) && isOverdue(l)).length;
  const badge   = document.getElementById('nav-perfil-badge');
  if (badge) {
    badge.style.display = overdue > 0 ? '' : 'none';
    badge.textContent   = overdue;
  }
}
