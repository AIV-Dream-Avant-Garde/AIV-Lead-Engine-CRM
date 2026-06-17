/* ── FEATURE: Google Places scraper via Apps Script ──────── */

// ── Location/category helpers ──────────────────────────────
function barrioHash(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
  return h;
}

function barrioCoords(base, name) {
  const h = barrioHash(name);
  return {
    lat: (base.lat + (h % 1000) / 100000).toFixed(5),
    lng: (base.lng + ((h >> 10) % 1000) / 100000).toFixed(5),
  };
}

function fillCountries(selId) {
  const s = document.getElementById(selId);
  if (!s) return;
  const cur = s.value;
  s.innerHTML = Object.keys(LOCATIONS).map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if (LOCATIONS[cur]) s.value = cur;
}

function fillCities(selId, country) {
  const s = document.getElementById(selId);
  if (!s) return;
  const cities = LOCATIONS[country] ? Object.keys(LOCATIONS[country]) : [];
  s.innerHTML = cities.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
}

function fillBarrios(selId, country, city, onch) {
  const s = document.getElementById(selId);
  if (!s) return;
  const loc = LOCATIONS[country] && LOCATIONS[country][city];
  if (!loc) { s.innerHTML = ''; if (onch) s.onchange = onch; return; }
  s.innerHTML = '';
  if (loc.type === 'comunas') {
    Object.entries(loc.data).forEach(([com, d]) => {
      const g = document.createElement('optgroup');
      g.label = com;
      d.b.forEach(b => {
        const c = barrioCoords(d, b);
        const o = document.createElement('option');
        o.value = `${b}|${c.lat}|${c.lng}`;
        o.textContent = b;
        g.appendChild(o);
      });
      s.appendChild(g);
    });
  } else {
    loc.b.forEach(b => {
      const c = barrioCoords(loc, b);
      const o = document.createElement('option');
      o.value = `${b}|${c.lat}|${c.lng}`;
      o.textContent = b;
      s.appendChild(o);
    });
  }
  if (onch) s.onchange = onch;
}

function fillCats(selId, kwSelId, country) {
  const s = document.getElementById(selId);
  if (!s) return;
  const cats = KEYWORDS[country] ? Object.keys(KEYWORDS[country]) : [];
  s.innerHTML = cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  s.onchange = () => fillKws(kwSelId, country, s.value);
  fillKws(kwSelId, country, s.value);
}

function fillKws(selId, country, cat) {
  const s = document.getElementById(selId);
  if (!s) return;
  const list = (KEYWORDS[country] && KEYWORDS[country][cat]) || [];
  s.innerHTML = list.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
}

function fillSources(selId) {
  const s = document.getElementById(selId);
  if (!s) return;
  s.innerHTML = SOURCES.map(x => `<option value="${esc(x.val)}">${esc(x.val)}</option>`).join('');
}

function updateGPS() {
  const v  = document.getElementById('sc-barrio')?.value || '';
  const p  = v.split('|');
  if (p.length >= 3) {
    const el = document.getElementById('sc-gps');
    if (el) el.value = `${p[1]}, ${p[2]}  --  ${p[0]}`;
  }
  renderScraperMap();
}

// ── Bloomberg-style dark scraper map (Leaflet + CartoDB dark) ──
var _scMap = null, _scCircle = null, _scCenter = null, _scLeadLayer = null;

// Resolve the current target: selected neighborhood coords if any, else the
// city center. Returns {lat, lng, city, country, barrio} or null.
function scMapTarget() {
  const country = document.getElementById('sc-country')?.value || DEFAULT_COUNTRY;
  const city    = document.getElementById('sc-city')?.value    || '';
  const bv      = document.getElementById('sc-barrio')?.value  || '';
  const [barrio, blat, blng] = bv.split('|');
  const base    = LOCATIONS[country] && LOCATIONS[country][city];
  let lat = parseFloat(blat), lng = parseFloat(blng);
  if (!isFinite(lat) || !isFinite(lng)) {
    if (!base) return null;
    lat = base.lat; lng = base.lng;
  }
  return { lat, lng, city, country, barrio: barrio || '', base };
}

