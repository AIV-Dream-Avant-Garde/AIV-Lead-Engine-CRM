/* ── FEATURE: Active Clients / Engagements (the spine's post-sale record) ──────
   One engagement per won lead, keyed by the Engagement ID (= lead id). Tracks the
   four Gate-A signals and the Registry links. Source of record for shared fields
   pre-Gate-A; Mongo owns operational detail post-Gate-A. */

const ENG_STATUS_LABEL = {
  won:'Won', roadmap_draft:'Roadmap draft', roadmap_sent:'Roadmap sent', approved:'Approved',
  gate_a_ready:'Ready to provision', provisioning:'Provisioning', active:'Active', churned:'Churned',
};

// The four Gate-A signals (won is implied by the engagement existing at all).
function engGateChecks_(e) {
  return [
    { label:'Won',              done:true },
    { label:'Roadmap approved', done:!!e.roadmapApprovedAt },
    { label:'MSA signed',       done:String(e.msaSigned) === 'yes' },
    { label:'Paid',             done:String(e.paid) === 'yes' },
  ];
}
function engIsGateAReady_(e) { return engGateChecks_(e).every(c => c.done); }
function engFor(leadId) { return (S.engagements || []).find(e => e.engagementId === leadId) || null; }

// Create the engagement record for a won lead if it doesn't exist yet (silent, durable).
// Returns the engagement. Called automatically when a deal is Closed Won, so the two
// halves of the funnel (pipeline ↔ spine) are stitched without a second manual step.
async function ensureEngagement(leadId) {
  const existing = engFor(leadId);
  if (existing) return existing;
  const l = (S.leads || []).find(x => x.id === leadId);
  if (!l) return null;
  const now = new Date().toISOString();
  const rec = { engagementId:l.id, company:l.name || '', status:'won', dealValue:l.dealValue || '', tier:'team',
    paid:'', paidAt:'', msaSigned:'', msaSignedAt:'', msaSignerName:'', msaSignerIp:'', msaUrl:'',
    roadmap:'', roadmapApprovedAt:'', stripeCustomerId:'', mongoSlug:'', discordGuildId:'',
    discordCategoryId:'', discordRoleId:'', driveFolderId:'', gateAReadyAt:'', provisionedAt:'',
    createdAt:now, updatedAt:now };
  (S.engagements = S.engagements || []).push(rec);
  saveLocal();
  await durableSave({ action:'saveEngagement', ...rec }, 'Engagement', 'engagements', r => { if (r.engagement) Object.assign(rec, r.engagement); });
  return rec;
}

// "Start engagement" button (Closed Won lead) — ensure the record, then jump to the cockpit.
async function startEngagement(leadId) {
  const existed = !!engFor(leadId);
  await ensureEngagement(leadId);
  const l = (S.leads || []).find(x => x.id === leadId);
  toast(existed ? 'Engagement already started for this lead.' : ('Engagement started for ' + ((l && l.name) || 'lead') + '.'), existed ? 'warning' : 'success');
  if (typeof closeModal === 'function') closeModal();
  navigate('admin'); adminTab('clients');
}

function renderEngagements() {
  const el = document.getElementById('engagements-list'); if (!el) return;
  const engs = (S.engagements || []).slice().sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  const cnt = document.getElementById('engagements-count');
  if (cnt) cnt.textContent = engs.length ? (engs.length + ' engagement' + (engs.length === 1 ? '' : 's')) : '';
  if (!engs.length) { el.innerHTML = '<div class="notes-empty">No engagements yet. Open a Closed Won lead and click “Start engagement”.</div>'; return; }
  el.innerHTML = engs.map(e => {
    const checks = engGateChecks_(e);
    const ready  = checks.every(c => c.done);
    const status = ready && e.status !== 'provisioning' && e.status !== 'active' ? 'gate_a_ready' : (e.status || 'won');
    const chips  = checks.map(c => `<span class="eng-check ${c.done ? 'on' : ''}">${c.done ? '✓' : '○'} ${c.label}</span>`).join('');
    const reg    = [e.stripeCustomerId && 'Stripe', e.mongoSlug && 'Mongo', e.discordGuildId && 'Discord', e.driveFolderId && 'Drive'].filter(Boolean);
    return `<div class="card" style="margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-weight:600;color:var(--hl)">${esc(e.company || '—')} <span class="eng-status eng-${status}">${ENG_STATUS_LABEL[status] || status}</span></div>
          <div style="font-size:11px;color:var(--body);margin-top:3px;font-family:'Geist Mono',monospace">${esc(e.engagementId)}${e.dealValue ? ' · ' + fmtUSD(e.dealValue) : ''}</div>
        </div>
        <span style="font-size:11px;color:var(--sub)">${ready ? 'Gate A met' : checks.filter(c => c.done).length + '/4'}</span>
      </div>
      <div class="eng-checks">${chips}</div>
      ${closeLinkHtml_(e)}
      ${roadmapHtml_(e)}
      ${provisionHtml_(e)}
      ${reg.length ? `<div style="font-size:11px;color:var(--sub);margin-top:8px">Registry: ${reg.join(' · ')}</div>` : ''}
    </div>`;
  }).join('');
}

