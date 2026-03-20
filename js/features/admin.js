/* ── FEATURE: Admin panel — team, commissions, audit ─────── */

// ── Audit log (in-memory, max 200, last 50 persisted) ─────
function auditLog(action, targetId, detail) {
  if (!S.session) return;
  const entry = {
    id:        uid(),
    userId:    S.session.userId,
    userName:  S.session.userName,
    action,
    targetId:  targetId || '',
    detail:    detail   || '',
    timestamp: new Date().toISOString(),
  };
  S.auditLog.unshift(entry);
  if (S.auditLog.length > 200) S.auditLog = S.auditLog.slice(0, 200);
  try { localStorage.setItem('aiv-audit', JSON.stringify(S.auditLog.slice(0,50))); } catch(e) {}
}

// ── Signal banner ──────────────────────────────────────────
function showSignalBanner() {
  if (!S.session) return;
  const uid_  = S.session.userId;
  const role  = S.session.role;
  const items = [];

  const overdue = S.leads.filter(l =>
    isOverdue(l) && (role === 'admin' || l.closerId === uid_ || l.lockedBy === uid_)
  );
  if (overdue.length)
    items.push(`${overdue.length} seguimiento${overdue.length !== 1 ? 's' : ''} vencido${overdue.length !== 1 ? 's' : ''}`);

  if (role === 'closer' || role === 'solo') {
    const assigned = S.leads.filter(l => l.closerId === uid_ && l.status !== 'Cerrado' && l.status !== 'No llamar');
    if (assigned.length)
      items.push(`${assigned.length} lead${assigned.length !== 1 ? 's' : ''} asignado${assigned.length !== 1 ? 's' : ''} a ti`);
  }

  if (role === 'solo' || role === 'admin') {
    const myNew = S.leads.filter(l => l.providerId === uid_ && l.status === 'Nuevo');
    if (myNew.length) items.push(`${myNew.length} de tus leads sin trabajar aun`);
  }

  if (role === 'admin') {
    const pendingComm = S.commissions.filter(c => c.status === 'pending');
    if (pendingComm.length)
      items.push(`${pendingComm.length} comision${pendingComm.length !== 1 ? 'es' : ''} pendiente${pendingComm.length !== 1 ? 's' : ''} de pago`);
  }

  const banner  = document.getElementById('signal-banner');
  const titleEl = document.getElementById('signal-title');
  const itemsEl = document.getElementById('signal-items');
  if (!banner) return;

  if (items.length) {
    banner.classList.add('visible');
    titleEl.textContent = 'Bienvenido, ' + S.session.userName.split(' ')[0];
    itemsEl.innerHTML   = items.map(i => `<div class="signal-item">${esc(i)}</div>`).join('');
  } else {
    banner.classList.remove('visible');
  }
}

// ── Admin nav badge (pending commissions) ──────────────────
function updateAdminBadge() {
  const badge = document.getElementById('nav-admin-badge');
  if (!badge) return;
  const pending       = S.commissions.filter(c => c.status === 'pending').length;
  badge.textContent   = pending;
  badge.style.display = pending > 0 ? '' : 'none';
}

function applyAdminNavVisibility() {
  const adminNav = document.getElementById('nav-admin-item');
  if (adminNav) adminNav.classList.toggle('role-hidden', S.session?.role !== 'admin');
  const analyticsNav = document.getElementById('nav-analytics-item');
  if (analyticsNav) analyticsNav.classList.toggle('role-hidden', !['admin','solo'].includes(S.session?.role));
}

// ── Team management ────────────────────────────────────────
function openTeamModal(memberId) {
  const modal = document.getElementById('tm-modal');
  if (!modal) return;
  const titleEl = document.getElementById('tm-modal-title');
  document.getElementById('tm-id').value      = '';
  document.getElementById('tm-name').value    = '';
  document.getElementById('tm-pin').value     = '';
  document.getElementById('tm-pin2').value    = '';
  document.getElementById('tm-crate').value   = '10';
  document.getElementById('tm-contact').value = '';
  document.getElementById('tm-role').value    = 'closer';

  if (memberId) {
    const m = S.team.find(x => x.id === memberId);
    if (m) {
      titleEl.textContent                     = 'Editar miembro';
      document.getElementById('tm-id').value      = m.id;
      document.getElementById('tm-name').value    = m.name    || '';
      document.getElementById('tm-role').value    = m.role    || 'closer';
      document.getElementById('tm-crate').value   = m.closerRate   || 10;
      document.getElementById('tm-contact').value = m.contact || '';
    }
  } else {
    titleEl.textContent = 'Nuevo miembro del equipo';
  }
  modal.classList.add('open');
}

