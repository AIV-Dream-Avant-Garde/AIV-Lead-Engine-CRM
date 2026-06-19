/* ── FEATURE: Admin panel — team, commissions, audit log ─────── */

// ── Audit log (in-memory, max 200, last 50 persisted) ─────
function auditLog(action, targetId, detail) {
  if (!S.session) return;
  const entry = {
    id:        uid(),
    userId:    S.session.userId,
    userName:  S.session.userName,
    action,
    targetId:  targetId || '',
    detail:    detail   || '',
    timestamp: new Date().toISOString(),
  };
  S.auditLog.unshift(entry);
  if (S.auditLog.length > 200) S.auditLog = S.auditLog.slice(0, 200);
  try { localStorage.setItem('aiv-audit', JSON.stringify(S.auditLog.slice(0,50))); } catch(e) {}
}

// ── Admin PIN rotation (stored as override hash in S.config) ─
async function changeAdminPin() {
  if (S.session?.role !== 'admin') { toast('Only the admin can change the PIN.', 'error'); return; }
  const cur = document.getElementById('apin-cur')?.value?.trim() || '';
  const nw  = document.getElementById('apin-new')?.value?.trim() || '';
  const nw2 = document.getElementById('apin-new2')?.value?.trim() || '';
  if (!/^\d{4}$/.test(nw))           { toast('The new PIN must be exactly 4 digits.', 'error'); return; }
  if (isWeakPin(nw))                 { toast('PIN is too weak (avoid repeats like 1111 or sequences like 1234).', 'error'); return; }
  if (nw !== nw2)                    { toast('The new PINs do not match.', 'error'); return; }
  if (nw === '0809')                 { toast('PIN 0809 is reserved for Demo.', 'error'); return; }
  const curHash = await sha256(cur);
  if (curHash !== (S.config.adminHash || ADMIN_HASH)) { toast('The current PIN is incorrect.', 'error'); return; }
  const newHash = await sha256(nw);
  if (S.team.find(m => m.pinHash === newHash)) { toast('That PIN is already used by a team member.', 'error'); return; }
  S.config.adminHash = newHash;
  saveLocal();
  auditLog('changeAdminPin', 'admin', 'Admin PIN rotated');
  ['apin-cur','apin-new','apin-new2'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  toast('Admin PIN updated.', 'success');
}

// Opt-out of storing revealable plaintext team PINs in localStorage.
function setHidePinPlain(on) {
  if (S.session?.role !== 'admin') { toast('Only the admin can change this.', 'error'); return; }
  S.config.hidePinPlain = !!on;
  if (on) (S.team || []).forEach(m => { delete m.pinPlain; });   // purge existing plaintext
  saveLocal();
  auditLog('setHidePinPlain', '', on ? 'on' : 'off');
  if (document.getElementById('admin-team-list')) renderAdmin();
  toast(on ? 'Plaintext PINs disabled and purged.' : 'Plaintext PIN storage re-enabled.', 'success');
}

// ── Signal banner ──────────────────────────────────────────
function showSignalBanner() {
  if (!S.session) return;
  const uid_  = S.session.userId;
  const role  = S.session.role;
  const items = [];

  const overdue = S.leads.filter(l =>
    isOverdue(l) && (role === 'admin' || l.closerId === uid_ || l.lockedBy === uid_)
  );
  if (overdue.length)
    items.push(`${overdue.length} overdue follow-up${overdue.length !== 1 ? 's' : ''}`);

  if (role === 'closer' || role === 'solo') {
    const assigned = S.leads.filter(l => l.closerId === uid_ && l.status !== 'Closed Won' && l.status !== 'Do Not Call');
    if (assigned.length)
      items.push(`${assigned.length} lead${assigned.length !== 1 ? 's' : ''} assigned to you`);
  }

  if (role === 'solo' || role === 'admin') {
    const myNew = S.leads.filter(l => l.providerId === uid_ && l.status === 'New');
    if (myNew.length) items.push(`${myNew.length} of your leads not yet worked`);
  }

  if (role === 'admin') {
    const pendingComm = S.commissions.filter(c => c.status === 'pending');
    if (pendingComm.length)
      items.push(`${pendingComm.length} commission${pendingComm.length !== 1 ? 's' : ''} pending payment`);
  }

  const banner  = document.getElementById('signal-banner');
  const titleEl = document.getElementById('signal-title');
  const itemsEl = document.getElementById('signal-items');
  if (!banner) return;

  if (items.length) {
    banner.classList.add('visible');
    titleEl.textContent = 'Welcome, ' + S.session.userName.split(' ')[0];
    itemsEl.innerHTML   = items.map(i => `<div class="signal-item">${esc(i)}</div>`).join('');
  } else {
    banner.classList.remove('visible');
  }
}

// ── Admin nav badge (pending commissions) ──────────────────
function updateAdminBadge() {
  const badge = document.getElementById('nav-admin-badge');
  if (!badge) return;
  const pending       = S.commissions.filter(c => c.status === 'pending').length;
  badge.textContent   = pending;
  badge.style.display = pending > 0 ? '' : 'none';
}

function applyAdminNavVisibility() {
  const adminNav = document.getElementById('nav-admin-item');
  if (adminNav) adminNav.classList.toggle('role-hidden', S.session?.role !== 'admin');
  const analyticsNav = document.getElementById('nav-analytics-item');
  if (analyticsNav) analyticsNav.classList.toggle('role-hidden', !['admin','solo'].includes(S.session?.role));
}

// ── Team management ────────────────────────────────────────
function openTeamModal(memberId) {
  const modal = document.getElementById('tm-modal');
  if (!modal) return;
  const titleEl = document.getElementById('tm-modal-title');
  document.getElementById('tm-id').value      = '';
  document.getElementById('tm-name').value    = '';
  document.getElementById('tm-pin').value     = '';
  document.getElementById('tm-pin2').value    = '';
  document.getElementById('tm-crate').value   = '10';
  if (document.getElementById('tm-prate')) document.getElementById('tm-prate').value = '0';
  document.getElementById('tm-contact').value = '';
  document.getElementById('tm-role').value    = 'closer';
  const ct0 = document.getElementById('tm-comm-type'); if (ct0) ct0.value = 'one-time';

  if (memberId) {
    const m = S.team.find(x => x.id === memberId);
    if (m) {
      titleEl.textContent                     = 'Edit member';
      document.getElementById('tm-id').value      = m.id;
      document.getElementById('tm-name').value    = m.name    || '';
      document.getElementById('tm-role').value    = m.role    || 'closer';
      document.getElementById('tm-crate').value   = m.closerRate   || 10;
      if (document.getElementById('tm-prate')) document.getElementById('tm-prate').value = m.providerRate || 0;
      document.getElementById('tm-contact').value = m.contact || '';
      const ct = document.getElementById('tm-comm-type'); if (ct) ct.value = m.commissionType || 'one-time';
    }
  } else {
    titleEl.textContent = 'Add team member';
  }
  updateCommTypeHint();
  modal.classList.add('open');
}

// For residual reps, the "closer rate" is the percentage earned EACH month, so
// relabel the field to make that explicit in the form.
function updateCommTypeHint() {
  const isResidual = document.getElementById('tm-comm-type')?.value === 'residual';
  const lbl = document.getElementById('tm-crate-label');
  if (lbl) lbl.textContent = isResidual ? 'Residual rate (% per month)' : 'Closer rate (%)';
}

function closeTeamModal() {
  document.getElementById('tm-modal')?.classList.remove('open');
}

function togglePin(id, plain) {
  const el = document.getElementById('pin-' + id);
  if (!el) return;
  el.textContent = el.textContent === '••••' ? plain : '••••';
}

async function saveTeamMember() {
  const existingId = document.getElementById('tm-id').value.trim();
  const name       = document.getElementById('tm-name').value.trim();
  const role       = document.getElementById('tm-role').value;
  const pin        = document.getElementById('tm-pin').value.trim();
  const pin2       = document.getElementById('tm-pin2').value.trim();
  const contact    = document.getElementById('tm-contact')?.value?.trim() || '';
  const crate      = parseFloat(document.getElementById('tm-crate').value || 0);
  const prate      = parseFloat(document.getElementById('tm-prate')?.value || 0);

  if (!name)                          { toast('Name is required.', 'error');             return; }
  const isNew = !existingId;
  if (isNew && !pin)                  { toast('A PIN is required for new members.', 'error'); return; }
  if (pin && pin.length !== 4)        { toast('The PIN must be exactly 4 digits.', 'error'); return; }
  if (pin && !/^\d{4}$/.test(pin))    { toast('The PIN can only contain digits.', 'error'); return; }
  if (pin && isWeakPin(pin))          { toast('PIN is too weak (avoid repeats like 1111 or sequences like 1234).', 'error'); return; }
  if (pin && pin !== pin2)            { toast('The PINs do not match.', 'error'); return; }
  if (pin === '2819')                 { toast('PIN 2819 is reserved for Admin.', 'error'); return; }
  if (pin === '0809')                 { toast('PIN 0809 is reserved for Demo mode.', 'error'); return; }

  if (pin) {
    const newHash   = await sha256(pin);
    const collision = S.team.find(m => m.pinHash === newHash && m.id !== (existingId || '__new__'));
    if (collision)  { toast('This PIN is already in use by ' + collision.name + '.', 'error'); return; }
  }

  const commissionType = document.getElementById('tm-comm-type')?.value || 'one-time';
  const id     = existingId || uid();
  const prior  = S.team.find(m => m.id === id);
  const member = {id, name, role, contact, closerRate:crate, providerRate:prate, commissionType, active:true, createdAt: prior?.createdAt || new Date().toISOString()};
  if (pin) {
    member.pinHash  = await sha256(pin);
    if (!S.config.hidePinPlain) member.pinPlain = pin;   // plaintext storage is opt-out
  } else {
    const existing = S.team.find(m => m.id === id);
    if (existing) { member.pinHash = existing.pinHash; if (!S.config.hidePinPlain) member.pinPlain = existing.pinPlain || ''; }
  }

  const idx = S.team.findIndex(m => m.id === id);
  if (idx >= 0) S.team[idx] = {...S.team[idx], ...member};
  else           S.team.push(member);

  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'saveTeamMember', ...member});
  auditLog(isNew ? 'createTeamMember' : 'updateTeamMember', id, name + ' role=' + role);
  closeTeamModal();
  renderAdmin();
  toast('Member saved successfully.', 'success');
}

