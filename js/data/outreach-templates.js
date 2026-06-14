/* ── DATA: Seed outreach templates, by country × channel ──────────────────
   VOICE (non-negotiable): confident, capable, genuinely in the lead's best
   interest. Sincere but never weak; respectful but never subservient;
   assured but never pushy. No pleading, no apologizing for reaching out,
   NO emojis. Every message must make the reader feel both that we act in
   their interest AND that what we offer is strong and worth its weight.
   Tokens: {business} {city} {neighborhood} {category} {name} {company} {agent}.
   Edit/extend these in the SMS-template admin UI; keep them on-voice.        */

const OUTREACH_TEMPLATES = {
  'United States': {  // SMS — brief, respectful, one clear ask
    sms: [
      { name: 'First touch', body:
        "Hi, this is {agent} with {company}. I came across {business} in {city} — impressive work. We help businesses like yours bring in customers consistently, and I think we'd add real value. Open to a quick chat?" },
      { name: 'Follow-up (value)', body:
        "Hi, {agent} from {company} again. What we do fits a {category} like {business} well — happy to show you exactly what results we could drive. If now isn't the time, no problem at all." },
    ],
    email: [
      { name: 'First touch (email)', body:
        "Hi, I'm {agent} with {company}. I came across {business} in {city} and think we can help you bring in customers more consistently. I'd love to show you exactly what results we could drive together — do you have 15 minutes this week for a quick call?\n\nBest,\n{agent} — {company}" },
    ],
  },
};
