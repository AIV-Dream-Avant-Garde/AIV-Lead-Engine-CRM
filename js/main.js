/* ── MAIN: navigate, renderAll, keyboard shortcuts, init ──── */

// ── Filter / badge helpers shared across sections ──────────
function populateFilters() {
  const cities    = [...new Set(S.leads.map(l => l.city).filter(Boolean))].sort();
  const barrios   = [...new Set(S.leads.map(l => l.barrio).filter(Boolean))].sort();
  const sources   = [...new Set(S.leads.map(l => l.source ? l.source.split(' · ')[0] : '').filter(Boolean))].sort();
  const countries = [...new Set(S.leads.map(l => l.country).filter(Boolean))].sort();

  const fillSel = (id, vals, def) => {
    const s = document.getElementById(id);
    if (!s) return;
    const cur  = s.value;
    s.innerHTML = `<option value="">${def}</option>` + vals.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if (vals.includes(cur)) s.value = cur;
  };

  // Leads table: country filter + city list narrowed to the selected country
  fillSel('f-country', countries, 'All countries');
  const fcountry = document.getElementById('f-country')?.value || '';
  const fCities  = fcountry
    ? [...new Set(S.leads.filter(l => l.country === fcountry).map(l => l.city).filter(Boolean))].sort()
    : cities;
  fillSel('f-city',    fCities, 'All cities');

  fillSel('f-barrio',  barrios, 'All neighborhoods');
  fillSel('f-source',  sources, 'All sources');
  fillSel('kb-city',   cities,  'All cities');
  fillSel('ex-country', countries, 'All');
  fillSel('ex-city',   cities,  'All');
  fillSel('ex-barrio', barrios, 'All');
  fillSel('ex-source', sources, 'All');

  const cp = document.getElementById('admin-comm-person');
  if (cp) {
    const cv = cp.value;
    cp.innerHTML = '<option value="">All members</option>' +
      (S.team||[]).map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
    if (cv) cp.value = cv;
  }
}

function updateBadges() {
  const byStatus = st => S.leads.filter(l => (l.status || 'New') === st).length;
  const setEl    = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

  setEl('nav-leads-badge', S.leads.length);
  setEl('tb-leads-pill',   S.leads.length + ' leads');
  setEl('nav-calls-badge', S.calls.length);
  // "Respond now" urgency badge — only shows when leads are waiting.
  const rc = (typeof responderCount === 'function') ? responderCount() : 0;
  const rb = document.getElementById('nav-responder-badge');
  if (rb) { rb.textContent = rc; rb.style.display = rc > 0 ? '' : 'none'; }
  setEl('st-total', S.leads.length);
  setEl('st-new',   byStatus('New'));
  setEl('st-cont',  byStatus('Contacted'));
  setEl('st-int',   byStatus('Interested'));
  setEl('st-clos',  byStatus('Closed Won'));
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
  if (document.getElementById('sec-pipeline')?.classList.contains('active')) renderPipeline();
  if (document.getElementById('sec-analytics')?.classList.contains('active')) renderAnalytics();
  if (document.getElementById('sec-perfil')?.classList.contains('active')) renderPerfil();
  if (document.getElementById('sec-responder')?.classList.contains('active')) renderResponder();
}

// ── Mobile off-canvas sidebar ──────────────────────────────
function toggleSidebar(force) {
  const open = force === undefined ? !document.body.classList.contains('sb-open') : !!force;
  document.body.classList.toggle('sb-open', open);
}

