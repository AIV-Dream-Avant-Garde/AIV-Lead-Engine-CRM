/* ── FEATURE: Analytics dashboard ────────────────────────── */

function renderAnalytics() {
  if (!S.session) return;
  renderAnalyticsKPIs();
  renderOutreach();
  renderSubjectPerformance();
  renderFunnel();
  renderSourceROI();
  renderLeaderboard();
  renderCallPerformance();
}

// ── Subject-line performance (data only) ───────────────────
// The first email rotates between subject lines per lead, by a stable hash of the
// lead id (mirrors the engine's pickVariant(lead.id, 7, N)). We re-derive which
// subject each emailed lead got and show the reply rate per subject — so you can
// see which line actually earns replies. Labels mirror Code.gs SUBJECT_LINES (for
// display only; keep this list + order in sync when you change the subjects).
const SUBJECT_LABELS = [
  "A note for {business}",
  "Reaching out about {business}",
  "Quick question about {business}",
];
function cadencePickVariant_(leadId, stepIndex, n) {
  if (!n || n <= 1) return 0;
  const s = String(leadId || '') + ':' + String(stepIndex || 0);
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % n;
}
function renderSubjectPerformance() {
  const el = document.getElementById('analytics-subject-perf');
  if (!el) return;
  const ix = S.interactions || [];
  // Leads that received the FIRST cadence email (step 0). The subject is constant
  // per lead, so this is the right denominator for subject reply rate.
  const firstEmailed = {};
  ix.forEach(i => { if (i.channel === 'email' && i.direction === 'out' && i.createdBy === 'cadence' && i.stepTag === 'seq:0') firstEmailed[i.leadId] = 1; });
  const replied = new Set(ix.filter(i => i.channel === 'email' && i.direction === 'in').map(i => i.leadId));
  const n = SUBJECT_LABELS.length;
  const stat = Array.from({ length: n }, () => ({ sent: 0, replied: 0 }));
  Object.keys(firstEmailed).forEach(leadId => {
    const idx = cadencePickVariant_(leadId, 7, n);
    stat[idx].sent++;
    if (replied.has(leadId)) stat[idx].replied++;
  });
  const total = stat.reduce((s, x) => s + x.sent, 0);
  if (!total) { el.innerHTML = '<div class="notes-empty">No first emails sent yet. Each subject line\'s reply rate shows here once the cadence runs.</div>'; return; }
  el.innerHTML = '<table class="data-table"><thead><tr><th>Subject line</th><th>Sent</th><th>Replied</th><th>Reply rate</th></tr></thead><tbody>' +
    stat.map((x, i) => '<tr><td>' + esc(SUBJECT_LABELS[i]) + '</td><td>' + x.sent + '</td><td>' + x.replied + '</td><td><strong>' + (x.sent ? Math.round(x.replied / x.sent * 100) : 0) + '%</strong></td></tr>').join('') +
    '</tbody></table>';
}

