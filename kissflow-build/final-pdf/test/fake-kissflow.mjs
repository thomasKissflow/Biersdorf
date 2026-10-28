// An in-memory Kissflow for the offline test: the admin REST routes the service calls, with the live answer shapes
// (night-2026-10-21 runner-requests.jsonl): process lists and q search {Data: rows}, admin item GET / PUT (the PUT
// answers the changed fields + _id), the attachment POST (multipart part "file"; answers the field's file list), the
// attachment GET (302 to a signed URL on the same host), form list POST {Data} (no child tables), form GET, form create
// (a draft "draft_<user>") + submit (the new _id), form update, and the error shape {type, error_code, en_message, …}.
// Every call is recorded. Faults can be injected before a route runs (`faults`: nothing is applied) or after it
// (`lost`: applied, but the answer is replaced, e.g. a lost or timed-out answer), and the attach can be refused
// (`refuseAttach`). `signedRedirect` makes the signed URL redirect once more, to a storage host.
import { GasBlob } from "./gas.mjs";

const JSON_TYPE = { "Content-Type": "application/json; charset=utf-8" };
const err = (status, code, message) => ({ status, headers: JSON_TYPE, body: JSON.stringify({ type: "Error", error_code: code, en_message: message, message, _id: null, args: [], status, request_id: "zzt-req" }) });
const ok = (body, status = 200) => ({ status, headers: JSON_TYPE, body: JSON.stringify(body) });

/** List-row projections: which keys a list row carries (sparse, as live). */
export const LIST_MODES = {
  // _status and a few header fields, no release columns: the service goes round-robin
  status: ["_id", "Name", "_created_by", "_created_at", "_status", "Case_Code", "Cycle_No", "Case_Title"],
  // the release columns too: the service pre-filters
  columns: ["_id", "Name", "_created_by", "_created_at", "_status", "Case_Code", "Cycle_No", "Case_Title", "Case_Phase", "Final_Release_At", "Final_Document_Hash"],
  // ids only
  bare: ["_id", "Name"],
};

