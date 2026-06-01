# CRM-native Cadence Engine ("Motor de Secuencias") — Design

**Date:** 2026-05-31
**Status:** Approved (design), pending implementation
**Decision owner:** founder (andresgerardo1228@gmail.com)

## Goal
Make the CRM **automated and fully functional** for outreach on its own — no Vercel, no LLM.
A deterministic, time-driven engine inside the CRM's Apps Script backend (`Code.gs`) that
enrolls every eligible lead and walks it through a templated multi-step cadence, sending via
the existing Twilio/Resend paths, honoring all guardrails. The LLM "AI SDR" remains a possible
later enhancement (separate repo) but is **not** required for the CRM to run autonomously.

## Decisions (locked with founder)
- **Engine location:** inside the CRM (Apps Script time-driven trigger), not Vercel.
- **Enrollment:** all eligible leads, automatically (incl. cold scraped). Opt-out + quiet hours
  enforced; founder accepts the consent posture (GO-LIVE §1).
- **Voice:** must read human, not robotic — deterministic anti-robotic measures required.
- **Out of scope:** Telegram (entirely), the LLM conversational layer, call-transcription reactions.

## Architecture
Single function `runCadence()` on an **hourly** time trigger (same mechanism as
`runScheduledScrapes` / `sendWeeklyReport`). Each run: **Pass 1 enroll**, then **Pass 2 advance**.

### Templates live server-side (mirrored)
Outreach templates are currently client-only (seed in `js/data/outreach-templates.js`; custom in
`localStorage`, per-browser). The engine therefore carries its own server-side templates as a
`CADENCE_STEPS` constant in `Code.gs`, in the documented voice, **with 2–3 variants per step** —
following the existing `isOptOut` ↔ `isOptOutGs` mirror precedent. Token renderer mirrored from
the frontend `renderTemplate` (tokens: negocio, ciudad, barrio, categoria, nombre, empresa, agente).
Sender identity via constants `CADENCE_COMPANY` (e.g. "AXIUS") + `CADENCE_AGENT_NAME`.

### Pass 1 — Enroll
For each lead **not already in `Sequences`** where `status === 'Nuevo'`, has a usable phone (or
email), country has a channel, and not opted-out / `No llamar` → write a `Sequences` row
`{state:'active', stepIndex:0, nextRunAt: staggered, enrolledAt:now}`. First-touch `nextRunAt` is
**spread across the day** (deterministic per-lead jitter), capped by the daily cap, to avoid a burst.

### Pass 2 — Advance
For each `active` sequence with `nextRunAt <= now`, in order, until the daily cap is reached:
- **Re-check guards every run:** opted-out/`No llamar` → `stopped:optout`; `lockedBy` set →
  `paused:claimed`; `lastReplyAt > enrolledAt` → `paused:replied` (human takeover — a deterministic
  engine must not fake a conversation); status closed/No-interesado/etc → `stopped:*`; manual
  pause/stop respected.
- **Quiet hours:** outside 08:00–20:00 in the lead's country tz (CO `America/Bogota`,
  US `America/New_York`) → push `nextRunAt` to next 08:00, skip.
- **Idempotency:** if an outbound interaction with `stepTag = seq:<stepIndex>` already exists for
  this lead → don't resend; just advance. (Deterministic stepTag = no double-send.)
- Render the step (variant picked by stable hash of `leadId+stepIndex`), **send via the existing
  Twilio/Resend path**, log the interaction (`saveInteraction`-equivalent, `stepTag: seq:<n>`),
  stamp `lastTouchAt`, then `stepIndex++` → next at `now + 2 days (+jitter)`, or `state:'done'`.
- **Channel:** Colombia → WhatsApp, US → SMS (by `lead.country`); email if no phone.

### Anti-robotic measures (founder requirement)
1. Token personalization (already in templates).
2. **2–3 on-voice variants per step**, picked per-lead by stable hash → different leads get
   different phrasing; the same lead stays consistent.
3. **Jittered send timing** so messages spread naturally across the window, never a synchronized burst.
4. Quiet hours + 2-day gaps → human pacing.

### Safety / build-now-send-later
Ships with `CADENCE_ENABLED = false`. When off, `runCadence()` still runs and **dry-run-logs**
every intended send (to the `Interactions` log with `status:'dryrun'` and to `Logger`) **without
calling Twilio/Resend** — fully testable today. Founder flips one flag + enables the trigger to go
live after provisioning (10DLC / WhatsApp templates, GO-LIVE §1–3). A `CADENCE_DAILY_CAP`
(default 200) and quiet-hour constants are configurable at the top of `Code.gs`.

### Admin surface (CRM UI)
Mirror the existing scraper toggle: an admin control to enable/disable the `runCadence` trigger
(via the existing `setTrigger`/`checkTriggers` actions, extended to accept `runCadence`) and show
last-run status + live/dry-run state. Keeps the engine controllable without touching Apps Script.

## Components & isolation
- **`js/features/cadence-core.js`** (new) — PURE decision helpers, no Apps Script/DOM deps:
  `cadenceEligible(lead, hasSeq)`, `cadenceChannel(country)`, `withinQuietHours(localHour)`,
  `pickVariant(leadId, stepIndex, variantCount)`, `advanceSequence(seq, stepsLen, now, gapMs)`,
  `replyShouldPause(lead, seq)`. Loaded by the **test harness** (and reusable by a future
  Secuencias "next message" preview); **mirrored** into `Code.gs`.
- **`Code.gs`** — constants (`CADENCE_ENABLED`, `CADENCE_COMPANY`, `CADENCE_AGENT_NAME`,
  `CADENCE_DAILY_CAP`, quiet hours, `CADENCE_STEP_GAP_DAYS`, `CADENCE_STEPS`), `runCadence()`,
  the mirrored helpers, a token renderer, and extracted `twilioSend_`/`resendSend_` reused by both
  the existing message handlers and the engine.
- **Frontend admin** — a cadence trigger toggle + status in the existing admin "scheduled" area.

## Testing
- Pure helpers in `cadence-core.js` get **unit tests in `tests/cases.js`** (Node harness),
  alongside the existing 25: eligibility, channel routing, quiet-hours boundary, variant
  determinism + spread, step advancement (incl. `done`), reply-pause, idempotency math.
- Sheets/Twilio I/O is verified manually on deploy and via the dry-run log (consistent with the
  rest of `Code.gs`, which is not Node-tested).

## Error handling
- Per-lead send wrapped in try/catch: a failure logs `status:'error'` on the interaction and leaves
  the sequence on the same step (retried next run) — never advances past an unsent step.
- Daily-cap counter persisted in `Config` (per local day); resets on date change.
- Global try/catch around `runCadence()` so one bad row can't abort the whole run.

## Non-goals (YAGNI)
LLM conversation, call-outcome reactions, Telegram, A/B analytics, multi-touch beyond the
template-defined steps. Each is a clean later addition; none blocks autonomy now.
