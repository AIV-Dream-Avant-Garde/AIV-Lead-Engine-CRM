// AXIUS CRM — Apps Script v4
// Rellena TODAS las constantes antes de deployar

const SHEET_ID           = 'TU_SPREADSHEET_ID';
const PLACES_API_KEY     = 'TU_GOOGLE_PLACES_API_KEY';
const TWILIO_ACCOUNT_SID = 'ACxxxx';
const TWILIO_API_KEY_SID = 'SKxxxx';
const TWILIO_API_SECRET  = 'your_api_secret';
const TWILIO_AUTH_TOKEN  = 'your_auth_token';
const TWILIO_TWIML_APP   = 'APxxxx';
const TWILIO_FROM_NUMBER = '+15551234567';     // voice (existing)
const TWILIO_FROM_SMS_US = '+15551234567';     // US SMS sender (10DLC) — set in Project 0
const TWILIO_FROM_WA     = '+14155238886';     // WhatsApp sender (whatsapp: prefix added at send) — set in Project 0
const DRIVE_FOLDER_ID    = 'TU_DRIVE_FOLDER_ID';
const RESEND_API_KEY     = 'TU_RESEND_API_KEY';            // Project C — Resend (https://resend.com)
const RESEND_FROM        = 'AXIUS <hola@axius.tech>';      // verified sending domain (SPF/DKIM/DMARC)
const SHEETS = { leads:'Leads', calls:'Llamadas', team:'Team', commissions:'Commissions', scripts:'Scripts', interactions:'Interactions', sequences:'Sequences' };

// CSRF protection — paste the value from your browser's Setup page
const CRM_SECRET = 'PASTE_YOUR_CRM_SECRET_HERE'; // Setup → shows after first load

const LEAD_HDR = ['id','name','phone','address','website','rating','reviews','city','barrio','keyword','source','sourceDetail','status','providerId','providerRate','closerId','closerRate','dealValue','collectedAmount','providerCommission','closerCommission','commissionStatus','lockedBy','lockedUntil','assignedAt','workHistory','dncReason','followUpDate','notes','importedAt','updatedAt','calendarEventId','refundAmount','refundReason','refundedAt','country','email','externalId','lastTouchAt','lastReplyAt','consentSms','consentWhatsapp','consentEmail'];
const CALL_HDR = ['id','leadId','leadName','phone','callSid','outcome','duration','notes','recordingUrl','driveUrl','consentConfirmed','calledAt'];
const TEAM_HDR = ['id','name','role','pinHash','providerRate','closerRate','contact','active','createdAt'];
const COMM_HDR   = ['id','leadId','leadName','dealValue','collectedAmount','providerId','providerRate','providerAmount','closerId','closerRate','closerAmount','status','createdAt','paidAt','paidBy','paymentRef','refundReason','adjustedBy','adjustedAt','providerName','closerName'];
const SCRIPT_HDR = ['id','name','stage','body','createdAt','updatedAt'];
const INTERACTION_HDR = ['id','leadId','leadName','phone','channel','direction','body','stepTag','status','sid','error','createdAt','createdBy'];
const SEQUENCE_HDR = ['leadId','state','stepIndex','nextRunAt','pausedReason','enrolledAt','updatedAt']; // cadence enrollment (Project B; written by the Vercel engine + manual CRM controls)

// Opt-out detection (mirror of js/data/constants.js + js/features/outreach.js — keep in sync)
const OPT_OUT_KEYWORDS_GS = ['stop','stopall','unsubscribe','cancelar','baja','salir'];
const OPT_OUT_PHRASES_GS = ['no me interesa','no me interesan','no escriban','no escribas','no me escriban','no me escribas','deja de escribir','dejen de escribir','no me contacten','no me contacte','no contactarme','quítame','quitame','quítenme','quitenme','bórrame','borrame','bórrenme','borrenme','déjame en paz','dejame en paz','déjenme en paz','dejenme en paz','not interested','remove me','take me off','leave me alone','stop messaging',"don't contact",'do not contact','unsubscribe me'];
function isOptOutGs(body){
  const t=String(body||'').trim().toLowerCase(); if(!t) return false;
  if(OPT_OUT_KEYWORDS_GS.some(k=>t===k||t===k+'.'||t.indexOf(k+' ')===0)) return true;
  return OPT_OUT_PHRASES_GS.some(p=>t.indexOf(p)!==-1);
}
// Server-side safety net: is this lead opted out / No-llamar? (defense-in-depth for sends)
function leadOptedOut(leadId){
  if(!leadId) return false;
  const ss=SpreadsheetApp.openById(SHEET_ID), s=ss.getSheetByName(SHEETS.leads);
  if(!s) return false;
  const rows=s.getDataRange().getValues(), h=rows[0]||LEAD_HDR, ic=h.indexOf('id'), stc=h.indexOf('status');
  for(let i=1;i<rows.length;i++){ if(String(rows[i][ic])===String(leadId)) return String(rows[i][stc])==='No llamar'; }
  return false;
}

function getSheet(name, hdr) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); s.appendRow(hdr); return s; }
  // Reconcile: if the sheet predates added columns (e.g. country, providerName),
  // append the missing headers so new fields persist and round-trip on pull.
  if (s.getLastRow() > 0) {
    const head = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
    const missing = hdr.filter(h => head.indexOf(h) === -1);
    if (missing.length) s.getRange(1, head.length + 1, 1, missing.length).setValues([missing]);
  }
  return s;
}

