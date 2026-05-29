# Outreach Project B — History-Driven, Claim-Aware Automated Cadence

**Date:** 2026-05-29
**Status:** Draft for decisions + review
**Depends on:** Project A (interactions backbone, channel router, sendMessage, opt-out) — ✅ built.

## Goal
Automatically nurture pooled leads across SMS/WhatsApp + call-tasks, **without sabotaging the lead pool/claim model** and **without ever pestering or re-pitching** a lead. The engine is **history-aware**: it reads the interaction history (Project A) to decide the next touch, pauses cleanly for agents, and on release resumes intelligently.

## Already-decided (prior brainstorming)
- **Fully automatic enrollment** — every eligible new lead is enrolled.
- **One fixed default sequence** (no builder UI).
- **Claim → pause; release → history-aware resume** (skip already-sent steps; never re-pitch after a reply/rejection; min-gap so we never pester).
- **Backend worker** runs server-side (without a browser open).
- **Voice** per Project A: confident, human, no emoji, honest expectations.

## Open decisions (this spec) — recommendations in **bold**
1. **Worker host** — **Apps Script time-trigger** (`runSequences` every ~15 min, mirroring `runScheduledScrapes`). Fits the stack, no infra, fine for hundreds/day; the decision logic is written as portable pure JS so it can move to a dedicated backend later. Alternative: dedicated backend now (more infra, scales).
2. **Default cadence timing** — **Day 0 SMS/WA → Day 2 call-task → Day 5 SMS/WA → Day 9 call-task → done.** (tweak days/steps).
3. **Negative-reply policy** — **Any inbound reply pauses for a human (`paused:replied`); a detected opt-out/decline (`isOptOut`) hard-stops.** I.e. a real reply never auto-continues; a clear "no" stops permanently. Alternative: hard-stop on any negative sentiment.
4. **Min-gap between touches** — **2 days** minimum, even on resume (never two touches closer than this).
5. **Enrollment eligibility** — status `Nuevo`, has a usable phone (`phoneKey`≠''), not `No llamar`, not opted-out, country has a messaging channel (CO/US). Warm leads (`source` Web Chat/Telegram) get **paused:replied → human** immediately (no cold cadence) — they already engaged.

