/* ── Test cases for AIV-CRM core logic ─────────────────────────────────
   Runs inside the sandbox built by tests/harness.js, in the SAME lexical
   scope as the loaded app source — so it can call the app's real functions
   (calcCommissions, scoreLead, isWeakPin, sha256, sessionSig, …) directly.
   Helpers available: test(name, fn), assert(cond,msg), eq(actual,expected,msg).
   fn may be async. Add a test() call per behavior you want guarded.        */

// ── Commission math (money — highest risk) ───────────────────────────
test('calcCommissions: closer + provider as % of deal value', () => {
  S.team = [{id:'c', closerRate:10}, {id:'p', providerRate:3}];
  const r = calcCommissions({closerId:'c', providerId:'p'}, 1_000_000);
  eq(r.closerAmount,   100_000, 'closerAmount');
  eq(r.providerAmount,  30_000, 'providerAmount');
});

test('calcCommissions: falls back to lead rates when team member absent', () => {
  S.team = [];
  const r = calcCommissions({closerRate:12, providerRate:5}, 200_000);
  eq(r.closerAmount,   24_000, 'closer fallback');
  eq(r.providerAmount, 10_000, 'provider fallback');
});

test('calcCommissions: zero when no rates anywhere', () => {
  S.team = [];
  const r = calcCommissions({}, 500_000);
  eq(r.closerAmount,   0, 'closer zero');
  eq(r.providerAmount, 0, 'provider zero');
});

test('fmtUSD: formats numbers, guards invalid input', () => {
  assert(fmtUSD(0) !== '--', 'zero should format, not dash');
  assert(fmtUSD(3500).includes('3,500') && fmtUSD(3500).includes('$'), 'USD: $3,500');
  eq(fmtUSD(null),  '--', 'null → dash');
  eq(fmtUSD('abc'), '--', 'NaN → dash');
});

// ── PIN strength (security) ──────────────────────────────────────────
test('isWeakPin: rejects repeats and sequences, allows strong', () => {
  ['1111','0000','1234','9876'].forEach(p => assert(isWeakPin(p), p + ' should be weak'));
  ['4827','1928','5093'].forEach(p => assert(!isWeakPin(p), p + ' should be strong'));
  assert(!isWeakPin('12'), 'non-4-digit handled elsewhere → not weak here');
});

// ── Lead scoring (deterministic, weight-driven) ──────────────────────
test('scoreLead: deterministic and weight-correct', () => {
  const strong = {phone:'+573001112222', rating:'4.5', reviews:'127', status:'New', website:'x.co', followUpDate:''};
  const empty  = {phone:'N/A', rating:'', reviews:'', status:'', website:'N/A', followUpDate:''};
  eq(scoreLead(strong), scoreLead(strong), 'deterministic');
  // 40 phone + 20 ratingHigh + 15 reviewsHigh + 10 statusNuevo + 5 website = 90
  eq(scoreLead(strong), 90, 'strong lead score');
  eq(scoreLead(empty),   0, 'empty lead score');
  assert(scoreLead(strong) > scoreLead(empty), 'strong outranks empty');
});

// ── Scraper geo helper (deterministic spread) ────────────────────────
test('barrioCoords: deterministic and offset-bounded', () => {
  const base = {lat:6.2442, lng:-75.5812};
  const a = barrioCoords(base, 'Laureles');
  const b = barrioCoords(base, 'Laureles');
  eq(a.lat, b.lat, 'lat deterministic');
  eq(a.lng, b.lng, 'lng deterministic');
  assert(Math.abs(parseFloat(a.lat) - base.lat) < 0.02, 'lat offset bounded');
  assert(Math.abs(parseFloat(a.lng) - base.lng) < 0.02, 'lng offset bounded');
});

// ── Hashing / session signing (security) ─────────────────────────────
test('sha256: known vector matches built-in ADMIN_HASH (PIN 2819)', async () => {
  eq(await sha256('2819'), ADMIN_HASH, 'sha256(2819)');
});

