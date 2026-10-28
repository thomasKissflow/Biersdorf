// CIQ final document service (Google Apps Script, V8). Kissflow-internal.
// Makes the final PDF of each completed CIQ case once (REQ-PROC-046, AS-12; spec: final-pdf README):
//   read the case, its reviews, open points, audit rows, supplier and configuration (admin REST routes) →
//   build the document with the app's own code (Bundle.gs, CIQFinal) and check its seal → render the PDF →
//   attach it to CIQ_Case_A00.Final_PDF → write Final_Document_Hash / Final_Document_At (and Completion_Trigger when
//   empty) → mail the RMM owner the PDF → log one 'Final PDF' CIQ Audit Event row.
// Never regenerates: a case with Final_Document_Hash set is left alone, unless the hash is the one this service planned
// for it (then only the missing mail or audit row is done). Never submits a step, never reads the portal, RMES records
// or internal notes. All HTTP goes through kfFetch_ (the file upload through kfUpload_). Logs carry ids, codes, counts
// and statuses only: no personal data beyond ids, never a key, token or URL.
// Every step of a case is recorded in FD_<caseItemId> before or right after it runs, so a lost answer, a failure or the
// run's time limit resumes where it stopped, with no second upload, mail or audit row.
//
// Entry points: probe(), runOnce(caseItemId), tick() (time trigger), installTrigger(), removeTriggers(), doPost(e).
// Script Properties: README.md "Script Properties". Managed by the script: PAUSE_UNTIL, DONE_IDS, ENDED_IDS, OLD_IDS,
// OLD_IDS_FOR, RR_CURSOR and FD_<caseItemId> (the resumable state of one case); installTrigger sets RELEASED_AFTER
// when it is empty.

var FD_ = {
  CASE: 'CIQ_Case_A00',
  REVIEW: 'CIQ_Review_A00',
  OP: 'CIQ_Open_Point_A00',
  AUDIT: 'CIQ_Audit_Event_A00',
  SUPPLIER: 'CIQ_Supplier_A00',
  CONFIG: 'CIQ_Config_Version_A00',
  PDF_FIELD: 'Final_PDF',
  SERVICE: 'CIQ final document service',
  PACE_MS: 1200, // shared-key rule: at least 1.2 s between Kissflow calls
  PAUSE_MS: 20 * 60 * 1000, // a 429 or an HTML (Cloudflare) answer stops the script for 20 min
  RUN_LIMIT_S: 300, // no Kissflow call and no mail after 5 min (Apps Script stops a run at 6 min); the next run resumes
  WRITE_BUDGET_MS: 2 * 60 * 1000, // a new case, and a case's first write, need 2 min left (so: none after 3 min)
  SETTLE_FALLBACK_MIN: 15, // a release older than this counts as settled even if the case did not complete
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
  MAX_IDS: 600, // DONE_IDS / ENDED_IDS / OLD_IDS: ~13 characters per id, under the 9 KB Script Property value limit
  ID_RE: /^[A-Za-z0-9_-]{6,40}$/
};