function toggleTeamActive(memberId) {
  const m = S.team.find(x => x.id === memberId);
  if (!m) return;
  const newActive = !(String(m.active) !== 'false');
  m.active = newActive;
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'saveTeamMember', ...m});
  auditLog(newActive ? 'activateTeamMember' : 'deactivateTeamMember', memberId, m.name);
  renderAdmin();
}

function forceReleaseLead(leadId) {
  const lead = S.leads.find(l => l.id === leadId);
  if (!lead) return;
  const lockerName = getLockerName(lead);
  if (!Array.isArray(lead.workHistory)) lead.workHistory = [];
  lead.workHistory.push({
    closerId:   lead.lockedBy,
    closerName: lockerName,
    claimedAt:  '',
    releasedAt: new Date().toISOString(),
    outcome:    'admin-force-released',
    releasedBy: S.session?.userName || 'Admin',
  });
  lead.lockedBy    = '';
  lead.lockedUntil = '';
  lead.updatedAt   = new Date().toISOString();
  pushLead(lead);
  auditLog('forceReleaseLead', leadId, lead.name + ' (was locked by ' + lockerName + ')');
  renderAdmin();
  renderTable();
  toast('Lead released — back to the universal pool.', 'success');
}

async function markCommissionPaid(commId) {
  const ref = prompt('Payment reference (e.g., transfer #123, cash, bank):');
  if (ref === null) return;
  if (!String(ref).trim()) { toast('A payment reference is required to mark a commission paid.', 'error'); return; }
  const comm = S.commissions.find(c => c.id === commId);
  if (!comm) return;
  comm.status     = 'paid';
  comm.paidAt     = new Date().toISOString();
  comm.paidBy     = S.session?.userName || '';
  comm.paymentRef = ref;
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'markCommissionPaid', id:commId, paidBy:comm.paidBy, paymentRef:ref});
  auditLog('markCommissionPaid', commId, ref);
  toast('Commission marked as paid', 'success');
  renderAdmin();
  renderPerfil();
}

