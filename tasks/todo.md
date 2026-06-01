# AIV CRM — Task Log

## Active Tasks

### [2026-05-31] CRM-native Cadence Engine ("Motor de Secuencias")
Spec: `docs/superpowers/specs/2026-05-31-crm-cadence-engine-design.md`
Goal: make the CRM self-drive templated outreach (deterministic, Apps Script trigger; no Vercel/LLM).

**1. Pure decision core (test-first)**
- [ ] Add `tests/cases.js` cases: eligibility, channel routing, quiet-hours boundary, variant
      determinism+spread, step advancement (incl. done), reply-pause, idempotency.
- [ ] Implement `js/features/cadence-core.js` pure helpers to pass them.
- [ ] Register `cadence-core.js` in `tests/harness.js`; all tests green (25 + new).

**2. Code.gs engine**
- [ ] Constants: CADENCE_ENABLED(false), CADENCE_COMPANY, CADENCE_AGENT_NAME, CADENCE_DAILY_CAP(200),
      quiet hours, CADENCE_STEP_GAP_DAYS(2), CADENCE_STEPS (2–3 variants/step, on-voice).
- [ ] Mirror pure helpers + token renderer into Code.gs.
- [ ] Extract `twilioSend_` / `resendSend_`; refactor sendMessage/sendSMS/sendEmail to reuse.
- [ ] `runCadence()` — enroll + advance + guards + dry-run + daily cap + per-lead error handling.
- [ ] Extend `setTrigger` + `checkTriggers` to support `runCadence`.

**3. Admin surface**
- [ ] Cadence trigger toggle + status (live/dry-run, last run) in the scheduled-jobs admin area.

**4. Verify**
- [x] Node harness green (37/37); Code.gs `node --check` clean.
- [x] Mirror parity (Code.gs ↔ cadence-core.js): 103 checks, 0 mismatches.
- [x] Engine E2E simulation (in-memory sheets): enroll/advance/guards/idempotency/dry-run all correct.
- [x] Update GO-LIVE.md: cadence BUILT (dry-run); enable = flip flag + add trigger.

### Review — [2026-05-31] DONE
**What shipped:** a deterministic CRM-native cadence engine. New `js/features/cadence-core.js`
(pure, unit-tested, 12 new cases) is the source of truth, mirrored verbatim into `Code.gs`
(`runCadence()` + helpers). Hourly time trigger; Pass 1 enrolls every eligible lead, Pass 2
advances due sequences. Guardrails: opt-out, quiet hours (08–20 local tz), claim, reply→handoff,
2-day gap, idempotent `seq:<n>` stepTags, daily cap (200). Anti-robotic: 2–3 on-voice variants
per step (stable per-lead hash) + token personalization + jittered send timing. Ships **inert**
(`CADENCE_ENABLED=false` → dry-run, sends/writes nothing). Admin surface in Secuencias panel
(live/dry-run badge, trigger toggle, "Ejecutar ahora", last-run). Send paths extracted to
`twilioSend_`/`resendSend_`, reused by handlers + engine.

**Verification:** 37/37 unit tests; 103-check Code.gs↔core parity; full `runCadence()` E2E sim
proving correct enroll/advance/stop/pause/idempotency/dry-run behavior.

**Staff-engineer verdict:** PASS. Pure/impure split keeps the brain testable in Node despite the
Apps Script runtime. Mirror precedent (isOptOut↔isOptOutGs) followed + parity-tested so the two
copies can't silently drift. Inert-by-default + dry-run preview means it's safe to ship before
Twilio/WhatsApp provisioning. Open follow-ups (not blocking): templates live in Code.gs (the LLM
layer / editable-template store is a later enhancement); call-outcome reactions deferred.

## Completed Tasks

### [2026-03-19] Initial restructure: monolithic HTML → multi-file architecture
- [x] Create directory structure (css/, js/data/, js/core/, js/auth/, js/features/, apps-script/)
- [x] Extract and split CSS into 4 files (base, layout, components, widgets)
- [x] Write JS data files (keywords, locations, constants)
- [x] Write JS core files (state, utils, storage, api)
- [x] Write JS auth file with consolidated startSession / PIN flow
- [x] Write JS feature files with consolidated functions (no more _orig monkey-patching)
- [x] Write js/locks.js and js/commission.js
- [x] Write js/main.js with single clean init()
- [x] Write clean index.html shell with ordered <link>/<script> tags
- [x] Extract apps-script/Code.gs (added missing TEAM_HDR + COMM_HDR)
- [x] Move CLAUDE.md to project root; create tasks/ directory
- [x] Commit and push all 26 files to GitHub main branch

**Result:** 3,575-line monolith → 26 organized files. All _orig overrides eliminated. Pushed to https://github.com/AIV-Dream-Avant-Garde/AIV-Lead-Engine-CRM

---

## Review Template
> Add after each task: what worked, what didn't, staff-engineer verdict.

### [2026-03-19] Full codebase audit — all 26 files
- [x] Audit JS completeness vs original HTML (3 parallel subagents)
- [x] Audit CSS completeness and organization (4 files)
- [x] Audit index.html structure fidelity and onclick handler resolution
- [x] Audit Code.gs accuracy and HTML entity decoding
- [x] Fix CALL state object in js/core/state.js (wrong property names + missing properties)
- [x] Add failCount + lockoutUntil to S object in state.js
- [x] Commit and push fix

**Findings:**
- CSS: PASS — all 484 lines extracted, zero missing rules, all 22 CSS vars defined
- JS functions: PASS — every function from original present
- JS logic: PASS — syncNow, saveLead, renderTable, startSession, confirmImport all equivalent or improved
- index.html: PASS — all elements, ids, onclick handlers verified; script load order correct
- Security: PASS — esc() consistent, SHA-256 PINs, CSRF token, no eval()
- Code.gs: PASS — all functions, TEAM_HDR/COMM_HDR added, scoping bug fixed
- **BUG FIXED**: CALL object had 4 wrong property names (conn/leadId/startTime/consentGiven) and 5 missing properties (activeCall/muted/callSid/outcome/incomingCall); curLeadId also missing
