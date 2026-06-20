// AXIUS CRM — Apps Script v4
// Fill in ALL the constants before deploying

// ── SECRETS LIVE IN SCRIPT PROPERTIES, not in this file ──────────────────────
// Set them ONCE in Project Settings → Script properties (or fill seedProperties()
// below and Run it once). They persist across every future code paste/redeploy,
// so you never re-enter secrets again — this repo copy is safe to paste as-is.
const PROPS = PropertiesService.getScriptProperties();
function PROP_(key, fallback) {
  const v = PROPS.getProperty(key);
  return (v == null || v === '') ? (fallback || '') : v;
}

const SHEET_ID           = PROP_('SHEET_ID');
const PLACES_API_KEY     = PROP_('PLACES_API_KEY');
const TWILIO_ACCOUNT_SID = PROP_('TWILIO_ACCOUNT_SID');
const TWILIO_API_KEY_SID = PROP_('TWILIO_API_KEY_SID');
const TWILIO_API_SECRET  = PROP_('TWILIO_API_SECRET');
const TWILIO_AUTH_TOKEN  = PROP_('TWILIO_AUTH_TOKEN');
const TWILIO_TWIML_APP   = PROP_('TWILIO_TWIML_APP');
const TWILIO_FROM_NUMBER = PROP_('TWILIO_FROM_NUMBER');
const TWILIO_FROM_SMS_US = PROP_('TWILIO_FROM_SMS_US');
const TWILIO_FROM_WA     = PROP_('TWILIO_FROM_WA', '+14155238886');
const DRIVE_FOLDER_ID    = PROP_('DRIVE_FOLDER_ID');
const RESEND_API_KEY     = PROP_('RESEND_API_KEY');
const TELEGRAM_ALERT_BOT_TOKEN = PROP_('TELEGRAM_ALERT_BOT_TOKEN');
const TELEGRAM_ALERT_CHAT_ID   = PROP_('TELEGRAM_ALERT_CHAT_ID');
const GEMINI_API_KEY     = PROP_('GEMINI_API_KEY');
const CRM_SECRET         = PROP_('CRM_SECRET');

// Deployment config — overridable via Script properties, with safe defaults.
const RESEND_FROM        = PROP_('RESEND_FROM', 'Andres Toro <hola@axius.tech>');   // a PERSON, not the brand — cold mail from a name gets opened more (override via Script property)
const REPLY_TO_EMAIL     = PROP_('REPLY_TO_EMAIL', 'andres@axius.tech');      // inbox runInboundEmailScan polls
const GEMINI_MODEL       = PROP_('GEMINI_MODEL', 'gemini-2.0-flash');
const BOOKING_URL        = PROP_('BOOKING_URL', 'https://cal.com/andrestoro/discovery-call?overlayCalendar=true');
const COMPANY_POSTAL_ADDRESS = PROP_('COMPANY_POSTAL_ADDRESS', '');           // CAN-SPAM footer
const AI_MAX_REPLIES     = 3;     // cap AI back-and-forths per lead (anti-loop)

// Shared positioning brief — fed to the AI personalization + reply prompts so
// the copy reflects what Axius actually does (from the brand/capability docs).
const AXIUS_BRIEF = 'Axius is a Technology Ownership Practice. Never call it an agency, contractor, firm, or software vendor. ' +
  'It gives a growing business one accountable owner for the technology that runs it: the software, automations, data, and vendors. ' +
  'Tagline: run your business, not your technology. The model is one named operator (single point of contact, accountable for outcomes), ' +
  'plus AI systems that carry the repetitive work, plus vetted specialists the operator manages, so the client never coordinates a vendor. ' +
  'The client gets their whole technology function for one flat monthly figure that costs less than a single hire (entry tier about ' +
  '$2,500/month, but lead with value, never with price). It covers eight areas: sales and prospecting (lead capture, follow-up, ' +
  'missed-call recovery); customer experience (support automation, inbox unification); internal operations (cross-tool sync, document ' +
  'automation, cutting duplicate software); AI implementation (agents, lead scoring, multi-step automation); data and analytics ' +
  '(dashboards, reporting); web and storefront (websites, e-commerce); custom software (internal tools, integrations); finance and ' +
  'back office (invoicing, reconciliation, quote-to-invoice). Pick the one or two that fit the business; most engage a few at a time. ' +
  'Trust commitments you can state plainly: everything lives in the client\'s own accounts, code and credentials and documentation, ' +
  'nothing held, so they can leave anytime fully operational; agreed work lands in its window or the next month is free; cancel with ' +
  'thirty days notice. The real pains it solves: no one owns the whole tech setup, so it defaults to the owner; the operation only works ' +
  'because specific people remember how it works; manual work that should be automated; disconnected tools and re-entered data; software ' +
  'and vendor sprawl nobody has mapped; things break with no clear owner. Standing offer: a thirty minute look and a one page read either ' +
  'way, no pitch, no pressure, a clear picture of where their systems leak and what to fix first. Guardrails: never promise specific ' +
  'revenue or guaranteed numbers, speak of value as influenced not caused, never invent client names, metrics, or case studies. ' +
  'Voice: editorial, restrained, declarative, concrete, second person. Short sentences. Confidence without volume. No hype or buzzwords.';

// ── ONE-TIME SETUP ───────────────────────────────────────────────────────────
// Fill your real values below and Run this once (Run ▸ seedProperties). It writes
// them to Script properties, which survive every future redeploy. Leave a value
// '' to skip it. Afterwards you can blank these back out — the repo ships empty.
function seedProperties() {
  const vals = {
    SHEET_ID: '', PLACES_API_KEY: '',
    TWILIO_ACCOUNT_SID: '', TWILIO_API_KEY_SID: '', TWILIO_API_SECRET: '',
    TWILIO_AUTH_TOKEN: '', TWILIO_TWIML_APP: '',
    TWILIO_FROM_NUMBER: '', TWILIO_FROM_SMS_US: '', TWILIO_FROM_WA: '',
    DRIVE_FOLDER_ID: '', RESEND_API_KEY: '',
    TELEGRAM_ALERT_BOT_TOKEN: '', TELEGRAM_ALERT_CHAT_ID: '',
    GEMINI_API_KEY: '', CRM_SECRET: '',
    // Optional overrides (defaults already fine):
    // RESEND_FROM: '', REPLY_TO_EMAIL: '', BOOKING_URL: '', COMPANY_POSTAL_ADDRESS: '',
  };
  const props = PropertiesService.getScriptProperties();
  let n = 0;
  Object.keys(vals).forEach(function(k){ if (vals[k] !== '') { props.setProperty(k, vals[k]); n++; } });
  Logger.log('Seeded ' + n + ' Script properties. You can now blank the values above.');
}

// ── Admin gate (server-validated two-gate login) ─────────────────────────────
// ONE-TIME SETUP: in the Apps Script editor, put your chosen digits below and Run
// seedAdminGate once (then blank it again). The plaintext code is never stored —
// only its salted hash. The admin then logs in by entering these digits across
// the two gates on the CRM login screen; validation + lockout happen server-side.
function seedAdminGate() {
  const code = '';                 // ← your full admin code (e.g. two 4-digit gates = '12345678'); blank after running
  if (!/^\d{6,12}$/.test(code)) { Logger.log('Set `code` to 6–12 digits, then Run again.'); return; }
  PROPS.setProperty('ADMIN_GATE_HASH', sha256Hex_(code + '|' + CRM_SECRET));
  PROPS.deleteProperty('adminAuthState');
  Logger.log('Admin gate set. Blank the code above and redeploy. Old in-browser admin PIN is now retired.');
}

