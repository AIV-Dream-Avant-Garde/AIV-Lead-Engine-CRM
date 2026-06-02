/* ── Commission calculations & deal value flow ────────────── */

function fmtCOP(n) {
  if (!n && n !== 0) return '--';
  const num = parseFloat(n);
  if (isNaN(num)) return '--';
  return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(num);
}

// Per-rep performance + earnings. Pure (unit-tested). A rep's earnings = closer
// cut on deals they closed + provider cut on deals they sourced; cancelled rows
// excluded, clawbacks (negative) counted in paid so refunds reduce the total.
function repStats(userId, leads, commissions) {
  const me = String(userId || '');
  const mine = (leads || []).filter(l => String(l.closerId) === me || String(l.providerId) === me);
  const worked = mine.length;
  const closed = mine.filter(l => l.status === 'Cerrado').length;
  const conversion = worked ? Math.round(closed / worked * 100) : 0;
  let paid = 0, pending = 0;
  (commissions || []).forEach(c => {
    if (c.status === 'cancelled') return;
    let amt = 0;
    if (String(c.closerId) === me)   amt += parseFloat(c.closerAmount || 0);
    if (String(c.providerId) === me) amt += parseFloat(c.providerAmount || 0);
    if (!amt) return;
    if (c.status === 'paid' || c.status === 'clawback') paid += amt;
    else if (c.status === 'pending') pending += amt;
  });
  return { worked, closed, conversion, paid, pending, total: paid + pending };
}

// Active team members ranked by closed deals, then total earnings. Pure.
function teamLeaderboard(team, leads, commissions) {
  return (team || [])
    .filter(m => String(m.active) !== 'false')
    .map(m => Object.assign({ member: m }, repStats(m.id, leads, commissions)))
    .sort((a, b) => (b.closed - a.closed) || (b.total - a.total));
}

function calcCommissions(lead, dealValue) {
  const closer   = S.team.find(m => m.id === lead.closerId);
  const closRate = parseFloat(closer?.closerRate || lead.closerRate || 0);
  const provider = S.team.find(m => m.id === lead.providerId);
  const provRate = parseFloat(provider?.providerRate || lead.providerRate || 0);
  return {
    closerAmount:   dealValue * closRate / 100,
    providerAmount: dealValue * provRate / 100,
    closRate,
    provRate,
  };
}

function updateDealPreview() {
  const val     = parseFloat(document.getElementById('deal-value-inp')?.value || '0');
  const preview = document.getElementById('deal-preview');
  if (!preview) return;
  if (!val || val <= 0) { preview.style.display = 'none'; return; }
  const lead = S.leads.find(l => l.id === S.pendingCerrado);
  if (!lead) return;
  const {closerAmount, providerAmount, closRate, provRate} = calcCommissions(lead, val);
  const closerMember = S.team.find(m => m.id === (lead.closerId || S.session?.userId));
  document.getElementById('dp-closer-label').textContent =
    (closerMember ? closerMember.name.split(' ')[0] : 'Closer') + ' (' + closRate + '%):';
  document.getElementById('dp-closer-amt').textContent = fmtCOP(closerAmount);

  const provRow = document.getElementById('dp-provider-row');
  if (provRow) {
    if (provRate > 0) {
      const providerMember = S.team.find(m => m.id === lead.providerId);
      document.getElementById('dp-provider-label').textContent =
        (providerMember ? providerMember.name.split(' ')[0] : 'Proveedor') + ' (' + provRate + '%):';
      document.getElementById('dp-provider-amt').textContent = fmtCOP(providerAmount);
      provRow.style.display = '';
    } else {
      provRow.style.display = 'none';
    }
  }
  document.getElementById('dp-total').textContent = fmtCOP(closerAmount + providerAmount);
  preview.style.display = 'block';
}

function interceptCerrado(leadId) {
  const lead = S.leads.find(l => l.id === leadId);
  if (!lead) return;
  if (lead.dealValue && parseFloat(lead.dealValue) > 0) {
    confirmCerradoWithValue(leadId, parseFloat(lead.dealValue));
    return;
  }
  S.pendingCerrado = leadId;
  if (!lead.closerId && S.session) {
    lead.closerId   = S.session.userId;
    lead.closerRate = S.session.closerRate || 0;
  }
  document.getElementById('deal-value-inp').value    = '';
  document.getElementById('deal-preview').style.display = 'none';
  document.getElementById('deal-overlay').classList.add('open');
}

function confirmDealValue() {
  const val = parseFloat(document.getElementById('deal-value-inp')?.value || '0');
  if (!val || val <= 0) { toast('Ingresa un valor válido mayor a 0.', 'error'); return; }
  document.getElementById('deal-overlay').classList.remove('open');
  confirmCerradoWithValue(S.pendingCerrado, val);
  S.pendingCerrado = null;
}