test('sessionSig: deterministic and tamper-sensitive', async () => {
  S.config = {crmSecret: 'install-key'};
  const a = await sessionSig({userId:'u1', role:'closer'});
  const b = await sessionSig({userId:'u1', role:'closer'});
  const escalated = await sessionSig({userId:'u1', role:'admin'});
  eq(a, b, 'same input → same signature');
  assert(a !== escalated, 'flipping role changes the signature');
});

test('sessionSig: depends on crmSecret (per-install)', async () => {
  S.config = {crmSecret: 'key-A'};
  const a = await sessionSig({userId:'u1', role:'admin'});
  S.config = {crmSecret: 'key-B'};
  const b = await sessionSig({userId:'u1', role:'admin'});
  assert(a !== b, 'different install secret → different signature');
});

// ── CSV import parsing (regression for the "CSV vacío" false-negative) ─
test('parseCSV: parses Spanish headers + non-empty rows', () => {
  const csv = 'nombre,telefono,direccion\nPanaderia,+573001112222,Cra 70\nCafe,+573004445555,Calle 1';
  const { headers, rows } = parseCSV(csv);
  eq(headers.join(','), 'nombre,telefono,direccion', 'headers lowercased');
  eq(rows.length, 2, 'two data rows');
  eq(rows[0].nombre, 'Panaderia', 'first cell');
});

test('parseCSV: empty / header-only input yields no rows (no crash)', () => {
  eq(parseCSV('').rows.length, 0, 'empty');
  eq(parseCSV('only,header').rows.length, 0, 'header only');
  eq(parseCSV(null).rows.length, 0, 'null');
});

test('parseCSV: quoted commas are preserved', () => {
  const { rows } = parseCSV('name,address\n"Doe, John","Cra 1, #2"');
  eq(rows.length, 1, 'one row');
  eq(rows[0].address, 'Cra 1, #2', 'comma inside quotes kept');
});

test('autoMapHeaders: detects Spanish + English aliases', () => {
  const m = autoMapHeaders(['nombre','telefono','direccion','website','rating','resenas']);
  eq(m.nombre,'name'); eq(m.telefono,'phone'); eq(m.direccion,'address');
  eq(m.website,'website'); eq(m.rating,'rating'); eq(m.resenas,'reviews');
  const m2 = autoMapHeaders(['name','mobile','opiniones']);
  eq(m2.name,'name'); eq(m2.mobile,'phone'); eq(m2.opiniones,'reviews');
});

test('autoMapHeaders: unrecognized headers map to nothing', () => {
  eq(Object.keys(autoMapHeaders(['col_a','col_b'])).length, 0, 'no auto-map for unknown headers');
});

// ── Phone dedup key (scraper/import re-run must not re-add existing leads) ──
test('phoneKey: collapses CO formatting variants to one key', () => {
  eq(phoneKey('+57 320 123 4567'), '3201234567', 'last 10 digits');
  // same Colombian number, different formats → same key:
  eq(phoneKey('+57 320 123 4567'), phoneKey('573201234567'), 'spaced vs raw +57');
  eq(phoneKey('+57 320 123 4567'), phoneKey('3201234567'),  'with vs without country code');
  eq(phoneKey('+57 320 123 4567'), phoneKey('(320) 123-4567'), 'punctuation ignored');
});

test('phoneKey: US variants collapse; distinct numbers stay distinct', () => {
  eq(phoneKey('+1 (305) 555-0199'), phoneKey('3055550199'), 'US +1 vs 10-digit');
  assert(phoneKey('3201234567') !== phoneKey('3209999999'), 'different numbers → different keys');
});

test('phoneKey: too-short / junk → empty (never dedups spuriously)', () => {
  eq(phoneKey('N/A'), '', 'N/A');
  eq(phoneKey(''), '', 'empty');
  eq(phoneKey('12345'), '', 'fewer than 10 digits');
  eq(phoneKey(null), '', 'null');
});

// ── Outreach pure logic (Project A slice 1) ────────────────────────────
test('pickChannel: US→sms, unknown→email', () => {
  eq(pickChannel({country:'United States'}), 'sms');
  eq(pickChannel({country:'Brazil'}), 'email', 'unknown country → email');
  eq(pickChannel({}), 'email', 'no country → email');
});

