/* ── DATA: Seed outreach templates, by country × channel ──────────────────
   VOICE (non-negotiable): editorial, restrained, declarative, second person.
   Axius is a Technology Ownership Practice, one accountable owner for the
   technology behind a business, NOT an agency or lead-gen. Lead with value,
   never price. No hype, no buzzwords, NO em dashes, NO emojis, no pleading.
   Tokens: {business} {city} {neighborhood} {category} {name} {company} {agent}.
   Edit/extend these in the SMS-template admin UI; keep them on-voice.        */

const OUTREACH_TEMPLATES = {
  'United States': {  // SMS — brief, on-brand, one clear ask
    sms: [
      { name: 'First touch', body:
        "Hi, this is {agent} with {company}. Quick one about {business}: who runs the tech behind it, the software, automations and vendors? Usually it's no one, or you. We take that over and run it as one operation, for less than a hire. Open to a short call?" },
      { name: 'Follow-up (value)', body:
        "Hi, {agent} from {company} again. Everything we run stays in your accounts, so you're never locked in, and it usually costs less than what you already spend across tools. Happy to show what we'd cover for {business}. If now isn't the time, no problem." },
    ],
    email: [
      { name: 'First touch (email)', body:
        "Hi, I'm {agent} with {company}. Who owns the technology behind {business}, the software, automations and vendors? For most owners it's no one, or themselves on top of everything. That's what we do. We become the technology function behind a business for one monthly figure that lands under a single hire. Want me to show you what that would cover for {business}?\n\n{agent}\n{company}" },
    ],
  },
};
