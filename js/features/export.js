/* ── FEATURE: CSV export & CRM secret copy ───────────────── */

function getExportLeads() {
  const es   = document.getElementById('ex-st')?.value     || '';
  const ec   = document.getElementById('ex-city')?.value   || '';
  const eb   = document.getElementById('ex-barrio')?.value || '';
  const esrc = document.getElementById('ex-source')?.value || '';
  const noph = document.getElementById('ex-noph')?.value   || 'no';
  return S.leads.filter(l => {
    if (es   && l.status  !== es)               return false;
    if (ec   && l.city    !== ec)               return false;
    if (eb   && l.barrio  !== eb)               return false;
    if (esrc && !l.source?.startsWith(esrc))    return false;
    if (noph === 'no' && (!l.phone || l.phone === 'N/A')) return false;
    return true;
  });
}

function previewExport() {
  const leads = getExportLeads();
  if (!leads.length) { alert('Sin leads con estos filtros.'); return; }
  const hdrs  = ['name','phone','address','website','rating','city','barrio','keyword','source','sourceDetail','status','followUpDate'];
  const lines = [
    hdrs.join(','),
    ...leads.slice(0,5).map(l => hdrs.map(h => `"${(l[h]||'').toString().replace(/"/g,'""')}"`).join(',')),
  ];
  if (leads.length > 5) lines.push('... y ' + (leads.length - 5) + ' mas');
  const ep = document.getElementById('ex-preview');
  if (ep) ep.textContent = lines.join('\n');
  document.getElementById('ex-wrap').style.display = 'block';
  const db = document.getElementById('ex-dl-btn');
  if (db) db.textContent = 'Descargar ' + leads.length + ' leads (CSV)';
}

function doExport() {
  const leads = getExportLeads();
  const hdrs  = ['name','phone','address','website','rating','reviews','city','barrio','keyword',
                  'source','sourceDetail','status','dncReason','followUpDate','importedAt','updatedAt',
                  'dealValue','collectedAmount','providerCommission','closerCommission','commissionStatus',
                  'providerName','closerName','callCount',
                  'refundAmount','refundReason','refundedAt'];
  const csv   = [
    hdrs.join(','),
    ...leads.map(l => {
      const {providerAmount, closerAmount} = l.dealValue ? calcCommissions(l, parseFloat(l.dealValue)) : {providerAmount:0, closerAmount:0};
      const enriched = {
        ...l,
        providerCommission: providerAmount || '',
        closerCommission:   closerAmount   || '',
        providerName: S.team.find(m => m.id === l.providerId)?.name || '',
        closerName:   S.team.find(m => m.id === l.closerId)?.name   || '',
        callCount:    S.calls.filter(c => c.leadId === l.id).length,
      };
      return hdrs.map(h => `"${(enriched[h]||'').toString().replace(/"/g,'""')}"`).join(',');
    }),
  ].join('\n');
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
  a.download = 'aiv_leads_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}

function copyCrmSecret() {
  const s = S.config.crmSecret || '';
  if (!s) { alert('Secreto no generado aún. Recarga la página.'); return; }
  navigator.clipboard.writeText(s).then(() => {
    const el = document.getElementById('crm-secret-display');
    if (el) { const orig = el.textContent; el.textContent = 'Copiado!'; setTimeout(() => el.textContent = orig, 2000); }
  });
}

function copyWebhookUrl() {
  const url = S.config.scriptUrl || '';
  if (!url) { alert('Guarda la URL del Apps Script primero.'); return; }
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.querySelector('[onclick="copyWebhookUrl()"]');
    if (btn) { btn.textContent = 'Copiado!'; setTimeout(() => btn.textContent = 'Copiar URL', 2000); }
  });
}

function copyEl(elId, btnId, label) {
  const t = document.getElementById(elId)?.textContent || '';
  navigator.clipboard.writeText(t).then(() => {
    const b = document.getElementById(btnId);
    if (!b) return;
    b.textContent = 'Copiado!';
    b.classList.add('copied');
    setTimeout(() => { b.textContent = label || 'Copiar'; b.classList.remove('copied'); }, 2500);
  });
}
