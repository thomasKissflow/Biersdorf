// agentic.mjs — the agent-safe layer over the Kissflow REST API.
//
// Every function here exists because the platform API tells a comfortable lie or makes a correct
// call unreasonably hard. Each one was root-caused against the platform source (2026-08-02); the
// findings, with file:line targets for the fixes only the platform team can make, live in
// ~/Projects/kissflow-xg/agentic/README.md as a proposal.
//
// The rule that shapes this file: NEVER trust a 200. Verify by reading back, validate before
// writing, and resolve server-known ids ourselves rather than making the caller guess.
//
//   grantRoleMembers   — the role PUT ignores unknown body keys and answers success (#1)
//   ensureDashboardBindings — a dataform table needs 4 hand-wired objects (#2 #5 #6)
//   checkChildName     — reports and formviews share ONE name namespace (#2)
//   validateChoices    — invalid Select values are DROPPED silently at create (#3)
//   bulkInsert         — create is a per-user singleton draft; N records = N round trips (#13)
//   preflightPublish   — a plan-gated publish 403s and leaves the flow Live-but-stripped (#4 #12)
//   listItemsFull      — /myitems is a sparse projection that ignores _response_type=full (#7)
//   submitItem/decide  — submit needs an activity-instance id it never gives you (#8 #9)
//   withGrantPatience  — member writes 423 while any other member write is in flight (#11)

const q = (appId) => (appId ? `?_application_id=${encodeURIComponent(appId)}` : "");

/**
 * The access-control mutex is fail-fast: a member write 423s the moment another one overlaps, and
 * two leak paths can orphan the Redis key for its full 5-minute TTL. Retrying rides out real
 * overlaps (an app deploy's rolling member copies, a parallel fan-out grant); an orphaned key
 * outlives us, which is why the platform-side fix is in the proposal.
 */
export async function withGrantPatience(fn, { tries = 6, delayMs = 700 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    last = await fn();
    if (last?.status !== 423) return last;
    if (i < tries - 1) await new Promise((s) => setTimeout(s, delayMs * (i + 1)));
  }
  return last;
}

/**
 * Add users to an app role and PROVE it landed.
 * The platform reads only `Users`/`Groups`/`ServiceAccounts` from the body — `Members` and
 * `AddUsers` return {"status":"success"} and persist nothing. This rejects the wrong shapes
 * locally and verifies by reading the members back.
 */
export async function grantRoleMembers(c, { acc, appId, roleId, userIds = [], groupIds = [] }) {
  const bad = [];
  if (!Array.isArray(userIds)) bad.push("userIds must be an array of user ids");
  if (bad.length) return { ok: false, errors: bad };
  const body = {};
  if (userIds.length) body.Users = userIds.map((id) => (typeof id === "string" ? { _id: id } : id));
  if (groupIds.length) body.Groups = groupIds.map((id) => (typeof id === "string" ? { _id: id } : id));
  if (!Object.keys(body).length) return { ok: false, errors: ["nothing to grant"] };

  const put = await c.call("PUT", `/app_role/2/${acc}/${roleId}${q(appId)}`, body);
  const read = await c.call("GET", `/app_role/2/${acc}/${roleId}${q(appId)}`);
  const members = read.body?.Members || [];
  const have = new Set(members.map((m) => m._id));
  const missing = userIds.map((u) => (typeof u === "string" ? u : u._id)).filter((id) => !have.has(id));
  return {
    ok: put.status < 300 && !missing.length,
    status: put.status,
    members,
    missing,                       // non-empty ⇒ the API said success and did nothing
  };
}

/**
 * Ensure everything a dataform dashboard widget needs, idempotently: an All-Items REPORT (charts
 * bind report_id), a FORMVIEW with AllColumns on (tables bind view_id), and both shared with every
 * role. Each missing piece produces a DIFFERENT misleading runtime error, none of which name the
 * missing object — so this returns the ids instead of hoping.
 *
 * Names are deliberately distinct: reports and formviews share one flow-name namespace, so
 * "<Flow> All Items" twice collides with FlowNameAlreadyExists — an error that names the type
 * being created, never the one holding the name.
 */
