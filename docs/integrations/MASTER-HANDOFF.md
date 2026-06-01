# AXIUS — Master Handoff: completing the automated CRM (Vercel side)

**Audience:** the **website/Vercel project's Claude Code session** (github.com/Axius-Tech/Axius.Tech-Website).
**Why this exists:** the CRM (Google Apps Script + Sheets) is built and is the system of record. What
remains to make outreach *automated* lives in the website repo: (1) push warm chat leads into the CRM,
and (2) the AI SDR / cadence engine that converses with leads and books discovery calls.

This file is the single entry point. The authoritative contracts are the three briefs in this folder —
**copy all three into the website repo's `docs/integrations/` before pasting the prompt below:**
- `inbound-leads-api.md` — CRM inbound endpoint (fields, dedup, responses)
- `website-chat-brief.md` — chat → CRM capture + voice + the no-false-availability rule
- `cadence-engine-brief.md` — the AI SDR: state machine, guardrails, CRM read/write API

---

## Inputs you must provide to that session

Add to **Vercel env** (Settings → Environment Variables) and give the facts to the CC:

- `CRM_INBOUND_URL` — the deployed Apps Script `/exec` URL
- `CRM_SECRET` — same value as the CRM's Configuración → CRM Secret
- `ANTHROPIC_API_KEY` — LLM key (recommend Claude; one brain shared with AskAndres)
- `BOOKING_URL` — Cal.com / Calendly link (the conversion action)
- **Company facts / pitch** — what AXIUS does, offers, pricing tiers (so chat + outreach speak accurately)
- **Confirm** daily send cap (default 200/run) and quiet hours (default 08:00–20:00 local)

> The deterministic engine (Phase 2 steps 4–5) can be **built and verified now**, before Twilio
> 10DLC/WhatsApp approval — but it can't *send live* until provisioning (GO-LIVE §1–3) lands.

---

## The prompt — paste into the website project's Claude Code session