var PROPS_SHOWN_ = ['KF_DOMAIN', 'KF_ACCOUNT_ID', 'KF_APP_ID', 'KF_ACCESS_KEY_ID', 'KF_ACCESS_KEY_SECRET', 'TIME_ZONE', 'MAIL_ENABLED', 'MAIL_FROM_NAME', 'FALLBACK_RMM_EMAIL', 'ADMIN_EMAIL', 'DRIVE_FOLDER_ID', 'DOPOST_TOKEN', 'MAX_CASES_PER_TICK', 'MAX_GETS_PER_TICK', 'SETTLE_MINUTES', 'RELEASED_AFTER', 'PACE_MS', 'TICK_MINUTES'];

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
  log_('probe: Script Properties', {
    set: PROPS_SHOWN_.filter(function (k) { return filled_(all[k]); }),
    notSet: PROPS_SHOWN_.filter(function (k) { return !filled_(all[k]); }),
    mailEnabled: c.mailEnabled, timeZone: c.timeZone, releasedAfter: c.releasedAfter || '', bundle: CIQFinal.BUILD
  });
  if (c.driveFolder) {
    try {
      DriveApp.getFolderById(c.driveFolder).getName();
      log_('probe: DRIVE_FOLDER_ID', { access: true });
    } catch (e) {
      log_('probe: DRIVE_FOLDER_ID', { access: false, error: errShort_(e) });
    }
  }
  requireCfg_(c);
  if (pausedNow_()) return;
  var ctx = ctx_();
  try {
    var rows = listProcess_(FD_.CASE);
    var keys = keysOf_(rows);
    log_('probe: case list', { rows: rows.length, keys: keys, carries: { _status: keys.indexOf('_status') >= 0, Case_Phase: keys.indexOf('Case_Phase') >= 0, Final_Release_At: keys.indexOf('Final_Release_At') >= 0, Final_Document_Hash: keys.indexOf('Final_Document_Hash') >= 0 } });
    if (rows.length) {
      var one = getProcess_(FD_.CASE, rows[0]._id);
      log_('probe: one case item', { caseItemId: rows[0]._id, fields: one ? Object.keys(one).length : 0, keys: one ? Object.keys(one).sort() : [] });
    }
    var audit = listForm_(FD_.AUDIT, FD_.PAGE_SIZE);
    log_('probe: audit list', { rows: audit.length, keys: keysOf_(audit), withCaseItemId: audit.filter(function (r) { return 'Case_Item_Id' in r; }).length, withSnapshot: audit.filter(function (r) { return 'Snapshot_JSON' in r; }).length });
    log_('probe: config list', { rows: listForm_(FD_.CONFIG, 200).length });
    log_('probe: supplier list', { rows: listForm_(FD_.SUPPLIER, 200).length });
    var done = idSet_('DONE_IDS');
    var ended = idSet_('ENDED_IDS');
    var old = oldSet_(c, true);
    var ids = candidates_(ctx, rows.filter(function (r) { return r && r._id && !done[r._id] && !ended[r._id] && !old[r._id]; }), true);
    var eligible = [];
    var reasons = {};
    for (var i = 0; i < ids.length && i < c.maxGets; i++) {
      var it = getProcess_(FD_.CASE, ids[i]);
      var el = eligibility_(it, c, now_(), false);
      if (el.ok) eligible.push({ caseItemId: ids[i], caseCode: String(it.Case_Code || '') });
      else reasons[el.why] = (reasons[el.why] || 0) + 1;
    }
    log_('probe: eligible cases', { read: Math.min(ids.length, c.maxGets), candidates: ids.length, alreadyDone: Object.keys(done).length, eligible: eligible, notEligible: reasons });
    if (eligible.length) {
      var first = getProcess_(FD_.CASE, eligible[0].caseItemId);
      var rows2 = auditRowsFor_(ctx, first);
      log_('probe: search on one eligible case', {
        caseCode: eligible[0].caseCode,
        reviewHits: listProcess_(FD_.REVIEW, first._id).length,
        openPointHits: listProcess_(FD_.OP, first._id).length,
        auditRows: rows2.length,
        auditNamesReviews: rows2.filter(function (r) { return !!namedObject_(r, FD_.REVIEW); }).length,
        auditNamesOpenPoints: rows2.filter(function (r) { return !!namedObject_(r, FD_.OP); }).length
      });
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
 *  files a case released before RELEASED_AFTER, and retries a case the trigger skips. */
function runOnce(caseItemId) {
  begin_();
  var id = String(caseItemId || props_().getProperty('RUN_ONCE_CASE_ID') || '').trim();
  if (!FD_.ID_RE.test(id)) throw new Error('runOnce: give a case item id (the argument or Script Property RUN_ONCE_CASE_ID)');
  var r = runLocked_(id, true);
  log_('runOnce done', { caseItemId: id, ok: r.ok, status: r.status });
  return r;
}

/** The time trigger: finish interrupted filings, then file the eligible cases (at most MAX_CASES_PER_TICK). */
function tick() {
  begin_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return log_('tick skipped: another run holds the lock');
  try {
    if (pausedNow_()) return;
    var ctx = ctx_();
    requireCfg_(ctx.c);
    var done = idSet_('DONE_IDS');
    var ended = idSet_('ENDED_IDS');
    var old = oldSet_(ctx.c, false);
    var states = states_();
    var processed = 0;
    var reads = 0;
    var seen = {};
    var room = function () { return processed < ctx.c.maxCases && timeLeft_() >= FD_.WRITE_BUDGET_MS; };
    // 1. filings an earlier run started or was stopped in (attached, hash written, mail or audit row missing)
    var pending = Object.keys(states);
    for (var i = 0; i < pending.length && room(); i++) {
      var pid = pending[i];
      seen[pid] = true;
      if (done[pid] || ended[pid] || old[pid] || states[pid].attempts >= FD_.MAX_ATTEMPTS) continue;
      var r = processCase_(ctx, pid, null, false);
      reads++;
      if (!r.skipped) processed++;
    }
    // 2. the case list
    var rows = listProcess_(FD_.CASE).filter(function (x) { return x && x._id && !done[x._id] && !ended[x._id] && !old[x._id] && !seen[x._id]; });
    var ids = candidates_(ctx, rows, false);
    for (var j = 0; j < ids.length && room() && reads < ctx.c.maxGets; j++) {
      var id = ids[j];
      var st = states[id];
      if (st && st.attempts >= FD_.MAX_ATTEMPTS) continue;
      var item = getProcess_(FD_.CASE, id);
      reads++;
      var el = eligibility_(item, ctx.c, now_(), false);
      if (!el.ok) {
        if (el.done) markId_('DONE_IDS', id);
        if (el.ended) markId_('ENDED_IDS', id);
        if (el.old) markOld_(ctx.c, id);
        continue;
      }
      processed++;
      processCase_(ctx, id, item, false);
    }
    log_('tick done', { pending: pending.length, listed: rows.length, candidates: ids.length, read: reads, processed: processed, calls: CALLS_, ms: now_() - RUN_STARTED_ });
  } catch (e) {
    if (isPause_(e)) return log_('tick stopped: paused', { until: pauseIso_() });
    if (isDeadline_(e)) return log_('tick stopped: time is up, the next run resumes', { calls: CALLS_, ms: now_() - RUN_STARTED_ });
    log_('tick failed', { error: errShort_(e) });
    throw e;
  } finally {
    lock.releaseLock();
  }
}

/** Creates the tick trigger, every TICK_MINUTES (1, 5, 10, 15 or 30; default 5). Older tick triggers are removed. An
 *  empty RELEASED_AFTER is set to now first: the trigger then files new releases only (no backfill, no mails for old
 *  cases); set RELEASED_AFTER earlier before installTrigger to backfill. */
function installTrigger() {
  begin_();
  var c = cfg_();
  var every = [1, 5, 10, 15, 30].indexOf(c.tickMinutes) >= 0 ? c.tickMinutes : 5;
  if (!c.releasedAfter) {
    props_().setProperty('RELEASED_AFTER', nowIso_());
    log_('RELEASED_AFTER set to now: the trigger files releases from now on; runOnce still files any case', { releasedAfter: nowIso_() });
  }
  var removed = deleteTickTriggers_();
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(every).create();
  log_('trigger installed', { handler: 'tick', everyMinutes: every, removed: removed, mailEnabled: c.mailEnabled, releasedAfter: props_().getProperty('RELEASED_AFTER') });
}

/** Removes every tick trigger. */
function removeTriggers() {
  begin_();
  log_('triggers removed', { removed: deleteTickTriggers_() });
}

/** Optional push (web app): body {caseItemId, token}; runs only when DOPOST_TOKEN is set and the body's token matches
 *  (never a token in the URL: it would land in proxy and step logs). Whether a case is filed always comes from
 *  Kissflow data, never from the payload. */
function doPost(e) {
  begin_();
  var c = cfg_();
  var out = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  if (!c.token) {
    log_('doPost refused: DOPOST_TOKEN is not set');
    return out({ ok: false, status: 'disabled' });
  }
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {};
  } catch (x) {
    return out({ ok: false, status: 'bad request' });
  }
  var token = String(body.token || '');
  if (!sameText_(token, c.token)) {
    log_('doPost refused: wrong token');
    return out({ ok: false, status: 'refused' });
  }
  var id = String(body.caseItemId || '');
  if (!FD_.ID_RE.test(id)) {
    log_('doPost refused: bad case item id');
    return out({ ok: false, status: 'bad case item id' });
  }
  var r = runLocked_(id, false);
  log_('doPost done', { caseItemId: id, ok: r.ok, status: r.status });
  return out({ ok: r.ok, status: r.status });
}

// =============================================================================================== the pipeline

function runLocked_(id, manual) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return res_(false, 'busy: another run holds the lock');
  try {
    if (pausedNow_()) return res_(false, 'paused until ' + pauseIso_());
    var ctx = ctx_();
    requireCfg_(ctx.c);
    return processCase_(ctx, id, null, manual);
  } catch (e) {
    if (isPause_(e)) return res_(false, 'paused until ' + pauseIso_());
    if (isDeadline_(e)) return res_(false, 'stopped at the time limit; the next run resumes');
    log_('run failed', { caseItemId: id, error: errShort_(e) });
    return res_(false, 'failed: ' + errShort_(e));
  } finally {
    lock.releaseLock();
  }
}

