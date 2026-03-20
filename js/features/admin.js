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

  if (role === 'provider' || role === 'solo' || role === 'admin') {
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
  if (!adminNav) return;
  adminNav.classList.toggle('role-hidden', S.session?.role !== 'admin');
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
  document.getElementById('tm-prate').value   = '3';
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
      document.getElementById('tm-prate').value   = m.providerRate || 3;
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

async function saveTeamMember() {
  const existingId = document.getElementById('tm-id').value.trim();
  const name       = document.getElementById('tm-name').value.trim();
  const role       = document.getElementById('tm-role').value;
  const pin        = document.getElementById('tm-pin').value.trim();
  const pin2       = document.getElementById('tm-pin2').value.trim();
  const contact    = document.getElementById('tm-contact')?.value?.trim() || '';
  const prate      = parseFloat(document.getElementById('tm-prate').value || 0);
  const crate      = parseFloat(document.getElementById('tm-crate').value || 0);

  if (!name)                          { alert('El nombre es requerido.');             return; }
  if (prate < 0 || prate > 5)         { alert('Tasa de proveedor: 0–5%.');            return; }
  if (crate < 0 || crate > 19)        { alert('Tasa de closer: 0–19%.');              return; }
  const isNew = !existingId;
  if (isNew && !pin)                  { alert('El PIN es requerido para nuevos miembros.'); return; }
  if (pin && pin.length !== 4)        { alert('El PIN debe tener exactamente 4 dígitos.'); return; }
  if (pin && !/^\d{4}$/.test(pin))    { alert('El PIN solo puede contener dígitos.'); return; }
  if (pin && pin !== pin2)            { alert('Los PINs no coinciden.'); return; }
  if (pin === '2819')                 { alert('El PIN 2819 está reservado para Admin.'); return; }

  if (pin) {
    const newHash   = await sha256(pin);
    const collision = S.team.find(m => m.pinHash === newHash && m.id !== (existingId || '__new__'));
    if (collision)  { alert('Este PIN ya está en uso por ' + collision.name + '.'); return; }
  }

  const id     = existingId || uid();
  const member = {id, name, role, contact, providerRate:prate, closerRate:crate, active:true, createdAt:new Date().toISOString()};
  if (pin) {
    member.pinHash = await sha256(pin);
  } else {
    const existing = S.team.find(m => m.id === id);
    if (existing) member.pinHash = existing.pinHash;
  }

  const idx = S.team.findIndex(m => m.id === id);
  if (idx >= 0) S.team[idx] = {...S.team[idx], ...member};
  else           S.team.push(member);

  localStorage.setItem('aiv-team', JSON.stringify(S.team));
  if (S.config.scriptUrl) sheetsCall({action:'saveTeamMember', ...member});
  auditLog(isNew ? 'createTeamMember' : 'updateTeamMember', id, name + ' role=' + role);
  closeTeamModal();
  renderAdmin();
  alert('Miembro guardado correctamente.');
}

function toggleTeamActive(memberId) {
  const m = S.team.find(x => x.id === memberId);
  if (!m) return;
  const newActive = !(String(m.active) !== 'false');
  m.active = newActive;
  localStorage.setItem('aiv-team', JSON.stringify(S.team));
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
  alert('Lead liberado. Vuelve al pool universal.');
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
  localStorage.setItem('aiv-comm', JSON.stringify(S.commissions));
  if (S.config.scriptUrl) sheetsCall({action:'markCommissionPaid', id:commId, paidBy:comm.paidBy, paymentRef:ref});
  auditLog('markCommissionPaid', commId, ref);
  renderAdmin();
  renderPerfil();
}

async function bulkMarkPaid() {
  const person = document.getElementById('admin-comm-person')?.value;
  if (!person) { alert('Selecciona un miembro primero.'); return; }
  const ref = prompt('Referencia de pago (ej: transferencia #123):');
  if (ref === null) return;
  const pending = S.commissions.filter(c => c.status === 'pending' && (c.providerId === person || c.closerId === person));
  if (!pending.length) { alert('Sin comisiones pendientes para este miembro.'); return; }
  pending.forEach(comm => {
    comm.status = 'paid'; comm.paidAt = new Date().toISOString();
    comm.paidBy = S.session?.userName || ''; comm.paymentRef = ref;
    if (S.config.scriptUrl) sheetsCall({action:'markCommissionPaid', id:comm.id, paidBy:comm.paidBy, paymentRef:ref});
  });
  localStorage.setItem('aiv-comm', JSON.stringify(S.commissions));
  auditLog('bulkMarkPaid', '', 'count=' + pending.length + ' ref=' + ref);
  renderAdmin(); renderPerfil();
  alert(pending.length + ' comisiones marcadas como pagadas.');
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
  if (!name) { alert('Nombre requerido.'); return; }
  if (!body) { alert('Cuerpo del mensaje requerido.'); return; }
  if (!Array.isArray(S.smsTemplates)) S.smsTemplates = [];
  S.smsTemplates.push({id:uid(), name, body});
  try { localStorage.setItem('aiv-sms-tpl', JSON.stringify(S.smsTemplates)); } catch(e) {}
  document.getElementById('sms-tpl-name').value = '';
  document.getElementById('sms-tpl-body').value = '';
  renderSmsTemplates();
}

function deleteSmsTemplate(idx) {
  if (!confirm('¿Eliminar esta plantilla?')) return;
  S.smsTemplates.splice(idx, 1);
  try { localStorage.setItem('aiv-sms-tpl', JSON.stringify(S.smsTemplates)); } catch(e) {}
  renderSmsTemplates();
}

// ── Scheduled scraper jobs ─────────────────────────────────
function renderScheduledJobs() {
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
  const keyword = document.getElementById('sj-keyword')?.value?.trim();
  const city    = document.getElementById('sj-city')?.value    || '';
  const lat     = document.getElementById('sj-lat')?.value?.trim();
  const lng     = document.getElementById('sj-lng')?.value?.trim();
  const radius  = document.getElementById('sj-radius')?.value  || '1000';
  const max     = parseInt(document.getElementById('sj-max')?.value || '50');
  if (!keyword)      { alert('El keyword es requerido.');                    return; }
  if (!lat || !lng)  { alert('Latitud y longitud son requeridas.');          return; }
  if (!Array.isArray(S.scheduledJobs)) S.scheduledJobs = [];
  S.scheduledJobs.push({keyword, city, lat, lng, radius, maxResults:max, source:'Scraper (auto)', active:true});
  try { localStorage.setItem('aiv-sched-jobs', JSON.stringify(S.scheduledJobs)); } catch(e) {}
  if (S.config.scriptUrl) sheetsCall({action:'saveScheduledJobs', jobs:S.scheduledJobs});
  renderScheduledJobs();
}

function toggleScheduledJob(idx) {
  if (!S.scheduledJobs?.[idx]) return;
  S.scheduledJobs[idx].active = !S.scheduledJobs[idx].active;
  try { localStorage.setItem('aiv-sched-jobs', JSON.stringify(S.scheduledJobs)); } catch(e) {}
  if (S.config.scriptUrl) sheetsCall({action:'saveScheduledJobs', jobs:S.scheduledJobs});
  renderScheduledJobs();
}

function deleteScheduledJob(idx) {
  if (!confirm('¿Eliminar este trabajo programado?')) return;
  S.scheduledJobs.splice(idx, 1);
  try { localStorage.setItem('aiv-sched-jobs', JSON.stringify(S.scheduledJobs)); } catch(e) {}
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
  if (!name) { alert('El nombre del guion es requerido.'); return; }
  if (!body) { alert('El cuerpo del guion es requerido.'); return; }
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
  const roleLabels = {admin:'Admin', provider:'Proveedor', closer:'Closer', solo:'Solo'};

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
            </div>
            <div class="team-rates">${m.providerRate||0}% prv / ${m.closerRate||0}% clsr</div>
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
    .filter(c => (!commFilter || c.status === commFilter) && (!commPerson || c.providerId===commPerson || c.closerId===commPerson))
    .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 60);

  if (commWrap) {
    commWrap.innerHTML = filtered.length
      ? filtered.map(c => {
          const totalAmt = parseFloat(c.providerAmount||0) + parseFloat(c.closerAmount||0);
          const statusCls = {pending:'comm-pending', paid:'comm-paid', cancelled:'comm-cancelled'}[c.status] || 'comm-pending';
          const statusLbl = {pending:'Pendiente', paid:'Pagado', cancelled:'Cancelado'}[c.status] || c.status;
          const paidInfo  = c.status === 'paid' ? ` · ${esc(c.paidBy||'')} · ${esc(c.paymentRef||'')}` : '';
          return `<div class="admin-comm-row">
            <div class="admin-comm-info">
              <div class="admin-comm-lead">${esc(c.leadName||'--')}</div>
              <div class="admin-comm-detail">Negocio: ${fmtCOP(c.dealValue)} · ${esc(c.providerName||'--')} ${fmtCOP(c.providerAmount)} + ${esc(c.closerName||'--')} ${fmtCOP(c.closerAmount)} · ${fmtD(c.createdAt)}${paidInfo}</div>
            </div>
            <span class="admin-comm-amount">${fmtCOP(totalAmt)}</span>
            <span class="comm-status-badge ${statusCls}">${statusLbl}</span>
            ${c.status === 'pending' ? `<button class="btn btn-success" style="font-size:11px;padding:4px 9px;flex-shrink:0" onclick="markCommissionPaid('${c.id}')">Marcar pagado</button>` : ''}
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
  renderSmsTemplates();
}