test('toE164: formats US, respects existing +/country code, junk→empty', () => {
  eq(toE164('(305) 555-0199', 'United States'), '+13055550199', 'US 10-digit gets +1');
  eq(toE164('+1 305 555 0199', 'United States'), '+13055550199', 'already + kept');
  eq(toE164('13055550199', 'United States'), '+13055550199', 'already has country code');
  eq(toE164('', 'United States'), '', 'empty → empty');
  eq(toE164('abc', 'United States'), '', 'junk → empty');
});

test('renderTemplate: rich tokens resolve; unknown/empty degrade gracefully', () => {
  const lead = {name:'Brickell Coffee', city:'Miami', keyword:'Cafe'};
  const out = renderTemplate('Hi, this is {agent} with {company}. I saw {business} in {city}.', lead, 'Andres');
  assert(out.includes('Brickell Coffee') && out.includes('Miami') && out.includes('Andres'), 'tokens merged');
  assert(out.indexOf('{') === -1, 'no literal tokens left');
  // empty token collapses without leaving "{neighborhood}" or double spaces
  const out2 = renderTemplate('{business} {neighborhood} closing', {name:'X'}, '');
  eq(out2, 'X closing', 'empty token + whitespace tidied');
});

test('isOptOut: keywords + natural language YES; neutral replies NO', () => {
  ['STOP','baja','Cancelar','salir','no me interesa','déjenme en paz','remove me','not interested','quítame','do not contact']
    .forEach(s => assert(isOptOut(s), '"'+s+'" should opt out'));
  ['no tengo tiempo hoy','¿cuánto cuesta?','no estoy seguro','me interesa','sí, llámame','quiero más información','interesante']
    .forEach(s => assert(!isOptOut(s), '"'+s+'" must NOT opt out'));
});

test('sequenceCounts: tallies cadence states correctly', () => {
  const c = sequenceCounts([
    {state:'active'},{state:'active'},{state:'paused:claimed'},{state:'paused:replied'},
    {state:'stopped:optout'},{state:'stopped:manual'},{state:'done'},{state:''},
  ]);
  eq(c.active, 2, 'active'); eq(c.paused, 1, 'paused (non-replied)'); eq(c.replied, 1, 'replied');
  eq(c.stopped, 2, 'stopped:*'); eq(c.done, 1, 'done'); eq(c.total, 8, 'total');
  const z = sequenceCounts([]); eq(z.total, 0, 'empty');
});

test('seqStateLabel: maps states to human labels, falls back', () => {
  eq(seqStateLabel('active'), 'Active');
  eq(seqStateLabel('paused:replied'), 'Replied — handoff');
  eq(seqStateLabel('stopped:optout'), 'Opt-out');
  eq(seqStateLabel('weird'), 'weird', 'unknown → passthrough');
});

test('OUTREACH_TEMPLATES: seeded per country×channel, on-voice (no emoji)', () => {
  assert(OUTREACH_TEMPLATES['United States'].sms.length >= 1, 'US sms seeded');
  assert(OUTREACH_TEMPLATES['United States'].email.length >= 1, 'US email seeded');
  const all = JSON.stringify(OUTREACH_TEMPLATES);
  assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(all), 'no emoji in seed templates');
  assert(all.includes('{agent}') && all.includes('{business}'), 'templates use merge tokens');
});

// ── Cadence engine: pure decision core (Motor de Secuencias) ─────────────
test('cadenceChannel: country → channel routing', () => {
  eq(cadenceChannel('United States'), 'sms');
  eq(cadenceChannel('united states'), 'sms', 'case-insensitive');
  eq(cadenceChannel('USA'), 'sms', 'alias');
  eq(cadenceChannel('Mexico'), '', 'unknown country → no channel');
  eq(cadenceChannel(''), '', 'empty → no channel');
});

test('cadenceResolveChannel: phone-by-country, else email, else unreachable', () => {
  eq(cadenceResolveChannel({country:'United States', phone:'(415) 555 1234'}), 'sms');
  eq(cadenceResolveChannel({country:'United States', phone:'N/A', email:'a@b.co'}), 'email', 'no usable phone → email');
  eq(cadenceResolveChannel({country:'', email:'a@b.co'}), 'email', 'no country but email');
  eq(cadenceResolveChannel({country:'United States', phone:'123'}), '', 'junk phone, no email → unreachable');
});

