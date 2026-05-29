/* ── FEATURE: Outreach — channel routing, message rendering, opt-out (Project A) ──
   Slice 1 = pure logic only (no DOM, no network) so it is fully unit-tested.
   The manual composer + sendMessage (DOM/backend) arrive in a later slice.     */

// Which channel to use for a lead, by country. US → SMS, Colombia → WhatsApp,
// anything else → email (Project C). Pure.
function pickChannel(lead) {
  return CHANNEL_BY_COUNTRY[(lead && lead.country) || ''] || 'email';
}

// Format a number as E.164 (+<dial><digits>) for sending. Matching/dedup uses
// phoneKey() (last-10) elsewhere; this is only for the To/From a provider needs.
function toE164(phone, country) {
  const raw = String(phone || '').replace(/[^\d+]/g, '');
  if (!raw) return '';
  if (raw[0] === '+') { const d = raw.slice(1).replace(/\D/g, ''); return d.length >= 8 ? '+' + d : ''; }
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const dial = COUNTRY_DIAL[country] || '';
  if (dial && digits.startsWith(dial) && digits.length >= 11) return '+' + digits; // already includes country code
  return dial ? '+' + dial + digits : '+' + digits;
}

// Merge rich, human personalization tokens. Unknown/empty tokens degrade
// gracefully (never leave a literal "{ciudad}"); whitespace is tidied. Pure.
function renderTemplate(body, lead, agent) {
  lead = lead || {};
  const company = (typeof S !== 'undefined' && S.config && S.config.companyName) ? S.config.companyName : 'AXIUS';
  const map = {
    negocio:   lead.name    || '',
    ciudad:    lead.city    || '',
    barrio:    lead.barrio  || '',
    categoria: lead.keyword || '',
    nombre:    lead.contactName || lead.name || '',
    empresa:   company,
    agente:    agent || '',
  };
  return String(body || '')
    .replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : ''))
    .replace(/[ \t]{2,}/g, ' ')   // collapse gaps left by empty tokens
    .replace(/ +([,.!?])/g, '$1') // tidy " ," → ","
    .trim();
}

// Opt-out detection: carrier keywords (whole message / leading token) OR a
// curated natural-language decline. Conservative — neutral replies are NOT
// opt-outs (those become a human-handoff signal in Project B). Pure.
function isOptOut(body) {
  const t = String(body || '').trim().toLowerCase();
  if (!t) return false;
  if (OPT_OUT_KEYWORDS.some(k => t === k || t === k + '.' || t.startsWith(k + ' '))) return true;
  if (OPT_OUT_PHRASES.some(p => t.indexOf(p) !== -1)) return true;
  return false;
}
