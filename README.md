# AXIUS Lead Engine & CRM

An offline‑first sales CRM **and** post‑sale delivery spine for a technology ownership practice — one system that carries a client from cold lead all the way through onboarding. Vanilla JS + Google Apps Script + Google Sheets, no build step.

It runs the whole lifecycle on a single immutable **Engagement ID** (= the lead id):

```
scrape / import → outreach cadence + AI replies → booked call (recorded + transcribed)
   → AI audit → close on a client page (MSA e-sign + Stripe subscription pay)
   → AI quarterly roadmap → Gate A (won + paid + roadmap-approved + MSA-signed)
   → provision (Discord workspace + Drive folder + Project Registry) → delivery synced to Drive
```

---

## Features

### Acquire
| Module | Description |
|---|---|
| **Leads** | CRUD table with search, filters (country / city / barrio / status / source), lead scoring, keyboard‑operable rows, and an inline detail modal (with a full client **Timeline** tab) |
| **Scraper** | Google Places by **country → city → neighborhood → category**, plus whole‑state grid‑tiling **campaigns** that run on a schedule via the Apps Script backend |
| **Import / Export** | Drag‑and‑drop CSV import with auto field‑mapping; filtered CSV export enriched with call + commission data |

### Engage
| Module | Description |
|---|---|
| **Outreach** | Email **cadence engine** (first touch + 3 framework follow‑ups) over Resend, with **AI replies** (Gemini) that follow the brand playbook; dry‑run safe, opt‑out aware |
| **Responder** | Unified inbox of inbound replies (SMS / WhatsApp / email) with speed‑to‑lead alerts |
| **Calls** | In‑browser VoIP via Twilio — record‑from‑answer → Drive archive → on‑demand **Gemini transcription** + AI call summary; consent capture; auto‑dialer queue |
| **Pipeline** | Kanban across the status columns with drag‑and‑drop; Closed Won cards show the client's **payment state** (· paid / · awaiting pay) |

### Close & deliver — the engagement spine
| Module | Description |
|---|---|
| **Active Clients** | Post‑sale cockpit: one engagement per won lead, the four **Gate‑A** signals (won + paid + roadmap‑approved + MSA‑signed), tier picker, Registry links |
| **AI Audit** | Generates a grounded technology audit from the call transcript + thread, archives it to Drive, and sends it via the outreach email |
| **AI Roadmap** | Drafts a quarterly roadmap from the call, with operator approve |
| **Client close page** (`close.html`) | Public, brand‑styled page where a prospect reviews the MSA, **e‑signs** (typed name + checkbox + timestamp + IP), and **pays** via a Stripe **subscription** Checkout Session carrying the Engagement ID |
| **Provisioning** | At Gate A: calls the Discord bot's `/provision`, then creates the client's Drive folder from the ACWA template, copies the founding docs, writes the **Project Registry** (a native Google Sheet), and stores the runtime IDs |
| **Delivery sync** | Drains the bot's staged artifacts into each client's Drive ACWA sections on a schedule |

### Operate
| Module | Description |
|---|---|
| **Analytics** | Monthly KPIs, conversion funnel, source ROI, team leaderboard, call performance |
| **Admin** | Team management, commission ledger (pending / paid / clawback), cadence config, Active Clients, audit log |
| **Profile** | Per‑user stats: leads, closed deals, earnings, call rate, follow‑up queue |

A PIN‑free **demo** (the "View the demo →" link on the login screen) loads the whole CRM with sample data.

---

## Tech stack

- **Frontend** — Vanilla JavaScript, HTML5, CSS3 (no framework, no npm); ships via Vercel
- **Backend** — Google Apps Script web app (`apps-script/Code.gs`)
- **Data** — Google Sheets + browser `localStorage` (offline cache, durable write queue)
- **VoIP** — Twilio Voice SDK (WebRTC) + recording; **transcription / AI** via Gemini
- **Email** — Resend (verified domain); **payments** — Stripe (subscription Checkout + webhook)
- **Delivery** — Discord bot (`https://bot.axius.tech`) + Google Drive + a Project Registry sheet
- **Auth** — server‑validated two‑gate admin (HMAC token) + per‑rep PIN tokens

---

## Project structure

```
index.html                     # SPA shell — all sections, modals, script tags (cache-busted ?v=)
close.html                     # Public client close page (e-sign + Stripe pay)
apps-script/Code.gs            # The entire backend (web app)

css/  base · layout · components · widgets        # design tokens (forest green + ivory) → widgets

js/
  core/    state · storage · api · utils · theme  # S{} state, localStorage + mutation queue, sync
  auth/    auth                                    # two-gate admin + per-rep login, demo mode
  features/
    leads · pipeline · calls · profile · analytics
    scraper · campaigns · import · export
    outreach · cadence-core · inbox · dashboard
    engagements                                    # the spine: Active Clients, audit, roadmap, close link, provision, sync
    admin
  commission.js                                    # calcCommissions, deal capture, refunds, clawbacks
  locks.js                                         # lead locking / claim-release
  main.js                                          # navigate(), renderAll(), keyboard activation, init
  data/    constants · keywords · locations · states · outreach-templates · demo-data
```

