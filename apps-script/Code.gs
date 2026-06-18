// AXIUS CRM — Apps Script v4
// Fill in ALL the constants before deploying

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
const TELEGRAM_ALERT_BOT_TOKEN = 'TU_TELEGRAM_BOT_TOKEN';  // founder alerts — @BotFather token
const TELEGRAM_ALERT_CHAT_ID   = 'TU_TELEGRAM_CHAT_ID';    // your personal chat id (from getUpdates)

// ── CADENCE ENGINE config (Cadence Engine) ────────────────────────────
// Autonomous templated outreach (deterministic; no LLM). SAFETY: inert until
// CADENCE_ENABLED = true. While false the engine DRY-RUNS — it logs what it
// WOULD enroll/send (Logger + Config 'lastCadenceRun') but writes NO sequence
// rows and sends NOTHING. Go live AFTER provisioning (10DLC / WhatsApp
// templates): set CADENCE_ENABLED = true AND enable the hourly trigger for
// runCadence (CRM Admin → Automated sequences, or Triggers → runCadence).
const CADENCE_ENABLED          = false;   // master switch (false = dry-run, sends nothing)
const CADENCE_COMPANY          = 'AXIUS'; // {empresa} token
const CADENCE_AGENT_NAME       = 'Andrés';// {agente} token — the sending persona name
const CADENCE_DAILY_CAP        = 200;     // max sends per day
const CADENCE_STEP_GAP_DAYS    = 2;       // min days between proactive touches
const CADENCE_FIRST_SPREAD_MIN = 360;     // spread first touches over N minutes (anti-burst)
const CADENCE_GAP_MS           = CADENCE_STEP_GAP_DAYS * 24 * 3600 * 1000;
// CAN-SPAM: every commercial email MUST carry a working unsubscribe + a physical
// postal address. Fill this before sending real email. Appended to ALL outbound
// email in resendSend_. (Automated suppression via a Resend bounce/complaint
// webhook is still a separate follow-up — see GO-LIVE §1.)
const COMPANY_POSTAL_ADDRESS   = 'TU_DIRECCION_POSTAL';   // e.g. 'AXIUS, Calle 00 #00-00, Medellín, Colombia'

const SHEETS = { leads:'Leads', calls:'Llamadas', team:'Team', commissions:'Commissions', scripts:'Scripts', interactions:'Interactions', sequences:'Sequences' };

// CSRF protection — paste the value from your browser's Setup page
const CRM_SECRET = 'PASTE_YOUR_CRM_SECRET_HERE'; // Setup → shows after first load

const LEAD_HDR = ['id','name','phone','address','website','rating','reviews','city','barrio','keyword','source','sourceDetail','status','providerId','providerRate','closerId','closerRate','dealValue','collectedAmount','providerCommission','closerCommission','commissionStatus','lockedBy','lockedUntil','assignedAt','workHistory','dncReason','followUpDate','notes','importedAt','updatedAt','calendarEventId','refundAmount','refundReason','refundedAt','country','email','externalId','lastTouchAt','lastReplyAt','consentSms','consentWhatsapp','consentEmail','lat','lng'];
const CALL_HDR = ['id','leadId','leadName','phone','callSid','outcome','duration','notes','recordingUrl','driveUrl','consentConfirmed','calledAt'];
const TEAM_HDR = ['id','name','role','pinHash','providerRate','closerRate','contact','active','createdAt'];
const COMM_HDR   = ['id','leadId','leadName','dealValue','collectedAmount','providerId','providerRate','providerAmount','closerId','closerRate','closerAmount','status','createdAt','paidAt','paidBy','paymentRef','refundReason','adjustedBy','adjustedAt','providerName','closerName','recurring','period'];
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
// Founder/admin alert to Telegram (fire-and-forget; inert until token+chat id set).
function notifyTelegram(text){
  if(!TELEGRAM_ALERT_BOT_TOKEN || TELEGRAM_ALERT_BOT_TOKEN.indexOf('TU_')===0 || !TELEGRAM_ALERT_CHAT_ID || TELEGRAM_ALERT_CHAT_ID.indexOf('TU_')===0) return;
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot'+TELEGRAM_ALERT_BOT_TOKEN+'/sendMessage', {
      method:'post', contentType:'application/json',
      payload: JSON.stringify({ chat_id: TELEGRAM_ALERT_CHAT_ID, text: String(text||'').slice(0,3500), disable_web_page_preview:true }),
      muteHttpExceptions:true,
    });
  } catch(e) {}
}

