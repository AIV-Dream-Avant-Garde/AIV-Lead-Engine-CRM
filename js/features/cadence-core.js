/* ── FEATURE: Cadence engine — pure decision core ──────────────────────────
   Deterministic helpers for the CRM-native outreach engine ("Sequence
   Engine"). EVERYTHING here is PURE: no DOM, no Apps Script, no Date.now()
   / Math.random() (callers pass `now` and derive variety from stable hashes).

   This file is the unit-tested source of truth (tests/cases.js) and is MIRRORED
   into apps-script/Code.gs's runCadence(). Keep the two copies in sync — the
   same way isOptOut (js) ↔ isOptOutGs (Code.gs) are kept in sync.

   VOICE (non-negotiable): confident, capable, genuinely in the lead's interest;
   sincere but never weak or subservient; no emojis, no pleading, no false
   availability. 2–3 variants per step keep a deterministic engine from reading
   like a bot. Tokens: {business} {city} {neighborhood} {category} {name}
   {company} {agent}.                                                          */

// ── Multi-step cadence content, by country × channel ──────────────────────
// Each step has 2–3 on-voice variants; the engine picks one per lead by stable
// hash so different leads get different phrasing and a lead stays consistent.
const CADENCE_STEPS = {
  'United States': {      // SMS — brief, respectful, one clear ask
    sms: [
      { variants: [
        "Hi, this is {agent} with {company}. I came across {business} in {city} — impressive work. We help businesses like yours bring in customers consistently, and I think we'd add real value. Open to a quick chat?",
        "Hi, {agent} from {company} here. {business} in {city} caught my eye — you're clearly doing things right. We help businesses like yours win customers more consistently, and I think there's a real fit. Worth a quick chat?",
        "Hello, this is {agent} with {company}. I noticed {business} in {city} and wanted to reach out directly: what we do fits a {category} like yours well for bringing in more customers. Open to a short conversation?",
      ] },
      { variants: [
        "Hi, {agent} from {company} again. What we do fits a {category} like {business} well — happy to show you exactly what results we could drive. If now isn't the time, no problem at all.",
        "Hi, this is {agent} with {company}. Following up on {business} — I can show you concretely what results we'd aim for together. If the timing's off, just say the word and I'll step back.",
      ] },
    ],
    // The first email elicits a REPLY (not a hard ask); once they reply, the AI
    // step takes over with the booking link. Steps 2–3 nudge, then bow out.
    email: [
      { variants: [
        "Hi there. A question most owners can't answer cleanly: who owns the technology behind {business}? The software, the automations, the data, the vendors. Usually it's no one, or it's you on top of running the place. That's what we do. Axius becomes the technology function behind a business, so the owner stops being the one holding it together. One person accountable, not an agency to manage. Curious what that would look like for {business}?\n\n{agent}\n{company}",
        "Hi, I'm {agent}, I run {company}. Most businesses cover technology in pieces. A developer here, a few subscriptions, a vendor or two, someone internal filling the gaps. We replace that with one accountable owner for the whole thing. Your systems, automations, data and vendors, run as one operation for a flat monthly figure that lands under a single hire. I'll map what that covers for {business} and send you a one page read either way. Open to it?\n\n{agent}\n{company}",
        "Hi there. One thing I see in most growing businesses: the technology works only because certain people remember how it works. Lose them and things stall. {business} probably runs on a handful of tools and whoever set them up. We take that over. One owner for your systems, automations, data and vendors, documented and run so it never hangs on one person again. Want me to show you where I'd start?\n\n{agent}\n{company}",
      ] },
      { variants: [
        "Following up. The shape of it is simple. One contact, one monthly figure, and we run your software, automations, data and vendors end to end. Everything stays in your accounts, so you're never locked in. For most businesses it costs less than one full time person, and it takes off your plate the part of the job you never wanted. Happy to walk through what we'd cover at {business}. Fifteen minutes?\n\n{agent}\n{company}",
        "Circling back on {business}. Most owners are surprised how much is already going out across tools, freelancers and vendors once it's all in one view. We pull it into one operation and one bill, usually for less, and put one name on the result. I can show you roughly how that shakes out for you. Worth a short look?\n\n{agent}\n{company}",
      ] },
      { variants: [
        "Last note from me for now. If it's useful, I'll put together a quick read on what {business} spends across its tech and vendors today, and what the same thing looks like run as one operation for less. No strings, yours either way. Want it?\n\n{agent}\n{company}",
        "One more from me. Give me fifteen minutes and I'll lay out what running {business}'s technology as one operation would cover, and what it would cost next to what you pay now. Worst case, you walk away with a clearer picture of where your systems leak. Up for it?\n\n{agent}\n{company}",
      ] },
    ],
  },
};

// ── Phone key (mirror of phoneKey): last 10 digits, '' if fewer. ───────────
function cadencePhoneKey(p) { const d = String(p || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; }

// Phone channel for a country. US → sms, else ''. ───────────────────────────
function cadenceChannel(country) {
  const c = String(country || '').trim().toLowerCase();
  if (c === 'united states' || c === 'usa' || c === 'us' || c === 'united states of america') return 'sms';
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
  if (status === 'Not Interested' || status === 'Closed Lost') return 'stopped:rejected';
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
  const country = (lead && CADENCE_STEPS[lead.country]) ? lead.country : 'United States';
  return (CADENCE_STEPS[country] || {})[ch] || [];
}

// Fill personalization tokens (mirror of renderTemplate). Empty tokens degrade
// gracefully (never a literal "{city}"); whitespace tidied. Pure.
function cadenceRender(body, lead, company, agent) {
  lead = lead || {};
  const map = {
    business: lead.name || '', city: lead.city || '', neighborhood: lead.barrio || '',
    category: lead.keyword || '', name: lead.contactName || lead.name || '',
    company: company || 'AXIUS', agent: agent || '',
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