test('cadenceEligible: only untouched + reachable + not-yet-enrolled', () => {
  const ok = {status:'New', country:'United States', phone:'3055550199'};
  assert(cadenceEligible(ok, false), 'fresh reachable lead is eligible');
  assert(!cadenceEligible(ok, true), 'already enrolled → not eligible');
  assert(!cadenceEligible({...ok, status:'Contacted'}, false), 'worked lead → not eligible');
  assert(!cadenceEligible({...ok, status:'Do Not Call'}, false), 'opted-out → not eligible');
  assert(!cadenceEligible({status:'New', country:'Mexico', phone:'3201234567'}, false), 'no channel → not eligible');
});

test('cadenceGuard: live state → correct stop/pause', () => {
  const seq = {enrolledAt:'2026-05-01T00:00:00Z'};
  eq(cadenceGuard({status:'New'}, seq), '', 'fresh → proceed');
  eq(cadenceGuard({status:'Do Not Call'}, seq), 'stopped:optout');
  eq(cadenceGuard({status:'Closed Won'}, seq), 'stopped:closed');
  eq(cadenceGuard({status:'Not Interested'}, seq), 'stopped:rejected');
  eq(cadenceGuard({status:'Closed Lost'}, seq), 'stopped:rejected');
  eq(cadenceGuard({status:'New', lockedBy:'agent1'}, seq), 'paused:claimed');
  eq(cadenceGuard({status:'Contacted'}, seq), 'paused:claimed', 'human engaged');
  eq(cadenceGuard({status:'New', lastReplyAt:'2026-05-02T00:00:00Z'}, seq), 'paused:replied');
  eq(cadenceGuard(null, seq), 'stopped:rejected', 'missing lead');
});

test('replyShouldPause: only replies AFTER enrollment pause', () => {
  const seq = {enrolledAt:'2026-05-10T00:00:00Z'};
  assert(replyShouldPause({lastReplyAt:'2026-05-11T00:00:00Z'}, seq), 'later reply pauses');
  assert(!replyShouldPause({lastReplyAt:'2026-05-09T00:00:00Z'}, seq), 'earlier reply does not');
  assert(!replyShouldPause({}, seq), 'no reply → no pause');
});

test('withinQuietHours: 08:00–20:00 inclusive/exclusive boundary', () => {
  assert(!withinQuietHours(7), '7am quiet');
  assert(withinQuietHours(8), '8am ok');
  assert(withinQuietHours(19), '7pm ok');
  assert(!withinQuietHours(20), '8pm quiet');
  assert(!withinQuietHours(23), 'night quiet');
});

test('pickVariant: deterministic, in-range, varies across leads', () => {
  eq(pickVariant('leadA', 0, 1), 0, 'single variant → 0');
  eq(pickVariant('leadA', 0, 3), pickVariant('leadA', 0, 3), 'stable for same lead+step');
  const v = pickVariant('leadA', 0, 3); assert(v >= 0 && v < 3, 'in range');
  // across many leads we should see more than one distinct variant chosen
  const seen = new Set();
  for (let i = 0; i < 30; i++) seen.add(pickVariant('lead' + i, 0, 3));
  assert(seen.size >= 2, 'variants spread across leads');
});

test('cadenceJitterMinutes: deterministic, within bound', () => {
  eq(cadenceJitterMinutes('leadA', 360), cadenceJitterMinutes('leadA', 360), 'stable');
  const j = cadenceJitterMinutes('leadA', 360); assert(j >= 0 && j < 360, 'within window');
});

test('cadenceMessage: renders an on-voice, token-filled, emoji-free message', () => {
  const lead = {id:'L1', country:'United States', phone:'3055550199', name:'Brickell Coffee', city:'Miami', keyword:'Cafe'};
  const msg = cadenceMessage(lead, 0, 'AXIUS', 'Andres');
  assert(msg.includes('Brickell Coffee'), 'business token filled');
  assert(msg.includes('AXIUS') && msg.includes('Andres'), 'company + agent filled');
  assert(!msg.includes('{'), 'no leftover tokens');
  assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(msg), 'no emoji');
  eq(cadenceMessage(lead, 9, 'AXIUS', 'Andrés'), '', 'out-of-range step → empty');
});