// The close-page controls on an engagement card: plan/tier picker, the shareable
// "close link" the client signs+pays on, signed/paid status + executed-MSA link.
const CLOSE_BASE = 'https://crm.axius.tech/close.html';
function closeLinkHtml_(e) {
  const tier = String(e.tier || 'team').toLowerCase();
  const signed = String(e.msaSigned) === 'yes', paid = String(e.paid) === 'yes';
  const status = signed ? (paid ? '<span style="color:var(--pos)">Signed + paid</span>' : 'Signed · awaiting payment') : 'Not signed yet';
  const msaLink = e.msaUrl ? ` · <a class="call-rec-link" href="${esc(e.msaUrl)}" target="_blank" rel="noopener">Executed MSA</a>` : '';
  const sel = `<select class="field-sel" style="font-size:11px;padding:4px 8px" ${paid ? 'disabled' : ''} onchange="setEngTier_('${esc(e.engagementId)}', this.value)">
      <option value="team" ${tier === 'team' ? 'selected' : ''}>Team · $2,500/mo + $500</option>
      <option value="department" ${tier === 'department' ? 'selected' : ''}>Department · $5,000/mo + $1,000</option>
    </select>`;
  return `<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${sel}
      <button class="call-tx-btn" onclick="copyCloseLink_('${esc(e.engagementId)}')">🔗 Copy close link</button>
      <span style="font-size:11px;color:var(--sub)">${status}${msaLink}</span>
    </div>`;
}
async function setEngTier_(eid, tier) {
  const e = (S.engagements || []).find(x => x.engagementId === eid); if (!e) return;
  e.tier = tier; saveLocal(); renderEngagements();
  await durableSave({ action:'saveEngagement', engagementId:eid, tier:tier }, 'Tier', 'engagements', r => { if (r.engagement) Object.assign(e, r.engagement); });
}
function copyCloseLink_(eid) {
  const url = CLOSE_BASE + '?eid=' + encodeURIComponent(eid);
  const done = () => toast('Close link copied — send it to the client.', 'success');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done).catch(() => prompt('Copy the close link:', url));
  else prompt('Copy the close link:', url);
}

// Manually drain the bot's staged delivery queue into Drive (also runs on schedule).
async function syncDeliveryNow_() {
  if (!S.config.scriptUrl || S.demoMode) { toast('Connect Apps Script to sync delivery.', 'error'); return; }
  const btn = document.getElementById('sync-delivery-btn');
  if (btn) { btn.disabled = true; btn.textContent = '↻ Syncing…'; }
  try {
    const r = await sheetsCall({ action:'syncDeliveryNow' });
    if (r && r.success) toast(r.pulled ? ('Synced ' + r.wrote + ' of ' + r.pulled + ' item' + (r.pulled === 1 ? '' : 's') + ' to Drive.') : 'Nothing pending to sync.', 'success');
    else toast((r && r.error) ? r.error : 'Sync failed.', 'error', 6000);
  } catch (e) { toast('Sync failed: ' + e.message, 'error'); }
  if (btn) { btn.disabled = false; btn.textContent = '↻ Sync delivery'; }
}

