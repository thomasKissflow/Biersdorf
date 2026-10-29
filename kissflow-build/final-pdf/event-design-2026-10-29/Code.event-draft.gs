// CIQ final document service (Google Apps Script, V8). Kissflow-internal.
// Makes the final PDF of each completed CIQ case once (REQ-PROC-046, AS-12; spec: final-pdf README), on an event, no
// polling: the app integration "CIQ Case Item exits final step – final release PDF Email" POSTs the case item id to this
// web app (doPost, ?token=DOPOST_TOKEN). doPost only queues it (Q_<caseItemId>) and schedules a one-off trigger; drain()
// then, under the script lock:
//   reads the case, its reviews, open points, audit rows, supplier and configuration (admin REST routes) →
//   builds the document with the app's own code (Bundle.gs, CIQFinal) and checks its seal → renders the PDF →
//   attaches it to CIQ_Case_A00.Final_PDF → writes Final_Document_Hash / Final_Document_At (and Completion_Trigger when
//   empty) → attaches the same bytes to the case's portal request CIQP_Request_A00.Final_PDF → logs one 'Final PDF'
//   CIQ Audit Event row → POSTs {caseItemId, caseCode, seal} to the app integration "CIQ Case - Send Final Release to
//   RMM" (RMM_WEBHOOK_URL), which mails the case's Final PDF to the RMM role.
// Never regenerates: a case with Final_Document_Hash set is left alone, unless the hash is the one this service planned
// for it (then only the missing portal copy, audit row or RMM notification is done). Whether a case is filed always
// comes from Kissflow data, never from the POST. Never submits a step; on the portal it reads and writes only the
// request that names the case (App_Case_Item_Id); never reads RMES records or internal notes. All Kissflow HTTP goes
// through kfFetch_ (the uploads through kfUpload_), the webhook through hookPost_, both paced by fetch_. Logs carry ids,
// codes, counts and statuses only: no personal data beyond ids, never a key, token or URL.
// Every step of a case is recorded in FD_<caseItemId> before or right after it runs, so a lost answer, a failure or the
// run's time limit resumes where it stopped, with no second upload, notification or audit row.
//
// Entry points: doPost(e) (the web app), drain(e) (the one-off trigger; also by hand), probe(), runOnce(caseItemId),
// portalCopy(caseItemId), rmmWebhookSample(caseItemId), removeTriggers(), tick() (retired: removes an old polling trigger).
// Script Properties: README.md "Script Properties". Managed by the script: PAUSE_UNTIL, DRAIN_DUE, DRAIN_FAILS,
// Q_<caseItemId> (the queue) and FD_<caseItemId> (the resumable state of one case).

var FD_ = {
  CASE: 'CIQ_Case_A00',
  REVIEW: 'CIQ_Review_A00',
  OP: 'CIQ_Open_Point_A00',
  AUDIT: 'CIQ_Audit_Event_A00',
  SUPPLIER: 'CIQ_Supplier_A00',
  CONFIG: 'CIQ_Config_Version_A00',
  REQUEST: 'CIQP_Request_A00', // the portal request (KF_PORTAL_APP_ID); the case names it in Portal_Request_Item_Id
  PDF_FIELD: 'Final_PDF', // on the case and on the portal request
  SERVICE: 'CIQ final document service',
  PACE_MS: 1200, // shared-key rule: at least 1.2 s between Kissflow calls (the webhook too: same host)
  PAUSE_MS: 20 * 60 * 1000, // a 429 or an HTML (Cloudflare) answer stops the script for 20 min
  RUN_LIMIT_S: 300, // no Kissflow call after 5 min (Apps Script stops a run at 6 min); the next drain resumes
  WRITE_BUDGET_MS: 2 * 60 * 1000, // a new case, and a case's first write, need 2 min left (so: none after 3 min)
  SETTLE_FALLBACK_MIN: 15, // released this long ago (or queued this long ago) counts as settled even if not completed
  MAX_ATTEMPTS: 3,
  PAGE_SIZE: 100,
  MAX_PAGES: 50,
  AUDIT_GET_CAP: 150,
  ITEM_GET_CAP: 100, // review or open-point items read in full for one case
  RETRY_STATUSES: [408, 409, 423], // busy or locked: the upload is tried again in the same run (kf.mjs retries 423)
  ATTACH_RETRIES: 2,
  RETRY_WAIT_MS: 3000,
  CACHE_TTL_S: 1800, // configuration rows: 30 min
  CACHE_CHUNK: 30000, // characters per cache value (CacheService takes 100 KB per value)
  ID_RE: /^[A-Za-z0-9_-]{6,40}$/,
  // the event path
  DRAIN_FN: 'drain',
  PLACEHOLDER_RE: /^SampleInstance\d*$/i, // the trigger's sample item in the integration builder's step test
  MAX_QUEUE: 50, // Q_ entries; doPost refuses more (Script Properties hold 500 KB)
  MIN_DELAY_MS: 60 * 1000, // the shortest one-off trigger delay used
  BUSY_DELAY_MS: 60 * 1000, // the lock is held: the drain tries again after this
  WATCHDOG_MS: 7 * 60 * 1000, // a drain with work schedules its successor first: Apps Script may end a run at 6 min
  STALE_MS: 10 * 60 * 1000, // a drain trigger due longer ago than this never ran: it is replaced
  EVENT_WAIT_MIN: 20, // a queued case still not ready this long after its event leaves the queue (logged)
  RETRY_DELAYS_MIN: [2, 5], // after failed attempt 1 and 2 (attempt 3 alerts ADMIN_EMAIL and leaves the queue)
  MAX_DRAIN_FAILS: 3,
  MAX_STOPS: 6, // drains in a row that hit the time limit on the same case: one alert, it leaves the queue (FD_ kept)
  ALERT_EVERY_MS: 60 * 60 * 1000, // queue full, broken configuration, back-to-back pauses: one alert an hour
  CODE_REV: 'ev-2026-10-29.1', // doPost (the deployed version) and drain (the trigger) log it: a mismatch means a stale deployment // drains in a row that failed outside a case: no further drain is scheduled, ADMIN_EMAIL is told
  HOOK_RE: /^https:\/\/([A-Za-z0-9.-]+)\/integration\/2\/([A-Za-z0-9_-]+)\/webhook\/([A-Za-z0-9_-]+)$/
};

var PROPS_SHOWN_ = ['KF_DOMAIN', 'KF_ACCOUNT_ID', 'KF_APP_ID', 'KF_PORTAL_APP_ID', 'KF_ACCESS_KEY_ID', 'KF_ACCESS_KEY_SECRET', 'TIME_ZONE', 'MAIL_ENABLED', 'RMM_WEBHOOK_URL', 'MAIL_FROM_NAME', 'ADMIN_EMAIL', 'DRIVE_FOLDER_ID', 'DOPOST_TOKEN', 'MAX_CASES_PER_RUN', 'SETTLE_MINUTES', 'PACE_MS', 'RUN_ONCE_CASE_ID'];

// Per execution (reset by begin_).
var CFG_ = null;
var SECRETS_ = [];
var LAST_CALL_AT_ = 0;
var CALLS_ = 0;
var RUN_STARTED_ = 0;

// =============================================================================================== entry points

/** Read-only check: access, counts, and the field NAMES of one list row and one case item. Writes nothing. */
function probe() {
  begin_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return log_('probe skipped: another run holds the lock');
  try {
    probe_();
  } finally {
    lock.releaseLock();
  }
}

function probe_() {
  var c = cfg_();
  var all = props_().getProperties();
  var hook = hookParts_(c);
  log_('probe: Script Properties', {
    set: PROPS_SHOWN_.filter(function (k) { return filled_(all[k]); }),
    notSet: PROPS_SHOWN_.filter(function (k) { return !filled_(all[k]); }),
    mailEnabled: c.mailEnabled, timeZone: c.timeZone, portalApp: c.portalApp, bundle: CIQFinal.BUILD,
    // never the URL: only whether it is a webhook URL of KF_DOMAIN and KF_ACCOUNT_ID
    rmmWebhook: { set: filled_(c.rmmHook), shape: !!hook, sameHost: !!hook && hook.host === c.domain.toLowerCase(), sameAccount: !!hook && hook.acc === c.acc }
  });
  log_('probe: event path', { queued: queue_().length, drainDue: props_().getProperty('DRAIN_DUE') ? new Date(Number(props_().getProperty('DRAIN_DUE'))).toISOString() : '', triggers: { drain: triggersOf_(FD_.DRAIN_FN).length, tick: triggersOf_('tick').length, other: ScriptApp.getProjectTriggers().length - triggersOf_(FD_.DRAIN_FN).length - triggersOf_('tick').length } });
  if (triggersOf_('tick').length) log_('probe: an old polling trigger (tick) is still installed: run removeTriggers()');
  if (c.driveFolder) {
    try {
      DriveApp.getFolderById(c.driveFolder).getName();
      log_('probe: DRIVE_FOLDER_ID', { access: true });
    } catch (e) {
      log_('probe: DRIVE_FOLDER_ID', { access: false, error: errShort_(e) });
    }
  }
  requireCfg_(c, true);
  if (pausedNow_()) return;
  var ctx = ctx_();
  try {
    var rows = listProcess_(FD_.CASE);
    var lk = keysOf_(rows);
    log_('probe: case list', { rows: rows.length, keys: lk });
    if (lk.indexOf('Final_Release_At') >= 0) log_('probe: released without a final document (an event may be lost: runOnce each, never the R1 showcase)', { cases: rows.filter(function (r) { return filled_(r.Final_Release_At) && !filled_(r.Final_Document_Hash) && ['Rejected', 'Withdrawn'].indexOf(String(r._status || '')) < 0; }).map(function (r) { return String(r.Case_Code || r._id); }) });
    else log_('probe: the case list carries no Final_Release_At: missed events cannot be listed');
    var audit = listForm_(FD_.AUDIT, FD_.PAGE_SIZE);
    log_('probe: audit list', { rows: audit.length, keys: keysOf_(audit), withCaseItemId: audit.filter(function (r) { return 'Case_Item_Id' in r; }).length, withSnapshot: audit.filter(function (r) { return 'Snapshot_JSON' in r; }).length });
    log_('probe: config list', { rows: listForm_(FD_.CONFIG, 200).length });
    log_('probe: supplier list', { rows: listForm_(FD_.SUPPLIER, 200).length });
    // one case in depth: RUN_ONCE_CASE_ID, else the first listed case
    var id = String(props_().getProperty('RUN_ONCE_CASE_ID') || (rows[0] && rows[0]._id) || '').trim();
    var it = FD_.ID_RE.test(id) ? getProcess_(FD_.CASE, id) : null;
    if (it) {
      var el = eligibility_(it, now_(), 0);
      log_('probe: one case item', { caseItemId: id, caseCode: String(it.Case_Code || ''), status: String(it._status || ''), eligible: el.ok, why: el.why || '', fields: Object.keys(it).length, keys: Object.keys(it).sort() });
      log_('probe: its reads', { reviewHits: listProcess_(FD_.REVIEW, id).length, openPointHits: listProcess_(FD_.OP, id).length, auditRows: auditRowsFor_(ctx, it).length });
      var reqId = String(it.Portal_Request_Item_Id || '').trim();
      var req = FD_.ID_RE.test(reqId) ? getProcess_(FD_.REQUEST, reqId, c.portalApp) : null;
      log_('probe: its portal request', { requestItemId: reqId, found: !!req, linked: !!req && req.App_Case_Item_Id === id, status: req ? String(req._status || '') : '', finalPdfKey: !!req && FD_.PDF_FIELD in req, finalPdfFiles: req ? attachments_(req).length : 0 });
    }
    log_('probe: done', { calls: CALLS_ });
  } catch (e) {
    if (isPause_(e)) return log_('probe stopped: paused', { until: pauseIso_() });
    if (isDeadline_(e)) return log_('probe stopped: time is up', { calls: CALLS_ });
    log_('probe failed', { error: errShort_(e) });
    throw e;
  }
}

