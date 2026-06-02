# AXIUS Lead Engine + CRM — Setup Runbook (start fresh)

Everything to deploy and run the system from zero. Repo:
**https://github.com/AIV-Dream-Avant-Garde/AIV-Lead-Engine-CRM**

The system has two halves:
- **Frontend** — static files (`index.html` + `css/` + `js/`). No build step. Host anywhere.
- **Backend** — `apps-script/Code.gs` deployed as a Google Apps Script Web App, with Google
  Sheets as the database. All API keys live here, never in the browser.

---

## 1. Accounts / access you need
Have a login for each of these before you start (the ones marked *later* only gate live sending):

| # | Account | Used for | Needed |
|---|---|---|---|
| 1 | **Google account** | Sheets (database) + Apps Script (backend) + Drive (call recordings) | Now |
| 2 | **Google Cloud** project + billing card | Places API (the scraper) | Now (scraper only) |
| 3 | **GitHub** access to the repo above | Deploying the frontend | Now |
| 4 | **Hosting** — Vercel *or* Netlify *or* Cloudflare Pages (free tier) | Serving the frontend | Now |
| 5 | **Twilio** account + payment method | SMS / WhatsApp / voice calls | Later (provisioning) |
| 6 | **Resend** account + access to your domain's **DNS** | Outbound email | Later (provisioning) |
| 7 | **Cal.com or Calendly** *(optional)* | The booking link reps send | Optional |
| 8 | **Telegram** + @BotFather *(optional)* | Founder alerts (new lead / reply / opt-out) | Optional |

---

## 2. Secrets / values to keep at hand
You'll collect these as you go. Keep them in a password manager:

- **Google Sheet ID** (from the Sheet URL)
- **Google Places API key**
- **Drive folder ID** (a folder for call recordings)
- **Twilio:** Account SID, Auth Token, API Key SID, API Secret, TwiML App SID
- **Twilio numbers:** voice number, US SMS number (10DLC), WhatsApp sender number
- **Resend:** API key + a verified "from" address (e.g. `hola@axius.tech`)
- **CRM Secret** — the app generates this for you (step 3 below)
- **Admin PIN:** default is **`2819`** — log in with it, then change it immediately
- *(optional)* Telegram bot token + your chat id
- *(optional)* Booking URL (Cal.com / Calendly)

---

## 3. Deploy — the core 8 steps (~1 hour, gets you "Conexión OK")
This is what fixes the "necesitas correr el Apps Script / No conectado" message: that just means the
frontend has no backend URL yet. Do these in order.

1. **Create a Google Sheet.** Name it anything. Copy its **ID** from the URL
   (`https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`). The tabs auto-create on first use.
2. **Open Apps Script.** In the Sheet: *Extensions → Apps Script* (or go to script.google.com → New project).
   Delete the default code, paste the entire contents of `apps-script/Code.gs` from the repo.
3. **Get your CRM Secret.** Open the CRM (hosted, or just open `index.html`), log in with admin PIN
   **`2819`**, go to **Configuración**. It shows **"Tu CRM Secret"** — click to copy it.
4. **Fill the constants** at the top of `Code.gs`:
   - `SHEET_ID` = your Sheet ID (step 1)
   - `CRM_SECRET` = the secret you copied (step 3) — **must match exactly**
   - Fill the Twilio / Resend / Places / Drive constants **as you provision them** (section 4).
     The app runs without them; those features just stay inert until set.
5. **Deploy as Web App.** In Apps Script: *Deploy → New deployment → type: Web app*,
   **Execute as: Me**, **Who has access: Anyone**. Authorize when prompted. Copy the **`/exec` URL**.