function renderScraperMap() {
  if (typeof L === 'undefined') return;                 // Leaflet not loaded (offline)
  const host = document.getElementById('scraper-map');
  if (!host) return;
  const t = scMapTarget();
  if (!t) return;
  const radius = parseInt(document.getElementById('sc-radius')?.value || '1000', 10);

  // Init once
  if (!_scMap) {
    _scMap = L.map(host, { zoomControl:true, attributionControl:true, scrollWheelZoom:true })
              .setView([t.lat, t.lng], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(_scMap);
    _scLeadLayer = L.layerGroup().addTo(_scMap);
  }

  // Center pin
  const centerIcon = L.divIcon({ className:'map-center-pin', html:'<span></span>', iconSize:[14,14], iconAnchor:[7,7] });
  if (_scCenter) _scCenter.setLatLng([t.lat, t.lng]).setIcon(centerIcon);
  else _scCenter = L.marker([t.lat, t.lng], { icon:centerIcon, interactive:false }).addTo(_scMap);

  // Radius circle
  if (_scCircle) _scCircle.setLatLng([t.lat, t.lng]).setRadius(radius);
  else _scCircle = L.circle([t.lat, t.lng], {
    radius, color:'#2DD4BF', weight:1.5, opacity:.85,
    fillColor:'#2DD4BF', fillOpacity:.07,
  }).addTo(_scMap);

  // Plot existing leads in the selected city (deterministic coords from name)
  _scLeadLayer.clearLayers();
  let inView = 0;
  if (t.base) {
    (S.leads || []).forEach(l => {
      if (String(l.city || '').toLowerCase() !== String(t.city).toLowerCase()) return;
      // Prefer real captured coords; fall back to deterministic name-based coords.
      const rla = parseFloat(l.lat), rln = parseFloat(l.lng);
      const c = (isFinite(rla) && isFinite(rln) && (rla !== 0 || rln !== 0))
        ? { lat:rla, lng:rln }
        : (l.barrio ? barrioCoords(t.base, l.barrio) : { lat:t.base.lat, lng:t.base.lng });
      const la = parseFloat(c.lat), ln = parseFloat(c.lng);
      const d = scHaversine(t.lat, t.lng, la, ln);
      if (d <= radius) inView++;
      L.circleMarker([la, ln], {
        radius:4, color:'#cdd8ff', weight:1, fillColor:'#4B72FF', fillOpacity:.9,
      }).bindPopup(`<b>${esc(l.name||'No name')}</b><br>${esc(l.barrio||'')}${l.barrio?' · ':''}${esc(l.status||'')}`)
        .addTo(_scLeadLayer);
    });
  }

  // Fit to the circle so the whole radius is "everything it can show"
  try { _scMap.fitBounds(_scCircle.getBounds(), { padding:[28,28], maxZoom:16 }); } catch(e) {}
  setTimeout(() => { try { _scMap.invalidateSize(); } catch(e) {} }, 60);

  // Overlay meta
  const km = radius >= 1000 ? (radius/1000) + 'km' : radius + 'm';
  const locEl = document.getElementById('map-meta-loc');
  if (locEl) locEl.textContent = [t.barrio, t.city, t.country].filter(Boolean).join(', ');
  const radEl = document.getElementById('map-meta-radius');
  if (radEl) radEl.textContent = km + ' radius';
  const leadEl = document.getElementById('map-meta-leads');
  if (leadEl) leadEl.textContent = inView;
}

// Great-circle distance in meters
function scHaversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, toR = d => d * Math.PI / 180;
  const dLat = toR(lat2-lat1), dLng = toR(lng2-lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toR(lat1))*Math.cos(toR(lat2))*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Scraper cascade: country → city → barrio, and country → category → keyword
function onCountryChange() {
  const country = document.getElementById('sc-country')?.value || DEFAULT_COUNTRY;
  fillCities('sc-city', country);
  onCityChange();
  fillCats('sc-cat', 'sc-kw', country);
}
function onCityChange() {
  const country = document.getElementById('sc-country')?.value || DEFAULT_COUNTRY;
  fillBarrios('sc-barrio', country, document.getElementById('sc-city')?.value || '', updateGPS);
  updateGPS();
}
function onCatChange() {
  const country = document.getElementById('sc-country')?.value || DEFAULT_COUNTRY;
  fillKws('sc-kw', country, document.getElementById('sc-cat')?.value || '');
}

// Import cascade (mirror of the scraper cascade)
function onImpCountryChange() {
  const country = document.getElementById('imp-country')?.value || DEFAULT_COUNTRY;
  fillCities('imp-city', country);
  onImpCityChange();
  fillCats('imp-cat', 'imp-kw', country);
}
function onImpCityChange() {
  const country = document.getElementById('imp-country')?.value || DEFAULT_COUNTRY;
  fillBarrios('imp-barrio', country, document.getElementById('imp-city')?.value || '', null);
}
function onImpCatChange() {
  const country = document.getElementById('imp-country')?.value || DEFAULT_COUNTRY;
  fillKws('imp-kw', country, document.getElementById('imp-cat')?.value || '');
}

// Scheduled-jobs cascade (admin)
function onSjCountryChange() {
  const country = document.getElementById('sj-country')?.value || DEFAULT_COUNTRY;
  fillCities('sj-city', country);
  fillBarrios('sj-barrio', country, document.getElementById('sj-city')?.value || '', null);
  fillCats('sj-cat', 'sj-keyword', country);
}

// ── Scraper ────────────────────────────────────────────────
let scraperRunning = false;

async function runScraper() {
  if (scraperRunning) { toast('A scrape is already in progress.', 'error'); return; }
  if (!S.config.scriptUrl) { toast('Set up the Apps Script URL first (Settings).', 'error'); return; }
  const country   = document.getElementById('sc-country')?.value || DEFAULT_COUNTRY;
  const region    = COUNTRY_REGION[country] || '';
  const city      = document.getElementById('sc-city')?.value   || '';
  const bv        = document.getElementById('sc-barrio')?.value || '';
  const [barrio, lat, lng] = bv.split('|');
  const kw        = document.getElementById('sc-kw')?.value     || '';
  const radius    = document.getElementById('sc-radius')?.value || '1000';
  const max       = parseInt(document.getElementById('sc-max')?.value || '100');
  const src       = document.getElementById('sc-source')?.value || 'Google Maps';
  const srcDetail = document.getElementById('sc-source-detail')?.value?.trim() || '';
  if (!lat || !lng) { toast('Select a neighborhood first.', 'error'); return; }

  scraperRunning = true;
  const btn      = document.getElementById('scraper-run-btn');
  const statusEl = document.getElementById('scraper-status');
  const rc = document.getElementById('scraper-result-card');
  if (rc) rc.style.display = 'none';
  if (btn)      { btn.disabled = true; btn.textContent = 'Scraping...'; }
  if (statusEl)   statusEl.textContent = 'Connecting to Apps Script...';

  try {
    const res = await sheetsCall({action:'scrape', keyword:kw, lat, lng, radius, maxResults:max, region});
    if (!res || !res.success || !res.leads) {
      const msg = res?.error || 'No response from the server';
      if (statusEl) statusEl.textContent = 'Error: ' + msg;
      toast('Scrape failed: ' + msg, 'error', 6000);
      scraperRunning = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Start scrape via Apps Script'; }
      return;
    }
    const now      = new Date().toISOString();
    const source   = srcDetail ? src + ' · ' + srcDetail : src;
    const existing = new Set(S.leads.map(l => phoneKey(l.phone)).filter(Boolean));

    // Attribution: provider/solo operators get credited as source of scraped leads
    const sess       = S.session;
    const isProvider = sess && (sess.role === 'provider' || sess.role === 'solo');
    const isCloser   = sess && (sess.role === 'closer'   || sess.role === 'solo');

    let added = 0;
    res.leads.forEach(r => {
      const pk = phoneKey(r.phone);
      if (r.phone && r.phone !== 'N/A' && pk && !existing.has(pk)) {
        const lead = {
          id:uid(), name:r.name||'No name', phone:r.phone, address:r.address||'N/A',
          website:r.website||'N/A', rating:r.rating||'N/A', reviews:r.reviews||'N/A',
          country, city: (r.cityReal ?? city), barrio: (r.neighborhood ?? barrio), keyword:kw, source, sourceDetail:srcDetail,
          lat: (r.lat ?? lat ?? ''), lng: (r.lng ?? lng ?? ''),
          status:'New', dncReason:'', followUpDate:'', notes:[],
          providerId:   isProvider ? sess.userId    : '',
          providerRate: isProvider ? (sess.providerRate || 0) : 0,
          closerId:     isCloser   ? sess.userId    : '',
          closerRate:   isCloser   ? (sess.closerRate   || 0) : 0,
          dealValue:'', providerCommission:'', closerCommission:'', commissionStatus:'',
          lockedBy:'', lockedUntil:'', assignedAt: isProvider ? now : '',
          workHistory:[], importedAt:now, updatedAt:now, _synced:false,
        };
        S.leads.push(lead);
        S.dirty.add(lead.id);
        existing.add(pk);
        added++;
      }
    });
    saveLocal();

    // Show result card
    if (statusEl) statusEl.textContent = '';
    const rc = document.getElementById('scraper-result-card');
    if (rc) {
      rc.style.display = 'block';
      rc.innerHTML = added > 0
        ? `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
             <div>
               <div style="font-size:20px;font-weight:600;color:var(--pos)">+${added}</div>
               <div style="font-size:11px;color:var(--body);margin-top:2px">leads added to the CRM</div>
             </div>
             <div style="color:var(--body);font-size:12px">${res.leads.length - added} duplicate${res.leads.length - added !== 1 ? 's' : ''} skipped</div>
             <button class="btn btn-ghost" style="font-size:12px;padding:5px 12px;margin-left:auto" onclick="navigate('leads')">View in Leads →</button>
           </div>`
        : `<div style="font-size:13px;color:var(--body)">No new leads — ${res.leads.length} found, all duplicates.</div>`;
    }

    // Persist scrape history (max 50 entries)
    if (!Array.isArray(S.scrapeHistory)) S.scrapeHistory = [];
    S.scrapeHistory.unshift({date:new Date().toISOString(), country, city, barrio, keyword:kw, found:res.leads.length, added});
    if (S.scrapeHistory.length > 50) S.scrapeHistory = S.scrapeHistory.slice(0,50);
    try { localStorage.setItem('aiv-scrape-history', JSON.stringify(S.scrapeHistory)); } catch(e) {}
    renderScrapeHistory();

    // Push new leads to Sheets — only mark synced on confirmed success;
    // failures stay unsynced + dirty so syncNow retries them.
    if (S.config.scriptUrl) {
      const nl = S.leads.filter(l => !l._synced);
      for (let i = 0; i < nl.length; i += 20) {
        const batch = nl.slice(i, i + 20);
        const r = await sheetsCall({action:'push', data:batch});
        if (r && r.success) batch.forEach(l => { l._synced = true; S.dirty.delete(l.id); });
      }
      saveLocal();
    }
    renderAll();
  } catch(ex) {
    if (statusEl) statusEl.textContent = 'Error: ' + ex.message;
  }
  scraperRunning = false;
  if (btn) { btn.disabled = false; btn.textContent = 'Start scrape via Apps Script'; }
}

function renderScrapeHistory() {
  const el = document.getElementById('scrape-history-list');
  if (!el) return;
  if (!S.scrapeHistory || !S.scrapeHistory.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--body)">No scrape history.</div>';
    return;
  }
  el.innerHTML = S.scrapeHistory.map(h =>
    `<div class="scrape-log-item">
      <span class="scrape-log-date">${fmtD(h.date)} ${fmtT(h.date)}</span>
      <span class="scrape-log-info">${esc([h.country, h.city, h.barrio, h.keyword].filter(Boolean).join(' · '))}</span>
      <span class="scrape-log-count">+${h.added}/${h.found}</span>
    </div>`
  ).join('');
}

function clearScrapeHistory() {
  if (!confirm('Clear scrape history?')) return;
  S.scrapeHistory = [];
  try { localStorage.removeItem('aiv-scrape-history'); } catch(e) {}
  renderScrapeHistory();
}
