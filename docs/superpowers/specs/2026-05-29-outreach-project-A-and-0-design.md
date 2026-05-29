# Outreach Platform — Project A (Unified Interaction History + Country-Aware Channels) + Project 0 (Go-Live Foundation)

**Date:** 2026-05-29
**Status:** Draft for review
**Scope:** This spec covers **Project A** (build now) and **Project 0** (the parallel go-live/foundation track). Projects **B** (history-driven cadence engine) and **C** (email channel) are designed at a high level in the umbrella vision but will each get their own spec when reached.

---

## Context & vision

AXIUS is a feature-complete, hardened, offline-first CRM (vanilla JS + Google Apps Script + Google Sheets + Twilio). The goal is to automate multi-channel outreach **without sabotaging the existing lead-pool/claim workflow**, with a **unified per-lead interaction history** that makes every touch and reply visible, and a **country-aware** channel strategy (**US → SMS, Colombia → WhatsApp**, email later).

The full vision decomposes into:
- **Project A** — unified interaction history + reply capture + country-aware channels (the data + comms backbone). **This spec.**
- **Project B** — history-driven, claim-aware automated cadence engine (separate spec).
- **Project C** — email channel via an ESP (separate spec).
- **Project D** — **inbound channels: website AI chat + Telegram** (separate spec; see *Further considerations*). These produce **warm, consented** leads/conversations — the inverse of cold scraped leads — and slot into the same `interactions` timeline + channel router.
- **Project 0** — go-live foundation (deploy, provisioning, compliance, measurement, safe-verification harness) that runs in parallel. **This spec.**

**Related shipped work (2026-05-29):** the auto-scraper now supports on-demand "Ejecutar ahora", format-proof `phoneKey` dedup (no re-adding existing leads), last-run visibility, and multi-device job sync — providing the lead inflow this outreach platform acts on. Project A reuses `phoneKey` for cross-channel identity/dedup.

**Why A first:** it is independently valuable today (agents see full multi-channel context before acting), it is the data foundation B depends on, and it de-risks the hardest parts (reply matching, channel routing, opt-out) before any scheduling automation is added.

## Goals (Project A)

1. A single **append-only `interactions` collection** capturing every message (SMS/WhatsApp/email — outbound *and* inbound replies), separate from the lead object.
2. **Country-aware outbound** send: a router picks SMS (US) or WhatsApp (Colombia) and a unified `sendMessage()` dispatches it.
3. **Inbound reply capture** via a Twilio messaging webhook → recorded as an interaction, stamped on the lead, with **opt-out (STOP)** handling.
4. The **existing lead timeline extended** to show all interactions both-directions, by channel, **visible by default**.
5. A **manual message composer** on the lead modal (send on the correct channel) + a per-lead **thread view**.
6. **E.164 phone normalization** so inbound replies reliably match leads.
7. **Compliance-ready hooks** (opt-out, per-channel consent, quiet-hours config, WhatsApp template structure, consent/audit log) — dormant until Project 0 provisioning enables them.
8. **Measurement-ready** interaction records (enough to compute reply/delivery/connect later).

## Non-goals (explicitly deferred)

- The automated cadence scheduler / state machine → **Project B**.
- Email sending / ESP integration → **Project C** (the channel router leaves a clean seam for it).
- WhatsApp template *content* approval, 10DLC registration, domain auth → **Project 0** (documented, owner-driven, not built here).
- Migrating existing `S.calls` into `interactions` — calls stay as-is; the timeline merges both.

---

## Architecture & data model

### New collection: `interactions` (append-only, separate from leads)

Rationale (from the integration analysis): per-lead history must **not** live on the lead object — the Tier-4 dirty/merge logic would clobber backend writes and re-sync whole leads wholesale, and it would bloat the 5 MB localStorage budget. The existing `S.calls` collection already proves the append-only separate-collection pattern; `interactions` generalizes it for messages.

- **Frontend store:** `S.interactions` array; persisted to localStorage key `aiv-interactions`.
- **Backend store:** new `Interactions` sheet with header `INTERACTION_HDR`.
- **Record shape:**
  ```
  {
    id, leadId, leadName, phone,
    channel: 'sms' | 'whatsapp' | 'email',
    direction: 'out' | 'in',
    body,
    stepTag: '',          // set by Project B cadence; '' for manual/inbound
    status: 'sent' | 'delivered' | 'failed' | 'received',
    sid: '',              // provider message id (Twilio MessageSid)
    error: '',
    createdAt, createdBy   // userId or 'system'/'inbound'
  }
  ```
