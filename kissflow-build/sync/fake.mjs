// In-memory fake of both Kissflow containers (app CIQ_Digital_A00 + portal CIQ_Supplier_Portal_A00) at the HTTP level,
// for the service's tests. It answers the same paths as Kissflow, so kissflow.mjs runs unchanged against it.
//
// Platform behaviours reproduced (evidence in plan v5 §1.2 and kissflow-facts.md):
// - P1/D-2  the API key cannot update fields after Start through the assignee route (400 KISSFLOW_ERROR_050313);
//           the admin route PUT …/admin/{proc}/{item} writes any field of an in-progress item;
// - P7      field-level Required is enforced at the Start submit (400 "Value is required"); step Mandatory is not;
// - P9/D-9  a Form create replaces the child-row ids; a modify with an unknown row id ADDS a row;
// - D-7     one draft per user per Form: a create replaces the user's draft, a submit consumes it;
// - P2      withdraw is the initiator's action and terminal; reject/withdraw end the item;
// - conditional single-step routing on a Select value (CIQ Review / CIQ Open Point);
// - field-assigned steps (MultiUser Assigned_Contacts, P11): an empty field refuses the submit;
// - `_created_by` / `_modified_by` / `_created_at` / `_modified_at` are set by the platform; sent values are ignored;
// - a step submit is allowed only when the acting user's role owns the step (or the user is in the assignee field);
// - S-5     the submit needs the CURRENT activity instance id, taken from the admin GET `_current_context`;
// - P3/D-4  lost updates can be injected (`dropNextWrites`) to test write-then-verify.
// The key's powers (admin route, attachments, the "key cannot update after Start" rule) belong to the CLIENT made with
// the key (`viaKey`), not to the user id: in dev the key's user is also a Workbench and portal user, and that person
// acting through a UI is an ordinary user. `strictUsers` (opt-in) answers 400 for a USER / MULTIUSER value naming an
// unknown user, as a guard that no synthetic id is ever written [fake only: not checked live].
//
// What it does NOT reproduce (and must not be read as proven): per-step field permissions for real users (the fake
// lets the step's assignee write any field: the S-1 assumption), rate limits, attachments, native e-mails, SLAs.

import { APP, PORTAL, FLOW, FLOW_META, F, STEP, ROLE, ATTACHMENT_FIELDS } from "./ids.mjs";

const SYSTEM = new Set(["_id", "_created_by", "_modified_by", "_created_at", "_modified_at", "_status", "_current_context", "_is_draft", "Name"]);
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

const err = (status, code, message, extra = {}) => ({ status, body: { status: "error", error_code: code, en_message: message, message, ...extra } });
const ok = (body) => ({ status: 200, body });

// ---------------------------------------------------------------------------------------------- schema

const USER_FIELDS = new Set(["Owner_RMM", "Assignee_User", "Responsible_User", "Raised_By_User", "Completed_By", "Closed_By", "Note_Author", "Run_By", "Published_By", "Criteria_Recorded_By"]);
const MULTIUSER_FIELDS = new Set(["Assigned_Contacts", "Raiser_Assignee"]);

const deptSteps = (names, fieldId, roleOf) =>
  Object.entries(names).map(([dept, name]) => ({ name, activity: `Activity_${fieldId}_${dept}`, kind: "user", assignee: { role: roleOf[dept] }, condition: { field: fieldId, eq: dept } }));

const DEPT_ROLE = { REG: ROLE.REG, SAF: ROLE.SAF, QM: ROLE.QM, MIC: ROLE.MIC, SUS: ROLE.SUS, RMM: ROLE.RMM };