// Provisioning (Gate-A handoff): a button once all four signals are met and the
// engagement isn't provisioned yet; a spinner while it runs. Hidden in demo.
function provisionHtml_(e) {
  if (e.provisionedAt || e.status === 'active' || e.status === 'provisioning') return '';
  if (!engGateChecks_(e).every(c => c.done)) return '';
  if (e._provisioning) return `<div style="margin-top:8px"><span class="call-rec-pending"><span class="call-rec-spin"></span>Provisioning Discord + Drive + Registry…</span></div>`;
  if (S.demoMode) return '';
  return `<div style="margin-top:8px"><button class="btn btn-primary" style="font-size:12px;padding:7px 14px" onclick="provisionEngagement_('${esc(e.engagementId)}')">🚀 Provision (Gate A)</button></div>`;
}
async function provisionEngagement_(eid) {
  const e = (S.engagements || []).find(x => x.engagementId === eid); if (!e || e._provisioning) return;
  if (!S.config.scriptUrl || S.demoMode) { toast('Connect Apps Script to provision.', 'error'); return; }
  if (!confirm('Provision ' + (e.company || eid) + '?\n\nThis creates the Discord space, copies the Drive folder from the template, and writes the Project Registry row. It can’t be auto-undone.')) return;
  e._provisioning = true; renderEngagements();
  try {
    const r = await sheetsCall({ action:'provisionEngagement', engagementId:eid });
    if (r && r.provisioned) { if (r.engagement) Object.assign(e, r.engagement); toast((e.company || eid) + ' is live — Discord, Drive, and Registry are set.', 'success'); }
    else toast((r && r.error) ? r.error : 'Provisioning failed.', 'error', 8000);
  } catch (err) { toast('Provisioning failed: ' + err.message, 'error'); }
  e._provisioning = false; saveLocal(); renderEngagements();
}

// Roadmap area for an engagement card: the draft (with redraft/approve), a
// spinner while drafting, or a "draft" button. Action buttons hide in demo.
function roadmapHtml_(e) {
  if (e._drafting) return `<div style="margin-top:8px"><span class="call-rec-pending"><span class="call-rec-spin"></span>Drafting roadmap…</span></div>`;
  if (e.roadmap) {
    const approved = !!e.roadmapApprovedAt;
    const btns = S.demoMode ? '' : `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="call-tx-btn" onclick="draftRoadmap_('${esc(e.engagementId)}')">Redraft</button>
        ${approved ? '' : `<button class="call-tx-btn" onclick="approveRoadmap_('${esc(e.engagementId)}')">Mark approved</button>`}
      </div>`;
    return `<div style="margin-top:8px">
      <details class="call-transcript"><summary>Quarterly roadmap · ${approved ? '<span style="color:var(--pos)">approved</span>' : 'draft'}</summary><div class="call-transcript-body">${esc(e.roadmap)}</div></details>
      ${btns}</div>`;
  }
  return S.demoMode ? '' : `<div style="margin-top:8px"><button class="call-tx-btn" onclick="draftRoadmap_('${esc(e.engagementId)}')">🗺 Draft roadmap (AI)</button></div>`;
}

// Ask the backend to draft the roadmap from the lead's transcripts + thread.
async function draftRoadmap_(eid) {
  const e = (S.engagements || []).find(x => x.engagementId === eid);
  if (!e || e._drafting) return;
  if (!S.config.scriptUrl || S.demoMode) { toast('Connect Apps Script to draft roadmaps.', 'error'); return; }
  e._drafting = true; renderEngagements();
  try {
    const r = await sheetsCall({ action:'draftRoadmap', engagementId:eid });
    if (r && r.roadmap) { e.roadmap = r.roadmap; if (r.engagement) Object.assign(e, r.engagement); toast('Roadmap drafted.', 'success'); }
    else toast((r && r.error) ? r.error : 'Could not draft the roadmap.', 'error', 6000);
  } catch (err) { toast('Draft failed: ' + err.message, 'error'); }
  e._drafting = false; saveLocal(); renderEngagements();
}