---

## Roles & permissions

| Section | Admin | Closer | Solo |
|---|:---:|:---:|:---:|
| Leads · Pipeline · Calls · Profile · Outreach · Responder | ✓ | ✓ | ✓ |
| Analytics | ✓ | — | ✓ |
| Scraper · Import · Export · Admin (incl. Active Clients) | ✓ | — | — |

Admin signs in through a two‑gate code (server‑validated against a hashed Script property, with lockout). Reps are created in **Admin → Team** with a PIN, role, and commission rate; PINs are server‑validated and stored as hashes.

---

## Setup

### 1. Backend (Apps Script)

1. Create a [Google Apps Script](https://script.google.com) project bound to a Sheet, paste `apps-script/Code.gs`, deploy as a **Web App** (execute as you, access: anyone).
2. Run `seedProperties()` once, then set the **Script Properties** you need:

   | Group | Keys |
   |---|---|
   | Core | `SHEET_ID`, `CRM_SECRET` |
   | Admin gate | `ADMIN_GATE_HASH` (via `seedAdminGate()`) |
   | Scraper | `PLACES_API_KEY` |
   | Calls/SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_SECRET`, `TWILIO_AUTH_TOKEN`, `TWILIO_TWIML_APP`, `TWILIO_FROM_NUMBER`, `TWILIO_FROM_SMS_US`, `TWILIO_FROM_WA` |
   | Email | `RESEND_API_KEY`, `RESEND_FROM`, `REPLY_TO_EMAIL`, `BOOKING_URL`, `COMPANY_POSTAL_ADDRESS` |
   | AI | `GEMINI_API_KEY` |
   | Drive (spine) | `RECORDINGS_FOLDER_ID`, `AUDIT_FOLDER_ID`, `EXECUTED_AGREEMENTS_FOLDER_ID` |
   | Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_TOKEN`, `CLOSE_PAGE_URL` |
   | Provisioning | `PROVISION_SECRET`, `PROVISION_URL` (default `https://bot.axius.tech`) |
   | Alerts | `TELEGRAM_ALERT_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID` |

3. **Stripe webhook** (makes payment confirmation reliable): add an endpoint
   `…/exec?action=stripe_hook&token=<STRIPE_WEBHOOK_TOKEN>` subscribed to
   `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`.
4. **MSA**: paste your Master Services Agreement into the Config sheet under `msaText` (until then the close page shows an "almost ready" state rather than a placeholder).

### 2. Client

Open the app, sign in as admin, go to **Settings**, paste the Apps Script `/exec` URL, and **Test connection**. The close page (`close.html`) ships on the same host; its API base is the `/exec` URL.

### 3. Team & leads

Add reps in **Admin → Team**; import a CSV or run the **Scraper** to populate leads.

---

## Data sync

Offline‑first: state lives in `localStorage` and syncs to Sheets on demand / on a background poll.

```
localStorage (cache + durable write queue)  ←→  syncNow()  ←→  Apps Script  ←→  Google Sheets
```

- **Leads** push in batches; dirty flags clear only on confirmed success.
- **Durable mutation queue** — team / commission / engagement / script / job / campaign writes go through `durableSave()`: tried immediately, and on failure **persisted and retried** every sync. The pull won't overwrite an array that still has unsent writes, so a failed save can never silently revert.
- **Calls / interactions** merge append‑only by id (recordings + transcripts fill in on later pulls).

---

## Security

- **Admin** is server‑validated (two‑gate code → HMAC token, 5‑try / 15‑min lockout); **reps** get per‑rep tokens. Tokens — not just the shared secret — gate sensitive actions.
- The **public close endpoints** are keyed by the unguessable Engagement ID, are idempotent (signing once, MSA‑placeholder‑blocked), and never expose the waiver code.
- **Stripe confirmation** requires an explicit engagement‑id binding + subscription/amount checks, with the webhook as the authoritative paid signal — a `paid` flag can't be forged.
- Sessions expire on inactivity; the provisioning bot is reached over HTTPS.

---

## Commission system

When a deal is **Closed Won**, `calcCommissions()` records both the closer and provider cuts (`pending`), the lead's **engagement is auto‑created**, and admin marks the commission `paid` once collected — with a guard that warns if the **client hasn't paid yet** (collectible‑off‑paid). Cancellations issue a clawback reversing both amounts. Residual reps earn their rate monthly off the recurring value.