// ── Outreach performance (email autopilot) ─────────────────
// Surfaces what the cadence + AI replies are actually doing: how much went out,
// how much came back, and how emailed leads progress to interested/won. All from
// the interaction log (channel 'email'), so it reflects real sends + replies.
function renderOutreach() {
  const stats = document.getElementById('analytics-outreach-stats');
  if (!stats) return;
  const funnelEl = document.getElementById('analytics-outreach-funnel');
  const emails = (S.interactions || []).filter(i => i.channel === 'email');
  const out = emails.filter(i => i.direction === 'out');
  const inb = emails.filter(i => i.direction === 'in');

  if (!out.length) {
    stats.innerHTML = '<div class="notes-empty">No outreach sent yet. Turn on the email cadence in Admin to start reaching leads.</div>';
    if (funnelEl) funnelEl.innerHTML = '';
    return;
  }

  const emailedIds = new Set(out.map(i => i.leadId).filter(Boolean));
  const repliedIds = new Set(inb.map(i => i.leadId).filter(Boolean));
  const reached    = emailedIds.size;
  const replied    = repliedIds.size;
  const replyRate  = reached ? Math.round(replied / reached * 100) : 0;
  const aiSent     = out.filter(i => i.createdBy === 'ai').length;
  const optOut     = S.leads.filter(l => l.status === 'Do Not Call' && /opt-?out/i.test(l.dncReason || '')).length;

  stats.innerHTML = `<div class="analytics-call-stats-grid">
    <div class="call-stat"><div class="call-stat-val">${out.length}</div><div class="call-stat-lbl">Emails sent</div></div>
    <div class="call-stat"><div class="call-stat-val">${reached}</div><div class="call-stat-lbl">Leads reached</div></div>
    <div class="call-stat"><div class="call-stat-val">${replied}</div><div class="call-stat-lbl">Replied</div></div>
    <div class="call-stat"><div class="call-stat-val">${replyRate}%</div><div class="call-stat-lbl">Reply rate</div></div>
    <div class="call-stat"><div class="call-stat-val">${aiSent}</div><div class="call-stat-lbl">AI replies sent</div></div>
    <div class="call-stat"><div class="call-stat-val">${optOut}</div><div class="call-stat-lbl">Opt-outs</div></div>
  </div>`;

  if (funnelEl) {
    const emailed    = S.leads.filter(l => emailedIds.has(l.id));
    const interested = emailed.filter(l => l.status === 'Interested' || l.status === 'Closed Won').length;
    const won        = emailed.filter(l => l.status === 'Closed Won').length;
    const base = reached || 1;
    const rows = [
      {label:'Reached',    count:reached,    cls:'contacted'},
      {label:'Replied',    count:replied,    cls:'interested'},
      {label:'Interested', count:interested, cls:'interested'},
      {label:'Closed Won', count:won,        cls:'closed'},
    ];
    funnelEl.innerHTML = rows.map(r => {
      const pct = Math.round(r.count / base * 100);
      return `<div class="funnel-row">
        <div class="funnel-label">${r.label}</div>
        <div class="funnel-bar-wrap"><div class="funnel-bar status-${r.cls}" style="width:${Math.max(pct,1)}%"></div></div>
        <div class="funnel-count">${r.count} <span class="funnel-pct">(${pct}%)</span></div>
      </div>`;
    }).join('');
  }
}

// ── KPI Row ────────────────────────────────────────────────
function renderAnalyticsKPIs() {
  const now   = new Date();
  const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  const closedThisMonth = S.leads.filter(l =>
    l.status === 'Closed Won' && (leadClosedAt(l) || '').startsWith(month)
  );
  const revenueThisMonth = closedThisMonth.reduce((s, l) => s + parseFloat(l.dealValue || 0), 0);

  const paidComm = S.commissions
    .filter(c => c.status === 'paid' && c.paidAt && c.paidAt.startsWith(month))
    .reduce((s, c) => s + parseFloat(c.closerAmount || 0), 0);

  const worked = S.leads.filter(l => l.status !== 'New').length;
  const closeRate = worked > 0
    ? Math.round(S.leads.filter(l => l.status === 'Closed Won').length / worked * 100)
    : 0;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('kpi-deals',      closedThisMonth.length);
  set('kpi-revenue',    fmtUSD(revenueThisMonth));
  set('kpi-paid-comm',  fmtUSD(paidComm));
  set('kpi-close-rate', closeRate + '%');
}

// ── Conversion Funnel ──────────────────────────────────────
function renderFunnel() {
  const el = document.getElementById('analytics-funnel');
  if (!el) return;
  const total = S.leads.length || 1;
  const stages = [
    {label:'New',             key:'New',              cls:'new'},
    {label:'Contacted',        key:'Contacted',         cls:'contacted'},
    {label:'Interested',        key:'Interested',         cls:'interested'},
    {label:'Closed Won',           key:'Closed Won',            cls:'closed'},
    {label:'Closed Lost',      key:'Closed Lost',cls:'failed'},
    {label:'Not Interested',     key:'Not Interested',      cls:'dead'},
    {label:'Do Not Call',         key:'Do Not Call',          cls:'dnc'},
  ];
  el.innerHTML = stages.map(s => {
    const count = S.leads.filter(l => (l.status || 'New') === s.key).length;
    const pct   = Math.round(count / total * 100);
    const barW  = Math.max(pct, 1);
    return `<div class="funnel-row">
      <div class="funnel-label">${s.label}</div>
      <div class="funnel-bar-wrap">
        <div class="funnel-bar status-${s.cls}" style="width:${barW}%"></div>
      </div>
      <div class="funnel-count">${count} <span class="funnel-pct">(${pct}%)</span></div>
    </div>`;
  }).join('');
}