test('advanceSequence: advances with gap, marks done at end', () => {
  const now = Date.parse('2026-05-31T10:00:00Z'); const gap = 2*24*3600*1000;
  const a = advanceSequence({stepIndex:0}, 2, now, gap, 0);
  eq(a.stepIndex, 1); eq(a.state, 'active');
  eq(a.nextRunAt, new Date(now + gap).toISOString(), 'next run = now + 2d');
  const b = advanceSequence({stepIndex:1}, 2, now, gap, 0);
  eq(b.stepIndex, 2); eq(b.state, 'done'); eq(b.nextRunAt, '', 'done has no nextRun');
});

test('alreadySent: real sends block, dryrun/error do not', () => {
  const inter = [
    {leadId:'L1', direction:'out', stepTag:'seq:0', status:'sent'},
    {leadId:'L1', direction:'out', stepTag:'seq:1', status:'dryrun'},
    {leadId:'L1', direction:'out', stepTag:'seq:2', status:'error'},
    {leadId:'L1', direction:'in',  stepTag:'seq:3', status:'received'},
  ];
  assert(alreadySent(inter, 'L1', 'seq:0'), 'real send blocks');
  assert(!alreadySent(inter, 'L1', 'seq:1'), 'dryrun does not block');
  assert(!alreadySent(inter, 'L1', 'seq:2'), 'error does not block');
  assert(!alreadySent(inter, 'L1', 'seq:3'), 'inbound does not count');
  assert(!alreadySent(inter, 'L1', 'seq:9'), 'unsent step → free');
});

test('dailyRemaining: budget resets when the date rolls', () => {
  eq(dailyRemaining({date:'2026-05-31', count:50}, 200, '2026-05-31'), 150, 'same day subtracts');
  eq(dailyRemaining({date:'2026-05-30', count:50}, 200, '2026-05-31'), 200, 'new day resets');
  eq(dailyRemaining({date:'2026-05-31', count:250}, 200, '2026-05-31'), 0, 'never negative');
  eq(dailyRemaining(null, 200, '2026-05-31'), 200, 'no counter → full');
});

// ── "Responder ahora" queue — speed-to-lead (Project: conversion) ─────────
test('leadsNeedingResponse: surfaces leads whose latest message is inbound', () => {
  const leads = [
    {id:'A', name:'A', status:'Contacted'},
    {id:'B', name:'B', status:'New'},
    {id:'C', name:'C', status:'Do Not Call'},
    {id:'D', name:'D', status:'New'},
  ];
  const inter = [
    {leadId:'A', direction:'out', body:'hola',        createdAt:'2026-06-01T10:00:00Z'},
    {leadId:'A', direction:'in',  body:'me interesa', createdAt:'2026-06-01T11:00:00Z'}, // replied after us → waits
    {leadId:'B', direction:'in',  body:'quien?',      createdAt:'2026-06-01T09:00:00Z'},
    {leadId:'B', direction:'out', body:'somos...',    createdAt:'2026-06-01T09:30:00Z'}, // we answered → not waiting
    {leadId:'C', direction:'in',  body:'STOP',        createdAt:'2026-06-01T08:00:00Z'}, // opted out → excluded
    // D: no interactions → excluded
  ];
  const r = leadsNeedingResponse(leads, inter);
  eq(r.length, 1, 'only A waits');
  eq(r[0].lead.id, 'A', 'A surfaced');
  eq(r[0].lastMsg, 'me interesa', 'carries last inbound text');
});

test('leadsNeedingResponse: sorts most-recent reply first', () => {
  const leads = [{id:'X',status:'New'},{id:'Y',status:'New'}];
  const inter = [
    {leadId:'X', direction:'in', createdAt:'2026-06-01T10:00:00Z'},
    {leadId:'Y', direction:'in', createdAt:'2026-06-01T12:00:00Z'},
  ];
  const r = leadsNeedingResponse(leads, inter);
  eq(r[0].lead.id, 'Y', 'newer reply first');
  eq(r[1].lead.id, 'X', 'older second');
  eq(leadsNeedingResponse([], []).length, 0, 'empty safe');
});

