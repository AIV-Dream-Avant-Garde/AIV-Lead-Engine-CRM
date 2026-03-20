/* ── Lead lock / claim system (4-hour time-based locks) ──── */

function isLocked(lead) {
  if (!lead.lockedBy || !lead.lockedUntil) return false;
  return new Date(lead.lockedUntil) > serverNow();
}

function isLockedByMe(lead)    { return isLocked(lead) && lead.lockedBy === S.session?.userId; }
function isLockedByOther(lead) { return isLocked(lead) && lead.lockedBy !== S.session?.userId; }

function lockCountdown(lead) {
  if (!isLocked(lead)) return '';
  const ms = new Date(lead.lockedUntil) - serverNow();
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

function getLockerName(lead) {
  if (!lead.lockedBy) return '';
  if (lead.lockedBy === S.session?.userId) return 'Ti';
  const m = S.team.find(x => x.id === lead.lockedBy);
  return m ? m.name.split(' ')[0] : lead.lockedBy.slice(0,6);
}

function claimLead(leadId) {
  const lead = S.leads.find(l => l.id === leadId);
  if (!lead) return;
  if (isLockedByOther(lead)) {
    toast('Lead reclamado por ' + getLockerName(lead) + ' — expira en ' + lockCountdown(lead) + '.', 'error');
    return;
  }
  lead.lockedBy    = S.session?.userId || '';
  lead.lockedUntil = new Date(serverNow().getTime() + LOCK_DURATION_MS).toISOString();
  lead.updatedAt   = new Date().toISOString();
  pushLead(lead);
  renderTable();
  openLead(leadId);
}

function releaseLead(leadId) {
  const lead = S.leads.find(l => l.id === leadId);
  if (!lead) return;
  if (!Array.isArray(lead.workHistory)) lead.workHistory = [];
  lead.workHistory.push({
    closerId:   S.session?.userId   || '',
    closerName: S.session?.userName || '',
    claimedAt:  lead.lockedUntil   || '',
    releasedAt: new Date().toISOString(),
    outcome:    'released',
  });
  lead.lockedBy    = '';
  lead.lockedUntil = '';
  lead.updatedAt   = new Date().toISOString();
  pushLead(lead);
  closeModal();
  renderTable();
}