/** One case, the whole pipeline. caseItemId: the argument, else Script Property RUN_ONCE_CASE_ID. A manual run also
 *  retries a case the queue gave up on (MAX_ATTEMPTS), and resumes its kept state (FD_<id>). It does not queue. */
function runOnce(caseItemId) {
  begin_();
  var id = String(caseItemId || props_().getProperty('RUN_ONCE_CASE_ID') || '').trim();
  if (!FD_.ID_RE.test(id)) throw new Error('runOnce: give a case item id (the argument or Script Property RUN_ONCE_CASE_ID)');
  var r = runLocked_(id, function (ctx) { return processCase_(ctx, id, null, { manual: true }); });
  log_('runOnce done', { caseItemId: id, ok: r.ok, status: r.status });
  return r;
}

/** Repair, by hand: the filed PDF of a filed case onto its portal request, when its filing skipped the portal copy
 *  (log line 'portal copy skipped'). caseItemId: the argument, else RUN_ONCE_CASE_ID. Stateless (writes no FD_ state, so
 *  a later event still sees the case as filed by someone else and leaves it alone): the case's file named
 *  <Case_Code>-final-document.pdf whose SHA-256 is the one in Final_Document_Hash is copied; a request that already
 *  holds a file of that name with the document's seal is left as it is. No audit row, no notification. */
function portalCopy(caseItemId) {
  begin_();
  var id = String(caseItemId || props_().getProperty('RUN_ONCE_CASE_ID') || '').trim();
  if (!FD_.ID_RE.test(id)) throw new Error('portalCopy: give a case item id (the argument or Script Property RUN_ONCE_CASE_ID)');
  var r = runLocked_(id, function (ctx) {
    var item = getProcess_(FD_.CASE, id);
    if (!item) return res_(false, 'case item not found');
    var m = /^seal:([0-9a-f]{16}) sha256:([0-9a-f]{64})$/.exec(String(item.Final_Document_Hash || ''));
    if (!m) return res_(false, 'the case has no final document (Final_Document_Hash)');
    var code = String(item.Case_Code || id);
    var name = CIQFinal.pdfName(code);
    var caseT = target_(ctx.c, FD_.CASE, id);
    var mine = null;
    var same = attachments_(item).filter(function (a) { return a && a.name === name; });
    for (var i = 0; i < same.length && i < 3 && !mine; i++) {
      var b = downloadAttachment_(ctx, caseT, same[i].id);
      if (sha256Hex_(b) === m[2]) mine = { id: String(same[i].id), bytes: b };
    }
    if (!mine) return res_(false, 'no file on the case Final_PDF matches Final_Document_Hash');
    var st = { code: code, name: name, seal: m[1], sha: m[2], attId: mine.id };
    portalStep_(ctx, id, item, st, Utilities.newBlob(mine.bytes, 'application/pdf', name), function () {});
    return st.portalAttId ? res_(true, 'portal copy ' + st.portalAttId) : res_(false, 'portal copy skipped: ' + st.portalSkipped);
  });
  log_('portalCopy done', { caseItemId: id, ok: r.ok, status: r.status });
  return r;
}

/** By hand, once, while the integration "CIQ Case - Send Final Release to RMM" is OFF (a capture on a switched-on
 *  integration runs it for real, and it would mail the RMM role): posts a sample of the notification to RMM_WEBHOOK_URL
 *  so the builder can capture its payload. caseItemId: the argument, else RUN_ONCE_CASE_ID (a filed case, so the
 *  builder's Search step test finds a real Final PDF). The URL never leaves Script Properties. No REST call, no state. */
function rmmWebhookSample(caseItemId) {
  begin_();
  var c = cfg_();
  var h = hookParts_(c);
  if (!h || h.host !== c.domain.toLowerCase() || h.acc !== c.acc) throw new Error('RMM_WEBHOOK_URL is not set, or not a webhook of KF_DOMAIN and KF_ACCOUNT_ID');
  var id = String(caseItemId || props_().getProperty('RUN_ONCE_CASE_ID') || '').trim();
  if (!FD_.ID_RE.test(id)) throw new Error('rmmWebhookSample: give a case item id (the argument or RUN_ONCE_CASE_ID)');
  var r = runLocked_(id, function () {
    var it = getProcess_(FD_.CASE, id);
    var m = /^seal:([0-9a-f]{16}) sha256:/.exec(String((it && it.Final_Document_Hash) || ''));
    if (!m) return res_(false, 'not a filed case (no Final_Document_Hash): the integration\'s Search step would find no Final PDF');
    var code = String(it.Case_Code || id);
    var h2 = hookPost_(c.rmmHook, { caseItemId: id, caseCode: code, seal: m[1], idempotencyKey: code + '-FD-RMM-SAMPLE' });
    return res_(h2.status >= 200 && h2.status < 300 && !h2.html, 'HTTP ' + h2.status);
  });
  log_('rmm webhook sample sent', { caseItemId: id, ok: r.ok, status: r.status });
  return r;
}

/** Retired 29 Oct: the service no longer polls. An old time trigger that still calls tick removes itself here. */
function tick() {
  begin_();
  log_('tick is retired (filings come from doPost now): old tick trigger removed', { removed: deleteTriggersOf_('tick') });
}

/** Removes the old tick trigger and any pending drain trigger. Queued cases stay queued: run drain() to file them. */
function removeTriggers() {
  begin_();
  var n = { tick: deleteTriggersOf_('tick'), drain: deleteTriggersOf_(FD_.DRAIN_FN) };
  props_().deleteProperty('DRAIN_DUE');
  log_('triggers removed', { tick: n.tick, drain: n.drain, stillQueued: queue_().length });
}

/** The web app, for the app integration "CIQ Case Item exits final step – final release PDF Email" (HTTP POST). The
 *  URL carries ?token=<DOPOST_TOKEN> (e.parameter.token; a "token" in the JSON body is accepted too); the body is JSON
 *  {"caseItemId": "<the case item's _id>"} (a form body or a caseItemId query parameter works too: Apps Script puts
 *  both in e.parameter). It answers at once and calls no Kissflow route: the id is queued (Q_<id>) and a one-off
 *  trigger runs drain() SETTLE_MINUTES later. The builder's step test sends the trigger's sample id SampleInstance001:
 *  answered ok:false "test event", nothing queued. Apps Script cannot set a status: every answer is HTTP 200 (behind
 *  Google's 302 to script.googleusercontent.com), so the JSON {ok, status} says what happened. Never throws (an
 *  uncaught error would answer an HTML page). */
function doPost(e) {
  try {
    begin_();
    var c = cfg_();
    if (!c.token) {
      log_('doPost refused: DOPOST_TOKEN is not set');
      return json_({ ok: false, status: 'disabled' });
    }
    var q = (e && e.parameter) || {};
    var body = postBody_(e);
    if (body === null) {
      log_('doPost refused: the body is not JSON');
      return json_({ ok: false, status: 'bad request' });
    }
    if (!sameText_(String(q.token || body.token || ''), c.token)) {
      log_('doPost refused: no or wrong token');
      return json_({ ok: false, status: 'refused' });
    }
    var id = String(body.caseItemId || body._id || q.caseItemId || '').trim();
    if (FD_.PLACEHOLDER_RE.test(id)) {
      log_('doPost: a step test (the sample item), nothing queued', { caseItemId: id });
      return json_({ ok: false, status: 'test event', caseItemId: id });
    }
    if (!FD_.ID_RE.test(id)) {
      log_('doPost refused: bad case item id');
      return json_({ ok: false, status: 'bad case item id' });
    }
    var status = enqueue_(id, c.settleMin * 60000);
    if (status === 'queue full') {
      log_('doPost refused: the queue is full', { caseItemId: id, queued: FD_.MAX_QUEUE });
      alertOnce_('QFULL', c, id, 'The final-document queue is full (' + FD_.MAX_QUEUE + '): the event of case item ' + id + ' was refused. Run drain() and probe(); refused cases need runOnce.');
      return json_({ ok: false, status: status, caseItemId: id });
    }
    var scheduled;
    try {
      scheduled = scheduleDrain_(c.settleMin * 60000);
    } catch (x) {
      log_('doPost: queued, but no drain trigger could be created', { caseItemId: id, error: errShort_(x) });
      alertAdmin_(c, id, 'The case item ' + id + ' is queued for its final document, but no trigger could be created (' + errShort_(x) + '). Run drain() by hand, and check the project Triggers page.');
      return json_({ ok: false, status: 'queued, no drain scheduled', caseItemId: id });
    }
    log_('doPost ' + status, { caseItemId: id, rev: FD_.CODE_REV, drainScheduled: scheduled, eventStatus: String(body.status || q.status || '').slice(0, 20) });
    return json_({ ok: true, status: status, caseItemId: id });
  } catch (x) {
    try {
      log_('doPost failed', { error: errShort_(x) });
    } catch (y) {
      // nothing more can be done; the answer still goes out
    }
    return json_({ ok: false, status: 'error' });
  }
}