// Operator approval of the roadmap (the client also approves via the e-sign page).
async function approveRoadmap_(eid) {
  const e = (S.engagements || []).find(x => x.engagementId === eid);
  if (!e || !e.roadmap) return;
  const now = new Date().toISOString();
  e.roadmapApprovedAt = now; if (e.status === 'roadmap_draft' || e.status === 'won') e.status = 'approved';
  saveLocal(); renderEngagements();
  if (S.config.scriptUrl && !S.demoMode) {
    await durableSave({ action:'saveEngagement', engagementId:eid, roadmapApprovedAt:now, status:'approved' }, 'Approval', 'engagements', r => { if (r.engagement) { Object.assign(e, r.engagement); renderEngagements(); } });
  }
  toast('Roadmap marked approved.', 'success');
}

/* ── Prospect audit (sales artifact, on the lead) ─────────────────────────── */

// Render the audit affordance in the lead modal: generate / preview+send / sent.
function renderLeadAudit_(l) {
  const el = document.getElementById('m-audit'); if (!el) return;
  if (!(S.session && S.session.role === 'admin') || !l) { el.innerHTML = ''; return; }
  if (l._auditing)     { el.innerHTML = '<span class="call-rec-pending"><span class="call-rec-spin"></span>Generating audit…</span>'; return; }
  if (l._sendingAudit) { el.innerHTML = '<span class="call-rec-pending"><span class="call-rec-spin"></span>Sending audit…</span>'; return; }
  const hasCtx = (S.calls || []).some(c => c.leadId === l.id && (c.transcript || c.callSummary)) || (S.interactions || []).some(i => i.leadId === l.id);
  const viewLink = l.auditUrl ? `<a class="call-rec-link" href="${esc(l.auditUrl)}" target="_blank" rel="noopener">View audit</a>` : '';
  if (l.auditSentAt) { el.innerHTML = `<span class="lock-badge lock-mine">Audit sent · ${fmtD(l.auditSentAt)}</span> ${viewLink}`; return; }
  if (l.auditUrl || l._auditText) {
    const preview = l._auditText ? `<details class="call-transcript" style="margin-top:6px"><summary>Preview audit</summary><div class="call-transcript-body">${esc(l._auditText)}</div></details>` : '';
    el.innerHTML = (S.demoMode ? viewLink : `${viewLink}
      <button class="call-tx-btn" onclick="sendAudit_('${l.id}')">Send audit</button>
      <button class="call-tx-btn" onclick="generateAudit_('${l.id}')">Regenerate</button>`) + preview;
    return;
  }
  el.innerHTML = (hasCtx && !S.demoMode) ? `<button class="call-tx-btn" onclick="generateAudit_('${l.id}')">📄 Generate audit (AI)</button>` : '';
}

async function generateAudit_(leadId) {
  const l = (S.leads || []).find(x => x.id === leadId); if (!l || l._auditing) return;
  if (!S.config.scriptUrl || S.demoMode) { toast('Connect Apps Script to generate audits.', 'error'); return; }
  l._auditing = true; renderLeadAudit_(l);
  try {
    const r = await sheetsCall({ action:'generateAudit', leadId:leadId });
    if (r && r.audit) { l._auditText = r.audit; l.auditUrl = r.auditUrl || l.auditUrl; saveLocal(); toast('Audit generated. Review, then send.', 'success'); }
    else toast((r && r.error) ? r.error : 'Could not generate the audit.', 'error', 6000);
  } catch (e) { toast('Audit failed: ' + e.message, 'error'); }
  l._auditing = false; renderLeadAudit_(l);
}

async function sendAudit_(leadId) {
  const l = (S.leads || []).find(x => x.id === leadId); if (!l || l._sendingAudit) return;
  if (!confirm('Send this audit to ' + (l.email || 'the lead') + '?')) return;
  l._sendingAudit = true; renderLeadAudit_(l);
  try {
    const r = await sheetsCall({ action:'sendAudit', leadId:leadId, audit: l._auditText || '' });
    if (r && r.sent) { l.auditSentAt = r.sentAt; saveLocal(); toast('Audit sent.', 'success'); }
    else toast((r && r.error) ? r.error : 'Could not send the audit.', 'error', 6000);
  } catch (e) { toast('Send failed: ' + e.message, 'error'); }
  l._sendingAudit = false; renderLeadAudit_(l);
}