// Server-side safety net: is this lead opted out / No-llamar? (defense-in-depth for sends)
function leadOptedOut(leadId){
  if(!leadId) return false;
  const ss=SpreadsheetApp.openById(SHEET_ID), s=ss.getSheetByName(SHEETS.leads);
  if(!s) return false;
  const rows=s.getDataRange().getValues(), h=rows[0]||LEAD_HDR, ic=h.indexOf('id'), stc=h.indexOf('status');
  for(let i=1;i<rows.length;i++){ if(String(rows[i][ic])===String(leadId)) return String(rows[i][stc])==='Do Not Call'; }
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
      let lastCadenceRun = null; try { const raw = cfgGet('lastCadenceRun'); if (raw) lastCadenceRun = JSON.parse(raw); } catch(e) {}
      return ok({
        scrapeTrigger: triggers.some(t => t.getHandlerFunction() === 'runScheduledScrapes'),
        reportTrigger: triggers.some(t => t.getHandlerFunction() === 'sendWeeklyReport'),
        cadenceTrigger: triggers.some(t => t.getHandlerFunction() === 'runCadence'),
        cadenceEnabled: getCadenceCfg_().enabled,
        cadenceConfig: getCadenceCfg_(),
        lastScrapeRun, lastCadenceRun,
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
      // Match ALL leads sharing this phone (a number can belong to >1 lead row);
      // opt-out must silence every one of them, not just the most recent.
      const matchRows=[]; let leadId='', leadName='';
      for (let i=1;i<lr.length;i++){ if (fromKey && phoneKey(lr[i][pc])===fromKey) { matchRows.push(i); leadId=lr[i][ic]; leadName=lr[i][nc]; } } // leadId/Name = most recent match (for the alert)
      const now = new Date().toISOString();
      const rec = { id:Utilities.getUuid(), leadId, leadName, phone:from, channel, direction:'in', body:text, stepTag:'', status:'received', sid:String(e.parameter.MessageSid||''), error:'', createdAt:now, createdBy:'inbound' };
      getSheet(SHEETS.interactions, INTERACTION_HDR).appendRow(INTERACTION_HDR.map(k => rec[k] ?? ''));
      const optOut = isOptOutGs(text);
      matchRows.forEach(function(row){
        if (rc>=0) ls.getRange(row+1, rc+1).setValue(now);
        if (uc>=0) ls.getRange(row+1, uc+1).setValue(now); // bump updatedAt so the reply/opt-out surfaces in since-filtered pulls
        if (optOut) {
          if (stc>=0) ls.getRange(row+1, stc+1).setValue('Do Not Call');
          if (dc>=0)  ls.getRange(row+1, dc+1).setValue('opt-out ('+channel+')');
          if (channel==='whatsapp' && cwa>=0) ls.getRange(row+1, cwa+1).setValue(false);
          if (channel==='sms' && csms>=0)     ls.getRange(row+1, csms+1).setValue(false);
        }
      });
      const who = leadName || from;
      if (isOptOutGs(text)) notifyTelegram('Opt-out — ' + who + ' (' + channel + ') asked to stop receiving messages.');
      else notifyTelegram('Reply from ' + who + ' (' + channel + '): ' + text);
      return ContentService.createTextOutput('<?xml version="1.0"?><Response></Response>').setMimeType(ContentService.MimeType.XML);
    }

    const b = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (b._secret !== CRM_SECRET) {
      return err_('Unauthorized — set CRM_SECRET in Code.gs to the value from Setup.');
    }
    if (a === 'push') {
      // Dedup by id (the lead's stable unique key), NOT by phone. Phone-keying
      // silently dropped every lead with a blank/'N/A' phone — they all collide
      // on '' — losing them permanently. The client already dedups by phone at
      // import, so the server only needs to avoid inserting the same id twice.
      const s=getSheet(SHEETS.leads,LEAD_HDR),rows=s.getDataRange().getValues();
      const hh=rows[0]||LEAD_HDR, ic=hh.indexOf('id');
      const ex=new Set(rows.slice(1).map(r=>String(r[ic]).trim()));
      let added=0;
      (b.data||[]).forEach(l=>{
        const id=String(l.id||'').trim();
        if(id && !ex.has(id)){
          s.appendRow(LEAD_HDR.map(h=>(h==='notes'||h==='workHistory')?JSON.stringify(l[h]||[]):(l[h]??'')));
          ex.add(id); added++;
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
              const title='Follow-up: '+(b.name||'Lead');
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
      // Lock the read-check-append so two simultaneous "mark closed" actions on
      // the same lead can't both pass the dup check and write two payout rows.
      const lock=LockService.getScriptLock();
      try{ lock.waitLock(10000); }catch(e){ return err_('busy'); }
      try{
        const s=getSheet(SHEETS.commissions,COMM_HDR),rows=s.getDataRange().getValues();
        const h=rows[0]||COMM_HDR,lc=h.indexOf('leadId'),pc=h.indexOf('period');
        // Dedup by leadId + period: one-time commissions use an empty period (one
        // row per lead), recurring/residual rows use 'YYYY-MM' (one row per lead
        // per period). Clawbacks are always allowed through.
        if(!b.isClawback){
          const key=String(b.leadId)+'|'+String(b.period||'');
          const exists=rows.slice(1).some(r=>(String(r[lc])+'|'+String(pc>=0?(r[pc]||''):''))===key);
          if(exists)return ok({saved:false,duplicate:true});
        }
        s.appendRow(COMM_HDR.map(col=>b[col]??''));
        return ok({saved:true,duplicate:false});
      } finally { lock.releaseLock(); }
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
        const vals=h.map(k=> b[k] ?? '');   // write by ACTUAL header order (getSheet may have reconciled columns)
        for (let i=1;i<rows.length;i++){ if(String(rows[i][ic])===String(b.id)){ s.getRange(i+1,1,1,h.length).setValues([vals]); return ok({saved:true,updated:true}); } }
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
        const vals=h.map(k=> b[k] ?? '');   // write by ACTUAL header order (getSheet may have reconciled columns)
        for (let i=1;i<rows.length;i++){ if(String(rows[i][lc])===String(b.leadId)){ s.getRange(i+1,1,1,h.length).setValues([vals]); return ok({saved:true,updated:true}); } }
        s.appendRow(vals);
        return ok({saved:true,updated:false});
      } finally { lock.releaseLock(); }
    }
    if (a === 'sendMessage') {
      // Twilio send only (SMS or WhatsApp). Persistence is via saveInteraction rows.
      const {phoneE164, channel, body:msgBody} = b;
      if (!phoneE164 || !msgBody) return err_('phoneE164 and body required');
      if (leadOptedOut(b.leadId)) return err_('lead opted out');   // server-side safety net
      const r = twilioSend_(phoneE164, channel, msgBody);
      return r.sid ? ok({sid:r.sid, status:r.status}) : err_(r.error || 'send failed');
    }
    if (a === 'sendEmail') {
      // Project C — outbound email via Resend. NOTE before real go-live: append a
      // CAN-SPAM unsubscribe link + physical address, and add a bounce/complaint
      // webhook + suppression list (documented in GO-LIVE / Project 0).
      const {email, subject, body:msgBody} = b;
      if (!email || !msgBody) return err_('email and body required');
      if (leadOptedOut(b.leadId)) return err_('lead opted out');   // server-side safety net
      const r = resendSend_(email, subject, msgBody);
      return r.sid ? ok({sid:r.sid, status:r.status}) : err_(r.error || 'email failed');
    }
    if (a === 'runCadenceNow') {
      // On-demand cadence pass (dry-run while CADENCE_ENABLED=false). Lets the
      // CRM admin preview/verify enrollment + intended sends without waiting for
      // the hourly trigger.
      return ok(runCadence() || {});
    }
    if (a === 'saveCadenceConfig') {
      // Operator-tunable cadence config (CRM admin UI). Validated + clamped, then
      // persisted as one Config blob that getCadenceCfg_ layers over the defaults.
      const c = b.config || {};
      const intIn = (v, d, lo, hi) => { const n = parseInt(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
      const clean = {
        enabled:    c.enabled === true,
        dailyCap:   intIn(c.dailyCap, CADENCE_DAILY_CAP, 1, 5000),
        agentName:  String(c.agentName || '').slice(0, 60),
        company:    String(c.company   || '').slice(0, 80),
        gapDays:    intIn(c.gapDays,   CADENCE_STEP_GAP_DAYS, 1, 30),
        spreadMin:  intIn(c.spreadMin, CADENCE_FIRST_SPREAD_MIN, 0, 1440),
        quietStart: intIn(c.quietStart, 8, 0, 23),
        quietEnd:   intIn(c.quietEnd, 20, 1, 24),
        postalAddress: String(c.postalAddress || '').slice(0, 200),
      };
      cfgSet('cadenceConfig', JSON.stringify(clean));
      return ok({ saved:true, config: getCadenceCfg_() });
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
      const hdr={'Content-Type':'application/json','X-Goog-Api-Key':PLACES_API_KEY,'X-Goog-FieldMask':'places.displayName,places.formattedAddress,places.addressComponents,places.location,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,nextPageToken'};
      const baseBody={textQuery:keyword,locationBias:{circle:{center:{latitude:parseFloat(lat),longitude:parseFloat(lng)},radius:parseFloat(radius)}},maxResultCount:20};
      if(region)baseBody.regionCode=region;
      const MAX_API_CALLS = 15; // Guard against quota exhaustion
      // Pull the REAL neighborhood + city from each place's address components so
      // the stored label is where the business actually is, not the searched area.
      const comp_=(p,types)=>{ const c=(p.addressComponents||[]).find(x=>(x.types||[]).some(t=>types.indexOf(t)>=0)); return c?(c.longText||c.shortText||''):''; };
      let leads=[],token=null,tries=0,apiCalls=0;
      while(leads.length<(maxResults||100)&&tries<10&&apiCalls<MAX_API_CALLS){
        // Paging requests must repeat ALL original params + the pageToken (Places API New rule)
        const body = token ? {...baseBody, pageToken:token} : baseBody;
        const r=UrlFetchApp.fetch(url,{method:'post',headers:hdr,payload:JSON.stringify(body),muteHttpExceptions:true});
        apiCalls++;
        const d=JSON.parse(r.getContentText());
        if(d.error)return err_(d.error.message);
        (d.places||[]).forEach(p=>{ if(leads.length<maxResults)leads.push({name:p.displayName?.text||'N/A',phone:p.nationalPhoneNumber||'N/A',address:p.formattedAddress||'N/A',website:p.websiteUri||'N/A',rating:p.rating||'N/A',reviews:p.userRatingCount||'N/A',neighborhood:comp_(p,['neighborhood','sublocality','sublocality_level_1']),cityReal:comp_(p,['locality','postal_town']),lat:p.location?.latitude??'',lng:p.location?.longitude??''}); });
        token=d.nextPageToken; tries++;
        if(!token)break;
        Utilities.sleep(2000);
      }
      return ok({leads,truncated:apiCalls>=MAX_API_CALLS});
    }
    if (a === 'setTrigger') {
      const fn = b.fn;
      if (fn !== 'runScheduledScrapes' && fn !== 'sendWeeklyReport' && fn !== 'runCadence') return err_('Invalid fn');
      ScriptApp.getProjectTriggers()
        .filter(t => t.getHandlerFunction() === fn)
        .forEach(t => ScriptApp.deleteTrigger(t));
      if (b.enabled) {
        if (fn === 'runScheduledScrapes') {
          ScriptApp.newTrigger(fn).timeBased().everyDays(1).atHour(6).inTimezone('America/New_York').create();
        } else if (fn === 'sendWeeklyReport') {
          ScriptApp.newTrigger(fn).timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).inTimezone('America/New_York').create();
        } else if (fn === 'runCadence') {
          ScriptApp.newTrigger(fn).timeBased().everyHours(1).create();
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
      const notes=firstMsg?[{date:now,text:'Initial message ('+(b.source||'Inbound')+'): '+firstMsg}]:[];
      const lead={
        id:b.id||Utilities.getUuid(),
        name:b.name||'No name',phone:phone||'N/A',email,externalId:extId,
        address:b.address||'N/A',website:b.website||'N/A',
        rating:'N/A',reviews:'N/A',
        country:b.country||'',city:b.city||'',barrio:b.barrio||'',keyword:b.keyword||'',
        source:b.source||'Inbound',sourceDetail:b.sourceDetail||'',
        status:b.status||'New',dncReason:'',followUpDate:'',
        notes:JSON.stringify(notes),
        providerId:b.providerId||'',providerRate:b.providerRate||0,
        closerId:b.closerId||'',closerRate:b.closerRate||0,
        dealValue:'',providerCommission:'',closerCommission:'',commissionStatus:'',
        lockedBy:'',lockedUntil:'',assignedAt:'',
        workHistory:JSON.stringify([]),
        importedAt:now,updatedAt:now,
      };
      s.appendRow(LEAD_HDR.map(h=>lead[h]??''));
      notifyTelegram('New lead — ' + (lead.name||'No name') + ' · ' + (lead.source||'Inbound') + (lead.city?(' · '+lead.city):'') + (firstMsg?('\n"'+firstMsg.slice(0,200)+'"'):''));
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
  // Call recordings are consent/PII audio — do NOT make them world-readable.
  // They stay private to the script owner; to let reps listen, share the Drive
  // folder (DRIVE_FOLDER_ID) with their Google accounts instead.
  f.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.VIEW);
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
  const closedAll  = leads.filter(l => l.status === 'Closed Won').length;
  const interAll   = leads.filter(l => l.status === 'Interested').length;
  const dncAll     = leads.filter(l => l.status === 'Do Not Call').length;
  const ansRate    = weekCalls.length ? Math.round(answered / weekCalls.length * 100) : 0;
  const byStatus   = {};
  leads.forEach(l => { byStatus[l.status] = (byStatus[l.status]||0) + 1; });

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e">
  <div style="background:linear-gradient(135deg,#0f0f23,#1a1a2e);padding:28px 32px;border-radius:12px 12px 0 0">
    <h2 style="color:#fff;margin:0;font-size:20px">AXIUS CRM — Weekly Report</h2>
    <p style="color:rgba(255,255,255,.6);margin:6px 0 0;font-size:13px">${now.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
  </div>
  <div style="background:#f9f9fb;padding:24px 32px;border-radius:0 0 12px 12px">
    <h3 style="font-size:14px;color:#888;text-transform:uppercase;letter-spacing:.8px;margin:0 0 16px">This week</h3>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px">
      <div style="background:#fff;border-radius:8px;padding:14px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        <div style="font-size:28px;font-weight:700;color:#4b72ff">${newLeads}</div>
        <div style="font-size:11px;color:#888;margin-top:4px">New leads</div>
      </div>
      <div style="background:#fff;border-radius:8px;padding:14px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        <div style="font-size:28px;font-weight:700;color:#2dd4bf">${weekCalls.length}</div>
        <div style="font-size:11px;color:#888;margin-top:4px">Calls</div>
      </div>
      <div style="background:#fff;border-radius:8px;padding:14px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        <div style="font-size:28px;font-weight:700;color:#22c55e">${ansRate}%</div>
        <div style="font-size:11px;color:#888;margin-top:4px">Answer rate</div>
      </div>
    </div>
    <h3 style="font-size:14px;color:#888;text-transform:uppercase;letter-spacing:.8px;margin:0 0 12px">All-time totals</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="background:#f0f0f5"><td style="padding:8px 12px;border-radius:6px">Total leads</td><td style="padding:8px 12px;text-align:right;font-weight:600">${leads.length}</td></tr>
      <tr><td style="padding:8px 12px">Closed Won</td><td style="padding:8px 12px;text-align:right;font-weight:600;color:#22c55e">${closedAll}</td></tr>
      <tr style="background:#f0f0f5"><td style="padding:8px 12px;border-radius:6px">Interested</td><td style="padding:8px 12px;text-align:right;font-weight:600;color:#2dd4bf">${interAll}</td></tr>
      <tr><td style="padding:8px 12px">Do Not Call</td><td style="padding:8px 12px;text-align:right;color:#888">${dncAll}</td></tr>
    </table>
  </div>
  <p style="font-size:11px;color:#aaa;text-align:center;margin-top:16px">Automatically generated by AXIUS CRM</p>
</div>`;

  MailApp.sendEmail({
    to: recipientEmail,
    subject: 'AXIUS CRM — Weekly report ' + now.toLocaleDateString('en-US'),
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
    'X-Goog-FieldMask':'places.displayName,places.formattedAddress,places.addressComponents,places.location,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,nextPageToken'};
  const comp_=(p,types)=>{ const c=(p.addressComponents||[]).find(x=>(x.types||[]).some(t=>types.indexOf(t)>=0)); return c?(c.longText||c.shortText||''):''; };

  const now = new Date().toISOString();
  let totalAdded = 0;

  // Self-limiting + rotating: stay well under the 6-min Apps Script cap and a
  // per-run Google Places ceiling, then advance a saved cursor so the NEXT daily
  // run continues from where this one stopped. Every job still runs — just spread
  // across days — so the automation stays free-tier-safe no matter how many jobs
  // are configured from the dashboard.
  const active = jobs.filter(j => j.active);
  if (!active.length) { cfgSet('lastScrapeRun', JSON.stringify({ranAt: now, added: 0, jobsRun: 0, ofJobs: 0})); return {added: 0, ranAt: now}; }

  // Exhaustion-skip: a job that returns ZERO new leads for several runs in a row
  // has been fully harvested — stop burning daily API budget re-scraping it.
  // emptyMap tracks consecutive empty runs per job; once a week we wipe the map so
  // exhausted areas get one fresh recheck (new businesses do open).
  const EXHAUST_AT = 3, RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
  const jobKey = j => [j.keyword, j.lat, j.lng, j.radius || 1000].join('|');
  let emptyMap = {}; try { emptyMap = JSON.parse(cfgGet('scrapeEmpty') || '{}') || {}; } catch(e) {}
  let lastRecheck = 0; try { lastRecheck = parseInt(cfgGet('scrapeRecheckAt')) || 0; } catch(e) {}
  if (Date.now() - lastRecheck > RECHECK_MS) { emptyMap = {}; cfgSet('scrapeRecheckAt', String(Date.now())); }

  // Skip jobs proven exhausted; rotate only over the ones still worth running.
  const eligible = active.filter(j => (emptyMap[jobKey(j)] || 0) < EXHAUST_AT);
  const skipped  = active.length - eligible.length;
  if (!eligible.length) {
    cfgSet('lastScrapeRun', JSON.stringify({ranAt: now, added: 0, jobsRun: 0, ofJobs: active.length, skipped}));
    return {added: 0, ranAt: now, jobsRun: 0, ofJobs: active.length, skipped};
  }

  const RUN_BUDGET_MS = 270000;  // ~4.5 min of headroom under the 6-min hard limit
  const MAX_CALLS     = 100;     // cap Places requests per daily run (free-tier friendly)
  const t0 = Date.now();
  let apiCalls = 0, jobsRun = 0;
  let cursor = 0; try { cursor = parseInt(cfgGet('scrapeCursor')) || 0; } catch(e) {}
  if (cursor < 0 || cursor >= eligible.length) cursor = 0;

  for (let n = 0; n < eligible.length; n++) {
    if (Date.now() - t0 > RUN_BUDGET_MS || apiCalls >= MAX_CALLS) break;   // budget reached — resume next run
    const job = eligible[(cursor + n) % eligible.length];
    jobsRun++;
    const addedBefore = totalAdded;
    let leads = [], token = null, tries = 0;
    const max = parseInt(job.maxResults) || 50;
    const baseBody = {textQuery:job.keyword, locationBias:{circle:{center:{latitude:parseFloat(job.lat),longitude:parseFloat(job.lng)},radius:parseFloat(job.radius||1000)}},maxResultCount:20, ...(job.region?{regionCode:job.region}:{})};
    while (leads.length < max && tries < 10 && apiCalls < MAX_CALLS && (Date.now() - t0) < RUN_BUDGET_MS) {
      // Paging requests must repeat ALL original params + the pageToken (Places API New rule)
      const body = token ? {...baseBody, pageToken:token} : baseBody;
      const r = UrlFetchApp.fetch(url,{method:'post',headers:hdr,payload:JSON.stringify(body),muteHttpExceptions:true});
      apiCalls++;
      const d = JSON.parse(r.getContentText());
      (d.places||[]).forEach(p => {
        if(leads.length < max) leads.push({
          name:p.displayName?.text||'N/A', phone:p.nationalPhoneNumber||'N/A',
          address:p.formattedAddress||'N/A', website:p.websiteUri||'N/A',
          rating:p.rating||'N/A', reviews:p.userRatingCount||'N/A',
          neighborhood:comp_(p,['neighborhood','sublocality','sublocality_level_1']), cityReal:comp_(p,['locality','postal_town']),
          lat:p.location?.latitude??'', lng:p.location?.longitude??''
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
          rating:l.rating, reviews:l.reviews, country:job.country||'', city:(l.cityReal||job.city||''), barrio:(l.neighborhood||''),
          keyword:job.keyword, source:job.source||'Scraper (auto)', sourceDetail:'',
          status:'New', dncReason:'', followUpDate:'', notes:JSON.stringify([]),
          providerId:'', providerRate:0, closerId:'', closerRate:0,
          dealValue:'', providerCommission:'', closerCommission:'', commissionStatus:'',
          lockedBy:'', lockedUntil:'', assignedAt:'', workHistory:JSON.stringify([]),
          importedAt:now, updatedAt:now, lat:l.lat??'', lng:l.lng??''
        };
        leadsSheet.appendRow(LEAD_HDR.map(h => lead[h] ?? ''));
        existing.add(key);
        totalAdded++;
      }
    });
    // Update this job's empty-run streak: reset on any new lead, else increment.
    const k = jobKey(job);
    emptyMap[k] = (totalAdded > addedBefore) ? 0 : (emptyMap[k] || 0) + 1;
  }
  cfgSet('scrapeCursor', String((cursor + jobsRun) % eligible.length));
  cfgSet('scrapeEmpty', JSON.stringify(emptyMap));
  const ranAt = new Date().toISOString();
  cfgSet('lastScrapeRun', JSON.stringify({ranAt, added: totalAdded, jobsRun, ofJobs: active.length, skipped}));
  Logger.log('Scheduled scrape: +' + totalAdded + ' leads, ' + jobsRun + '/' + eligible.length + ' eligible (' + skipped + ' exhausted-skipped of ' + active.length + '), ' + apiCalls + ' calls.');
  return {added: totalAdded, ranAt, jobsRun, ofJobs: active.length, skipped};
}

// ── Low-level send helpers (shared by the message handlers + the cadence engine) ──
// Twilio SMS/WhatsApp. Returns {sid,status} on success, {error} on failure.
function twilioSend_(phoneE164, channel, body) {
  const auth = Utilities.base64Encode(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN);
  const from = channel === 'whatsapp' ? 'whatsapp:' + TWILIO_FROM_WA : TWILIO_FROM_SMS_US;
  const to   = channel === 'whatsapp' ? 'whatsapp:' + phoneE164    : phoneE164;
  const res  = UrlFetchApp.fetch(
    'https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_ACCOUNT_SID + '/Messages.json',
    {method:'post', headers:{Authorization:'Basic '+auth}, payload:{From:from, To:to, Body:body}, muteHttpExceptions:true}
  );
  const d = JSON.parse(res.getContentText());
  return d.sid ? {sid:d.sid, status:d.status || 'sent'} : {error: d.message || 'send failed'};
}
// Append the CAN-SPAM footer (physical address + unsubscribe) required on every
// commercial email.
function emailFooter_() {
  const cfg = getCadenceCfg_();
  const addr = (cfg.postalAddress && cfg.postalAddress.indexOf('TU_') !== 0) ? cfg.postalAddress : cfg.company;
  return '\n\n—\n' + addr +
    '\nTo unsubscribe, reply STOP to this message.';
}
// Resend email. Returns {sid,status} on success, {error} on failure.
function resendSend_(email, subject, body) {
  const res = UrlFetchApp.fetch('https://api.resend.com/emails', {
    method:'post', contentType:'application/json',
    headers:{ Authorization:'Bearer ' + RESEND_API_KEY },
    payload: JSON.stringify({ from: RESEND_FROM, to: [email], subject: subject || 'AXIUS', text: String(body || '') + emailFooter_() }),
    muteHttpExceptions:true,
  });
  const d = JSON.parse(res.getContentText() || '{}');
  return d.id ? {sid:d.id, status:'sent'} : {error: (d.message || (d.error && d.error.message)) || 'email failed'};
}

/* ══════════════════════════════════════════════════════════════════════════
   CADENCE ENGINE — "Cadence Engine" (time-triggered, deterministic)
   Autonomous templated outreach. Enrolls eligible leads, advances each through
   the multi-step cadence, honoring opt-out / quiet hours / claim / reply /
   daily cap. Inert until CADENCE_ENABLED = true (dry-runs otherwise).

   The block below (CADENCE_STEPS + the pure helpers) is a VERBATIM MIRROR of
   js/features/cadence-core.js — unit-tested there. Keep the two in sync, like
   isOptOut (js) ↔ isOptOutGs (Code.gs).
   ══════════════════════════════════════════════════════════════════════════ */

const CADENCE_STEPS = {
  'Colombia': {
    whatsapp: [
      { variants: [
        'Hola, soy {agente} de {empresa}. Vi {negocio} en {ciudad} y me parece que están haciendo las cosas bien. Trabajamos con negocios como el suyo para conseguir más clientes de forma constante, y creo que les podemos aportar. ¿Tiene un minuto para que le cuente cómo?',
        'Hola, le escribe {agente} de {empresa}. Conocí {negocio} en {ciudad} y me gustó lo que vi. Ayudamos a negocios como el suyo a atraer clientes de manera más constante, y creo que hay una buena oportunidad aquí. ¿Le viene bien que le explique en corto?',
        'Buenas, soy {agente} de {empresa}. Me encontré con {negocio} en {ciudad} y quería escribirle directo: lo que hacemos encaja muy bien con un {categoria} como el suyo para traer más clientes. ¿Tiene un momento para que le muestre cómo?',
      ] },
      { variants: [
        'Hola de nuevo, soy {agente} de {empresa}. Le escribo porque lo que hacemos encaja muy bien con un {categoria} como {negocio}. Si le interesa, le muestro en concreto qué resultados podríamos lograr. Si por ahora no es el momento, lo entiendo perfectamente.',
        'Hola, {agente} de {empresa} otra vez. No quería dejar pasar lo de {negocio}: tengo claro qué podríamos lograr juntos y me gustaría mostrárselo en concreto. Si prefiere que hablemos más adelante, sin problema, usted me dice.',
      ] },
    ],
    email: [
      { variants: [
        'Hola, soy {agente} de {empresa}. Vi el trabajo de {negocio} en {ciudad} y creo que podemos ayudarles a atraer clientes de forma más constante. Me encantaría mostrarles, en concreto, qué resultados podríamos lograr juntos. ¿Tienen 15 minutos esta semana para una llamada corta?\n\nUn saludo,\n{agente} — {empresa}',
        'Hola, le escribe {agente} de {empresa}. Conocí {negocio} en {ciudad} y veo una oportunidad clara para que lleguen a más clientes de manera constante. Con gusto les muestro en una llamada corta qué podríamos lograr juntos. ¿Les viene bien esta semana?\n\nUn saludo,\n{agente} — {empresa}',
      ] },
    ],
  },
  'Estados Unidos': {
    sms: [
      { variants: [
        "Hi, this is {agente} with {empresa}. I came across {negocio} in {ciudad} — impressive work. We help businesses like yours bring in customers consistently, and I think we'd add real value. Open to a quick chat?",
        "Hi, {agente} from {empresa} here. {negocio} in {ciudad} caught my eye — you're clearly doing things right. We help businesses like yours win customers more consistently, and I think there's a real fit. Worth a quick chat?",
        "Hello, this is {agente} with {empresa}. I noticed {negocio} in {ciudad} and wanted to reach out directly: what we do fits a {categoria} like yours well for bringing in more customers. Open to a short conversation?",
      ] },
      { variants: [
        "Hi, {agente} from {empresa} again. What we do fits a {categoria} like {negocio} well — happy to show you exactly what results we could drive. If now isn't the time, no problem at all.",
        "Hi, this is {agente} with {empresa}. Following up on {negocio} — I can show you concretely what results we'd aim for together. If the timing's off, just say the word and I'll step back.",
      ] },
    ],
    email: [
      { variants: [
        "Hi, I'm {agente} with {empresa}. I came across {negocio} in {ciudad} and think we can help you bring in customers more consistently. I'd love to show you exactly what results we could drive together — do you have 15 minutes this week for a quick call?\n\nBest,\n{agente} — {empresa}",
        "Hi, this is {agente} with {empresa}. {negocio} in {ciudad} stood out to me, and I see a clear way to help you reach more customers consistently. Could I show you what we'd aim for on a short call this week?\n\nBest,\n{agente} — {empresa}",
      ] },
    ],
  },
};

function cadencePhoneKey(p) { const d = String(p || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; }
function cadenceChannel(country) {
  const c = String(country || '').trim().toLowerCase();
  if (c === 'colombia') return 'whatsapp';
  if (c === 'estados unidos' || c === 'estados unidos de america' || c === 'estados unidos de américa' || c === 'usa' || c === 'united states') return 'sms';
  return '';
}
function cadenceResolveChannel(lead) {
  lead = lead || {};
  const phoneCh = cadenceChannel(lead.country);
  if (phoneCh && cadencePhoneKey(lead.phone)) return phoneCh;
  if (String(lead.email || '').trim()) return 'email';
  return '';
}
function cadenceEligible(lead, hasSeq) {
  if (!lead || hasSeq) return false;
  if (String(lead.status || 'New') !== 'New') return false;
  if (cadenceResolveChannel(lead) === '') return false;
  return true;
}
function cadenceGuard(lead, seq) {
  if (!lead) return 'stopped:rejected';
  const status = String(lead.status || 'New');
  if (status === 'Do Not Call')        return 'stopped:optout';
  if (status === 'Closed Won')          return 'stopped:closed';
  if (status === 'Not Interested' || status === 'Closed Lost' || status === 'Closed Lost') return 'stopped:rejected';
  if (String(lead.lockedBy || ''))   return 'paused:claimed';
  if (replyShouldPause(lead, seq))   return 'paused:replied';
  if (status !== 'New')            return 'paused:claimed';
  return '';
}
function replyShouldPause(lead, seq) {
  if (!lead || !seq) return false;
  const reply    = lead.lastReplyAt ? new Date(lead.lastReplyAt).getTime() : 0;
  const enrolled = seq.enrolledAt   ? new Date(seq.enrolledAt).getTime()   : 0;
  return reply > 0 && reply > enrolled;
}
function withinQuietHours(localHour, start, end) {
  const s = (start == null ? 8 : start), e = (end == null ? 20 : end);
  return localHour >= s && localHour < e;
}
function pickVariant(leadId, stepIndex, variantCount) {
  if (!variantCount || variantCount <= 1) return 0;
  const s = String(leadId || '') + ':' + String(stepIndex || 0);
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % variantCount;
}
function cadenceJitterMinutes(leadId, maxMinutes) {
  const m = maxMinutes || 1;
  const s = 'jit:' + String(leadId || '');
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h % m;
}
function cadenceSteps(lead) {
  const ch = cadenceResolveChannel(lead);
  if (!ch) return [];
  const country = (lead && CADENCE_STEPS[lead.country]) ? lead.country : (ch === 'sms' ? 'Estados Unidos' : 'Colombia');
  return (CADENCE_STEPS[country] || {})[ch] || [];
}
function cadenceRender(body, lead, company, agent) {
  lead = lead || {};
  const map = {
    negocio: lead.name || '', ciudad: lead.city || '', barrio: lead.barrio || '',
    categoria: lead.keyword || '', nombre: lead.contactName || lead.name || '',
    empresa: company || 'AXIUS', agente: agent || '',
  };
  return String(body || '')
    .replace(/\{(\w+)\}/g, function(m, k) { return (k in map ? map[k] : ''); })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.!?])/g, '$1')
    .trim();
}
function cadenceMessage(lead, stepIndex, company, agent) {
  const steps = cadenceSteps(lead);
  const step  = steps[stepIndex];
  if (!step) return '';
  const variants = step.variants || [];
  return cadenceRender(variants[pickVariant(lead && lead.id, stepIndex, variants.length)] || '', lead, company, agent);
}
function advanceSequence(seq, stepsLen, nowMs, gapMs, jitterMs) {
  const cur  = (seq && seq.stepIndex != null) ? Number(seq.stepIndex) : 0;
  const next = cur + 1;
  if (next >= stepsLen) return { stepIndex: next, nextRunAt: '', state: 'done' };
  return { stepIndex: next, nextRunAt: new Date(nowMs + (gapMs || 0) + (jitterMs || 0)).toISOString(), state: 'active' };
}
function alreadySent(interactions, leadId, stepTag) {
  return (interactions || []).some(function(it) {
    return it && String(it.leadId) === String(leadId) &&
      String(it.direction) === 'out' && String(it.stepTag) === String(stepTag) &&
      String(it.status) !== 'error' && String(it.status) !== 'dryrun';
  });
}
function dailyRemaining(counter, cap, todayKey) {
  const c = (counter && counter.date === todayKey) ? Number(counter.count || 0) : 0;
  return Math.max(0, Number(cap || 0) - c);
}

// ── Apps-Script glue (I/O the pure core can't do) ──────────────────────────
function cadenceTz_(country) {
  const c = String(country || '').trim().toLowerCase();
  if (c === 'estados unidos' || c === 'usa' || c === 'united states') return 'America/New_York';
  return 'America/Bogota';
}
function cadenceToE164_(phone, country) {
  const raw = String(phone || '').replace(/[^\d+]/g, ''); if (!raw) return '';
  if (raw[0] === '+') { const d = raw.slice(1).replace(/\D/g, ''); return d.length >= 8 ? '+' + d : ''; }
  const digits = raw.replace(/\D/g, ''); if (!digits) return '';
  const dial = { 'Colombia':'57', 'Estados Unidos':'1' }[country] || '';
  if (dial && digits.indexOf(dial) === 0 && digits.length >= 11) return '+' + digits;
  return dial ? '+' + dial + digits : '+' + digits;
}
function writeSeqRow_(sheet, rowNum, seq, hdr) {
  if (!rowNum) return;
  const h = hdr || SEQUENCE_HDR;   // write by the ACTUAL header order, not the constant
  sheet.getRange(rowNum, 1, 1, h.length).setValues([h.map(function(k){ return seq[k] != null ? seq[k] : ''; })]);
}
function appendInteraction_(rec) {
  getSheet(SHEETS.interactions, INTERACTION_HDR).appendRow(INTERACTION_HDR.map(function(k){ return rec[k] != null ? rec[k] : ''; }));
}

// Effective cadence config: operator overrides from the Config sheet
// ('cadenceConfig' key, set in the CRM admin UI) layered over the Code.gs
// constants as defaults. So the constants are the floor; the UI tunes the rest.
function getCadenceCfg_() {
  let s = {};
  try { s = JSON.parse(cfgGet('cadenceConfig') || '{}'); } catch (e) {}
  const num = (v, d) => (Number(v) > 0 ? Number(v) : d);
  const hr  = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 24 ? Number(v) : d);
  return {
    enabled:    typeof s.enabled === 'boolean' ? s.enabled : (CADENCE_ENABLED === true),
    dailyCap:   num(s.dailyCap, CADENCE_DAILY_CAP),
    agentName:  s.agentName || CADENCE_AGENT_NAME,
    company:    s.company   || CADENCE_COMPANY,
    gapDays:    num(s.gapDays, CADENCE_STEP_GAP_DAYS),
    spreadMin:  num(s.spreadMin, CADENCE_FIRST_SPREAD_MIN),
    quietStart: hr(s.quietStart, 8),
    quietEnd:   hr(s.quietEnd, 20),
    postalAddress: s.postalAddress || COMPANY_POSTAL_ADDRESS,
  };
}

// The engine. Hourly trigger. Pass 1 enroll, Pass 2 advance. Dry-runs (writes
// nothing, sends nothing) until the cadence config is enabled (UI or constant).
function runCadence() {
  // Single-run lock: the hourly trigger and the on-demand runCadenceNow must never
  // overlap, or both would read the same pre-send snapshot and double-send a step.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) { Logger.log('runCadence: another run in progress; skipping.'); return { skipped: true }; }
  try {
    const cfg = getCadenceCfg_();
    const live = cfg.enabled === true;
    const gapMs = cfg.gapDays * 24 * 3600 * 1000;
    const now = new Date(), nowMs = now.getTime();

    // Read leads once (with row indices for in-place stamps).
    const leadsSheet = getSheet(SHEETS.leads, LEAD_HDR);
    const leadVals = leadsSheet.getDataRange().getValues();
    const lh = leadVals[0] || LEAD_HDR, touchCol = lh.indexOf('lastTouchAt'), statusCol = lh.indexOf('status');
    const leads = [], leadRowOf = {}, leadById = {};
    for (let i = 1; i < leadVals.length; i++) {
      const o = {}; lh.forEach(function(k, j){ o[k] = leadVals[i][j]; });
      leads.push(o); leadRowOf[String(o.id)] = i + 1; leadById[String(o.id)] = o;
    }

    // Read sequences once (with row indices).
    const seqsSheet = getSheet(SHEETS.sequences, SEQUENCE_HDR);
    const seqVals = seqsSheet.getDataRange().getValues();
    const sh = seqVals[0] || SEQUENCE_HDR;
    const seqs = [], rowOf = {}, enrolledSet = {};
    for (let i = 1; i < seqVals.length; i++) {
      const o = {}; sh.forEach(function(k, j){ o[k] = seqVals[i][j]; });
      seqs.push(o); rowOf[String(o.leadId)] = i + 1; enrolledSet[String(o.leadId)] = true;
    }

    const interactions = toObjs(getSheet(SHEETS.interactions, INTERACTION_HDR));

    let counter = {}; try { counter = JSON.parse(cfgGet('cadenceSentToday') || '{}'); } catch (e) {}
    const todayKey = Utilities.formatDate(now, 'America/New_York', 'yyyy-MM-dd');
    let remaining = dailyRemaining(counter, cfg.dailyCap, todayKey);

    // ── Pass 1: enroll eligible, not-yet-enrolled leads (batched append) ──
    const newRows = []; let enrolled = 0, wouldEnroll = 0;
    leads.forEach(function(lead) {
      if (enrolledSet[String(lead.id)]) return;
      if (!cadenceEligible(lead, false)) return;
      const jitterMs = cadenceJitterMinutes(lead.id, cfg.spreadMin) * 60000;
      const seq = { leadId:lead.id, state:'active', stepIndex:0,
        nextRunAt:new Date(nowMs + jitterMs).toISOString(),
        pausedReason:'', enrolledAt:now.toISOString(), updatedAt:now.toISOString() };
      enrolledSet[String(lead.id)] = true;
      if (live) { newRows.push(sh.map(function(k){ return seq[k] != null ? seq[k] : ''; })); enrolled++; }
      else wouldEnroll++;
    });
    if (live && newRows.length) {
      seqsSheet.getRange(seqsSheet.getLastRow() + 1, 1, newRows.length, sh.length).setValues(newRows);
    }

    // ── Pass 2: advance pre-existing active sequences that are due ──
    let sent = 0, wouldSend = 0; const preview = [];
    seqs.forEach(function(seq) {
      if (remaining <= 0) return;
      if (String(seq.state) !== 'active') return;
      if (seq.nextRunAt && new Date(seq.nextRunAt).getTime() > nowMs) return;   // not due yet
      const lead = leadById[String(seq.leadId)];
      if (!lead) return;

      const guard = cadenceGuard(lead, seq);
      if (guard) {
        if (live) { seq.state = guard; seq.pausedReason = guard; seq.updatedAt = now.toISOString(); writeSeqRow_(seqsSheet, rowOf[String(seq.leadId)], seq, sh); }
        return;
      }

      const tz = cadenceTz_(lead.country);
      const localHour = parseInt(Utilities.formatDate(now, tz, 'H'), 10);
      if (!withinQuietHours(localHour, cfg.quietStart, cfg.quietEnd)) return;   // outside window: skip; re-checked next hourly run

      const steps = cadenceSteps(lead);
      const stepIndex = Number(seq.stepIndex || 0);
      if (stepIndex >= steps.length) {
        if (live) { seq.state = 'done'; seq.updatedAt = now.toISOString(); writeSeqRow_(seqsSheet, rowOf[String(seq.leadId)], seq, sh); }
        return;
      }
      const stepTag = 'seq:' + stepIndex;
      const channel = cadenceResolveChannel(lead);
      const body = cadenceMessage(lead, stepIndex, cfg.company, cfg.agentName);
      if (!body) return;

      // Idempotency: already really sent this step → just advance.
      if (alreadySent(interactions, lead.id, stepTag)) {
        if (live) {
          const adv = advanceSequence(seq, steps.length, nowMs, gapMs, cadenceJitterMinutes(lead.id, 120) * 60000);
          seq.stepIndex = adv.stepIndex; seq.nextRunAt = adv.nextRunAt; seq.state = adv.state; seq.updatedAt = now.toISOString();
          writeSeqRow_(seqsSheet, rowOf[String(seq.leadId)], seq, sh);
        }
        return;
      }

      if (!live) {
        wouldSend++;
        if (preview.length < 10) preview.push({ lead:lead.name, channel:channel, step:stepIndex, body:body.slice(0, 140) });
        return;
      }

      // Re-check opt-out FRESH at send time: a reply/opt-out (inboundMsg flips status
      // to 'Do Not Call') may have landed since the snapshot read. Mirrors the manual
      // send handlers' leadOptedOut safety net — one cell read, capped at the daily cap.
      if (statusCol >= 0 && leadRowOf[String(lead.id)]) {
        const freshStatus = String(leadsSheet.getRange(leadRowOf[String(lead.id)], statusCol + 1).getValue());
        if (freshStatus === 'Do Not Call') {
          seq.state = 'stopped:optout'; seq.pausedReason = 'stopped:optout'; seq.updatedAt = now.toISOString();
          writeSeqRow_(seqsSheet, rowOf[String(seq.leadId)], seq, sh);
          return;
        }
      }

      // ── LIVE send ──
      let result;
      if (channel === 'email') { result = lead.email ? resendSend_(lead.email, 'AXIUS', body) : {error:'no email'}; }
      else { const e164 = cadenceToE164_(lead.phone, lead.country); result = e164 ? twilioSend_(e164, channel, body) : {error:'no phone'}; }

      appendInteraction_({ id:Utilities.getUuid(), leadId:lead.id, leadName:lead.name, phone:lead.phone || '',
        channel:channel, direction:'out', body:body, stepTag:stepTag,
        status: result.sid ? (result.status || 'sent') : 'error', sid:result.sid || '', error:result.error || '',
        createdAt:now.toISOString(), createdBy:'cadence' });
      if (touchCol >= 0 && leadRowOf[String(lead.id)]) leadsSheet.getRange(leadRowOf[String(lead.id)], touchCol + 1).setValue(now.toISOString());

      if (result.sid) {
        sent++; remaining--;
        const adv = advanceSequence(seq, steps.length, nowMs, gapMs, cadenceJitterMinutes(lead.id, 120) * 60000);
        seq.stepIndex = adv.stepIndex; seq.nextRunAt = adv.nextRunAt; seq.state = adv.state; seq.updatedAt = now.toISOString();
        writeSeqRow_(seqsSheet, rowOf[String(seq.leadId)], seq, sh);
      }
      // send error → sequence stays on this step, retried next run
    });

    if (live && sent > 0) {
      const base = (counter && counter.date === todayKey) ? Number(counter.count || 0) : 0;
      cfgSet('cadenceSentToday', JSON.stringify({ date:todayKey, count:base + sent }));
    }
    const summary = { ranAt:now.toISOString(), mode: live ? 'live' : 'dryrun',
      enrolled: live ? enrolled : wouldEnroll, sent: live ? sent : wouldSend };
    if (!live) summary.preview = preview;
    cfgSet('lastCadenceRun', JSON.stringify(summary));
    Logger.log('Cadence ' + (live ? 'LIVE' : 'DRY-RUN') + ': enrolled ' + summary.enrolled + ', ' + (live ? 'sent ' : 'would-send ') + summary.sent);
    return summary;
  } catch (err) { Logger.log('runCadence error: ' + err.message); return { error: err.message }; }
  finally { lock.releaseLock(); }
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