/** The one-off trigger doPost schedules (also run by hand). Deletes every drain trigger first (fired one-off triggers
 *  stay listed), then, under the script lock, files the due queue entries oldest first, at most MAX_CASES_PER_RUN and
 *  while 2 min of the run are left, reading the queue again after each case. A case not ready yet (just exited the
 *  step, not completed) goes back with a later time; anything left schedules the next drain. Busy lock: again in 1 min.
 *  Order matters: a doPost that saw a pending drain trigger wrote its Q_ entry before this run deleted that trigger, so
 *  this run reads it; one that saw none schedules its own. */
function drain(e) {
  begin_();
  clearDrainTriggers_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    scheduleDrain_(FD_.BUSY_DELAY_MS);
    return log_('drain: another run holds the lock, again in 1 min');
  }
  var again = true;
  var cur = null;
  var filed = 0;
  var seen = 0;
  try {
    if (pausedNow_()) return;
    // a successor first, while there is work: if Apps Script ends this run, the queue is not stranded (no successor
    // for an empty queue, so the chain ends)
    if (queue_().length) scheduleDrain_(FD_.WATCHDOG_MS);
    var ctx = ctx_();
    try {
      requireCfg_(ctx.c);
    } catch (x) {
      again = false;
      clearDrainTriggers_(); // the successor too: a broken configuration must not run every 7 min
      log_('drain stopped: ' + errShort_(x), { queued: queue_().length });
      alertOnce_('CFG', ctx.c, 'the queue', 'The final-document queue holds ' + queue_().length + ' case(s), but the Script Properties are not complete: ' + errShort_(x) + ' Fix them, then run drain() by hand.');
      return;
    }
    for (;;) {
      var due = queue_().filter(function (x) { return x.next <= now_(); });
      if (!due.length || filed >= ctx.c.maxCases || timeLeft_() < FD_.WRITE_BUDGET_MS) break;
      var q = due[0];
      cur = q;
      if (q.rev && q.rev !== FD_.CODE_REV) log_('drain: this event came from another code revision: update the web app deployment (Manage deployments, Edit, New version)', { eventRev: q.rev, rev: FD_.CODE_REV });
      seen++;
      var r = processCase_(ctx, q.id, null, { since: q.at });
      if (!r.skipped) filed++;
      requeue_(q, r);
    }
    props_().deleteProperty('DRAIN_FAILS');
    log_('drain done', { looked: seen, worked: filed, left: queue_().length, calls: CALLS_, ms: now_() - RUN_STARTED_ });
  } catch (x) {
    if (isPause_(x)) log_('drain stopped: paused', { until: pauseIso_() });
    else if (isDeadline_(x)) {
      log_('drain stopped: time is up, the next drain resumes', { calls: CALLS_, ms: now_() - RUN_STARTED_ });
      noteStop_(cur);
    }
    else {
      var fails = Number(props_().getProperty('DRAIN_FAILS') || 0) + 1;
      props_().setProperty('DRAIN_FAILS', String(fails));
      log_('drain failed', { error: errShort_(x), failsInARow: fails });
      if (fails >= FD_.MAX_DRAIN_FAILS) {
        again = false;
        clearDrainTriggers_(); // the start-of-drain watchdog too
        if (fails === FD_.MAX_DRAIN_FAILS) alertAdmin_(cfg_(), 'the queue', 'The final-document drain failed ' + fails + ' times in a row (' + errShort_(x) + '). No further drain is scheduled; ' + queue_().length + ' case(s) stay queued. Fix the cause, then run drain() by hand.');
      }
    }
  } finally {
    try {
      var next = again ? nextDue_() : null;
      if (next !== null) scheduleDrain_(next - now_());
    } finally {
      lock.releaseLock();
    }
  }
}

// =============================================================================================== the queue

/** Q_<id> = {at: first event (ms), next: due (ms), n: waits so far, why: last reason}. Returns 'queued', 'already
 *  queued' (the entry is kept as it is) or 'queue full'. One key per case: no shared list to race on. */
function enqueue_(id, settleMs) {
  var p = props_();
  if (p.getProperty('Q_' + id)) return 'already queued';
  if (queue_().length >= FD_.MAX_QUEUE) return 'queue full';
  var t = now_();
  p.setProperty('Q_' + id, JSON.stringify({ at: t, next: t + settleMs, n: 0, rev: FD_.CODE_REV }));
  return 'queued';
}

/** A drain ended at the time limit while working on q: counted on its entry; at MAX_STOPS it leaves the queue with one
 *  alert (its FD_ state is kept, so runOnce resumes it). */
function noteStop_(q) {
  if (!q) return;
  var k = 'Q_' + q.id;
  var raw = props_().getProperty(k);
  if (!raw) return;
  var o = JSON.parse(raw);
  o.stops = (Number(o.stops) || 0) + 1;
  if (o.stops < FD_.MAX_STOPS) return props_().setProperty(k, JSON.stringify(o));
  props_().deleteProperty(k);
  log_('queue: gave up, every drain hit the time limit on this case', { caseItemId: q.id, stops: o.stops });
  alertAdmin_(cfg_(), q.id, 'The final document of case item ' + q.id + ' did not finish in ' + o.stops + ' drains in a row: each one hit the time limit. It left the queue; its progress is kept. Run runOnce for it (RUN_ONCE_CASE_ID ' + q.id + ').');
}

/** At most one alert per key per ALERT_EVERY_MS (ALERT_<key> holds the last time). */
function alertOnce_(key, c, code, text) {
  var p = props_();
  var last = Number(p.getProperty('ALERT_' + key) || 0);
  if (now_() - last < FD_.ALERT_EVERY_MS) return false;
  p.setProperty('ALERT_' + key, String(now_()));
  return alertAdmin_(c, code, text);
}

/** Every queue entry, oldest event first. */
function queue_() {
  var all = props_().getProperties();
  var out = [];
  Object.keys(all).forEach(function (k) {
    var m = /^Q_([A-Za-z0-9_-]{6,40})$/.exec(k);
    if (!m) return;
    try {
      var q = JSON.parse(all[k]);
      if (q && isFinite(q.at) && isFinite(q.next)) out.push({ id: m[1], at: Number(q.at), next: Number(q.next), n: Number(q.n) || 0, why: q.why || '', rev: q.rev || '' });
    } catch (e) {
      // an unreadable entry is ignored (and stays visible in Script Properties)
    }
  });
  return out.sort(function (a, b) { return a.at - b.at || (a.id < b.id ? -1 : 1); });
}

/** After one case. Off the queue: done, nothing to do (not found, ended, filed by someone else), stuck (attempt 3; the
 *  admin was told), or still not ready EVENT_WAIT_MIN after its event (logged: e.g. a release reopened). Back on it:
 *  not ready yet (1, 2, 4, 8, 8 … min), or a failed attempt (RETRY_DELAYS_MIN). The time limit and a pause throw past
 *  this, so the entry stays as it is and the next drain takes it first. */
function requeue_(q, r) {
  var k = 'Q_' + q.id;
  var put = function (next, why) { props_().setProperty(k, JSON.stringify({ at: q.at, next: next, n: q.n, why: String(why || '').slice(0, 120) })); };
  if (r.next === 'wait' && now_() - q.at < FD_.EVENT_WAIT_MIN * 60000) {
    q.n++;
    return put(now_() + Math.min(8, Math.pow(2, q.n - 1)) * 60000, r.status);
  }
  if (r.next === 'retry') return put(now_() + FD_.RETRY_DELAYS_MIN[Math.min(r.attempts || 1, FD_.RETRY_DELAYS_MIN.length) - 1] * 60000, r.status);
  if (r.next === 'wait') log_('queue: gave up waiting', { caseItemId: q.id, why: r.status, minutes: Math.round((now_() - q.at) / 60000) });
  props_().deleteProperty(k);
}

/** When the next drain is needed: the earliest entry's time, not before a running pause ends; null for an empty queue. */
function nextDue_() {
  var q = queue_();
  if (!q.length) return null;
  var t = Math.min.apply(null, q.map(function (x) { return x.next; }));
  return Math.max(t, pauseUntil_() + FD_.MIN_DELAY_MS * (pauseUntil_() > now_() ? 1 : 0));
}

/** Makes sure a drain trigger fires within delayMs (never sooner than MIN_DELAY_MS). A pending one due by then is
 *  enough (DRAIN_DUE: the earliest pending due time); one due more than STALE_MS ago never ran and is replaced.
 *  Returns true when it created a trigger. Apps Script runs an after() trigger no sooner than asked, often later. */
function scheduleDrain_(delayMs) {
  var p = props_();
  var at = now_() + Math.max(FD_.MIN_DELAY_MS, delayMs || 0);
  var mine = triggersOf_(FD_.DRAIN_FN);
  var due = Number(p.getProperty('DRAIN_DUE') || 0);
  var fresh = mine.length > 0 && due > now_() - FD_.STALE_MS;
  if (fresh && due <= at) return false;
  if (mine.length && !fresh) mine.forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(FD_.DRAIN_FN).timeBased().after(at - now_()).create();
  p.setProperty('DRAIN_DUE', String(fresh ? Math.min(due, at) : at));
  return true;
}

function clearDrainTriggers_() {
  var n = deleteTriggersOf_(FD_.DRAIN_FN);
  props_().deleteProperty('DRAIN_DUE');
  return n;
}

function triggersOf_(fn) {
  return ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === fn; });
}

function deleteTriggersOf_(fn) {
  var list = triggersOf_(fn);
  list.forEach(function (t) { ScriptApp.deleteTrigger(t); });
  return list.length;
}

/** The POST body as an object: {} when it is not a JSON object text (a form body is in e.parameter), null when it
 *  starts like JSON but does not parse. */
