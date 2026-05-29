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

test('fmtCOP: formats numbers, guards invalid input', () => {
  assert(fmtCOP(0) !== '--', 'zero should format, not dash');
  eq(fmtCOP(null),  '--', 'null → dash');
  eq(fmtCOP('abc'), '--', 'NaN → dash');
});

// ── PIN strength (security) ──────────────────────────────────────────
test('isWeakPin: rejects repeats and sequences, allows strong', () => {
  ['1111','0000','1234','9876'].forEach(p => assert(isWeakPin(p), p + ' should be weak'));
  ['4827','1928','5093'].forEach(p => assert(!isWeakPin(p), p + ' should be strong'));
  assert(!isWeakPin('12'), 'non-4-digit handled elsewhere → not weak here');
});

// ── Lead scoring (deterministic, weight-driven) ──────────────────────
test('scoreLead: deterministic and weight-correct', () => {
  const strong = {phone:'+573001112222', rating:'4.5', reviews:'127', status:'Nuevo', website:'x.co', followUpDate:''};
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
test('pickChannel: US→sms, Colombia→whatsapp, else→email', () => {
  eq(pickChannel({country:'Estados Unidos'}), 'sms');
  eq(pickChannel({country:'Colombia'}), 'whatsapp');
  eq(pickChannel({country:'Brasil'}), 'email', 'unknown country → email');
  eq(pickChannel({}), 'email', 'no country → email');
});

test('toE164: formats CO/US, respects existing +/country code, junk→empty', () => {
  eq(toE164('320 123 4567', 'Colombia'), '+573201234567', 'CO 10-digit gets +57');
  eq(toE164('+57 320 123 4567', 'Colombia'), '+573201234567', 'already + kept');
  eq(toE164('573201234567', 'Colombia'), '+573201234567', 'already has country code');
  eq(toE164('(305) 555-0199', 'Estados Unidos'), '+13055550199', 'US 10-digit gets +1');
  eq(toE164('', 'Colombia'), '', 'empty → empty');
  eq(toE164('abc', 'Colombia'), '', 'junk → empty');
});

test('renderTemplate: rich tokens resolve; unknown/empty degrade gracefully', () => {
  const lead = {name:'Café Aroma', city:'Medellín', keyword:'Cafetería'};
  const out = renderTemplate('Hola, soy {agente} de {empresa}. Vi {negocio} en {ciudad}.', lead, 'Andrés');
  assert(out.includes('Café Aroma') && out.includes('Medellín') && out.includes('Andrés'), 'tokens merged');
  assert(out.indexOf('{') === -1, 'no literal tokens left');
  // empty token collapses without leaving "{barrio}" or double spaces
  const out2 = renderTemplate('{negocio} {barrio} cierra', {name:'X'}, '');
  eq(out2, 'X cierra', 'empty token + whitespace tidied');
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
  eq(seqStateLabel('active'), 'Activa');
  eq(seqStateLabel('paused:replied'), 'Respondió — handoff');
  eq(seqStateLabel('stopped:optout'), 'Opt-out');
  eq(seqStateLabel('weird'), 'weird', 'unknown → passthrough');
});

test('OUTREACH_TEMPLATES: seeded per country×channel, on-voice (no emoji)', () => {
  assert(OUTREACH_TEMPLATES['Colombia'].whatsapp.length >= 1, 'CO whatsapp seeded');
  assert(OUTREACH_TEMPLATES['Estados Unidos'].sms.length >= 1, 'US sms seeded');
  const all = JSON.stringify(OUTREACH_TEMPLATES);
  assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(all), 'no emoji in seed templates');
  assert(all.includes('{agente}') && all.includes('{negocio}'), 'templates use merge tokens');
});