function sha256Hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)
    .map(function(b){ return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function hmacHex_(s) {
  return Utilities.computeHmacSha256Signature(String(s), String(CRM_SECRET))
    .map(function(b){ return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
// Stateless admin session token: "exp.sig" where sig = HMAC(exp, CRM_SECRET).
function issueAdminToken_(hours) {
  const exp = Date.now() + (hours || 8) * 3600 * 1000;
  return exp + '.' + hmacHex_('admin:' + exp);
}
function verifyAdminToken_(tok) {
  const parts = String(tok || '').split('.');
  if (parts.length !== 2) return false;
  const exp = parseInt(parts[0], 10);
  if (!exp || Date.now() > exp) return false;
  const expect = hmacHex_('admin:' + exp);
  // length-equal compare (inputs are fixed-length hex, so this is constant-ish)
  if (parts[1].length !== expect.length) return false;
  let diff = 0;
  for (let i = 0; i < expect.length; i++) diff |= parts[1].charCodeAt(i) ^ expect.charCodeAt(i);
  return diff === 0;
}

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
const CADENCE_EMAIL_SUBJECT    = PROP_('CADENCE_EMAIL_SUBJECT', 'Who runs the tech behind {business}?'); // cold-email subject; {business}/{city} tokens; same across steps so they thread
const CADENCE_DAILY_CAP        = 200;     // max sends per day
const CADENCE_STEP_GAP_DAYS    = 2;       // min days between proactive touches
const CADENCE_FIRST_SPREAD_MIN = 360;     // spread first touches over N minutes (anti-burst)
const CADENCE_GAP_MS           = CADENCE_STEP_GAP_DAYS * 24 * 3600 * 1000;
// CAN-SPAM note: COMPANY_POSTAL_ADDRESS (Script property, top of file) is the
// physical address appended to every outbound email's footer in resendSend_.
// Set it before sending real email. (Bounce/complaint suppression via a Resend
// webhook is still a separate follow-up — see GO-LIVE §1.)

const SHEETS = { leads:'Leads', calls:'Llamadas', team:'Team', commissions:'Commissions', scripts:'Scripts', interactions:'Interactions', sequences:'Sequences' };

const LEAD_HDR = ['id','name','phone','address','website','rating','reviews','city','barrio','keyword','source','sourceDetail','status','providerId','providerRate','closerId','closerRate','dealValue','collectedAmount','providerCommission','closerCommission','commissionStatus','lockedBy','lockedUntil','assignedAt','workHistory','dncReason','followUpDate','notes','importedAt','updatedAt','calendarEventId','refundAmount','refundReason','refundedAt','country','email','externalId','lastTouchAt','lastReplyAt','consentSms','consentWhatsapp','consentEmail','lat','lng','residualActive','residualRate','residualMRR'];
const CALL_HDR = ['id','leadId','leadName','phone','callSid','outcome','duration','notes','recordingUrl','driveUrl','consentConfirmed','calledAt'];
const TEAM_HDR = ['id','name','role','pinHash','providerRate','closerRate','contact','active','createdAt','commissionType'];
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
    // 'unsubscribe' is public (recipients have no secret) — handle it before auth.
    if (a === 'unsubscribe') {
      markUnsubscribed_(e.parameter.e);
      return HtmlService.createHtmlOutput('<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:460px;margin:60px auto;text-align:center;color:#16140f"><h2 style="font-weight:600">You\'re unsubscribed</h2><p style="color:#555">You won\'t hear from us again. Sorry for the intrusion.</p></div>');
    }
    if (a !== 'ping' && a !== 'twiml') {
      const s = e.parameter._s || '';
      if (String(s).trim() !== String(CRM_SECRET).trim()) return err_('Unauthorized');
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
      let stateCampaigns=[]; try { const raw=cfgGet('stateCampaigns'); if(raw) stateCampaigns=JSON.parse(raw); } catch(e){}
      let interactions = toObjs(getSheet(SHEETS.interactions,INTERACTION_HDR));
      if(since){const sd=new Date(since);interactions=interactions.filter(i=>!i.createdAt||new Date(i.createdAt)>=sd);}
      const sequences = toObjs(getSheet(SHEETS.sequences,SEQUENCE_HDR));
      return ok({leads,calls,team,commissions:comms,scripts,scheduledJobs,stateCampaigns,interactions,sequences,adminGateEnabled:!!PROP_('ADMIN_GATE_HASH'),serverTime:new Date().toISOString()});
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
        residualTrigger: triggers.some(t => t.getHandlerFunction() === 'runMonthlyResiduals'),
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

    // One-click unsubscribe POST (RFC 8058) — the mail client posts here with no
    // secret, so handle it before auth and just acknowledge.
    if (a === 'unsubscribe') {
      markUnsubscribed_(e.parameter.e);
      return ContentService.createTextOutput('unsubscribed');
    }

    // Twilio inbound messaging webhook (form-encoded; NOT our JSON+_secret shape).
    // Configure the Twilio webhook URL as:  {execUrl}?action=inboundMsg&token={CRM_SECRET}
    if (a === 'inboundMsg') {
      if (String(e.parameter.token).trim() !== String(CRM_SECRET).trim()) return err_('Unauthorized');
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
    if (String(b._secret).trim() !== String(CRM_SECRET).trim()) {
      return err_('Unauthorized — set the CRM_SECRET Script property to the value shown in Settings.');
    }

    // Server-validated admin login (two-gate). Validates the combined code against
    // ADMIN_GATE_HASH with a 5-try / 15-min lockout, and returns a short-lived
    // token on success. State is held in the 'adminAuthState' Script property,
    // guarded by a script lock to keep the attempt counter race-free.
    if (a === 'adminLogin') {
      const gateHash = PROP_('ADMIN_GATE_HASH');
      if (!gateHash) return ok({ ok:false, needsSetup:true });
      const lock = LockService.getScriptLock();
      try { lock.waitLock(5000); } catch (e) { return ok({ ok:false, error:'busy' }); }
      try {
        let st = {}; try { st = JSON.parse(PROP_('adminAuthState') || '{}'); } catch (e) {}
        const now = Date.now();
        if (st.lockUntil && now < st.lockUntil) {
          return ok({ ok:false, locked:true, lockedUntil:st.lockUntil });
        }
        const ok_ = sha256Hex_(String(b.code || '') + '|' + CRM_SECRET) === gateHash;
        if (ok_) {
          PROPS.deleteProperty('adminAuthState');
          return ok({ ok:true, token:issueAdminToken_(8), name:PROP_('ADMIN_NAME','Andres Toro') });
        }
        const fails = (st.fails || 0) + 1;
        const next = { fails:fails };
        if (fails >= 5) { next.lockUntil = now + 15*60*1000; next.fails = 0; }
        PROPS.setProperty('adminAuthState', JSON.stringify(next));
        return ok({ ok:false, remaining: Math.max(0, 5 - fails), locked: !!next.lockUntil, lockedUntil: next.lockUntil || 0 });
      } finally { lock.releaseLock(); }
    }

    // Admin-only actions require a valid admin token (issued by adminLogin), so a
    // rep — or anyone holding the shared CRM secret — can't drive admin endpoints
    // directly. Reps' day-to-day actions (leads, calls, outreach, their own
    // commissions) are intentionally NOT in this set. code 401 → client re-login.
    var ADMIN_ONLY = { saveTeamMember:1, cancelCommission:1, adjustCollected:1, markCommissionPaid:1,
      saveCadenceConfig:1, saveScheduledJobs:1, saveStateCampaigns:1, saveReportEmail:1,
      setTrigger:1, runCadenceNow:1, runScrapesNow:1, saveScript:1, deleteScript:1, previewOutreach:1 };
    if (ADMIN_ONLY[a] && !verifyAdminToken_(b.adminToken)) {
      return err_('Admin sign-in required for this action.', 401);
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
    if (a === 'previewOutreach') {
      // QA tool: render the cadence email for the SELECTED real leads exactly as the
      // autopilot would (AI-personalized first email when aiPersonalize is on) and
      // RETURN the rendered content for on-screen review. Optionally also email the
      // previews to the operator's own address (never to the leads). The lead does
      // NOT need its own email — we render against its facts; sending goes to `to`.
      const to = String(b.to || '').trim();             // optional
      const ids = (b.leadIds || []).slice(0, 8);         // cap Gemini/Resend cost per preview
      if (!ids.length) return err_('Select at least one lead first.');
      const cfg = getCadenceCfg_();
      const agent = cfg.agentName || CADENCE_AGENT_NAME, company = cfg.company || CADENCE_COMPANY;
      const leads = toObjs(getSheet(SHEETS.leads, LEAD_HDR));
      const byId = {}; leads.forEach(function(l){ byId[String(l.id)] = l; });
      const previews = []; let sent = 0; const chosen = [];
      // First email per selected lead — personalized exactly like a real send.
      for (const id of ids) {
        const lead = byId[String(id)]; if (!lead) continue;
        const steps = cadenceSteps(lead); if (!steps.length) continue;
        chosen.push(lead);
        const angle = pickIndustryAngle_(lead);
        let body = composeFirstEmail_(lead, company, agent);
        let personalized = false;
        if (cfg.aiPersonalize) { try { const p = geminiPersonalizeEmail_(lead, cfg); if (p) { body = p; personalized = true; } } catch (e) { Logger.log('preview personalize: ' + e.message); } }
        const subject = cadenceSubjectFor_(lead, company, agent);
        previews.push({ step: 1, leadName: lead.name || '', city: lead.city || '', leadEmail: lead.email || '', segment: angle.seg, subject: subject, body: body, personalized: personalized });
        if (to) { const r = resendSend_(to, '[TEST] ' + subject, body); if (r.sid) sent++; }
      }
      // Follow-up steps (templates) rendered for the first selected lead, so the
      // whole sequence is visible in one go.
      if (chosen.length) {
        const lead = chosen[0], steps = cadenceSteps(lead);
        for (let s = 1; s < steps.length; s++) {
          const v = (steps[s].variants || []);
          const body = cadenceRender(v[pickVariant(lead.id, s, v.length)] || '', lead, company, agent);
          const subject = cadenceRender(CADENCE_EMAIL_SUBJECT, lead, company, agent);
          previews.push({ step: s + 1, leadName: lead.name || '', city: lead.city || '', subject: subject, body: body, personalized: false });
          if (to) { const r = resendSend_(to, '[TEST] ' + subject, body); if (r.sid) sent++; }
        }
      }
      return ok({ sent, previews: previews, leads: chosen.length, agent: agent, company: company, aiOn: !!cfg.aiPersonalize });
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
        smsEnabled: c.smsEnabled === true,
        aiReplies:  c.aiReplies === true,
        aiPersonalize: c.aiPersonalize === true,
        sendTimeOptimized: c.sendTimeOptimized === true,
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
    if (a === 'saveStateCampaigns') {
      // Merge by id so a client save (pause/resume/launch/delete) can't clobber the
      // progress fields the server advances as it scrapes. Client owns active/dailyCap
      // + which campaigns exist; server owns cursor/leadsFound/passAdded/exhausted/dead.
      let cur = []; try { cur = JSON.parse(cfgGet('stateCampaigns') || '[]'); } catch(e) {}
      const curById = {}; cur.forEach(function(c){ if (c && c.id) curById[c.id] = c; });
      const SERVER_FIELDS = ['cursor','leadsFound','passAdded','exhausted','dead','deadCheckedAt','lastRunAt'];
      const merged = (b.data || []).map(function(c){
        const s = curById[c.id];
        if (!s) return c;
        const out = Object.assign({}, c);
        SERVER_FIELDS.forEach(function(f){ if (s[f] !== undefined) out[f] = s[f]; });
        return out;
      });
      cfgSet('stateCampaigns', JSON.stringify(merged));
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
        (d.places||[]).forEach(p=>{ if(leads.length<(maxResults||100))leads.push({name:p.displayName?.text||'N/A',phone:p.nationalPhoneNumber||'N/A',address:p.formattedAddress||'N/A',website:p.websiteUri||'N/A',rating:p.rating||'N/A',reviews:p.userRatingCount||'N/A',neighborhood:comp_(p,['neighborhood','sublocality','sublocality_level_1']),cityReal:comp_(p,['locality','postal_town']),lat:p.location?.latitude??'',lng:p.location?.longitude??''}); });
        token=d.nextPageToken; tries++;
        if(!token)break;
        Utilities.sleep(2000);
      }
      return ok({leads,truncated:apiCalls>=MAX_API_CALLS});
    }
    if (a === 'setTrigger') {
      const fn = b.fn;
      if (fn !== 'runScheduledScrapes' && fn !== 'sendWeeklyReport' && fn !== 'runCadence' && fn !== 'runMonthlyResiduals') return err_('Invalid fn');
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
        } else if (fn === 'runMonthlyResiduals') {
          ScriptApp.newTrigger(fn).timeBased().onMonthDay(1).atHour(7).inTimezone('America/New_York').create();
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
  // The same daily trigger also advances any state campaigns.
  try { runStateCampaigns(); } catch (e) { Logger.log('runStateCampaigns error: ' + e.message); }
  return {added: totalAdded, ranAt, jobsRun, ofJobs: active.length, skipped};
}

// ── State campaigns: grid-sweep a whole state, up to dailyCap new leads/day per
// campaign, crawling each business's website for an email, until exhausted. ──
function campaignTileCenter_(b, rows, cols, idx) {
  const row = Math.floor(idx / cols), col = idx % cols;
  const dLat = (b.maxLat - b.minLat) / rows, dLng = (b.maxLng - b.minLng) / cols;
  return { lat: b.minLat + (row + 0.5) * dLat, lng: b.minLng + (col + 0.5) * dLng };
}

function runStateCampaigns() {
  let campaigns = [];
  try { campaigns = JSON.parse(cfgGet('stateCampaigns') || '[]'); } catch (e) { return; }
  if (!Array.isArray(campaigns) || !campaigns.length) return;

  // Per-campaign daily lead counter (resets each calendar day, ET).
  const todayKey = Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd');
  let daily = {}; try { daily = JSON.parse(cfgGet('campaignDaily') || '{}'); } catch (e) {}
  if (daily.date !== todayKey) daily = { date: todayKey, counts: {} };
  daily.counts = daily.counts || {};

  const leadsSheet = getSheet(SHEETS.leads, LEAD_HDR);
  const lRows = leadsSheet.getDataRange().getValues();
  const ph = lRows[0] || LEAD_HDR, pc = ph.indexOf('phone');
  const existing = new Set(lRows.slice(1).map(r => phoneKey(r[pc])).filter(Boolean));

  const url = 'https://places.googleapis.com/v1/places:searchText';
  const hdr = {'Content-Type':'application/json','X-Goog-Api-Key':PLACES_API_KEY,
    'X-Goog-FieldMask':'places.displayName,places.formattedAddress,places.addressComponents,places.location,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,nextPageToken'};
  const comp_=(p,types)=>{ const c=(p.addressComponents||[]).find(x=>(x.types||[]).some(t=>types.indexOf(t)>=0)); return c?(c.longText||c.shortText||''):''; };

  const RUN_BUDGET_MS = 270000, MAX_CALLS = 60, MAX_CRAWLS = 50;
  const t0 = Date.now();
  let apiCalls = 0, crawls = 0, grandAdded = 0;
  const now = new Date().toISOString();

  for (const camp of campaigns) {
    if (Date.now() - t0 > RUN_BUDGET_MS || apiCalls >= MAX_CALLS) break;
    if (!camp.active || camp.exhausted) continue;
    const total = (camp.tileCount || 0) * (camp.keywords || []).length;
    if (!total) continue;
    const capLeft = () => (camp.dailyCap || 100) - (daily.counts[camp.id] || 0);
    if (capLeft() <= 0) continue;

    let cursor = camp.cursor || 0;
    if (typeof camp.passAdded !== 'number') camp.passAdded = 0;   // persists across daily runs
    // Skip tiles that returned no businesses at all (ocean / barren) — pruned after
    // their first empty hit, then rechecked every ~14 days for new openings.
    const dead = new Set(Array.isArray(camp.dead) ? camp.dead : []);
    if (!camp.deadCheckedAt || (Date.now() - camp.deadCheckedAt) > 14*24*3600*1000) { dead.clear(); camp.deadCheckedAt = Date.now(); }
    const wrapCheck = () => { if (cursor === 0) { if (camp.passAdded === 0) return true; camp.passAdded = 0; } return false; };
    let steps = 0;
    // Walk forward through (tile × keyword) points until the daily cap, the run
    // budget, or a full no-new-leads pass (→ exhausted).
    while (capLeft() > 0 && apiCalls < MAX_CALLS && (Date.now() - t0) < RUN_BUDGET_MS && steps < total) {
      const tileIdx = Math.floor(cursor / camp.keywords.length) % camp.tileCount;
      const kwIdx   = cursor % camp.keywords.length;
      if (dead.has(tileIdx)) {   // known-empty tile: advance cheaply, no API call
        cursor = (cursor + 1) % total; steps++;
        if (wrapCheck()) { camp.exhausted = true; break; }
        continue;
      }
      const center  = campaignTileCenter_(camp.bounds, camp.rows, camp.cols, tileIdx);
      const keyword = camp.keywords[kwIdx];

      let token = null, tries = 0, addedHere = 0, placesTotal = 0;
      const baseBody = {textQuery:keyword, locationBias:{circle:{center:{latitude:center.lat,longitude:center.lng},radius:parseFloat(camp.radius||25000)}}, maxResultCount:20, ...(camp.region?{regionCode:camp.region}:{})};
      do {
        if (apiCalls >= MAX_CALLS || (Date.now() - t0) > RUN_BUDGET_MS || capLeft() <= 0) break;
        const body = token ? {...baseBody, pageToken:token} : baseBody;
        const r = UrlFetchApp.fetch(url, {method:'post', headers:hdr, payload:JSON.stringify(body), muteHttpExceptions:true});
        apiCalls++;
        let d = {}; try { d = JSON.parse(r.getContentText()); } catch(e) {}
        placesTotal += (d.places || []).length;
        (d.places||[]).forEach(p => {
          if (capLeft() <= 0) return;
          const phone = p.nationalPhoneNumber || '';
          const key = phoneKey(phone);
          if (!phone || phone === 'N/A' || !key || existing.has(key)) return;
          const website = p.websiteUri || '';
          let email = '';
          if (website && crawls < MAX_CRAWLS && (Date.now() - t0) < RUN_BUDGET_MS) { email = crawlEmail_(website); crawls++; }
          const lead = {
            id:Utilities.getUuid(), name:p.displayName?.text||'No name', phone, email,
            address:p.formattedAddress||'N/A', website:website||'N/A',
            rating:p.rating||'N/A', reviews:p.userRatingCount||'N/A',
            country:'United States', city:(comp_(p,['locality','postal_town'])||''), barrio:(comp_(p,['neighborhood','sublocality','sublocality_level_1'])||''),
            keyword, source:'State campaign · '+camp.state, sourceDetail:camp.industry||'',
            status:'New', dncReason:'', followUpDate:'', notes:JSON.stringify([]),
            providerId:'', providerRate:0, closerId:'', closerRate:0,
            dealValue:'', providerCommission:'', closerCommission:'', commissionStatus:'',
            lockedBy:'', lockedUntil:'', assignedAt:'', workHistory:JSON.stringify([]),
            importedAt:now, updatedAt:now,
            lat:p.location?.latitude??'', lng:p.location?.longitude??'',
          };
          leadsSheet.appendRow(LEAD_HDR.map(h => lead[h] ?? ''));
          existing.add(key);
          addedHere++; grandAdded++;
          daily.counts[camp.id] = (daily.counts[camp.id] || 0) + 1;
        });
        token = d.nextPageToken; tries++;
        if (!token) break;
        Utilities.sleep(2000);
      } while (tries < 3);

      if (placesTotal === 0) dead.add(tileIdx);   // no businesses here → prune the tile
      cursor = (cursor + 1) % total;
      steps++;
      camp.leadsFound = (camp.leadsFound || 0) + addedHere;
      camp.passAdded += addedHere;
      // A complete sweep of the grid (cursor wrapped to 0) that found nothing new
      // across the WHOLE pass — tracked across daily runs — means exhausted.
      if (wrapCheck()) { camp.exhausted = true; break; }
    }
    camp.cursor = cursor;
    camp.dead = [...dead];
    camp.lastRunAt = now;
  }

  cfgSet('stateCampaigns', JSON.stringify(campaigns));
  cfgSet('campaignDaily', JSON.stringify(daily));
  Logger.log('State campaigns: +' + grandAdded + ' leads, ' + apiCalls + ' calls, ' + crawls + ' site crawls.');
  return { added: grandAdded, apiCalls };
}

// Fetch a business website and extract the first plausible contact email.
// Best-effort: many sites hide emails behind forms, so a miss is normal.
function crawlEmail_(website) {
  try {
    let u = String(website).trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    const res = UrlFetchApp.fetch(u, {muteHttpExceptions:true, followRedirects:true, validateHttpsCertificates:false});
    if (res.getResponseCode() >= 400) return '';
    const html = res.getContentText().slice(0, 200000);
    // Prefer mailto: links, then any inline address.
    const mailto = html.match(/mailto:([^"'?>\s]+@[^"'?>\s]+)/i);
    const raw = mailto ? mailto[1] : (html.match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i) || [])[0];
    if (!raw) return '';
    const email = raw.toLowerCase().replace(/[.,;]+$/, '');
    // Skip junk/placeholder/asset addresses.
    if (/(example\.|sentry|wix|\.png|\.jpg|\.gif|\.webp|godaddy|domain\.com|email@|your@|name@)/i.test(email)) return '';
    return email;
  } catch (e) { return ''; }
}

// ── Monthly residual commissions (time-triggered) ──────────────────────────
// For each lead with an active residual whose closer is on a residual plan,
// generate this month's commission row (one per lead per period). Dedups against
// existing rows, so it's safe to run repeatedly. Set on a monthly trigger via
// setTrigger('runMonthlyResiduals'). Mirrors the client generateResiduals().
function runMonthlyResiduals() {
  const period = Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM');
  const ls = getSheet(SHEETS.leads, LEAD_HDR), lr = ls.getDataRange().getValues(), lh = lr[0] || LEAD_HDR;
  const idc=lh.indexOf('id'), nc=lh.indexOf('name'), stc=lh.indexOf('status'), clc=lh.indexOf('closerId'),
        pidc=lh.indexOf('providerId'), rac=lh.indexOf('residualActive'), rrc=lh.indexOf('residualRate'), rmc=lh.indexOf('residualMRR');
  if (rac < 0) return { created: 0, period };   // older sheet without residual columns

  const ts = getSheet(SHEETS.team, TEAM_HDR), tr = ts.getDataRange().getValues(), th = tr[0] || TEAM_HDR;
  const tIdc=th.indexOf('id'), tNc=th.indexOf('name'), tCtc=th.indexOf('commissionType');
  const team = {};
  for (let i = 1; i < tr.length; i++) team[String(tr[i][tIdc])] = { name: tr[i][tNc], type: String(tr[i][tCtc] || '') };

  const cs = getSheet(SHEETS.commissions, COMM_HDR), cr = cs.getDataRange().getValues(), ch = cr[0] || COMM_HDR;
  const clic=ch.indexOf('leadId'), cpc=ch.indexOf('period');
  const seen = new Set();
  for (let i = 1; i < cr.length; i++) seen.add(String(cr[i][clic]) + '|' + String(cpc >= 0 ? (cr[i][cpc] || '') : ''));

  const now = new Date().toISOString();
  let created = 0;
  for (let i = 1; i < lr.length; i++) {
    const r = lr[i];
    if (String(r[rac]).toLowerCase() !== 'true') continue;
    if (String(r[stc]) !== 'Closed Won') continue;
    const closer = team[String(r[clc])];
    if (!closer || closer.type !== 'residual') continue;
    const leadId = String(r[idc]);
    if (seen.has(leadId + '|' + period)) continue;
    const mrr = parseFloat(r[rmc] || 0), rate = parseFloat(r[rrc] || 0);
    if (!mrr || !rate) continue;
    const rec = {
      id: Utilities.getUuid(), leadId, leadName: r[nc], dealValue: mrr, collectedAmount: '',
      providerId: r[pidc] || '', providerName: '', providerRate: 0, providerAmount: 0,
      closerId: String(r[clc]), closerName: closer.name, closerRate: rate, closerAmount: +(mrr * rate / 100).toFixed(2),
      status: 'pending', paidAt: '', paidBy: '', paymentRef: '', createdAt: now, recurring: true, period,
    };
    cs.appendRow(COMM_HDR.map(k => rec[k] != null ? rec[k] : ''));
    seen.add(leadId + '|' + period);
    created++;
  }
  cfgSet('lastResidualRun', JSON.stringify({ ranAt: now, period, created }));
  Logger.log('Monthly residuals: +' + created + ' for ' + period);
  return { created, period };
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
  return '\n\n--\n' + addr +
    '\nNot relevant? Reply STOP or use the unsubscribe link and we\'ll stop immediately.';
}
// Mark every lead with this email as Do Not Call (one-click unsubscribe target).
function markUnsubscribed_(em) {
  em = String(em || '').trim().toLowerCase();
  if (!em) return 0;
  try {
    const ls = getSheet(SHEETS.leads, LEAD_HDR), rows = ls.getDataRange().getValues(), h = rows[0] || LEAD_HDR;
    const ec = h.indexOf('email'), stc = h.indexOf('status'), dc = h.indexOf('dncReason'), uc = h.indexOf('updatedAt');
    if (ec < 0) return 0;
    let n = 0; const now = new Date().toISOString();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][ec] || '').trim().toLowerCase() === em) {
        if (stc >= 0) ls.getRange(i + 1, stc + 1).setValue('Do Not Call');
        if (dc  >= 0) ls.getRange(i + 1, dc + 1).setValue('unsubscribe (email)');
        if (uc  >= 0) ls.getRange(i + 1, uc + 1).setValue(now);
        n++;
      }
    }
    return n;
  } catch (e) { return 0; }
}
// Resend email. Returns {sid,status} on success, {error} on failure.
function resendSend_(email, subject, body, opts) {
  opts = opts || {};
  const payload = { from: RESEND_FROM, to: [email], reply_to: REPLY_TO_EMAIL, subject: subject || 'AXIUS', text: String(body || '') + emailFooter_() };
  const headers = {};
  // Thread a reply under the recipient's email (In-Reply-To / References headers).
  if (opts.inReplyTo) { headers['In-Reply-To'] = opts.inReplyTo; headers['References'] = opts.references || opts.inReplyTo; }
  // One-click unsubscribe — required by Google/Yahoo bulk-sender rules for inbox
  // placement. HTTPS one-click when the web-app URL is known, mailto otherwise.
  const mailtoUnsub = 'mailto:' + REPLY_TO_EMAIL + '?subject=unsubscribe';
  const base = PROP_('WEBAPP_URL', '');
  if (base) {
    const httpUnsub = base + (base.indexOf('?') < 0 ? '?' : '&') + 'action=unsubscribe&e=' + encodeURIComponent(email);
    headers['List-Unsubscribe'] = '<' + httpUnsub + '>, <' + mailtoUnsub + '>';
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  } else {
    headers['List-Unsubscribe'] = '<' + mailtoUnsub + '>';
  }
  if (Object.keys(headers).length) payload.headers = headers;
  const res = UrlFetchApp.fetch('https://api.resend.com/emails', {
    method:'post', contentType:'application/json',
    headers:{ Authorization:'Bearer ' + RESEND_API_KEY },
    payload: JSON.stringify(payload),
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
  // US is the active market, English, email-first. The FIRST email is generated by
  // the industry engine (composeFirstEmail_ / SINCERE_TEMPLATE below). These step
  // arrays hold the FOLLOW-UPS (and SMS, which is parked until A2P). Once a lead
  // replies, runAiReplies takes over with the tailored response + booking link.
  'United States': {
    sms: [
      { variants: [
        "Hi, this is {agent} with {company}. Quick one about {business}: who runs the tech behind it, the software, automations and vendors? Usually it's no one, or you. We take that over and run it as one operation, for less than a hire. Open to a short call?",
        "Hi, {agent} from {company}. Most owners run {business} on a handful of tools and whoever set them up. We become the one accountable owner for all of it, one monthly figure, less than a hire. Worth a quick chat?",
        "Hello, this is {agent} with {company}. We run the whole technology side for a {category} like {business}, the software, automations, data and vendors, so you stop holding it together. One owner, one figure. Open to a short conversation?",
      ] },
      { variants: [
        "Hi, {agent} from {company} again. Everything we run stays in your accounts, so you're never locked in, and it usually costs less than what you already spend across tools. Happy to show what we'd cover for {business}. If now isn't the time, no problem.",
        "Hi, this is {agent} with {company}. Following up on {business}. I can show you what running your tech as one operation would cover, and roughly what it'd cost. If the timing's off, just say the word and I'll step back.",
      ] },
    ],
    email: [
      // Step 0 (the FIRST email) is built by the industry engine below
      // (composeFirstEmail_ / SINCERE_TEMPLATE), NOT from here — this index is a
      // kept placeholder so the follow-ups stay at the right step indices.
      // Index 1 = second touch, index 2 = third touch (the FOLLOW-UPS).
      { variants: ["(first email is generated by the industry engine)"] },
      { variants: [
        "Following up on {business}. The whole idea is simple. One person owns your software, automations, data and vendors and runs it as one operation. It stays in your accounts, so you're never locked in, and it usually costs less than one hire. Open to a quick call Wednesday or Thursday?\n\n{agent}\n{company}",
        "Circling back. Most owners are surprised how much is already going out across tools and vendors once it's all in one view. We pull it into one operation, usually for less, with one name on the result. Worth fifteen minutes this week?\n\n{agent}\n{company}",
      ] },
      { variants: [
        "Last note from me on this. If it helps, I'll send a quick one page read on what {business} spends across its tech and vendors today versus running it as one operation. No strings, yours either way. Want it?\n\n{agent}\n{company}",
        "One more and I'll leave it. Fifteen minutes and I'll show you what running {business}'s technology as one operation would cover, and what it'd cost next to today. Worst case you get a clearer picture. Open to it?\n\n{agent}\n{company}",
      ] },
    ],
  },
};

// ── Outreach copy engine ─────────────────────────────────────────────────────
// One sincere, human email from a real operator to a business owner. It leads
// with THEM, is honest that it's a cold note, shows genuine understanding of
// their world (the per-industry `detail` is the only segment-specific part), and
// frames the offer as lifting a weight off them, not as a pitch about us. The AI
// version makes it feel hand-written to the specific business; this is also the
// reliable fallback. `keys` match the lead's keyword/category/name.
const INDUSTRY_ANGLES = [
  { seg:'dental', keys:['dent','orthodont','endodont','periodont','oral surg'],
    detail:"The booking, the reminders, the new-patient follow-up, a handful of tools that don't quite talk to each other" },
  { seg:'medical', keys:['clinic','medical','doctor','physician','dermatolog','chiro','vet','veterinar','optomet','physical therap','pediatr','urgent care','wellness','health'],
    detail:"Scheduling, intake, reminders, records, a handful of systems that don't quite talk to each other" },
  { seg:'restaurant', keys:['restaurant','cafe','coffee','bar ','pub','food','pizz','grill','bakery','cater','diner','eatery','bistro','taco','sushi','kitchen','brew'],
    detail:"Scheduling, reservations, the delivery apps, the weekly numbers, all of it leaning on whoever's around that day" },
  { seg:'home', keys:['contract','plumb','hvac','roof','electric','construction','landscap','remodel','paint','clean','pest','garage','fenc','lawn','handyman','flooring','concrete','solar','restoration','septic','window','door','gutter','tree'],
    detail:"Leads coming in from a few different places, the follow-up, the quotes, the invoicing, all of it riding on someone remembering" },
  { seg:'beauty', keys:['salon','spa','barber','nail','beauty','hair','lash','brow','tattoo','massage','wax','aesthet','medspa','skin'],
    detail:"Booking, reminders, reviews, a few apps that don't talk, and the no-shows that slip through when it's busy" },
  { seg:'auto', keys:['auto','car ','tire','mechanic','body shop','dealer','detailing','transmission','collision','muffler','brake','automotive','vehicle','motor'],
    detail:"The calls, the scheduling, the service reminders, a few systems that don't quite talk to each other" },
  { seg:'retail', keys:['retail','shop','store','boutique','ecommerce','e-commerce','apparel','clothing','jewel','furniture','grocery','market','goods','supply','outlet'],
    detail:"Point of sale, inventory, the online store, the spreadsheets, none of them quite agreeing" },
  { seg:'professional', keys:['law','attorney','lawyer','legal','account','cpa','tax','insur','real estate','realtor','mortgage','financ','consult','architect','engineer','notary','title','escrow','advis','broker'],
    detail:"Intake, follow-up, documents, a few systems that don't talk, and the good leads that go cold while someone catches up" },
  { seg:'fitness', keys:['gym','fitness','yoga','pilates','crossfit','train','martial','dance','studio','athletic','wellness center','cycling'],
    detail:"Memberships, class booking, billing, and the member follow-up that only happens when there's time" },
  { seg:'hospitality', keys:['hotel','motel','inn','resort','lodge','hostel','bnb','bed and breakfast','suites','vacation rental'],
    detail:"Bookings from a handful of channels, guest messages scattered across inboxes, the reports stitched together by hand" },
];
const INDUSTRY_DEFAULT = {
  seg:'default',
  detail:"The software, the follow-up, the vendors, a dozen tools that half-work and don't talk to each other",
};
// The sincere first email. {detail} is the industry-specific line; {business}
// fills via cadenceRender. Leads with the reader, honest, warm, low-pressure.
const SINCERE_TEMPLATE =
  "Hi there,\n\n" +
  "I came across {business} and wanted to reach out, one owner to another.\n\n" +
  "Most owners I meet are great at what they do, but somewhere along the way the technology side became a second job they never wanted. {detail}. It quietly lands on you, on top of everything else.\n\n" +
  "I'd like to take that off your plate, for good. Not sell you another app, but actually own and run your whole technology side for you, the way a real in-house team would, for less than the cost of one hire. So you get back to the part you actually love.\n\n" +
  "Could I borrow fifteen minutes this week? Even if we're not the right fit, you'll come away knowing exactly where {business} is leaking time and money, and what I'd fix first.";
// Personal, low-key subjects (rotated per lead). Sincere, not salesy.
const SUBJECT_LINES = [
  "A note for {business}",
  "Reaching out about {business}",
  "Quick question about {business}",
];
// Match a lead to its industry angle by scanning keyword/category/source/name.
function pickIndustryAngle_(lead) {
  lead = lead || {};
  const hay = (String(lead.keyword || '') + ' ' + String(lead.sourceDetail || '') + ' ' + String(lead.name || '')).toLowerCase();
  for (let i = 0; i < INDUSTRY_ANGLES.length; i++) {
    const a = INDUSTRY_ANGLES[i];
    for (let k = 0; k < a.keys.length; k++) { if (hay.indexOf(a.keys[k]) >= 0) return a; }
  }
  return INDUSTRY_DEFAULT;
}
// Build the FIRST email: sincere template with the industry detail woven in.
// The AI version makes it hand-written; this is the reliable fallback.
function composeFirstEmail_(lead, company, agent) {
  const a = pickIndustryAngle_(lead);
  const raw = SINCERE_TEMPLATE.replace(/\{detail\}/g, a.detail || INDUSTRY_DEFAULT.detail);
  return cadenceRender(raw, lead, company, agent) + '\n\n' + agent + '\n' + company;
}
// Subject line for a lead's first email — personal + low-key, rotated per lead.
function cadenceSubjectFor_(lead, company, agent) {
  const subj = SUBJECT_LINES[pickVariant(lead.id, 7, SUBJECT_LINES.length)] || CADENCE_EMAIL_SUBJECT;
  return cadenceRender(subj, lead, company, agent);
}

function cadencePhoneKey(p) { const d = String(p || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; }
function cadenceChannel(country) {
  const c = String(country || '').trim().toLowerCase();
  if (c === 'united states' || c === 'usa') return 'sms';   // phone channel (parked until A2P)
  return '';
}
// Set at the start of runCadence from cfg.smsEnabled. While SMS is parked
// (A2P pending), the autopilot is email-first: any lead with an email is
// emailed rather than routed to the (disabled) SMS channel.
var CAD_SMS_ON = false;
function cadenceResolveChannel(lead) {
  lead = lead || {};
  if (!CAD_SMS_ON && String(lead.email || '').trim()) return 'email';
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
  const country = (lead && CADENCE_STEPS[lead.country]) ? lead.country : 'United States';
  return (CADENCE_STEPS[country] || {})[ch] || [];
}
function cadenceRender(body, lead, company, agent) {
  lead = lead || {};
  const map = {
    // Spanish tokens (legacy) + English aliases (current US copy) — same values.
    negocio: lead.name || '', business: lead.name || '',
    ciudad: lead.city || '', city: lead.city || '',
    barrio: lead.barrio || '', neighborhood: lead.barrio || '',
    categoria: String(lead.keyword || '').toLowerCase(), category: String(lead.keyword || '').toLowerCase(),
    nombre: lead.contactName || lead.name || '', name: lead.contactName || lead.name || '',
    empresa: company || 'AXIUS', company: company || 'AXIUS',
    agente: agent || '', agent: agent || '',
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
// Per-lead US timezone so quiet hours + send windows use the LEAD's local time,
// not the server's. Dominant IANA zone per state (multi-zone states pick the
// dominant zone: FL→Eastern, TX→Central, ID→Mountain, OR→Pacific, etc.). Worst
// case is ~1h skew at a state edge, vs. up to 3h before. Source: the state in the
// stored address; longitude as a fallback; Eastern as last resort.
const US_STATE_TZ = {
  AL:'America/Chicago', AK:'America/Anchorage', AZ:'America/Phoenix', AR:'America/Chicago',
  CA:'America/Los_Angeles', CO:'America/Denver', CT:'America/New_York', DE:'America/New_York',
  FL:'America/New_York', GA:'America/New_York', HI:'Pacific/Honolulu', ID:'America/Denver',
  IL:'America/Chicago', IN:'America/New_York', IA:'America/Chicago', KS:'America/Chicago',
  KY:'America/New_York', LA:'America/Chicago', ME:'America/New_York', MD:'America/New_York',
  MA:'America/New_York', MI:'America/New_York', MN:'America/Chicago', MS:'America/Chicago',
  MO:'America/Chicago', MT:'America/Denver', NE:'America/Chicago', NV:'America/Los_Angeles',
  NH:'America/New_York', NJ:'America/New_York', NM:'America/Denver', NY:'America/New_York',
  NC:'America/New_York', ND:'America/Chicago', OH:'America/New_York', OK:'America/Chicago',
  OR:'America/Los_Angeles', PA:'America/New_York', RI:'America/New_York', SC:'America/New_York',
  SD:'America/Chicago', TN:'America/Chicago', TX:'America/Chicago', UT:'America/Denver',
  VT:'America/New_York', VA:'America/New_York', WA:'America/Los_Angeles', WV:'America/New_York',
  WI:'America/Chicago', WY:'America/Denver', DC:'America/New_York',
};
function usStateFromAddress_(address) {
  const s = String(address || '');
  const m = s.match(/,\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/) || s.match(/,\s*([A-Z]{2})\s*,?\s*(?:USA)?\s*$/);
  return m ? m[1].toUpperCase() : '';
}
function usTzFromLng_(lng) {
  const x = Number(lng);
  if (!isFinite(x)) return 'America/New_York';
  if (x < -114) return 'America/Los_Angeles';
  if (x < -100) return 'America/Denver';
  if (x < -87)  return 'America/Chicago';
  return 'America/New_York';
}
function leadTz_(lead) {
  lead = lead || {};
  const c = String(lead.country || '').trim().toLowerCase();
  if (c === 'united states' || c === 'usa' || c === '') {
    const st = usStateFromAddress_(lead.address);
    if (st && US_STATE_TZ[st]) return US_STATE_TZ[st];
    return usTzFromLng_(lead.lng);
  }
  return 'America/New_York';
}
// Optional send window: only fire on chosen weekdays + hours, in the lead's local
// time. Off by default; turned on via the cadence config (sendTimeOptimized).
function withinSendWindow(localDow, localHour, cfg) {
  const days = (cfg && cfg.sendDays && cfg.sendDays.length) ? cfg.sendDays : [2, 3, 4]; // Tue–Thu
  const hs = (cfg && cfg.sendHourStart != null) ? cfg.sendHourStart : 8;
  const he = (cfg && cfg.sendHourEnd   != null) ? cfg.sendHourEnd   : 12;
  return days.indexOf(localDow) >= 0 && localHour >= hs && localHour < he;
}
// Is this address worth sending to? Catches the obvious bounce/complaint risks the
// scraper picks up: bad syntax, disposable domains, and no-reply/automated inboxes.
// (Apps Script can't do live SMTP/MX checks; full verification needs an API.)
var DISPOSABLE_DOMAINS = {'mailinator.com':1,'guerrillamail.com':1,'10minutemail.com':1,'tempmail.com':1,'temp-mail.org':1,'trashmail.com':1,'yopmail.com':1,'getnada.com':1,'sharklasers.com':1,'throwaway.email':1,'maildrop.cc':1,'fakeinbox.com':1,'dispostable.com':1};
function isSendableEmail_(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || e === 'n/a') return false;
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)) return false;          // local@domain.tld
  const at = e.split('@'), local = at[0], dom = at[1];
  if (!dom || DISPOSABLE_DOMAINS[dom]) return false;
  if (/^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce|abuse|notifications?)$/.test(local)) return false;
  if (/(example\.|sentry|wixpress|\.png|\.jpg|\.gif|godaddy|domain\.com|email@|your@|name@|test@test)/.test(e)) return false;
  return true;
}
function cadenceToE164_(phone, country) {
  const raw = String(phone || '').replace(/[^\d+]/g, ''); if (!raw) return '';
  if (raw[0] === '+') { const d = raw.slice(1).replace(/\D/g, ''); return d.length >= 8 ? '+' + d : ''; }
  const digits = raw.replace(/\D/g, ''); if (!digits) return '';
  const dial = { 'Colombia':'57', 'Estados Unidos':'1', 'United States':'1', 'USA':'1' }[country] || '';
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
    sendTimeOptimized: typeof s.sendTimeOptimized === 'boolean' ? s.sendTimeOptimized : false,
    sendDays:   Array.isArray(s.sendDays) && s.sendDays.length ? s.sendDays : [2, 3, 4],   // Tue–Thu
    sendHourStart: hr(s.sendHourStart, 8),
    sendHourEnd:   hr(s.sendHourEnd, 12),
    postalAddress: s.postalAddress || COMPANY_POSTAL_ADDRESS,
    smsEnabled: typeof s.smsEnabled === 'boolean' ? s.smsEnabled : false,
    aiReplies:  typeof s.aiReplies  === 'boolean' ? s.aiReplies  : false,
    aiPersonalize: typeof s.aiPersonalize === 'boolean' ? s.aiPersonalize : false,
  };
}

// ── Inbound EMAIL reply tracking ────────────────────────────────────────────
// Polls the Workspace inbox (replies land here via REPLY_TO_EMAIL), matches each
// message's sender to a lead by email, logs an inbound interaction, and stamps
// lastReplyAt — which auto-pauses that lead's cadence (replyShouldPause) so a
// human (or the AI step) takes over. Dedup by Gmail message id. Driven by the
// same hourly cadence trigger. This is the "know exactly who responded" piece.
function runInboundEmailScan() {
  if (typeof GmailApp === 'undefined') return { logged: 0 };
  const ls = getSheet(SHEETS.leads, LEAD_HDR);
  const rows = ls.getDataRange().getValues();
  const h = rows[0] || LEAD_HDR;
  const ec=h.indexOf('email'), idc=h.indexOf('id'), nc=h.indexOf('name'), phc=h.indexOf('phone'),
        rc=h.indexOf('lastReplyAt'), uc=h.indexOf('updatedAt'), stc=h.indexOf('status'), dc=h.indexOf('dncReason');
  if (ec < 0) return { logged: 0 };

  // email → lead row indices (a phone-deduped lead may still share an email).
  // Also build a domain → {rows, emails} map so a reply from a DIFFERENT mailbox
  // at the same business domain (info@biz.com on file, owner answers from
  // john@biz.com) still matches — but only when that domain is unambiguous (one
  // business) and not a shared public provider.
  const PUBLIC_EMAIL = {'gmail.com':1,'googlemail.com':1,'yahoo.com':1,'ymail.com':1,'outlook.com':1,'hotmail.com':1,'live.com':1,'msn.com':1,'icloud.com':1,'me.com':1,'mac.com':1,'aol.com':1,'proton.me':1,'protonmail.com':1,'gmx.com':1,'zoho.com':1};
  const byEmail = {}, byDomain = {};
  for (let i = 1; i < rows.length; i++) {
    const e = String(rows[i][ec] || '').trim().toLowerCase();
    if (!e || e.indexOf('@') < 0) continue;
    (byEmail[e] = byEmail[e] || []).push(i);
    const dom = e.split('@')[1];
    if (dom && !PUBLIC_EMAIL[dom]) {
      const d = byDomain[dom] = byDomain[dom] || { rows: [], emails: {} };
      d.rows.push(i); d.emails[e] = 1;
    }
  }
  if (!Object.keys(byEmail).length) return { logged: 0 };

  // Dedup: Gmail message ids already logged as interactions (sid column).
  const is = getSheet(SHEETS.interactions, INTERACTION_HDR);
  const iRows = is.getDataRange().getValues(), ih = iRows[0] || INTERACTION_HDR, sidc = ih.indexOf('sid');
  const seen = new Set(iRows.slice(1).map(r => String(r[sidc] || '')).filter(Boolean));

  let logged = 0;
  const threads = GmailApp.search('in:inbox newer_than:14d', 0, 60);
  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      const msgId = msg.getId();
      if (seen.has(msgId)) continue;
      const fromRaw = msg.getFrom() || '';
      const m = fromRaw.match(/<([^>]+)>/);
      const from = (m ? m[1] : fromRaw).trim().toLowerCase();
      let idxs = byEmail[from];
      if (!idxs) {                                // same-domain fallback (one unambiguous business)
        const dom = from.split('@')[1];
        const d = dom && byDomain[dom];
        if (d && Object.keys(d.emails).length === 1) idxs = d.rows;
      }
      if (!idxs) continue;                       // not from a lead
      const body = String(msg.getPlainBody() || '').replace(/\s+\n/g, '\n').slice(0, 4000);
      const nowIso = new Date().toISOString();
      const optout = isOptOutGs(body);
      idxs.forEach(i => {
        appendInteraction_({ id:Utilities.getUuid(), leadId:rows[i][idc], leadName:rows[i][nc], phone:rows[i][phc] || '',
          channel:'email', direction:'in', body:body, stepTag:'',
          status:'received', sid:msgId, error:'', createdAt:nowIso, createdBy:'inbound-email' });
        if (rc >= 0) ls.getRange(i + 1, rc + 1).setValue(nowIso);
        if (uc >= 0) ls.getRange(i + 1, uc + 1).setValue(nowIso);
        if (optout && stc >= 0) {
          ls.getRange(i + 1, stc + 1).setValue('Do Not Call');
          if (dc >= 0) ls.getRange(i + 1, dc + 1).setValue('opt-out (email)');
        }
      });
      seen.add(msgId);
      logged++;
    }
  }
  if (logged) { try { notifyTelegram('📨 ' + logged + ' new email repl' + (logged === 1 ? 'y' : 'ies') + ' logged in the CRM.'); } catch (e) {} }
  cfgSet('lastInboundScan', JSON.stringify({ ranAt: new Date().toISOString(), logged }));
  return { logged };
}

// ── AI reply drafting (Gemini, free) ────────────────────────────────────────
// Call Gemini and return the plain-text completion, or '' on any failure.
function geminiGenerate_(system, prompt) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.indexOf('TU_') === 0) return '';
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(GEMINI_API_KEY);
    const payload = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
    };
    const res = UrlFetchApp.fetch(url, { method:'post', contentType:'application/json', payload:JSON.stringify(payload), muteHttpExceptions:true });
    const d = JSON.parse(res.getContentText() || '{}');
    const text = d && d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts
      ? d.candidates[0].content.parts.map(function(p){ return p.text || ''; }).join('').trim() : '';
    return text;
  } catch (e) { Logger.log('geminiGenerate_ error: ' + e.message); return ''; }
}

