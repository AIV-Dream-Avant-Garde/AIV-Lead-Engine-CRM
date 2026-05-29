# AXIUS CRM — Inbound Leads API (Website AI Chat + Telegram)

**Status:** Ready to integrate (backend `inbound` action enhanced 2026-05-29).
**Audience:** the website AI-chat and Telegram-bot teams.
**Purpose:** push **warm, opted-in** leads (and the visitor's first message) straight into the AXIUS lead pool, where agents claim and work them exactly like any other lead.

> Warm inbound (someone who messaged you) is the highest-value lead source — strong consent, better deliverability, higher intent. Get this wired for launch day; full conversation history + reply-back routing arrive with Outreach Project A/D.

---

## Endpoint

```
POST  {APPS_SCRIPT_WEB_APP_URL}?action=inbound
Content-Type: text/plain        # Apps Script reads the raw POST body as JSON
```

`{APPS_SCRIPT_WEB_APP_URL}` is the deployed `/exec` URL (the same one configured in the CRM's **Configuración**).

### Auth
Every request body MUST include the shared secret:

```json
{ "_secret": "<CRM_SECRET>", ... }
```

`<CRM_SECRET>` is the value set in `Code.gs` and shown in the CRM's **Configuración → CRM Secret**. Requests with a wrong/missing secret return `401`-style `{"success":false,"error":"Unauthorized …"}`.

---

## Request body

At least **one identity** is required: `phone`, `email`, or `externalId`. Everything else is optional.

| Field | Type | Notes |
|---|---|---|
| `_secret` | string | **required** — shared secret (above) |
| `phone` | string | E.164 or local; may be omitted for chat/Telegram leads |
| `email` | string | lower-cased + used for dedup |
| `externalId` | string | stable per-channel id (e.g. Telegram chat id, web session/user id) — used for dedup |
| `name` | string | contact or business name (defaults "Sin nombre") |
| `source` | string | **set this** — see recommended values below; drives warm-lead handling |
| `sourceDetail` | string | free text, e.g. `"@handle"`, campaign, page URL, consent note |
| `message` | string | the visitor's **first message** — stored as the lead's first note so context isn't lost |
| `country` | string | `"Colombia"` or `"Estados Unidos"` (drives channel routing later) |
| `city`, `barrio`, `keyword` | string | optional context |
| `status` | string | defaults `"Nuevo"` |

**Recommended `source` values** (so warm leads are recognizable and can get a lighter/priority flow in Outreach Project B): `"Web Chat"`, `"Telegram"`.

### Dedup
The lead is **not** re-added if any identity already matches an existing lead:
- `phone` matched by **last-10 digits** (so `+57 320 123 4567` == `3201234567`),
- `email` matched case-insensitively,
- `externalId` matched exactly.

A duplicate returns `{"success":true,"added":false,"duplicate":true}` (safe to call repeatedly).

---

## Responses

| Result | Body |
|---|---|
| Created | `{"success":true,"added":true,"duplicate":false,"id":"<leadId>"}` |
| Already exists | `{"success":true,"added":false,"duplicate":true}` |
| Missing identity | `{"success":false,"error":"identity required: phone, email or externalId"}` |
| Bad secret | `{"success":false,"error":"Unauthorized …"}` |

---

## Examples

### Website AI chat (visitor left an email + first message)
```json
{
  "_secret": "PASTE_CRM_SECRET",
  "source": "Web Chat",
  "sourceDetail": "landing /precios · consent: chat opt-in",
  "name": "Laura — Café Aroma",
  "email": "laura@cafearoma.co",
  "country": "Colombia",
  "city": "Medellín",
  "keyword": "Cafetería",
  "message": "Hola, vi su servicio y quiero saber precios para mi cafetería."
}
```

### Telegram bot (chat id as identity, optional phone)
```json
{
  "_secret": "PASTE_CRM_SECRET",
  "source": "Telegram",
  "sourceDetail": "@laura_aroma",
  "externalId": "tg:8675309",
  "name": "Laura Aroma",
  "phone": "+57 320 123 4567",
  "country": "Colombia",
  "message": "Me interesa, ¿me pueden contactar?"
}
```

### curl
```bash
curl -L -X POST "$URL?action=inbound" \
  -H 'Content-Type: text/plain' \
  -d '{"_secret":"PASTE_CRM_SECRET","source":"Web Chat","email":"laura@cafearoma.co","name":"Laura","message":"Hola, quiero info"}'
```

---

## What happens to the lead
- Appears in the **lead pool** on the agents' next sync (sync runs on login), `status:"Nuevo"`, with your `source`.
- The `message` shows as the first entry in the lead's notes/timeline, so an agent sees the context before reaching out.
- It is **claimable** like any lead (the pool/claim/lock model is unchanged).

## Boundaries (today vs. coming with Outreach Project A/D)
- **Today:** one-shot lead creation + first message captured as a note. Idempotent dedup across phone/email/externalId.
- **Project A:** a full append-only **interaction timeline** (every message both directions) + country-aware outbound (SMS/WhatsApp). To log an ongoing conversation now, you may call `inbound` once to create the lead; richer per-message logging lands with Project A's `interactions` API.
- **Project D:** Telegram as a true two-way reply channel + cross-channel identity merging + AI-assisted, human-voiced drafting.

## Compliance note
Leads sent here are treated as **opted-in** (they contacted you). Record how/where consent was given in `sourceDetail` for defensibility. Do not use this endpoint to inject cold/scraped contacts as if warm.
