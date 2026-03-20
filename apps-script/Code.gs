// AIV CRM — Apps Script v4
// Rellena TODAS las constantes antes de deployar

const SHEET_ID           = 'TU_SPREADSHEET_ID';
const PLACES_API_KEY     = 'TU_GOOGLE_PLACES_API_KEY';
const TWILIO_ACCOUNT_SID = 'ACxxxx';
const TWILIO_API_KEY_SID = 'SKxxxx';
const TWILIO_API_SECRET  = 'your_api_secret';
const TWILIO_AUTH_TOKEN  = 'your_auth_token';
const TWILIO_TWIML_APP   = 'APxxxx';
const TWILIO_FROM_NUMBER = '+15551234567';
const DRIVE_FOLDER_ID    = 'TU_DRIVE_FOLDER_ID';
const SHEETS = { leads:'Leads', calls:'Llamadas', team:'Team', commissions:'Commissions' };

// CSRF protection — paste the value from your browser's Setup page
const CRM_SECRET = 'PASTE_YOUR_CRM_SECRET_HERE'; // Setup → shows after first load

const LEAD_HDR = ['id','name','phone','address','website','rating','reviews','city','barrio','keyword','source','sourceDetail','status','providerId','providerRate','closerId','closerRate','dealValue','providerCommission','closerCommission','commissionStatus','lockedBy','lockedUntil','assignedAt','workHistory','dncReason','followUpDate','notes','importedAt','updatedAt'];
const CALL_HDR = ['id','leadId','leadName','phone','callSid','outcome','duration','notes','recordingUrl','driveUrl','consentConfirmed','calledAt'];
const TEAM_HDR = ['id','name','role','pinHash','providerRate','closerRate','contact','active','createdAt'];
const COMM_HDR = ['id','leadId','leadName','dealValue','providerId','providerRate','providerAmount','closerId','closerRate','closerAmount','status','createdAt','paidAt','paidBy','paymentRef'];

function getSheet(name, hdr) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); s.appendRow(hdr); }
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
    if (a === 'ping') return ok({ping:true,serverTime:new Date().toISOString()});
    if (a === 'pull') {
      const since = e.parameter.since;
      let leads = toObjs(getSheet(SHEETS.leads,LEAD_HDR)).map(l=>({...l,notes:tryParse(l.notes,[])}));
      if(since){const sd=new Date(since);leads=leads.filter(l=>!l.updatedAt||new Date(l.updatedAt)>=sd);}
      const calls = toObjs(getSheet(SHEETS.calls,CALL_HDR));
      const team  = toObjs(getSheet(SHEETS.team,TEAM_HDR));
      const comms = toObjs(getSheet(SHEETS.commissions,COMM_HDR));
      return ok({leads,calls,team,commissions:comms,serverTime:new Date().toISOString()});
    }
    if (a === 'getToken') return ok({token:createToken(e.parameter.identity||'agent')});
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
    const b = JSON.parse(e.postData.contents||'{}');
    if (CRM_SECRET !== 'PASTE_YOUR_CRM_SECRET_HERE' && b._secret !== CRM_SECRET) {
      return err_('Unauthorized');
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
          h.forEach((col,ci)=>{
            if(Object.prototype.hasOwnProperty.call(b,col)){
              s.getRange(i+1,ci+1).setValue((col==='notes'||col==='workHistory')?JSON.stringify(b[col]||[]):(b[col]??''));
            }
          });
          s.getRange(i+1,h.indexOf('updatedAt')+1).setValue(new Date().toISOString());
          break;
        }
      }
      return ok({updated:true});
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
      const exists=rows.slice(1).some(r=>String(r[lc])===String(b.leadId));
      if(!exists)s.appendRow(COMM_HDR.map(h=>b[h]??''));
      return ok({saved:!exists,duplicate:exists});
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
    if (a === 'rec_hook') {
      const callSid=b.CallSid||e.parameter.CallSid, recUrl=b.RecordingUrl||e.parameter.RecordingUrl;
      if(callSid&&recUrl){ try{const du=saveToDrive(recUrl,callSid);patchCallRec(callSid,recUrl,du);}catch(ex){Logger.log(ex.message);} }
      return ok({ok:true});
    }
    if (a === 'scrape') {
      const {keyword,lat,lng,radius,maxResults} = b;
      const url='https://places.googleapis.com/v1/places:searchText';
      const hdr={'Content-Type':'application/json','X-Goog-Api-Key':PLACES_API_KEY,'X-Goog-FieldMask':'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,nextPageToken'};
      let body={textQuery:keyword,locationBias:{circle:{center:{latitude:parseFloat(lat),longitude:parseFloat(lng)},radius:parseFloat(radius)}},maxResultCount:20};
      let leads=[],token=null,tries=0;
      while(leads.length<(maxResults||100)&&tries<10){
        if(token)body={textQuery:keyword,pageToken:token};
        const r=UrlFetchApp.fetch(url,{method:'post',headers:hdr,payload:JSON.stringify(body),muteHttpExceptions:true});
        const d=JSON.parse(r.getContentText());
        if(d.error)return err_(d.error.message);
        (d.places||[]).forEach(p=>{ if(leads.length<maxResults)leads.push({name:p.displayName?.text||'N/A',phone:p.nationalPhoneNumber||'N/A',address:p.formattedAddress||'N/A',website:p.websiteUri||'N/A',rating:p.rating||'N/A',reviews:p.userRatingCount||'N/A'}); });
        token=d.nextPageToken; tries++;
        if(!token)break;
        Utilities.sleep(2000);
      }
      return ok({leads});
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

function ok(d){return ContentService.createTextOutput(JSON.stringify({success:true,...d})).setMimeType(ContentService.MimeType.JSON)}
function err_(m){return ContentService.createTextOutput(JSON.stringify({success:false,error:m})).setMimeType(ContentService.MimeType.JSON)}
