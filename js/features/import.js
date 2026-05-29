/* ── FEATURE: CSV import with field mapper ───────────────── */

// ── Dropzone setup (called once from init) ─────────────────
function initDropzone() {
  const dz = document.getElementById('dropzone');
  if (!dz) return;
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', ()  => dz.classList.remove('drag'));
  dz.addEventListener('drop',      e  => {
    e.preventDefault();
    dz.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f) processCSV(f);
  });
}

function handleFile(e) {
  const f = e.target.files[0];
  if (f) processCSV(f);
  e.target.value = '';
}

// ── CSV mapper flow ────────────────────────────────────────
// ── Pure CSV helpers (unit-tested in tests/cases.js) ───────────────────
// Parse raw CSV text → { headers, rows }. Keeps any non-empty data row;
// does NOT require a column literally named "name" (columns are mapped
// afterward), so a 'nombre'/'Phone'/etc. header never yields a false "empty".
function parseCSV(text) {
  const lines = String(text || '').replace(/\r\n/g,'\n').replace(/\r/g,'\n').trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = splitCSV(lines[0]).map(h => h.toLowerCase().trim());
  const rows = lines.slice(1)
    .map(line => { const vals = splitCSV(line); const obj = {}; headers.forEach((h,i) => obj[h] = (vals[i]||'').trim()); return obj; })
    .filter(r => Object.values(r).some(v => v && v.trim() !== ''));
  return { headers, rows };
}

// Auto-detect which CRM field each header maps to (Spanish + English aliases).
function autoMapHeaders(headers) {
  const autoMap = {};
  (headers || []).forEach(h => {
    const norm = h.replace(/[^a-z]/g,'');
    if (norm === 'nombre' || norm === 'name')    autoMap[h] = 'name';
    if (norm === 'telefono' || norm === 'phone' || norm === 'celular' || norm === 'movil' || norm === 'mobile') autoMap[h] = 'phone';
    if (norm === 'direccion' || norm === 'address') autoMap[h] = 'address';
    if (norm === 'website' || norm === 'web' || norm === 'sitioweb') autoMap[h] = 'website';
    if (norm === 'rating' || norm === 'calificacion') autoMap[h] = 'rating';
    if (norm === 'resenas' || norm === 'reviews' || norm === 'opiniones') autoMap[h] = 'reviews';
  });
  return autoMap;
}

function processCSV(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    const { headers, rows } = parseCSV(ev.target.result);
    if (!rows.length) { toast('CSV sin filas de datos.', 'error'); return; }

    const autoMap = autoMapHeaders(headers);
    // Warn (non-blocking) if neither key field was auto-detected — guides manual mapping.
    const detected = new Set(Object.values(autoMap));
    if (!detected.has('name') && !detected.has('phone')) {
      toast('No se detectaron columnas Nombre/Teléfono — asígnalas manualmente abajo antes de importar.', 'error', 7000);
    }

    const mapperEl = document.getElementById('csv-mapper-rows');
    if (mapperEl) {
      mapperEl.innerHTML = headers.map(h => {
        const preview = rows[0]?.[h] || '';
        return `<div class="mapper-row">
          <span class="mapper-col">${esc(h)}</span>
          <span class="mapper-arrow">→</span>
          <select class="mapper-sel" data-col="${esc(h)}">
            <option value="">— ignorar —</option>
            ${CRM_FIELDS.map(fld => `<option value="${fld}"${autoMap[h]===fld?' selected':''}>${CRM_FIELD_LABELS[fld]}</option>`).join('')}
          </select>
          <span class="mapper-preview">${esc(preview)}</span>
        </div>`;
      }).join('');
    }

    const ex    = new Set(S.leads.map(l => l.phone).filter(Boolean));
    const total = rows.length;
    const dupes = rows.filter(r => r.phone && ex.has(r.phone)).length;
    S.pendingImport = rows;
    const sumEl = document.getElementById('imp-summary');
    if (sumEl) sumEl.textContent = total + ' filas — ' + (total - dupes) + ' nuevas, ' + dupes + ' duplicadas';
    const previewEl = document.getElementById('import-preview');
    if (previewEl) previewEl.style.display = 'block';
    const dz = document.getElementById('dropzone');
    if (dz) dz.style.display = 'none';
  };
  reader.readAsText(file, 'utf-8');
}