// ── navigate — consolidated (all section logic merged) ─────
function navigate(id) {
  document.body.classList.remove('sb-open');   // close the mobile drawer on navigation
  document.querySelectorAll('.section').forEach(s  => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('sec-' + id)?.classList.add('active');
  document.querySelector(`.nav-item[data-sec="${id}"]`)?.classList.add('active');

  const labels = {
    setup:'Setup', scraper:'Scraper', import:'Import', responder:'Respond Now', leads:'Leads',
    pipeline:'Pipeline', llamadas:'Calls', export:'Export',
    perfil:'My Profile', admin:'Admin', analytics:'Analytics',
  };
  const el = document.getElementById('tb-section');
  if (el) el.textContent = labels[id] || id;

  if (id === 'pipeline')  renderPipeline();
  if (id === 'analytics') renderAnalytics();
  if (id === 'responder') renderResponder();
  if (id === 'leads')     { S.page = 1; renderTable(); }
  if (id === 'llamadas')  renderCallsSection();
  if (id === 'perfil')    renderPerfil();
  if (id === 'admin') {
    if (S.session?.role !== 'admin') { toast('Access restricted.', 'error'); navigate('leads'); return; }
    renderAdmin();
  }
  if (id === 'scraper') {
    fillCountries('sc-country'); onCountryChange(); fillSources('sc-source');
    renderScrapeHistory();
    // Scheduled-scrape panel now lives here (moved from Admin): init its form + jobs.
    if (typeof initAdminJobsForm === 'function') initAdminJobsForm();
    if (typeof renderScheduledJobs === 'function') renderScheduledJobs();
    if (typeof checkTriggerStatus === 'function') checkTriggerStatus();
    // Render the dark map once the section is visible/sized.
    setTimeout(() => { if (typeof renderScraperMap === 'function') renderScraperMap(); }, 80);
  }
  if (id === 'import') {
    fillCountries('imp-country'); onImpCountryChange(); fillSources('imp-source');
  }
  if (id === 'setup') {
    setTimeout(() => {
      const cfg = S.config;
      const setCfgEl = (eid, v) => { const el2 = document.getElementById(eid); if (el2) el2.value = v || ''; };
      setCfgEl('cfg-admin-name', cfg.adminName      || '');
      setCfgEl('cfg-company',    cfg.companyName    || '');
      setCfgEl('cfg-booking',    cfg.bookingUrl     || '');
      setCfgEl('cfg-script',     cfg.callScript     || '');
      setCfgEl('cfg-pitch',      cfg.pitchScript    || '');
      setCfgEl('cfg-objections', cfg.objectionsScript || '');
      setCfgEl('cfg-close',      cfg.closeScript    || '');
      const hp = document.getElementById('cfg-hide-pinplain'); if (hp) hp.checked = !!cfg.hidePinPlain;
      const rc = document.getElementById('cfg-require-consent'); if (rc) rc.checked = !!cfg.requireConsentClick;
    }, 150);
  }
  if (id === 'leads') auditLog('viewLeads', '', '');
}

// ── Keyboard shortcuts ─────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!S.session) return;

  // ── Call-widget shortcuts: while a call is up, it owns the keyboard ──
  if (document.getElementById('call-widget')?.classList.contains('visible')) {
    const cwPost = document.getElementById('cw-post')?.classList.contains('visible');
    const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName || '');
    if (e.key === 'Escape') { e.preventDefault(); if (cwPost && typeof discardCall === 'function') discardCall(); else hangUp(); return; }
    if (cwPost) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); saveCallLog(!!S.dialerMode); return; }
      if (!typing) {
        if (typeof CALL_OUTCOME_KEYS !== 'undefined' && CALL_OUTCOME_KEYS[e.key]) { e.preventDefault(); setOutcome(CALL_OUTCOME_KEYS[e.key]); return; }
        if (e.key === 'Enter') { e.preventDefault(); saveCallLog(!!S.dialerMode); return; }
      }
    }
    return; // don't let other shortcuts (sync/next/?) fire mid-call
  }

  if (e.key === 'Escape') {
    if (S.curLeadId) closeModal();
    if (document.getElementById('deal-overlay')?.classList.contains('open'))
      document.getElementById('deal-overlay').classList.remove('open');
    if (document.getElementById('delete-confirm')?.classList.contains('visible'))
      document.getElementById('delete-confirm').classList.remove('visible');
    const sm = document.getElementById('shortcuts-modal');
    if (sm) sm.remove();
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && S.curLeadId) { e.preventDefault(); saveLead(); return; }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (S.curLeadId) return; // modal open — shortcuts disabled
  const section = document.querySelector('.section.active')?.id;
  if ((e.key === 'n' || e.key === 'N') && section === 'sec-leads') goNextLead();
  if (e.key === 's' || e.key === 'S') syncNow();
  if (e.key === '?') { showShortcutsModal(); return; }
  if (e.key === 'Escape' && document.getElementById('call-widget')?.classList.contains('visible')) hangUp();
});

function showShortcutsModal() {
  const existing = document.getElementById('shortcuts-modal');
  if (existing) { existing.remove(); return; }
  const el = document.createElement('div');
  el.id = 'shortcuts-modal';
  el.className = 'shortcuts-modal';
  el.innerHTML = `<div class="shortcuts-inner">
    <div class="shortcuts-title">Keyboard shortcuts <span class="shortcuts-close" onclick="this.closest('#shortcuts-modal').remove()">×</span></div>
    <table class="shortcuts-table">
      <tr><td><kbd>?</kbd></td><td>Show / hide this panel</td></tr>
      <tr><td><kbd>N</kbd></td><td>Next available lead</td></tr>
      <tr><td><kbd>S</kbd></td><td>Sync with Google Sheets</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Close modal / overlay</td></tr>
      <tr><td><kbd>Ctrl+Enter</kbd></td><td>Save lead (inside the modal)</td></tr>
    </table>
  </div>`;
  document.body.appendChild(el);
}

// ── Single clean init — replaces all stage1/stage2/stage3 inits ─
(function init() {
  // 1. Load all data from localStorage
  loadLocal();
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
  setSyncUI('', S.config.scriptUrl ? 'Ready to sync' : 'Connect Apps Script in Setup');

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

  // 5b. Background poll → near-real-time reply alerts. When logged in + connected,
  // pull every 75s (incremental); new inbound replies fire a notification (inbox.js).
  setInterval(() => {
    if (S.session && S.config.scriptUrl && !S.isSyncing && !document.hidden) syncNow();
  }, 75000);

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

  // 8. Restore session (same tab, e.g. on refresh) — tamper-evident + role re-derived
  restoreSession();
})();