function toObjs(sheet) {
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  const h = rows[0];
  return rows.slice(1).map(r => {
    const o={}; h.forEach((k,i)=>o[k]=r[i]);
    if(o.notes) try{o.notes=JSON.parse(o.notes)}catch(e){o.notes=[];}
    if(o.workHistory) try{o.workHistory=JSON.parse(o.workHistory)}catch(e){o.workHistory=[];}
    return o;
  });
}

function tryParse(s,d){try{return JSON.parse(s)||d}catch(e){return d}}

function doGet(e) {
  try {
    const a = e.parameter.action;
    if (a !== 'ping' && a !== 'twiml') {
      const s = e.parameter._s || '';
      if (s !== CRM_SECRET) return err_('Unauthorized');
    }
    if (a === 'ping') return ok({ping:true,serverTime:new Date().toISOString()});
    if (a === 'pull') {
      const since = e.parameter.since;
      let leads = toObjs(getSheet(SHEETS.leads,LEAD_HDR)).map(l=>({...l,notes:tryParse(l.notes,[])}));
      if(since){const sd=new Date(since);leads=leads.filter(l=>!l.updatedAt||new Date(l.updatedAt)>=sd);}
      const calls   = toObjs(getSheet(SHEETS.calls,CALL_HDR));
      const team    = toObjs(getSheet(SHEETS.team,TEAM_HDR));
      const comms   = toObjs(getSheet(SHEETS.commissions,COMM_HDR));
      const scripts = toObjs(getSheet(SHEETS.scripts,SCRIPT_HDR));
      let scheduledJobs=[]; try { const raw=cfgGet('scheduledJobs'); if(raw) scheduledJobs=JSON.parse(raw); } catch(e){}
      let interactions = toObjs(getSheet(SHEETS.interactions,INTERACTION_HDR));
      if(since){const sd=new Date(since);interactions=interactions.filter(i=>!i.createdAt||new Date(i.createdAt)>=sd);}
      const sequences = toObjs(getSheet(SHEETS.sequences,SEQUENCE_HDR));
      return ok({leads,calls,team,commissions:comms,scripts,scheduledJobs,interactions,sequences,serverTime:new Date().toISOString()});
    }
    if (a === 'getToken') return ok({token:createToken(e.parameter.identity||'agent')});
    if (a === 'checkTriggers') {
      const triggers = ScriptApp.getProjectTriggers();
      let lastScrapeRun = null; try { const raw = cfgGet('lastScrapeRun'); if (raw) lastScrapeRun = JSON.parse(raw); } catch(e) {}
      return ok({
        scrapeTrigger: triggers.some(t => t.getHandlerFunction() === 'runScheduledScrapes'),
        reportTrigger: triggers.some(t => t.getHandlerFunction() === 'sendWeeklyReport'),
        lastScrapeRun,
      });
    }
    if (a === 'twiml') {
      const xml = ContentService.createTextOutput(
        '<?xml version="1.0"?><Response><Dial callerId="'+TWILIO_FROM_NUMBER+'" record="record-from-answer" recordingStatusCallback="'+ScriptApp.getService().getUrl()+'?action=rec_hook"><Number>'+(e.parameter.To||'')+'</Number></Dial></Response>'
      ).setMimeType(ContentService.MimeType.XML);
      return xml;
    }
    return ok({pong:true});
  } catch(err) { return err_(err.message) }
}