## Data model — `sequences` collection (separate, like interactions)
One enrollment per lead. Stored `aiv-sequences` (localStorage) + `Sequences` sheet (`SEQUENCE_HDR`). The worker reads/writes it server-side; the frontend shows status + manual controls. **Never on the lead object** (Tier-4 dirty/merge would clobber the worker's writes).

```
{
  leadId, stepIndex,           // 0-based index into the cadence
  state,                       // 'active' | 'paused:claimed' | 'paused:replied' | 'stopped:closed'
                               //   | 'stopped:optout' | 'stopped:rejected' | 'done'
  nextRunAt,                   // ISO — when the next step is due (>= now + min-gap)
  pausedReason, lastTouchAt,
  stepsSent: [ {index, channel, at} ],   // history-aware resume reads this
  enrolledAt, updatedAt
}
```

## State machine (worker evaluates every tick; events also transition)
| State | Means | Enter when | Worker does |
|---|---|---|---|
| `active` | nurturing in pool | enrolled / resumed | if `nextRunAt<=now` & unclaimed & quiet-hours OK & under daily cap & ≥min-gap → run the step |
| `paused:claimed` | agent owns it | lead `lockedBy` set | nothing |
| `paused:replied` | human handoff | any inbound reply (Project A `lastReplyAt`) | nothing (notify agent) |
| `stopped:closed` | won | status `Cerrado` | stop |
| `stopped:optout` | opted out | `No llamar` / opt-out | stop |
| `stopped:rejected` | said no | `No interesado` / `Negociacion fallida` | stop |
| `done` | finished | all steps sent | — |

**Transitions:**
- Enroll (eligible) → `active`.
- `lockedBy` set → `paused:claimed`. Lock cleared (released) **and** status still open → **history-aware resume** → `active`.
- `lastReplyAt` advanced (new inbound) → `paused:replied` (or `stopped:optout` if the inbound was an opt-out, handled in Project A's `inboundMsg`).
- Status `Cerrado`/`No llamar`/`No interesado`/`Negociacion fallida` → corresponding `stopped:*`.

## History-aware resume (the core requirement)
On release (or any time the worker re-activates), before sending it:
1. Reads `stepsSent` + the lead's `interactions`.
2. **Skips any step already delivered** (by `stepsSent` / matching interaction `stepTag`).
3. If **any inbound reply exists**, do **not** auto-send — stay `paused:replied` (human decides). A prior opt-out/rejection → `stopped:*` (never re-pitch).
4. Resume at the next undelivered step; set `nextRunAt = max(now, lastTouchAt + min-gap)`.
5. If steps exhausted → `done`.

## Compliance (enforced by the worker)
- **Quiet hours**: send only 08:00–20:00 in the lead's country tz (CO `America/Bogota`, US Eastern default).
- **Daily cap**: max N sends per run (config, default 200) to respect quota/cost.
- **Opt-out / DNC**: never send to `No llamar` / opted-out (already gated in Project A `sendMessage`, re-checked here).
- **WhatsApp 24-hour window**: cold WhatsApp (no inbound in last 24h) must use a **pre-approved template** message; free-form only inside the 24h session window. The worker picks template-mode for cold WA sends (template content owned in Project 0).
- **Idempotency**: each cadence send uses a deterministic `stepTag` (`seq:<step>`) + interaction id, so a re-run never double-sends a step.

## Components
- **`apps-script/Code.gs`** — `runSequences()` time-trigger worker (authoritative): enroll eligible leads, evaluate state machine, send due steps via the Project-A Twilio path (tagged), advance/persist enrollment, respect compliance, write `lastScrapeRun`-style `lastSequenceRun` for visibility. `setTrigger`/`checkTriggers` extended for the `runSequences` trigger.
- **`js/features/outreach.js`** (or new `cadence.js`) — **pure, unit-tested** decision logic mirrored from the worker: `cadenceEligible(lead)`, `nextCadenceState(enrollment, lead, now)`, `resumeFromHistory(enrollment, interactions, now)`, `withinQuietHours(now, country)`, `dueStep(enrollment, now, minGap)`. The frontend uses these for the status display + a dry-run preview.
- **Frontend UI** — an **Outreach/Secuencias** admin view: counts (active/paused/replied/stopped/done), per-lead enrollment status, manual **pause / resume / unenroll**, and a "Run cadence now" (like the scraper's Ejecutar ahora) for testing. A small cadence-status badge on the lead modal.
- **Sync** — `sequences` append/merge by leadId (the worker is authoritative server-side; frontend pulls them like scheduledJobs).

## Testing & verification
- **Node unit tests** for every pure decision function: eligibility, state transitions (claim/release/reply/close/optout), **history-aware resume** (skips sent steps; refuses to re-pitch after a reply; honors min-gap), quiet-hours, due-step, idempotent stepTag.
- **Headless Chrome** for the Secuencias UI + manual controls + dry-run preview, with a stubbed backend.
- **Backend worker**: syntax-checked + a **dry-run mode** (logs intended sends, no Twilio) against a staging Sheet + a written manual test plan. (Apps Script can't run locally.)
- **Honest gate:** like Project A, nothing actually sends until the backend + messaging providers (Project 0) are live; the cadence brain is what we verify now.

## Build slices
1. `sequences` data model + pure decision logic (`cadenceEligible`, `nextCadenceState`, `resumeFromHistory`, quiet-hours, dueStep) + unit tests.
2. Backend `runSequences` worker + trigger + dry-run + `lastSequenceRun`.
3. Secuencias admin UI (status, manual pause/resume/unenroll, run-now) + cadence badge + sync.
4. Verify each slice (node tests + Chrome) and commit.
