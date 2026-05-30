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
      { name: 'Primer contacto', body:
        'Hola, soy {agente} de {empresa}. Vi {negocio} en {ciudad} y me parece que están haciendo las cosas bien. Trabajamos con negocios como el suyo para conseguir más clientes de forma constante, y creo que les podemos aportar. ¿Tiene un minuto para que le cuente cómo?' },
      { name: 'Seguimiento (valor)', body:
        'Hola de nuevo, soy {agente} de {empresa}. Le escribo porque lo que hacemos encaja muy bien con un {categoria} como {negocio}. Si le interesa, le muestro en concreto qué resultados podríamos lograr. Si por ahora no es el momento, lo entiendo perfectamente.' },
    ],
    email: [
      { name: 'Primer contacto (email)', body:
        'Hola, soy {agente} de {empresa}. Vi el trabajo de {negocio} en {ciudad} y creo que podemos ayudarles a atraer clientes de forma más constante. Me encantaría mostrarles, en concreto, qué resultados podríamos lograr juntos. ¿Tienen 15 minutos esta semana para una llamada corta?\n\nUn saludo,\n{agente} — {empresa}' },
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
