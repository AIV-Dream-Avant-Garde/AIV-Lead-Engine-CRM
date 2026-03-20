/* ── DATA: App-wide constants ─────────────────────────────── */

const SOURCES = [
  {val:'Google Maps',cls:'src-maps'},{val:'LinkedIn',cls:'src-linkedin'},
  {val:'Instagram',cls:'src-instagram'},{val:'Facebook',cls:'src-facebook'},
  {val:'TikTok',cls:'src-default'},{val:'Feria / Evento',cls:'src-default'},
  {val:'Referido',cls:'src-referral'},{val:'WhatsApp',cls:'src-default'},
  {val:'Base de datos',cls:'src-default'},{val:'Web',cls:'src-default'},
  {val:'Manual',cls:'src-default'},{val:'Otro',cls:'src-default'},
];

const STATUS_CLS = {
  'Nuevo':'new','Contactado':'contacted','Interesado':'interested',
  'Cerrado':'closed','Negociacion fallida':'failed','No interesado':'dead','No llamar':'dnc',
};

const OUTCOME_LABELS = {
  answered:'Contesto',noanswer:'No contesto',voicemail:'Buzon',
  busy:'Ocupado',callback:'Devolver llamada',wrong:'Numero equivocado',other:'Otro',
};

// SHA-256 of admin PIN "2819"
const ADMIN_HASH = 'c05562111bb2b94ae2eebdbb85e408884622fffd762a7e132198b960d2ad4d17';

const LOCK_DURATION_MS   = 4 * 60 * 60 * 1000; // 4 hours
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;      // 30 min inactivity
const MAX_FAIL_ATTEMPTS  = 5;
const LOCKOUT_MS         = 15 * 60 * 1000;      // 15 min lockout
const LS_LIMIT           = 5 * 1024 * 1024;     // ~5 MB localStorage budget

const GET_ACTIONS = new Set(['ping','pull','getToken','twiml','checkTriggers']);

// Fields from scraped/imported lead data used for CSV mapping
const CRM_FIELDS      = ['name','phone','address','website','rating','reviews','calendarEventId'];
const CRM_FIELD_LABELS = {name:'Nombre',phone:'Telefono',address:'Direccion',website:'Website',rating:'Rating',reviews:'Resenas'};

const SCRIPT_STAGES = {
  opening:    'Apertura',
  pitch:      'Pitch',
  objections: 'Objeciones',
  close:      'Cierre',
  rebuttals:  'Rebuttals',
};

// Lead priority scoring weights (tunable)
const SCORE_WEIGHTS = {
  hasPhone:       40,  // phone present and not 'N/A'
  ratingHigh:     20,  // rating >= 4.0
  ratingMid:      10,  // rating >= 3.0
  reviewsHigh:    15,  // reviews >= 50
  reviewsMid:      8,  // reviews >= 10
  statusNuevo:    10,  // status === 'Nuevo'
  statusContact:   5,  // status === 'Contactado'
  fuOverdue:      25,  // follow-up is overdue
  fuToday:        20,  // follow-up is today
  hasWebsite:      5,  // has website
};

const ROLE_VISIBLE = {
  admin:    ['setup','scraper','import','leads','pipeline','llamadas','perfil','export','admin','analytics'],
  provider: ['scraper','import','leads','pipeline','perfil','export'],
  closer:   ['leads','pipeline','llamadas','perfil','export'],
  solo:     ['scraper','import','leads','pipeline','llamadas','perfil','export','analytics'],
};
