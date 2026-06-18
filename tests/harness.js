/* ── AIV-CRM test harness (zero dependencies) ──────────────────────────
   Loads the real app source into a stubbed sandbox and runs tests/cases.js
   against the actual functions. No npm, no build.

       node tests/harness.js

   Exit code 0 = all pass, 1 = any failure. Add behaviors to tests/cases.js. */

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { webcrypto } = require('crypto');

const ROOT = path.resolve(__dirname, '..');

// App source loaded in dependency order. Only files whose functions are under
// test (or their dependencies) — NOT main.js (its init IIFE touches the DOM at
// load) and NOT api.js/storage.js (exercised via the browser harnesses).
const APP_FILES = [
  'js/data/constants.js',
  'js/data/keywords.js',
  'js/data/locations.js',
  'js/data/states.js',      // campaignGrid, campaignTile
  'js/data/demo-data.js',
  'js/core/state.js',
  'js/core/utils.js',
  'js/features/leads.js',   // scoreLead, isOverdue, isTodayFU
  'js/commission.js',       // calcCommissions, fmtUSD
  'js/features/scraper.js', // barrioCoords, barrioHash
  'js/features/import.js',  // parseCSV, autoMapHeaders, splitCSV
  'js/data/outreach-templates.js', // OUTREACH_TEMPLATES
  'js/features/outreach.js',// pickChannel, toE164, renderTemplate, isOptOut
  'js/features/cadence-core.js', // cadence engine pure decision core
  'js/features/inbox.js',   // leadsNeedingResponse, waitedLabel
  'js/auth/auth.js',        // sha256, isWeakPin, sessionSig
];

// Minimal browser stubs so app files load without a DOM. Function bodies only
// run when a test calls them; these cover load-time top-level access.
const noop = () => {};
const elStub = () => ({ style:{}, classList:{add:noop,remove:noop,toggle:noop,contains:()=>false}, appendChild:noop, addEventListener:noop, setAttribute:noop, removeAttribute:noop, querySelector:()=>null, value:'', textContent:'', innerHTML:'' });
const store = () => { const m = new Map(); return { getItem:k=>m.has(k)?m.get(k):null, setItem:(k,v)=>m.set(k,String(v)), removeItem:k=>m.delete(k), clear:()=>m.clear() }; };

const sandbox = {
  console,
  crypto: webcrypto,
  TextEncoder, TextDecoder,
  Intl, Date, Math, JSON, URLSearchParams,
  setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
  localStorage: store(),
  sessionStorage: store(),
  navigator: { clipboard: { writeText: noop } },
  fetch: async () => ({ json: async () => ({}) }),
  alert: noop, confirm: () => true, prompt: () => null,
  toast: noop,
  document: {
    addEventListener: noop,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: elStub,
    body: elStub(),
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const prologue = `
const __TESTS = [];
function test(name, fn) { __TESTS.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error((msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(expected) + ' got ' + JSON.stringify(actual));
}
`;
const epilogue = `
;(async () => {
  const results = [];
  for (const tc of __TESTS) {
    try { await tc.fn(); results.push({ name: tc.name, ok: true }); }
    catch (e) { results.push({ name: tc.name, ok: false, err: e.message }); }
  }
  return results;
})()`;

const appSrc = APP_FILES.map(f => `\n/* ===== ${f} ===== */\n` + fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const caseSrc = fs.readFileSync(path.join(__dirname, 'cases.js'), 'utf8');

const script = prologue + appSrc + '\n/* ===== cases ===== */\n' + caseSrc + '\n' + epilogue;

vm.createContext(sandbox);
Promise.resolve(vm.runInContext(script, sandbox, { filename: 'aiv-tests.js' }))
  .then(results => {
    let pass = 0, fail = 0;
    for (const r of results) {
      if (r.ok) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + r.name); }
      else      { fail++; console.log('  \x1b[31m✗\x1b[0m ' + r.name + '\n      ' + r.err); }
    }
    console.log('\n' + (fail === 0 ? '\x1b[32mALL PASS\x1b[0m' : '\x1b[31mFAILURES\x1b[0m') + `: ${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch(e => { console.error('Harness error:', e.stack || e.message); process.exit(2); });