function closeTeamModal() {
  document.getElementById('tm-modal')?.classList.remove('open');
}

function togglePin(id, plain) {
  const el = document.getElementById('pin-' + id);
  if (!el) return;
  el.textContent = el.textContent === '••••' ? plain : '••••';
}

async function saveTeamMember() {
  const existingId = document.getElementById('tm-id').value.trim();
  const name       = document.getElementById('tm-name').value.trim();
  const role       = document.getElementById('tm-role').value;
  const pin        = document.getElementById('tm-pin').value.trim();
  const pin2       = document.getElementById('tm-pin2').value.trim();
  const contact    = document.getElementById('tm-contact')?.value?.trim() || '';
  const crate      = parseFloat(document.getElementById('tm-crate').value || 0);

  if (!name)                          { toast('El nombre es requerido.', 'error');             return; }
  const isNew = !existingId;
  if (isNew && !pin)                  { toast('El PIN es requerido para nuevos miembros.', 'error'); return; }
  if (pin && pin.length !== 4)        { toast('El PIN debe tener exactamente 4 dígitos.', 'error'); return; }
  if (pin && !/^\d{4}$/.test(pin))    { toast('El PIN solo puede contener dígitos.', 'error'); return; }
  if (pin && pin !== pin2)            { toast('Los PINs no coinciden.', 'error'); return; }
  if (pin === '2819')                 { toast('El PIN 2819 está reservado para Admin.', 'error'); return; }
  if (pin === '0000')                 { toast('El PIN 0000 está reservado para Demo.', 'error'); return; }

  if (pin) {
    const newHash   = await sha256(pin);
    const collision = S.team.find(m => m.pinHash === newHash && m.id !== (existingId || '__new__'));
    if (collision)  { toast('Este PIN ya está en uso por ' + collision.name + '.', 'error'); return; }
  }

  const id     = existingId || uid();
  const member = {id, name, role, contact, closerRate:crate, active:true, createdAt:new Date().toISOString()};
  if (pin) {
    member.pinHash  = await sha256(pin);
    member.pinPlain = pin;
  } else {
    const existing = S.team.find(m => m.id === id);
    if (existing) { member.pinHash = existing.pinHash; member.pinPlain = existing.pinPlain || ''; }
  }

  const idx = S.team.findIndex(m => m.id === id);
  if (idx >= 0) S.team[idx] = {...S.team[idx], ...member};
  else           S.team.push(member);

  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'saveTeamMember', ...member});
  auditLog(isNew ? 'createTeamMember' : 'updateTeamMember', id, name + ' role=' + role);
  closeTeamModal();
  renderAdmin();
  toast('Miembro guardado correctamente.', 'success');
}

function toggleTeamActive(memberId) {
  const m = S.team.find(x => x.id === memberId);
  if (!m) return;
  const newActive = !(String(m.active) !== 'false');
  m.active = newActive;
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'saveTeamMember', ...m});
  auditLog(newActive ? 'activateTeamMember' : 'deactivateTeamMember', memberId, m.name);
  renderAdmin();
}

function forceReleaseLead(leadId) {
  const lead = S.leads.find(l => l.id === leadId);
  if (!lead) return;
  const lockerName = getLockerName(lead);
  if (!Array.isArray(lead.workHistory)) lead.workHistory = [];
  lead.workHistory.push({
    closerId:   lead.lockedBy,
    closerName: lockerName,
    claimedAt:  '',
    releasedAt: new Date().toISOString(),
    outcome:    'admin-force-released',
    releasedBy: S.session?.userName || 'Admin',
  });
  lead.lockedBy    = '';
  lead.lockedUntil = '';
  lead.updatedAt   = new Date().toISOString();
  pushLead(lead);
  auditLog('forceReleaseLead', leadId, lead.name + ' (was locked by ' + lockerName + ')');
  renderAdmin();
  renderTable();
  toast('Lead liberado — vuelve al pool universal.', 'success');
}

async function markCommissionPaid(commId) {
  const ref = prompt('Referencia de pago (ej: transferencia #123, efectivo, bancolombia):');
  if (ref === null) return;
  const comm = S.commissions.find(c => c.id === commId);
  if (!comm) return;
  comm.status     = 'paid';
  comm.paidAt     = new Date().toISOString();
  comm.paidBy     = S.session?.userName || '';
  comm.paymentRef = ref;
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'markCommissionPaid', id:commId, paidBy:comm.paidBy, paymentRef:ref});
  auditLog('markCommissionPaid', commId, ref);
  toast('Comisión marcada como pagada', 'success');
  renderAdmin();
  renderPerfil();
}