function doPost(e) {
  try {
    const a = e.parameter.action;

    // Twilio inbound messaging webhook (form-encoded; NOT our JSON+_secret shape).
    // Configure the Twilio webhook URL as:  {execUrl}?action=inboundMsg&token={CRM_SECRET}
    if (a === 'inboundMsg') {
      if (e.parameter.token !== CRM_SECRET) return err_('Unauthorized');
      const from = String(e.parameter.From || '').replace('whatsapp:', '');
      const to   = String(e.parameter.To   || '');
      const text = String(e.parameter.Body || '');
      const channel = to.indexOf('whatsapp:') === 0 ? 'whatsapp' : 'sms';
      const fromKey = phoneKey(from);
      const ls = getSheet(SHEETS.leads, LEAD_HDR), lr = ls.getDataRange().getValues(), lh = lr[0] || LEAD_HDR;
      const pc=lh.indexOf('phone'), ic=lh.indexOf('id'), nc=lh.indexOf('name'), stc=lh.indexOf('status'),
            dc=lh.indexOf('dncReason'), rc=lh.indexOf('lastReplyAt'), uc=lh.indexOf('updatedAt'),
            csms=lh.indexOf('consentSms'), cwa=lh.indexOf('consentWhatsapp');
      let row=-1, leadId='', leadName='';
      for (let i=1;i<lr.length;i++){ if (fromKey && phoneKey(lr[i][pc])===fromKey) { row=i; leadId=lr[i][ic]; leadName=lr[i][nc]; } } // last match = most recent
      const now = new Date().toISOString();
      const rec = { id:Utilities.getUuid(), leadId, leadName, phone:from, channel, direction:'in', body:text, stepTag:'', status:'received', sid:String(e.parameter.MessageSid||''), error:'', createdAt:now, createdBy:'inbound' };
      getSheet(SHEETS.interactions, INTERACTION_HDR).appendRow(INTERACTION_HDR.map(k => rec[k] ?? ''));
      if (row >= 0) {
        if (rc>=0) ls.getRange(row+1, rc+1).setValue(now);
        if (uc>=0) ls.getRange(row+1, uc+1).setValue(now); // bump updatedAt so the reply/opt-out surfaces in since-filtered pulls
        if (isOptOutGs(text)) {
          if (stc>=0) ls.getRange(row+1, stc+1).setValue('No llamar');
          if (dc>=0)  ls.getRange(row+1, dc+1).setValue('opt-out ('+channel+')');
          if (channel==='whatsapp' && cwa>=0) ls.getRange(row+1, cwa+1).setValue(false);
          if (channel==='sms' && csms>=0)     ls.getRange(row+1, csms+1).setValue(false);
        }
      }
      return ContentService.createTextOutput('<?xml version="1.0"?><Response></Response>').setMimeType(ContentService.MimeType.XML);
    }

    const b = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (b._secret !== CRM_SECRET) {
      return err_('Unauthorized — configura CRM_SECRET en Code.gs con el valor de Setup.');
    }
    if (a === 'push') {
      const s=getSheet(SHEETS.leads,LEAD_HDR),rows=s.getDataRange().getValues();
      const ph=rows[0]||LEAD_HDR, pc=ph.indexOf('phone');
      const ex=rows.slice(1).map(r=>String(r[pc]).trim());
      let added=0;
      (b.data||[]).forEach(l=>{
        if(!ex.includes(String(l.phone||'').trim())){
          s.appendRow(LEAD_HDR.map(h=>(h==='notes'||h==='workHistory')?JSON.stringify(l[h]||[]):(l[h]??'')));
          ex.push(String(l.phone).trim()); added++;
        }
      });
      return ok({added});
    }
    if (a === 'update') {
      const s=getSheet(SHEETS.leads,LEAD_HDR),rows=s.getDataRange().getValues(),h=rows[0];
      const ic=h.indexOf('id');
      for(let i=1;i<rows.length;i++){
        if(String(rows[i][ic])===String(b.id)){
          // Calendar sync: create/update event if followUpDate changed
          if(b.followUpDate){
            try{
              const calIdCol=h.indexOf('calendarEventId');
              const oldCalId=calIdCol>=0?String(rows[i][calIdCol]||''):'';
              const evDate=new Date(b.followUpDate);
              const title='Seguimiento: '+(b.name||'Lead');
              let calEventId=oldCalId;
              if(calEventId){
                try{
                  const ev=CalendarApp.getEventById(calEventId);
                  if(ev){ev.setTitle(title);ev.setAllDayDate(evDate);}
                  else calEventId=''; // event was deleted externally — recreate below
                }catch(ce){calEventId='';}
              }
              if(!calEventId){
                try{
                  const ev=CalendarApp.getDefaultCalendar().createAllDayEvent(title,evDate,{description:'CRM Lead ID: '+b.id});
                  calEventId=ev.getId();
                }catch(ce){Logger.log('Calendar create error: '+ce.message);}
              }
              b.calendarEventId=calEventId;
            }catch(ce){Logger.log('Calendar error: '+ce.message);}
          }
          h.forEach((col,ci)=>{
            if(Object.prototype.hasOwnProperty.call(b,col)){
              s.getRange(i+1,ci+1).setValue((col==='notes'||col==='workHistory')?JSON.stringify(b[col]||[]):(b[col]??''));
            }
          });
          s.getRange(i+1,h.indexOf('updatedAt')+1).setValue(new Date().toISOString());
          break;
        }
      }
      return ok({updated:true,calendarEventId:b.calendarEventId||''});
    }
    if (a === 'delete') {
      const s=getSheet(SHEETS.leads,LEAD_HDR),rows=s.getDataRange().getValues(),h=rows[0],ic=h.indexOf('id');
      for(let i=rows.length-1;i>=1;i--){if(String(rows[i][ic])===String(b.id)){s.deleteRow(i+1);break;}}
      return ok({deleted:true});
    }
    if (a === 'saveCall') {
      getSheet(SHEETS.calls,CALL_HDR).appendRow(CALL_HDR.map(h=>b[h]??''));
      return ok({saved:true});
    }
    if (a === 'saveTeamMember') {
      const s=getSheet(SHEETS.team,TEAM_HDR),rows=s.getDataRange().getValues(),h=rows[0]||TEAM_HDR,ic=h.indexOf('id');
      let found=false;
      for(let i=1;i<rows.length;i++){
        if(String(rows[i][ic])===String(b.id)){
          h.forEach((col,ci)=>{if(Object.prototype.hasOwnProperty.call(b,col))s.getRange(i+1,ci+1).setValue(b[col]??'');});
          found=true;break;
        }
      }
      if(!found)s.appendRow(TEAM_HDR.map(h=>b[h]??''));
      return ok({saved:true,updated:found});
    }
    if (a === 'saveCommission') {
      const s=getSheet(SHEETS.commissions,COMM_HDR),rows=s.getDataRange().getValues();
      const h=rows[0]||COMM_HDR,lc=h.indexOf('leadId');
      // Allow clawback records even when a commission for the same lead already exists
      if(!b.isClawback){
        const exists=rows.slice(1).some(r=>String(r[lc])===String(b.leadId));
        if(exists)return ok({saved:false,duplicate:true});
      }
      s.appendRow(COMM_HDR.map(col=>b[col]??''));
      return ok({saved:true,duplicate:false});
    }
    if (a === 'cancelCommission') {
      const s=getSheet(SHEETS.commissions,COMM_HDR),rows=s.getDataRange().getValues(),h=rows[0];
      const ic=h.indexOf('id'),sc=h.indexOf('status'),rc=h.indexOf('refundReason'),ac=h.indexOf('adjustedBy'),atc=h.indexOf('adjustedAt');
      for(let i=1;i<rows.length;i++){
        if(String(rows[i][ic])===String(b.id)){
          s.getRange(i+1,sc+1).setValue('cancelled');
          if(rc>=0)s.getRange(i+1,rc+1).setValue(b.reason||'');
          if(ac>=0)s.getRange(i+1,ac+1).setValue(b.adjustedBy||'');
          if(atc>=0)s.getRange(i+1,atc+1).setValue(new Date().toISOString());
          break;
        }
      }
      return ok({updated:true});
    }
    if (a === 'adjustCollected') {
      const ls=getSheet(SHEETS.leads,LEAD_HDR),lrows=ls.getDataRange().getValues(),lh=lrows[0];
      const lidx=lh.indexOf('id'),cidx=lh.indexOf('collectedAmount');
      if(cidx>=0){
        for(let i=1;i<lrows.length;i++){
          if(String(lrows[i][lidx])===String(b.leadId)){
            ls.getRange(i+1,cidx+1).setValue(b.collected??'');
            break;
          }
        }
      }
      // Also update matching pending commission rows
      const cs=getSheet(SHEETS.commissions,COMM_HDR),crows=cs.getDataRange().getValues(),ch=crows[0];
      const clid=ch.indexOf('leadId'),cst=ch.indexOf('status'),cca=ch.indexOf('collectedAmount');
      if(cca>=0){
        for(let i=1;i<crows.length;i++){
          if(String(crows[i][clid])===String(b.leadId)&&String(crows[i][cst])==='pending'){
            cs.getRange(i+1,cca+1).setValue(b.collected??'');
          }
        }
      }
      return ok({updated:true});
    }
    if (a === 'markCommissionPaid') {
      const s=getSheet(SHEETS.commissions,COMM_HDR),rows=s.getDataRange().getValues(),h=rows[0];
      const ic=h.indexOf('id'),sc=h.indexOf('status'),pc=h.indexOf('paidAt'),pbc=h.indexOf('paidBy'),rc=h.indexOf('paymentRef');
      for(let i=1;i<rows.length;i++){
        if(String(rows[i][ic])===String(b.id)){
          s.getRange(i+1,sc+1).setValue('paid');s.getRange(i+1,pc+1).setValue(new Date().toISOString());
          s.getRange(i+1,pbc+1).setValue(b.paidBy||'');s.getRange(i+1,rc+1).setValue(b.paymentRef||'');
          break;
        }
      }
      return ok({updated:true});
    }
    if (a === 'sendSMS') {
      const {to, body:msgBody} = b;
      if (!to || !msgBody) return err_('to and body required');
      const auth = Utilities.base64Encode(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN);
      const res  = UrlFetchApp.fetch(
        'https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_ACCOUNT_SID + '/Messages.json',
        {method:'post', headers:{Authorization:'Basic '+auth},
         payload:{From:TWILIO_FROM_NUMBER, To:to, Body:msgBody},
         muteHttpExceptions:true}
      );
      const d = JSON.parse(res.getContentText());
      if (d.sid) return ok({sid:d.sid});
      return err_(d.message || 'SMS failed');
    }
    if (a === 'saveInteraction') {
      // Idempotent upsert by id, under a script lock so concurrent writes for the
      // same id (optimistic → confirmed, or a parallel sync push) never duplicate a row.
      const lock = LockService.getScriptLock();
      try { lock.waitLock(10000); } catch(e) { return err_('busy'); }
      try {
        const s=getSheet(SHEETS.interactions, INTERACTION_HDR), rows=s.getDataRange().getValues();
        const h=rows[0]||INTERACTION_HDR, ic=h.indexOf('id');
        const vals=INTERACTION_HDR.map(k=> b[k] ?? '');
        for (let i=1;i<rows.length;i++){ if(String(rows[i][ic])===String(b.id)){ s.getRange(i+1,1,1,INTERACTION_HDR.length).setValues([vals]); return ok({saved:true,updated:true}); } }
        s.appendRow(vals);
        return ok({saved:true,updated:false});
      } finally { lock.releaseLock(); }
    }
    if (a === 'saveSequence') {
      // Cadence enrollment upsert by leadId (written by the Vercel engine + manual CRM pause/resume/unenroll).
      const lock = LockService.getScriptLock();
      try { lock.waitLock(10000); } catch(e) { return err_('busy'); }
      try {
        const s=getSheet(SHEETS.sequences, SEQUENCE_HDR), rows=s.getDataRange().getValues();
        const h=rows[0]||SEQUENCE_HDR, lc=h.indexOf('leadId');
        const vals=SEQUENCE_HDR.map(k=> b[k] ?? '');
        for (let i=1;i<rows.length;i++){ if(String(rows[i][lc])===String(b.leadId)){ s.getRange(i+1,1,1,SEQUENCE_HDR.length).setValues([vals]); return ok({saved:true,updated:true}); } }
        s.appendRow(vals);
        return ok({saved:true,updated:false});
      } finally { lock.releaseLock(); }
    }
    if (a === 'sendMessage') {
      // Twilio send only (SMS or WhatsApp). Persistence is via saveInteraction rows.
      const {phoneE164, channel, body:msgBody} = b;
      if (!phoneE164 || !msgBody) return err_('phoneE164 and body required');
      if (leadOptedOut(b.leadId)) return err_('lead opted out');   // server-side safety net
      const auth = Utilities.base64Encode(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN);
      const from = channel === 'whatsapp' ? 'whatsapp:' + TWILIO_FROM_WA : TWILIO_FROM_SMS_US;
      const to   = channel === 'whatsapp' ? 'whatsapp:' + phoneE164    : phoneE164;
      const res  = UrlFetchApp.fetch(
        'https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_ACCOUNT_SID + '/Messages.json',
        {method:'post', headers:{Authorization:'Basic '+auth}, payload:{From:from, To:to, Body:msgBody}, muteHttpExceptions:true}
      );
      const d = JSON.parse(res.getContentText());
      if (d.sid) return ok({sid:d.sid, status:d.status || 'sent'});
      return err_(d.message || 'send failed');
    }
    if (a === 'sendEmail') {
      // Project C — outbound email via Resend. NOTE before real go-live: append a
      // CAN-SPAM unsubscribe link + physical address, and add a bounce/complaint
      // webhook + suppression list (documented in GO-LIVE / Project 0).
      const {email, subject, body:msgBody} = b;
      if (!email || !msgBody) return err_('email and body required');
      if (leadOptedOut(b.leadId)) return err_('lead opted out');   // server-side safety net
      const res = UrlFetchApp.fetch('https://api.resend.com/emails', {
        method:'post', contentType:'application/json',
        headers:{ Authorization:'Bearer ' + RESEND_API_KEY },
        payload: JSON.stringify({ from: RESEND_FROM, to: [email], subject: subject || 'AXIUS', text: msgBody }),
        muteHttpExceptions:true,
      });
      const d = JSON.parse(res.getContentText() || '{}');
      if (d.id) return ok({sid:d.id, status:'sent'});
      return err_((d.message || (d.error && d.error.message)) || 'email failed');
    }
    if (a === 'saveReportEmail') {
      const ss=SpreadsheetApp.openById(SHEET_ID);
      let cfg=ss.getSheetByName('Config');
      if(!cfg){cfg=ss.insertSheet('Config');cfg.appendRow(['key','value']);}
      const rows=cfg.getDataRange().getValues(),h=rows[0]||['key','value'],ki=h.indexOf('key'),vi=h.indexOf('value');
      let found=false;
      for(let i=1;i<rows.length;i++){if(rows[i][ki]==='reportEmail'){cfg.getRange(i+1,vi+1).setValue(b.email||'');found=true;break;}}
      if(!found)cfg.appendRow(['reportEmail',b.email||'']);
      return ok({saved:true});
    }
    if (a === 'saveScheduledJobs') {
      const ss=SpreadsheetApp.openById(SHEET_ID);
      let cfg=ss.getSheetByName('Config');
      if(!cfg){cfg=ss.insertSheet('Config');cfg.appendRow(['key','value']);}
      const rows=cfg.getDataRange().getValues(),h=rows[0]||['key','value'],ki=h.indexOf('key'),vi=h.indexOf('value');
      let found=false;
      for(let i=1;i<rows.length;i++){if(rows[i][ki]==='scheduledJobs'){cfg.getRange(i+1,vi+1).setValue(JSON.stringify(b.jobs||[]));found=true;break;}}
      if(!found)cfg.appendRow(['scheduledJobs',JSON.stringify(b.jobs||[])]);
      return ok({saved:true});
    }
    if (a === 'runScrapesNow') {
      const res = runScheduledScrapes();   // runs all active saved jobs immediately
      return ok(res || {added:0, ranAt:new Date().toISOString()});
    }
    if (a === 'saveScript') {
      const s=getSheet(SHEETS.scripts,SCRIPT_HDR),rows=s.getDataRange().getValues(),h=rows[0]||SCRIPT_HDR,ic=h.indexOf('id');
      let found=false;
      for(let i=1;i<rows.length;i++){
        if(String(rows[i][ic])===String(b.id)){
          h.forEach((col,ci)=>{if(Object.prototype.hasOwnProperty.call(b,col))s.getRange(i+1,ci+1).setValue(b[col]??'');});
          s.getRange(i+1,h.indexOf('updatedAt')+1).setValue(new Date().toISOString());
          found=true;break;
        }
      }
      if(!found)s.appendRow(SCRIPT_HDR.map(h=>b[h]??''));
      return ok({saved:true,updated:found});
    }
    if (a === 'deleteScript') {
      const s=getSheet(SHEETS.scripts,SCRIPT_HDR),rows=s.getDataRange().getValues(),h=rows[0],ic=h.indexOf('id');
      for(let i=rows.length-1;i>=1;i--){if(String(rows[i][ic])===String(b.id)){s.deleteRow(i+1);break;}}
      return ok({deleted:true});
    }
    if (a === 'rec_hook') {
      const callSid=b.CallSid||e.parameter.CallSid, recUrl=b.RecordingUrl||e.parameter.RecordingUrl;
      if(callSid&&recUrl){ try{const du=saveToDrive(recUrl,callSid);patchCallRec(callSid,recUrl,du);}catch(ex){Logger.log(ex.message);} }
      return ok({ok:true});
    }
    if (a === 'scrape') {
      const {keyword,lat,lng,radius,maxResults,region} = b;
      const url='https://places.googleapis.com/v1/places:searchText';
      const hdr={'Content-Type':'application/json','X-Goog-Api-Key':PLACES_API_KEY,'X-Goog-FieldMask':'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,nextPageToken'};
      let body={textQuery:keyword,locationBias:{circle:{center:{latitude:parseFloat(lat),longitude:parseFloat(lng)},radius:parseFloat(radius)}},maxResultCount:20};
      if(region)body.regionCode=region;
      const MAX_API_CALLS = 15; // Guard against quota exhaustion
      let leads=[],token=null,tries=0,apiCalls=0;
      while(leads.length<(maxResults||100)&&tries<10&&apiCalls<MAX_API_CALLS){
        if(token)body={textQuery:keyword,pageToken:token};
        const r=UrlFetchApp.fetch(url,{method:'post',headers:hdr,payload:JSON.stringify(body),muteHttpExceptions:true});
        apiCalls++;
        const d=JSON.parse(r.getContentText());
        if(d.error)return err_(d.error.message);
        (d.places||[]).forEach(p=>{ if(leads.length<maxResults)leads.push({name:p.displayName?.text||'N/A',phone:p.nationalPhoneNumber||'N/A',address:p.formattedAddress||'N/A',website:p.websiteUri||'N/A',rating:p.rating||'N/A',reviews:p.userRatingCount||'N/A'}); });
        token=d.nextPageToken; tries++;
        if(!token)break;
        Utilities.sleep(2000);
      }
      return ok({leads,truncated:apiCalls>=MAX_API_CALLS});
    }
    if (a === 'setTrigger') {
      const fn = b.fn;
      if (fn !== 'runScheduledScrapes' && fn !== 'sendWeeklyReport') return err_('Invalid fn');
      ScriptApp.getProjectTriggers()
        .filter(t => t.getHandlerFunction() === fn)
        .forEach(t => ScriptApp.deleteTrigger(t));
      if (b.enabled) {
        if (fn === 'runScheduledScrapes') {
          ScriptApp.newTrigger(fn).timeBased().everyDays(1).atHour(6).inTimezone('America/Bogota').create();
        } else if (fn === 'sendWeeklyReport') {
          ScriptApp.newTrigger(fn).timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).inTimezone('America/Bogota').create();
        }
      }
      return ok({set: b.enabled, fn});
    }
    if (a === 'inbound') {
      // Warm inbound lead (website AI chat / Telegram / forms). Identity may be a
      // phone OR an email OR an externalId (e.g. Telegram chat id) — phone is NOT
      // required, unlike cold scraped leads. Dedupe across any matching identity.
      const s=getSheet(SHEETS.leads,LEAD_HDR),rows=s.getDataRange().getValues();
      const hh=rows[0]||LEAD_HDR, pc=hh.indexOf('phone'), ec=hh.indexOf('email'), xc=hh.indexOf('externalId');
      const phone=String(b.phone||'').trim();
      const email=String(b.email||'').trim().toLowerCase();
      const extId=String(b.externalId||'').trim();
      const pk=phoneKey(phone);
      if(!pk && !email && !extId) return err_('identity required: phone, email or externalId');
      const duplicate=rows.slice(1).some(r=>{
        const rpk=phoneKey(r[pc]);
        const rem=ec>=0?String(r[ec]||'').trim().toLowerCase():'';
        const rx =xc>=0?String(r[xc]||'').trim():'';
        return (pk&&rpk===pk)||(email&&rem===email)||(extId&&rx===extId);
      });
      if(duplicate) return ok({added:false,duplicate:true});
      const now=new Date().toISOString();
      const firstMsg=String(b.message||'').trim();
      const notes=firstMsg?[{date:now,text:'Mensaje inicial ('+(b.source||'Inbound')+'): '+firstMsg}]:[];
      const lead={
        id:b.id||Utilities.getUuid(),
        name:b.name||'Sin nombre',phone:phone||'N/A',email,externalId:extId,
        address:b.address||'N/A',website:b.website||'N/A',
        rating:'N/A',reviews:'N/A',
        country:b.country||'',city:b.city||'',barrio:b.barrio||'',keyword:b.keyword||'',
        source:b.source||'Inbound',sourceDetail:b.sourceDetail||'',
        status:b.status||'Nuevo',dncReason:'',followUpDate:'',
        notes:JSON.stringify(notes),
        providerId:b.providerId||'',providerRate:b.providerRate||0,
        closerId:b.closerId||'',closerRate:b.closerRate||0,
        dealValue:'',providerCommission:'',closerCommission:'',commissionStatus:'',
        lockedBy:'',lockedUntil:'',assignedAt:'',
        workHistory:JSON.stringify([]),
        importedAt:now,updatedAt:now,
      };
      s.appendRow(LEAD_HDR.map(h=>lead[h]??''));
      return ok({added:true,duplicate:false,id:lead.id});
    }
    return ok({received:true});
  } catch(err) { return err_(err.message) }
}

