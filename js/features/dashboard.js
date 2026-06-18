/* ── FEATURE: Dashboard — command-center map + focus strip ──── */

// Status → dot color comes from the shared STATUS_COLOR (constants.js) so the
// dashboard map and scraper map stay in sync.
const DSH_STATUS_COLOR = STATUS_COLOR;

var _dshMap = null, _dshLayer = null, _dshTiles = null;

// Resolve a lead's plot coordinate. Prefer the REAL lat/lng captured at scrape
// time; fall back to deterministic coords derived from the city + neighborhood
// names (same as the scraper picker) for older leads that predate coordinate
// capture — good enough for a territory overview.
function dshLeadCoord(l) {
  const rla = parseFloat(l.lat), rln = parseFloat(l.lng);
  if (isFinite(rla) && isFinite(rln) && (rla !== 0 || rln !== 0)) return { lat: rla, lng: rln };
  const country = l.country || DEFAULT_COUNTRY;
  const base = LOCATIONS[country] && LOCATIONS[country][l.city];
  if (!base) return null;
  return l.barrio ? barrioCoords(base, l.barrio) : { lat: base.lat, lng: base.lng };
}

function renderDashboardMap() {
  if (typeof L === 'undefined') return;            // Leaflet not loaded (offline)
  const host = document.getElementById('dashboard-map');
  if (!host) return;

  if (!_dshMap) {
    _dshMap = L.map(host, { zoomControl:false, attributionControl:true, scrollWheelZoom:true })
               .setView([28.0, -81.7], 7);          // Florida overview
    L.control.zoom({ position:'topright' }).addTo(_dshMap);   // keep clear of the top-left overlay
    _dshTiles = L.tileLayer(mapTileUrl(), {
      maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(_dshMap);
    _dshLayer = L.layerGroup().addTo(_dshMap);
  }

  _dshLayer.clearLayers();
  const pts = [];
  (S.leads || []).forEach(l => {
    const c = dshLeadCoord(l);
    if (!c) return;
    const la = parseFloat(c.lat), ln = parseFloat(c.lng);
    if (!isFinite(la) || !isFinite(ln)) return;
    const color = DSH_STATUS_COLOR[l.status] || '#6B7280';
    L.circleMarker([la, ln], {
      radius:4, color:'#0B0D12', weight:1, fillColor:color, fillOpacity:.92,
    }).bindPopup(`<b>${esc(l.name||'No name')}</b><br>${esc([l.barrio,l.city].filter(Boolean).join(', '))}<br><span style="color:${color}">${esc(l.status||'New')}</span>`)
      .addTo(_dshLayer);
    pts.push([la, ln]);
  });

  if (pts.length) {
    try { _dshMap.fitBounds(L.latLngBounds(pts), { padding:[40,40], maxZoom:12 }); } catch(e) {}
  }
  setTimeout(() => { try { _dshMap.invalidateSize(); } catch(e) {} }, 60);

  const cnt = document.getElementById('dsh-meta-count');
  if (cnt) cnt.textContent = pts.length;
  const loc = document.getElementById('dsh-meta-loc');
  if (loc) {
    const cities = new Set((S.leads||[]).map(l => l.city).filter(Boolean));
    loc.textContent = cities.size ? (cities.size + (cities.size === 1 ? ' city' : ' cities')) : 'All territory';
  }
}

// "What needs attention" strip — quick links into the daily workflow.
function renderDashboardFocus() {
  const host = document.getElementById('dsh-focus');
  if (!host) return;

  const waiting = (typeof responderCount === 'function') ? responderCount() : 0;
  const overdue = (S.leads || []).filter(l => isOverdue(l)).length;
  const now     = new Date();
  const callsToday = (S.calls || []).filter(c => c.calledAt && new Date(c.calledAt).toDateString() === now.toDateString()).length;
  // Use leadClosedAt (the Closed-Won stamp), matching Pipeline + Analytics — so
  // editing an old won deal can't inflate this month's count.
  const wonThisMonth = (S.leads || []).filter(l => {
    if (l.status !== 'Closed Won') return false;
    const d = new Date(leadClosedAt(l));
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const cards = [
    { val: waiting,    label: 'Waiting on a reply', sub: waiting ? 'Tap to respond now' : 'All caught up', nav: 'responder', color: waiting ? 'var(--red)' : 'var(--hl)' },
    { val: overdue,    label: 'Overdue follow-ups',  sub: overdue ? 'Past their date' : 'Nothing overdue', nav: 'leads',     color: overdue ? 'var(--amber)' : 'var(--hl)' },
    { val: callsToday, label: 'Calls today',         sub: 'Dialed since midnight',                          nav: 'llamadas',  color: 'var(--hl)' },
    { val: wonThisMonth, label: 'Won this month',    sub: 'Closed Won this calendar month',                 nav: 'pipeline',  color: 'var(--pos)' },
  ];

  host.innerHTML = cards.map(c =>
    `<div class="dsh-focus-card" onclick="navigate('${c.nav}')">
       <div class="dfc-val" style="color:${c.color}">${c.val}</div>
       <div class="dfc-label">${c.label}</div>
       <div class="dfc-sub">${c.sub}</div>
     </div>`).join('');
}

function renderDashboard() {
  renderDashboardFocus();
  setTimeout(() => renderDashboardMap(), 80);
}
