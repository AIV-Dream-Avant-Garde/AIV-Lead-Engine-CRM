/* ── FEATURE: CSV export & CRM secret copy ───────────────── */

function getExportLeads() {
  const es   = document.getElementById('ex-st')?.value     || '';
  const eco  = document.getElementById('ex-country')?.value || '';
  const ec   = document.getElementById('ex-city')?.value   || '';
  const eb   = document.getElementById('ex-barrio')?.value || '';
  const esrc = document.getElementById('ex-source')?.value || '';
  const noph = document.getElementById('ex-noph')?.value   || 'no';
  return S.leads.filter(l => {
    if (es   && l.status  !== es)               return false;
    if (eco  && l.country !== eco)              return false;
    if (ec   && l.city    !== ec)               return false;
    if (eb   && l.barrio  !== eb)               return false;
    if (esrc && !l.source?.startsWith(esrc))    return false;
    if (noph === 'no' && (!l.phone || l.phone === 'N/A') && !l.email) return false; // keep email-only leads
    return true;
  });
}

function previewExport() {
  const leads = getExportLeads();
  if (!leads.length) { toast('No leads match these filters.', 'error'); return; }
  const hdrs  = ['name','phone','email','address','website','rating','country','city','barrio','keyword','source','sourceDetail','status','followUpDate'];
  const lines = [
    hdrs.join(','),
    ...leads.slice(0,5).map(l => hdrs.map(h => `"${(l[h]||'').toString().replace(/"/g,'""')}"`).join(',')),
  ];
  if (leads.length > 5) lines.push('... and ' + (leads.length - 5) + ' more');
  const ep = document.getElementById('ex-preview');
  if (ep) ep.textContent = lines.join('\n');
  document.getElementById('ex-wrap').style.display = 'block';
  const db = document.getElementById('ex-dl-btn');
  if (db) db.textContent = 'Download ' + leads.length + ' leads (CSV)';
}

function doExport() {
  const leads = getExportLeads();
  const hdrs  = ['name','phone','email','address','website','rating','reviews','country','city','barrio','keyword',
                  'source','sourceDetail','status','dncReason','followUpDate','importedAt','updatedAt',
                  'dealValue','collectedAmount','providerCommission','closerCommission','commissionStatus',
                  'providerName','closerName','callCount',
                  'refundAmount','refundReason','refundedAt'];
  const csv   = [
    hdrs.join(','),
    ...leads.map(l => {
      // Emit the commission amounts recorded on the lead at close time — NOT a
      // live recompute. Rates can change after a deal closes, and a recompute
      // would make the export disagree with what was actually recorded and paid.
      const enriched = {
        ...l,
        providerName: S.team.find(m => m.id === l.providerId)?.name || '',
        closerName:  S.team.find(m => m.id === l.closerId)?.name || '',
        callCount:   S.calls.filter(c => c.leadId === l.id).length,
      };
      return hdrs.map(h => {
        const v = enriched[h];                              // preserve a literal 0
        return `"${(v == null ? '' : v).toString().replace(/"/g,'""')}"`;
      }).join(',');
    }),
  ].join('\n');
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
  a.download = 'axius_leads_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}

function exportCommissions() {
  if (!S.commissions.length) { toast('No commissions recorded.', 'error'); return; }
  const hdrs = ['leadName','dealValue','collectedAmount',
                 'providerName','providerAmount','closerName','closerAmount','status','createdAt','paidAt','paidBy','paymentRef',
                 'refundReason','adjustedBy','adjustedAt'];
  const csv = [
    hdrs.join(','),
    ...S.commissions.map(c => {
      const clsr = S.team.find(m => m.id === c.closerId)?.name || c.closerName || '';
      return hdrs.map(h => {
        const v = h === 'closerName' ? clsr : (c[h] || '');
        return `"${String(v).replace(/"/g,'""')}"`;
      }).join(',');
    }),
  ].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
  a.download = 'axius_commissions_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}

function exportCalls() {
  if (!S.calls.length) { toast('No calls recorded.', 'error'); return; }
  const hdrs = ['leadName','phone','outcome','duration','notes','calledAt','consentConfirmed','callSid'];
  const csv = [
    hdrs.join(','),
    ...S.calls.map(c => hdrs.map(h => `"${String(c[h]||'').replace(/"/g,'""')}"`).join(',')),
  ].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
  a.download = 'axius_calls_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}

function copyCrmSecret() {
  const s = S.config.crmSecret || '';
  if (!s) { toast('Secret not generated yet. Reload the page.', 'error'); return; }
  navigator.clipboard.writeText(s).then(() => {
    const el = document.getElementById('crm-secret-display');
    if (el) { const orig = el.textContent; el.textContent = 'Copied!'; setTimeout(() => el.textContent = orig, 2000); }
  });
}

// Set this device's CRM secret to match the server (e.g. paste your main
// device's secret on a phone so it can authenticate + sync too).
function applyCrmSecret() {
  const el = document.getElementById('crm-secret-input');
  const v = (el && el.value || '').trim();
  if (v.length < 8) { toast('Paste the full CRM secret from your main device first.', 'error'); return; }
  S.config.crmSecret = v;
  saveLocal();
  const disp = document.getElementById('crm-secret-display');
  if (disp) disp.textContent = v;
  if (el) el.value = '';
  toast('Secret applied. Syncing this device…', 'success');
  if (typeof syncNow === 'function') syncNow();
}

// Rotate the CRM secret: generate a fresh value, show it, copy it. Sync stays
// broken until the matching CRM_SECRET Script property is updated + redeployed,
// so we warn clearly and copy it to the clipboard ready to paste.
function regenerateCrmSecret() {
  if (!confirm('Generate a NEW CRM secret?\n\nSync will fail until you paste the new value into the CRM_SECRET Script property and redeploy the Apps Script. Continue?')) return;
  const fresh = uid() + '-' + uid();
  S.config.crmSecret = fresh;
  saveLocal();
  const el = document.getElementById('crm-secret-display');
  if (el) el.textContent = fresh;
  navigator.clipboard.writeText(fresh).catch(() => {});
  toast('New secret generated + copied. Paste it into the CRM_SECRET Script property, then redeploy.', 'success', 8000);
}

function copyWebhookUrl() {
  const url = S.config.scriptUrl || '';
  if (!url) { toast('Save the Apps Script URL first.', 'error'); return; }
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.querySelector('[onclick="copyWebhookUrl()"]');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy URL', 2000); }
  });
}

function copyEl(elId, btnId, label) {
  const t = document.getElementById(elId)?.textContent || '';
  navigator.clipboard.writeText(t).then(() => {
    const b = document.getElementById(btnId);
    if (!b) return;
    b.textContent = 'Copied!';
    b.classList.add('copied');
    setTimeout(() => { b.textContent = label || 'Copy'; b.classList.remove('copied'); }, 2500);
  });
}