// ── Source ROI ─────────────────────────────────────────────
function renderSourceROI() {
  const tbody = document.querySelector('#analytics-source-table tbody');
  if (!tbody) return;
  const map = {};
  S.leads.forEach(l => {
    const src = (l.source || '').split(' · ')[0] || 'No source';
    if (!map[src]) map[src] = {total:0, closed:0, revenue:0};
    map[src].total++;
    if (l.status === 'Closed Won') { map[src].closed++; map[src].revenue += parseFloat(l.dealValue || 0); }
  });
  const rows = Object.entries(map)
    .map(([src, d]) => ({src, ...d, rate: d.total > 0 ? Math.round(d.closed / d.total * 100) : 0}))
    .sort((a, b) => b.revenue - a.revenue);

  tbody.innerHTML = rows.length
    ? rows.map(r => `<tr>
        <td>${esc(r.src)}</td>
        <td>${r.total}</td>
        <td>${r.closed}</td>
        <td>${r.rate}%</td>
        <td>${fmtUSD(r.revenue)}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="notes-empty">No closed deals yet. Sources rank here once you start winning business.</td></tr>';
}

// ── Team Leaderboard ───────────────────────────────────────
function renderLeaderboard() {
  const tbody = document.querySelector('#analytics-leaderboard tbody');
  if (!tbody) return;
  const ROLE_LABELS = {admin:'Admin', closer:'Closer', solo:'Solo'};
  const members = S.team.filter(m => String(m.active) !== 'false').map(m => {
    const closed  = S.leads.filter(l => l.status === 'Closed Won' && l.closerId === m.id);
    const revenue = closed.reduce((s, l) => s + parseFloat(l.dealValue || 0), 0);
    const calls   = S.calls.filter(c => c.leadId && S.leads.find(l => l.id === c.leadId && l.closerId === m.id)).length;
    return {name:m.name, role:m.role, deals:closed.length, revenue, calls};
  }).sort((a, b) => b.revenue - a.revenue || b.deals - a.deals);

  tbody.innerHTML = members.length
    ? members.map((m, i) => `<tr>
        <td style="color:var(--sub);font-size:11px">${i + 1}</td>
        <td><strong>${esc(m.name)}</strong></td>
        <td><span class="source-badge src-default">${esc(ROLE_LABELS[m.role] || m.role)}</span></td>
        <td>${m.deals}</td>
        <td>${fmtUSD(m.revenue)}</td>
        <td>${m.calls}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="notes-empty">No active members</td></tr>';
}

// ── Call Performance ───────────────────────────────────────
function renderCallPerformance() {
  const el = document.getElementById('analytics-calls-stats');
  if (!el) return;
  if (!S.calls.length) { el.innerHTML = '<div class="notes-empty">No calls recorded.</div>'; return; }

  const total    = S.calls.length;
  const answered = S.calls.filter(c => c.outcome === 'answered').length;
  const ansRate  = total > 0 ? Math.round(answered / total * 100) : 0;
  const avgDur   = Math.round(S.calls.reduce((s, c) => s + parseInt(c.duration || 0), 0) / total);

  // Calls per day last 30 days
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = S.calls.filter(c => c.calledAt && new Date(c.calledAt).getTime() >= cutoff);
  const perDay = recent.length > 0 ? (recent.length / 30).toFixed(1) : '0';

  el.innerHTML = `<div class="analytics-call-stats-grid">
    <div class="call-stat"><div class="call-stat-val">${total}</div><div class="call-stat-lbl">Total calls</div></div>
    <div class="call-stat"><div class="call-stat-val">${ansRate}%</div><div class="call-stat-lbl">Answer rate</div></div>
    <div class="call-stat"><div class="call-stat-val">${fmtSec(avgDur)}</div><div class="call-stat-lbl">Average duration</div></div>
    <div class="call-stat"><div class="call-stat-val">${perDay}</div><div class="call-stat-lbl">Calls/day (30d)</div></div>
  </div>`;
}
