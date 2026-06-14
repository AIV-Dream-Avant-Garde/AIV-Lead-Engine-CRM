/* ── FEATURE: Cadence engine — pure decision core ──────────────────────────
   Deterministic helpers for the CRM-native outreach engine ("Motor de
   Secuencias"). EVERYTHING here is PURE: no DOM, no Apps Script, no Date.now()
   / Math.random() (callers pass `now` and derive variety from stable hashes).

   This file is the unit-tested source of truth (tests/cases.js) and is MIRRORED
   into apps-script/Code.gs's runCadence(). Keep the two copies in sync — the
   same way isOptOut (js) ↔ isOptOutGs (Code.gs) are kept in sync.

   VOICE (non-negotiable): confident, capable, genuinely in the lead's interest;
   sincere but never weak or subservient; no emojis, no pleading, no false
   availability. 2–3 variants per step keep a deterministic engine from reading
   like a bot. Tokens: {negocio} {ciudad} {barrio} {categoria} {nombre}
   {empresa} {agente}.                                                          */

// ── Multi-step cadence content, by country × channel ──────────────────────
// Each step has 2–3 on-voice variants; the engine picks one per lead by stable
// hash so different leads get different phrasing and a lead stays consistent.
const CADENCE_STEPS = {
  'Colombia': {            // WhatsApp — conversational, warm, assured
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
  'Estados Unidos': {      // SMS — brief, respectful, one clear ask
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

// ── Phone key (mirror of phoneKey): last 10 digits, '' if fewer. ───────────
function cadencePhoneKey(p) { const d = String(p || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; }

// Phone channel for a country. Colombia → whatsapp, US → sms, else ''. ──────
function cadenceChannel(country) {
  const c = String(country || '').trim().toLowerCase();
  if (c === 'colombia') return 'whatsapp';
  if (c === 'estados unidos' || c === 'estados unidos de america' || c === 'estados unidos de américa' || c === 'usa' || c === 'united states') return 'sms';
  return '';
}

// Resolve the real send channel for a lead: phone channel by country, or
// 'email' when there's no usable phone but an email exists. '' = unreachable.
function cadenceResolveChannel(lead) {
  lead = lead || {};
  const phoneCh = cadenceChannel(lead.country);
  if (phoneCh && cadencePhoneKey(lead.phone)) return phoneCh;
  if (String(lead.email || '').trim()) return 'email';
  return '';
}

// Is a lead eligible to be ENROLLED? (caller supplies hasSeq = already enrolled)
function cadenceEligible(lead, hasSeq) {
  if (!lead || hasSeq) return false;
  if (String(lead.status || 'New') !== 'New') return false;   // untouched leads only
  if (cadenceResolveChannel(lead) === '') return false;           // must be reachable
  return true;
}

// Why a sequence must stop/pause RIGHT NOW given the lead's live state.
// '' = proceed. Order: terminal stops, then claimed, then replied, then any
// non-New status (a human has engaged → hand it off).
function cadenceGuard(lead, seq) {
  if (!lead) return 'stopped:rejected';
  const status = String(lead.status || 'New');
  if (status === 'Do Not Call')        return 'stopped:optout';
  if (status === 'Closed Won')          return 'stopped:closed';
  if (status === 'Not Interested' || status === 'Closed Lost' || status === 'Closed Lost') return 'stopped:rejected';
  if (String(lead.lockedBy || ''))   return 'paused:claimed';
  if (replyShouldPause(lead, seq))   return 'paused:replied';
  if (status !== 'New')            return 'paused:claimed';      // Contacted/Interested
  return '';
}

// Did the lead reply after we enrolled them? → hand to a human (no LLM here).
function replyShouldPause(lead, seq) {
  if (!lead || !seq) return false;
  const reply    = lead.lastReplyAt ? new Date(lead.lastReplyAt).getTime() : 0;
  const enrolled = seq.enrolledAt   ? new Date(seq.enrolledAt).getTime()   : 0;
  return reply > 0 && reply > enrolled;
}

// Quiet hours: send only within [start, end) in the lead's local tz (caller
// passes the already-localized hour 0–23). Defaults 08:00–20:00.
function withinQuietHours(localHour, start, end) {
  const s = (start == null ? 8 : start), e = (end == null ? 20 : end);
  return localHour >= s && localHour < e;
}

// Deterministic variant index from leadId+stepIndex (stable per lead, varied
// across leads). No randomness → resume-safe and testable.
function pickVariant(leadId, stepIndex, variantCount) {
  if (!variantCount || variantCount <= 1) return 0;
  const s = String(leadId || '') + ':' + String(stepIndex || 0);
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % variantCount;
}

// Deterministic 0..maxMinutes offset to spread first touches across the day so
// the engine never fires a synchronized burst.
function cadenceJitterMinutes(leadId, maxMinutes) {
  const m = maxMinutes || 1;
  const s = 'jit:' + String(leadId || '');
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h % m;
}

// Steps for a lead's resolved channel (falls back to a default country when the
// exact country isn't in the table). [] = nothing to send.
function cadenceSteps(lead) {
  const ch = cadenceResolveChannel(lead);
  if (!ch) return [];
  const country = (lead && CADENCE_STEPS[lead.country]) ? lead.country : (ch === 'sms' ? 'Estados Unidos' : 'Colombia');
  return (CADENCE_STEPS[country] || {})[ch] || [];
}

// Fill personalization tokens (mirror of renderTemplate). Empty tokens degrade
// gracefully (never a literal "{ciudad}"); whitespace tidied. Pure.
function cadenceRender(body, lead, company, agent) {
  lead = lead || {};
  const map = {
    negocio: lead.name || '', ciudad: lead.city || '', barrio: lead.barrio || '',
    categoria: lead.keyword || '', nombre: lead.contactName || lead.name || '',
    empresa: company || 'AXIUS', agente: agent || '',
  };
  return String(body || '')
    .replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : ''))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.!?])/g, '$1')
    .trim();
}