async function bulkMarkPaid() {
  const person = document.getElementById('admin-comm-person')?.value;
  if (!person) { toast('Selecciona un miembro primero.', 'error'); return; }
  const ref = prompt('Referencia de pago (ej: transferencia #123):');
  if (ref === null) return;
  const pending = S.commissions.filter(c => c.status === 'pending' && (c.providerId === person || c.closerId === person));
  if (!pending.length) { toast('Sin comisiones pendientes para este miembro.', 'error'); return; }
  pending.forEach(comm => {
    comm.status = 'paid'; comm.paidAt = new Date().toISOString();
    comm.paidBy = S.session?.userName || ''; comm.paymentRef = ref;
    if (S.config.scriptUrl) sheetsCall({action:'markCommissionPaid', id:comm.id, paidBy:comm.paidBy, paymentRef:ref});
  });
  saveLocal();
  auditLog('bulkMarkPaid', '', 'count=' + pending.length + ' ref=' + ref);
  renderAdmin(); renderPerfil();
  toast(pending.length + ' comisiones marcadas como pagadas.', 'success');
}

function promptAdjustCollected(leadId) {
  const lead = S.leads.find(l => l.id === leadId);
  if (!lead) return;
  const raw = prompt(`¿Cuánto se cobró efectivamente? (COP)\nValor contratado: ${fmtCOP(lead.dealValue)}`, lead.collectedAmount || lead.dealValue || '');
  if (raw === null) return;
  const reason = prompt('Motivo del ajuste (opcional):') || '';
  adjustCollectedAmount(leadId, raw, reason);
}

function promptCancelCommission(commId) {
  const reason = prompt('Razón de cancelación (requerida):');
  if (!reason) return;
  cancelCommission(commId, reason);
}

function promptIssueRefund(leadId) {
  const lead = S.leads.find(l => l.id === leadId);
  if (!lead) return;
  if (!confirm(`¿Emitir reembolso para "${lead.name}"?\nEsto cancelará comisiones pendientes y creará registros de reembolso para las ya pagadas.`)) return;
  const reason = prompt('Razón del reembolso (requerida):');
  if (!reason) return;
  issueRefund(leadId, reason);
}

// ── SMS / WhatsApp templates ────────────────────────────────
function renderSmsTemplates() {
  const wrap = document.getElementById('admin-sms-list');
  if (!wrap) return;
  const templates = S.smsTemplates || [];
  if (!templates.length) {
    wrap.innerHTML = '<div class="notes-empty">Sin plantillas. Agrega una para enviar SMS/WhatsApp post-llamada.</div>';
    return;
  }
  wrap.innerHTML = templates.map((t,i) =>
    `<div class="team-row" style="margin-bottom:6px">
      <div class="team-info">
        <div class="team-name">${esc(t.name)}</div>
        <div class="team-meta" style="white-space:pre-wrap;max-height:36px;overflow:hidden">${esc(t.body.slice(0,100))}${t.body.length>100?'…':''}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-danger" style="font-size:11px;padding:4px 9px" onclick="deleteSmsTemplate(${i})">Borrar</button>
      </div>
    </div>`).join('');
}

function addSmsTemplate() {
  const name = document.getElementById('sms-tpl-name')?.value?.trim();
  const body = document.getElementById('sms-tpl-body')?.value?.trim();
  if (!name) { toast('Nombre requerido.', 'error'); return; }
  if (!body) { toast('Cuerpo del mensaje requerido.', 'error'); return; }
  if (!Array.isArray(S.smsTemplates)) S.smsTemplates = [];
  S.smsTemplates.push({id:uid(), name, body});
  saveLocal();
  document.getElementById('sms-tpl-name').value = '';
  document.getElementById('sms-tpl-body').value = '';
  renderSmsTemplates();
}

function deleteSmsTemplate(idx) {
  if (!confirm('¿Eliminar esta plantilla?')) return;
  S.smsTemplates.splice(idx, 1);
  saveLocal();
  renderSmsTemplates();
}

// ── GAS trigger control ────────────────────────────────────
async function checkTriggerStatus() {
  if (!S.config.scriptUrl) return;
  const res = await sheetsCall({action:'checkTriggers'});
  if (res?.success) {
    S.triggerStatus = { scrape: !!res.scrapeTrigger, report: !!res.reportTrigger };
    renderScheduledJobs();
    renderReportTrigger();
  }
}