/** One case. A failure counts an attempt (after MAX_ATTEMPTS: one ADMIN_EMAIL alert; ticks skip it, runOnce retries).
 *  A stop (a file on the case that is not this document) alerts at once. The time limit is not an attempt. */
function processCase_(ctx, id, item, manual) {
  var st = loadState_(id) || { attempts: 0 };
  if (!manual && st.attempts >= FD_.MAX_ATTEMPTS) return res_(false, 'stuck after ' + st.attempts + ' attempts (runOnce retries it)', true);
  try {
    return pipeline_(ctx, id, item, st, manual);
  } catch (e) {
    if (isPause_(e)) throw e;
    if (isDeadline_(e)) {
      if (st.code) {
        st.lastStop = nowIso_(); // kept, so the next tick takes this case first
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
      if (alertAdmin_(ctx.c, st.code || id, 'The final document of ' + (st.code || id) + ' (case item ' + id + ') ' + what + '. The time trigger skips it now; runOnce retries it.\n\n' + (stop ? 'Reason: ' : 'Last error: ') + st.lastError)) {
        st.alerted = true;
        saveState_(id, st);
      }
    }
    return res_(false, (stop ? 'stopped: ' : 'failed: ') + st.lastError);
  }
}

function pipeline_(ctx, id, item, st, manual) {
  var c = ctx.c;
  item = item || getProcess_(FD_.CASE, id);
  if (!item) return res_(false, 'case item not found', true);
  var code = String(item.Case_Code || id);
  st.code = code;
  if (filled_(item.Final_Document_Hash)) return filedAlready_(ctx, id, item, st);
  var el = eligibility_(item, c, now_(), manual);
  if (!el.ok) {
    if (el.ended) markId_('ENDED_IDS', id);
    if (el.old) markOld_(c, id);
    log_('case not eligible', { caseItemId: id, caseCode: code, why: el.why });
    return res_(false, 'not eligible: ' + el.why, true);
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
  var file = { bytes: bytes, sha: sha, size: bytes.length };
  var existing = attachedFile_(ctx, id, fresh, name, built.seal, st, sha);
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
      up = attach_(ctx, id, fresh, name, bytes);
    } catch (e) {
      if (isPause_(e) || isDeadline_(e)) throw e;
      st.attachFails = (st.attachFails || 0) + 1;
      if (st.attachFails < FD_.MAX_ATTEMPTS || !c.driveFolder) throw e;
      up = { refused: true, status: e.status || 0, error: errShort_(e), fails: st.attachFails };
    }
    if (up.refused) {
      log_('attach refused', { caseCode: code, status: up.status, error: up.error, fails: up.fails || 0 });
      if (!c.driveFolder) throw new Error('Kissflow refused the attachment (HTTP ' + up.status + ') and DRIVE_FOLDER_ID is not set');
      var d = driveFallback_(ctx, id, item, name, bytes, built.seal, st);
      file.driveId = d.id;
      file.driveUrl = d.url;
      file.bytes = d.bytes;
      file.sha = sha256Hex_(d.bytes);
      file.size = d.bytes.length;
      st.driveShared = d.shared;
      log_('saved in Drive', { caseCode: code, driveFileId: d.id, shared: d.shared });
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

  // 7.–9. mail, audit row, done
  return finish_(ctx, id, fresh, st, Utilities.newBlob(file.bytes, 'application/pdf', name));
}

/** Final_Document_Hash is set. Our own hash (written, or planned before a PUT whose answer was lost): finish the mail
 *  and the audit row, nothing is rendered or written to the case again. Any other hash: the case is left alone. */
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
  markId_('DONE_IDS', id);
  deleteState_(id);
  return res_(true, 'already filed', true);
}

function ownHash_(st, h) {
  return [st.hash, st.pendingHash, st.seal && st.sha ? 'seal:' + st.seal + ' sha256:' + st.sha : ''].some(function (x) { return !!x && x === h; });
}

/** Mail (once), audit row (once), done. Resumable: each step is recorded in FD_<id> before and after it runs. */
function finish_(ctx, id, item, st, blob) {
  var c = ctx.c;
  var code = st.code;
  if (!st.mailedAt && !st.mailSkipped) {
    if (st.mailingAt) {
      // an earlier run stopped while handing the mail to MailApp: it most likely went out, so it is not sent twice
      st.mailedAt = st.mailingAt;
      st.mailUnconfirmed = true;
      saveState_(id, st);
      log_('mail not confirmed', { caseCode: code, rule: st.mailRule || '' });
      alertAdmin_(c, code, 'A run stopped while the final-document mail of ' + code + ' was being handed to Gmail (recipient rule: ' + (st.mailRule || '') + '). It is not sent again. Check with the RMM owner that it arrived; the PDF is on the case (Final PDF).');
    } else if (!c.mailEnabled) {
      st.mailSkipped = 'MAIL_ENABLED is off';
    } else {
      var to = rmmRecipient_(c, item);
      if (!to) {
        st.mailSkipped = 'no RMM address';
        saveState_(id, st);
        alertAdmin_(c, code, 'The final document of ' + code + ' is filed, but no RMM e-mail address is known (Owner_RMM carries none, someone else started the case, FALLBACK_RMM_EMAIL is not set). No mail went out.');
      } else {
        var pdf = blob || filedBlob_(ctx, id, st);
        if (timeLeft_() <= 0) throw deadlineError_('the mail');
        st.mailingAt = nowIso_();
        st.mailTo = to.to;
        st.mailRule = to.rule;
        saveState_(id, st);
        try {
          sendRmmMail_(c, item, st, to, pdf);
        } catch (e) {
          if (e.mailNotSent) {
            delete st.mailingAt;
            saveState_(id, st);
          }
          throw e;
        }
        st.mailedAt = st.mailingAt;
      }
    }
    saveState_(id, st);
    log_(st.mailedAt ? 'mail sent' : 'mail not sent', { caseCode: code, rule: st.mailRule || '', reason: st.mailSkipped || '' });
  }
  if (!st.auditVerified) {
    if (!st.auditId) {
      if (!st.auditData) {
        st.auditData = auditData_(id, item, st); // fixed once: a resumed run writes the same row
        saveState_(id, st);
      }
      var old = auditAll_(ctx).filter(function (r) { return r.Event_Key === st.auditData.Event_Key && r.Case_Item_Id === id; })[0];
      if (old) {
        st.auditId = String(old._id);
        st.auditFound = true;
      } else st.auditId = createAuditRow_(ctx, st.auditData);
      saveState_(id, st); // the new id is kept before its read-back, so a failed check never writes a second row
    }
    if (!st.auditFound) verifyAuditRow_(ctx, st.auditId, st.auditData);
    st.auditVerified = true;
    saveState_(id, st);
    log_('audit row written', { caseCode: code, auditItemId: st.auditId, found: !!st.auditFound });
  }
  if (st.driveId && !st.driveAlerted) {
    alertAdmin_(c, code, 'Kissflow refused the final PDF of ' + code + ' on the case, so it was saved in Google Drive (file id ' + st.driveId + ') and the case fields and the audit row name it.' + (st.driveShared ? '' : ' It is not shared with the RMM owner (MAIL_ENABLED is off, and sharing sends Google Drive\'s own mail).') + ' Attach it to the case by hand if Kissflow allows it later.');
    st.driveAlerted = true;
  }
  markId_('DONE_IDS', id);
  deleteState_(id);
  log_('case done', { caseItemId: id, caseCode: code, where: st.driveId ? 'Drive' : 'Final_PDF' });
  return res_(true, st.driveId ? 'filed in Drive (attach refused)' : 'filed');
}

/** When a case gets its final document (read from the case item). `ended`: never (Rejected or Withdrawn, or a
 *  completed item, which is locked); `old`: a completed case released before RELEASED_AFTER. A cancelled case that is
 *  not completed can still be reactivated, so it is read again. A manual run ignores RELEASED_AFTER. */
function eligibility_(it, c, nowMs, manual) {
  if (!it) return { ok: false, why: 'not found' };
  if (filled_(it.Final_Document_Hash)) return { ok: false, why: 'already filed', done: true };
  var status = String(it._status || '');
  var completed = status === 'Completed';
  if (status === 'Rejected' || status === 'Withdrawn') return { ok: false, why: 'status ' + status, ended: true };
  if (cancelled_(it)) return { ok: false, why: 'cancelled', ended: completed };
  if (it.Final_Release_Confirm !== 'Confirmed' || !filled_(it.Final_Release_At)) return { ok: false, why: 'no final release', ended: completed };
  var rel = Date.parse(it.Final_Release_At);
  if (!isFinite(rel)) return { ok: false, why: 'Final_Release_At unreadable' };
  if (!manual && c.releasedAfter && isFinite(Date.parse(c.releasedAfter)) && rel < Date.parse(c.releasedAfter)) return { ok: false, why: 'released before RELEASED_AFTER', old: completed };
  var minutes = (nowMs - rel) / 60000;
  if (!((completed && minutes >= c.settleMin) || minutes >= FD_.SETTLE_FALLBACK_MIN)) return { ok: false, why: 'settling' };
  return { ok: true };
}

function cancelled_(it) {
  if (it.Case_Phase === 'Cancelled') return true;
  if (!filled_(it.Cancelled_At)) return false;
  var reactivated = Date.parse(it.Reactivated_At || '');
  return !(isFinite(reactivated) && reactivated > Date.parse(it.Cancelled_At));
}

/** Case item ids worth an admin GET, from the list rows (sparse: a column the list never carries is not used). */
function candidates_(ctx, rows, readOnly) {
  var has = function (k) { return rows.some(function (r) { return k in r; }); };
  if (has('Final_Document_Hash')) {
    rows = rows.filter(function (r) {
      if (!filled_(r.Final_Document_Hash)) return true;
      if (!readOnly) markId_('DONE_IDS', r._id);
      return false;
    });
  }
  rows = rows.filter(function (r) { return r.Case_Phase !== 'Cancelled' && ['Rejected', 'Withdrawn', 'Draft'].indexOf(String(r._status || '')) < 0; });
  if (has('Final_Release_At')) {
    var after = Date.parse(ctx.c.releasedAfter || '');
    return rows.filter(function (r) { return filled_(r.Final_Release_At) && !(isFinite(after) && Date.parse(r.Final_Release_At) < after); }).map(function (r) { return r._id; });
  }
  // no release column: completed cases first, then round-robin over the rest (RR_CURSOR)
  var completed = rows.filter(function (r) { return r._status === 'Completed'; }).map(function (r) { return r._id; });
  var rest = rows.filter(function (r) { return r._status !== 'Completed'; }).map(function (r) { return r._id; }).sort();
  var cursor = props_().getProperty('RR_CURSOR') || '';
  var at = 0;
  while (at < rest.length && rest[at] <= cursor) at++;
  rest = rest.slice(at).concat(rest.slice(0, at));
  var take = Math.max(0, ctx.c.maxGets - completed.length);
  if (!readOnly && rest.length && take > 0) props_().setProperty('RR_CURSOR', rest[Math.min(take, rest.length) - 1]);
  return completed.concat(rest);
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

function attachments_(it) {
  var v = it && it[FD_.PDF_FIELD];
  return Array.isArray(v) ? v : [];
}

/** Why the bundle gave no document: the app does not see the case as completed, or its builder failed (its warning). */
function notBuilt_(built) {
  if (built.phase !== 'completed') return 'the app does not see this case as completed (phase ' + (built.phase || 'unknown') + ')';
  var w = (built.warnings || []).filter(function (x) { return String(x).indexOf('the final document could not be computed') >= 0; })[0];
  return 'the app could not build the final document' + (w ? ': ' + String(w).slice(0, 200) : '');
}

// =============================================================================================== writes

/** POST the PDF to Final_PDF and read it back. 408/409/423 are tried again (after a read: the file may have landed).
 *  Any other 4xx (not 429) is a refusal: { refused, status, error }. */
function attach_(ctx, id, before, name, bytes) {
  var had = {};
  attachments_(before).forEach(function (a) { if (a) had[a.id] = true; });
  var added = function (list) { return list.filter(function (a) { return a && !had[a.id] && a.name === name; })[0] || null; };
  var r;
  for (var i = 0; ; i++) {
    r = kfUpload_(attachPath_(ctx.c, id), bytes, name, 'application/pdf');
    if (FD_.RETRY_STATUSES.indexOf(r.status) < 0 || i >= FD_.ATTACH_RETRIES) break;
    log_('attach busy, tried again', { status: r.status, attempt: i + 2 });
    Utilities.sleep(FD_.RETRY_WAIT_MS);
    var landed = added(attachments_(getProcess_(FD_.CASE, id)));
    if (landed) return { id: String(landed.id) };
  }
  if (r.status >= 400 && r.status < 500 && FD_.RETRY_STATUSES.indexOf(r.status) < 0) return { refused: true, status: r.status, error: errBody_(r.body) };
  if (r.status < 200 || r.status >= 300) throw kfError_('attach', r);
  var list = (r.body && Array.isArray(r.body[FD_.PDF_FIELD])) ? r.body[FD_.PDF_FIELD] : [];
  var a = added(list) || list.filter(function (x) { return x && !had[x.id]; })[0];
  if (!a || !a.id) throw new Error('attach: the answer lists no new file');
  var back = getProcess_(FD_.CASE, id);
  if (!attachments_(back).some(function (x) { return x && x.id === a.id; })) throw new Error('attach not verified: ' + a.id + ' is not on Final_PDF');
  return { id: String(a.id) };
}

/** A file named `name` already on Final_PDF: ours when this state recorded it and the render is unchanged; else it is
 *  downloaded and adopted only when its PDF names this document's seal. A file without it (a probe upload, an older
 *  render) stops the case for a person: it is never filed, hashed or mailed. Returns {id, bytes} (bytes null: this
 *  render) or null when there is no such file. */
function attachedFile_(ctx, id, fresh, name, seal, st, sha) {
  var same = attachments_(fresh).filter(function (a) { return a && a.name === name; });
  if (!same.length) return null;
  var mine = same.filter(function (a) { return a.id === st.attId; })[0];
  if (mine && st.sha === sha) return { id: String(mine.id), bytes: null };
  var order = mine ? [mine].concat(same.filter(function (a) { return a !== mine; })) : same;
  var seen = [];
  for (var i = 0; i < order.length && i < 3; i++) {
    var b = downloadAttachment_(ctx, id, order[i].id);
    var s = pdfSeal_(b);
    if (s === seal) return { id: String(order[i].id), bytes: b };
    seen.push(order[i].id + ' (seal ' + (s || 'none') + ')');
  }
  throw stopError_('Final_PDF already holds ' + same.length + ' file(s) named ' + name + ' that are not this document (seal ' + seal + '): ' + seen.join(', ') + '. Remove them from the case, then run runOnce.');
}

/** Download an attached file: admin GET → 302 → the signed URL, fetched with the key only on KF_DOMAIN and never
 *  through a further redirect (S-2: redirect "manual" on both hops). */
function downloadAttachment_(ctx, id, attId) {
  var c = ctx.c;
  var r = kfFetch_('GET', '/process/2/' + c.acc + '/admin/' + FD_.CASE + '/' + id + '/' + FD_.PDF_FIELD + '/attachment/' + attId + '?' + appQ_(c), { followRedirects: false });
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

/** The 'Final PDF' CIQ Audit Event row's fields. Event_Key '<Case_Code>-FD-PDF' makes it findable again. */
function auditData_(id, item, st) {
  var at = nowIso_();
  var mailed = !!st.mailedAt;
  var where = st.attId ? 'filed on the case' : 'saved in Google Drive (Kissflow refused the file on the case)';
  var data = {
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
    New_Value_Text: st.name + ' · ' + st.size + ' bytes · SHA-256 ' + st.sha + ' · document seal ' + st.seal + (st.attId ? ' · Final_PDF ' + st.attId : ' · Drive ' + st.driveUrl),
    Ref_Flow_Id: FD_.CASE,
    Ref_Item_Id: id,
    Snapshot_JSON: JSON.stringify({ audit: [{ at: at, by: 'system', action: 'Generated final document', detail: 'Final document generated automatically, sealed and ' + where + ' (document seal ' + st.seal + ').' + (mailed ? ' Sent to the RMM owner.' : '') + ' It cannot be changed.' }] })
  };
  if (mailed) {
    data.Notify_Recipient = st.mailTo;
    data.Notify_Channel = 'E-mail';
  }
  return data;
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
 *  same name). Shared view-only with the RMM only while MAIL_ENABLED is on: sharing sends Google Drive's own mail. */
function driveFallback_(ctx, id, item, name, bytes, seal, st) {
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
  var shared = false;
  var to = c.mailEnabled ? rmmRecipient_(c, item) : null;
  if (to) {
    try {
      f.addViewer(to.to);
      shared = true;
    } catch (e) {
      log_('drive share failed', { error: errShort_(e) });
    }
  }
  return { id: f.getId(), url: f.getUrl(), bytes: f.getBlob().getBytes(), shared: shared };
}

/** The document seal a PDF of this service names in its Subject ('document seal <16 hex>'), or ''. */
function pdfSeal_(bytes) {
  var text = '';
  for (var i = 0; i < bytes.length; i += 4096) text += String.fromCharCode.apply(null, bytes.slice(i, i + 4096).map(function (b) { return (b + 256) % 256; }));
  var m = /\/Subject \(document seal ([0-9a-f]{16})\)/.exec(text);
  return m ? m[1] : '';
}

// =============================================================================================== mail

/** The RMM owner's address, first match wins: Owner_RMM.Email; BDF_Contact_Email when the owner started the case
 *  (app-live/map/people.ts); FALLBACK_RMM_EMAIL. */
function rmmRecipient_(c, item) {
  var owner = Array.isArray(item.Owner_RMM) ? item.Owner_RMM[0] : item.Owner_RMM;
  owner = owner || {};
  var creator = Array.isArray(item._created_by) ? item._created_by[0] : item._created_by;
  creator = creator || {};
  if (isEmail_(owner.Email)) return { to: String(owner.Email).trim(), rule: 'owner' };
  if (owner._id && creator._id && owner._id === creator._id && isEmail_(item.BDF_Contact_Email)) return { to: String(item.BDF_Contact_Email).trim(), rule: 'starter' };
  if (isEmail_(c.fallbackRmm)) return { to: c.fallbackRmm, rule: 'fallback', ownerName: String(owner.Name || '') };
  return null;
}

/** C-14 'Final document ready' (mailTemplateData.ts; domain/actions.ts complete()), with the PDF attached. An error
 *  of MailApp itself is marked mailNotSent (the caller may send again); anything after it is not. */
function sendRmmMail_(c, item, st, to, blob) {
  var code = st.code;
  var trade = String(item.Trade_Name || '').trim() || code;
  var lines = [
    'The supplier gave the final release of ' + trade + ' (' + code + ') and the case is completed. The final document was generated automatically and sealed (document seal ' + st.seal + '). It holds the released answers, the evidence list, every open-point thread and all confirmations.',
    '',
    st.attId ? 'The PDF is attached and filed on the case in Kissflow (Final PDF).' : 'The PDF is attached. Kissflow did not accept it on the case, so it is saved in Google Drive: ' + st.driveUrl
  ];
  if (to.rule === 'fallback') lines.push('', 'You get this mail as the fallback address for the case owner (RMM)' + (to.ownerName ? ', ' + to.ownerName : '') + '.');
  try {
    MailApp.sendEmail({ to: to.to, subject: code + ': final document ready', body: lines.join('\n'), name: c.mailFromName, attachments: [blob] });
  } catch (e) {
    e.mailNotSent = true;
    throw e;
  }
}

/** The filed PDF again (a resumed mail): from Final_PDF, else from Drive. */
function filedBlob_(ctx, id, st) {
  if (st.attId) return Utilities.newBlob(downloadAttachment_(ctx, id, st.attId), 'application/pdf', st.name);
  if (st.driveId) return DriveApp.getFileById(st.driveId).getBlob().setName(st.name);
  throw new Error('no filed PDF to mail');
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

/** The one HTTP function. opts: body (JSON), payload (multipart object), followRedirects, binary. Paces the calls,
 *  pauses the script on a 429 or an HTML answer (Cloudflare challenge), refuses a call past the run's time limit, and
 *  never logs headers, bodies or URLs. */
function kfFetch_(method, path, opts) {
  opts = opts || {};
  var c = cfg_();
  if (pauseUntil_() > now_()) throw pauseError_();
  var wait = LAST_CALL_AT_ + c.paceMs - now_();
  if (timeLeft_() - Math.max(0, wait) <= 0) throw deadlineError_('a Kissflow call');
  if (LAST_CALL_AT_ && wait > 0) Utilities.sleep(wait);
  LAST_CALL_AT_ = now_();
  CALLS_++;
  var params = { method: String(method).toLowerCase(), muteHttpExceptions: true, followRedirects: opts.followRedirects !== false, headers: { 'X-Access-Key-Id': c.keyId, 'X-Access-Key-Secret': c.keySecret } };
  if (opts.payload !== undefined) params.payload = opts.payload;
  else if (opts.body !== undefined) {
    params.contentType = 'application/json';
    params.payload = JSON.stringify(opts.body);
  }
  var res;
  try {
    res = UrlFetchApp.fetch('https://' + c.domain + path, params);
  } catch (e) {
    throw new Error('network error on ' + method + ' ' + route_(path) + ': ' + errShort_(e));
  }
  var status = res.getResponseCode();
  var headers = res.getHeaders() || {};
  var type = String(header_(headers, 'Content-Type') || '');
  if (status === 429) pauseNow_('429', method, path);
  if (status >= 300 && status < 400) return { status: status, location: String(header_(headers, 'Location') || '') };
  if (opts.binary && status === 200 && !/text\/html/i.test(type)) return { status: status, bytes: res.getBlob().getBytes() };
  var text = res.getContentText();
  if (/text\/html/i.test(type) || /^\s*</.test(text)) pauseNow_('html', method, path);
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

function getProcess_(flow, id) {
  var r = kfFetch_('GET', procItemPath_(cfg_(), flow, id));
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

function appQ_(c) { return '_application_id=' + encodeURIComponent(c.app); }
function procItemPath_(c, flow, id) { return '/process/2/' + c.acc + '/admin/' + flow + '/' + id + '?' + appQ_(c); }
function formItemPath_(c, form, id) { return '/form/2/' + c.acc + '/' + form + '/' + id + '?' + appQ_(c); }
function attachPath_(c, id) { return '/process/2/' + c.acc + '/admin/' + FD_.CASE + '/' + id + '/' + FD_.PDF_FIELD + '/attachment?' + appQ_(c); }
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

function pauseNow_(why, method, path) {
  var until = now_() + FD_.PAUSE_MS;
  props_().setProperty('PAUSE_UNTIL', String(until));
  log_('pause 20 min', { why: why, call: method + ' ' + route_(path), until: new Date(until).toISOString() });
  throw pauseError_();
}

function pauseError_() {
  var e = new Error('paused (429 or a challenge page) until ' + pauseIso_());
  e.name = 'CiqPause';
  return e;
}

function isPause_(e) { return !!e && e.name === 'CiqPause'; }

/** Milliseconds this execution may still call Kissflow or send mail (RUN_LIMIT_S after begin_). */
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

/** A condition a retry cannot fix (a person has to look): alerts at once, the trigger skips the case. */
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

/** Every FD_<caseItemId> state. */
function states_() {
  var out = {};
  var all = props_().getProperties();
  Object.keys(all).forEach(function (k) {
    var m = /^FD_([A-Za-z0-9_-]{6,40})$/.exec(k);
    if (!m) return;
    try {
      out[m[1]] = JSON.parse(all[k]);
    } catch (e) {
      // an unreadable state is ignored
    }
  });
  return out;
}

function idSet_(key) {
  var out = {};
  String(props_().getProperty(key) || '').split(',').forEach(function (x) { if (x) out[x] = true; });
  return out;
}

function markId_(key, id) {
  var list = String(props_().getProperty(key) || '').split(',').filter(function (x) { return !!x; });
  if (list.indexOf(id) >= 0) return;
  list.push(id);
  props_().setProperty(key, list.slice(-FD_.MAX_IDS).join(','));
}

/** OLD_IDS (completed cases released before RELEASED_AFTER) hold for the RELEASED_AFTER they were found with
 *  (OLD_IDS_FOR); a changed RELEASED_AFTER empties them. readOnly: nothing is written (probe). */
function oldSet_(c, readOnly) {
  var p = props_();
  if ((p.getProperty('OLD_IDS_FOR') || '') !== c.releasedAfter) {
    if (!readOnly) {
      p.deleteProperty('OLD_IDS');
      if (c.releasedAfter) p.setProperty('OLD_IDS_FOR', c.releasedAfter);
      else p.deleteProperty('OLD_IDS_FOR');
    }
    return {};
  }
  return idSet_('OLD_IDS');
}

function markOld_(c, id) {
  oldSet_(c, false);
  markId_('OLD_IDS', id);
}

function deleteTickTriggers_() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tick') {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  return n;
}

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
    keyId: g('KF_ACCESS_KEY_ID', ''),
    keySecret: g('KF_ACCESS_KEY_SECRET', ''),
    timeZone: g('TIME_ZONE', Session.getScriptTimeZone() || 'Europe/Berlin'),
    mailEnabled: !/^(false|no|off|0)$/i.test(g('MAIL_ENABLED', 'true')),
    mailFromName: g('MAIL_FROM_NAME', FD_.SERVICE),
    fallbackRmm: g('FALLBACK_RMM_EMAIL', ''),
    admin: g('ADMIN_EMAIL', ''),
    driveFolder: g('DRIVE_FOLDER_ID', ''),
    token: g('DOPOST_TOKEN', ''),
    maxCases: int('MAX_CASES_PER_TICK', 3, 1, 20),
    maxGets: int('MAX_GETS_PER_TICK', 25, 1, 200),
    settleMin: int('SETTLE_MINUTES', 2, 0, 1440),
    releasedAfter: g('RELEASED_AFTER', ''),
    paceMs: int('PACE_MS', FD_.PACE_MS, FD_.PACE_MS, 60000),
    tickMinutes: int('TICK_MINUTES', 5, 1, 30),
    // node harness only (test/live.mjs, 8 s pacing): Apps Script keeps the default
    runLimitMs: int('RUN_LIMIT_S', FD_.RUN_LIMIT_S, 60, 3600) * 1000
  };
  SECRETS_ = [CFG_.keyId, CFG_.keySecret, CFG_.token].filter(function (s) { return s && s.length >= 4; });
  return CFG_;
}

function requireCfg_(c) {
  var missing = [];
  if (!c.domain) missing.push('KF_DOMAIN');
  if (!c.acc) missing.push('KF_ACCOUNT_ID');
  if (!c.keyId) missing.push('KF_ACCESS_KEY_ID');
  if (!c.keySecret) missing.push('KF_ACCESS_KEY_SECRET');
  if (missing.length) throw new Error('Script Properties missing: ' + missing.join(', '));
  if (!/^[a-z0-9.-]+$/i.test(c.domain)) throw new Error('KF_DOMAIN must be a bare host name (no https://, no slash)');
  if (!/^[A-Za-z0-9_-]+$/.test(c.acc)) throw new Error('KF_ACCOUNT_ID looks wrong');
}

// =============================================================================================== small helpers

function now_() { return Date.now(); }
function nowIso_() { return new Date(now_()).toISOString().replace(/\.\d{3}Z$/, 'Z'); }
function filled_(v) { return v !== undefined && v !== null && String(v).trim() !== ''; }
function isEmail_(v) { return typeof v === 'string' && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v.trim()); }
function res_(ok, status, skipped) { return { ok: ok, status: status, skipped: !!skipped }; }

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