6. **Connect the CRM.** Back in **Configuración**, paste the `/exec` URL → **Guardar** →
   **Probar conexión**. You want **"Conexión OK"**. (If it says Unauthorized, the `CRM_SECRET` in
   `Code.gs` doesn't match the one shown in the app — fix and redeploy.)
7. **Host the frontend.** Easiest: **Vercel** → *Add New → Project → import the GitHub repo* →
   Framework preset **Other**, **no build command**, output directory **`/`** → Deploy. Add a custom
   domain (e.g. `app.axius.tech`) for a professional URL. (Netlify / Cloudflare Pages / GitHub Pages
   work identically — it's plain static files.)
   > Note: the Apps Script URL + secret are stored per-browser (localStorage). Every teammate/device
   > pastes the same `/exec` URL once in Configuración. The CRM Secret is generated once — share that
   > one value; don't let a second device generate a different one.
8. **Wire the inbound webhook** (so replies + opt-outs land in the CRM). In Twilio, set the inbound
   message webhook for your SMS/WhatsApp number to:
   `{your /exec URL}?action=inboundMsg&token={CRM_SECRET}`

---

## 4. Provisioning — start the slow ones NOW (days → weeks)
These gate **real** sending. The system is built and dry-run-verified without them.

- **Twilio 10DLC (US SMS):** register a Brand + Campaign, get an approved sending number →
  `TWILIO_FROM_SMS_US`. *Days to ~3 weeks.* Until approved, US SMS is carrier-filtered.
- **WhatsApp Business API (via Twilio):** provision a WhatsApp sender → `TWILIO_FROM_WA`, **and submit
  your cadence messages as templates for approval**. *Days+.* Colombia outreach routes to WhatsApp.
- **Resend domain:** verify your sending domain with SPF/DKIM/DMARC DNS records → `RESEND_API_KEY` +
  `RESEND_FROM`. *Hours to ~2 days (DNS).*
- **Google Places API:** enable **Places API (New)** + **billing** on your Google Cloud project →
  `PLACES_API_KEY`. *~1 hour.* (Scraper only.)

---

## 5. Turn it on (after provisioning, all from the UI — no code)
1. **Triggers:** Admin → Scrapes programados → *Activar* (daily scraper). Secuencias de outreach →
   *Activar* (hourly cadence engine). (Weekly report trigger is optional.)
2. **Cadence config (Admin → Secuencias):** set the daily cap, signing person (`{agente}`), company
   (`{empresa}`), quiet hours, postal address (CAN-SPAM), then run **"Ejecutar ahora"** to preview a
   **dry-run** (sends nothing). When ready, check **"Enviar mensajes reales (en vivo)"** → Guardar
   (it confirms first). Only do this once Twilio/WhatsApp are approved and you've settled consent.
3. **Booking link:** Configuración → set your Cal.com/Calendly URL (the `{agenda}` token + the
   "+ Link de agenda" button in the composer use it).

---

## 6. First-run housekeeping (once, after "Conexión OK")
- Log in with PIN **`2819`** → **change the admin PIN** (Mi Perfil / admin settings).
- **Create your team** (Admin → add members): each closer/provider gets their own PIN + commission
  rates. Roles: `admin`, `closer`, `provider`, `solo`.
- Set **company name**, **booking URL**, **call scripts** in Configuración.
- *(optional)* Set `TELEGRAM_ALERT_BOT_TOKEN` + `TELEGRAM_ALERT_CHAT_ID` in `Code.gs` for founder alerts.

---

## 7. Verify checklist (prove each piece works)
- [ ] Configuración → **Probar conexión** → "Conexión OK".
- [ ] Add/import a lead → it appears in the Google Sheet `Leads` tab after sync.
- [ ] Scraper → "Ejecutar ahora" → new leads appear (needs Places API + billing).
- [ ] Secuencias → "Ejecutar ahora" → dry-run preview shows who it *would* message (sends nothing).
- [ ] Send a test SMS reply to your Twilio number → it lands in that lead's timeline, and
      "Responder ahora" shows the lead (confirms the inbound webhook).
- [ ] Send a test email (composer) → arrives with the CAN-SPAM footer (needs Resend verified).

---

## 8. Compliance you must own (not code)
- **CAN-SPAM:** the email footer is built; you must set a real **postal address** (cadence config).
- **TCPA (US) / Ley 1581 (Colombia):** the system honors opt-out + quiet hours, but lawful basis for
  cold outreach is your decision. Evidence consent; warm up sending.
- **WhatsApp templates:** cold first-touch needs Meta-approved templates.

---

**TL;DR fastest path to "live":** Sheet → paste Code.gs → grab CRM Secret → fill `SHEET_ID` +
`CRM_SECRET` → deploy Web App → paste `/exec` in Configuración → "Conexión OK" → host on Vercel.
That gives you a working CRM. Sending turns on after Twilio/WhatsApp/Resend provisioning + flipping
the engine live from the UI.
