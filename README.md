# AXIUS Lead Engine — CRM

A lightweight, offline-first CRM built for sales teams. Manage leads, make VoIP calls, track commissions, and scrape prospects — all from a single HTML file with no dependencies.

---

## Features

| Module | Description |
|---|---|
| **Leads** | Full CRUD table with search, filters (country / city / barrio / status / source), lead scoring, and inline modal editing |
| **Pipeline** | Kanban board across 7 status columns with drag-and-drop and monthly revenue metrics |
| **Llamadas** | In-browser VoIP via Twilio — make and log calls, confirm consent, auto-dialer queue |
| **Scraper** | Prospect Google Places by **country → city → neighborhood → category** via Apps Script backend (Colombia + Estados Unidos) |
| **Import** | Drag-and-drop CSV uploader with auto field mapping (name, phone, address, website, rating, reviews) |
| **Export** | Filtered CSV export enriched with call count and commission data |
| **Analytics** | Monthly KPIs, conversion funnel, source ROI table, team leaderboard, call performance |
| **Admin** | Team member management, commission ledger (pending / paid / clawback), audit log |
| **Mi Perfil** | Per-user stats: leads, closed deals, earnings, call rate, follow-up queue |

---

## Tech Stack

- **Frontend** — Vanilla JavaScript, HTML5, CSS3 (no framework, no npm)
- **Backend** — Google Apps Script (deployed as a web app)
- **Database** — Google Sheets (via Apps Script) + browser localStorage (offline cache)
- **VoIP** — Twilio Voice SDK 2.9 (WebRTC in-browser calling)
- **Auth** — 4-digit PIN with SHA-256 hashing, role-based access, 30-minute session timeout

---

## Project Structure

```
├── index.html                  # Entry point — all sections, modals, and script tags
│
├── css/
│   ├── base.css                # Design tokens, typography, CSS variables
│   ├── layout.css              # Sidebar, section grid, navigation
│   ├── components.css          # Buttons, cards, inputs, modals, timeline
│   └── widgets.css             # Tables, kanban, call widget, admin rows
│
├── js/
│   ├── core/
│   │   ├── state.js            # Central S{} object — all runtime data
│   │   ├── storage.js          # localStorage load/save/purge
│   │   ├── api.js              # syncNow(), sheetsCall(), push/pull batching
│   │   └── utils.js            # uid(), esc(), fmtD/T/Sec(), toast()
│   │
│   ├── auth/
│   │   └── auth.js             # PIN login, SHA-256, session timers, role sidebar
│   │
│   ├── features/
│   │   ├── leads.js            # Lead table, scoring, modal, bulk actions
│   │   ├── pipeline.js         # Kanban, drag-drop, status workflow
│   │   ├── calls.js            # Twilio device, call widget, logging, auto-dialer
│   │   ├── profile.js          # User dashboard — stats, funnel, commission ledger
│   │   ├── analytics.js        # KPIs, funnel, source ROI, leaderboard
│   │   ├── scraper.js          # Google Places scrape UI and scheduled jobs
│   │   ├── import.js           # CSV parser, field mapper, dropzone
│   │   ├── export.js           # CSV download with filters
│   │   └── admin.js            # Team CRUD, commission management, audit log
│   │
│   ├── data/
│   │   ├── constants.js        # Roles, statuses, scoring weights, admin PIN hash
│   │   ├── keywords.js         # Business categories by country (Spanish CO + English US) + DEFAULT_COUNTRY, COUNTRY_REGION
│   │   ├── locations.js        # Country → city → neighborhood + GPS (Colombia + Estados Unidos: Miami/Orlando/Tampa/Jacksonville)
│   │   └── demo-data.js        # Sample dataset for demo mode
│   │
│   ├── commission.js           # calcCommissions(), deal capture, refunds, clawbacks
│   ├── locks.js                # 4-hour lead locking, claim/release logic
│   └── main.js                 # navigate(), renderAll(), keyboard shortcuts, init
```

---

## Roles & Permissions