test('waitedLabel: compact m/h/d, clamps future', () => {
  const now = Date.parse('2026-06-01T12:00:00Z');
  eq(waitedLabel(now - 5*60000, now), '5m');
  eq(waitedLabel(now - 3*3600000, now), '3h');
  eq(waitedLabel(now - 2*86400000, now), '2d');
  eq(waitedLabel(now + 1000, now), '0m', 'future clamps to 0');
});

// ── Rep performance + leaderboard (motivation / recruiting) ──────────────
test('repStats: worked/closed/conversion + earnings across both roles', () => {
  const leads = [
    {id:'1', closerId:'me',   status:'Closed Won'},
    {id:'2', closerId:'me',   status:'Contacted'},
    {id:'3', providerId:'me', status:'Closed Won'},
    {id:'4', closerId:'other',status:'Closed Won'},
  ];
  const comms = [
    {leadId:'1', closerId:'me',   closerAmount:100000, status:'paid'},
    {leadId:'3', providerId:'me', providerAmount:30000, status:'pending'},
    {leadId:'9', closerId:'me',   closerAmount:50000, status:'cancelled'}, // excluded
  ];
  const r = repStats('me', leads, comms);
  eq(r.worked, 3, 'closer x2 + provider x1');
  eq(r.closed, 2, '2 closed');
  eq(r.conversion, 67, 'round(2/3*100)');
  eq(r.paid, 100000, 'paid');
  eq(r.pending, 30000, 'pending');
  eq(r.total, 130000, 'total');
});

test('repStats: empty + cancelled-only are safe', () => {
  eq(repStats('x', [], []).total, 0, 'empty');
  eq(repStats('x', [], [{closerId:'x',closerAmount:9,status:'cancelled'}]).paid, 0, 'cancelled ignored');
  eq(repStats('x', [{id:'1',closerId:'x',status:'New'}], []).conversion, 0, '0 closed → 0%');
});

test('teamLeaderboard: ranks active members by closed desc', () => {
  const team = [
    {id:'a', name:'A', active:true},
    {id:'b', name:'B', active:true},
    {id:'c', name:'C', active:'false'}, // inactive excluded
  ];
  const leads = [
    {id:'1', closerId:'a', status:'Closed Won'},
    {id:'2', closerId:'a', status:'Closed Won'},
    {id:'3', closerId:'b', status:'Closed Won'},
  ];
  const lb = teamLeaderboard(team, leads, []);
  eq(lb.length, 2, 'only active members');
  eq(lb[0].member.id, 'a', 'A leads with 2 closes');
  eq(lb[1].member.id, 'b', 'B second');
});

test('withinQuietHours: custom window via config params', () => {
  assert(withinQuietHours(9, 9, 18), '9 inside 9-18');
  assert(!withinQuietHours(18, 9, 18), '18 excluded (end exclusive)');
  assert(!withinQuietHours(8, 9, 18), '8 before custom start');
  assert(withinQuietHours(10), 'defaults still 8-20 when no params');
  assert(withinQuietHours(0, 0, 24), 'midnight inside 0-24');
});

// ── Lead sorting: numeric columns must order by value, not lexically ──
test('getSorted: deal value sorts numerically, not as strings', () => {
  S.sortCol = 'dealValue'; S.sortDir = 1;   // ascending
  const out = getSorted([{dealValue:'100'},{dealValue:'20'},{dealValue:'3'}]);
  eq(out.map(l => l.dealValue).join(','), '3,20,100', 'numeric ascending order');
  S.sortDir = -1;
  const desc = getSorted([{dealValue:'100'},{dealValue:'20'},{dealValue:'3'}]);
  eq(desc.map(l => l.dealValue).join(','), '100,20,3', 'numeric descending order');
});

test('getSorted: blank/non-numeric deal values sort below real numbers', () => {
  S.sortCol = 'dealValue'; S.sortDir = 1;
  const out = getSorted([{dealValue:'50'},{dealValue:''},{dealValue:'10'}]);
  eq(out[0].dealValue, '', 'blank sinks to bottom ascending');
  eq(out[2].dealValue, '50', 'largest last ascending');
});

