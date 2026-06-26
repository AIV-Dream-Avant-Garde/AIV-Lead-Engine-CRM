/* ── CORE: Application state ──────────────────────────────── */

// Central mutable state object — all modules read/write S
const S = {
  config: {
    scriptUrl:'',crmSecret:'',companyName:'',
    bookingUrl:'https://cal.com/andrestoro/discovery-call?overlayCalendar=true',
    callScript:'',pitchScript:'',objectionsScript:'',closeScript:'',
    smsEnabled:false,   // texting stays off until A2P 10DLC + consent gate are done
  },
  leads:       [],
  calls:       [],
  interactions: [],   // append-only messages (sms/whatsapp/email, both directions) — Project A
  sequences:   [],    // cadence enrollment state per lead — managed by the Vercel engine (Project B)
  team:        [],
  commissions: [],
  dirty:       new Set(),
  deletedIds:  new Set(),   // tombstones — suppress re-add on pull until the server confirms deletion
  selected:    new Set(),
  page:        1,
  pageSize:    50,
  sortCol:     'updatedAt',
  sortDir:     -1,
  curLeadId:       null,
  pendingImport:   null,
  pendingCerrado:  null,
  session:         null,
  serverTimeOffset:    0,
  lastSyncTimestamp:   null,
  scrapeHistory:   [],
  scripts:         [],
  auditLog:        [],
  lockoutUntil:    null,   // Date ISO string; set after MAX_FAIL_ATTEMPTS exceeded
  dialerMode:      false,  // Power Dialer — auto-advance to next lead after saveCallLog
  dialerQueue:     [],     // Ordered lead IDs for the current dialer session
  scheduledJobs:   [],     // Scheduled scrape jobs (synced to GAS Config sheet)
  stateCampaigns:  [],     // Whole-state grid-tiling scrape campaigns (synced to GAS Config)
  smsTemplates:    [],     // SMS/WhatsApp message templates (stored in localStorage)
  engagements:     [],     // Active Client / spine engagement records (synced to GAS Engagements sheet)
  mutationQueue:   [],     // Durable outbound writes (team/commission/engagement/etc.) retried until they reach the server
  triggerStatus:   { scrape: false, report: false, cadence: false, residual: false }, // GAS time-trigger state
  isSyncing:       false,  // Sync race guard — true while syncNow() is in flight
  demoMode:        false,  // Demo mode — no GAS calls, preloaded sample data
};

// Active call state — property names must match all reads/writes in calls.js
const CALL = {
  device:           null,   // initTwilio → CALL.device.register()
  activeCall:       null,   // confirmConsentAndCall, hangUp, toggleMute, answerIncoming
  curLeadId:        null,   // makeCall, saveCallLog, onCallEnd, answerIncoming
  seconds:          0,      // timer increment; must be 0 (not null) for fmtSec()
  timer:            null,   // setInterval handle; cleared in onCallEnd + answerIncoming
  muted:            false,  // toggleMute
  callSid:          null,   // set from 'accept' event CallSid; saved in saveCallLog
  outcome:          null,   // set by setOutcome(); required before saveCallLog
  consentConfirmed: false,  // set in confirmConsentAndCall; saved in saveCallLog
  incomingCall:     null,   // set in initTwilio 'incoming' handler; used in answerIncoming/rejectIncoming
};
