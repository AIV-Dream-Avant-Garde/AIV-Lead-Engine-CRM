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

// Create an engagement from a Closed Won lead, then sync it to the server.
async function startEngagement(leadId) {
  const l = (S.leads || []).find(x => x.id === leadId);
  if (!l) return;
  if (engFor(leadId)) { toast('Engagement already started for this lead.', 'warning'); navigate('admin'); adminTab('clients'); return; }
  const now = new Date().toISOString();
  const rec = { engagementId:l.id, company:l.name || '', status:'won', dealValue:l.dealValue || '',
    paid:'', paidAt:'', msaSigned:'', msaSignedAt:'', msaSignerName:'', msaSignerIp:'',
    roadmap:'', roadmapApprovedAt:'', stripeCustomerId:'', mongoSlug:'', discordGuildId:'',
    discordCategoryId:'', discordRoleId:'', driveFolderId:'', gateAReadyAt:'', provisionedAt:'',
    createdAt:now, updatedAt:now };
  (S.engagements = S.engagements || []).push(rec);
  saveLocal();
  if (S.config.scriptUrl && !S.demoMode) {
    try { const r = await sheetsCall({ action:'saveEngagement', ...rec }); if (r && r.engagement) Object.assign(rec, r.engagement); } catch (e) {}
  }
  toast('Engagement started for ' + (l.name || 'lead') + '.', 'success');
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
      ${roadmapHtml_(e)}
      ${reg.length ? `<div style="font-size:11px;color:var(--sub);margin-top:8px">Registry: ${reg.join(' · ')}</div>` : ''}
    </div>`;
  }).join('');
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
    try { const r = await sheetsCall({ action:'saveEngagement', engagementId:eid, roadmapApprovedAt:now, status:'approved' }); if (r && r.engagement) { Object.assign(e, r.engagement); renderEngagements(); } } catch (err) {}
  }
  toast('Roadmap marked approved.', 'success');
}