async function bulkMarkPaid() {
  const person = document.getElementById('admin-comm-person')?.value;
  if (!person) { toast('Select a member first.', 'error'); return; }
  const ref = prompt('Payment reference (e.g., transfer #123):');
  if (ref === null) return;
  const pending = S.commissions.filter(c => c.status === 'pending' && (c.providerId === person || c.closerId === person));
  if (!pending.length) { toast('No pending commissions for this member.', 'error'); return; }
  pending.forEach(comm => {
    comm.status = 'paid'; comm.paidAt = new Date().toISOString();
    comm.paidBy = S.session?.userName || ''; comm.paymentRef = ref;
    if (S.config.scriptUrl) sheetsCall({action:'markCommissionPaid', id:comm.id, paidBy:comm.paidBy, paymentRef:ref});
  });
  saveLocal();
  auditLog('bulkMarkPaid', '', 'count=' + pending.length + ' ref=' + ref);
  renderAdmin(); renderPerfil();
  toast(pending.length + ' commissions marked as paid.', 'success');
}

function promptAdjustCollected(leadId) {
  const lead = S.leads.find(l => l.id === leadId);
  if (!lead) return;
  const raw = prompt(`How much was actually collected? (USD)\nContracted value: ${fmtUSD(lead.dealValue)}`, lead.collectedAmount || lead.dealValue || '');
  if (raw === null) return;
  const reason = prompt('Reason for the adjustment (optional):') || '';
  adjustCollectedAmount(leadId, raw, reason);
}

function promptCancelCommission(commId) {
  const reason = prompt('Reason for cancellation (required):');
  if (!reason) return;
  cancelCommission(commId, reason);
}

function promptIssueRefund(leadId) {
  const lead = S.leads.find(l => l.id === leadId);
  if (!lead) return;
  if (!confirm(`Issue a refund for "${lead.name}"?\nThis will cancel pending commissions and create refund records for those already paid.`)) return;
  const reason = prompt('Reason for the refund (required):');
  if (!reason) return;
  issueRefund(leadId, reason);
}

// ── SMS / WhatsApp templates ────────────────────────────────
function renderSmsTemplates() {
  const wrap = document.getElementById('admin-sms-list');
  if (!wrap) return;
  const templates = S.smsTemplates || [];
  if (!templates.length) {
    wrap.innerHTML = '<div class="notes-empty">No templates. Add one to send SMS/WhatsApp after a call.</div>';
    return;
  }
  wrap.innerHTML = templates.map((t,i) =>
    `<div class="team-row" style="margin-bottom:6px">
      <div class="team-info">
        <div class="team-name">${esc(t.name)}</div>
        <div class="team-meta" style="white-space:pre-wrap;max-height:36px;overflow:hidden">${esc(t.body.slice(0,100))}${t.body.length>100?'…':''}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-danger" style="font-size:11px;padding:4px 9px" onclick="deleteSmsTemplate(${i})">Delete</button>
      </div>
    </div>`).join('');
}

function addSmsTemplate() {
  const name = document.getElementById('sms-tpl-name')?.value?.trim();
  const body = document.getElementById('sms-tpl-body')?.value?.trim();
  if (!name) { toast('Name is required.', 'error'); return; }
  if (!body) { toast('Message body is required.', 'error'); return; }
  if (!Array.isArray(S.smsTemplates)) S.smsTemplates = [];
  S.smsTemplates.push({id:uid(), name, body});
  saveLocal();
  document.getElementById('sms-tpl-name').value = '';
  document.getElementById('sms-tpl-body').value = '';
  renderSmsTemplates();
}

function deleteSmsTemplate(idx) {
  if (!confirm('Delete this template?')) return;
  S.smsTemplates.splice(idx, 1);
  saveLocal();
  renderSmsTemplates();
}