// AI-personalized FIRST email: analyzes the lead (type, city, rating/reviews) and
// tailors the opener + which of our disciplines to emphasize, to lift reply rates.
// Returns '' on any failure so the caller falls back to the deterministic template.
function geminiPersonalizeEmail_(lead, cfg) {
  lead = lead || {};
  const agent = (cfg && cfg.agentName) || CADENCE_AGENT_NAME || 'Andres';
  const company = (cfg && cfg.company) || CADENCE_COMPANY || 'Axius';
  const facts = [];
  if (lead.name) facts.push('Business name: ' + lead.name);
  if (lead.keyword) facts.push('Business type: ' + lead.keyword);
  if (lead.city) facts.push('Location: ' + lead.city + (lead.barrio ? ', ' + lead.barrio : ''));
  if (lead.rating && String(lead.rating) !== 'N/A') {
    facts.push('Google rating: ' + lead.rating + (lead.reviews && String(lead.reviews) !== 'N/A' ? ' (' + lead.reviews + ' reviews)' : ''));
  }
  if (lead.website && String(lead.website) !== 'N/A') facts.push('Has a website: ' + lead.website);
  if (!facts.length) return '';   // nothing to personalize on — use the template

  const angle = pickIndustryAngle_(lead);
  const system = 'You are ' + agent + ', a real person and the operator behind ' + company + ', writing one sincere cold email to a ' +
    'local business owner. ' + AXIUS_BRIEF + ' ' +
    'THE TONE IS EVERYTHING. This must feel like a genuine, humble note from one person to another, NOT marketing and NOT a pitch about ' +
    'us. Lead with THEM. Be honest that it is a cold email. Show you actually understand what their days are like as an owner. Make the ' +
    'offer about lifting a weight off them, not about how great we are. They should finish it feeling respected and a little relieved that ' +
    'someone gets it, not sold to. ' +
    'Rewrite the BASELINE below in that spirit. Keep its shape: open with the reader and {business}, name the real day-to-day tech burden ' +
    'for their kind of business, then offer to actually own and run the whole technology side for them (for less than one hire, everything ' +
    'stays in their name), and close with a low-pressure ask. Keep the full idea (their whole technology side handled, one accountable ' +
    'owner), do not shrink it to one feature, and do not turn it into a list of services or lead with price. ' +
    'You may weave in the real facts below to make it feel hand-written, but NEVER invent specifics, owner names, numbers, pricing, or ' +
    'results, and do not flatter their rating. WRITE LIKE A WARM, HONEST HUMAN: contractions, plain words, short paragraphs with a blank ' +
    'line between each (the greeting on its own line first), varied sentence length. NO em dashes, no "I hope this finds you well", no ' +
    'buzzwords, no rule-of-three, no salesy polish. Keep it tight: around 90 to 110 words. ' +
    'Close with a confident, value-focused ask, not an apology. Invite a short call this week, and make clear that even if it is not a fit, ' +
    'they will come away knowing exactly where their business is leaking time and money and what you would fix first. Do not be weak or ' +
    'overly permissive about a no. Plain text, no subject line, and do NOT sign off or add your name; the signature is added automatically.';
  const prompt = 'Their business: ' + (lead.name || '') + (lead.keyword ? ' (' + lead.keyword + ')' : '') +
    '\n\nBASELINE email to make more human and personal (keep its sincerity and full meaning):\n' +
    composeFirstEmail_(lead, company, agent).replace(/\n+[^\n]*\n[^\n]*$/, '').trim() +
    '\n\nReal facts you may use, sparingly and only if natural:\n' + facts.join('\n') + '\n\nWrite the email now.';
  const draft = geminiGenerate_(system, prompt);
  if (!draft) return '';   // generation failed → caller falls back to the template
  // Append the sign-off deterministically — never rely on the model to add it.
  // Strip any name/company line it may have tacked on anyway, to avoid a double sign-off.
  let body = String(draft).trim();
  const tail = new RegExp('\\n+\\s*(' + agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '|' + company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')[\\s,.-]*$', 'i');
  body = body.replace(tail, '').trim().replace(tail, '').trim();
  return body + '\n\n' + agent + '\n' + company;
}