async function setTrigger(fn, enabled) {
  if (!S.config.scriptUrl) { toast('Configura el Apps Script URL primero.', 'error'); return; }
  const res = await sheetsCall({action:'setTrigger', fn, enabled});
  if (res?.success) {
    if (fn === 'runScheduledScrapes') S.triggerStatus.scrape = enabled;
    if (fn === 'sendWeeklyReport')    S.triggerStatus.report = enabled;
    renderScheduledJobs();
    renderReportTrigger();
  } else {
    toast('Error al actualizar el trigger. Verifica que el script esté desplegado con los permisos correctos.', 'error', 5000);
  }
}

function renderReportTrigger() {
  const wrap = document.getElementById('admin-report-trigger');
  if (!wrap) return;
  const active = S.triggerStatus?.report;
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:13px;color:var(--body)">Trigger automático (lunes 8am):</span>
      <span style="font-size:13px;font-weight:600;color:${active?'var(--green)':'var(--body)'}">
        ${active ? '● Activo' : '○ Inactivo'}
      </span>
      <button class="btn ${active?'btn-danger':'btn-success'}" style="font-size:11px;padding:4px 10px"
        onclick="setTrigger('sendWeeklyReport',${!active})">
        ${active ? 'Desactivar' : 'Activar'}
      </button>
    </div>`;
}

// ── Scheduled scraper jobs ─────────────────────────────────
function renderScheduledJobs() {
  // Update trigger status toggle
  const triggerWrap = document.getElementById('admin-scrape-trigger-status');
  if (triggerWrap) {
    const active = S.triggerStatus?.scrape;
    triggerWrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <span style="font-size:13px;color:var(--body)">Trigger automático (diario 6am):</span>
        <span style="font-size:13px;font-weight:600;color:${active?'var(--green)':'var(--body)'}">
          ${active ? '● Activo' : '○ Inactivo'}
        </span>
        <button class="btn ${active?'btn-danger':'btn-success'}" style="font-size:11px;padding:4px 10px"
          onclick="setTrigger('runScheduledScrapes',${!active})">
          ${active ? 'Desactivar' : 'Activar'}
        </button>
      </div>`;
  }

  const wrap = document.getElementById('admin-jobs-list');
  if (!wrap) return;
  const jobs = S.scheduledJobs || [];
  if (!jobs.length) {
    wrap.innerHTML = '<div class="notes-empty">Sin trabajos programados. Agrega uno para que el scraper corra automaticamente.</div>';
    return;
  }
  wrap.innerHTML = jobs.map((j,i) =>
    `<div class="team-row" style="margin-bottom:6px">
      <div class="team-info">
        <div class="team-name">${esc(j.keyword)} · ${esc(j.city||'')} ${esc(j.barrio||'')}</div>
        <div class="team-meta">Radio: ${esc(String(j.radius||1000))}m · Max: ${esc(String(j.maxResults||50))} · ${j.active?'Activo':'Inactivo'}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-ghost" style="font-size:11px;padding:4px 9px" onclick="toggleScheduledJob(${i})">${j.active?'Pausar':'Activar'}</button>
        <button class="btn btn-danger" style="font-size:11px;padding:4px 9px" onclick="deleteScheduledJob(${i})">Borrar</button>
      </div>
    </div>`).join('');
}

function addScheduledJob() {
  const city        = document.getElementById('sj-city')?.value    || '';
  const barrioParts = (document.getElementById('sj-barrio')?.value || '').split('|');
  const barrio      = barrioParts[0] || '';
  const lat         = parseFloat(barrioParts[1]) || (LOCATIONS[city]?.lat ?? 0);
  const lng         = parseFloat(barrioParts[2]) || (LOCATIONS[city]?.lng ?? 0);
  const keyword     = document.getElementById('sj-keyword')?.value || '';
  const radius      = document.getElementById('sj-radius')?.value  || '1000';
  const max         = parseInt(document.getElementById('sj-max')?.value || '50');
  if (!city)    { toast('La ciudad es requerida.', 'error');    return; }
  if (!keyword) { toast('El keyword es requerido.', 'error');   return; }
  if (!lat || !lng) { toast('No se pudo determinar la ubicación. Selecciona un barrio.', 'error'); return; }
  if (!Array.isArray(S.scheduledJobs)) S.scheduledJobs = [];
  S.scheduledJobs.push({keyword, city, barrio, lat, lng, radius, maxResults:max, source:'Scraper (auto)', active:true});
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'saveScheduledJobs', jobs:S.scheduledJobs});
  renderScheduledJobs();
}