export async function ensureDashboardBindings(c, { acc, appId, flowId, flowName, viewerRoles = [], log = () => {} }) {
  const base = flowName || flowId;
  const pickAllItems = (list) => (list.find((x) => /all[_ ]?items/i.test(x._id || x.Name || "")) || list[0]) || null;

  let reps = (await c.call("GET", `/flow/2/${acc}/form/${flowId}/report${q(appId)}`)).body;
  reps = Array.isArray(reps) ? reps : [];
  if (!reps.length) {
    const cr = await c.call("POST", `/flow/2/${acc}/form/${flowId}/report${q(appId)}`,
      { Name: `${base} All Items`, Description: "", ViewType: "Tabular", ReportType: "TabularReport" });
    if (cr.status < 300 && cr.body?._id) { reps = [cr.body]; log(`    + report ${cr.body._id}`); }
    else log(`    ! report create ${cr.status} ${JSON.stringify(cr.body || "").slice(0, 120)}`);
  }
  const reportId = pickAllItems(reps)?._id || "";

  let fvs = (await c.call("GET", `/flow/2/${acc}/form/${flowId}/formview/${q(appId)}`)).body;
  fvs = Array.isArray(fvs) ? fvs : [];
  if (!fvs.length) {
    // "<base> Table View", NOT "All Items" — see the namespace note above
    const cr = await c.call("POST", `/flow/2/${acc}/form/${flowId}/formview/${q(appId)}`,
      { Name: `${base} Table View`, ViewType: "Tabular" });
    if (cr.status < 300 && cr.body?._id) { fvs = [cr.body]; log(`    + formview ${cr.body._id}`); }
    else log(`    ! formview create ${cr.status} ${JSON.stringify(cr.body || "").slice(0, 120)}`);
  }
  const view = pickAllItems(fvs);
  const viewId = view?._id || "";

  // A formview ships with AllColumns:false and renders NOTHING until it is on. There is no publish
  // step for formviews (404s — they are live-edited), so the draft PUT is the whole ceremony.
  if (viewId) {
    const d = await c.call("GET", `/metadata/2/${acc}/form/${flowId}/formview/${viewId}/draft`);
    if (d.status < 300 && d.body?.Root && !d.body[d.body.Root].AllColumns) {
      d.body[d.body.Root].AllColumns = true;
      await c.call("PUT", `/metadata/2/${acc}/form/${flowId}/formview/${viewId}/draft`, d.body);
      log(`    ~ formview ${viewId}: AllColumns on`);
    }
  }

  if (viewerRoles.length) {
    if (reportId) await withGrantPatience(() =>
      c.call("POST", `/flow/2/${acc}/form/${flowId}/report/${reportId}/member/batch${q(appId)}`, viewerRoles));
    if (viewId) await withGrantPatience(() =>
      c.call("POST", `/flow/2/${acc}/form/${flowId}/formview/${viewId}/member/batch${q(appId)}`, viewerRoles));
  }
  return { reportId, viewId };
}

/** Who actually holds this child-flow name? The platform's collision error names the type being
 *  created, not the one already using the name. */
export async function checkChildName(c, { acc, appId, flowId, name }) {
  const target = String(name || "").trim().toLowerCase();
  for (const [kind, path] of [["Report", "report"], ["FormView", "formview/"]]) {
    const r = await c.call("GET", `/flow/2/${acc}/form/${flowId}/${path}${q(appId)}`);
    for (const f of Array.isArray(r.body) ? r.body : []) {
      if (String(f.Name || "").trim().toLowerCase() === target) return { available: false, heldBy: { ...f, kind } };
    }
  }
  return { available: true, heldBy: null };
}

/**
 * Which Select values would the platform SILENTLY DROP?
 * An out-of-list value never reaches the document and never appears in the create echo; the
 * failure resurfaces much later as 400 "Value is required" at submit, pointing at the wrong place.
 * Validate first, write once.
 */
export async function validateChoices(c, { acc, appId, flowId, rows, listCache = new Map() }) {
  const schema = (await c.call("GET", `/metadata/2/${acc}/form/${flowId}/schema`)).body;
  const fields = [];
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach(walk);
    const type = o.Type || o.WidgetType;
    if (o.Id && /select|checkbox|radio/i.test(String(type || "")) && o.ReferredList)
      fields.push({ id: o.Id, list: o.ReferredList });
    Object.values(o).forEach(walk);
  };
  walk(schema);

  const allowedFor = async (listId) => {
    if (listCache.has(listId)) return listCache.get(listId);
    const r = await c.call("GET", `/flow/2/${acc}/list/${listId}/items${q(appId)}`);
    const items = (Array.isArray(r.body) ? r.body : r.body?.Data || [])
      .map((x) => (typeof x === "string" ? x : x.Name || x._id || x.Value)).filter(Boolean);
    listCache.set(listId, items);
    return items;
  };

  const invalid = [];
  for (const [i, row] of (rows || []).entries()) {
    for (const f of fields) {
      const v = row?.[f.id];
      if (v === undefined || v === null || v === "") continue;
      const allowed = await allowedFor(f.list);
      if (!allowed.length) continue;               // unreadable list ⇒ don't invent a failure
      for (const one of Array.isArray(v) ? v : [v])
        if (!allowed.includes(one))
          invalid.push({ row: i, field: f.id, value: one, allowedSample: allowed.slice(0, 10) });
    }
  }
  return { ok: !invalid.length, invalid, checkedFields: fields.map((f) => f.id) };
}

/**
 * Insert many dataform records in ONE request.
 * The normal create path is a per-user singleton draft: POST returns the SAME draft until it is
 * submitted, so seeding N records means N strictly-serial create→submit pairs. The batch route the
 * CSV importer uses takes them all at once — `_is_created` marks each row an insert.
 * Validates choice values first (see above) so a bad payload never half-writes.
 */