function createToken(identity){
  const now=Math.floor(Date.now()/1000);
  const b64=o=>Utilities.base64EncodeWebSafe(JSON.stringify(o)).replace(/=+$/,'');
  const h=b64({alg:'HS256',typ:'JWT',cty:'twilio-fpa;v=1'});
  const p=b64({jti:TWILIO_API_KEY_SID+'-'+now,iss:TWILIO_API_KEY_SID,sub:TWILIO_ACCOUNT_SID,exp:now+3600,grants:{identity,voice:{incoming:{allow:true},outgoing:{application_sid:TWILIO_TWIML_APP}}}});
  const sig=Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(h+'.'+p,TWILIO_API_SECRET)).replace(/=+$/,'');
  return h+'.'+p+'.'+sig;
}

function saveToDrive(recUrl,callSid){
  const auth=Utilities.base64Encode(TWILIO_ACCOUNT_SID+':'+TWILIO_AUTH_TOKEN);
  const res=UrlFetchApp.fetch(recUrl+'.mp3',{headers:{Authorization:'Basic '+auth},muteHttpExceptions:true});
  const f=DriveApp.getFolderById(DRIVE_FOLDER_ID).createFile(callSid+'.mp3',res.getBlob().setName(callSid+'.mp3'));
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?export=preview&id='+f.getId();
}