// ── Phone normalization (dialing + dedup depend on it) ───────────────
test('normalizePhone: US formats normalize to E.164', () => {
  eq(normalizePhone('(305) 555-0100'), '+13055550100', 'US 10-digit gets +1 (305 area code, not +57)');
  eq(normalizePhone('13055550100'), '+13055550100', 'US with leading 1 gets +');
  eq(normalizePhone('+1 (305) 555-0100'), '+13055550100', 'US keeps + and strips punctuation');
});

// ── Close-date accuracy: "this month" must key off the real close, not edits ──
test('leadClosedAt: reads Closed Won workHistory stamp, falls back to updatedAt', () => {
  eq(leadClosedAt({workHistory:[{outcome:'Contacted',claimedAt:'2026-01-01'},{outcome:'Closed Won',closedAt:'2026-03-15T10:00:00Z'}], updatedAt:'2026-06-14T00:00:00Z'}),
     '2026-03-15T10:00:00Z', 'uses the Closed Won close date, not a later edit');
  eq(leadClosedAt({workHistory:[], updatedAt:'2026-06-14T00:00:00Z'}), '2026-06-14T00:00:00Z', 'no history → updatedAt');
  eq(leadClosedAt(null), '', 'null safe');
});

// ── State-campaign grid tiling (whole-state auto-scrape coverage) ─────
test('campaignGrid: covers a state bbox with sane tile counts', () => {
  const fl = STATE_BOUNDS['United States']['Florida'];
  const g = campaignGrid(fl, 25000);
  assert(g.rows >= 1 && g.cols >= 1, 'has at least one row/col');
  eq(g.count, g.rows * g.cols, 'count is rows×cols');
  // A ~730km × ~600km state at 25km tiles (×1.3 spacing ≈ 32.5km) → ~20×~18ish.
  assert(g.count > 150 && g.count < 1200, 'Florida tile count in a reasonable range: ' + g.count);
  // Smaller radius → more tiles.
  assert(campaignGrid(fl, 15000).count > g.count, 'finer radius yields more tiles');
});

test('campaignTile: tile centers stay inside the bounding box', () => {
  const fl = STATE_BOUNDS['United States']['Florida'];
  const g = campaignGrid(fl, 25000);
  for (const idx of [0, 1, Math.floor(g.count / 2), g.count - 1]) {
    const t = campaignTile(fl, g.rows, g.cols, idx);
    assert(t.lat >= fl.minLat && t.lat <= fl.maxLat, 'lat in bounds for tile ' + idx);
    assert(t.lng >= fl.minLng && t.lng <= fl.maxLng, 'lng in bounds for tile ' + idx);
  }
  // Distinct tiles have distinct centers.
  const a = campaignTile(fl, g.rows, g.cols, 0), b = campaignTile(fl, g.rows, g.cols, 1);
  assert(a.lat !== b.lat || a.lng !== b.lng, 'adjacent tiles differ');
});

// ── Setter compensation: cumulative volume bonus (money — highest risk) ──────
test('setterVolumeBonus: cumulative sums every reached tier', () => {
  const T = [{closes:3,bonus:20},{closes:5,bonus:40},{closes:8,bonus:80},{closes:10,bonus:150},{closes:12,bonus:250}];
  eq(setterVolumeBonus(2, T, true), 0,   'below first tier');
  eq(setterVolumeBonus(3, T, true), 20,  'first tier');
  eq(setterVolumeBonus(5, T, true), 60,  '20+40');
  eq(setterVolumeBonus(8, T, true), 140, '20+40+80');
  eq(setterVolumeBonus(11, T, true), 290,'20+40+80+150');
  eq(setterVolumeBonus(12, T, true), 540,'all five');
  eq(setterVolumeBonus(99, T, true), 540,'caps at the top tier');
});

test('setterVolumeBonus: highest-only mode pays a single tier', () => {
  const T = [{closes:3,bonus:20},{closes:5,bonus:40},{closes:8,bonus:80}];
  eq(setterVolumeBonus(2, T, false), 0);
  eq(setterVolumeBonus(4, T, false), 20);
  eq(setterVolumeBonus(7, T, false), 40);
  eq(setterVolumeBonus(8, T, false), 80);
});
