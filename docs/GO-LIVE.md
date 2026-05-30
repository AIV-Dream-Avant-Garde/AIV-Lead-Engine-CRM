# AXIUS — Go-Live Checklist ("what I need from you")

Everything in the CRM is built, tested, and committed. It **cannot send or sync until the items below are done** — these are operational/provisioning/decision inputs only you can provide. Ordered by **lead time** (start the slow ones first).

---

## 1. Start NOW — long lead times (days→weeks, external approval)
These gate *real* messaging; nothing else can compensate for them.

- [ ] **US SMS → 10DLC registration** (Twilio): register a Brand + Campaign, get an A2P-approved sending number. Until approved, US SMS is filtered/blocked.
- [ ] **Colombia → WhatsApp Business API** (Twilio): provision a WhatsApp sender + **submit message templates for approval** (cold/out-of-24h sends require approved templates). 
- [ ] **Email → Resend** (chosen): create a Resend account, verify the sending domain (SPF/DKIM/DMARC), put the API key in `RESEND_API_KEY` + set `RESEND_FROM` in `Code.gs`. **Before real email go-live:** add a CAN-SPAM **unsubscribe link** + physical address to email bodies, and a Resend **bounce/complaint webhook → suppression list** (built behavior is outbound-only today).
- [ ] **Lawful-basis / consent posture** for cold scraped leads (US TCPA/CAN-SPAM, Colombia Ley 1581). Decide how you'll evidence consent + warm-up sending. (The system honors opt-out and quiet hours; it doesn't make cold outreach lawful by itself.)

## 2. Deploy the backend (Apps Script) — ~1 hour
- [ ] In `apps-script/Code.gs`, fill the constants (top of file):
  - `SHEET_ID` — your Google Sheet id
  - `CRM_SECRET` — any strong secret (must match the CRM's Configuración)
  - `PLACES_API_KEY` — Google Cloud project with **Places API (New)** + billing (scraper)
  - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SID`, `TWILIO_API_SECRET`, `TWILIO_TWIML_APP` (voice token)
  - `TWILIO_FROM_NUMBER` (voice), `TWILIO_FROM_SMS_US` (10DLC SMS number), `TWILIO_FROM_WA` (WhatsApp sender)
  - `DRIVE_FOLDER_ID` (call recordings)
- [ ] **Deploy as Web App** (execute as you, access "Anyone"), copy the `/exec` URL.
- [ ] In the CRM **Configuración**: paste the Web App URL + copy the shown CRM Secret back into `CRM_SECRET`, redeploy, **Probar conexión** → "Conexion OK".

## 3. Wire the webhooks & channels — ~30 min
- [ ] **Twilio inbound messaging webhook** (so replies + opt-outs land in the CRM): set the SMS/WhatsApp inbound URL to `{execUrl}?action=inboundMsg&token={CRM_SECRET}`.
- [ ] **Telegram bot** (founder alerts + Telegram lead channel): create a bot via @BotFather → give me the **bot token** + your **chat id** (and I'll wire the alerts in Project D).
- [ ] Enable the **scraper daily trigger** (Admin → Scrapes programados → Activar) and/or "Ejecutar ahora".

## 4. Vercel side (your other repo / Claude Code chat) — parallel
Hand these briefs to the website project's chat:
- [ ] **Inbound leads** → `docs/integrations/inbound-leads-api.md` (add `api/crm-lead.js`).
- [ ] **Website chat voice + capture** → `docs/integrations/website-chat-brief.md`.
- [ ] **Cadence engine (Project B)** → `docs/integrations/cadence-engine-brief.md` (the AI SDR; bounded-autonomous, shared brain).
- [ ] Provide to Vercel env: `CRM_INBOUND_URL`, `CRM_SECRET`, an **LLM API key** (Claude/OpenAI), and a **booking link** (Cal.com/Calendly) for the discovery-call CTA.

## 5. Decisions I need from you (to keep building here)
- [x] **Email ESP** → **Resend** (chosen; Project C email channel built — see §1 for setup + the unsubscribe/bounce follow-ups).
- [ ] **Daily send cap** (default 200/run) and **quiet hours** (default 08:00–20:00 local) — confirm or adjust.
- [ ] **Message copy**: review/replace the seed templates in `js/data/outreach-templates.js` with your exact wording (I drafted them in the confident, no-emoji voice).
- [ ] **Company facts / pitch** for the AI brain (what AXIUS does, offers, pricing tiers) — so the Vercel engine + website chat speak accurately.

## 6. What I'll do once you provide the above
- ESP chosen → build **Project C** (email channel: lead email capture, composer email option, `sendEmail` backend, timeline).
- Telegram token + chat id → build **founder Telegram alerts** (new warm lead / reply / opt-out) + Telegram as a channel.
- Anything that surfaces during your deploy (errors, mismatches) → I debug and fix.

---

### Reality check
- **Built & verified (CRM):** auth/roles, leads + pool/claim, pipeline, analytics, commissions (closer + provider), scraper + auto-scheduled scraping, country tier (CO + US), unified interaction history, country-aware SMS/WhatsApp composer, reply/opt-out capture, cadence control panel, tests + cache-busting.
- **Built (contracts, for Vercel):** inbound leads, website chat, cadence engine.
- **Not yet:** real provisioning (this doc), the Vercel AI engine, Project C email, founder Telegram alerts, call transcription.