// ── GAS trigger control ────────────────────────────────────
async function checkTriggerStatus() {
  if (!S.config.scriptUrl) return;
  const res = await sheetsCall({action:'checkTriggers'});
  if (res?.success) {
    S.triggerStatus = {
      scrape: !!res.scrapeTrigger, report: !!res.reportTrigger,
      cadence: !!res.cadenceTrigger, cadenceEnabled: !!res.cadenceEnabled,
      residual: !!res.residualTrigger,
      cadenceConfig: res.cadenceConfig || null,
      lastScrapeRun: res.lastScrapeRun || null, lastCadenceRun: res.lastCadenceRun || null,
    };
    renderScheduledJobs();
    renderReportTrigger();
    renderResidualTrigger();
    if (typeof renderCadenceEngine === 'function') renderCadenceEngine();
  }
}

// Reflect the monthly-residual auto-trigger state on its toggle button.
function renderResidualTrigger() {
  const btn = document.getElementById('auto-residuals-btn');
  if (!btn) return;
  const on = !!(S.triggerStatus && S.triggerStatus.residual);
  btn.textContent = on ? 'Auto: monthly ✓' : 'Auto: off';
  btn.classList.toggle('btn-success', on);
  btn.classList.toggle('btn-ghost', !on);
}

// Run all active saved scrape jobs immediately (on-demand), then pull the new leads.
async function runScrapesNow() {
  if (!S.config.scriptUrl) { toast('Set up the Apps Script URL first.', 'error'); return; }
  const btn = document.getElementById('run-scrapes-now-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Running...'; }
  const res = await sheetsCall({action:'runScrapesNow'});
  if (btn) { btn.disabled = false; btn.textContent = 'Run now'; }
  if (res?.success) {
    if (S.triggerStatus) S.triggerStatus.lastScrapeRun = {ranAt: res.ranAt, added: res.added};
    toast('Scrape ran: +' + (res.added || 0) + ' new leads.', 'success', 5000);
    await syncNow();          // bring the newly-appended leads into the pool now
    renderScheduledJobs();
  } else {
    toast('Error running the scrape. Check the Apps Script and the API key.', 'error', 5000);
  }
}

async function setTrigger(fn, enabled) {
  if (!S.config.scriptUrl) { toast('Set up the Apps Script URL first.', 'error'); return; }
  const res = await sheetsCall({action:'setTrigger', fn, enabled});
  if (res?.success) {
    if (fn === 'runScheduledScrapes') S.triggerStatus.scrape = enabled;
    if (fn === 'sendWeeklyReport')    S.triggerStatus.report = enabled;
    if (fn === 'runCadence')          S.triggerStatus.cadence = enabled;
    if (fn === 'runMonthlyResiduals') { S.triggerStatus.residual = enabled; toast(enabled ? 'Residuals will auto-generate on the 1st each month.' : 'Monthly auto-generate off.', enabled ? 'success' : 'warning'); renderResidualTrigger(); }
    renderScheduledJobs();
    renderReportTrigger();
    if (typeof renderCadenceEngine === 'function') renderCadenceEngine();
  } else {
    toast('Error updating the trigger. Make sure the script is deployed with the correct permissions.', 'error', 5000);
  }
}

function renderReportTrigger() {
  const wrap = document.getElementById('admin-report-trigger');
  if (!wrap) return;
  const active = S.triggerStatus?.report;
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:13px;color:var(--body)">Automatic trigger (Monday 8am):</span>
      <span style="font-size:13px;font-weight:600;color:${active?'var(--green)':'var(--body)'}">
        ${active ? '● Active' : '○ Inactive'}
      </span>
      <button class="btn ${active?'btn-danger':'btn-success'}" style="font-size:11px;padding:4px 10px"
        onclick="setTrigger('sendWeeklyReport',${!active})">
        ${active ? 'Deactivate' : 'Activate'}
      </button>
    </div>`;
}

// ── Scheduled scraper jobs ─────────────────────────────────
function renderScheduledJobs() {
  // Update trigger status toggle
  const triggerWrap = document.getElementById('admin-scrape-trigger-status');
  if (triggerWrap) {
    const active = S.triggerStatus?.scrape;
    const lr = S.triggerStatus?.lastScrapeRun;
    const runMeta = lr && lr.ofJobs ? ` · ${lr.jobsRun||0}/${lr.ofJobs} jobs this cycle` : '';
    const lastRunLine = lr && lr.ranAt
      ? `<div style="font-size:11px;color:var(--sub);margin-bottom:10px">Last run: ${fmtD(lr.ranAt)} ${fmtT(lr.ranAt)} · +${lr.added||0} leads${runMeta}</div>`
      : `<div style="font-size:11px;color:var(--sub);margin-bottom:10px">No runs recorded yet.</div>`;
    const budgetHint = `<div style="font-size:11px;color:var(--sub);margin-bottom:10px">Runs once daily within a free-tier budget (~4.5&nbsp;min, ~100 searches). If you add more jobs than fit, they rotate across days so every one still runs — and you never exceed the free limits.</div>`;
    triggerWrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">
        <span style="font-size:13px;color:var(--body)">Automatic trigger (daily 6am):</span>
        <span style="font-size:13px;font-weight:600;color:${active?'var(--green)':'var(--body)'}">
          ${active ? '● Active' : '○ Inactive'}
        </span>
        <button class="btn ${active?'btn-danger':'btn-success'}" style="font-size:11px;padding:4px 10px"
          onclick="setTrigger('runScheduledScrapes',${!active})">
          ${active ? 'Deactivate' : 'Activate'}
        </button>
        <button id="run-scrapes-now-btn" class="btn btn-primary" style="font-size:11px;padding:4px 10px" onclick="runScrapesNow()">
          Run now
        </button>
      </div>
      ${lastRunLine}
      ${budgetHint}`;
  }

  const wrap = document.getElementById('admin-jobs-list');
  if (!wrap) return;
  const jobs = S.scheduledJobs || [];
  if (!jobs.length) {
    wrap.innerHTML = '<div class="notes-empty">No scheduled jobs. Add one so the scraper runs automatically.</div>';
    return;
  }
  wrap.innerHTML = jobs.map((j,i) =>
    `<div class="team-row" style="margin-bottom:6px">
      <div class="team-info">
        <div class="team-name">${esc(j.keyword)} · ${esc([j.country, j.city, j.barrio].filter(Boolean).join(' · '))}</div>
        <div class="team-meta">Radius: ${esc(String(j.radius||1000))}m · Max: ${esc(String(j.maxResults||50))} · ${j.active?'Active':'Inactive'}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-ghost" style="font-size:11px;padding:4px 9px" onclick="toggleScheduledJob(${i})">${j.active?'Pause':'Activate'}</button>
        <button class="btn btn-danger" style="font-size:11px;padding:4px 9px" onclick="deleteScheduledJob(${i})">Delete</button>
      </div>
    </div>`).join('');
}