function patchCallRec(callSid,recUrl,driveUrl){
  const s=getSheet(SHEETS.calls,CALL_HDR),rows=s.getDataRange().getValues(),h=rows[0];
  const sc=h.indexOf('callSid'),rc=h.indexOf('recordingUrl'),dc=h.indexOf('driveUrl');
  for(let i=1;i<rows.length;i++){if(rows[i][sc]===callSid){s.getRange(i+1,rc+1).setValue(recUrl);s.getRange(i+1,dc+1).setValue(driveUrl);break;}}
}

// ── Weekly report (time-triggered) ─────────────────────────
// Admin adds time trigger: Triggers → sendWeeklyReport → Time-based → Week timer → Monday 8am
function sendWeeklyReport() {
  const ss  = SpreadsheetApp.openById(SHEET_ID);
  const cfg = ss.getSheetByName('Config');
  let recipientEmail = '';
  if (cfg) {
    const rows = cfg.getDataRange().getValues(), h = rows[0] || ['key','value'];
    const ki = h.indexOf('key'), vi = h.indexOf('value');
    const r  = rows.slice(1).find(r => r[ki] === 'reportEmail');
    recipientEmail = r ? r[vi] : '';
  }
  if (!recipientEmail) { Logger.log('No reportEmail configured in Config sheet.'); return; }

  const leads      = toObjs(getSheet(SHEETS.leads, LEAD_HDR));
  const calls      = toObjs(getSheet(SHEETS.calls, CALL_HDR));
  const now        = new Date();
  const weekAgo    = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const newLeads   = leads.filter(l => new Date(l.importedAt) >= weekAgo).length;
  const weekCalls  = calls.filter(c => new Date(c.calledAt)  >= weekAgo);
  const answered   = weekCalls.filter(c => c.outcome === 'answered').length;
  const closedAll  = leads.filter(l => l.status === 'Cerrado').length;
  const interAll   = leads.filter(l => l.status === 'Interesado').length;
  const dncAll     = leads.filter(l => l.status === 'No llamar').length;
  const ansRate    = weekCalls.length ? Math.round(answered / weekCalls.length * 100) : 0;
  const byStatus   = {};
  leads.forEach(l => { byStatus[l.status] = (byStatus[l.status]||0) + 1; });

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e">
  <div style="background:linear-gradient(135deg,#0f0f23,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0">
    <h2 style="color:#fff;margin:0;font-size:20px">AXIUS CRM — Reporte Semanal</h2>
    <p style="color:rgba(255,255,255,.6);margin:6px 0 0;font-size:13px">${now.toLocaleDateString('es-CO',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
  </div>
  <div style="background:#f9f9fb;padding:24px 32px;border-radius:0 0 12px 12px">
    <h3 style="font-size:14px;color:#888;text-transform:uppercase;letter-spacing:.8px;margin:0 0 16px">Esta semana</h3>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px">
      <div style="background:#fff;border-radius:8px;padding:14px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        <div style="font-size:28px;font-weight:700;color:#4b72ff">${newLeads}</div>
        <div style="font-size:11px;color:#888;margin-top:4px">Leads nuevos</div>
      </div>
      <div style="background:#fff;border-radius:8px;padding:14px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        <div style="font-size:28px;font-weight:700;color:#2dd4bf">${weekCalls.length}</div>
        <div style="font-size:11px;color:#888;margin-top:4px">Llamadas</div>
      </div>
      <div style="background:#fff;border-radius:8px;padding:14px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        <div style="font-size:28px;font-weight:700;color:#22c55e">${ansRate}%</div>
        <div style="font-size:11px;color:#888;margin-top:4px">Tasa respuesta</div>
      </div>
    </div>
    <h3 style="font-size:14px;color:#888;text-transform:uppercase;letter-spacing:.8px;margin:0 0 12px">Acumulado total</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="background:#f0f0f5"><td style="padding:8px 12px;border-radius:6px">Total leads</td><td style="padding:8px 12px;text-align:right;font-weight:600">${leads.length}</td></tr>
      <tr><td style="padding:8px 12px">Cerrados</td><td style="padding:8px 12px;text-align:right;font-weight:600;color:#22c55e">${closedAll}</td></tr>
      <tr style="background:#f0f0f5"><td style="padding:8px 12px;border-radius:6px">Interesados</td><td style="padding:8px 12px;text-align:right;font-weight:600;color:#2dd4bf">${interAll}</td></tr>
      <tr><td style="padding:8px 12px">No llamar</td><td style="padding:8px 12px;text-align:right;color:#888">${dncAll}</td></tr>
    </table>
  </div>
  <p style="font-size:11px;color:#aaa;text-align:center;margin-top:16px">Generado automaticamente por AXIUS CRM</p>
</div>`;

  MailApp.sendEmail({
    to: recipientEmail,
    subject: 'AXIUS CRM — Reporte semanal ' + now.toLocaleDateString('es-CO'),
    htmlBody: html,
  });
  Logger.log('Weekly report sent to ' + recipientEmail);
}

// ── Scheduled scraper (time-triggered) ─────────────────────
// Admin adds time trigger: Triggers → runScheduledScrapes → Time-based → Every day 6am
function runScheduledScrapes() {
  const ss   = SpreadsheetApp.openById(SHEET_ID);
  const cfg  = ss.getSheetByName('Config');
  if (!cfg) return;
  const rows = cfg.getDataRange().getValues();
  const hi   = rows[0];
  const ki   = hi.indexOf('key'), vi = hi.indexOf('value');
  const find = key => { const r = rows.slice(1).find(r => r[ki] === key); return r ? r[vi] : ''; };
  const jobsRaw = find('scheduledJobs');
  if (!jobsRaw) return;
  let jobs;
  try { jobs = JSON.parse(jobsRaw); } catch(e) { return; }
  if (!Array.isArray(jobs) || !jobs.length) return;

  const leadsSheet = getSheet(SHEETS.leads, LEAD_HDR);
  const lRows      = leadsSheet.getDataRange().getValues();
  const ph         = lRows[0] || LEAD_HDR, pc = ph.indexOf('phone');
  const existing   = new Set(lRows.slice(1).map(r => phoneKey(r[pc])).filter(Boolean));

  const url = 'https://places.googleapis.com/v1/places:searchText';
  const hdr = {'Content-Type':'application/json','X-Goog-Api-Key':PLACES_API_KEY,
    'X-Goog-FieldMask':'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount'};

  const now = new Date().toISOString();
  let totalAdded = 0;

  jobs.filter(j => j.active).forEach(job => {
    let leads = [], token = null, tries = 0;
    const max = parseInt(job.maxResults) || 50;
    while (leads.length < max && tries < 10) {
      const body = token
        ? {textQuery:job.keyword, pageToken:token}
        : {textQuery:job.keyword, locationBias:{circle:{center:{latitude:parseFloat(job.lat),longitude:parseFloat(job.lng)},radius:parseFloat(job.radius||1000)}},maxResultCount:20, ...(job.region?{regionCode:job.region}:{})};
      const r = UrlFetchApp.fetch(url,{method:'post',headers:hdr,payload:JSON.stringify(body),muteHttpExceptions:true});
      const d = JSON.parse(r.getContentText());
      (d.places||[]).forEach(p => {
        if(leads.length < max) leads.push({
          name:p.displayName?.text||'N/A', phone:p.nationalPhoneNumber||'N/A',
          address:p.formattedAddress||'N/A', website:p.websiteUri||'N/A',
          rating:p.rating||'N/A', reviews:p.userRatingCount||'N/A'
        });
      });
      token = d.nextPageToken; tries++;
      if (!token) break;
      Utilities.sleep(2000);
    }
    leads.forEach(l => {
      const phone = String(l.phone||'').trim();
      const key   = phoneKey(phone);
      if (phone && phone !== 'N/A' && key && !existing.has(key)) {
        const lead = {
          id:Utilities.getUuid(), name:l.name, phone, address:l.address, website:l.website,
          rating:l.rating, reviews:l.reviews, country:job.country||'', city:job.city||'', barrio:job.barrio||'',
          keyword:job.keyword, source:job.source||'Scraper (auto)', sourceDetail:'',
          status:'Nuevo', dncReason:'', followUpDate:'', notes:JSON.stringify([]),
          providerId:'', providerRate:0, closerId:'', closerRate:0,
          dealValue:'', providerCommission:'', closerCommission:'', commissionStatus:'',
          lockedBy:'', lockedUntil:'', assignedAt:'', workHistory:JSON.stringify([]),
          importedAt:now, updatedAt:now
        };
        leadsSheet.appendRow(LEAD_HDR.map(h => lead[h] ?? ''));
        existing.add(key);
        totalAdded++;
      }
    });
  });
  const ranAt = new Date().toISOString();
  cfgSet('lastScrapeRun', JSON.stringify({ranAt, added: totalAdded}));
  Logger.log('Scheduled scrape complete. Added: ' + totalAdded + ' leads.');
  return {added: totalAdded, ranAt};
}

function ok(d){return ContentService.createTextOutput(JSON.stringify({success:true,...d})).setMimeType(ContentService.MimeType.JSON)}
function err_(m,code){return ContentService.createTextOutput(JSON.stringify({success:false,error:m,code:code||500,timestamp:new Date().toISOString()})).setMimeType(ContentService.MimeType.JSON)}

// Phone dedup key: last 10 digits of the numeric-only string. Collapses
// +57 / +1 / spacing / leading-zero formatting so the same number isn't
// re-added in a different format. '' when fewer than 10 digits (e.g. 'N/A').
function phoneKey(p){ const d=String(p||'').replace(/\D/g,''); return d.length>=10?d.slice(-10):''; }

// Config sheet key/value helpers (single source for scheduledJobs, lastScrapeRun, etc.)
function cfgGet(key){
  const ss=SpreadsheetApp.openById(SHEET_ID), cfg=ss.getSheetByName('Config');
  if(!cfg) return '';
  const rows=cfg.getDataRange().getValues(), h=rows[0]||[], ki=h.indexOf('key'), vi=h.indexOf('value');
  const r=rows.slice(1).find(r=>r[ki]===key); return r?r[vi]:'';
}
function cfgSet(key,val){
  const ss=SpreadsheetApp.openById(SHEET_ID); let cfg=ss.getSheetByName('Config');
  if(!cfg){cfg=ss.insertSheet('Config');cfg.appendRow(['key','value']);}
  const rows=cfg.getDataRange().getValues(), h=rows[0]||['key','value'], ki=h.indexOf('key'), vi=h.indexOf('value');
  for(let i=1;i<rows.length;i++){ if(rows[i][ki]===key){ cfg.getRange(i+1,vi+1).setValue(val); return; } }
  cfg.appendRow([key,val]);
}