function splitCSV(line) {
  const res = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) { res.push(cur); cur = ''; }
    else cur += c;
  }
  res.push(cur);
  return res;
}

function applyMapping(rows) {
  const selects = document.querySelectorAll('#csv-mapper-rows .mapper-sel');
  const mapping = {};
  selects.forEach(sel => { if (sel.value) mapping[sel.dataset.col] = sel.value; });
  return rows.map(r => {
    const obj = {};
    Object.entries(mapping).forEach(([col, fld]) => { obj[fld] = r[col] || ''; });
    return obj;
  });
}

async function confirmImport() {
  if (!S.pendingImport) return;
  const country   = document.getElementById('imp-country')?.value || DEFAULT_COUNTRY;
  const city      = document.getElementById('imp-city')?.value    || '';
  const bv        = document.getElementById('imp-barrio')?.value  || '';
  const barrio    = bv.split('|')[0];
  const kw        = document.getElementById('imp-kw')?.value      || '';
  const src       = document.getElementById('imp-source')?.value  || 'Manual';
  const srcDetail = document.getElementById('imp-source-detail')?.value?.trim() || '';
  const source    = srcDetail ? src + ' · ' + srcDetail : src;
  const now       = new Date().toISOString();

  const providerId   = ['provider','solo','admin'].includes(S.session?.role) ? (S.session.userId || '') : '';
  const providerRate = S.session?.providerRate || 0;

  const mapped = applyMapping(S.pendingImport);
  const ex = new Set(S.leads.map(l => l.phone).filter(Boolean));
  const toAdd = mapped
    .filter(r => r.phone && r.phone !== 'N/A' && !ex.has(r.phone))
    .map(r => ({
      id:uid(), name:r.name||'Sin nombre', phone:r.phone||'N/A',
      address:r.address||'N/A', website:r.website||'N/A',
      rating:r.rating||'N/A', reviews:r.reviews||'N/A',
      country, city, barrio, keyword:kw, source, sourceDetail:srcDetail,
      status:'Nuevo', providerId, providerRate,
      closerId:'', closerRate:0, dealValue:'',
      providerCommission:'', closerCommission:'', commissionStatus:'',
      lockedBy:'', lockedUntil:'', assignedAt:'',
      workHistory:[], dncReason:'', followUpDate:'', notes:[],
      importedAt:now, updatedAt:now, _synced:false,
    }));

  toAdd.forEach(l => S.dirty.add(l.id));
  S.leads.push(...toAdd);
  saveLocal();

  if (S.config.scriptUrl) {
    setSyncUI('syncing','Guardando...');
    let failed = 0;
    for (let i = 0; i < toAdd.length; i += 20) {
      const batch = toAdd.slice(i, i + 20);
      const r = await sheetsCall({action:'push', data:batch});
      if (r && r.success) batch.forEach(l => { l._synced = true; S.dirty.delete(l.id); });
      else failed += batch.length;   // stays unsynced + dirty → retried by syncNow
    }
    saveLocal();
    if (failed > 0) { setSyncUI('error', failed + ' sin sincronizar'); toast(failed + ' lead(s) se guardaron localmente; se reintentarán al sincronizar.', 'error', 6000); }
    else { setSyncUI('ok','Sincronizado'); setLastSynced(); }
  }

  toast(toAdd.length + ' leads importados.', 'success');
  cancelImport();
  renderAll();
  navigate('leads');
}

function cancelImport() {
  S.pendingImport = null;
  const previewEl = document.getElementById('import-preview');
  if (previewEl) previewEl.style.display = 'none';
  const dz = document.getElementById('dropzone');
  if (dz) dz.style.display = '';
}