function confirmCerradoWithValue(leadId, dealValue) {
  const lead = S.leads.find(l => l.id === leadId);
  if (!lead) return;
  if (!lead.closerId && S.session) {
    lead.closerId   = S.session.userId;
    lead.closerRate = S.session.closerRate || 0;
  }
  const {closerAmount, providerAmount, closRate, provRate} = calcCommissions(lead, dealValue);
  lead.dealValue          = dealValue;
  lead.closerCommission   = closerAmount.toFixed(0);
  lead.providerCommission = providerAmount.toFixed(0);
  lead.commissionStatus   = 'pending';
  lead.status             = 'Cerrado';
  lead.updatedAt          = new Date().toISOString();
  if (!Array.isArray(lead.workHistory)) lead.workHistory = [];
  lead.workHistory.push({
    closerId:   lead.closerId,
    closerName: S.team.find(m => m.id === lead.closerId)?.name || S.session?.userName || '',
    outcome:    'Cerrado',
    closedAt:   lead.updatedAt,
    dealValue,
  });
  pushLead(lead);
  const commRec = {
    id:             uid(),
    leadId:         lead.id,
    leadName:       lead.name,
    dealValue,
    collectedAmount: '',
    providerId:     lead.providerId || '',
    providerName:   S.team.find(m => m.id === lead.providerId)?.name || '',
    providerRate:   provRate,
    providerAmount: lead.providerCommission,
    closerId:       lead.closerId,
    closerName:     S.team.find(m => m.id === lead.closerId)?.name || S.session?.userName || '',
    closerRate:     closRate,
    closerAmount:   lead.closerCommission,
    status:         'pending',
    paidAt:'', paidBy:'', paymentRef:'',
    createdAt:      lead.updatedAt,
  };
  S.commissions.push(commRec);
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'saveCommission', ...commRec});
  toast('Negocio cerrado — comisión registrada', 'success');
  closeModal();
  renderAll();
}

// ── Partial payments, refunds & clawbacks ──────────────────

function adjustCollectedAmount(leadId, collectedRaw, reason) {
  const lead = S.leads.find(l => l.id === leadId);
  if (!lead) return;
  const collected = parseFloat(collectedRaw);
  if (isNaN(collected) || collected < 0 || collected > parseFloat(lead.dealValue || 0)) {
    toast('Monto inválido. Debe ser entre 0 y ' + fmtCOP(lead.dealValue) + '.', 'error'); return;
  }
  lead.collectedAmount = collected;
  lead.updatedAt = new Date().toISOString();
  const {closerAmount, providerAmount} = calcCommissions(lead, collected);
  S.commissions
    .filter(c => c.leadId === leadId && c.status === 'pending')
    .forEach(c => {
      c.closerAmount    = closerAmount;
      c.providerAmount  = providerAmount;   // scale provider with partial collection too (was left at full deal value)
      c.collectedAmount = collected;
      c.adjustedBy      = S.session?.userName || 'Admin';
      c.adjustedAt      = new Date().toISOString();
      if (reason) c.refundReason = reason;
    });
  pushLead(lead);
  if (S.config.scriptUrl) sheetsCall({action:'adjustCollected', leadId, collected, reason: reason || '', adjustedBy: S.session?.userName || 'Admin'});
  saveLocal();
  auditLog('adjustCollected', leadId, `${lead.name} → ${fmtCOP(collected)}`);
  toast('Monto cobrado actualizado', 'success');
  renderAll();
}

function cancelCommission(commId, reason) {
  const c = S.commissions.find(x => x.id === commId);
  if (!c || c.status !== 'pending') return;
  const now = new Date().toISOString();
  c.status       = 'cancelled';
  c.refundReason = reason || '';
  c.adjustedBy   = S.session?.userName || 'Admin';
  c.adjustedAt   = now;
  const lead = S.leads.find(l => l.id === c.leadId);
  if (lead) { lead.commissionStatus = 'cancelled'; lead.updatedAt = now; pushLead(lead); }
  if (S.config.scriptUrl) sheetsCall({action:'cancelCommission', id: commId, reason: reason || '', adjustedBy: c.adjustedBy});
  saveLocal();
  auditLog('cancelCommission', commId, reason || '');
  toast('Comisión cancelada', 'warning');
  renderAll();
}

function issueRefund(leadId, reason) {
  if (!reason) return;
  const lead = S.leads.find(l => l.id === leadId);
  if (!lead) return;
  const now = new Date().toISOString();
  lead.refundAmount = parseFloat(lead.collectedAmount || lead.dealValue || 0);
  lead.refundReason = reason;
  lead.refundedAt   = now;
  lead.updatedAt    = now;

  S.commissions
    .filter(c => c.leadId === leadId && c.status !== 'clawback')
    .forEach(c => {
      if (c.status === 'pending') {
        c.status       = 'cancelled';
        c.refundReason = reason;
        c.adjustedBy   = S.session?.userName || 'Admin';
        c.adjustedAt   = now;
        if (S.config.scriptUrl) sheetsCall({action:'cancelCommission', id: c.id, reason, adjustedBy: c.adjustedBy});
      } else if (c.status === 'paid') {
        // Reverse BOTH the closer and provider payouts (negative amounts).
        const clawback = {
          id:             uid(),
          leadId:         c.leadId,
          leadName:       c.leadName,
          dealValue:      -(parseFloat(c.dealValue)      || 0),
          collectedAmount:-(parseFloat(c.collectedAmount)|| 0),
          providerId:     c.providerId   || '',
          providerName:   c.providerName  || '',
          providerRate:   c.providerRate  || 0,
          providerAmount: -(parseFloat(c.providerAmount) || 0),
          closerId:       c.closerId,
          closerName:     c.closerName,
          closerRate:     c.closerRate    || 0,
          closerAmount:   -(parseFloat(c.closerAmount)   || 0),
          status:         'clawback',
          refundReason:   reason,
          adjustedBy:     S.session?.userName || 'Admin',
          adjustedAt:     now,
          paidAt:'', paidBy:'', paymentRef:'',
          createdAt:      now,
        };
        S.commissions.push(clawback);
        if (S.config.scriptUrl) sheetsCall({action:'saveCommission', ...clawback, isClawback: true});
      }
    });

  pushLead(lead);
  saveLocal();
  auditLog('issueRefund', leadId, reason);
  toast('Reembolso registrado', 'warning');
  renderAll();
}