function addScheduledJob() {
  const country     = document.getElementById('sj-country')?.value || DEFAULT_COUNTRY;
  const city        = document.getElementById('sj-city')?.value    || '';
  const barrioParts = (document.getElementById('sj-barrio')?.value || '').split('|');
  const barrio      = barrioParts[0] || '';
  const cityLoc     = LOCATIONS[country]?.[city];
  const lat         = parseFloat(barrioParts[1]) || (cityLoc?.lat ?? 0);
  const lng         = parseFloat(barrioParts[2]) || (cityLoc?.lng ?? 0);
  const keyword     = document.getElementById('sj-keyword')?.value || '';
  const radius      = document.getElementById('sj-radius')?.value  || '1000';
  const max         = parseInt(document.getElementById('sj-max')?.value || '50');
  if (!city)    { toast('City is required.', 'error');    return; }
  if (!keyword) { toast('Keyword is required.', 'error');   return; }
  if (!lat || !lng) { toast('Could not determine the location. Select a neighborhood.', 'error'); return; }
  if (!Array.isArray(S.scheduledJobs)) S.scheduledJobs = [];
  S.scheduledJobs.push({keyword, country, city, barrio, lat, lng, radius, maxResults:max, region:COUNTRY_REGION[country]||'', source:'Scraper (auto)', active:true});
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'saveScheduledJobs', jobs:S.scheduledJobs});
  renderScheduledJobs();
}

// Bulk-add: create a city-level scheduled job for EVERY keyword in the selected
// category, so you pick an industry once instead of adding keywords one by one.
// City-level (not neighborhood) because Google now labels each lead's real
// neighborhood anyway, and it keeps the daily job count manageable.
function addCategoryJobs() {
  const country = document.getElementById('sj-country')?.value || DEFAULT_COUNTRY;
  const city    = document.getElementById('sj-city')?.value || '';
  const cat     = document.getElementById('sj-cat')?.value || '';
  const radius  = document.getElementById('sj-radius')?.value || '5000';
  const max     = parseInt(document.getElementById('sj-max')?.value || '60');
  const cityLoc = LOCATIONS[country]?.[city];
  if (!city || !cityLoc) { toast('Select a city first.', 'error'); return; }
  const kws = (KEYWORDS[country]?.[cat]) || [];
  if (!kws.length) { toast('Select a category first.', 'error'); return; }
  if (!Array.isArray(S.scheduledJobs)) S.scheduledJobs = [];
  const has = new Set(S.scheduledJobs.map(j => (j.keyword + '|' + j.city).toLowerCase()));
  let added = 0;
  kws.forEach(keyword => {
    const k = (keyword + '|' + city).toLowerCase();
    if (has.has(k)) return;
    has.add(k);
    S.scheduledJobs.push({keyword, country, city, barrio:'', lat:cityLoc.lat, lng:cityLoc.lng, radius, maxResults:max, region:COUNTRY_REGION[country]||'', source:'Scraper (auto)', active:true});
    added++;
  });
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'saveScheduledJobs', jobs:S.scheduledJobs});
  renderScheduledJobs();
  toast(added ? `Added ${added} job${added!==1?'s':''} — ${cat} in ${city}.` : 'Those jobs already exist.', added ? 'success' : 'info');
}

function toggleScheduledJob(idx) {
  if (!S.scheduledJobs?.[idx]) return;
  S.scheduledJobs[idx].active = !S.scheduledJobs[idx].active;
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'saveScheduledJobs', jobs:S.scheduledJobs});
  renderScheduledJobs();
}

function deleteScheduledJob(idx) {
  if (!confirm('Delete this scheduled job?')) return;
  S.scheduledJobs.splice(idx, 1);
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'saveScheduledJobs', jobs:S.scheduledJobs});
  renderScheduledJobs();
}

// ── Script manager ─────────────────────────────────────────
function openScriptModal(scriptId) {
  document.getElementById('sc-modal-id').value    = scriptId || '';
  document.getElementById('sc-modal-name').value  = '';
  document.getElementById('sc-modal-stage').value = 'pitch';
  document.getElementById('sc-modal-body').value  = '';
  if (scriptId) {
    const sc = (S.scripts||[]).find(x => x.id === scriptId);
    if (sc) {
      document.getElementById('sc-modal-name').value  = sc.name  || '';
      document.getElementById('sc-modal-stage').value = sc.stage || 'pitch';
      document.getElementById('sc-modal-body').value  = sc.body  || '';
    }
  }
  document.getElementById('sc-modal').classList.add('open');
}

function closeScriptModal() {
  document.getElementById('sc-modal')?.classList.remove('open');
}