```
We're completing the AXIUS automated outreach system. This repo (the Axius.Tech website on
Vercel, with the AskAndres AI chat) owns the AI brain; the CRM (Google Apps Script + Sheets) is
the system of record and is already built. Read these three briefs I've added to docs/integrations/
first — they are the contract, don't deviate from them:
  - inbound-leads-api.md   (CRM inbound endpoint: fields, dedup, responses)
  - website-chat-brief.md  (chat → CRM capture + voice + the no-false-availability rule)
  - cadence-engine-brief.md (the AI SDR: state machine, guardrails, CRM read/write API)

Plan first (write the plan, let me approve it), then build in this order. Build and VERIFY the
deterministic core before layering the LLM.

── PHASE 1 — Inbound capture (do this first; it has launch-day value) ──
1. Add Vercel serverless fn `api/crm-lead.js` (mirror api/stripe-webhook.js). It POSTs leads
   server-side to `${CRM_INBOUND_URL}?action=inbound`, Content-Type text/plain, body JSON with
   "_secret": CRM_SECRET. Map convoId→externalId ("web:"+convoId), lang→country (es→Colombia,
   en→Estados Unidos), source "Web Chat", transcript→message. Always return 200; never block chat UX.
2. Call it fire-and-forget from startRing() AND whenever the chat captures name/email/phone,
   sending { convoId, transcript, lang, pageUrl, name, email, phone }. Keep the existing Telegram
   Ring post as-is. CRM_SECRET stays in Vercel env, never in client JS.
3. Tighten the chat voice + remove false availability: confident, capable, in the visitor's
   interest; Spanish for es / English for en; no emoji crutches; NEVER imply anyone is available
   now/24-7; DROP any direct-to-founder line. Close with "un miembro de nuestro equipo te dará
   seguimiento" (true — the lead is in the CRM). Capture a contact lightly, never interrogate.

── PHASE 2 — Cadence Engine / AI SDR (the core automation) ──
Build an event-driven, bounded-autonomous engine. The CRM is the only datastore; talk to it via
`${APPS_SCRIPT_URL}?action=...` (POST JSON, "_secret": CRM_SECRET, Content-Type text/plain):
  • pull → { leads, interactions, sequences, calls } (supports `since`; filter client-side)
  • sendMessage {id, leadId, phoneE164, channel, body, stepTag} → Twilio; THEN saveInteraction to log
  • saveInteraction {id, leadId, channel, direction, body, stepTag, status, sid, createdAt, createdBy}
  • saveSequence {leadId, state, stepIndex, nextRunAt, pausedReason, enrolledAt, updatedAt} (upsert by leadId)
Channel routing by lead.country: Estados Unidos→sms, Colombia→whatsapp.

4. CRM API client + the enrollment state model:
   state ∈ active | paused:claimed | paused:replied | stopped:closed | stopped:optout |
           stopped:rejected | done
5. Deterministic state machine on a Vercel cron (every 10–15 min) + the inbound-reaction path,
   with TEMPLATED messages and the guardrails below. Verify this end-to-end WITHOUT the LLM first.
   - Enroll: status Nuevo, has phone, not opted-out/No-llamar, country has a channel. Warm leads
     (source Web Chat/Telegram) start conversational immediately.
   - No-answer/voicemail call outcome → react immediately (don't wait the gap).
   - Inbound reply → converse, handle objections, steer to a booked discovery call, then offer the link.
   - Claim (lead.lockedBy set) → paused:claimed. Release while still open → history-aware resume:
     skip sent steps, never re-pitch after a reply/decline, next at max(now, lastTouchAt + 2 days).
   - Cerrado / No llamar / No interesado / Negociación fallida → stopped:*.
6. Layer the LLM (use the SAME system prompt/voice/company-facts as AskAndres) for reply handling
   and draft generation, strictly inside the guardrails.
7. Booking: the conversion action is a scheduling link (BOOKING_URL); offer once warm, log the
   booking as an interaction.

── GUARDRAILS (non-negotiable — we chose autonomous send) ──
  1. Opt-out is absolute (STOP/BAJA + natural-language "no") — never message an opted-out/No-llamar lead.
  2. Quiet hours: send only 08:00–20:00 in the lead's tz (CO America/Bogota, US America/New_York).
  3. Min-gap 2 days between PROACTIVE touches; reactive replies/post-no-answer are immediate.
  4. Never re-pitch a lead who declined — a clear "no" stops permanently.
  5. Voice: confident, capable, sincere, never weak/subservient; no emojis; never imply 24/7 or
     personal availability — promise the team / the discovery call.
  6. No overpromising or hallucinated claims; if unsure, "a specialist will confirm on the call."
  7. Escalate to human (paused:replied + notify) on negative sentiment beyond a simple objection,
     legal/billing/complaint topics, repeated confusion, or any low-confidence call.
  8. Daily cap + idempotency: every send carries a deterministic stepTag (seq:<n> / react:<event>);
     never double-send a step.
  9. Booking link is the single conversion action; record it as an interaction.

Deliver: api/crm-lead.js + the chat wiring/voice (Phase 1), then the CRM client, the verified
deterministic engine, the LLM layer, and booking (Phase 2). Show me the plan before building, and
prove the deterministic engine works (against a CRM test deploy or a mocked CRM API) before the LLM goes on top.
```

---

## Definition of done (the CRM is "automated" end-to-end)

Leads arrive (scraper + website chat + inbound) → the engine converses autonomously across
SMS/WhatsApp within the guardrails → drives to a booked discovery call → humans claim/close in the
CRM → commissions track. The website chat never overpromises availability and always lands the lead
in the CRM.

## Still on the founder's track (not code — see `docs/GO-LIVE.md`)
- Provisioning: 10DLC (US SMS), WhatsApp Business API + approved templates, Resend domain verify,
  consent/lawful-basis posture (§1).
- Deploy the Apps Script backend + wire Twilio inbound webhook (§2–3).
- **Telegram founder alerts** — already BUILT and inert; just set `TELEGRAM_ALERT_BOT_TOKEN` +
  `TELEGRAM_ALERT_CHAT_ID` in `Code.gs` when ready (deferred to the end).