export function fakeKissflow({ domain, acc, app, keyId, keySecret, db, clock, listMode = "status", user = "UsZZTService" }) {
  const calls = [];
  const signed = new Map();
  let seq = 0;
  const kf = {
    calls,
    db,
    listMode,
    /** [{match(call) → bool, respond: {status, headers, body}, times}] checked before the routes. */
    faults: [],
    refuseAttach: false,
    /** Drop Snapshot_JSON from audit list rows (the service must then read those rows in full). */
    auditListWithoutSnapshot: false,
    /** q search finds nothing (the service must then use the audit rows and the full list). */
    searchFindsNothing: false,
    /** [{match(call) → bool, respond, times}] checked after the route ran: the change is made, the answer replaced. */
    lost: [],
    /** The signed URL answers 302 to a storage host instead of the file. */
    signedRedirect: false,
    /** Review and open-point list rows without Case_Item_Id. */
    listWithoutCaseRef: false,
    /** Called with each call as it arrives (e.g. to move a fake clock: a slow answer). */
    onCall: null,
    writes: () => calls.filter((c) => c.write),
    handle,
  };

  const now = () => new Date(clock ? clock.now() : Date.now()).toISOString().replace(/\.\d{3}Z$/, "Z");
  const flowOf = (id) => db[id] ?? null;
  const project = (row, keys) => Object.fromEntries(Object.entries(row).filter(([k]) => keys.includes(k)));
  const page = (rows, q) => {
    const n = Number(q.get("page_number") || 1);
    const size = Number(q.get("page_size") || 50);
    return rows.slice((n - 1) * size, n * size);
  };

  function handle(url, params) {
    const r = route(url, params);
    const call = calls.at(-1);
    for (const f of kf.lost) {
      if ((f.times ?? 1) > 0 && f.match(call)) {
        f.times = (f.times ?? 1) - 1;
        call.lost = true;
        return f.respond;
      }
    }
    return r;
  }

  function route(url, params) {
    const m = /^https:\/\/([^/]+)(\/[^?]*)(?:\?(.*))?$/.exec(url);
    if (!m) throw new Error(`fake Kissflow: bad URL ${url}`);
    const [, host, path, query = ""] = m;
    const q = new URLSearchParams(query);
    const method = String(params.method || "get").toUpperCase();
    const headers = params.headers ?? {};
    const call = { at: clock ? clock.now() : Date.now(), method, host, path, query, auth: headers["X-Access-Key-Id"] === keyId && headers["X-Access-Key-Secret"] === keySecret, followRedirects: params.followRedirects !== false };
    if (typeof params.payload === "string") {
      call.contentType = params.contentType;
      try {
        call.body = JSON.parse(params.payload);
      } catch {
        call.body = params.payload;
      }
    } else if (params.payload && typeof params.payload === "object") {
      call.multipart = Object.fromEntries(Object.entries(params.payload).map(([k, v]) => [k, v instanceof GasBlob ? { name: v.getName(), type: v.getContentType(), bytes: Buffer.from(v.buf) } : v]));
    }
    calls.push(call);
    if (kf.onCall) kf.onCall(call);
    if (host !== domain) return err(404, "WrongHost", "not this host");
    for (const f of kf.faults) {
      if ((f.times ?? 1) > 0 && f.match(call)) {
        f.times = (f.times ?? 1) - 1;
        call.fault = true;
        return f.respond;
      }
    }
    if (!call.auth) return err(401, "Unauthorized", "invalid access key");

    // signed download (same host, S-2)
    let r = /^\/signed\/([A-Za-z0-9]+)$/.exec(path);
    if (r && method === "GET") {
      const file = signed.get(r[1]);
      if (file && kf.signedRedirect) return { status: 302, headers: { Location: `https://storage.zzt.example/blob/${r[1]}` }, body: "" };
      return file ? { status: 200, headers: { "Content-Type": "application/pdf" }, body: file } : err(404, "NotFound", "no such file");
    }
    if (q.get("_application_id") !== app) return err(400, "AppId", "_application_id missing or wrong");

    // process routes
    r = new RegExp(`^/process/2/${acc}/admin/([A-Za-z0-9_]+)(?:/([A-Za-z0-9_-]+))?(?:/([A-Za-z0-9_]+)/attachment(?:/([A-Za-z0-9_-]+))?)?$`).exec(path);
    if (r) {
      const [, flow, id, field, attId] = r;
      const items = flowOf(flow);
      if (!items) return err(404, "FlowNotFound", `no flow ${flow}`);
      if (id === "item" && method === "GET") {
        let rows = items;
        const term = q.get("q");
        if (term) rows = kf.searchFindsNothing ? [] : rows.filter((it) => Object.values(it).some((v) => typeof v === "string" && v.toLowerCase().includes(term.toLowerCase())));
        const keys = flow === "CIQ_Case_A00" ? LIST_MODES[kf.listMode] : ["_id", "Name", "_created_at", "_status", "Case_Code", ...(kf.listWithoutCaseRef ? [] : ["Case_Item_Id"]), "Review_Key", "OP_Key"];
        return ok({ Data: page(rows, q).map((x) => project(x, keys)) });
      }
      const it = items.find((x) => x._id === id);
      if (!it) return err(404, "ItemNotFound", "item not found");
      if (field && !attId && method === "POST") {
        call.write = "attach";
        const file = call.multipart?.file;
        if (!file || !file.name) return err(400, "NoFile", "multipart part 'file' missing");
        if (kf.refuseAttach) return err(400, "ItemCompleted", "This item is completed and cannot be changed");
        const list = Array.isArray(it[field]) ? it[field] : [];
        const added = { key: field, id: `Attach-ZZT${++seq}`, name: file.name, size: file.bytes.length, fileExtension: file.name.split(".").pop() };
        it[field] = [...list, added];
        it._attachmentBytes = { ...(it._attachmentBytes ?? {}), [added.id]: file.bytes };
        return ok({ [field]: it[field], _id: it._id });
      }
      if (field && attId && method === "GET") {
        const bytes = it._attachmentBytes?.[attId];
        if (!bytes) return err(404, "NotFound", "attachment not found");
        const token = `ZZT${++seq}sig`;
        signed.set(token, bytes);
        return { status: 302, headers: { Location: `https://${domain}/signed/${token}` }, body: "" };
      }
      if (!field && method === "GET") return ok(stripInternal(it));
      if (!field && method === "PUT") {
        call.write = "put";
        Object.assign(it, call.body, { _modified_at: now() });
        return ok({ ...call.body, _modified_at: it._modified_at, _id: it._id });
      }
      return err(405, "Method", "method not allowed");
    }

    // form routes
    r = new RegExp(`^/form/2/${acc}/([A-Za-z0-9_]+)(?:/([A-Za-z0-9_-]+))?(?:/(submit))?$`).exec(path);
    if (r) {
      const [, form, id, submit] = r;
      const rows = flowOf(form);
      if (!rows) return err(404, "FlowNotFound", `no form ${form}`);
      if (id === "list" && method === "POST") {
        return ok({ Data: page(rows, q).map((x) => Object.fromEntries(Object.entries(stripInternal(x)).filter(([k]) => !k.startsWith("Table::") && !(kf.auditListWithoutSnapshot && form === "CIQ_Audit_Event_A00" && k === "Snapshot_JSON")))) });
      }
      if (!id && method === "POST") {
        call.write = "form-create";
        kf.drafts = { ...(kf.drafts ?? {}), [form]: { ...call.body, _id: `draft_${user}`, _is_draft: true, _created_at: now() } };
        return ok(kf.drafts[form]);
      }
      if (id && submit && method === "POST") {
        call.write = "form-submit";
        const draft = kf.drafts?.[form];
        if (!draft || draft._id !== id) return err(400, "NoDraft", "no draft to submit");
        delete kf.drafts[form];
        const { _is_draft, ...data } = draft;
        const row = { ...data, _id: `PkZZTAud${++seq}`, _created_by: { _id: user, Name: "ZZT Service", Kind: "User" }, _modified_at: now(), _flow_name: "CIQ Audit Event", _application_id: app, _flow_type: "Form" };
        rows.push(row);
        return ok(row);
      }
      const row = rows.find((x) => x._id === id);
      if (!row) return err(404, "ItemNotFound", "item not found");
      if (method === "GET") return ok(stripInternal(row));
      if (method === "POST") {
        call.write = "form-update";
        Object.assign(row, call.body, { _modified_at: now() });
        return ok({ ...call.body, _modified_at: row._modified_at, _id: row._id });
      }
    }
    return err(404, "RouteNotFound", `no route ${method} ${path}`);
  }
  return kf;
}

const stripInternal = (it) => Object.fromEntries(Object.entries(it).filter(([k]) => k !== "_attachmentBytes"));
