# Website AI Chat ("AskAndrés") → AXIUS CRM — Brief & Integration

Grounded in the actual site (github.com/Axius-Tech/Axius.Tech-Website, Quiet 0.5 / `reference/axius-direction-E05.jsx`, Vercel). Use this in the website project's Claude Code session.

## What already exists (don't rebuild it)
- **`AskAndres`** — a conversational AI chat with a **"Ring Andrés"** escalation button.
- On Ring, `startRing()` POSTs to Telegram (`@AxiusDispatch_Bot`, topic-per-visitor) using `window.AxiusConfig.ringWebhookUrl` / `ringWebhookChatId`. It sends: `convoId`, full transcript, last 3 user messages, `lang`, timezone/locale, page URL, referrer. **It does not collect name/email/phone.**
- **Vercel** hosting; serverless functions in `/api` (e.g. `api/stripe-webhook.js`) read secrets from Vercel **env vars** and post to Telegram server-side. Secrets template: `window.AxiusSecrets` (`telegramBotToken`, `telegramChatId`, `whatsappNumber`, `phoneNumber`, `checkoutUrls`).

## The integration (small, on-pattern)
**Add one Vercel function `api/crm-lead.js`** (mirrors `api/stripe-webhook.js`) that receives a lead from the chat and POSTs it server-side to the CRM inbound endpoint — so `CRM_SECRET` lives only in Vercel env, never in the browser. The chat calls `api/crm-lead.js` **on Ring** (and again if it later captures an email/phone). Map:
- `externalId` ← `convoId` (always present → a warm lead is created even with no contact info; dedups per conversation).
- `message` ← the transcript (or last user message + short transcript).
- `country` ← from `lang` (`es`→`"Colombia"`, `en`→`"Estados Unidos"`).
- `source` ← `"Web Chat"`; `sourceDetail` ← page URL + "chat opt-in".
- `name`/`email`/`phone` ← only if the chat captured them (see voice goal #2).

The CRM contract (fields, dedup, responses): `docs/integrations/inbound-leads-api.md` in the CRM repo.

### Drop-in `api/crm-lead.js` (Vercel Node serverless)
```js
// Vercel env vars (Settings → Environment Variables):
//   CRM_INBOUND_URL = https://script.google.com/macros/s/XXXX/exec
//   CRM_SECRET      = <same value as the CRM's Configuración → CRM Secret>
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  try {
    const b = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}');
    const langToCountry = l => (String(l || '').toLowerCase().startsWith('es') ? 'Colombia' : 'Estados Unidos');
    const payload = {
      _secret: process.env.CRM_SECRET,
      source: 'Web Chat',
      externalId: b.convoId ? 'web:' + b.convoId : undefined,
      name: b.name || '',
      email: b.email || '',
      phone: b.phone || '',
      country: b.country || langToCountry(b.lang),
      sourceDetail: (b.pageUrl || 'axius.tech') + ' · chat opt-in',
      message: b.message || b.transcript || '',
    };
    const r = await fetch(process.env.CRM_INBOUND_URL + '?action=inbound', {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    res.status(200).json({ ok: true, crm: data });   // 200 always; never block the chat UX
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e && e.message || e) });
  }
};
```
The chat's `startRing()` (and any contact-capture step) then does:
`fetch('/api/crm-lead', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ convoId, transcript, lang, pageUrl, name, email, phone }) })` — fire-and-forget alongside the existing Telegram post.

## Prompt to paste into the website project's chat
```
Integrate the AskAndres chat with the AXIUS CRM, and tighten its voice.

1) VOICE — confident, capable, genuinely in the visitor's best interest. Sharp, warm, human.
   Never pleading or subservient, never apologizing for selling, no emoji crutches. The visitor
   should finish feeling understood AND that AXIUS is clearly the strong, worth-it choice.
   Spanish for es visitors, English for en; mirror their language.

2) CAPTURE A CONTACT (lightly). During the conversation, naturally get the best way to reach
   them — email, WhatsApp/phone — and their name + what they need. Don't interrogate. Even if
   they give nothing, the convoId is enough to create a lead.

3) CRM LEAD — add a Vercel function api/crm-lead.js (mirror api/stripe-webhook.js; secrets from
   env CRM_INBOUND_URL + CRM_SECRET) that POSTs to the CRM inbound endpoint per
   docs/integrations/inbound-leads-api.md. Call it on "Ring Andrés" AND when a contact is captured,
   sending { convoId, transcript, lang, pageUrl, name, email, phone }. Fire-and-forget; never block
   the chat. Keep the existing Telegram Ring flow as-is.

4) HONESTY — accurate about what AXIUS does; if unsure, say a real person will follow up (true:
   the lead is now in the CRM). Make declining effortless and respectful.

Deliver: the api/crm-lead.js function, the startRing()/contact-capture wiring, and the updated
chat system prompt embodying the voice above.
```

## Security note
Keep `CRM_SECRET` (and ideally the Telegram bot token) **server-side in Vercel env**, accessed only from `/api` functions — not in `window.AxiusConfig`/client JS. Route the CRM POST through `api/crm-lead.js` as above.