/** The v5 shape of every flow the service touches (fields + Required at Start + steps). */
export function defaultSchema() {
  const proc = (id, fields, req, steps, tables = {}) => ({ id, kind: "process", container: FLOW_META[id].container, fields: new Set(fields), required: new Set(req), steps, tables });
  const form = (id, fields, req, tables = {}) => ({ id, kind: "form", container: FLOW_META[id].container, fields: new Set(fields), required: new Set(req), tables });
  const S = STEP;
  return {
    [FLOW.request]: proc(
      FLOW.request,
      [...F.request.keys, ...F.request.header, ...F.request.service, ...F.request.supplier, ...F.request.formula],
      F.request.REQ,
      [
        { ...S.request.start, kind: "start" },
        { ...S.request.fill, kind: "user", assignee: { field: "Assigned_Contacts" } },
        { ...S.request.keep, kind: "user", assignee: { field: "Assigned_Contacts" }, neverSubmittable: "Keep_Open_Gate" },
        { ...S.request.end, kind: "end" },
      ],
      { [F.request.uploads.table]: F.request.uploads.cols },
    ),
    [FLOW.query]: proc(FLOW.query, F.query.all, F.query.REQ, [
      { ...S.query.start, kind: "start" },
      { ...S.query.respond, kind: "user", assignee: { field: "Assigned_Contacts" } },
      { ...S.query.end, kind: "end" },
    ]),
    [FLOW.release]: proc(FLOW.release, F.release.all, F.release.REQ, [
      { ...S.release.start, kind: "start" },
      { ...S.release.release, kind: "user", assignee: { field: "Assigned_Contacts" } },
      { ...S.release.end, kind: "end" },
    ]),
    [FLOW.caseProc]: proc(FLOW.caseProc, [...F.caseProc.live, ...F.caseProc.v5], [], [
      { ...S.caseProc.start, kind: "start" },
      { ...S.caseProc.waitingSupplier, kind: "user", assignee: { role: ROLE.service } },
      { ...S.caseProc.review, kind: "user", assignee: { role: ROLE.service } },
      { ...S.caseProc.end, kind: "end" },
    ]),
    [FLOW.review]: proc(FLOW.review, F.review.all, F.review.REQ, [{ name: S.review.start.name, activity: "Activity_review_start", kind: "start" }, ...deptSteps(S.review.byDept, "Review_Dept", DEPT_ROLE), { name: "End", activity: "Activity_review_end", kind: "end" }]),
    [FLOW.openPoint]: proc(FLOW.openPoint, [...F.openPoint.live, ...F.openPoint.v5], [], [{ ...S.openPoint.start, kind: "start" }, ...deptSteps(S.openPoint.byDept, "OP_Dept", DEPT_ROLE), { ...S.openPoint.end, kind: "end" }]),
    [FLOW.caseData]: form(FLOW.caseData, F.caseData.header, F.caseData.REQ, Object.fromEntries(["components", "documents", "requestedDocs", "changeReports"].map((k) => [F.caseData[k].table, F.caseData[k].cols]))),
    [FLOW.help]: form(FLOW.help, [], []),
    [FLOW.outbox]: form(FLOW.outbox, F.outbox.all, F.outbox.REQ),
    [FLOW.serviceRequest]: form(FLOW.serviceRequest, F.serviceRequest.all, F.serviceRequest.REQ),
    [FLOW.audit]: form(FLOW.audit, F.audit.all, F.audit.REQ),
    [FLOW.note]: form(FLOW.note, [...F.note.all, ...F.note.v5], F.note.REQ),
    [FLOW.scopeRun]: form(FLOW.scopeRun, F.scopeRun.all, F.scopeRun.REQ),
    [FLOW.config]: form(FLOW.config, F.config.all, F.config.REQ),
    [FLOW.supplier]: form(FLOW.supplier, [...F.supplier.header, ...F.supplier.v5], ["Supplier_Code", "Supplier_Legal_Name"], { [F.supplier.contacts.table]: F.supplier.contacts.cols }),
    [FLOW.rmesSaf]: form(FLOW.rmesSaf, F.rmes.header, F.rmes.REQ, { [F.rmes.criteria.SAF]: F.rmes.criteria.cols, [F.rmes.findings.SAF]: F.rmes.findings.cols }),
    [FLOW.rmesReg]: form(FLOW.rmesReg, F.rmes.header, F.rmes.REQ, { [F.rmes.criteria.REG]: F.rmes.criteria.cols, [F.rmes.findings.REG]: F.rmes.findings.cols }),
  };
}

// ---------------------------------------------------------------------------------------------- the fake

/**
 * @param {object} o
 * @param {{_id: string, Name: string, Email?: string, roles?: string[]}[]} o.users
 * @param {string} o.keyUserId            the account key's user (the service)
 * @param {{ now(): Date }} [o.clock]
 * @param {boolean} [o.strictUsers]       a USER / MULTIUSER value naming an unknown user answers 400 (tests)
 */
