# AXIUS Cadence Engine — Build Brief (Vercel + LLM, shared with the website AI)

For the **website/Vercel project's Claude Code session**. This is Project B: an **event-driven, AI-conversational outreach engine** (an "AI SDR"). Per the founder's decisions it lives on **Vercel + LLM (the same brain as the AskAndres website chat)**, runs **bounded-autonomous** (sends within guardrails, no per-message human approval), reacts to **call outcome** now (transcription later), and drives every lead toward a **booked discovery call**.

The CRM (Google Apps Script + Sheets) is the **system of record**. The engine reads/writes it via the CRM's Apps Script Web App API — it does **not** own its own lead DB.

---

## Architecture
- **Vercel**: a cron function (e.g. every 10-15 min) + the inbound reaction path, calling an LLM for drafting/decisions. One shared brain/voice/prompts with AskAndres.
- **CRM API** (`{APPS_SCRIPT_URL}?action=...`, POST JSON body with `"_secret": CRM_SECRET`):
  - **Read:** `pull` → returns `leads`, `interactions` (full message history both directions), `sequences` (cadence state), `calls`. Filter client-side; `since` supported.
  - **Write a message send:** `sendMessage` `{id, leadId, phoneE164, channel, body, stepTag}` → Twilio SMS/WhatsApp. Then **also** `saveInteraction` (idempotent upsert by id) to log it. (Channel: US→`sms`, Colombia→`whatsapp`; the lead's `country` decides.)
  - **Log inbound/any interaction:** `saveInteraction` `{id, leadId, channel, direction, body, stepTag, status, sid, createdAt, createdBy}`.
  - **Persist cadence state:** `saveSequence` `{leadId, state, stepIndex, nextRunAt, pausedReason, enrolledAt, updatedAt}` (idempotent upsert by leadId).
- **Inbound replies** already arrive at the CRM `inboundMsg` webhook (logs the interaction, stamps `lastReplyAt`, hard-stops on opt-out). The engine sees replies on the next `pull`; for real-time, the CRM webhook can be extended to also notify the Vercel engine.

## The engine's job (state machine, event-driven)
Enrollment state per lead (persisted via `saveSequence`):
`state ∈ active | paused:claimed | paused:replied | stopped:closed | stopped:optout | stopped:rejected | done`

Drive by **events**, with a fallback rhythm when nothing else fires:
- **Enroll** eligible leads (status `Nuevo`, has phone, not `No llamar`/opted-out, country has a channel). Warm leads (`source` Web Chat / Telegram) are already engaged → start conversational immediately.
- **No-answer / voicemail call outcome** (from `calls`/interactions) → send a message **right then** (don't wait).
- **Inbound reply** → the AI **converses**: answer questions, handle objections, and steer toward **booking a discovery call** (the objective). Keep going until a call is the natural next step, then offer the booking link.
- **Claim** (`lead.lockedBy` set) → `paused:claimed` (human owns it). **Release** with status still open → **history-aware resume**: skip already-sent steps, **never re-pitch after a reply/decline**, schedule next at `max(now, lastTouchAt + 2 days)`.
- **Cerrado / No llamar / No interesado / Negociación fallida** → corresponding `stopped:*`.

## Bounded-autonomy guardrails (NON-NEGOTIABLE — you chose autonomous send)
1. **Opt-out is absolute** — honor `STOP/BAJA` + natural-language declines; never message a `No llamar`/opted-out lead. (CRM also enforces.)
2. **Quiet hours** — send only 08:00-20:00 in the lead's country tz (CO `America/Bogota`, US Eastern).
3. **Min-gap 2 days** between **proactive** touches; **reactive** replies (answering an inbound, post-no-answer) are immediate.
4. **Never re-pitch** a lead who declined; a clear "no" stops permanently.
5. **Voice** = the AXIUS standard: confident, capable, genuinely in their interest; sincere but never weak/subservient; **no emojis, no pleading**; **never imply 24/7 or personal availability** — promise the team/discovery call.
6. **No overpromising / no hallucinated claims** about what AXIUS does. If unsure, say a specialist will confirm on the call.
7. **Escalate to a human** (set `paused:replied` + notify) on: negative sentiment beyond a simple objection, legal/billing/complaint topics, repeated confusion, or anything the model is <high-confidence on.
8. **Daily cap** + idempotency: each cadence send carries a deterministic `stepTag` (e.g. `seq:<n>` or `react:<event>`); never double-send the same step.
9. **Booking** — the conversion action is a scheduling link (Cal.com/Calendly/Google). Offer it once the lead is warm; record the booking as an interaction.

## Shared brain with the website
Reuse AskAndres's system prompt/voice + company facts so web chat, Telegram, and outreach speak as one. The cadence engine is the same persona, now proactive + multi-channel.

## Honest dependencies (gate go-live)
- Twilio SMS (US **10DLC**) + **WhatsApp Business API** (pre-approved templates for cold/out-of-24h sends) + numbers — Project 0 provisioning.
- The CRM backend deployed with real `CRM_SECRET` (the engine authenticates with it).
- **Call transcription is NOT built** — react to call *outcome* now; add STT (Twilio Voice Intelligence / Whisper) later so follow-ups reflect what was said.
- A booking tool + link.

## Suggested build order (Vercel side)
1. CRM API client (pull/sendMessage/saveInteraction/saveSequence) + the state model.
2. The event/state-machine core (deterministic) with templated messages + guardrails — verifiable without the LLM.
3. Layer the LLM: reply handling + draft generation in the shared voice, within guardrails.
4. Booking + (later) transcription-aware follow-ups.

> CRM side (this repo) already provides: leads + the full interaction timeline (`interactions`), `sequences` storage + `saveSequence`, `sendMessage`/`saveInteraction`, the `inboundMsg` reply/opt-out webhook, phone normalization, and a (coming) Secuencias admin view showing enrollment status with manual pause/resume/unenroll.