| Section | Admin | Closer | Solo |
|---|:---:|:---:|:---:|
| Leads | ✓ | ✓ | ✓ |
| Pipeline | ✓ | ✓ | ✓ |
| Llamadas | ✓ | ✓ | ✓ |
| Mi Perfil | ✓ | ✓ | ✓ |
| Analytics | ✓ | — | ✓ |
| Scraper | ✓ | — | — |
| Import | ✓ | — | — |
| Export | ✓ | — | — |
| Admin | ✓ | — | — |

Team members are created by the admin with a 4-digit PIN, role, and closer commission rate. PINs are stored as SHA-256 hashes server-side; `pinPlain` is preserved locally so the admin can reveal them from the team panel.

---

## Setup

### 1. Deploy the Apps Script backend

1. Create a new [Google Apps Script](https://script.google.com) project
2. Connect it to a Google Sheets spreadsheet for data storage
3. Add your Twilio credentials to Script Properties:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER`
4. Deploy as a **Web App** — execute as yourself, access for anyone
5. Copy the deployment URL

### 2. Configure the CRM

1. Open `index.html` in a browser
2. Log in with the admin PIN (`2819`)
3. Navigate to **Configuración**
4. Paste the Apps Script URL and click **Guardar**
5. Click **Probar conexión** — should return "Conexion OK"

### 3. Add team members

1. Go to **Admin → Equipo → + Agregar miembro**
2. Set name, role (`Closer` or `Solo Operator`), PIN, and commission rate
3. Share the PIN with each team member — they use it to log in

### 4. Import or scrape leads

- **Import**: drag a CSV onto the Import section — map columns, set source, click Importar
- **Scraper**: select city, neighborhood, and business category — runs via Apps Script

---

## Data Sync

The app is **offline-first**: all data lives in `localStorage` and syncs to Google Sheets on demand or on each login.

```
localStorage (cache)  ←→  syncNow()  ←→  Google Apps Script  ←→  Google Sheets
```

- **Push**: dirty/unsynced leads are batched (20 at a time) and sent to the server
- **Pull**: server returns all records modified since `lastSyncTimestamp`
- **Merge**: server data takes precedence on leads; `pinPlain` is preserved locally on team merges
- **Dirty tracking**: `S.dirty` set marks leads needing sync; cleared on successful push

Storage usage is shown in the topbar. Warning at 75%, critical at 92% of the ~5 MB localStorage budget.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `N` | Next available lead (on Leads section) |
| `S` | Sync with Google Sheets |
| `Ctrl + Enter` | Save lead (inside modal) |
| `Esc` | Close modal / overlay |
| `?` | Show / hide shortcut panel |

---

## Commission System

When a lead is marked **Cerrado** (closed):

1. Admin or closer enters the deal value
2. `calcCommissions()` computes **both** cuts: `closerAmount = dealValue × closerRate / 100` and `providerAmount = dealValue × providerRate / 100` (rates come from the team member, falling back to the rate stamped on the lead)
3. A commission record is created with status `pending`, persisting closer **and** provider id/name/rate/amount
4. Admin marks as `paid` once transferred
5. If the client cancels after payment, a clawback (negative entry reversing **both** closer and provider amounts) is issued via **Reembolso**

Provider/solo operators are credited as the source (`providerId`) of leads they scrape or import; their commissions and sourced leads appear in **Mi Perfil** and the commission ledger.

---

## Security Notes

- Admin PIN: default hash ships in `constants.js`, but the admin can **rotate it from Configuración** (stored locally as `S.config.adminHash`, overriding the default). Sessions are HMAC-signed with the per-install `crmSecret` and team-member roles are re-derived from synced data on restore, so a stored session token can't be edited to escalate privileges. Weak PINs (repeats / sequences) are rejected.
- All API calls include a per-installation CSRF secret (`crmSecret`) generated on first run
- Sessions expire after 30 minutes of inactivity with a 2-minute warning
- 5 failed PIN attempts trigger a 15-minute lockout
- `pinPlain` is stored in localStorage only — never sent to the server
