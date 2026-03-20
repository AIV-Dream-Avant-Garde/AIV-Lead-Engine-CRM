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
  auditLog:        [],
};

// Active call state
const CALL = {
  device:    null,
  conn:      null,
  leadId:    null,
  startTime: null,
  timer:     null,
  consentGiven: false,
};