export async function bulkInsert(c, { acc, appId, flowId, rows, validate = true, chunk = 200, log = () => {} }) {
  if (!rows?.length) return { submitted: 0, batches: [] };
  if (validate) {
    const v = await validateChoices(c, { acc, appId, flowId, rows });
    if (!v.ok) return { submitted: 0, batches: [], invalid: v.invalid };
  }
  const batches = [];
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk).map((r) => ({ ...r, _is_created: true }));
    const r = await c.call("POST", `/form/2/${acc}/${flowId}/batch${q(appId)}`, slice);
    log(`    batch ${i / chunk + 1}: ${slice.length} rows → ${r.status}`);
    batches.push({ from: i, count: slice.length, status: r.status, body: r.body });
  }
  return { submitted: rows.length, batches, ok: batches.every((b) => b.status < 300) };
}

/**
 * Would this publish succeed? Ask before it is too late.
 * A plan-gated widget makes publish 403 MID-serialization — and because flow creation already
 * published a default blob in an earlier request, the flow is left LIVE with only its default
 * fields. Whole-flow publish 500s name no field either. The platform's own dry-run route answers
 * both without writing anything.
 */
export async function preflightPublish(c, { acc, flowType, flowId, draft = null }) {
  const kind = String(flowType || "form").toLowerCase();      // form | case | process
  const r = await c.call("POST", `/metadata/2/${acc}/${kind}/${flowId}/publish/dryrun`, draft || {});
  if (r.status < 300) return { ok: true, body: r.body };
  const b = r.body || {};
  return {
    ok: false,
    status: r.status,
    type: b.type,
    error: b.en_message || b.message || JSON.stringify(b).slice(0, 300),
    // the single most useful thing this call can tell an agent
    planGated: b.type === "YourPlanNotSupport" || /YourPlanNotSupport/i.test(JSON.stringify(b)),
    hint: b.type === "YourPlanNotSupport"
      ? "a widget type on this flow is outside the account's plan — publishing anyway can leave the flow Live with default fields only"
      : "publish would fail; nothing was written",
  };
}

/** Every field of every item, in ONE list call. /myitems is a sparse projection and ignores
 *  _response_type=full — but it honours an explicit Columns payload with apply_preference=false. */
export async function listItemsFull(c, { acc, appId, processId, columns, status = "inprogress", page = 1, size = 50 }) {
  const cols = (columns || []).map((id) => (typeof id === "string" ? { Id: id } : id));
  const path = `/process/2/${acc}/${processId}/myitems/${status}?apply_preference=false&page_number=${page}&page_size=${size}${appId ? `&_application_id=${appId}` : ""}`;
  const r = await c.call("POST", path, cols.length ? { Columns: cols } : {});
  return { status: r.status, items: r.body?.Data || r.body?.Items || [], raw: r.body };
}

/** The activity-instance id the submit/decision routes demand, resolved from the item itself.
 *  Passing the wrong one yields "DocumentNotFound … within ActivityInstance", which reads as
 *  "no such item" and sends people hunting in the wrong place. */
export async function currentActivityInstance(c, { acc, processId, itemId }) {
  const r = await c.call("GET", `/process/2/${acc}/${processId}/${itemId}`);
  const inst = r.body?.ProcessInstance?.[0]?.CurrentActivityInstance || r.body?._activity_instance_id;
  return inst || null;
}

/** Submit an item's current step without knowing its activity-instance id. */
export async function submitItem(c, { acc, processId, itemId, activityInstanceId }) {
  const aiid = activityInstanceId || (await currentActivityInstance(c, { acc, processId, itemId }));
  if (!aiid) return { ok: false, error: "could not resolve the current activity instance" };
  const r = await c.call("POST", `/process/2/${acc}/${processId}/${itemId}/${aiid}/submit`, {});
  return { ok: r.status < 300, status: r.status, activityInstanceId: aiid, body: r.body };
}

/** Approve or reject a decision step. "Approve" IS the platform's Submit action; reject carries
 *  the same mandatory comment the UI collects. */
export async function decideItem(c, { acc, processId, itemId, action, note, activityInstanceId }) {
  const verb = String(action || "").toLowerCase();
  if (!["approve", "reject"].includes(verb)) return { ok: false, error: "action must be approve or reject" };
  if (verb === "reject" && !note) return { ok: false, error: "reject requires a note" };
  const aiid = activityInstanceId || (await currentActivityInstance(c, { acc, processId, itemId }));
  if (!aiid) return { ok: false, error: "could not resolve the current activity instance" };
  const path = `/process/2/${acc}/${processId}/${itemId}/${aiid}/${verb === "approve" ? "submit" : "reject"}`;
  const r = await c.call("POST", path, verb === "reject" ? { Note: note } : {});
  return { ok: r.status < 300, status: r.status, activityInstanceId: aiid, body: r.body };
}