export function createFake({ users, keyUserId, clock = makeClock(), schema = defaultSchema(), acc = "AcFAKE", strictUsers = false, adminTables = false } = {}) {
  // adminTables (opt-in, unproven live): the admin PUT also applies child-table rows (`Table::…`) like the assignee
  // route. Default off: the admin PUT refuses child tables (FieldNotFound), the fake's long-standing assumption.
  const userById = new Map(users.map((u) => [u._id, u]));
  const items = new Map(); // id → { flow, data }
  const drafts = new Map(); // `${user}|${form}` → draft data
  const drop = new Map(); // itemId → number of writes to drop (P3)
  const log = [];
  const outage = { mode: null, afterCalls: 0 }; // "challenge" (Cloudflare HTML 429) or "rate" (Kissflow JSON 429)
  let calls = 0;
  let seq = 0;
  const newId = (p) => `${p}${(++seq).toString(36).padStart(6, "0")}`;
  const nowIso = () => clock.now().toISOString();
  const userRef = (id) => ({ _id: id, Name: userById.get(id)?.Name ?? id, Kind: "User" });
  const inRole = (userId, roleId) => !!userById.get(userId)?.roles?.includes(roleId);

  function normalise(schemaFlow, body, { allowTables = true } = {}) {
    const fields = {};
    const tables = {};
    for (const [k, v] of Object.entries(body ?? {})) {
      if (SYSTEM.has(k) || k.startsWith("_")) continue;
      if (k.startsWith("Table::")) {
        const t = k.slice(7);
        if (!allowTables || !schemaFlow.tables[t]) return { error: err(400, "KISSFLOW_ERROR_01003", `FieldNotFound: ${k}`) };
        tables[t] = v;
        continue;
      }
      if (!schemaFlow.fields.has(k)) return { error: err(400, "KISSFLOW_ERROR_01003", `FieldNotFound: ${k}`, { args: { field: k } }) };
      if (ATTACHMENT_FIELDS.has(k)) return { error: err(400, "KISSFLOW_ERROR_050313", `${k} is an attachment field: use the attachment route`) };
      if (MULTIUSER_FIELDS.has(k) && v !== null && v !== undefined) {
        if (!Array.isArray(v) || v.some((x) => !x?._id)) return { error: err(400, "TypeMissMatchError", `${k} must be a list of users`) };
        const unknown = strictUsers ? v.find((x) => !userById.has(x._id)) : null;
        if (unknown) return { error: err(400, "KISSFLOW_ERROR_USER_NOT_FOUND", `${k}: no user ${unknown._id} (fake strictUsers)`) };
        fields[k] = v.map((x) => userRef(x._id));
        continue;
      }
      if (USER_FIELDS.has(k) && v && typeof v === "object") {
        if (strictUsers && !userById.has(v._id)) return { error: err(400, "KISSFLOW_ERROR_USER_NOT_FOUND", `${k}: no user ${v._id} (fake strictUsers)`) };
        fields[k] = userRef(v._id);
        continue;
      }
      fields[k] = clone(v);
    }
    return { fields, tables };
  }

  function stamp(data, userId, created = false) {
    const at = nowIso();
    if (created) {
      data._created_by = userRef(userId);
      data._created_at = at;
    }
    data._modified_by = userRef(userId);
    data._modified_at = at;
  }

  const missingRequired = (f, data) => [...f.required].filter((k) => data[k] === undefined || data[k] === null || data[k] === "" || (Array.isArray(data[k]) && !data[k].length));

  function evalCond(cond, data) {
    if (!cond) return true;
    return String(data[cond.field] ?? "") === cond.eq;
  }

  /** Moves an item from step index i to the next applicable step (skip unmatched conditions) or to End. */
  function advance(f, data, fromIdx) {
    for (let j = fromIdx + 1; j < f.steps.length; j++) {
      const st = f.steps[j];
      if (st.kind === "end") {
        data._status = "Completed";
        data._current_context = [];
        data._completed_at = nowIso();
        return { ok: true };
      }
      if (!evalCond(st.condition, data)) continue;
      if (st.assignee?.field && !(data[st.assignee.field] ?? []).length) return { error: err(400, "KISSFLOW_ERROR_050302", "There is no assignee for the next step") };
      data._status = "InProgress";
      data._current_context = [{ _context_current_step: st.name, _context_activity_id: st.activity, _context_activity_instance_id: newId("Ai"), _context_assigned_to: st.assignee?.field ? clone(data[st.assignee.field]) : [{ _id: st.assignee?.role, Kind: "AppRole" }] }];
      return { ok: true };
    }
    data._status = "Completed";
    data._current_context = [];
    return { ok: true };
  }

  const stepIndex = (f, data) => {
    const cur = data._current_context?.[0];
    return cur ? f.steps.findIndex((s) => s.name === cur._context_current_step) : -1;
  };

  function isAssignee(f, data, userId) {
    const st = f.steps[stepIndex(f, data)];
    if (!st || st.kind !== "user") return false;
    if (st.assignee?.role) return inRole(userId, st.assignee.role);
    if (st.assignee?.field) return (data[st.assignee.field] ?? []).some((x) => x._id === userId);
    return false;
  }

  function flowFor(id, appId) {
    const f = schema[id];
    if (!f) return { error: err(404, "KISSFLOW_ERROR_00137", `flow ${id} not found`) };
    if (appId && appId !== f.container) return { error: err(403, "KISSFLOW_ERROR_00010", "PermissionDeniedError") };
    return { f };
  }

  function dropped(itemId) {
    const n = drop.get(itemId) ?? 0;
    if (n > 0) {
      drop.set(itemId, n - 1);
      return true;
    }
    return false;
  }

  function applyTableOps(f, data, tables, { create = false } = {}) {
    for (const [t, rows] of Object.entries(tables)) {
      const cur = data[`Table::${t}`] ?? [];
      for (const r of rows ?? []) {
        const vals = Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith("_")));
        const unknown = Object.keys(vals).find((k) => !f.tables[t].includes(k));
        if (unknown) return err(400, "KISSFLOW_ERROR_01003", `FieldNotFound: ${t}.${unknown}`);
        if (create) {
          cur.push({ _id: `${t}_srv${newId("")}`, ...vals }); // P9: ids replaced on create
          continue;
        }
        const i = cur.findIndex((x) => x._id === r._id);
        if (r._is_deleted) {
          if (i >= 0) cur.splice(i, 1);
        } else if (r._is_created || i < 0) {
          cur.push({ _id: r._is_created && r._id ? r._id : `${t}_srv${newId("")}`, ...vals }); // unknown id → a new row (P9)
        } else cur[i] = { ...cur[i], ...vals };
      }
      data[`Table::${t}`] = cur;
    }
    return null;
  }

  const view = (data) => clone(data);

  // ------------------------------------------------------------------------------ routes

  function handle(userId, method, rawPath, body, viaKey = userId === keyUserId) {
    const [path, qs = ""] = rawPath.split("?");
    const params = Object.fromEntries(new URLSearchParams(qs));
    const appId = params._application_id;
    const p = path.split("/").filter(Boolean);
    if (["process", "form"].includes(p[0]) && p[4] === "allfields") {
      const f = schema[p[3]];
      if (!f) return err(404, "KISSFLOW_ERROR_00137", "not found");
      // live shape (verify-portal.mjs): Fields with Id/Type, Tables = the child model ids only
      return ok({ [f.id]: { Fields: [...f.fields].map((id) => ({ Id: id, Type: "Text" })), Tables: Object.keys(f.tables) } });
    }
    // /process/2/{acc}/admin/{flow}/{item}
    if (p[0] === "process" && p[3] === "admin") {
      if (!viaKey) return err(403, "KISSFLOW_ERROR_00010", "PermissionDeniedError");
      const { f, error } = flowFor(p[4], appId);
      if (error) return error;
      const it = items.get(p[5]);
      if (!it || it.flow !== f.id) return err(404, "KISSFLOW_ERROR_00137", "DocumentNotFound");
      if (method === "GET") return ok(view(it.data));
      if (method === "DELETE") {
        items.delete(p[5]);
        return ok({ success: true });
      }
      if (method === "PUT") {
        if (!["InProgress", "Draft"].includes(it.data._status)) return err(400, "KISSFLOW_ERROR_050302", `Item is ${it.data._status}`);
        const n = normalise(f, body, { allowTables: adminTables });
        if (n.error) return n.error;
        if (dropped(it.data._id)) return ok({ _id: it.data._id }); // lost update (P3)
        Object.assign(it.data, n.fields);
        const e = adminTables ? applyTableOps(f, it.data, n.tables) : null;
        if (e) return e;
        stamp(it.data, userId);
        return ok({ _id: it.data._id });
      }
    }
    if (p[0] === "process") {
      const { f, error } = flowFor(p[3], appId);
      if (error) return error;
      // GET …/{flow}/myitems (live, 14 Oct: the caller's own items in every status, Draft included; system fields only,
      // no business field such as Case_Code)
      if (method === "GET" && p[4] === "myitems" && p.length === 5) {
        const page = Number(params.page_number ?? 1);
        const size = Number(params.page_size ?? 50);
        const sys = (d) => ({ _id: d._id, Name: d.Name ?? `${f.id} from ${userById.get(d._created_by?._id)?.Name ?? d._created_by?._id}`, _current_step: d._current_context?.[0]?._context_current_step ?? null, _modified_at: d._modified_at, _status: d._status, _completed_at: d._completed_at ?? null });
        const rows = [...items.values()].filter((x) => x.flow === f.id && x.data._created_by?._id === userId).map((x) => sys(x.data));
        return ok({ Columns: [], Data: rows.slice((page - 1) * size, page * size) });
      }
      // create at Start
      if (method === "POST" && p.length === 4) {
        const n = normalise(f, body);
        if (n.error) return n.error;
        const data = { _id: newId("Pk"), ...n.fields, _status: "Draft" };
        stamp(data, userId, true);
        const start = f.steps[0];
        data._current_context = [{ _context_current_step: start.name, _context_activity_id: start.activity, _context_activity_instance_id: newId("Ai"), _context_assigned_to: [userRef(userId)] }];
        const e = applyTableOps(f, data, n.tables, { create: true });
        if (e) return e;
        items.set(data._id, { flow: f.id, data });
        return ok({ _id: data._id, ModelId: f.id, _activity_instance_id: data._current_context[0]._context_activity_instance_id });
      }
      const it = items.get(p[4]);
      if (!it || it.flow !== f.id) return err(404, "KISSFLOW_ERROR_00137", "DocumentNotFound");
      const data = it.data;
      if (method === "POST" && p[5] === "withdraw") {
        if (data._created_by?._id !== userId) return err(403, "KISSFLOW_ERROR_00010", "Only the initiator can withdraw this item");
        if (!["InProgress", "Draft"].includes(data._status)) return err(400, "KISSFLOW_ERROR_050302", `Item is already ${data._status}`);
        data._status = "Withdrawn";
        data._current_context = [];
        stamp(data, userId);
        return ok({ success: "Withdrawn" });
      }
      const cur = data._current_context?.[0];
      if (method === "POST" && p[6] === "submit") {
        if (!cur || cur._context_activity_instance_id !== p[5]) return err(400, "KISSFLOW_ERROR_050302", "You don't have permission to submit this item anymore.");
        const idx = stepIndex(f, data);
        const st = f.steps[idx];
        if (st.kind === "start") {
          if (data._created_by?._id !== userId) return err(400, "KISSFLOW_ERROR_050302", "You don't have permission to submit this item anymore.");
          const miss = missingRequired(f, data);
          if (miss.length) return err(400, "KISSFLOW_ERROR_050312", "Value is required", { args: { validation_errors: miss } });
        } else {
          if (!isAssignee(f, data, userId)) return err(400, "KISSFLOW_ERROR_050302", "This item has moved out of your queue.");
          if (st.neverSubmittable) return err(400, "KISSFLOW_ERROR_050312", `${st.neverSubmittable} is mandatory`);
        }
        const r = advance(f, data, idx);
        if (r.error) return r.error;
        stamp(data, userId);
        return ok({ success: "Submitted successfully" });
      }
      // assignee update route POST …/{item}/{instance}
      if (method === "POST" && p.length === 6) {
        if (!cur || cur._context_activity_instance_id !== p[5]) return err(400, "KISSFLOW_ERROR_050302", "You don't have permission to update this item anymore.");
        const n = normalise(f, body);
        if (n.error) return n.error;
        const idx = stepIndex(f, data);
        if (viaKey && idx > 0) return err(400, "KISSFLOW_ERROR_050313", `You don't have permission to update the following fields: ${Object.keys(n.fields).join(", ")}`);
        if (idx > 0 && !isAssignee(f, data, userId)) return err(403, "KISSFLOW_ERROR_00010", "PermissionDeniedError");
        if (idx === 0 && data._created_by?._id !== userId) return err(403, "KISSFLOW_ERROR_00010", "PermissionDeniedError");
        if (dropped(data._id)) return ok({ _id: data._id });
        Object.assign(data, n.fields);
        const e = applyTableOps(f, data, n.tables);
        if (e) return e;
        stamp(data, userId);
        return ok({ _id: data._id });
      }
    }
    if (p[0] === "form") {
      const { f, error } = flowFor(p[3], appId);
      if (error) return error;
      if (method === "POST" && p[4] === "list") {
        const page = Number(params.page_number ?? 1);
        const size = Number(params.page_size ?? 50);
        // live (15 Oct): a list row carries _id + business fields only; _created_by/_modified_by/_created_at/_modified_at
        // come with the per-row GET
        const listView = (d) => Object.fromEntries(Object.entries(view(d)).filter(([k]) => k === "_id" || !k.startsWith("_")));
        const rows = [...items.values()].filter((x) => x.flow === f.id).map((x) => listView(x.data));
        return ok({ Data: rows.slice((page - 1) * size, page * size) });
      }
      if (method === "POST" && p.length === 4) {
        const n = normalise(f, body);
        if (n.error) return n.error;
        const key = `${userId}|${f.id}`;
        drafts.set(key, { fields: n.fields, tables: n.tables }); // one draft per user per Form: replaced (D-7)
        return ok({ _id: `draft_${userId}`, _is_draft: true });
      }
      if (method === "POST" && p[5] === "submit") {
        const key = `${userId}|${f.id}`;
        const d = drafts.get(key);
        if (!d || p[4] !== `draft_${userId}`) return err(404, "KISSFLOW_ERROR_00137", "DocumentNotFound");
        drafts.delete(key);
        const data = { _id: newId("Fr"), ...d.fields };
        const miss = missingRequired(f, data);
        if (miss.length) return err(400, "KISSFLOW_ERROR_050312", "Value is required", { args: { validation_errors: miss } });
        const e = applyTableOps(f, data, d.tables, { create: true });
        if (e) return e;
        stamp(data, userId, true);
        items.set(data._id, { flow: f.id, data });
        return ok(view(data));
      }
      const it = items.get(p[4]);
      if (!it || it.flow !== f.id) return err(404, "KISSFLOW_ERROR_00137", "DocumentNotFound");
      if (method === "GET") return ok(view(it.data));
      // DELETE /form/2/{acc}/{form}/{id} (proven live for the key: live-smoke cleanup, 15 Oct); the key's client only
      if (method === "DELETE" && p.length === 5) {
        if (!viaKey) return err(403, "KISSFLOW_ERROR_00010", "PermissionDeniedError");
        items.delete(p[4]);
        return ok({ success: "Deleted successfully" });
      }
      if (method === "POST" && p.length === 5) {
        const n = normalise(f, body);
        if (n.error) return n.error;
        if (dropped(it.data._id)) return ok({ _id: it.data._id });
        Object.assign(it.data, n.fields);
        const e = applyTableOps(f, it.data, n.tables);
        if (e) return e;
        stamp(it.data, userId);
        return ok({ _id: it.data._id });
      }
    }
    if (p[0] === "app_role" && method === "GET") {
      const roleId = p[3];
      const members = users.filter((u) => u.roles?.includes(roleId)).map((u) => ({ _id: u._id, Name: u.Name, Email: u.Email, Kind: "User" }));
      return ok({ _id: roleId, Users: members, UserCount: members.length });
    }
    if (p[0] === "flow" && method === "GET" && ["process", "form"].includes(p[3])) {
      const rows = Object.values(schema).filter((f) => f.kind === p[3] && f.container === appId).map((f) => ({ _id: f.id, Name: f.id, Status: "Live" }));
      return ok({ Data: rows });
    }
    return err(404, "KISSFLOW_ERROR_00137", `EndpointNotFound ${method} ${path}`);
  }

  // ------------------------------------------------------------------------------ attachments (S-2)

  const blobs = new Map(); // attachment id → bytes
  const extOf = (name) => (/\.([A-Za-z0-9]+)$/.exec(name ?? "")?.[1] ?? "").toLowerCase();
  function addAttachment(data, field, { name, bytes }) {
    const id = `Attach-${newId("")}`;
    const entry = { key: `${data._id}/${field}/${id}`, id, name, size: bytes.length, fileExtension: extOf(name) };
    data[field] = [...(data[field] ?? []), entry];
    blobs.set(id, Buffer.from(bytes));
    return entry;
  }

  /** The S-2 transport as a user sees it (only the key's client is admin). Reproduces the live semantics. */
  function fileTransport(userId, { viaKey = userId === keyUserId } = {}) {
    const outageAnswer = () => {
      calls++;
      if (outage.mode && calls > outage.afterCalls) return outage.mode === "challenge" ? { status: 429, body: CHALLENGE_HTML } : err(429, "KISSFLOW_ERROR_00429", "Too many requests");
      return null;
    };
    const route = (path) => {
      const [p0, qs = ""] = path.split("?");
      const p = p0.split("/").filter(Boolean); // process 2 acc admin flow item field attachment [attId]
      const appId = new URLSearchParams(qs).get("_application_id");
      if (p[0] !== "process" || p[3] !== "admin" || p[7] !== "attachment") return { error: err(404, "KISSFLOW_ERROR_00137", "EndpointNotFound") };
      if (!viaKey) return { error: err(403, "KISSFLOW_ERROR_00010", "PermissionDeniedError") };
      const { f, error } = flowFor(p[4], appId);
      if (error) return { error };
      const it = items.get(p[5]);
      if (!it || it.flow !== f.id) return { error: err(404, "KISSFLOW_ERROR_00137", "DocumentNotFound") };
      if (!f.fields.has(p[6]) || !ATTACHMENT_FIELDS.has(p[6])) return { error: err(400, "KISSFLOW_ERROR_01003", `FieldNotFound: ${p[6]}`) };
      return { it, field: p[6], attId: p[8] };
    };
    return {
      async upload(path, file) {
        const o = outageAnswer();
        if (o) return clone(o);
        const r = route(path);
        if (r.error) return r.error;
        if (!["InProgress", "Draft"].includes(r.it.data._status)) return err(400, "KISSFLOW_ERROR_050302", `Item is ${r.it.data._status}`);
        if (!file?.name || !file?.bytes) return err(400, "MissingRequiredFieldError", "file is required");
        addAttachment(r.it.data, r.field, file);
        stamp(r.it.data, userId);
        log.push({ user: userId, method: "POST", path: path.replace(/\?.*$/, ""), status: 200 });
        return ok({ [r.field]: clone(r.it.data[r.field]) });
      },
      async download(path) {
        const o = outageAnswer();
        if (o) return clone(o);
        const r = route(path);
        if (r.error) return r.error;
        if (!(r.it.data[r.field] ?? []).some((a) => a.id === r.attId) || !blobs.has(r.attId)) return err(404, "KISSFLOW_ERROR_00137", "AttachmentNotFound");
        log.push({ user: userId, method: "GET", path: path.replace(/\?.*$/, ""), status: 302 });
        return { status: 302, location: `/upload/2/${acc}/signed/${r.attId}?sig=${newId("s")}` };
      },
      async fetchSigned(location) {
        const o = outageAnswer();
        if (o) return clone(o);
        const m = /^\/upload\/2\/[^/]+\/signed\/([^?]+)/.exec(location);
        if (!m || !viaKey) return { status: 403, body: { en_message: "Forbidden" } };
        log.push({ user: userId, method: "GET", path: "/upload/2/…/signed", status: 200 });
        return { status: 200, bytes: Buffer.from(blobs.get(m[1])), contentType: "application/octet-stream" };
      },
    };
  }

  /** A real user's own upload into an Attachment field at its step (the portal UI's SDK uploadFile: S-1 path). */
  function userAttach(userId, flowId, itemId, field, file) {
    const it = items.get(itemId);
    const f = schema[flowId];
    if (!it || !isAssignee(f, it.data, userId)) throw new Error(`fake: ${userId} is not the assignee of ${itemId}`);
    const entry = addAttachment(it.data, field, file);
    stamp(it.data, userId);
    return clone(entry);
  }

  const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/;
  /** The first DateTime-with-milliseconds string in a write body, else null. */
  function findMillis(v) {
    if (typeof v === "string") return ISO_MS.test(v) ? v : null;
    if (Array.isArray(v)) { for (const x of v) { const f = findMillis(x); if (f) return f; } return null; }
    if (v && typeof v === "object") { for (const x of Object.values(v)) { const f = findMillis(x); if (f) return f; } return null; }
    return null;
  }

  /**
   * A kf.mjs-shaped client acting as `userId`. `viaKey`: the client holds the account key (admin powers); by default
   * only the key user's own client does. A UI client of the same user passes viaKey: false.
   */
  function clientFor(userId, { viaKey = userId === keyUserId } = {}) {
    return {
      acc,
      appId: APP,
      portalId: PORTAL,
      async call(method, path, body) {
        calls++;
        if (outage.mode && calls > outage.afterCalls) {
          const r = outage.mode === "challenge" ? { status: 429, body: CHALLENGE_HTML } : err(429, "KISSFLOW_ERROR_00429", "Too many requests");
          log.push({ user: userId, method, path: path.replace(/\?.*$/, ""), status: r.status, outage: outage.mode });
          return clone(r);
        }
        // live behaviour (15 Oct): a DateTime with milliseconds is refused with 400 KISSFLOW_ERROR_01020
        const ms = method !== "GET" && body !== undefined ? findMillis(body) : null;
        const r = ms ? err(400, "KISSFLOW_ERROR_01020", `The date/time ${ms} is invalid.`) : handle(userId, method, path, body === undefined ? undefined : clone(body), viaKey);
        log.push({ user: userId, method, path: path.replace(/\?.*$/, ""), status: r.status });
        return clone(r);
      },
      get(path) {
        return this.call("GET", path);
      },
    };
  }

  return {
    acc,
    clock,
    schema,
    log,
    key: clientFor(keyUserId),
    clientFor,
    fileTransport,
    keyFiles: fileTransport(keyUserId),
    userAttach,
    blob: (attId) => blobs.get(attId),
    /** From the next call on (or after `afterCalls` more calls), every call answers 429: "challenge" returns the
     *  Cloudflare HTML page seen on the dev account on 14 Oct, "rate" Kissflow's JSON 429. `null` ends the outage. */
    setOutage(mode, afterCalls = 0) {
      outage.mode = mode;
      outage.afterCalls = calls + afterCalls;
    },
    /** The next `n` writes to this item answer 200 but are lost (P3, D-4). */
    dropNextWrites(itemId, n = 1) {
      drop.set(itemId, n);
    },
    item(id) {
      return items.has(id) ? clone(items.get(id).data) : null;
    },
    rows(flowId) {
      return [...items.values()].filter((x) => x.flow === flowId).map((x) => clone(x.data));
    },
    /** Test helper: change fields of an item or row directly (e.g. the mail integration setting Sent_Status). */
    seedUpdate(id, fields, userId = keyUserId) {
      const it = items.get(id);
      if (!it) return false;
      Object.assign(it.data, clone(fields));
      stamp(it.data, userId);
      return true;
    },
    /** Test helper: put a row straight in (as `userId`), e.g. seed configuration. */
    seedForm(flowId, fields, tables = {}, userId = keyUserId) {
      const f = schema[flowId];
      const data = { _id: newId("Fr"), ...clone(fields) };
      applyTableOps(f, data, tables, { create: true });
      stamp(data, userId, true);
      items.set(data._id, { flow: flowId, data });
      return data._id;
    },
  };
}

/** What the dev account answered on 14 Oct night (status 429, HTML, no JSON). */
export const CHALLENGE_HTML = `<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title></head><body><div id="cf-chl-widget">Checking your browser before accessing the site.</div></body></html>`;

export function makeClock(start = "2026-10-15T07:00:00.000Z") {
  let t = Date.parse(start);
  return {
    now: () => new Date(t),
    advance(ms) {
      t += ms;
      return new Date(t);
    },
    set(iso) {
      t = Date.parse(iso);
    },
  };
}

/** A client for a simulated custom UI (Workbench or portal UI): like the real UIs, it writes DateTimes at second
 *  precision (the SDK and REST both refuse milliseconds, 15 Oct), so only the service's own writes are tested raw. */
export function uiClient(fake, userId) {
  const c = fake.clientFor(userId, { viaKey: false });
  const strip = (v) => (typeof v === "string" ? v.replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.\d+Z$/, "$1Z") : Array.isArray(v) ? v.map(strip) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, strip(x)])) : v);
  return { ...c, call: (method, path, body) => c.call(method, path, body === undefined ? undefined : strip(body)), get: (path) => c.call("GET", path) };
}
