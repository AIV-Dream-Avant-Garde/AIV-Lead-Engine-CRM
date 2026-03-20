/* ── Commission calculations & deal value flow ────────────── */

function fmtCOP(n) {
  if (!n && n !== 0) return '--';
  const num = parseFloat(n);
  if (isNaN(num)) return '--';
  return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(num);
}

function calcCommissions(lead, dealValue) {
  const isSelfSourced = lead.providerId && lead.providerId === lead.closerId;
  const provRate = isSelfSourced ? 0 : parseFloat(lead.providerRate || 0);
  const closRate = parseFloat(lead.closerRate || 0);
  return {
    providerAmount: dealValue * provRate / 100,
    closerAmount:   dealValue * closRate / 100,
    provRate,
    closRate,
  };
}

function updateDealPreview() {
  const val     = parseFloat(document.getElementById('deal-value-inp')?.value || '0');
  const preview = document.getElementById('deal-preview');
  if (!preview) return;
  if (!val || val <= 0) { preview.style.display = 'none'; return; }
  const lead = S.leads.find(l => l.id === S.pendingCerrado);
  if (!lead) return;
  const {providerAmount, closerAmount, provRate, closRate} = calcCommissions(lead, val);
  const providerMember = S.team.find(m => m.id === lead.providerId);
  const closerMember   = S.team.find(m => m.id === (lead.closerId || S.session?.userId));
  document.getElementById('dp-provider-label').textContent =
    (providerMember ? providerMember.name.split(' ')[0] : 'Proveedor') + ' (' + provRate + '%):';
  document.getElementById('dp-closer-label').textContent =
    (closerMember   ? closerMember.name.split(' ')[0]   : 'Closer')   + ' (' + closRate + '%):';
  document.getElementById('dp-provider-amt').textContent = fmtCOP(providerAmount);
  document.getElementById('dp-closer-amt').textContent   = fmtCOP(closerAmount);
  document.getElementById('dp-total').textContent        = fmtCOP(providerAmount + closerAmount);
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
  const pMember = S.team.find(m => m.id === lead.providerId);
  if (pMember && !lead.providerRate) lead.providerRate = parseFloat(pMember.providerRate || 0);
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
  const {providerAmount, closerAmount} = calcCommissions(lead, dealValue);
  lead.dealValue          = dealValue;
  lead.providerCommission = providerAmount.toFixed(0);
  lead.closerCommission   = closerAmount.toFixed(0);
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
    providerId:     lead.providerId || '',
    providerName:   S.team.find(m => m.id === lead.providerId)?.name || '',
    providerAmount: lead.providerCommission,
    closerId:       lead.closerId,
    closerName:     S.team.find(m => m.id === lead.closerId)?.name || S.session?.userName || '',
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
  const {providerAmount, closerAmount} = calcCommissions(lead, collected);
  S.commissions
    .filter(c => c.leadId === leadId && c.status === 'pending')
    .forEach(c => {
      c.providerAmount  = providerAmount;
      c.closerAmount    = closerAmount;
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
        const clawback = {
          id:             uid(),
          leadId:         c.leadId,
          leadName:       c.leadName,
          dealValue:      -(parseFloat(c.dealValue)      || 0),
          providerId:     c.providerId,
          providerName:   c.providerName,
          providerAmount: -(parseFloat(c.providerAmount) || 0),
          closerId:       c.closerId,
          closerName:     c.closerName,
          closerAmount:   -(parseFloat(c.closerAmount)   || 0),
          status:         'clawback',
          refundReason:   reason,
          adjustedBy:     S.session?.userName || 'Admin',
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
