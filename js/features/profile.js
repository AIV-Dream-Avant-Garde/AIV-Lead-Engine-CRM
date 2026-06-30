/* ── FEATURE: My Profile section ──────────────────────────── */

// renderPerfil — consolidated (base stats + call stats + funnel + solo split)
function renderPerfil() {
  if (!S.session) return;
  const user   = S.session;
  const uid_   = user.userId;
  const role   = ({admin:'Admin', closer:'Closer', setter:'Appointment Setter', solo:'Solo Operator'})[user.role] || user.role;
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
          ${user.closerRate > 0 ? `<span class="rate-badge rate-closer">Closer: ${user.closerRate}%</span>` : ''}
          ${user.providerRate > 0 ? `<span class="rate-badge rate-provider">Provider: ${user.providerRate}%</span>` : ''}
        </div>
      </div>
    </div>`;

  // Lead stats — always PERSONAL scope: leads where you're the closer, the
  // sourcer (provider), or you've claimed (locked) them. Company-wide totals live
  // in Admin → Team & Money; this is "My Profile".
  const myLeads  = S.leads.filter(l => l.closerId === uid_ || l.lockedBy === uid_ || l.providerId === uid_);
  const myClosed = myLeads.filter(l => l.status === 'Closed Won');
  const myComm   = S.commissions.filter(c => c.closerId === uid_ || c.providerId === uid_);
  // This user's share of a commission record: closer cut if they closed it, provider cut if they sourced it
  const myShare  = c => (c.closerId === uid_ ? parseFloat(c.closerAmount||0) : 0) + (c.providerId === uid_ ? parseFloat(c.providerAmount||0) : 0);
  // Include clawbacks (negative amounts) to accurately reduce totalPaid on refunds
  const totalPaid = myComm.filter(c => c.status === 'paid' || c.status === 'clawback').reduce((s,c) =>
    s + myShare(c), 0);
  const totalPending = myComm.filter(c => c.status === 'pending').reduce((s,c) =>
    s + myShare(c), 0);
  const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setEl('pst-leads',   myLeads.length);
  setEl('pst-closed',  myClosed.length);
  setEl('pst-earned',  fmtUSD(totalPaid));
  setEl('pst-pending', fmtUSD(totalPending));
  setEl('pst-rate',    (myLeads.length ? Math.round(myClosed.length / myLeads.length * 100) : 0) + '%');
  setEl('pst-total',   fmtUSD(totalPaid + totalPending));

  // My leads by status — a quick breakdown (New / Contacted / …) of the leads above.
  const sb = document.getElementById('perfil-status-breakdown');
  if (sb) {
    const order = ['New','Contacted','Interested','Closed Won','Closed Lost','Not Interested','Do Not Call'];
    const counts = {};
    myLeads.forEach(l => { const st = l.status || 'New'; counts[st] = (counts[st] || 0) + 1; });
    const chips = order.filter(st => counts[st]).map(st =>
      `<span class="pf-status-chip"><span class="pf-status-dot" style="background:${(typeof STATUS_COLOR!=='undefined'&&STATUS_COLOR[st])||'#999'}"></span>${esc(st)} <strong>${counts[st]}</strong></span>`).join('');
    sb.innerHTML = chips || '<div class="notes-empty" style="padding:4px 0">No leads assigned to you yet.</div>';
  }

  // Call stats — your calls only (or calls on leads you own).
  const myCalls  = S.calls.filter(c => {
    if (c.calledBy) return c.calledBy === uid_;
    const lead = S.leads.find(l => l.id === c.leadId);
    return lead && lead.closerId === uid_;
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
    .filter(l => (l.closerId === uid_ || l.lockedBy === uid_ || l.providerId === uid_) && isOverdue(l))
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
          <span class="fu-badge fu-overdue">Overdue ${fmtD(l.followUpDate)}</span>
        </div>`).join('')
      : '<div class="notes-empty">No overdue follow-ups. Well done.</div>';
  }

  // Funnel
  const total = myLeads.length;
  const funnelWrap = document.getElementById('perfil-funnel');
  if (funnelWrap && total > 0) {
    const steps = [
      {label:'New',        count:myLeads.filter(l=>l.status==='New').length,              color:'var(--s-new)'},
      {label:'Contacted',   count:myLeads.filter(l=>l.status==='Contacted').length,         color:'var(--s-contact)'},
      {label:'Interested',   count:myLeads.filter(l=>l.status==='Interested').length,         color:'var(--s-interest)'},
      {label:'Closed Won',      count:myLeads.filter(l=>l.status==='Closed Won').length,            color:'var(--s-closed)'},
      {label:'Closed Lost', count:myLeads.filter(l=>l.status==='Closed Lost').length,color:'var(--s-failed)'},
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
    commList.innerHTML = myComm.length
      ? myComm.slice(0,20).map(c => {
          const amt = myShare(c);
          const statusCls = {pending:'comm-pending', paid:'comm-paid', cancelled:'comm-cancelled', clawback:'comm-cancelled'}[c.status] || 'comm-pending';
          const statusLbl = {pending:'Pending', paid:'Paid', cancelled:'Cancelled', clawback:'Refund'}[c.status] || c.status;
          const isRec = (c.recurring === true || c.recurring === 'true');
          return `<div class="comm-item">
            <div class="comm-info">
              <div class="comm-lead">${esc(c.leadName||'--')}${isRec ? ` <span class="comm-status-badge" style="background:var(--acc-m);color:var(--accent)">Recurring${c.period ? ' · ' + esc(c.period) : ''}</span>` : ''}</div>
              <div class="comm-detail">${isRec ? 'Monthly' : 'Deal'}: ${fmtUSD(c.dealValue)} · ${fmtD(c.createdAt)}</div>
            </div>
            <span class="comm-amount">${fmtUSD(amt)}</span>
            <span class="comm-status-badge ${statusCls}">${statusLbl}</span>
          </div>`;
        }).join('')
      : '<div class="notes-empty">No commissions recorded yet.</div>';
  }
}

function updatePerfilBadge() {
  if (!S.session) return;
  const uid_    = S.session.userId;
  const overdue = S.leads.filter(l => (l.closerId === uid_ || l.lockedBy === uid_ || l.providerId === uid_) && isOverdue(l)).length;
  const badge   = document.getElementById('nav-perfil-badge');
  if (badge) {
    badge.style.display = overdue > 0 ? '' : 'none';
    badge.textContent   = overdue;
  }
}
