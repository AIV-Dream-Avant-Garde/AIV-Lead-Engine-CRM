/* ── DATA: Seed outreach templates, by country × channel ──────────────────
   VOICE (non-negotiable): confident, capable, genuinely in the lead's best
   interest. Sincere but never weak; respectful but never subservient;
   assured but never pushy. No pleading, no apologizing for reaching out,
   NO emojis. Every message must make the reader feel both that we act in
   their interest AND that what we offer is strong and worth its weight.
   Tokens: {negocio} {ciudad} {barrio} {categoria} {nombre} {empresa} {agente}.
   Edit/extend these in the SMS-template admin UI; keep them on-voice.        */

const OUTREACH_TEMPLATES = {
  'Colombia': {        // WhatsApp — conversational, warm, assured
    whatsapp: [
      { name: 'First touch', body:
        "Hi, this is {agente} with {empresa}. I came across {negocio} in {ciudad} and it looks like you're doing things right. We work with businesses like yours to bring in customers consistently, and I think we can add real value. Do you have a minute for me to share how?" },
      { name: 'Follow-up (value)', body:
        "Hi again, this is {agente} with {empresa}. I'm reaching out because what we do is a great fit for a {categoria} like {negocio}. If you're interested, I can show you exactly what results we could drive. If now isn't the right time, I completely understand." },
    ],
    email: [
      { name: 'First touch (email)', body:
        "Hi, this is {agente} with {empresa}. I saw the work {negocio} is doing in {ciudad} and I think we can help you attract customers more consistently. I'd love to show you exactly what results we could drive together. Do you have 15 minutes this week for a quick call?\n\nBest,\n{agente} — {empresa}" },
    ],
  },
  'Estados Unidos': {  // SMS — brief, respectful, one clear ask
    sms: [
      { name: 'First touch', body:
        "Hi, this is {agente} with {empresa}. I came across {negocio} in {ciudad} — impressive work. We help businesses like yours bring in customers consistently, and I think we'd add real value. Open to a quick chat?" },
      { name: 'Follow-up (value)', body:
        "Hi, {agente} from {empresa} again. What we do fits a {categoria} like {negocio} well — happy to show you exactly what results we could drive. If now isn't the time, no problem at all." },
    ],
    email: [
      { name: 'First touch (email)', body:
        "Hi, I'm {agente} with {empresa}. I came across {negocio} in {ciudad} and think we can help you bring in customers more consistently. I'd love to show you exactly what results we could drive together — do you have 15 minutes this week for a quick call?\n\nBest,\n{agente} — {empresa}" },
    ],
  },
};
