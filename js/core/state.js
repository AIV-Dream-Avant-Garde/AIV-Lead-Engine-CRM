/* ── CORE: Application state ──────────────────────────────── */

// Central mutable state object — all modules read/write S
const S = {
  config: {
    scriptUrl:'',crmSecret:'',companyName:'',
    callScript:'',pitchScript:'',objectionsScript:'',closeScript:'',
  },
  leads:       [],
  calls:       [],
  team:        [],
  commissions: [],
  dirty:       new Set(),
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
  failCount:       0,      // PIN login failure counter; reset on success
  lockoutUntil:    null,   // Date ISO string; set after MAX_FAIL_ATTEMPTS exceeded
  dialerMode:      false,  // Power Dialer — auto-advance to next lead after saveCallLog
  dialerQueue:     [],     // Ordered lead IDs for the current dialer session
  scheduledJobs:   [],     // Scheduled scrape jobs (synced to GAS Config sheet)
  smsTemplates:    [],     // SMS/WhatsApp message templates (stored in localStorage)
  triggerStatus:   { scrape: false, report: false }, // GAS time-trigger state
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