function postBody_(e) {
  var text = String((e && e.postData && e.postData.contents) || '');
  if (!/^\s*\{/.test(text)) return {};
  try {
    var o = JSON.parse(text);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch (x) {
    return null;
  }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// =============================================================================================== the pipeline

/** fn(ctx) under the script lock, with the pause, the configuration check and the error handling of a manual run. */
function runLocked_(id, fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return res_(false, 'busy: another run holds the lock');
  try {
    if (pausedNow_()) return res_(false, 'paused until ' + pauseIso_());
    var ctx = ctx_();
    requireCfg_(ctx.c);
    return fn(ctx);
  } catch (e) {
    if (isPause_(e)) return res_(false, 'paused until ' + pauseIso_());
    if (isDeadline_(e)) return res_(false, 'stopped at the time limit; run it again to resume');
    log_('run failed', { caseItemId: id, error: errShort_(e) });
    return res_(false, 'failed: ' + errShort_(e));
  } finally {
    lock.releaseLock();
  }
}

/** One case. opts: {manual} (runOnce: also a case past MAX_ATTEMPTS), {since} (the drain: when its event came). A
 *  failure counts an attempt (after MAX_ATTEMPTS: one ADMIN_EMAIL alert; the queue drops it, runOnce retries it). A stop
 *  (a check a retry cannot fix) alerts at once. The time limit and a pause are not attempts and are thrown on. */
function processCase_(ctx, id, item, opts) {
  opts = opts || {};
  var st = loadState_(id) || { attempts: 0 };
  if (!opts.manual && st.attempts >= FD_.MAX_ATTEMPTS) return res_(false, 'stuck after ' + st.attempts + ' attempts (runOnce retries it)', true, 'drop');
  try {
    return pipeline_(ctx, id, item, st, opts);
  } catch (e) {
    if (isPause_(e)) throw e;
    if (isDeadline_(e)) {
      if (st.code) {
        st.lastStop = nowIso_();
        saveState_(id, st);
      }
      log_('case stopped: time is up', { caseItemId: id, caseCode: st.code || '' });
      throw e;
    }
    var stop = isStop_(e);
    st.attempts = Math.max((st.attempts || 0) + 1, stop ? FD_.MAX_ATTEMPTS : 0);
    st.lastError = errShort_(e);
    st.lastAt = nowIso_();
    saveState_(id, st);
    log_(stop ? 'case stopped: needs a person' : 'case failed', { caseItemId: id, caseCode: st.code || '', attempt: st.attempts, error: st.lastError });
    if (st.attempts >= FD_.MAX_ATTEMPTS && !st.alerted) {
      var what = stop ? 'was stopped' : 'failed ' + st.attempts + ' times';
      if (alertAdmin_(ctx.c, st.code || id, 'The final document of ' + (st.code || id) + ' (case item ' + id + ') ' + what + '. New events for it are skipped now; runOnce retries it and resumes where it stopped.\n\n' + (stop ? 'Reason: ' : 'Last error: ') + st.lastError)) {
        st.alerted = true;
        saveState_(id, st);
      }
    }
    var r = res_(false, (stop ? 'stopped: ' : 'failed: ') + st.lastError, false, st.attempts >= FD_.MAX_ATTEMPTS ? 'drop' : 'retry');
    r.attempts = st.attempts;
    return r;
  }
}

function pipeline_(ctx, id, item, st, opts) {
  var c = ctx.c;
  item = item || getProcess_(FD_.CASE, id);
  if (!item) return res_(false, 'case item not found', true, 'drop');
  var code = String(item.Case_Code || id);
  st.code = code;
  if (filled_(item.Final_Document_Hash)) return filedAlready_(ctx, id, item, st);
  var el = eligibility_(item, now_(), opts.since);
  if (!el.ok) {
    if (el.stop) throw stopError_('the case cannot be filed: ' + el.why);
    log_('case not eligible', { caseItemId: id, caseCode: code, why: el.why, status: String(item._status || '') });
    return res_(false, 'not eligible: ' + el.why, true, el.wait ? 'wait' : 'drop');
  }
  log_('case start', { caseItemId: id, caseCode: code, attempt: (st.attempts || 0) + 1 });

  // 1. the live set
  var audit = auditRowsFor_(ctx, item);
  var reviews = caseItems_(ctx, FD_.REVIEW, item, audit);
  var ops = caseItems_(ctx, FD_.OP, item, audit);
  var suppliers = supplierRowsFor_(ctx, item);
  var config = configRows_(ctx);
  log_('read', { caseCode: code, reviews: reviews.length, openPoints: ops.length, auditRows: audit.length, supplierRows: suppliers.length, configRows: config.length });

  // 2. the document (the app's own mapper and builder) and its seal
  var built = CIQFinal.finalDocumentFor({ caseItem: item, reviews: reviews, openPoints: ops, auditRows: audit, supplierRows: suppliers, configRows: config, loadedAt: nowIso_() });
  if (!built.doc) throw new Error(notBuilt_(built));
  if (!built.ok || !CIQFinal.verifyFinalDocument(built.doc)) throw new Error('the document seal does not verify');
  var doc = built.doc;
  log_('built', { caseCode: code, seal: built.seal, sections: doc.sections.length, components: doc.components.length, evidence: doc.evidence.length, openPoints: doc.threads.length, confirmations: doc.confirmations.length, warnings: built.warnings.length, bundle: CIQFinal.BUILD });

  // 3. the PDF
  var name = CIQFinal.pdfName(code);
  var bytes = CIQFinal.signedBytes(CIQFinal.renderPdf(doc, { formatDateTime: dateFormatter_(c.timeZone) }));
  var sha = sha256Hex_(bytes);
  log_('rendered', { caseCode: code, file: name, bytes: bytes.length, sha256: sha });

  // 4. the writes need time for all of them; read the case again: stop if it was filed meanwhile, reuse our own PDF
  budget_('the writes');
  var fresh = getProcess_(FD_.CASE, id);
  if (!fresh) throw new Error('the case item could not be read again');
  if (filled_(fresh.Final_Document_Hash)) return filedAlready_(ctx, id, fresh, st);
  var caseT = target_(c, FD_.CASE, id);
  var file = { bytes: bytes, sha: sha, size: bytes.length };
  var existing = sealedFile_(ctx, caseT, fresh, name, built.seal, st.sha === sha ? st.attId : '');
  if (existing) {
    file.attId = existing.id;
    if (existing.bytes) {
      // an earlier run's file with this document's seal: the filed bytes count, not this render
      file.bytes = existing.bytes;
      file.sha = sha256Hex_(existing.bytes);
      file.size = existing.bytes.length;
    }
    log_('attached PDF reused', { caseCode: code, attachmentId: existing.id, sha256: file.sha });
  } else {
    // 5. attach (multipart field "file"; uploads add, never replace). The third failure of any kind counts as a refusal.
    var up;
    try {
      up = attach_(ctx, caseT, fresh, name, bytes);
    } catch (e) {
      if (isPause_(e) || isDeadline_(e)) throw e;
      st.attachFails = (st.attachFails || 0) + 1;
      if (st.attachFails < FD_.MAX_ATTEMPTS || !c.driveFolder) throw e;
      up = { refused: true, status: e.status || 0, error: errShort_(e), fails: st.attachFails };
    }
    if (up.refused) {
      log_('attach refused', { caseCode: code, status: up.status, error: up.error, fails: up.fails || 0 });
      if (!c.driveFolder) throw new Error('Kissflow refused the attachment (HTTP ' + up.status + ') and DRIVE_FOLDER_ID is not set');
      var d = driveFallback_(ctx, id, name, bytes, built.seal, st);
      file.driveId = d.id;
      file.driveUrl = d.url;
      file.bytes = d.bytes;
      file.sha = sha256Hex_(d.bytes);
      file.size = d.bytes.length;
      log_('saved in Drive', { caseCode: code, driveFileId: d.id });
    } else {
      file.attId = up.id;
      log_('attached', { caseCode: code, attachmentId: up.id });
    }
  }
  st.name = name;
  st.seal = built.seal;
  st.sha = file.sha;
  st.size = file.size;
  if (file.attId) st.attId = file.attId;
  if (file.driveId) {
    st.driveId = file.driveId;
    st.driveUrl = file.driveUrl;
  }

  // 6. the case fields; the planned hash is saved first, so a lost answer is recognised as ours on the next run
  var hash = 'seal:' + built.seal + ' sha256:' + file.sha;
  st.pendingHash = hash;
  saveState_(id, st);
  writeCaseFields_(ctx, id, fresh, hash, doc.trigger);
  st.hash = hash;
  saveState_(id, st);
  log_('case fields written', { caseCode: code, hash: hash });

  // 7.–10. portal copy, audit row, RMM notification, done
  return finish_(ctx, id, fresh, st, Utilities.newBlob(file.bytes, 'application/pdf', name));
}

/** Final_Document_Hash is set. Our own hash (written, or planned before a PUT whose answer was lost): finish the portal
 *  copy, the audit row and the notification; nothing is rendered or written to the case again. Any other hash: the
 *  case is left alone. */
function filedAlready_(ctx, id, item, st) {
  var h = String(item.Final_Document_Hash);
  if (ownHash_(st, h)) {
    if (st.hash !== h) {
      st.hash = h;
      saveState_(id, st);
      log_('case fields found written', { caseCode: st.code, hash: h });
    }
    return finish_(ctx, id, item, st, null);
  }
  deleteState_(id);
  return res_(true, 'already filed', true);
}

function ownHash_(st, h) {
  return [st.hash, st.pendingHash, st.seal && st.sha ? 'seal:' + st.seal + ' sha256:' + st.sha : ''].some(function (x) { return !!x && x === h; });
}

/** Portal copy (once), audit row (once), RMM notification (once), done. Resumable: each step is recorded in FD_<id>
 *  before and after it runs. `blob`: the filed PDF when this run has it; else it is downloaded from Final_PDF (Drive). */
function finish_(ctx, id, item, st, blob) {
  var c = ctx.c;
  var code = st.code;
  var save = function () { saveState_(id, st); };
  // 7. the same bytes on the supplier portal
  if (!st.portalDone) portalStep_(ctx, id, item, st, blob, save);
  // 8. the audit row (its text names the portal copy, so it comes after it)
  if (!st.auditVerified) {
    if (!st.auditId) {
      if (!st.auditData) {
        st.auditData = auditData_(id, item, st); // fixed once: a resumed run writes the same row
        save();
      }
      var old = auditAll_(ctx).filter(function (r) { return r.Event_Key === st.auditData.Event_Key && r.Case_Item_Id === id; })[0];
      if (old) {
        st.auditId = String(old._id);
        st.auditFound = true;
      } else st.auditId = createAuditRow_(ctx, st.auditData);
      save(); // the new id is kept before its read-back, so a failed check never writes a second row
    }
    if (!st.auditFound) verifyAuditRow_(ctx, st.auditId, st.auditData);
    st.auditVerified = true;
    save();
    log_('audit row written', { caseCode: code, auditItemId: st.auditId, found: !!st.auditFound });
  }
  // 9. the RMM notification, through the Kissflow integration
  if (!st.notifiedAt && !st.notifySkipped) notifyStep_(ctx, id, st);
  if (st.driveId && !st.driveAlerted) {
    alertAdmin_(c, code, 'Kissflow refused the final PDF of ' + code + ' on the case, so it was saved in Google Drive (file id ' + st.driveId + ', not shared) and the case fields and the audit row name it. The RMM was not notified: the Kissflow integration mails the case\'s Final PDF, which is empty. Attach the file to the case by hand if Kissflow allows it later, or send it to the RMM.');
    st.driveAlerted = true;
  }
  deleteState_(id);
  log_('case done', { caseItemId: id, caseCode: code, where: st.driveId ? 'Drive' : 'Final_PDF', portal: st.portalAttId ? 'Final_PDF' : 'skipped', rmm: st.notifiedAt ? (st.notifyUnconfirmed ? 'unconfirmed' : 'notified') : 'not notified' });
  return res_(true, st.driveId ? 'filed in Drive (attach refused)' : 'filed');
}

/** 7. The filed bytes on the supplier portal: CIQP_Request_A00.Final_PDF of the case's request (Portal_Request_Item_Id,
 *  admin route with KF_PORTAL_APP_ID), only when that request names this case (App_Case_Item_Id): never another
 *  supplier's request. Once: st.portalAttId (attached, or an earlier run's file of that name with this seal adopted)
 *  or st.portalSkipped (no or another case's request, a refusal, a same-named file that is not this document, or the
 *  third failure); a skip tells ADMIN_EMAIL and the filing goes on (portalCopy repairs it later). Any other failure
 *  throws: an attempt, and the next run resumes here. */
function portalStep_(ctx, id, item, st, blob, save) {
  var c = ctx.c;
  var code = st.code;
  var skip = function (why) {
    st.portalSkipped = why;
    st.portalDone = true;
    save();
    log_('portal copy skipped', { caseCode: code, why: why });
    alertAdmin_(c, code, 'The final PDF of ' + code + ' is filed on the case, but not on the supplier portal: ' + why + '. The audit row and the RMM notification go ahead. To add it later, fix the cause, then run portalCopy with RUN_ONCE_CASE_ID ' + id + '.');
  };
  var reqId = String(item.Portal_Request_Item_Id || '').trim();
  if (!FD_.ID_RE.test(reqId)) return skip('the case names no portal request (Portal_Request_Item_Id)');
  var t = target_(c, FD_.REQUEST, reqId, c.portalApp);
  try {
    var req = getItem_(t);
    if (!req) return skip('its portal request ' + reqId + ' was not found');
    if (String(req.App_Case_Item_Id || '') !== id) return skip('the portal request ' + reqId + ' names another case (App_Case_Item_Id)');
    st.reqId = reqId;
    var have = sealedFile_(ctx, t, req, st.name, st.seal, st.portalAttId);
    if (!have) {
      var pdf = blob || filedBlob_(ctx, id, st);
      var up = attach_(ctx, t, req, st.name, pdf.getBytes());
      if (up.refused) return skip('Kissflow refused the file (HTTP ' + up.status + (up.error ? ' ' + up.error : '') + ')');
      have = up;
    }
    st.portalAttId = String(have.id);
  } catch (e) {
    if (isPause_(e) || isDeadline_(e)) throw e;
    if (isStop_(e)) return skip(errShort_(e));
    st.portalFails = (st.portalFails || 0) + 1;
    if (st.portalFails < FD_.MAX_ATTEMPTS) throw e;
    return skip('it failed ' + st.portalFails + ' times (last: ' + errShort_(e) + ')');
  }
  st.portalDone = true;
  save();
  log_('portal copy attached', { caseCode: code, requestItemId: reqId, attachmentId: st.portalAttId });
}

/** 9. One POST to RMM_WEBHOOK_URL, {caseItemId, caseCode, seal, idempotencyKey}: the app integration "CIQ Case - Send
 *  Final Release to RMM" finds the case and mails its Final PDF to the RMM role. Recorded before (notifyingAt) and after
 *  (notifiedAt): a run that ended in between never posts again (ADMIN_EMAIL is asked to check the integration's run
 *  history). A non-2xx answer or a fetch error is not a send: the mark is removed and the attempt counts. Skipped while
 *  MAIL_ENABLED is off, and when the PDF is in Drive (the case's Final_PDF, which the integration mails, is empty). */
function notifyStep_(ctx, id, st) {
  var c = ctx.c;
  var code = st.code;
  if (st.notifyingAt) {
    st.notifiedAt = st.notifyingAt;
    st.notifyUnconfirmed = true;
    saveState_(id, st);
    log_('rmm notification not confirmed', { caseCode: code });
    alertAdmin_(c, code, 'A run ended while the final document of ' + code + ' was being handed to the Kissflow integration "CIQ Case - Send Final Release to RMM". It is not sent again. Check that integration\'s Run history (Manage, Integrations); the PDF is on the case (Final PDF).');
    return;
  }
  if (!c.mailEnabled) st.notifySkipped = 'MAIL_ENABLED is off';
  else if (!st.attId) st.notifySkipped = 'the PDF is in Google Drive, not on the case';
  if (st.notifySkipped) {
    saveState_(id, st);
    return log_('rmm notification not sent', { caseCode: code, reason: st.notifySkipped });
  }
  if (timeLeft_() <= 0) throw deadlineError_('the RMM notification');
  st.notifyingAt = nowIso_();
  saveState_(id, st);
  var r;
  try {
    r = hookPost_(c.rmmHook, { caseItemId: id, caseCode: code, seal: st.seal, idempotencyKey: code + '-FD-RMM' });
    if (r.status < 200 || r.status >= 300 || r.html) throw kfError_('RMM webhook', r);
  } catch (e) {
    delete st.notifyingAt; // not sent: a pause, the time limit, a fetch error or a refusal
    saveState_(id, st);
    throw e;
  }
  st.notifiedAt = st.notifyingAt;
  delete st.notifyingAt;
  st.notifyStatus = r.status;
  saveState_(id, st);
  log_('rmm notified', { caseCode: code, status: r.status });
}

/** Whether a case gets its final document now (read from the case item; the event only says which case to read).
 *  RELEASED_AFTER is gone: only cases that exit the step send an event. A completed case with the final release
 *  qualifies at once (the drain already waited SETTLE_MINUTES after the event). Released but not completed: `wait`
 *  (Skip and complete may not have landed yet), until it was released, or queued (`since`), 15 min ago: then it
 *  qualifies as before (the app's mapper sees a released case as completed). No release: `wait` while not completed
 *  (e.g. a reopened release; the queue gives up after EVENT_WAIT_MIN), nothing to do when completed. Rejected,
 *  withdrawn and cancelled cases: nothing to do (a reactivated and released case sends a new event). */
function eligibility_(it, nowMs, since) {
  if (!it) return { ok: false, why: 'not found' };
  if (filled_(it.Final_Document_Hash)) return { ok: false, why: 'already filed' };
  var status = String(it._status || '');
  var completed = status === 'Completed';
  if (status === 'Rejected' || status === 'Withdrawn') return { ok: false, why: 'status ' + status };
  if (cancelled_(it)) return { ok: false, why: 'cancelled' };
  if (it.Final_Release_Confirm !== 'Confirmed' || !filled_(it.Final_Release_At)) return { ok: false, why: 'no final release', wait: !completed };
  var rel = Date.parse(it.Final_Release_At);
  if (!isFinite(rel)) return { ok: false, why: 'Final_Release_At unreadable', stop: true };
  if (completed) return { ok: true };
  var waited = Math.max((nowMs - rel) / 60000, since ? (nowMs - since) / 60000 : 0);
  if (waited >= FD_.SETTLE_FALLBACK_MIN) return { ok: true };
  return { ok: false, why: 'not completed yet', wait: true };
}

function cancelled_(it) {
  if (it.Case_Phase === 'Cancelled') return true;
  if (!filled_(it.Cancelled_At)) return false;
  var reactivated = Date.parse(it.Reactivated_At || '');
  return !(isFinite(reactivated) && reactivated > Date.parse(it.Cancelled_At));
}

// =============================================================================================== reads

/** The case's audit rows: Case_Item_Id is the case, or only its Case_Code is given. A row without Snapshot_JSON is
 *  read in full. The form list is read once per run. */
function auditRowsFor_(ctx, item) {
  var all = auditAll_(ctx);
  if (!all.some(function (r) { return 'Case_Item_Id' in r || 'Case_Code' in r; })) {
    // the list carries no case reference at all: read the rows in full (bounded)
    if (all.length > FD_.AUDIT_GET_CAP) throw new Error('the audit list rows carry no Case_Item_Id or Case_Code and there are ' + all.length + ' rows (cap ' + FD_.AUDIT_GET_CAP + '); see probe()');
    all = all.map(function (r) { return fullAudit_(ctx, r); });
    ctx.auditRows = all;
  }
  var code = String(item.Case_Code || '');
  return all
    .filter(function (r) { return r.Case_Item_Id === item._id || (!filled_(r.Case_Item_Id) && code && r.Case_Code === code); })
    .map(function (r) { return 'Snapshot_JSON' in r ? r : fullAudit_(ctx, r); });
}

function auditAll_(ctx) {
  if (!ctx.auditRows) ctx.auditRows = listForm_(FD_.AUDIT, FD_.PAGE_SIZE);
  return ctx.auditRows;
}

function fullAudit_(ctx, row) {
  if (!ctx.auditFull[row._id]) ctx.auditFull[row._id] = getForm_(FD_.AUDIT, row._id) || row;
  return ctx.auditFull[row._id];
}

/** The item an audit row names in a flow (Ref_Flow_Id, else the row's category). */
function namedObject_(row, flow) {
  if (row.Ref_Flow_Id === flow && filled_(row.Ref_Item_Id || row.Object_Item_Id)) return String(row.Ref_Item_Id || row.Object_Item_Id);
  if (!filled_(row.Object_Item_Id)) return '';
  if (flow === FD_.OP && row.Event_Category === 'Open point') return String(row.Object_Item_Id);
  if (flow === FD_.REVIEW && row.Event_Category === 'Review' && /^review\./.test(String(row.Action_Code || ''))) return String(row.Object_Item_Id);
  return '';
}

/** The case's review or open-point items: the q search, plus every item its history names, each read in full and kept
 *  only when its Case_Item_Id is the case. No review found for a case past completeness: the full list. At most
 *  ITEM_GET_CAP items are read for one case (a list without Case_Item_Id would otherwise mean one GET per review). */
function caseItems_(ctx, flow, item, audit) {
  var id = item._id;
  var ids = [];
  var seen = {};
  var add = function (x) {
    if (x && x !== id && !seen[x]) {
      seen[x] = true;
      ids.push(x);
    }
  };
  listProcess_(flow, id).forEach(function (r) { if (!('Case_Item_Id' in r) || r.Case_Item_Id === id) add(r._id); });
  audit.forEach(function (r) { add(namedObject_(r, flow)); });
  if (!ids.length && flow === FD_.REVIEW && (filled_(item.Completeness_At) || filled_(item.Completeness_Confirm))) {
    var rows = listProcess_(flow);
    var withRef = rows.some(function (r) { return 'Case_Item_Id' in r; });
    rows.forEach(function (r) { if (!withRef || r.Case_Item_Id === id) add(r._id); });
  }
  if (ids.length > FD_.ITEM_GET_CAP) throw new Error(ids.length + ' ' + flow + ' items to read for one case (cap ' + FD_.ITEM_GET_CAP + '): the list or the q search does not narrow them to the case; see probe()');
  var out = [];
  ids.forEach(function (x) {
    var it = getProcess_(flow, x);
    if (it && it.Case_Item_Id === id) out.push(it);
  });
  return out;
}

/** The case's CIQ Supplier row, read in full (form lists omit the Contacts table). */
function supplierRowsFor_(ctx, item) {
  var code = String(item.Supplier_Code || '');
  if (!code) return [];
  if (!ctx.supplierList) ctx.supplierList = listForm_(FD_.SUPPLIER, 200);
  var row = ctx.supplierList.filter(function (r) { return r.Supplier_Code === code; })[0];
  if (!row) return [];
  var full = getForm_(FD_.SUPPLIER, row._id);
  if (!full) throw new Error('the supplier row ' + row._id + ' could not be read in full');
  return [full];
}

/** Every CIQ Config Version row in full; 30 min in CacheService (never logged: SET:current holds webhook URLs). */
function configRows_(ctx) {
  if (ctx.config) return ctx.config;
  var cached = cacheGet_('FD_CONFIG');
  if (cached) return (ctx.config = cached);
  ctx.config = listForm_(FD_.CONFIG, 200).map(function (r) {
    var full = getForm_(FD_.CONFIG, r._id);
    if (!full) throw new Error('the configuration row ' + r._id + ' could not be read in full');
    return full;
  });
  cachePut_('FD_CONFIG', ctx.config);
  return ctx.config;
}

function attachments_(it, field) {
  var v = it && it[field || FD_.PDF_FIELD];
  return Array.isArray(v) ? v : [];
}

/** Why the bundle gave no document: the app does not see the case as completed, or its builder failed (its warning). */
function notBuilt_(built) {
  if (built.phase !== 'completed') return 'the app does not see this case as completed (phase ' + (built.phase || 'unknown') + ')';
  var w = (built.warnings || []).filter(function (x) { return String(x).indexOf('the final document could not be computed') >= 0; })[0];
  return 'the app could not build the final document' + (w ? ': ' + String(w).slice(0, 200) : '');
}

// =============================================================================================== writes

/** An attachment field of one process item, on the admin routes: {flow, app, id, field}. */
function target_(c, flow, id, app) { return { flow: flow, app: app || c.app, id: id, field: FD_.PDF_FIELD }; }
function getItem_(t) { return getProcess_(t.flow, t.id, t.app); }

/** POST the PDF to the target's field and read it back. 408/409/423 are tried again (after a read: the file may have
 *  landed). Any other 4xx (not 429) is a refusal: { refused, status, error }. */
function attach_(ctx, t, before, name, bytes) {
  var had = {};
  attachments_(before, t.field).forEach(function (a) { if (a) had[a.id] = true; });
  var added = function (list) { return list.filter(function (a) { return a && !had[a.id] && a.name === name; })[0] || null; };
  var r;
  for (var i = 0; ; i++) {
    r = kfUpload_(attachPath_(ctx.c, t), bytes, name, 'application/pdf');
    if (FD_.RETRY_STATUSES.indexOf(r.status) < 0 || i >= FD_.ATTACH_RETRIES) break;
    log_('attach busy, tried again', { flow: t.flow, status: r.status, attempt: i + 2 });
    Utilities.sleep(FD_.RETRY_WAIT_MS);
    var landed = added(attachments_(getItem_(t), t.field));
    if (landed) return { id: String(landed.id) };
  }
  if (r.status >= 400 && r.status < 500 && FD_.RETRY_STATUSES.indexOf(r.status) < 0) return { refused: true, status: r.status, error: errBody_(r.body) };
  if (r.status < 200 || r.status >= 300) throw kfError_('attach to ' + t.flow, r);
  var list = (r.body && Array.isArray(r.body[t.field])) ? r.body[t.field] : [];
  var a = added(list) || list.filter(function (x) { return x && !had[x.id]; })[0];
  if (!a || !a.id) throw new Error('attach to ' + t.flow + ': the answer lists no new file');
  var back = getItem_(t);
  if (!attachments_(back, t.field).some(function (x) { return x && x.id === a.id; })) throw new Error('attach not verified: ' + a.id + ' is not on ' + t.flow + '.' + t.field);
  return { id: String(a.id) };
}

/** A file named `name` already on the target's field: `knownId` (this state's own upload, same render) is taken as it
 *  is; else up to 3 are downloaded and one is adopted only when its PDF names this document's seal. A file of that name
 *  without it (a probe upload, an older render) is a stop: it is never filed, hashed or copied over. Returns {id, bytes}
 *  (bytes null: knownId, this render) or null when there is no such file. */
function sealedFile_(ctx, t, item, name, seal, knownId) {
  var same = attachments_(item, t.field).filter(function (a) { return a && a.name === name; });
  if (!same.length) return null;
  var mine = knownId ? same.filter(function (a) { return a.id === knownId; })[0] : null;
  if (mine) return { id: String(mine.id), bytes: null };
  var seen = [];
  for (var i = 0; i < same.length && i < 3; i++) {
    var b = downloadAttachment_(ctx, t, same[i].id);
    var s = pdfSeal_(b);
    if (s === seal) return { id: String(same[i].id), bytes: b };
    seen.push(same[i].id + ' (seal ' + (s || 'none') + ')');
  }
  throw stopError_(t.flow + '.' + t.field + ' already holds ' + same.length + ' file(s) named ' + name + ' that are not this document (seal ' + seal + '): ' + seen.join(', ') + '. Remove them in Kissflow, then run runOnce.');
}

/** Download an attached file: admin GET → 302 → the signed URL, fetched with the key only on KF_DOMAIN and never
 *  through a further redirect (S-2: redirect "manual" on both hops). */
function downloadAttachment_(ctx, t, attId) {
  var c = ctx.c;
  var r = kfFetch_('GET', '/process/2/' + c.acc + '/admin/' + t.flow + '/' + t.id + '/' + t.field + '/attachment/' + attId + '?' + appQ_(c, t.app), { followRedirects: false });
  if (r.status < 300 || r.status >= 400 || !r.location) throw kfError_('download', r);
  var path;
  if (/^\//.test(r.location)) path = r.location;
  else {
    var m = /^https:\/\/([^\/?#]+)(\/[^#]*)?$/.exec(r.location);
    if (!m || m[1].toLowerCase() !== c.domain.toLowerCase()) throw new Error('the signed download is not on KF_DOMAIN; it is not fetched');
    path = m[2] || '/';
  }
  var f = kfFetch_('GET', path, { binary: true, followRedirects: false });
  if (f.status !== 200 || !f.bytes) throw kfError_('signed download', f);
  return f.bytes;
}

/** PUT Final_Document_Hash, Final_Document_At and (when empty) Completion_Trigger; read back and compare. */
function writeCaseFields_(ctx, id, fresh, hash, trigger) {
  var at = nowIso_();
  var body = { Final_Document_Hash: hash, Final_Document_At: at };
  if (!filled_(fresh.Completion_Trigger) && trigger) body.Completion_Trigger = trigger;
  var r = kfFetch_('PUT', procItemPath_(ctx.c, FD_.CASE, id), { body: body });
  if (r.status < 200 || r.status >= 300) throw kfError_('case fields PUT', r);
  var back = getProcess_(FD_.CASE, id);
  var bad = [];
  if (!back || back.Final_Document_Hash !== hash) bad.push('Final_Document_Hash');
  if (!back || Date.parse(back.Final_Document_At) !== Date.parse(at)) bad.push('Final_Document_At');
  if (body.Completion_Trigger && (!back || back.Completion_Trigger !== body.Completion_Trigger)) bad.push('Completion_Trigger');
  if (bad.length) throw new Error('case fields not verified: ' + bad.join(', '));
}

/** The 'Final PDF' CIQ Audit Event row's fields. Event_Key '<Case_Code>-FD-PDF' makes it findable again. Written
 *  after the portal copy and before the RMM notification, so Notify_Recipient and Notify_Channel stay empty: the
 *  integration resolves the RMM role's members, and its Run history is the mail's record. */
function auditData_(id, item, st) {
  var at = nowIso_();
  var portal = st.portalAttId ? ' and on the supplier portal' : '';
  var where = st.attId ? 'filed on the case' + portal : 'saved in Google Drive (Kissflow refused the file on the case)' + (portal ? ', and filed on the supplier portal' : '');
  return {
    Event_Key: st.code + '-FD-PDF',
    Case_Code: st.code,
    Cycle_No: Number(item.Cycle_No) || 1,
    Case_Item_Id: id,
    Event_At: at,
    Event_Category: 'Final PDF',
    Action_Code: 'final.pdf',
    Actor_Side: 'System',
    Actor_Name: FD_.SERVICE,
    Object_Kind: 'Final document',
    Object_Key: st.code + '-FD',
    Object_Item_Id: id,
    Object_State: 'Filed',
    New_Value_Text: st.name + ' · ' + st.size + ' bytes · SHA-256 ' + st.sha + ' · document seal ' + st.seal + (st.attId ? ' · Final_PDF ' + st.attId : ' · Drive ' + st.driveUrl) + (st.portalAttId ? ' · portal request ' + st.reqId + ' Final_PDF ' + st.portalAttId : ''),
    Ref_Flow_Id: FD_.CASE,
    Ref_Item_Id: id,
    Snapshot_JSON: JSON.stringify({ audit: [{ at: at, by: 'system', action: 'Generated final document', detail: 'Final document generated automatically, sealed and ' + where + ' (document seal ' + st.seal + '). It cannot be changed.' }] })
  };
}

/** Create + submit the row; returns its new id. */
function createAuditRow_(ctx, data) {
  var c = ctx.c;
  var draft = kfJson_('POST', '/form/2/' + c.acc + '/' + FD_.AUDIT + '?' + appQ_(c), data, 'audit row create');
  if (!draft || !draft._id) throw new Error('audit row create: no draft id');
  var sub = kfJson_('POST', '/form/2/' + c.acc + '/' + FD_.AUDIT + '/' + draft._id + '/submit?' + appQ_(c), {}, 'audit row submit');
  var newId = sub && sub._id;
  if (!newId || /^draft_/.test(newId)) throw new Error('audit row submit: no new id');
  return String(newId);
}

/** Read the row back and compare; one re-apply of the fields that differ. */
function verifyAuditRow_(ctx, rowId, data) {
  var missing = differs_(data, getForm_(FD_.AUDIT, rowId));
  if (!missing.length) return;
  var patch = {};
  missing.forEach(function (k) { patch[k] = data[k]; });
  kfJson_('POST', formItemPath_(ctx.c, FD_.AUDIT, rowId), patch, 'audit row update');
  missing = differs_(data, getForm_(FD_.AUDIT, rowId));
  if (missing.length) throw new Error('audit row ' + rowId + ' not verified: ' + missing.join(', '));
}

/** Field names whose read-back value differs from what was written. */
function differs_(want, got) {
  var norm = function (v) { return String(v === undefined || v === null ? '' : v).replace(/\r\n/g, '\n').trim(); };
  return Object.keys(want).filter(function (k) {
    if (!got) return true;
    var w = want[k];
    var g = got[k];
    if (k === 'Event_At') return Date.parse(g) !== Date.parse(w);
    if (typeof w === 'number') return Number(g) !== w;
    if (k === 'Snapshot_JSON') {
      try {
        return JSON.stringify(JSON.parse(g)) !== JSON.stringify(JSON.parse(w));
      } catch (e) {
        return true;
      }
    }
    return norm(g) !== norm(w);
  });
}

/** Attach refused and DRIVE_FOLDER_ID set: the PDF goes to that folder. A file there is reused only when its
 *  description names this case item and its PDF this document's seal (never another case's or cycle's file of the
 *  same name). Never shared: the RMM recipients are a Kissflow role now, which the script does not know (ADMIN_EMAIL
 *  is told to pass it on). */
function driveFallback_(ctx, id, name, bytes, seal, st) {
  var c = ctx.c;
  var tag = 'CIQ final document of case item ' + id;
  var folder = DriveApp.getFolderById(c.driveFolder);
  var found = folder.getFilesByName(name);
  var f = null;
  while (!f && found.hasNext()) {
    var x = found.next();
    var desc = String(x.getDescription() || '');
    if ((desc === tag || desc.indexOf(tag + ' ·') === 0) && (x.getId() === st.driveId || pdfSeal_(x.getBlob().getBytes()) === seal)) f = x;
  }
  if (!f) {
    f = folder.createFile(Utilities.newBlob(bytes, 'application/pdf', name));
    f.setDescription(tag + ' · document seal ' + seal);
  }
  return { id: f.getId(), url: f.getUrl(), bytes: f.getBlob().getBytes() };
}

/** The document seal a PDF of this service names in its Subject ('document seal <16 hex>'), or ''. */
function pdfSeal_(bytes) {
  var text = '';
  for (var i = 0; i < bytes.length; i += 4096) text += String.fromCharCode.apply(null, bytes.slice(i, i + 4096).map(function (b) { return (b + 256) % 256; }));
  var m = /\/Subject \(document seal ([0-9a-f]{16})\)/.exec(text);
  return m ? m[1] : '';
}

// =============================================================================================== files and alerts

/** The filed PDF again (a resumed portal copy): from the case's Final_PDF, else from Drive. */
function filedBlob_(ctx, id, st) {
  if (st.attId) return Utilities.newBlob(downloadAttachment_(ctx, target_(ctx.c, FD_.CASE, id), st.attId), 'application/pdf', st.name);
  if (st.driveId) return DriveApp.getFileById(st.driveId).getBlob().setName(st.name);
  throw new Error('no filed PDF to copy');
}

/** One operational mail to ADMIN_EMAIL (case code and error text; never keys or URLs). */
function alertAdmin_(c, code, text) {
  if (!isEmail_(c.admin)) {
    log_('admin alert not sent: ADMIN_EMAIL is not set', { caseCode: code });
    return false;
  }
  MailApp.sendEmail({ to: c.admin, subject: 'CIQ final document: ' + code + ' needs attention', body: redact_(text) + '\n\nDetails: the Apps Script executions log, lines starting with [CIQ-FD].', name: c.mailFromName });
  log_('admin alert sent', { caseCode: code });
  return true;
}

// =============================================================================================== HTTP

/** The one HTTP function under kfFetch_ and hookPost_. opts: body (JSON), payload (multipart object), headers,
 *  followRedirects, binary. Paces the calls (one clock for both: same host), pauses the script on a 429 or an HTML
 *  answer (Cloudflare challenge), refuses a call past the run's time limit, and never logs headers, bodies or URLs
 *  (`route` is what a log line may name). */
function fetch_(method, url, route, opts) {
  opts = opts || {};
  var c = cfg_();
  if (pauseUntil_() > now_()) throw pauseError_();
  var wait = LAST_CALL_AT_ + c.paceMs - now_();
  if (timeLeft_() - Math.max(0, wait) <= 0) throw deadlineError_('a Kissflow call');
  if (LAST_CALL_AT_ && wait > 0) Utilities.sleep(wait);
  LAST_CALL_AT_ = now_();
  CALLS_++;
  var params = { method: String(method).toLowerCase(), muteHttpExceptions: true, followRedirects: opts.followRedirects !== false, headers: opts.headers || {} };
  if (opts.payload !== undefined) params.payload = opts.payload;
  else if (opts.body !== undefined) {
    params.contentType = 'application/json';
    params.payload = JSON.stringify(opts.body);
  }
  var res;
  try {
    res = UrlFetchApp.fetch(url, params);
  } catch (e) {
    throw new Error('network error on ' + method + ' ' + route + ': ' + errShort_(e));
  }
  var status = res.getResponseCode();
  var headers = res.getHeaders() || {};
  var type = String(header_(headers, 'Content-Type') || '');
  if (status === 429) pauseNow_('429', method, route);
  if (status >= 300 && status < 400) return { status: status, location: String(header_(headers, 'Location') || '') };
  if (opts.binary && status === 200 && !/text\/html/i.test(type)) return { status: status, bytes: res.getBlob().getBytes() };
  var text = res.getContentText();
  var html = /text\/html/i.test(type) || /^\s*</.test(text);
  if (html && !opts.hook) pauseNow_('html', method, route);
  if (html) return { status: status, body: '(an HTML page)', html: true };
  var body = null;
  if (text !== '') {
    try {
      body = JSON.parse(text);
    } catch (e) {
      body = text;
    }
  }
  return { status: status, body: body };
}

/** A Kissflow REST call on KF_DOMAIN with the access key. */
function kfFetch_(method, path, opts) {
  var c = cfg_();
  opts = opts || {};
  opts.headers = { 'X-Access-Key-Id': c.keyId, 'X-Access-Key-Secret': c.keySecret };
  return fetch_(method, 'https://' + c.domain + path, route_(path), opts);
}

/** The RMM webhook POST: JSON, no access key (a webhook needs none), no redirect followed. requireCfg_ has checked that
 *  the URL is a webhook of KF_DOMAIN and KF_ACCOUNT_ID. */
function hookPost_(url, body) {
  return fetch_('POST', url, 'webhook RMM_WEBHOOK_URL', { body: body, followRedirects: false, hook: true });
}

/** RMM_WEBHOOK_URL's parts {host, acc, token}, or null when it is not exactly https://<host>/integration/2/<acc>/webhook/<token>. */
function hookParts_(c) {
  var m = FD_.HOOK_RE.exec(String(c.rmmHook || ''));
  return m ? { host: m[1].toLowerCase(), acc: m[2], token: m[3] } : null;
}

/** Multipart upload: the file as part "file" (UrlFetchApp builds multipart/form-data from a payload object). */
function kfUpload_(path, bytes, name, type) {
  return kfFetch_('POST', path, { payload: { file: Utilities.newBlob(bytes, type, name) } });
}

function kfJson_(method, path, body, what) {
  var r = kfFetch_(method, path, body === undefined ? {} : { body: body });
  if (r.status < 200 || r.status >= 300) throw kfError_(what, r);
  if (typeof r.body === 'string') throw new Error(what + ': the answer is not JSON');
  return r.body;
}

/** An admin process item; `app`: the container (default KF_APP_ID; the portal request: KF_PORTAL_APP_ID). */
function getProcess_(flow, id, app) {
  var r = kfFetch_('GET', procItemPath_(cfg_(), flow, id, app));
  if (r.status === 404) return null;
  if (r.status < 200 || r.status >= 300 || !r.body || typeof r.body !== 'object') throw kfError_('read ' + flow, r);
  return r.body;
}

function getForm_(form, id) {
  var r = kfFetch_('GET', formItemPath_(cfg_(), form, id));
  if (r.status === 404) return null;
  if (r.status < 200 || r.status >= 300 || !r.body || typeof r.body !== 'object') throw kfError_('read ' + form, r);
  return r.body;
}

/** Every row of an admin process list (rows in Data); with `query`, the q search. */
function listProcess_(flow, query) {
  var c = cfg_();
  var out = [];
  for (var page = 1; page <= FD_.MAX_PAGES; page++) {
    var body = kfJson_('GET', '/process/2/' + c.acc + '/admin/' + flow + '/item?' + (query ? 'q=' + encodeURIComponent(query) + '&' : '') + 'page_number=' + page + '&page_size=' + FD_.PAGE_SIZE + '&' + appQ_(c), undefined, 'list ' + flow);
    var rows = body && Array.isArray(body.Data) ? body.Data : [];
    out = out.concat(rows);
    if (rows.length < FD_.PAGE_SIZE) break;
  }
  return out;
}

/** Every row of a form list (POST …/list, body {}, rows in Data; child tables are not in list rows). */
function listForm_(form, size) {
  var c = cfg_();
  var out = [];
  for (var page = 1; page <= FD_.MAX_PAGES; page++) {
    var body = kfJson_('POST', '/form/2/' + c.acc + '/' + form + '/list?page_number=' + page + '&page_size=' + size + '&' + appQ_(c), {}, 'list ' + form);
    var rows = body && Array.isArray(body.Data) ? body.Data : [];
    out = out.concat(rows);
    if (rows.length < size) break;
  }
  return out;
}

function appQ_(c, app) { return '_application_id=' + encodeURIComponent(app || c.app); }
function procItemPath_(c, flow, id, app) { return '/process/2/' + c.acc + '/admin/' + flow + '/' + id + '?' + appQ_(c, app); }
function formItemPath_(c, form, id) { return '/form/2/' + c.acc + '/' + form + '/' + id + '?' + appQ_(c); }
function attachPath_(c, t) { return '/process/2/' + c.acc + '/admin/' + t.flow + '/' + t.id + '/' + t.field + '/attachment?' + appQ_(c, t.app); }
function route_(path) {
  var acc = cfg_().acc;
  var r = String(path).replace(/\?.*$/, '');
  return acc ? r.split(acc).join('{acc}') : r;
}

function header_(headers, name) {
  var want = name.toLowerCase();
  for (var k in headers) if (k.toLowerCase() === want) return headers[k];
  return '';
}

function kfError_(what, r) {
  var e = new Error(what + ' failed: HTTP ' + r.status + (r.body ? ' ' + errBody_(r.body) : ''));
  e.status = r.status;
  return e;
}

/** A Kissflow error body, short and redacted ({error_code, en_message|message}). */
function errBody_(body) {
  if (!body) return '';
  if (typeof body === 'string') return redact_(body).slice(0, 160);
  var code = body.error_code || body.code || '';
  var msg = body.en_message || body.message || '';
  return redact_((code ? code + ' ' : '') + msg).slice(0, 200);
}

// =============================================================================================== pause, time, pacing, state

function pauseUntil_() { return Number(props_().getProperty('PAUSE_UNTIL') || 0); }
function pauseIso_() { return new Date(pauseUntil_()).toISOString(); }

function pausedNow_() {
  if (pauseUntil_() > now_()) {
    log_('paused', { until: pauseIso_() });
    return true;
  }
  return false;
}

function pauseNow_(why, method, route) {
  var prev = pauseUntil_();
  var until = now_() + FD_.PAUSE_MS;
  if (prev && now_() - prev < 30 * 60000) alertOnce_('PAUSE', cfg_(), 'the pause', 'The final-document service was paused again (' + why + ' on ' + method + ' ' + route + ') less than 30 min after its last pause. Queued cases wait; check Kissflow and the Executions log.');
  props_().setProperty('PAUSE_UNTIL', String(until));
  log_('pause 20 min', { why: why, call: method + ' ' + route, until: new Date(until).toISOString() });
  throw pauseError_();
}

function pauseError_() {
  var e = new Error('paused (429 or a challenge page) until ' + pauseIso_());
  e.name = 'CiqPause';
  return e;
}

function isPause_(e) { return !!e && e.name === 'CiqPause'; }

/** Milliseconds this execution may still call Kissflow (RUN_LIMIT_S after begin_). */
function timeLeft_() { return cfg_().runLimitMs - (now_() - RUN_STARTED_); }

/** Stops before `what` when less than WRITE_BUDGET_MS is left (the next run resumes; not an attempt). */
function budget_(what) {
  if (timeLeft_() < FD_.WRITE_BUDGET_MS) throw deadlineError_(what);
}

function deadlineError_(what) {
  var e = new Error('the run is near its time limit: ' + what + ' is left for the next run');
  e.name = 'CiqDeadline';
  return e;
}

function isDeadline_(e) { return !!e && e.name === 'CiqDeadline'; }

/** A condition a retry cannot fix (a person has to look): alerts at once, new events skip the case. */
function stopError_(text) {
  var e = new Error(text);
  e.name = 'CiqStop';
  return e;
}

function isStop_(e) { return !!e && e.name === 'CiqStop'; }

function loadState_(id) {
  var v = props_().getProperty('FD_' + id);
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch (e) {
    return null;
  }
}
function saveState_(id, st) { props_().setProperty('FD_' + id, JSON.stringify(st)); }
function deleteState_(id) { props_().deleteProperty('FD_' + id); }

function cacheGet_(key) {
  try {
    var cache = CacheService.getScriptCache();
    var n = Number(cache.get(key + '_n') || 0);
    if (!n) return null;
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(key + '_' + i);
    var parts = cache.getAll(keys);
    var text = '';
    for (var j = 0; j < n; j++) {
      if (typeof parts[key + '_' + j] !== 'string') return null;
      text += parts[key + '_' + j];
    }
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function cachePut_(key, value) {
  try {
    var text = JSON.stringify(value);
    var map = {};
    var n = Math.ceil(text.length / FD_.CACHE_CHUNK);
    for (var i = 0; i < n; i++) map[key + '_' + i] = text.slice(i * FD_.CACHE_CHUNK, (i + 1) * FD_.CACHE_CHUNK);
    map[key + '_n'] = String(n);
    CacheService.getScriptCache().putAll(map, FD_.CACHE_TTL_S);
  } catch (e) {
    log_('cache not written', { key: key, error: errShort_(e) });
  }
}

// =============================================================================================== configuration

function props_() { return PropertiesService.getScriptProperties(); }

function begin_() {
  CFG_ = null;
  SECRETS_ = [];
  LAST_CALL_AT_ = 0;
  CALLS_ = 0;
  RUN_STARTED_ = now_();
  cfg_();
}

function ctx_() { return { c: cfg_(), auditRows: null, auditFull: {}, supplierList: null, config: null }; }

function cfg_() {
  if (CFG_) return CFG_;
  var p = props_().getProperties();
  var g = function (k, d) { return filled_(p[k]) ? String(p[k]).trim() : d; };
  var int = function (k, d, lo, hi) {
    var n = parseInt(g(k, String(d)), 10);
    return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  CFG_ = {
    domain: g('KF_DOMAIN', ''),
    acc: g('KF_ACCOUNT_ID', ''),
    app: g('KF_APP_ID', 'CIQ_Digital_A00'),
    portalApp: g('KF_PORTAL_APP_ID', 'CIQ_Supplier_Portal_A00'),
    keyId: g('KF_ACCESS_KEY_ID', ''),
    keySecret: g('KF_ACCESS_KEY_SECRET', ''),
    timeZone: g('TIME_ZONE', Session.getScriptTimeZone() || 'Europe/Berlin'),
    // the RMM mail: sent by the Kissflow integration behind RMM_WEBHOOK_URL; off: no POST
    mailEnabled: !/^(false|no|off|0)$/i.test(g('MAIL_ENABLED', 'true')),
    rmmHook: g('RMM_WEBHOOK_URL', ''),
    mailFromName: g('MAIL_FROM_NAME', FD_.SERVICE),
    admin: g('ADMIN_EMAIL', ''),
    driveFolder: g('DRIVE_FOLDER_ID', ''),
    token: g('DOPOST_TOKEN', ''),
    maxCases: int('MAX_CASES_PER_RUN', 3, 1, 10),
    settleMin: int('SETTLE_MINUTES', 2, 1, 30), // the first drain after an event
    paceMs: int('PACE_MS', FD_.PACE_MS, FD_.PACE_MS, 60000),
    // node harness only (test/live.mjs, 8 s pacing): Apps Script keeps the default
    runLimitMs: int('RUN_LIMIT_S', FD_.RUN_LIMIT_S, 60, 3600) * 1000
  };
  var hook = hookParts_(CFG_);
  SECRETS_ = [CFG_.keyId, CFG_.keySecret, CFG_.token, CFG_.rmmHook, hook ? hook.token : ''].filter(function (s) { return s && s.length >= 4; });
  return CFG_;
}

function requireCfg_(c, forProbe) {
  var missing = [];
  if (!c.domain) missing.push('KF_DOMAIN');
  if (!c.acc) missing.push('KF_ACCOUNT_ID');
  if (!c.keyId) missing.push('KF_ACCESS_KEY_ID');
  if (!c.keySecret) missing.push('KF_ACCESS_KEY_SECRET');
  if (!forProbe && c.mailEnabled && !c.rmmHook) missing.push('RMM_WEBHOOK_URL (or MAIL_ENABLED false)');
  if (missing.length) throw new Error('Script Properties missing: ' + missing.join(', '));
  if (!/^[a-z0-9.-]+$/i.test(c.domain)) throw new Error('KF_DOMAIN must be a bare host name (no https://, no slash)');
  if (!/^[A-Za-z0-9_-]+$/.test(c.acc)) throw new Error('KF_ACCOUNT_ID looks wrong');
  if (!/^[A-Za-z0-9_]+$/.test(c.app) || !/^[A-Za-z0-9_]+$/.test(c.portalApp)) throw new Error('KF_APP_ID or KF_PORTAL_APP_ID looks wrong');
  if (c.mailEnabled && !forProbe) {
    var h = hookParts_(c);
    // never the URL in the message
    if (!h || h.host !== c.domain.toLowerCase() || h.acc !== c.acc) throw new Error('RMM_WEBHOOK_URL must be the webhook URL of the integration "CIQ Case - Send Final Release to RMM": the host KF_DOMAIN, the path /integration/2/<KF_ACCOUNT_ID>/webhook/<token>, nothing else (or set MAIL_ENABLED to false).');
  }
}

// =============================================================================================== small helpers

function now_() { return Date.now(); }
function nowIso_() { return new Date(now_()).toISOString().replace(/\.\d{3}Z$/, 'Z'); }
function filled_(v) { return v !== undefined && v !== null && String(v).trim() !== ''; }
function isEmail_(v) { return typeof v === 'string' && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v.trim()); }
/** next: what the queue does with the case ('done', 'drop', 'wait', 'retry'); default done when ok, else drop. */
function res_(ok, status, skipped, next) { return { ok: ok, status: status, skipped: !!skipped, next: next || (ok ? 'done' : 'drop') }; }

function keysOf_(rows) {
  var seen = {};
  rows.forEach(function (r) { Object.keys(r || {}).forEach(function (k) { seen[k] = true; }); });
  return Object.keys(seen).sort();
}

function sameText_(a, b) {
  a = String(a);
  b = String(b);
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function sha256Hex_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

/** Dates in the PDF: '9 Oct 2026, 14:05 CEST' in TIME_ZONE (a date without time: '9 Oct 2026'). */
function dateFormatter_(tz) {
  return function (iso) {
    var s = String(iso);
    var t = Date.parse(s);
    if (!isFinite(t)) return s;
    var dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
    return Utilities.formatDate(new Date(t), dateOnly ? 'UTC' : tz, dateOnly ? 'd MMM yyyy' : 'd MMM yyyy, HH:mm z');
  };
}

function errShort_(e) { return redact_(e && e.message ? e.message : String(e)).slice(0, 300); }

/** Removes keys, the token, e-mail addresses and URLs from a text. */
function redact_(text) {
  var s = String(text);
  SECRETS_.forEach(function (v) { s = s.split(v).join('[secret]'); });
  return s.replace(/https?:\/\/[^\s"'<>]+/g, '[url]').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-mail]');
}

function log_(step, info) {
  Logger.log(redact_('[CIQ-FD] ' + step + (info ? ' ' + JSON.stringify(info) : '')));
}