// When a business replies, draft a tailored response (addressing what they said)
// with the Cal booking link and send it — automatically, looping until they book,
// opt out, a human takes over, or the per-lead cap is hit. Reply-gated + capped.
// Inert unless cfg.aiReplies is on; previews (logs only) while the cadence is in
// dry-run, sends for real when the cadence is live.
function runAiReplies() {
  const cfg = getCadenceCfg_();
  if (!cfg.aiReplies) return { sent: 0, skipped: 'disabled' };
  const live = cfg.enabled === true;

  const ls = getSheet(SHEETS.leads, LEAD_HDR);
  const rows = ls.getDataRange().getValues(), h = rows[0] || LEAD_HDR;
  const idc=h.indexOf('id'), nc=h.indexOf('name'), ec=h.indexOf('email'), cc=h.indexOf('city'),
        kc=h.indexOf('keyword'), stc=h.indexOf('status'), lbc=h.indexOf('lockedBy');
  const leadById = {};
  for (let i = 1; i < rows.length; i++) leadById[String(rows[i][idc])] = rows[i];

  // All interactions, grouped per lead, oldest→newest.
  const is = getSheet(SHEETS.interactions, INTERACTION_HDR);
  const iRows = is.getDataRange().getValues(), ih = iRows[0] || INTERACTION_HDR;
  const di=ih.indexOf('direction'), bo=ih.indexOf('body'), li=ih.indexOf('leadId'),
        ca=ih.indexOf('createdAt'), tg=ih.indexOf('stepTag'), sd=ih.indexOf('sid'), cb=ih.indexOf('createdBy'), chc=ih.indexOf('channel');
  const threadOf = {};
  for (let i = 1; i < iRows.length; i++) {
    const lid = String(iRows[i][li] || ''); if (!lid) continue;
    (threadOf[lid] = threadOf[lid] || []).push(iRows[i]);
  }
  Object.keys(threadOf).forEach(function(k){ threadOf[k].sort(function(a,b){ return new Date(a[ca]) - new Date(b[ca]); }); });

  const company = cfg.company, agent = cfg.agentName;
  const system = 'You are ' + agent + ', the named operator behind ' + company + '. ' + AXIUS_BRIEF + ' ' +
    'When relevant, you can speak to the specific areas that fit their business, but keep it natural and never list them all. ' +
    'You are replying to a business owner who answered a cold email. Goal: get them to book a short call. Lead with value, never price. ' +
    'Handle pushback with the trust commitments above, briefly and plainly: if they ask about price, do NOT quote a number, say it ' +
    'depends on scope and you\'ll size it on the call; if they worry about being locked in or trust, note everything stays in their own ' +
    'accounts and they can leave anytime fully operational; if they say they already have someone or a vendor, the point is one ' +
    'accountable owner for the whole thing, not another point fix, and one person quietly holding it together is exactly the risk. ' +
    'WRITE LIKE A REAL PERSON typing a quick email, NOT like AI. Hard rules: do NOT use em dashes (—) at all; use periods, ' +
    'commas or just two sentences instead. Avoid the obvious AI tells: no "I hope this finds you well", no rule-of-three ' +
    'lists, no "Even if X, you\'ll Y", no "Worth a quick chat?" formula, no buzzwords, no over-polished symmetry. ' +
    'Be plain, direct, a little casual, confident but low-key. Contractions are good. Vary your sentence lengths. ' +
    'Keep it short (40-90 words). Directly address what they actually wrote, then point them to THIS exact link to grab ' +
    'a time: ' + BOOKING_URL + '. Always include the link. Never invent pricing, specific features, metrics, or ' +
    'commitments. No emojis. Plain text, no subject line. Sign off simply as ' + agent + '.';

  let sent = 0, considered = 0;
  const AI_MAX_PER_RUN = 25;   // cap per hourly run so a reply-storm can't blow the Gemini/Resend quota
  for (const lid of Object.keys(threadOf)) {
    if (sent >= AI_MAX_PER_RUN) break;
    const lead = leadById[lid]; if (!lead) continue;
    const status = String(lead[stc] || 'New');
    if (status === 'Do Not Call' || status === 'Closed Won' || status === 'Closed Lost') continue;
    if (lbc >= 0 && String(lead[lbc] || '')) continue;            // a human claimed it
    const email = String(lead[ec] || '').trim(); if (!email) continue;

    const thread = threadOf[lid];
    const last = thread[thread.length - 1];
    if (String(last[di]) !== 'in') continue;                       // latest msg isn't their reply
    const inboundSid = String(last[sd] || '');
    const dedupeTag = 'ai:' + (inboundSid || last[ca]);
    if (thread.some(function(r){ return String(r[tg]) === dedupeTag; })) continue;   // already answered this reply
    const aiCount = thread.filter(function(r){ return String(r[cb]) === 'ai'; }).length;
    if (aiCount >= AI_MAX_REPLIES) continue;                       // cap reached → leave for a human
    considered++;

    const convo = thread.slice(-6).map(function(r){
      return (String(r[di]) === 'in' ? 'THEM' : 'US') + ': ' + String(r[bo] || '').slice(0, 600);
    }).join('\n');
    const prompt = 'Business: ' + String(lead[nc] || '') + (lead[cc] ? ' (' + lead[cc] + ')' : '') +
      (lead[kc] ? ' — ' + lead[kc] : '') + '\n\nConversation so far:\n' + convo +
      '\n\nWrite our next reply now.';
    const draft = geminiGenerate_(system, prompt);
    if (!draft) continue;

    const nowIso = new Date().toISOString();
    if (live) {
      // Thread under their reply: pull the inbound email's Message-ID + subject so
      // our response lands in the same conversation (best-effort; falls back to a
      // fresh email if the source message can't be read).
      let subject = 'Re: quick question for ' + String(lead[nc] || 'your team');
      let threadOpts = {};
      if (chc < 0 || String(last[chc]) === 'email') {
        try {
          const gmsg = GmailApp.getMessageById(inboundSid);
          if (gmsg) {
            const subj = gmsg.getSubject() || '';
            if (subj) subject = /^re:/i.test(subj) ? subj : ('Re: ' + subj);
            const mid = (gmsg.getRawContent().match(/^message-id:\s*(<[^>]+>)/im) || [])[1];
            if (mid) threadOpts = { inReplyTo: mid, references: mid };
          }
        } catch (e) { /* not a Gmail message / no access — send fresh */ }
      }
      const r = resendSend_(email, subject, draft, threadOpts);
      appendInteraction_({ id:Utilities.getUuid(), leadId:lid, leadName:lead[nc], phone:'',
        channel:'email', direction:'out', body:draft, stepTag:dedupeTag,
        status: r.sid ? 'sent' : 'error', sid:r.sid || '', error:r.error || '',
        createdAt:nowIso, createdBy:'ai' });
      if (r.sid) sent++;
    } else {
      Logger.log('[AI dry-run] → ' + email + ': ' + draft.slice(0, 160));
    }
  }
  cfgSet('lastAiReplies', JSON.stringify({ ranAt: new Date().toISOString(), sent, considered, live }));
  return { sent, considered, live };
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
    CAD_SMS_ON = !!cfg.smsEnabled;     // email-first routing while SMS is parked
    const gapMs = cfg.gapDays * 24 * 3600 * 1000;
    const now = new Date(), nowMs = now.getTime();

    // Pull in any new email replies FIRST so freshly-logged replies pause their
    // sequence in this same run (the snapshot reads below pick them up).
    try { runInboundEmailScan(); } catch (e) { Logger.log('runInboundEmailScan error: ' + e.message); }
    // Then let the AI answer those replies (with the booking link). Reply-gated,
    // capped, and opt-in (cfg.aiReplies); dry-runs unless the cadence is live.
    try { runAiReplies(); } catch (e) { Logger.log('runAiReplies error: ' + e.message); }

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
      // Don't enroll an email-channel lead whose address isn't worth sending to
      // (junk/disposable/no-reply) — keeps bounce + complaint rates down.
      if (cadenceResolveChannel(lead) === 'email' && !isSendableEmail_(lead.email)) return;
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

      const channel = cadenceResolveChannel(lead);
      // SMS/WhatsApp are parked until A2P is enabled — never send on them, even
      // if a phone-only lead resolved to that channel.
      if ((channel === 'sms' || channel === 'whatsapp') && !CAD_SMS_ON) return;
      // Stop any already-enrolled lead whose email isn't sendable (junk/disposable),
      // so we never bounce against it on every run.
      if (channel === 'email' && !isSendableEmail_(lead.email)) {
        if (live) { seq.state = 'stopped:rejected'; seq.pausedReason = 'stopped:bademail'; seq.updatedAt = now.toISOString(); writeSeqRow_(seqsSheet, rowOf[String(seq.leadId)], seq, sh); }
        return;
      }
      // Quiet hours apply to EVERY channel now, in the LEAD's local time, so we
      // never email a California business at 5am Eastern. Out-of-window leads are
      // skipped and naturally retried on the next in-window hourly run.
      const tz = leadTz_(lead);
      const localHour = parseInt(Utilities.formatDate(now, tz, 'H'), 10);
      if (!withinQuietHours(localHour, cfg.quietStart, cfg.quietEnd)) return;
      // Optional: only send Tue–Thu mornings (lead-local) when send-time
      // optimization is on. Off by default so volume isn't silently throttled.
      if (cfg.sendTimeOptimized) {
        const localDow = parseInt(Utilities.formatDate(now, tz, 'u'), 10);   // 1=Mon..7=Sun
        if (!withinSendWindow(localDow, localHour, cfg)) return;
      }

      const steps = cadenceSteps(lead);
      const stepIndex = Number(seq.stepIndex || 0);
      if (stepIndex >= steps.length) {
        if (live) { seq.state = 'done'; seq.updatedAt = now.toISOString(); writeSeqRow_(seqsSheet, rowOf[String(seq.leadId)], seq, sh); }
        return;
      }
      const stepTag = 'seq:' + stepIndex;
      let body = cadenceMessage(lead, stepIndex, cfg.company, cfg.agentName);
      // First email is built from the lead's INDUSTRY angle (segment-specific pain
      // + the exact thing we fix), which beats a generic opener. Follow-ups keep
      // their templates.
      if (channel === 'email' && stepIndex === 0) {
        const composed = composeFirstEmail_(lead, cfg.company, cfg.agentName);
        if (composed) body = composed;
        // AI then REFINES this same angle to the specific business (grounded, not
        // from scratch). Falls back to the composed segment email if AI is off.
        if (cfg.aiPersonalize) {
          try { const p = geminiPersonalizeEmail_(lead, cfg); if (p) body = p; } catch (e) { Logger.log('personalize error: ' + e.message); }
        }
      }
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
      if (channel === 'email') { result = lead.email ? resendSend_(lead.email, cadenceSubjectFor_(lead, cfg.company, cfg.agentName), body) : {error:'no email'}; }
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
