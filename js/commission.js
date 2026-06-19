/* ── Commission calculations & deal value flow ────────────── */

function fmtUSD(n) {
  if (!n && n !== 0) return '--';
  const num = parseFloat(n);
  if (isNaN(num)) return '--';
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(num);
}

// The real close timestamp for a Closed Won lead, read from the 'Closed Won'
// entry stamped into workHistory at close time (falls back to updatedAt for
// legacy rows). Use this — NOT updatedAt — for "closed/revenue this month", so
// later edits to an old deal never shift it into the current month.
function leadClosedAt(lead) {
  if (!lead) return '';
  const wh = Array.isArray(lead.workHistory) ? lead.workHistory : [];
  for (let i = wh.length - 1; i >= 0; i--) {
    if (wh[i] && wh[i].outcome === 'Closed Won' && wh[i].closedAt) return wh[i].closedAt;
  }
  return lead.updatedAt || '';
}

// Per-rep performance + earnings. Pure (unit-tested). A rep's earnings = closer
// cut on deals they closed + provider cut on deals they sourced; cancelled rows
// excluded, clawbacks (negative) counted in paid so refunds reduce the total.
function repStats(userId, leads, commissions) {
  const me = String(userId || '');
  const mine = (leads || []).filter(l => String(l.closerId) === me || String(l.providerId) === me);
  const worked = mine.length;
  const closed = mine.filter(l => l.status === 'Closed Won').length;
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
  document.getElementById('dp-closer-amt').textContent = fmtUSD(closerAmount);

  const provRow = document.getElementById('dp-provider-row');
  if (provRow) {
    if (provRate > 0) {
      const providerMember = S.team.find(m => m.id === lead.providerId);
      document.getElementById('dp-provider-label').textContent =
        (providerMember ? providerMember.name.split(' ')[0] : 'Provider') + ' (' + provRate + '%):';
      document.getElementById('dp-provider-amt').textContent = fmtUSD(providerAmount);
      provRow.style.display = '';
    } else {
      provRow.style.display = 'none';
    }
  }
  document.getElementById('dp-total').textContent = fmtUSD(closerAmount + providerAmount);
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
  if (!val || val <= 0) { toast('Enter a valid value greater than 0.', 'error'); return; }
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
  lead.status             = 'Closed Won';
  lead.updatedAt          = new Date().toISOString();
  if (!Array.isArray(lead.workHistory)) lead.workHistory = [];
  lead.workHistory.push({
    closerId:   lead.closerId,
    closerName: S.team.find(m => m.id === lead.closerId)?.name || S.session?.userName || '',
    outcome:    'Closed Won',
    closedAt:   lead.updatedAt,
    dealValue,
  });
  // Residual reps earn their rate EVERY month off the deal's recurring value, so
  // mark the lead as an active residual and tag the first period's row. One-time
  // reps get the single row as before.
  const closer     = S.team.find(m => m.id === lead.closerId);
  const isResidual = (closer?.commissionType === 'residual');
  if (isResidual) {
    lead.residualActive = true;
    lead.residualRate   = closRate;
    lead.residualMRR    = dealValue;
    pushLead(lead);
  }
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
    recurring:      isResidual ? true : '',
    period:         isResidual ? currentPeriod() : '',
  };
  S.commissions.push(commRec);
  saveLocal();
  bgSave({action:'saveCommission', ...commRec}, 'Commission');
  toast(isResidual ? 'Deal closed — first month’s residual recorded' : 'Deal closed — commission recorded', 'success');
  closeModal();
  renderAll();
}

// Calendar period key for recurring commissions, e.g. "2026-06".
function currentPeriod(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Generate this month's residual commission rows for every lead with an active
// residual whose closer is on a residual plan — one row per lead per period
// (dedup makes this safe to run repeatedly). Returns the count created.
function generateResiduals(period) {
  period = period || currentPeriod();
  let created = 0;
  S.leads.forEach(lead => {
    if (!lead.residualActive || lead.status !== 'Closed Won') return;
    const closer = S.team.find(m => m.id === lead.closerId);
    if (!closer || closer.commissionType !== 'residual') return;
    // Skip if this lead already has a row for this period.
    if (S.commissions.some(c => c.leadId === lead.id && String(c.period) === period)) return;
    const mrr  = parseFloat(lead.residualMRR  || lead.dealValue || 0);
    const rate = parseFloat(lead.residualRate || closer.closerRate || 0);
    if (!mrr || !rate) return;
    const now = new Date().toISOString();
    const rec = {
      id: uid(), leadId: lead.id, leadName: lead.name, dealValue: mrr, collectedAmount: '',
      providerId: lead.providerId || '', providerName: S.team.find(m => m.id === lead.providerId)?.name || '',
      providerRate: 0, providerAmount: 0,
      closerId: lead.closerId, closerName: closer.name, closerRate: rate,
      closerAmount: +(mrr * rate / 100).toFixed(2),
      status: 'pending', paidAt:'', paidBy:'', paymentRef:'', createdAt: now,
      recurring: true, period,
    };
    S.commissions.push(rec);
    if (S.config.scriptUrl) sheetsCall({action:'saveCommission', ...rec});
    created++;
  });
  if (created) { saveLocal(); renderAll(); }
  toast(created ? `Generated ${created} residual commission${created !== 1 ? 's' : ''} for ${period}.` : `No new residuals to generate for ${period}.`, created ? 'success' : 'warning');
  return created;
}

// ── Partial payments, refunds & clawbacks ──────────────────

function adjustCollectedAmount(leadId, collectedRaw, reason) {
  const lead = S.leads.find(l => l.id === leadId);
  if (!lead) return;
  const collected = parseFloat(collectedRaw);
  if (isNaN(collected) || collected < 0 || collected > parseFloat(lead.dealValue || 0)) {
    toast('Invalid amount. Must be between 0 and ' + fmtUSD(lead.dealValue) + '.', 'error'); return;
  }
  // Adjusting collected only rescales *pending* commissions. If a commission for
  // this lead was already paid, lowering the collected amount here would leave the
  // rep overpaid (paid rows are never rescaled). Route that case through Refund,
  // which issues a proper clawback for the difference.
  const hasPaid = S.commissions.some(c => c.leadId === leadId && c.status === 'paid');
  if (hasPaid && collected < parseFloat(lead.collectedAmount || lead.dealValue || 0)) {
    toast('This commission was already paid. Use "Refund" to record the reversal.', 'error', 6000);
    return;
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
  auditLog('adjustCollected', leadId, `${lead.name} → ${fmtUSD(collected)}`);
  toast('Collected amount updated', 'success');
  renderAll();
}

// Cancel the lead's pending commission ROW (not just the denormalized flag) when
// a deal is lost — so it leaves the admin ledger, profile, and rep totals too.
// Returns true if a pending commission row was found and cancelled.
function cancelLeadCommission(leadId, reason) {
  const pc = S.commissions.find(c => c.leadId === leadId && c.status === 'pending');
  if (pc) { cancelCommission(pc.id, reason); return true; }
  return false;
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
  toast('Commission cancelled', 'warning');
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
  toast('Refund recorded', 'warning');
  renderAll();
}