function toggleScheduledJob(idx) {
  if (!S.scheduledJobs?.[idx]) return;
  S.scheduledJobs[idx].active = !S.scheduledJobs[idx].active;
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'saveScheduledJobs', jobs:S.scheduledJobs});
  renderScheduledJobs();
}

function deleteScheduledJob(idx) {
  if (!confirm('¿Eliminar este trabajo programado?')) return;
  S.scheduledJobs.splice(idx, 1);
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'saveScheduledJobs', jobs:S.scheduledJobs});
  renderScheduledJobs();
}

// ── Script manager ─────────────────────────────────────────
function openScriptModal(scriptId) {
  document.getElementById('sc-modal-id').value    = scriptId || '';
  document.getElementById('sc-modal-name').value  = '';
  document.getElementById('sc-modal-stage').value = 'pitch';
  document.getElementById('sc-modal-body').value  = '';
  if (scriptId) {
    const sc = (S.scripts||[]).find(x => x.id === scriptId);
    if (sc) {
      document.getElementById('sc-modal-name').value  = sc.name  || '';
      document.getElementById('sc-modal-stage').value = sc.stage || 'pitch';
      document.getElementById('sc-modal-body').value  = sc.body  || '';
    }
  }
  document.getElementById('sc-modal').classList.add('open');
}

function closeScriptModal() {
  document.getElementById('sc-modal')?.classList.remove('open');
}

function saveScript() {
  const id    = document.getElementById('sc-modal-id').value.trim()   || uid();
  const name  = document.getElementById('sc-modal-name').value.trim();
  const stage = document.getElementById('sc-modal-stage').value;
  const body  = document.getElementById('sc-modal-body').value.trim();
  if (!name) { toast('El nombre del guion es requerido.', 'error'); return; }
  if (!body) { toast('El cuerpo del guion es requerido.', 'error'); return; }
  const now = new Date().toISOString();
  const sc  = {id, name, stage, body, createdAt:now, updatedAt:now};
  const idx = (S.scripts||[]).findIndex(x => x.id === id);
  if (idx >= 0) S.scripts[idx] = sc;
  else          { if (!Array.isArray(S.scripts)) S.scripts = []; S.scripts.push(sc); }
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'saveScript', ...sc});
  closeScriptModal();
  renderScripts();
}

function deleteScript(scriptId) {
  if (!confirm('¿Eliminar este guion?')) return;
  S.scripts = (S.scripts||[]).filter(x => x.id !== scriptId);
  saveLocal();
  if (S.config.scriptUrl) sheetsCall({action:'deleteScript', id:scriptId});
  renderScripts();
}

