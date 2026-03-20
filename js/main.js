/* ── MAIN: navigate, renderAll, keyboard shortcuts, init ──── */

// ── Filter / badge helpers shared across sections ──────────
function populateFilters() {
  const cities  = [...new Set(S.leads.map(l => l.city).filter(Boolean))].sort();
  const barrios = [...new Set(S.leads.map(l => l.barrio).filter(Boolean))].sort();
  const sources = [...new Set(S.leads.map(l => l.source ? l.source.split(' · ')[0] : '').filter(Boolean))].sort();

  const fillSel = (id, vals, def) => {
    const s = document.getElementById(id);
    if (!s) return;
    const cur  = s.value;
    s.innerHTML = `<option value="">${def}</option>` + vals.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if (vals.includes(cur)) s.value = cur;
  };

  fillSel('f-city',    cities,  'Todas las ciudades');
  fillSel('f-barrio',  barrios, 'Todos los barrios');
  fillSel('f-source',  sources, 'Todas las fuentes');
  fillSel('kb-city',   cities,  'Todas las ciudades');
  fillSel('ex-city',   cities,  'Todas');
  fillSel('ex-barrio', barrios, 'Todos');
  fillSel('ex-source', sources, 'Todas');

  const cp = document.getElementById('admin-comm-person');
  if (cp) {
    const cv = cp.value;
    cp.innerHTML = '<option value="">Todos los miembros</option>' +
      (S.team||[]).map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
    if (cv) cp.value = cv;
  }
}

function updateBadges() {
  const byStatus = st => S.leads.filter(l => (l.status || 'Nuevo') === st).length;
  const setEl    = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

  setEl('nav-leads-badge', S.leads.length);
  setEl('tb-leads-pill',   S.leads.length + ' leads');
  setEl('nav-calls-badge', S.calls.length);
  setEl('st-total', S.leads.length);
  setEl('st-new',   byStatus('Nuevo'));
  setEl('st-cont',  byStatus('Contactado'));
  setEl('st-int',   byStatus('Interesado'));
  setEl('st-clos',  byStatus('Cerrado'));
}

// ── renderAll — single consolidated render ─────────────────
function renderAll() {
  renderTable();
  populateFilters();
  updateBadges();
  checkStorage();
  updatePerfilBadge();
  updateAdminBadge();
  applyAdminNavVisibility();
}

// ── navigate — consolidated (all section logic merged) ─────
function navigate(id) {
  document.querySelectorAll('.section').forEach(s  => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('sec-' + id)?.classList.add('active');
  document.querySelector(`.nav-item[data-sec="${id}"]`)?.classList.add('active');

  const labels = {
    setup:'Setup', scraper:'Scraper', import:'Importar', leads:'Leads',
    pipeline:'Pipeline', llamadas:'Llamadas', export:'Exportar',
    perfil:'Mi Perfil', admin:'Admin',
  };
  const el = document.getElementById('tb-section');
  if (el) el.textContent = labels[id] || id;

  if (id === 'pipeline')  renderPipeline();
  if (id === 'leads')     { S.page = 1; renderTable(); }
  if (id === 'llamadas')  renderCallsSection();
  if (id === 'perfil')    renderPerfil();
  if (id === 'admin') {
    if (S.session?.role !== 'admin') { alert('Acceso restringido.'); navigate('leads'); return; }
    renderAdmin();
  }
  if (id === 'scraper') {
    fillCities('sc-city'); onCityChange(); fillCats('sc-cat','sc-kw'); fillSources('sc-source');
    renderScrapeHistory();
  }
  if (id === 'import') {
    fillCities('imp-city'); onImpCityChange(); fillCats('imp-cat','imp-kw'); fillSources('imp-source');
  }
  if (id === 'setup') {
    setTimeout(() => {
      const cfg = S.config;
      const setCfgEl = (eid, v) => { const el2 = document.getElementById(eid); if (el2) el2.value = v || ''; };
      setCfgEl('cfg-company',    cfg.companyName    || '');
      setCfgEl('cfg-script',     cfg.callScript     || '');
      setCfgEl('cfg-pitch',      cfg.pitchScript    || '');
      setCfgEl('cfg-objections', cfg.objectionsScript || '');
      setCfgEl('cfg-close',      cfg.closeScript    || '');
    }, 150);
  }
  if (id === 'leads') auditLog('viewLeads', '', '');
}

// ── Keyboard shortcuts ─────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!S.session) return;
  if (e.key === 'Escape') {
    if (S.curLeadId) closeModal();
    if (document.getElementById('deal-overlay')?.classList.contains('open'))
      document.getElementById('deal-overlay').classList.remove('open');
    if (document.getElementById('delete-confirm')?.classList.contains('visible'))
      document.getElementById('delete-confirm').classList.remove('visible');
  }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (S.curLeadId) return; // modal open — shortcuts disabled
  const section = document.querySelector('.section.active')?.id;
  if ((e.key === 'n' || e.key === 'N') && section === 'sec-leads') goNextLead();
  if (e.key === 's' || e.key === 'S') syncNow();
  if (e.key === 'Escape' && document.getElementById('call-widget')?.classList.contains('visible')) hangUp();
});

