/* ── FEATURE: State scrape campaigns (grid-tiling, runs until exhausted) ──────
   Launch a campaign for a whole state + industry; the server grinds through a
   grid of search tiles at up to `dailyCap` new leads/day per campaign, crawling
   each business's website for an email, until every tile is exhausted or you
   pause it. Reuses the daily scrape trigger.                                   */

function fillCampaignSelectors() {
  const st = document.getElementById('cmp-state');
  if (st) {
    const states = Object.keys(STATE_BOUNDS[DEFAULT_COUNTRY] || {});
    st.innerHTML = states.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  }
  const cat = document.getElementById('cmp-industry');
  if (cat) {
    const cats = Object.keys(KEYWORDS[DEFAULT_COUNTRY] || {});
    cat.innerHTML = cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  }
  fillCampaignBizTypes();
}

// Business type = a single keyword within the industry (e.g. "Dentist"), or all
// of them. Lets you grind just dentists across a whole state.
function fillCampaignBizTypes() {
  const sel = document.getElementById('cmp-biztype');
  if (!sel) return;
  const industry = document.getElementById('cmp-industry')?.value || '';
  const kws = KEYWORDS[DEFAULT_COUNTRY]?.[industry] || [];
  sel.innerHTML = `<option value="__all__">All in this industry (${kws.length})</option>`
    + kws.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
  updateCampaignPreview();
}

// The keywords a campaign will scrape: one business type, or the whole industry.
function campaignKeywords() {
  const industry = document.getElementById('cmp-industry')?.value || '';
  const biz      = document.getElementById('cmp-biztype')?.value || '__all__';
  const all      = KEYWORDS[DEFAULT_COUNTRY]?.[industry] || [];
  return biz === '__all__' ? all : [biz];
}

// Live preview of how big the grid is before launching.
function updateCampaignPreview() {
  const state  = document.getElementById('cmp-state')?.value;
  const radius = parseInt(document.getElementById('cmp-radius')?.value || '25000', 10);
  const bounds = STATE_BOUNDS[DEFAULT_COUNTRY]?.[state];
  const el = document.getElementById('cmp-preview');
  if (!el || !bounds) return;
  const g = campaignGrid(bounds, radius);
  const kws = campaignKeywords().length;
  el.textContent = `${g.count} tiles × ${kws} keyword${kws !== 1 ? 's' : ''} ≈ ${(g.count * kws).toLocaleString()} search points to grind through.`;
}

function launchStateCampaign() {
  if (!S.config.scriptUrl) { toast('Connect Apps Script first (Settings).', 'error'); return; }
  const state    = document.getElementById('cmp-state')?.value;
  const industry = document.getElementById('cmp-industry')?.value;
  const biz      = document.getElementById('cmp-biztype')?.value || '__all__';
  const radius   = parseInt(document.getElementById('cmp-radius')?.value || '25000', 10);
  const dailyCap = parseInt(document.getElementById('cmp-cap')?.value || '100', 10);
  const bounds   = STATE_BOUNDS[DEFAULT_COUNTRY]?.[state];
  const keywords = campaignKeywords();
  if (!bounds || !keywords.length) { toast('Pick a state and industry.', 'error'); return; }

  const target = biz === '__all__' ? industry : biz;     // what we're targeting
  const name   = `${state} · ${target}`;
  // One campaign per (state, target) — relaunching resumes rather than dupes.
  if (S.stateCampaigns.some(c => c.name === name && !c.exhausted)) {
    toast(`A “${name}” campaign already exists — resume it below instead.`, 'warning'); return;
  }
  const g = campaignGrid(bounds, radius);
  const campaign = {
    id: uid(),
    name,
    state, industry, businessType: biz === '__all__' ? '' : biz,
    region: COUNTRY_REGION[DEFAULT_COUNTRY] || 'us',
    bounds, radius, rows: g.rows, cols: g.cols, tileCount: g.count,
    keywords,
    dailyCap,
    cursor: 0,                 // linear index into tile×keyword space
    active: true, exhausted: false,
    leadsFound: 0, lastRunAt: '', createdAt: new Date().toISOString(),
  };
  S.stateCampaigns.push(campaign);
  saveCampaigns();
  // Make sure the daily engine is on so the campaign actually runs.
  if (typeof setTrigger === 'function') setTrigger('runScheduledScrapes', true);
  toast(`Launched “${campaign.name}” — ${g.count} tiles. It will scrape up to ${dailyCap}/day until done.`, 'success', 6000);
  renderCampaigns();
}

function saveCampaigns() {
  saveLocal();
  durableSave({ action: 'saveStateCampaigns', data: S.stateCampaigns }, 'Campaign', 'stateCampaigns');
}

function toggleCampaign(id) {
  const c = S.stateCampaigns.find(x => x.id === id);
  if (!c) return;
  c.active = !c.active;
  saveCampaigns();
  toast(c.active ? 'Campaign resumed.' : 'Campaign paused.', c.active ? 'success' : 'warning');
  renderCampaigns();
}

function deleteCampaign(id) {
  if (!confirm('Delete this campaign? Progress is lost, but scraped leads stay.')) return;
  S.stateCampaigns = S.stateCampaigns.filter(x => x.id !== id);
  saveCampaigns();
  renderCampaigns();
}

function renderCampaigns() {
  const el = document.getElementById('campaign-list');
  if (!el) return;
  if (!S.stateCampaigns.length) {
    el.innerHTML = '<div class="notes-empty">No state campaigns yet. Launch one above to auto-scrape an entire state.</div>';
    return;
  }
  const anyActive = S.stateCampaigns.some(c => c.active && !c.exhausted);
  const runHdr = anyActive
    ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px;font-size:11px;color:var(--sub)">
        <span>Campaigns scrape automatically each morning (6am ET). Want results now?</span>
        <button class="btn btn-primary btn-sm run-scrapes-btn" onclick="runScrapesNow()">▶ Run now</button>
      </div>`
    : '';
  el.innerHTML = runHdr + S.stateCampaigns.map(c => {
    const total   = (c.tileCount || 0) * (c.keywords?.length || 1);
    const pct      = total ? Math.min(100, Math.round((c.cursor || 0) / total * 100)) : 0;
    const status   = c.exhausted ? '<span style="color:var(--pos)">Complete</span>'
                   : c.active    ? '<span style="color:var(--accent)">Running</span>'
                   :               '<span style="color:var(--amber)">Paused</span>';
    return `<div class="card" style="margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-weight:600;color:var(--hl)">${esc(c.name)} · ${status}</div>
          <div style="font-size:11px;color:var(--body);margin-top:3px;font-family:'Geist Mono',monospace">
            ${c.leadsFound || 0} leads found · ${pct}% of grid swept · ${c.dailyCap}/day · ${c.tileCount} tiles${c.lastRunAt ? ' · last run ' + fmtD(c.lastRunAt) : ''}
          </div>
          <div class="storage-bar-wrap" style="margin-top:7px;width:240px;max-width:60vw"><div class="storage-bar-fill" style="width:${pct}%"></div></div>
        </div>
        <div style="display:flex;gap:6px">
          ${c.exhausted ? '' : `<button class="btn btn-ghost btn-sm" onclick="toggleCampaign('${c.id}')">${c.active ? 'Pause' : 'Resume'}</button>`}
          <button class="btn btn-ghost btn-xs" onclick="deleteCampaign('${c.id}')">Delete</button>
        </div>
      </div>
    </div>`;
  }).join('');
}
