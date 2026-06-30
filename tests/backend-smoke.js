/* Backend smoke test — EXECUTES the Apps Script web handlers (doGet/doPost) inside a
 * stubbed Google-APIs sandbox, so runtime errors (ReferenceError, undefined calls, throws)
 * in the handlers are caught locally — the class of bug that syntax-check + unit tests miss.
 * It would have caught "ADMIN_GATE_HASH is not defined". Run: node tests/backend-smoke.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

const SECRET = 'test-secret';
const props = { CRM_SECRET: SECRET, ADMIN_GATE_HASH: '', SHEET_ID: 'sheet', GEMINI_API_KEY: '',
  PROVISION_SECRET: '', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_TOKEN: '', RESEND_API_KEY: '' };

const sheet = {
  getDataRange: () => ({ getValues: () => [['']] }),
  getRange: () => ({ getValues: () => [['']], getValue: () => '', setValue() { return this; }, setValues() { return this; } }),
  getLastRow: () => 1, getLastColumn: () => 1, getName: () => 's', appendRow() {}, setName() { return this; },
  getFilesByName: () => ({ hasNext: () => false }),
};
const ss = { getSheetByName: () => sheet, insertSheet: () => sheet, getSheets: () => [sheet], getId: () => 'sheet' };

const sandbox = {
  console, JSON, Math, Date, Array, Object, String, Number, Boolean, RegExp, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
  PropertiesService: { getScriptProperties: () => ({
    getProperty: (k) => (props[k] != null ? props[k] : null), setProperty: (k, v) => { props[k] = v; },
    deleteProperty: (k) => { delete props[k]; }, getProperties: () => props, setProperties: (o) => Object.assign(props, o) }) },
  SpreadsheetApp: { openById: () => ss, create: () => ss, getActiveSpreadsheet: () => ss },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
  ContentService: { createTextOutput: (t) => ({ _t: t, setMimeType() { return this; } }), MimeType: { JSON: 'json', XML: 'xml', TEXT: 'text' } },
  HtmlService: { createHtmlOutput: (h) => ({ _h: h }) },
  Utilities: { getUuid: () => 'u' + Math.random().toString(36).slice(2), sleep() {},
    computeDigest: () => [1, 2, 3], DigestAlgorithm: { SHA_256: 'x' }, Charset: { UTF_8: 'x' },
    computeHmacSha256Signature: () => [1, 2, 3], base64Encode: () => 'b64', base64EncodeWebSafe: () => 'b64',
    formatDate: () => '2026-01-01', newBlob: (d) => ({ getDataAsString: () => String(d), setName() { return this; }, setContentType() { return this; } }) },
  Session: { getScriptTimeZone: () => 'America/New_York', getActiveUser: () => ({ getEmail: () => 'a@b.com' }) },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://exec' }), getProjectTriggers: () => [], getOAuthToken: () => 'tok' },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}',
    getBlob: () => ({ getDataAsString: () => '', setName() { return this; }, setContentType() { return this; } }) }) },
  DriveApp: { getFolderById: () => ({}), getFileById: () => ({}), getRootFolder: () => ({}) },
  GmailApp: { search: () => [] }, CalendarApp: {}, MailApp: {},
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
try { vm.runInContext(code, sandbox, { filename: 'Code.gs' }); }
catch (e) { console.error('❌ Code.gs failed to LOAD: ' + e.message); process.exit(1); }

function invoke(method, action, body, params) {
  const e = method === 'POST'
    ? { parameter: { action, ...(params || {}) }, postData: { contents: JSON.stringify({ _secret: SECRET, ...(body || {}) }) } }
    : { parameter: { action, _s: SECRET, ...(params || {}) } };
  const out = (method === 'POST' ? sandbox.doPost : sandbox.doGet)(e);
  const text = out && (out._t != null ? out._t : out._h);
  return text;
}

let pass = 0, fail = 0;
function check(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + e.message); fail++; } }

check('Code.gs loads (all top-level consts evaluate)', () => { if (typeof sandbox.doPost !== 'function' || typeof sandbox.doGet !== 'function') throw new Error('doGet/doPost missing'); });
check('doPost ping', () => { const r = JSON.parse(invoke('POST', 'ping')); if (!r.ping) throw new Error('no ping'); });
check('doGet ping', () => { const r = JSON.parse(invoke('GET', 'ping')); if (!r.ping) throw new Error('no ping'); });
check('doPost pull (authed) — runs pullPayload_', () => { const r = JSON.parse(invoke('POST', 'pull', {})); if (!r.success) throw new Error('not ok: ' + JSON.stringify(r).slice(0, 120)); });
check('doGet pull (authed) — runs pullPayload_', () => { const r = JSON.parse(invoke('GET', 'pull', null, {})); if (!r.success) throw new Error('not ok'); });
check('doPost adminLogin runs', () => { const r = JSON.parse(invoke('POST', 'adminLogin', { code: '00000000' })); if (typeof r !== 'object') throw new Error('no object'); });
check('doPost repLogin runs', () => { const r = JSON.parse(invoke('POST', 'repLogin', { pin: '0000' })); if (!r.serverAuth) throw new Error('no serverAuth'); });
check('doPost checkTriggers runs', () => { JSON.parse(invoke('POST', 'checkTriggers', {})); });
check('doPost bad secret rejected', () => { const r = JSON.parse(invoke('POST', 'pull', {})); void r; const bad = sandbox.doPost({ parameter: { action: 'pull' }, postData: { contents: JSON.stringify({ _secret: 'wrong' }) } }); const j = JSON.parse(bad._t); if (j.success) throw new Error('bad secret was accepted'); });

console.log(fail ? `\n❌ backend-smoke: ${pass} passed, ${fail} failed` : `\n✅ backend-smoke: ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
