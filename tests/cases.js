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