- **Sync strategy:** *optimistic local append + fire-and-forget save*, modeled on the proven calls flow ([calls.js:170-172](js/features/calls.js#L170-L172) pushes to `S.calls` then immediately calls `saveCall`). **Important correction:** calls today are *pulled wholesale* (`api.js`: `S.calls = res.calls`; `isIncremental`/`since` are **not** implemented for calls — the `since` cursor applies to leads only). Interactions deliberately improve on this: the pull merges incoming rows **by `id`** (append-only, never clobber) behind a **new `since` cursor**, so the collection scales without re-pulling the whole history. **This merge-by-id + `since` logic is net-new work on both client and server — NOT a copy of the calls code** — and it must avoid the calls flow's latency window where a locally-pushed row can momentarily disappear on a pull-that-precedes-the-server-write (the by-id append-merge prevents that).

### Lead object additions

- `email` (string, default '') — captured on import/manual entry; used by Project C and the router's email branch.
- `lastTouchAt` (ISO) — last outbound interaction time (drives Project B min-gap; updated on send).
- `lastReplyAt` (ISO) — last inbound interaction time (drives Project B "replied" pause; updated on inbound).
- `consentSms`, `consentWhatsapp`, `consentEmail` (boolean, default `false`) — per-channel consent as **flat scalar columns, NOT a nested object**. Rationale: only `notes`/`workHistory` get `JSON.stringify`/`JSON.parse` special-casing in `Code.gs` (`push`/`update`/`appendRow` write paths + `toObjs`); a nested `consent` object would serialize to `[object Object]` and not round-trip. Flat booleans avoid that entirely. Set by opt-in/opt-out events.

These are small scalars/flags on the lead (not growing history), so they sync wholesale safely like other lead fields. `LEAD_HDR` gains `email`, `lastTouchAt`, `lastReplyAt`, `consentSms`, `consentWhatsapp`, `consentEmail` (all scalar, appended; `getSheet` reconciliation already handles existing sheets — no JSON special-casing needed).

### Phone normalization & matching

**Already shipped** (auto-scraper work, 2026-05-29): `phoneKey(p)` — last-10-digits of the numeric-only string — exists in both `js/core/utils.js` and `apps-script/Code.gs` and is unit-tested. It collapses `+57`/`+1`/spacing/leading-zero so the same number is one identity. **Reuse it as the inbound-reply ↔ lead matcher and the cross-channel dedup key** (do not invent a second matcher).

For *sending*, Twilio still needs a `+`-prefixed E.164 string, so a thin `toE164(phone, country)` formatter is also needed:
- Strips spaces/dashes/parens.
- If already `+`-prefixed, keep digits after `+`.
- Else prefix the country dialing code: Colombia → `+57`, Estados Unidos → `+1`.
- Returns canonical `+<digits>` or `''` if not a plausible number.

Used only to format the `To`/`From` on send. **Inbound matching uses `phoneKey`** (last-10) on both sides — robust to stored-format drift without a separate fallback path.

---

## Components

### 1. Channel router — `js/features/outreach.js` (new)

- `pickChannel(lead)` → `'sms'` if `country === 'Estados Unidos'`, `'whatsapp'` if `country === 'Colombia'`, else `'email'` (Project C) — pure, unit-tested.
- `renderTemplate(body, lead, agent)` → merge **rich personalization tokens** from data we already capture: `{negocio}` (lead.name), `{ciudad}` (lead.city), `{barrio}`, `{categoria}` (lead.keyword), `{nombre}` (contact), `{empresa}` (our company), and `{agente}` (the sending agent's first name, for a human signature). Unresolved tokens fall back to a graceful neutral (never leave a literal `{ciudad}` in the text). Pure, unit-tested. See **Message humanity & voice** below.
- `sendMessage(lead, body, opts)` → resolves channel, normalizes phone, calls backend `sendMessage` action, optimistically appends an `out` interaction (`status:'sent'`), updates `lead.lastTouchAt`, reconciles status from the response. Blocks if the lead is opted-out / `No llamar` for that channel.
- `isOptOut(body)` → recognizes opt-out **two ways**, because real people don't text "STOP": (1) the legally-required keywords `STOP|STOPALL|UNSUBSCRIBE|CANCELAR|BAJA|SALIR` (case-insensitive, trimmed — always honored, carrier-mandated); (2) **natural-language declines** in Spanish/English — e.g. "no me interesa", "no escriban/escribas más", "quítame/quítenme", "déjenme en paz", "remove me", "not interested", "stop messaging" — matched by a curated phrase/regex list. A natural-language opt-out is treated **exactly** as a keyword opt-out (honor it immediately) but never bounces a robotic auto-reply; see voice section. Pure, unit-tested (positive + negative cases, e.g. "no tengo tiempo hoy" is NOT an opt-out). Conservative bias: when ambiguous, do **not** auto-opt-out — flag for human review instead of risking either a missed opt-out or a wrongly-killed warm lead.

### 2. Backend — `apps-script/Code.gs`

- **`sendMessage` action** (POST): params `{leadId, phoneE164, channel, body, stepTag}`. Routes to Twilio Messages API:
  - SMS: `From = TWILIO_FROM_SMS_US`, `To = phoneE164`.
  - WhatsApp: `From = 'whatsapp:' + TWILIO_FROM_WA`, `To = 'whatsapp:' + phoneE164`. **Template note:** outside the WhatsApp 24-hour window only an approved template may be sent (enforced/owned in Project 0; the call shape supports a `contentSid`/template param for later).
  - Appends the outbound row to `Interactions`, returns `{success, sid, status}`.
- **`saveInteraction` action** (POST): append an interaction row (used for client-originated optimistic records / reconciliation).
- **`inboundMsg` action** (POST — Twilio inbound messaging webhook): params from Twilio `{From, To, Body, MessageSid}`. Normalize `From`; find the lead by E.164 (last-10 fallback); append an `in` interaction (`channel` inferred from `To`/`whatsapp:` prefix, `status:'received'`); set `lead.lastReplyAt`. If `isOptOut(Body)` (keyword **or** natural-language decline) → set lead `status='No llamar'`, `dncReason='opt-out (<channel>)'`, the matching `consent<Channel>=false`, and (for Project B) mark any enrollment stopped. Any **other** inbound reply → leave a `paused:replied`/handoff signal for an agent (Project B) and surface the "Respondió" badge. If a carrier/policy ack is required, it is a **confident, respectful human-voiced** confirmation (see voice section) — never robotic, never subservient. Returns a minimal 200 so Twilio is satisfied.
  - **Do NOT reuse the existing `inbound` action** (`Code.gs:322`) — that one *creates a new lead* from a scraper/form webhook (dedupes by phone, appends a lead row). `inboundMsg` is a distinct message-reply webhook; keep them separate.
  - **Lead write path:** matching is by **phone (E.164)**, not `id`, so this needs an id-less *find-row-by-phone-then-`setValue`-per-column* path (the existing `update` action finds by `id` — `Code.gs:137-142` — and must be adapted, not reused as-is). If no lead matches, append the inbound interaction with `leadId:''` and log it (never throw).
  - **Last-10 fallback collision guard:** if more than one lead shares the same last-10 digits, attribute to the **most recently updated** matching lead and log the ambiguity (never silently mis-attribute to an arbitrary lead).
  - **Dirty-merge caveat (Tier-4):** a server-side write to `lastReplyAt`/`status`/`consent*` is applied to the client only on the next pull **and only if that lead isn't locally dirty** (`api.js:82` `!S.dirty.has(l.id)` guard). So an opt-out applied server-side can be *temporarily masked* by a pending local edit until that edit syncs and clears. Acceptable (it reconciles on next clean sync), but the planner must know it — and the opt-out interaction itself (append-only) always shows in the timeline regardless.
- **`pull` extension:** include `interactions` (filtered by `since`) in the response; `INTERACTION_HDR` added; `getSheet` reconciliation covers it.
- **Quiet-hours / consent helpers** present but only *enforced* by Project B's worker; Project A's manual send may warn but not hard-block (an agent acting in real time is different from automated bulk).

### 3. Frontend timeline + composer — `js/features/leads.js` (+ outreach.js)

- **Extend `renderLeadTimeline(l)`** ([leads.js:428-463](js/features/leads.js#L428-L463)) to merge `S.interactions` for the lead: message events with channel icon + direction (← inbound / → outbound) + body snippet. Keep calls/notes/workHistory. **Show the timeline tab by default** (or surface a compact "last contact / last reply" line at the top of the modal) so contact state is visible before dialing.
- **Composer:** in the lead modal, a small "Enviar mensaje" control that shows the auto-picked channel (editable), a template dropdown (existing `S.smsTemplates`), a textarea with live merge preview, and Send → `sendMessage()`. Disabled with a clear reason if the lead is opted-out.
- **Reply visibility:** a badge on the lead row / modal when `lastReplyAt > lastTouchAt` ("Respondió") so replies are obvious in the pool.

### 4. Storage/sync — `js/core/storage.js`, `js/core/api.js`

- `aiv-interactions` added to save/load.
- `syncNow` pushes unsynced interactions (append-only, like calls) and merges pulled interactions by `id` with a `since` cursor; never clobbers (append-only ⇒ no dirty-conflict).

---

## Message humanity & voice (Project A)

The difference between a reply and a block is whether the message reads like a **real person who did their homework** — not a broadcast. This is a product requirement, not a nicety; it directly drives deliverability, reply rate, opt-out rate, and brand.

**The dual mandate every message must satisfy:** the reader feels we are genuinely moving in *their* best interest, **and** that what we offer is strong, capable, and worth its weight. Sincere but never weak; respectful but never subservient; confident but never pushy. No pleading, no apologizing for reaching out, no emoji crutches. **Set honest expectations** — never imply immediate or 24/7 personal availability; promise that a capable team member follows up, and mean it. Principles, baked into templates + tooling:

1. **Targeted, not templated-looking.** Every message references *this* business with the data we already have — `{negocio}` in `{ciudad}`, their `{categoria}`. A florist in Chapinero and an auto shop in Miami should never receive the same sentence. Lead with a specific, genuine observation ("Vi que {negocio} tiene muy buenas reseñas en {ciudad}…"), then a concise, honest value offer.
2. **Written by a human, signed by a human.** Messages are conversational and sign off with `{agente}` (a real agent's first name), never "AXIUS Bot" / "Equipo AXIUS". First-person, warm, plain language. Short for SMS; WhatsApp can be slightly longer and friendlier.
3. **Channel-true voice.** SMS = brief, respectful, one ask. WhatsApp (Colombia) = conversational, can open with a greeting, light and personable. Email (Project C) = more room to give context. Same intent, different register per channel.
4. **Value-first and self-assured.** Lead with something genuinely worth their time and let the value carry the message — assured, never pleading and never apologetic for reaching out with something good. The reader should feel we're acting in *their* best interest **and** that what we offer is strong and worth its weight. Make declining easy and respectful, but never small.
5. **The opt-out is respectful and confident — never robotic, never subservient.** Replace `"Responde STOP para no recibir más mensajes."` with a line in the agent's own voice that still puts the client first without diminishing us, e.g. *"Si en otro momento te sirve, aquí estaré; y si prefieres que no te escriba, solo dímelo y lo respeto."* The system still honors `STOP/BAJA` keywords **and** natural-language declines (see `isOptOut`), but the *visible instruction* never reads like a compliance footer — and **no emojis or pleading tone** that make us seem weak or as if our offer isn't worth its weight. When an ack is required, it's brief and dignified — e.g. *"Entendido, no te escribo más. Quedo atento si algo cambia."* — never a cold "You have been unsubscribed," never grateful-to-a-fault.
6. **Restraint = respect.** Honor quiet hours, min-gap between touches, and the cadence's history-aware resume (Project B) so we never pester. One thoughtful message beats five generic ones. A lead who already declined is never re-pitched.

**Where this lives in Project A:** a small **seed library of human, channel- and country-specific templates** (Spanish for CO/WhatsApp, English for US/SMS) shipped in `js/data/` and editable in the existing SMS-template admin UI; the rich `renderTemplate` tokens above; the humane `isOptOut`; and an agent-facing composer that shows a **live merge preview** so the agent sees the exact human message before sending. **Voice guidelines** are captured as a short doc/comment block beside the seed templates so future templates stay on-voice.

**AI-assisted drafting (seam, not built here):** because messages should be tailored per lead, an AI drafting step ("write a warm first-touch for {negocio}, a {categoria} in {ciudad}, in {agente}'s voice") is a natural enhancement — and ties directly to the website's AI chat (see *Further considerations*). Project A leaves the composer/template layer clean so this can plug in later without rework.

## Data flow

```
Outbound (manual, Project A):
  agent → composer → sendMessage(lead, body)
    → pickChannel(country) → toE164(phone,country)
    → Code.gs sendMessage → Twilio (SMS or whatsapp:)
    → Interactions row (out) + lead.lastTouchAt; timeline shows →

Inbound (reply):
  Twilio webhook → Code.gs inboundMsg
    → normalize From → match lead → Interactions row (in) + lead.lastReplyAt
    → if opt-out (keyword OR natural-language) → No llamar + dncReason + consent off (confident, respectful ack)
  → next pull brings it to the client; timeline shows ←; "Respondió" badge

Sync:
  interactions: optimistic append push + merge-by-id pull behind a new `since` cursor (improves on the wholesale S.calls pull)
  leads: unchanged (Tier-4 dirty/merge); new scalar fields ride along
```

## Error handling

- `sendMessage` checks `scriptUrl` (offline → queued/te toast, no crash) and result `success`; failed sends record an interaction with `status:'failed'` + `error` and surface a toast (consistent with Tier-4 sync messaging).
- Inbound webhook tolerates unmatched numbers (logs an `in` interaction with `leadId:''` / or ignores per config) so a stray reply never throws.
- E.164 returns `''` for implausible numbers; send is blocked with a clear message rather than dialing garbage.
- Opt-out is idempotent (re-applying STOP is a no-op).

## Testing & verification

- **Node unit tests** (`tests/cases.js`) for all pure logic: `toE164` (CO/US/already-+/garbage), reuse of existing `phoneKey` matcher, `pickChannel`, `renderTemplate` (all rich tokens resolve; unknown tokens degrade gracefully, never leave `{ciudad}`), and `isOptOut` — **including natural-language cases**: positives ("no me interesa", "quítenme", "remove me", "déjame en paz") AND negatives that must NOT opt out ("no tengo tiempo hoy", "no estoy seguro", "¿cuánto cuesta?").
- **Headless Chrome**: timeline renders merged interactions both directions; composer picks the right channel by country; opt-out disables the composer; "Respondió" badge appears when `lastReplyAt>lastTouchAt`.
- **Backend (`Code.gs`)**: syntax-checked; logic exercised via **Project 0's staging Sheet + dry-run mode** (no real sends) and a written manual test plan (send SMS to a US test lead, send WhatsApp to a CO test lead, POST a simulated inbound to `inboundMsg`, verify rows + opt-out). The pure decision logic is mirrored from the tested JS helpers.
- **Honest limitation:** real Twilio/WhatsApp sends + inbound webhooks cannot be exercised locally; they are validated against a deployed staging backend (Project 0).

## Files touched (Project A)

| File | Change |
|---|---|
| `js/features/outreach.js` (new) | channel router, `sendMessage`, `renderTemplate` (rich tokens + `{agente}`), humane `isOptOut`, `toE164` (reuses existing `phoneKey` for matching) |
| `js/data/outreach-templates.js` (new) | seed human, on-voice templates per channel × country (ES/WhatsApp, EN/SMS) + a voice-guidelines comment block; editable via the existing SMS-template admin UI |
| `js/core/state.js` | `S.interactions` |
| `js/core/storage.js` | persist/load `aiv-interactions` |
| `js/core/api.js` | push/pull interactions (append-only, `since`) |
| `js/features/leads.js` | timeline merges interactions; composer; "Respondió" badge; show-by-default |
| `js/data/constants.js` | opt-out keywords + natural-language decline phrases (ES/EN), country dialing codes, channel labels |
| `js/features/import.js` | capture `email`; normalize phone on import |
| `index.html` | composer UI + cache-bust bump |
| `apps-script/Code.gs` | `sendMessage`, `saveInteraction`, `inboundMsg` (distinct from existing `inbound`) actions; `INTERACTION_HDR`; `LEAD_HDR` += email/lastTouchAt/lastReplyAt/consentSms/consentWhatsapp/consentEmail (scalars); id-less find-by-phone write path; pull includes interactions (merge-by-id + `since`) |
| `tests/cases.js` | unit tests for the pure helpers |

---

## Project 0 — Go-Live Foundation (parallel track)

Documented and sequenced; **build/technical items are done with the code, provisioning/compliance items are owner-driven and deferred per decision** but listed so nothing is forgotten.

### 0.1 Technical readiness (built alongside Project A)
- **Staging Sheet + dry-run mode**: a `DRY_RUN` flag in `Code.gs` that logs intended sends instead of calling Twilio, plus a separate staging `SHEET_ID`, so the engine is verifiable before real sends. **Required for confidence.**
- **E.164 normalization** (in A) — prerequisite for reply matching.
- **Idempotency**: outbound sends carry a client-generated `id`; the backend de-dupes on `id` so a retry/overlap never double-sends. (Critical once Project B's worker exists; the field + de-dupe land in A.)
- **Measurement definition**: which interaction fields compute reply rate, delivery rate, connect rate, opt-out rate (so analytics can be added without schema changes).

### 0.2 Provisioning (owner-driven; **deferred**, documented with lead times)
- Deploy `Code.gs` + fill Tier-1 creds (`SHEET_ID`, `CRM_SECRET`, Twilio voice).
- **US SMS → 10DLC** brand/campaign registration (days–weeks).
- **Colombia → WhatsApp Business API** sender + **template pre-approval** (days–weeks).
- **Email → ESP + domain auth (SPF/DKIM/DMARC)** (Project C).
- Per-country FROM numbers configured as **new** constants `TWILIO_FROM_SMS_US` and `TWILIO_FROM_WA`, **distinct from the existing voice-only `TWILIO_FROM_NUMBER`** (`Code.gs:11`).

### 0.3 Compliance posture (designed-in now, enforced when provisioned)
- Opt-out keyword handling (built in A), per-channel consent flags, quiet hours (config in A, enforced by B), low send-rate/warmup defaults (B), consent/audit logging.
- **Known risk (flagged, not resolved):** the leads are *cold/scraped*; lawful basis for messaging (US TCPA/CAN-SPAM, Colombia Ley 1581) and deliverability/warmup are owner responsibilities before go-live. The system is built to support compliant operation; it does not by itself make cold outreach lawful.

---

## Further considerations (before officially proceeding)

### Website AI chat + Telegram → the CRM (high value — recommend Project D)
The launching website's **AI chat + Telegram** is worth integrating, and it fits this architecture cleanly:
- **Warm inbound > cold outbound.** Someone who messages your site or Telegram has *opted in* — strong lawful basis, far better deliverability, higher intent. This is the opposite of scraped leads and should be treated as a **first-class, prioritized lead source**, not cold-cadenced. New source values (`'Web Chat'`, `'Telegram'`) + a distinct, lighter sequence (or immediate human handoff) in Project B.
- **Reuse what exists.** The Apps Script `inbound` action *already* creates leads from external POSTs — the website/Telegram bot can call it to drop a lead straight into the pool. The AI-chat / Telegram **conversation** becomes `interactions` rows (new `channel: 'webchat' | 'telegram'`, both directions) in the same unified timeline, so an agent sees the whole AI conversation before they ever call.
- **Telegram as a reply/outreach channel.** Telegram Bot API is another channel the router can pick (like WhatsApp) when a lead arrived via Telegram — reply where they reached you.
- **The AI is also a drafting ally.** The same model powering site chat can draft the human, on-voice outreach messages (the `renderTemplate` / composer seam in *Message humanity & voice*), keeping tone consistent across web, Telegram, and outbound.
- **Cross-channel identity (must design once it lands):** a web/Telegram lead may have **email or a Telegram handle but no phone**, so `phoneKey` dedup isn't enough. Project D needs an identity strategy (match on phone **or** email **or** telegram id; merge duplicates). Flag now so the lead model is ready.
- **Founder/admin Telegram notifications (requested).** The same Telegram bot can **push alerts to the founder/admin** so a solo operator never has to watch the CRM: ping on (a) a new **warm inbound lead** (Web Chat / Telegram), (b) **any inbound reply** to outreach, and (c) an **opt-out**. Default to those three events; configurable later. Mechanically trivial (Telegram Bot `sendMessage` to a saved chat id) and high-value for a small team — fold into Project D. Needs the bot token + the admin's chat id (the user is providing theirs).
- **Recommendation:** scope **Project D** after A (it depends on A's `interactions` backbone + channel router), but **capture the inbound endpoint contract now** so the website/Telegram team can start sending leads into the CRM immediately (warm pipeline from day one of launch).

### Other things to settle before go-live
- **Warm vs cold lead handling** is a real branch in Project B (different/no cadence, faster human handoff for warm). Decide the policy.
- **Identity & dedup across channels** (above) — phone-only is insufficient once email/Telegram leads exist.
- **Per-source consent provenance** — record *how* consent was obtained (scraped vs web-opt-in vs Telegram) for compliance defensibility.
- **Agent capacity / routing** — when replies + warm inbound arrive, who gets notified and how fast? (ties to the pool/claim model and Project B's `paused:replied`).

## Open items to confirm at Project B spec time
- Worker host (Apps Script vs dedicated backend) — decided with real volume data.
- The cadence state machine (claim→pause, release→**history-aware resume**, terminal states), min-gap days, negative-reply hard-stop vs human handoff.
- WhatsApp 24-hour-window template strategy for cold sends.
