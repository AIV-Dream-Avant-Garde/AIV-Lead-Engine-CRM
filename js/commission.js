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
  if (!val || val <= 0) { alert('Ingresa un valor valido mayor a 0.'); return; }
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
  localStorage.setItem('aiv-comm', JSON.stringify(S.commissions));
  if (S.config.scriptUrl) sheetsCall({action:'saveCommission', ...commRec});
  closeModal();
  renderAll();
}