// ── Single clean init — replaces all stage1/stage2/stage3 inits ─
(function init() {
  // 1. Load all data from localStorage
  loadLocal();
  try { S.team        = JSON.parse(localStorage.getItem('aiv-team')           || '[]'); } catch(e) { S.team=[]; }
  try { S.commissions = JSON.parse(localStorage.getItem('aiv-comm')           || '[]'); } catch(e) { S.commissions=[]; }
  try { S.auditLog    = JSON.parse(localStorage.getItem('aiv-audit')          || '[]'); } catch(e) { S.auditLog=[]; }
  try { S.scrapeHistory = JSON.parse(localStorage.getItem('aiv-scrape-history') || '[]'); } catch(e) { S.scrapeHistory=[]; }

  // 2. Generate per-installation CSRF secret on first run
  if (!S.config.crmSecret) {
    S.config.crmSecret = uid() + '-' + uid();
    saveLocal();
  }

  // 3. Populate Setup UI
  const cfgUrlEl = document.getElementById('cfg-url');
  if (cfgUrlEl && S.config.scriptUrl) cfgUrlEl.value = S.config.scriptUrl;
  setSyncUI('', S.config.scriptUrl ? 'Listo para sincronizar' : 'Conecta Apps Script en Setup');

  const secretEl = document.getElementById('crm-secret-display');
  if (secretEl && S.config.crmSecret) secretEl.textContent = S.config.crmSecret;

  const webhookEl = document.getElementById('webhook-url-display');
  if (webhookEl && S.config.scriptUrl) webhookEl.value = S.config.scriptUrl;

  // 4. Wire sidebar navigation
  document.querySelectorAll('.nav-item[data-sec]').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.sec));
  });

  // 5. Initialize dropzone
  initDropzone();

  // 6. Initial render
  checkStorage();
  renderAll();

  // 7. Deferred: populate call script fields in Setup
  setTimeout(() => {
    const cfg = S.config;
    const setCfgEl = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setCfgEl('cfg-company',    cfg.companyName     || '');
    setCfgEl('cfg-script',     cfg.callScript      || '');
    setCfgEl('cfg-pitch',      cfg.pitchScript     || '');
    setCfgEl('cfg-objections', cfg.objectionsScript || '');
    setCfgEl('cfg-close',      cfg.closeScript     || '');
    renderScrapeHistory();
  }, 400);

  // 8. Restore session (same tab, e.g. on refresh)
  const saved = sessionStorage.getItem('aiv-session');
  if (saved) {
    try {
      const sess = JSON.parse(saved);
      if (sess.role === 'admin') {
        startSession(sess);
      } else {
        const member = S.team.find(m => m.id === sess.userId && String(m.active) !== 'false');
        if (member) startSession(sess);
        else { sessionStorage.removeItem('aiv-session'); updatePinDots(); }
      }
    } catch(e) { updatePinDots(); }
  } else {
    updatePinDots();
  }
})();