// The concrete rendered message for a lead at a given step ('' if no such step).
function cadenceMessage(lead, stepIndex, company, agent) {
  const steps = cadenceSteps(lead);
  const step  = steps[stepIndex];
  if (!step) return '';
  const variants = step.variants || [];
  return cadenceRender(variants[pickVariant(lead && lead.id, stepIndex, variants.length)] || '', lead, company, agent);
}

// Next sequence state after sending step `stepIndex`. Pure (caller passes now).
function advanceSequence(seq, stepsLen, nowMs, gapMs, jitterMs) {
  const cur  = (seq && seq.stepIndex != null) ? Number(seq.stepIndex) : 0;
  const next = cur + 1;
  if (next >= stepsLen) return { stepIndex: next, nextRunAt: '', state: 'done' };
  return { stepIndex: next, nextRunAt: new Date(nowMs + (gapMs || 0) + (jitterMs || 0)).toISOString(), state: 'active' };
}

// Has a REAL outbound send already used this stepTag for this lead? (dryrun and
// error rows don't count → they never block a genuine send). Prevents double-send.
function alreadySent(interactions, leadId, stepTag) {
  return (interactions || []).some(it =>
    it && String(it.leadId) === String(leadId) &&
    String(it.direction) === 'out' &&
    String(it.stepTag) === String(stepTag) &&
    String(it.status) !== 'error' && String(it.status) !== 'dryrun');
}

// Remaining daily send budget. counter = {date, count}; resets when date rolls.
function dailyRemaining(counter, cap, todayKey) {
  const c = (counter && counter.date === todayKey) ? Number(counter.count || 0) : 0;
  return Math.max(0, Number(cap || 0) - c);
}

// Export for the Node test harness (no-op in the browser / Apps Script).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CADENCE_STEPS, cadencePhoneKey, cadenceChannel, cadenceResolveChannel,
    cadenceEligible, cadenceGuard, replyShouldPause, withinQuietHours, pickVariant,
    cadenceJitterMinutes, cadenceSteps, cadenceRender, cadenceMessage,
    advanceSequence, alreadySent, dailyRemaining,
  };
}