function renderScripts() {
  const wrap = document.getElementById('admin-scripts-list');
  if (!wrap) return;
  const scripts = S.scripts || [];
  if (!scripts.length) {
    wrap.innerHTML = '<div class="notes-empty">Sin guiones. Agrega uno para que aparezca en el widget de llamada.</div>';
    return;
  }
  const stageOrder = ['opening','pitch','objections','close','rebuttals'];
  const grouped = {};
  stageOrder.forEach(s => { grouped[s] = scripts.filter(x => x.stage === s); });
  wrap.innerHTML = stageOrder.map(stage => {
    const entries = grouped[stage];
    if (!entries.length) return '';
    const label = SCRIPT_STAGES[stage] || stage;
    return `<div style="margin-bottom:14px">
      <div style="font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--body);margin-bottom:6px">${esc(label)}</div>
      ${entries.map(sc => `<div class="team-row" style="margin-bottom:6px">
        <div class="team-info">
          <div class="team-name">${esc(sc.name)}</div>
          <div class="team-meta" style="white-space:pre-wrap;max-height:50px;overflow:hidden">${esc(sc.body.slice(0,120))}${sc.body.length>120?'…':''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-ghost" style="font-size:11px;padding:4px 9px" onclick="openScriptModal('${sc.id}')">Editar</button>
          <button class="btn btn-danger" style="font-size:11px;padding:4px 9px" onclick="deleteScript('${sc.id}')">Borrar</button>
        </div>
      </div>`).join('')}
    </div>`;
  }).join('');
}

// ── renderAdmin — consolidated (team + commissions + audit + locked + DNC + perf) ─
function renderAdmin() {
  if (S.session?.role !== 'admin') return;
  const roleLabels = {admin:'Admin', closer:'Closer', solo:'Solo'};

  // Team list
  const teamWrap = document.getElementById('admin-team-list');
  if (teamWrap) {
    teamWrap.innerHTML = (S.team||[]).length
      ? S.team.map(m => {
          const inactive = String(m.active) === 'false';
          const initials = (m.name||'?').split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2);
          return `<div class="team-row ${inactive?'team-inactive':''}">
            <div class="team-avatar">${esc(initials)}</div>
            <div class="team-info">
              <div class="team-name">${esc(m.name)}</div>
              <div class="team-meta">${roleLabels[m.role]||m.role} · ${inactive?'Inactivo':'Activo'}${m.contact?' · '+esc(m.contact):''}</div>
              <div class="team-pin" style="font-size:11px;color:var(--sub);font-family:'DM Mono',monospace">
                PIN: <span id="pin-${m.id}">••••</span>
                ${m.pinPlain ? `<span onclick="togglePin('${m.id}','${m.pinPlain}')" style="cursor:pointer;margin-left:4px;opacity:.6" title="Revelar PIN">👁</span>` : '<span style="opacity:.4;font-size:10px"> (reasignar)</span>'}
              </div>
            </div>
            <div class="team-actions">
              <button class="btn btn-ghost" style="font-size:11px;padding:4px 9px" onclick="openTeamModal('${m.id}')">Editar</button>
              <button class="btn ${inactive?'btn-success':'btn-danger'}" style="font-size:11px;padding:4px 9px" onclick="toggleTeamActive('${m.id}')">${inactive?'Activar':'Desactivar'}</button>
            </div>
          </div>`;
        }).join('')
      : '<div class="notes-empty">Usa "+ Agregar miembro" para crear el primer perfil del equipo.</div>';
  }

  // Commissions
  const commFilter = document.getElementById('admin-comm-filter')?.value || '';
  const commPerson = document.getElementById('admin-comm-person')?.value || '';
  const commWrap   = document.getElementById('admin-comm-list');
  const pendingN   = S.commissions.filter(c => c.status === 'pending').length;
  const pendingLbl = document.getElementById('admin-comm-pending-label');
  if (pendingLbl) pendingLbl.textContent = pendingN > 0 ? `· ${pendingN} pendiente${pendingN!==1?'s':''}` : '';

  const filtered = S.commissions
    .filter(c => (!commFilter || c.status === commFilter) && (!commPerson || c.closerId===commPerson))
    .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 60);

  if (commWrap) {
    commWrap.innerHTML = filtered.length
      ? filtered.map(c => {
          const isClawback = c.status === 'clawback';
          const totalAmt = parseFloat(c.closerAmount||0);
          const statusCls = {pending:'comm-pending', paid:'comm-paid', cancelled:'comm-cancelled', clawback:'comm-cancelled'}[c.status] || 'comm-pending';
          const statusLbl = {pending:'Pendiente', paid:'Pagado', cancelled:'Cancelado', clawback:'Reembolso'}[c.status] || c.status;
          const paidInfo  = c.status === 'paid' ? ` · ${esc(c.paidBy||'')} · ${esc(c.paymentRef||'')}` : '';
          const refundInfo = (c.refundReason && c.status !== 'paid') ? ` · Motivo: ${esc(c.refundReason)}` : '';
          const collInfo  = c.collectedAmount && parseFloat(c.collectedAmount) !== parseFloat(c.dealValue)
            ? ` · Cobrado: ${fmtCOP(c.collectedAmount)}`
            : '';
          const amtStyle  = isClawback ? 'color:#c0392b;' : '';
          const actions   = c.status === 'pending'
            ? `<button class="btn btn-success" style="font-size:11px;padding:4px 9px;flex-shrink:0" onclick="markCommissionPaid('${c.id}')">Marcar pagado</button>
               <button class="btn btn-ghost" style="font-size:11px;padding:4px 9px;flex-shrink:0" onclick="promptAdjustCollected('${c.leadId}')">Ajustar cobrado</button>
               <button class="btn btn-danger" style="font-size:11px;padding:4px 9px;flex-shrink:0" onclick="promptCancelCommission('${c.id}')">Cancelar</button>`
            : c.status === 'paid'
            ? `<button class="btn btn-danger" style="font-size:11px;padding:4px 9px;flex-shrink:0" onclick="promptIssueRefund('${c.leadId}')">Reembolso</button>`
            : '';
          return `<div class="admin-comm-row">
            <div class="admin-comm-info">
              <div class="admin-comm-lead">${esc(c.leadName||'--')}</div>
              <div class="admin-comm-detail">Contratado: ${fmtCOP(c.dealValue)}${collInfo} · Closer: ${esc(c.closerName||'--')} ${fmtCOP(c.closerAmount)} · ${fmtD(c.createdAt)}${paidInfo}${refundInfo}</div>
            </div>
            <span class="admin-comm-amount" style="${amtStyle}">${fmtCOP(totalAmt)}</span>
            <span class="comm-status-badge ${statusCls}">${statusLbl}</span>
            ${actions}
          </div>`;
        }).join('')
      : `<div class="notes-empty">Sin comisiones${commFilter ? ' con ese filtro' : ''}.</div>`;
  }
  const bulkWrap = document.getElementById('admin-comm-bulk-wrap');
  if (bulkWrap) bulkWrap.style.display = (commPerson && filtered.some(c => c.status === 'pending')) ? 'block' : 'none';

  // Audit log
  const auditWrap = document.getElementById('admin-audit-list');
  if (auditWrap) {
    try { S.auditLog = JSON.parse(localStorage.getItem('aiv-audit') || '[]'); } catch(e) {}
    auditWrap.innerHTML = S.auditLog.length
      ? S.auditLog.slice(0,100).map(a =>
          `<div class="audit-row">
            <span class="audit-time">${fmtD(a.timestamp)} ${fmtT(a.timestamp)}</span>
            <span><span class="audit-action">${esc(a.userName||a.userId)}</span>
            <span class="audit-detail"> · ${esc(a.action)} ${a.targetId?'· '+esc(a.targetId.slice(0,8)):''} ${a.detail?'· '+esc(a.detail):''}</span></span>
          </div>`).join('')
      : '<div class="notes-empty">Sin entradas de auditoría aun.</div>';
  }

  // Locked leads
  const lockedLeads = S.leads.filter(l => isLocked(l));
  const lockedCount = document.getElementById('admin-locked-count');
  if (lockedCount) lockedCount.textContent = lockedLeads.length + ' lead' + (lockedLeads.length !== 1 ? 's' : '');
  const lockedWrap = document.getElementById('admin-locked-list');
  if (lockedWrap) {
    lockedWrap.innerHTML = lockedLeads.length
      ? lockedLeads.map(l => {
          const lockerName = getLockerName(l);
          return `<div class="team-row">
            <div class="team-info">
              <div class="team-name">${esc(l.name)}</div>
              <div class="team-meta">${esc(l.phone||'--')} · ${esc(l.city||'')} ${esc(l.barrio||'')} · Estado: ${esc(l.status||'Nuevo')}</div>
              <div class="team-meta" style="color:var(--amber)">Reclamado por: ${esc(lockerName)} · Expira en: ${lockCountdown(l)}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button class="btn btn-ghost" style="font-size:11px;padding:4px 9px" onclick="openLead('${l.id}')">Ver ficha</button>
              <button class="btn btn-amber" style="font-size:11px;padding:4px 9px" onclick="forceReleaseLead('${l.id}')">Liberar</button>
            </div>
          </div>`;
        }).join('')
      : '<div class="notes-empty">No hay leads reclamados actualmente.</div>';
  }

  // DNC registry
  const dncLeads = S.leads.filter(l => l.status === 'No llamar');
  const dncCount = document.getElementById('admin-dnc-count');
  if (dncCount) dncCount.textContent = dncLeads.length + ' registro' + (dncLeads.length !== 1 ? 's' : '');
  const dncWrap = document.getElementById('admin-dnc-list');
  if (dncWrap) {
    dncWrap.innerHTML = dncLeads.length
      ? dncLeads.map(l =>
          `<div class="team-row">
            <div class="team-info">
              <div class="team-name">${esc(l.name)}</div>
              <div class="team-meta">${esc(l.phone||'--')} · ${esc(l.city||'')} ${esc(l.barrio||'')} · ${fmtD(l.updatedAt)}</div>
              ${l.dncReason ? `<div class="team-meta" style="color:var(--red);margin-top:2px">Razón: ${esc(l.dncReason)}</div>` : ''}
            </div>
            <button class="btn btn-ghost" style="font-size:11px;padding:4px 9px" onclick="openLead('${l.id}')">Ver ficha</button>
          </div>`).join('')
      : '<div class="notes-empty">Sin leads marcados como "No llamar".</div>';
  }

  // Performance stats by team member
  const period   = document.getElementById('perf-period')?.value || 'week';
  const now      = new Date();
  const cutoff   = new Date();
  if      (period === 'today') cutoff.setHours(0,0,0,0);
  else if (period === 'week')  cutoff.setDate(now.getDate()-7);
  else if (period === 'month') cutoff.setMonth(now.getMonth()-1);
  else                         cutoff.setFullYear(2000);
  const perfWrap = document.getElementById('admin-perf-list');
  if (perfWrap) {
    if (!(S.team||[]).length) {
      perfWrap.innerHTML = '<div class="notes-empty">Sin miembros del equipo.</div>';
    } else {
      const pCalls = S.calls.filter(c => new Date(c.calledAt) >= cutoff);
      perfWrap.innerHTML = S.team.filter(m => String(m.active) !== 'false').map(m => {
        const mCalls  = pCalls.filter(c => { const lead = S.leads.find(l => l.id === c.leadId); return lead && (lead.closerId===m.id||lead.providerId===m.id); });
        const ans     = mCalls.filter(c => c.outcome === 'answered').length;
        const mLeads  = S.leads.filter(l => l.closerId===m.id||l.providerId===m.id);
        const closed  = mLeads.filter(l => l.status==='Cerrado').length;
        const inter   = mLeads.filter(l => l.status==='Interesado').length;
        const ansRate = mCalls.length ? Math.round(ans/mCalls.length*100) : 0;
        const pendComm = S.commissions.filter(c => c.status==='pending'&&(c.providerId===m.id||c.closerId===m.id))
          .reduce((s,c) => { let a=0; if(c.closerId===m.id)a+=parseFloat(c.closerAmount||0); if(c.providerId===m.id)a+=parseFloat(c.providerAmount||0); return s+a; }, 0);
        const initials = (m.name||'?').split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2);
        return `<div class="card" style="margin-bottom:10px;padding:14px 16px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
            <div class="team-avatar">${esc(initials)}</div>
            <div style="flex:1"><div class="team-name">${esc(m.name)}</div><div class="team-meta">${m.role}${m.contact?' · '+esc(m.contact):''}</div></div>
            ${pendComm>0?`<span style="font-size:11px;color:var(--amber);font-family:'DM Mono',monospace">${fmtCOP(pendComm)} pendiente</span>`:''}
          </div>
          <div class="perf-grid">
            <div class="perf-stat"><div class="perf-val">${mCalls.length}</div><div class="perf-lbl">Llamadas</div></div>
            <div class="perf-stat"><div class="perf-val">${ans}</div><div class="perf-lbl">Contestadas</div></div>
            <div class="perf-stat"><div class="perf-val">${ansRate}%</div><div class="perf-lbl">Tasa respuesta</div></div>
            <div class="perf-stat"><div class="perf-val">${closed}</div><div class="perf-lbl">Cerrados</div></div>
          </div>
          <div class="perf-bar-wrap" style="margin-top:8px">
            <div class="perf-bar-label">Interesado</div>
            <div class="perf-bar-track"><div class="perf-bar-fill" style="background:var(--s-interest);width:${mLeads.length?Math.min(100,Math.round(inter/mLeads.length*100)):0}%"></div></div>
            <div class="perf-bar-val">${inter}</div>
          </div>
        </div>`;
      }).join('') || '<div class="notes-empty">Sin actividad en este periodo.</div>';
    }
  }

  updateAdminBadge();
  renderScripts();
  renderScheduledJobs();
  renderReportTrigger();
  renderSmsTemplates();
  initAdminJobsForm();
  checkTriggerStatus(); // async — re-renders trigger rows when response arrives
}

function exportAuditLog() {
  if (!S.auditLog.length) { toast('Sin entradas de auditoría.', 'error'); return; }
  const hdrs = ['timestamp','userName','action','targetId','detail'];
  const csv = [
    hdrs.join(','),
    ...S.auditLog.map(a => hdrs.map(h => `"${String(a[h]||'').replace(/"/g,'""')}"`).join(',')),
  ].join('\n');
  const el = document.createElement('a');
  el.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
  el.download = 'aiv_auditlog_' + new Date().toISOString().slice(0,10) + '.csv';
  el.click();
}

function initAdminJobsForm() {
  fillCities('sj-city');
  const cityEl = document.getElementById('sj-city');
  if (cityEl?.value) fillBarrios('sj-barrio', cityEl.value, null);
  fillCats('sj-cat', 'sj-keyword');
}
