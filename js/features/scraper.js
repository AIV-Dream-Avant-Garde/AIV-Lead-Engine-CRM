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
  if (scraperRunning) { alert('Hay un scrape en curso.'); return; }
  if (!S.config.scriptUrl) { alert('Configura el Apps Script URL primero.'); return; }
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
  if (!lat || !lng) { alert('Selecciona un barrio primero.'); return; }

  scraperRunning = true;
  const btn      = document.getElementById('scraper-run-btn');
  const statusEl = document.getElementById('scraper-status');
  const rc = document.getElementById('scraper-result-card');
  if (rc) rc.style.display = 'none';
  if (btn)      { btn.disabled = true; btn.textContent = 'Scrapeando...'; }
  if (statusEl)   statusEl.textContent = 'Conectando con Apps Script...';

  try {
    const res = await sheetsCall({action:'scrape', keyword:kw, lat, lng, radius, maxResults:max, region});
    if (!res || !res.success || !res.leads) {
      if (statusEl) statusEl.textContent = 'Error: ' + (res?.error || 'Sin respuesta');
      scraperRunning = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Iniciar scrape via Apps Script'; }
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
          id:uid(), name:r.name||'Sin nombre', phone:r.phone, address:r.address||'N/A',
          website:r.website||'N/A', rating:r.rating||'N/A', reviews:r.reviews||'N/A',
          country, city, barrio, keyword:kw, source, sourceDetail:srcDetail,
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
               <div style="font-size:11px;color:var(--body);margin-top:2px">leads añadidos al CRM</div>
             </div>
             <div style="color:var(--body);font-size:12px">${res.leads.length - added} duplicado${res.leads.length - added !== 1 ? 's' : ''} omitido${res.leads.length - added !== 1 ? 's' : ''}</div>
             <button class="btn btn-ghost" style="font-size:12px;padding:5px 12px;margin-left:auto" onclick="navigate('leads')">Ver en Leads →</button>
           </div>`
        : `<div style="font-size:13px;color:var(--body)">Sin leads nuevos — ${res.leads.length} encontrados, todos duplicados.</div>`;
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
  if (btn) { btn.disabled = false; btn.textContent = 'Iniciar scrape via Apps Script'; }
}

function renderScrapeHistory() {
  const el = document.getElementById('scrape-history-list');
  if (!el) return;
  if (!S.scrapeHistory || !S.scrapeHistory.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--body)">Sin historial de scrapes.</div>';
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
  if (!confirm('¿Borrar historial de scrapes?')) return;
  S.scrapeHistory = [];
  try { localStorage.removeItem('aiv-scrape-history'); } catch(e) {}
  renderScrapeHistory();
}
