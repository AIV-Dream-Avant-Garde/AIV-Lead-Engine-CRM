/* ── FEATURE: Analytics dashboard ────────────────────────── */

function renderAnalytics() {
  if (!S.session) return;
  renderAnalyticsKPIs();
  renderFunnel();
  renderSourceROI();
  renderLeaderboard();
  renderCallPerformance();
}

// ── KPI Row ────────────────────────────────────────────────
function renderAnalyticsKPIs() {
  const now   = new Date();
  const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  const closedThisMonth = S.leads.filter(l =>
    l.status === 'Cerrado' && l.updatedAt && l.updatedAt.startsWith(month)
  );
  const revenueThisMonth = closedThisMonth.reduce((s, l) => s + parseFloat(l.dealValue || 0), 0);

  const paidComm = S.commissions
    .filter(c => c.status === 'paid' && c.paidAt && c.paidAt.startsWith(month))
    .reduce((s, c) => s + parseFloat(c.closerAmount || 0), 0);

  const worked = S.leads.filter(l => l.status !== 'Nuevo').length;
  const closeRate = worked > 0
    ? Math.round(S.leads.filter(l => l.status === 'Cerrado').length / worked * 100)
    : 0;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('kpi-deals',      closedThisMonth.length);
  set('kpi-revenue',    fmtCOP(revenueThisMonth));
  set('kpi-paid-comm',  fmtCOP(paidComm));
  set('kpi-close-rate', closeRate + '%');
}

// ── Conversion Funnel ──────────────────────────────────────
function renderFunnel() {
  const el = document.getElementById('analytics-funnel');
  if (!el) return;
  const total = S.leads.length || 1;
  const stages = [
    {label:'Nuevo',             key:'Nuevo',              cls:'new'},
    {label:'Contactado',        key:'Contactado',         cls:'contacted'},
    {label:'Interesado',        key:'Interesado',         cls:'interested'},
    {label:'Cerrado',           key:'Cerrado',            cls:'closed'},
    {label:'Neg. Fallida',      key:'Negociacion fallida',cls:'failed'},
    {label:'No interesado',     key:'No interesado',      cls:'dead'},
    {label:'No llamar',         key:'No llamar',          cls:'dnc'},
  ];
  el.innerHTML = stages.map(s => {
    const count = S.leads.filter(l => (l.status || 'Nuevo') === s.key).length;
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
    const src = (l.source || '').split(' · ')[0] || 'Sin fuente';
    if (!map[src]) map[src] = {total:0, closed:0, revenue:0};
    map[src].total++;
    if (l.status === 'Cerrado') { map[src].closed++; map[src].revenue += parseFloat(l.dealValue || 0); }
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
        <td>${fmtCOP(r.revenue)}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="notes-empty">Sin datos</td></tr>';
}

// ── Team Leaderboard ───────────────────────────────────────
function renderLeaderboard() {
  const tbody = document.querySelector('#analytics-leaderboard tbody');
  if (!tbody) return;
  const ROLE_LABELS = {admin:'Admin', closer:'Closer', solo:'Solo'};
  const members = S.team.filter(m => String(m.active) !== 'false').map(m => {
    const closed  = S.leads.filter(l => l.status === 'Cerrado' && l.closerId === m.id);
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
        <td>${fmtCOP(m.revenue)}</td>
        <td>${m.calls}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="notes-empty">Sin miembros activos</td></tr>';
}

// ── Call Performance ───────────────────────────────────────
function renderCallPerformance() {
  const el = document.getElementById('analytics-calls-stats');
  if (!el) return;
  if (!S.calls.length) { el.innerHTML = '<div class="notes-empty">Sin llamadas registradas.</div>'; return; }

  const total    = S.calls.length;
  const answered = S.calls.filter(c => c.outcome === 'answered').length;
  const ansRate  = total > 0 ? Math.round(answered / total * 100) : 0;
  const avgDur   = Math.round(S.calls.reduce((s, c) => s + parseInt(c.duration || 0), 0) / total);

  // Calls per day last 30 days
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = S.calls.filter(c => c.calledAt && new Date(c.calledAt).getTime() >= cutoff);
  const perDay = recent.length > 0 ? (recent.length / 30).toFixed(1) : '0';

  el.innerHTML = `<div class="analytics-call-stats-grid">
    <div class="call-stat"><div class="call-stat-val">${total}</div><div class="call-stat-lbl">Llamadas totales</div></div>
    <div class="call-stat"><div class="call-stat-val">${ansRate}%</div><div class="call-stat-lbl">Tasa de respuesta</div></div>
    <div class="call-stat"><div class="call-stat-val">${fmtSec(avgDur)}</div><div class="call-stat-lbl">Duración promedio</div></div>
    <div class="call-stat"><div class="call-stat-val">${perDay}</div><div class="call-stat-lbl">Llamadas/día (30d)</div></div>
  </div>`;
}