function saveScript() {
  const id    = document.getElementById('sc-modal-id').value.trim()   || uid();
  const name  = document.getElementById('sc-modal-name').value.trim();
  const stage = document.getElementById('sc-modal-stage').value;
  const body  = document.getElementById('sc-modal-body').value.trim();
  if (!name) { toast('Script name is required.', 'error'); return; }
  if (!body) { toast('Script body is required.', 'error'); return; }
  const now = new Date().toISOString();
  const sc  = {id, name, stage, body, createdAt:now, updatedAt:now};
  const idx = (S.scripts||[]).findIndex(x => x.id === id);
  if (idx >= 0) S.scripts[idx] = sc;
  else          { if (!Array.isArray(S.scripts)) S.scripts = []; S.scripts.push(sc); }
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'saveScript', ...sc});
  closeScriptModal();
  renderScripts();
}

function deleteScript(scriptId) {
  if (!confirm('Delete this script?')) return;
  S.scripts = (S.scripts||[]).filter(x => x.id !== scriptId);
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'deleteScript', id:scriptId});
  renderScripts();
}

function renderScripts() {
  const wrap = document.getElementById('admin-scripts-list');
  if (!wrap) return;
  const scripts = S.scripts || [];
  if (!scripts.length) {
    wrap.innerHTML = '<div class="notes-empty">No scripts. Add one so it appears in the call widget.</div>';
    return;
  }
  const stageOrder = ['opening','pitch','objections','close','rebuttals'];
  const grouped = {};
  stageOrder.forEach(s => { grouped[s] = scripts.filter(x => x.stage === s); });
  wrap.innerHTML = stageOrder.map(stage => {
    const entries = grouped[stage];
    if (!entries.length) return '';
    const label = SCRIPT_STAGES[stage] || stage;
    return `<div style="margin-bottom:14px">
      <div style="font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--body);margin-bottom:6px">${esc(label)}</div>
      ${entries.map(sc => `<div class="team-row" style="margin-bottom:6px">
        <div class="team-info">
          <div class="team-name">${esc(sc.name)}</div>
          <div class="team-meta" style="white-space:pre-wrap;max-height:50px;overflow:hidden">${esc(sc.body.slice(0,120))}${sc.body.length>120?'…':''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-ghost" style="font-size:11px;padding:4px 9px" onclick="openScriptModal('${sc.id}')">Edit</button>
          <button class="btn btn-danger" style="font-size:11px;padding:4px 9px" onclick="deleteScript('${sc.id}')">Delete</button>
        </div>
      </div>`).join('')}
    </div>`;
  }).join('');
}

// ── renderAdmin — consolidated (team + commissions + audit + locked + DNC + perf) ─
function renderAdmin() {
  if (S.session?.role !== 'admin') return;
  const roleLabels = {admin:'Admin', closer:'Closer', solo:'Solo'};

  // Team list
  const teamWrap = document.getElementById('admin-team-list');
  if (teamWrap) {
    teamWrap.innerHTML = (S.team||[]).length
      ? S.team.map(m => {
          const inactive = String(m.active) === 'false';
          const initials = (m.name||'?').split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2);
          return `<div class="team-row ${inactive?'team-inactive':''}">
            <div class="team-avatar">${esc(initials)}</div>
            <div class="team-info">
              <div class="team-name">${esc(m.name)}</div>
              <div class="team-meta">${roleLabels[m.role]||m.role} · ${inactive?'Inactive':'Active'}${m.contact?' · '+esc(m.contact):''}</div>
              <div class="team-meta" style="font-size:10px;opacity:.75">${m.commissionType === 'residual' ? `Residual ${esc(String(m.closerRate||0))}%/mo` : `Closer ${esc(String(m.closerRate||0))}%`} · Provider ${esc(String(m.providerRate||0))}%</div>
              <div class="team-pin" style="font-size:11px;color:var(--sub);font-family:'Geist Mono',monospace">
                PIN: <span id="pin-${m.id}">••••</span>
                ${m.pinPlain ? `<span onclick="togglePin('${m.id}','${m.pinPlain}')" style="cursor:pointer;margin-left:4px;opacity:.55;color:var(--accent)" title="Reveal PIN"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:12px;height:12px;vertical-align:middle"><path d="M1 8c1.5-3.5 3.8-5.5 7-5.5S13.5 4.5 15 8c-1.5 3.5-3.8 5.5-7 5.5S2.5 11.5 1 8z"/><circle cx="8" cy="8" r="2.5"/></svg></span>` : '<span style="opacity:.4;font-size:10px"> (reassign)</span>'}
              </div>
            </div>
            <div class="team-actions">
              <button class="btn btn-ghost" style="font-size:11px;padding:4px 9px" onclick="openTeamModal('${m.id}')">Edit</button>
              <button class="btn ${inactive?'btn-success':'btn-danger'}" style="font-size:11px;padding:4px 9px" onclick="toggleTeamActive('${m.id}')">${inactive?'Activate':'Deactivate'}</button>
            </div>
          </div>`;
        }).join('')
      : '<div class="notes-empty">Use "+ Add team member" to create the first team profile.</div>';
  }

  // Commissions
  const commFilter = document.getElementById('admin-comm-filter')?.value || '';
  const commPerson = document.getElementById('admin-comm-person')?.value || '';
  const commWrap   = document.getElementById('admin-comm-list');
  const pendingN   = S.commissions.filter(c => c.status === 'pending').length;
  const pendingLbl = document.getElementById('admin-comm-pending-label');
  if (pendingLbl) pendingLbl.textContent = pendingN > 0 ? `· ${pendingN} pending` : '';

  const filtered = S.commissions
    .filter(c => (!commFilter || c.status === commFilter) && (!commPerson || c.closerId===commPerson || c.providerId===commPerson))
    .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 60);

  if (commWrap) {
    commWrap.innerHTML = filtered.length
      ? filtered.map(c => {
          const isClawback = c.status === 'clawback';
          const provAmt  = parseFloat(c.providerAmount||0);
          const totalAmt = parseFloat(c.closerAmount||0) + provAmt;
          const statusCls = {pending:'comm-pending', paid:'comm-paid', cancelled:'comm-cancelled', clawback:'comm-cancelled'}[c.status] || 'comm-pending';
          const statusLbl = {pending:'Pending', paid:'Paid', cancelled:'Cancelled', clawback:'Refund'}[c.status] || c.status;
          const paidInfo  = c.status === 'paid' ? ` · ${esc(c.paidBy||'')} · ${esc(c.paymentRef||'')}` : '';
          const refundInfo = (c.refundReason && c.status !== 'paid') ? ` · Reason: ${esc(c.refundReason)}` : '';
          const collInfo  = c.collectedAmount && parseFloat(c.collectedAmount) !== parseFloat(c.dealValue)
            ? ` · Collected: ${fmtUSD(c.collectedAmount)}`
            : '';
          const amtStyle  = isClawback ? 'color:#c0392b;' : '';
          const actions   = c.status === 'pending'
            ? `<button class="btn btn-success" style="font-size:11px;padding:4px 9px;flex-shrink:0" onclick="markCommissionPaid('${c.id}')">Mark paid</button>
               <button class="btn btn-ghost" style="font-size:11px;padding:4px 9px;flex-shrink:0" onclick="promptAdjustCollected('${c.leadId}')">Adjust collected</button>
               <button class="btn btn-danger" style="font-size:11px;padding:4px 9px;flex-shrink:0" onclick="promptCancelCommission('${c.id}')">Cancel</button>`
            : c.status === 'paid'
            ? `<button class="btn btn-danger" style="font-size:11px;padding:4px 9px;flex-shrink:0" onclick="promptIssueRefund('${c.leadId}')">Refund</button>`
            : '';
          return `<div class="admin-comm-row">
            <div class="admin-comm-info">
              <div class="admin-comm-lead">${esc(c.leadName||'--')}${c.recurring === true || c.recurring === 'true' ? ` <span class="comm-status-badge" style="background:var(--acc-m);color:var(--accent)">Recurring${c.period ? ' · ' + esc(c.period) : ''}</span>` : ''}</div>
              <div class="admin-comm-detail">${(c.recurring === true || c.recurring === 'true') ? 'Monthly' : 'Contracted'}: ${fmtUSD(c.dealValue)}${collInfo} · Closer: ${esc(c.closerName||'--')} ${fmtUSD(c.closerAmount)}${provAmt ? ' · Provider: ' + esc(c.providerName||'--') + ' ' + fmtUSD(c.providerAmount) : ''} · ${fmtD(c.createdAt)}${paidInfo}${refundInfo}</div>
            </div>
            <span class="admin-comm-amount" style="${amtStyle}">${fmtUSD(totalAmt)}</span>
            <span class="comm-status-badge ${statusCls}">${statusLbl}</span>
            ${actions}
          </div>`;
        }).join('')
      : `<div class="notes-empty">No commissions${commFilter ? ' with that filter' : ''}.</div>`;
  }
  const bulkWrap = document.getElementById('admin-comm-bulk-wrap');
  if (bulkWrap) bulkWrap.style.display = (commPerson && filtered.some(c => c.status === 'pending')) ? 'block' : 'none';

  // Audit log
  const auditWrap = document.getElementById('admin-audit-list');
  if (auditWrap) {
    try { S.auditLog = JSON.parse(localStorage.getItem('aiv-audit') || '[]'); } catch(e) {}
    auditWrap.innerHTML = S.auditLog.length
      ? S.auditLog.slice(0,100).map(a =>
          `<div class="audit-row">
            <span class="audit-time">${fmtD(a.timestamp)} ${fmtT(a.timestamp)}</span>
            <span><span class="audit-action">${esc(a.userName||a.userId)}</span>
            <span class="audit-detail"> · ${esc(a.action)} ${a.targetId?'· '+esc(a.targetId.slice(0,8)):''} ${a.detail?'· '+esc(a.detail):''}</span></span>
          </div>`).join('')
      : '<div class="notes-empty">No audit log entries yet.</div>';
  }

  // Locked leads
  const lockedLeads = S.leads.filter(l => isLocked(l));
  const lockedCount = document.getElementById('admin-locked-count');
  if (lockedCount) lockedCount.textContent = lockedLeads.length + ' lead' + (lockedLeads.length !== 1 ? 's' : '');
  const lockedWrap = document.getElementById('admin-locked-list');
  if (lockedWrap) {
    lockedWrap.innerHTML = lockedLeads.length
      ? lockedLeads.map(l => {
          const lockerName = getLockerName(l);
          return `<div class="team-row">
            <div class="team-info">
              <div class="team-name">${esc(l.name)}</div>
              <div class="team-meta">${esc(l.phone||'--')} · ${esc(l.city||'')} ${esc(l.barrio||'')} · Status: ${esc(l.status||'New')}</div>
              <div class="team-meta" style="color:var(--amber)">Claimed by: ${esc(lockerName)} · Expires in: ${lockCountdown(l)}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button class="btn btn-ghost" style="font-size:11px;padding:4px 9px" onclick="openLead('${l.id}')">View record</button>
              <button class="btn btn-amber" style="font-size:11px;padding:4px 9px" onclick="forceReleaseLead('${l.id}')">Release</button>
            </div>
          </div>`;
        }).join('')
      : '<div class="notes-empty">No leads are currently claimed.</div>';
  }

  // DNC registry
  const dncLeads = S.leads.filter(l => l.status === 'Do Not Call');
  const dncCount = document.getElementById('admin-dnc-count');
  if (dncCount) dncCount.textContent = dncLeads.length + ' lead' + (dncLeads.length !== 1 ? 's' : '');
  const dncWrap = document.getElementById('admin-dnc-list');
  if (dncWrap) {
    dncWrap.innerHTML = dncLeads.length
      ? dncLeads.map(l =>
          `<div class="team-row">
            <div class="team-info">
              <div class="team-name">${esc(l.name)}</div>
              <div class="team-meta">${esc(l.phone||'--')} · ${esc(l.city||'')} ${esc(l.barrio||'')} · ${fmtD(l.updatedAt)}</div>
              ${l.dncReason ? `<div class="team-meta" style="color:var(--red);margin-top:2px">Reason: ${esc(l.dncReason)}</div>` : ''}
            </div>
            <button class="btn btn-ghost" style="font-size:11px;padding:4px 9px" onclick="openLead('${l.id}')">View record</button>
          </div>`).join('')
      : '<div class="notes-empty">No leads marked as "Do Not Call".</div>';
  }

  // Performance stats by team member
  const period   = document.getElementById('perf-period')?.value || 'week';
  const now      = new Date();
  const cutoff   = new Date();
  if      (period === 'today') cutoff.setHours(0,0,0,0);
  else if (period === 'week')  cutoff.setDate(now.getDate()-7);
  else if (period === 'month') cutoff.setMonth(now.getMonth()-1);
  else                         cutoff.setFullYear(2000);
  const perfWrap = document.getElementById('admin-perf-list');
  if (perfWrap) {
    if (!(S.team||[]).length) {
      perfWrap.innerHTML = '<div class="notes-empty">No team members.</div>';
    } else {
      const pCalls = S.calls.filter(c => new Date(c.calledAt) >= cutoff);
      const lb = teamLeaderboard(S.team, S.leads, S.commissions);   // ranked by closed, then earnings
      const topTotal = lb[0] && lb[0].total ? lb[0].total : 0;
      perfWrap.innerHTML = lb.map((entry, i) => {
        const m = entry.member;
        const mCalls  = pCalls.filter(c => { const lead = S.leads.find(l => l.id === c.leadId); return lead && (lead.closerId===m.id||lead.providerId===m.id); });
        const ans     = mCalls.filter(c => c.outcome === 'answered').length;
        const ansRate = mCalls.length ? Math.round(ans/mCalls.length*100) : 0;
        const initials = (m.name||'?').split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2);
        return `<div class="card" style="margin-bottom:10px;padding:14px 16px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
            <span class="pill" style="font-family:'Geist Mono',monospace;flex-shrink:0">#${i+1}</span>
            <div class="team-avatar">${esc(initials)}</div>
            <div style="flex:1;min-width:0"><div class="team-name">${esc(m.name)}</div><div class="team-meta">${m.role}${m.contact?' · '+esc(m.contact):''}</div></div>
            ${entry.pending>0?`<span style="font-size:11px;color:var(--amber);font-family:'Geist Mono',monospace">${fmtUSD(entry.pending)} pending</span>`:''}
          </div>
          <div class="perf-grid">
            <div class="perf-stat"><div class="perf-val">${mCalls.length}</div><div class="perf-lbl">Calls</div></div>
            <div class="perf-stat"><div class="perf-val">${ansRate}%</div><div class="perf-lbl">Answer rate</div></div>
            <div class="perf-stat"><div class="perf-val">${entry.closed}</div><div class="perf-lbl">Closed</div></div>
            <div class="perf-stat"><div class="perf-val">${entry.conversion}%</div><div class="perf-lbl">Close rate</div></div>
          </div>
          <div class="perf-bar-wrap" style="margin-top:8px">
            <div class="perf-bar-label">Total earned</div>
            <div class="perf-bar-track"><div class="perf-bar-fill" style="background:var(--pos);width:${topTotal?Math.min(100,Math.round(entry.total/topTotal*100)):0}%"></div></div>
            <div class="perf-bar-val">${fmtUSD(entry.total)}</div>
          </div>
        </div>`;
      }).join('') || '<div class="notes-empty">No activity in this period.</div>';
    }
  }

  updateAdminBadge();
  renderScripts();
  if (typeof renderSequences === 'function') renderSequences();
  renderScheduledJobs();
  renderReportTrigger();
  renderSmsTemplates();
  initAdminJobsForm();
  checkTriggerStatus(); // async — re-renders trigger rows when response arrives
}

function exportAuditLog() {
  if (!S.auditLog.length) { toast('No audit log entries.', 'error'); return; }
  const hdrs = ['timestamp','userName','action','targetId','detail'];
  const csv = [
    hdrs.join(','),
    ...S.auditLog.map(a => hdrs.map(h => `"${String(a[h]||'').replace(/"/g,'""')}"`).join(',')),
  ].join('\n');
  const el = document.createElement('a');
  el.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
  el.download = 'axius_auditlog_' + new Date().toISOString().slice(0,10) + '.csv';
  el.click();
}

function initAdminJobsForm() {
  fillCountries('sj-country');
  onSjCountryChange();
}
