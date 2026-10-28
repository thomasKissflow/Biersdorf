// A stub of the Kissflow routes apply-harden.mjs uses, for its DRY RUN and its offline test (apply-harden.test.mjs).
// No network and no credential: everything runs in memory. Each integration starts from its snapshot draft of 21 Oct 02:2x
// (night-2026-10-21/snapshot, Live and ON), and its steps run the way Kissflow runs them: every mapping is resolved from the
// draft's own context paths, the Run script is the draft's own js_code (the published copy until a publish, so the 20 Oct
// scripts run until then), a Search is a full-text search, and a webhook POST runs the published chain while the
// integration is ON, becomes the trigger's test sample while a trigger Test listens, and is lost otherwise. The I-1
// webhook (case.started) creates and links a request, as the portal session's integration does. Fictional ZZT data only.
// Not modelled: field types, permissions, Mandatory, step assignees, Kissflow's own error texts.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { APP, DEFS } from "./integ-defs.mjs";

export const SIM_ACC = "AcDOSunMEpSA", SIM_HOST = "dev-beiersdorf.kissflow.eu";
const PORTAL = "CIQ_Supplier_Portal_A00";
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const CODE_OF = { opRound: "op.round", opEdited: "op.edited", opClosed: "op.closed", release: "release.requested", history: "history.updated", cancelled: "case.cancelled" };
// the steps an item walks through on submit (the names the night runner read back); the last one completes it
const STEPS = {
  CIQ_Case_A00: ["Create case", "Waiting for supplier: CIQ", "Beiersdorf review and final release"],
  CIQ_Open_Point_A00: ["Raise open point", "Open point – QM"],
  CIQP_Request_A00: ["Start", "Supplier: fill in the CIQ", "Supplier: keep the CIQ up to date"],
  CIQP_Query_A00: ["Start", "Supplier: respond"],
};
const clone = (x) => (x === undefined ? x : structuredClone(x));
const ok = (body) => ({ status: 200, body });
const notFound = (msg) => ({ status: 404, body: { type: "EndpointNotFound", status: "error", message: msg } });

/** The snapshot draft of one integration (21 Oct 02:2x): what the sim starts from, and what `build.mjs harden` reads. */
export function snapshotDraft(id) {
  const raw = JSON.parse(readFileSync(here(`../../night-2026-10-21/snapshot/${APP}.integration.${id}.json`), "utf8"));
  return raw.draft;
}

/** "context.<step>.<a>.<b>" against the step outputs (a path into a list maps over it, as a user-list child does). */
function resolve(ctx, field) {
  const m = /^context\.([^.]+)\.(.+)$/.exec(String(field || ""));
  if (!m) return undefined;
  let v = ctx[m[1]];
  for (const seg of m[2].split(".")) v = Array.isArray(v) ? v.map((e) => e?.[seg]) : v?.[seg];
  return v;
}

/**
 * ids: {key: integrationId} (state.json). now: the clock (the test's virtual one). Returns the sim: call(method, path, body)
 * and hook(url, payload) in the shape of apply-harden.mjs's raw transport, plus its state (items, integ, calls, runs) and
 * `inject`, a function of the call ({n, kind, method, path, body}) that may return a response to use instead.
 */
export function createSim({ ids, now = () => Date.now() } = {}) {
  let n = 0;
  const nid = (p) => `${p}SIM${String(++n).padStart(3, "0")}`;
  const stamp = () => new Date(now()).toISOString().replace(/\.\d{3}Z$/, "Z");
  const items = new Map(); // id → {proc, data}
  const integ = {};
  for (const [K, id] of Object.entries(ids)) {
    const draft = snapshotDraft(id);
    integ[id] = { K, name: DEFS[K].name, draft, published: clone(draft), active: true, status: "Live", listenUntil: 0, sample: null, ctx: {} };
  }
  const hooks = { "case.started": "I-1", ...Object.fromEntries(Object.entries(ids).map(([K, id]) => [CODE_OF[K], id])) };
  const sim = { acc: SIM_ACC, domain: SIM_HOST, items, integ, calls: [], runs: [], created: [], inject: null, url: (code) => `https://sim.invalid/hook/${encodeURIComponent(code)}` };

  const search = (proc, q) => [...items.values()].filter((x) => x.proc === proc && q && JSON.stringify(x.data).includes(q)).map((x) => clone(x.data));
  function createItem(proc, data, submitted) {
    const id = nid("Pk"), act = nid("Ak"), steps = STEPS[proc] || ["Start", "Next"];
    const d = { ...clone(data), _id: id, _status: submitted ? "InProgress" : "Draft", _current_step: steps[submitted ? 1 : 0], _current_context: [{ _context_activity_instance_id: act }], _created_at: stamp(), _modified_at: stamp() };
    items.set(id, { proc, data: d });
    sim.created.push({ id, proc, call: sim.calls.length });
    return { _id: id, _activity_instance_id: act };
  }

  /** One step of an integration, as Kissflow runs it: {ok, out} or {ok: false, message}. */
  function runStep(b, eid, ctx) {
    const e = b[eid];
    if (!e) return { ok: false, message: `sim: no step ${eid}` };
    const fms = (e["Action::FieldMapping"] || []).map((f) => b[f]).filter(Boolean);
    const val = (fm) => {
      const pr = b[(fm?.["FieldMapping::Property"] || [])[0]];
      if (!pr) return undefined;
      if (pr.Type === "Value") return pr.Value?.[0];
      if (pr.Type === "Field") return resolve(ctx, pr.Field);
      if (pr.Type === "Code") return pr.Code;
      return undefined;
    };
    const by = (name) => fms.find((f) => f.Name === name);
    const aid = e.Connector?.ActionId;
    try {
      if (aid === "Action_Kh4Jb2AoG") {
        const proc = val(by("process_id"));
        return { ok: true, out: { _id: proc, Data: search(proc, String(val(by("lookupValue")) ?? "")) } };
      }
      if (aid === "RunJSCode") {
        const inputs = {};
        for (const c of by("input_fields")?.["FieldMapping::FieldMapping"] || []) if (b[c]) inputs[b[c].Name] = val(b[c]);
        const out = new Function("inputData", val(by("js_code")))(clone(inputs));
        return { ok: true, out };
      }
      const proc = val(by("process_id"));
      const data = {};
      for (const fm of fms) {
        if (fm.Name === "process_id") continue;
        const v = val(fm);
        if (v !== undefined) data[fm.Name] = v; // a null clears the field; an unmapped one is not written
      }
      if (aid === "CreateAndSubmitItem") { const it = createItem(proc, data, true); return { ok: true, out: { ...clone(data), _id: it._id } }; }
      if (aid === "UpdateAnItem") {
        const id = data._id, it = items.get(id);
        if (!it || it.proc !== proc) throw new Error(`sim: no ${proc} item ${id}`);
        delete data._id;
        Object.assign(it.data, clone(data), { _modified_at: stamp() });
        return { ok: true, out: { ...clone(data), _id: id, _modified_at: it.data._modified_at } };
      }
      if (aid === "Action_admin_skip_complete") {
        const it = items.get(data.instance_id);
        if (!it || it.proc !== proc) throw new Error(`sim: no ${proc} item ${data.instance_id}`);
        Object.assign(it.data, { _status: "Completed", _current_step: null, _modified_at: stamp() });
        return { ok: true, out: { Success: "Completed successfully" } };
      }
      throw new Error(`sim: action ${aid} is not modelled`);
    } catch (err) {
      return { ok: false, message: err.message };
    }
  }
  function runChain(b, payload) {
    const root = b[b.Root];
    const ctx = { [root["Integration::Trigger"][0]]: clone(payload) };
    for (const eid of root["Integration::Action"] || []) {
      const r = runStep(b, eid, ctx);
      if (!r.ok) return { ok: false, at: eid, message: r.message };
      ctx[eid] = r.out;
    }
    return { ok: true };
  }
  function i1(caseId) {
    const c = items.get(caseId);
    const twins = search("CIQP_Request_A00", caseId).filter((r) => r.App_Case_Item_Id === caseId);
    if (!c || c.proc !== "CIQ_Case_A00" || c.data._status !== "InProgress" || c.data.Portal_Request_Item_Id || !c.data.Portal_Contact_Ids || twins.length)
      return { ok: false, message: "I-1 (sim): refused" };
    const users = String(c.data.Portal_Contact_Ids).split(/[,;\s]+/).filter(Boolean).map((x) => ({ _id: x }));
    const r = createItem("CIQP_Request_A00", { App_Case_Item_Id: caseId, Case_Code: c.data.Case_Code, Request_Key: `${c.data.Case_Code}|1`, Cycle_No: 1, Case_Phase_Label: "Filling in", Request_Locked: "No", Manual_Scope_JSON: "[]", Assigned_Contacts: users, Release_Contacts: users }, true);
    Object.assign(c.data, { Portal_Request_Item_Id: r._id, Case_Phase: "Supplier filling in the CIQ", _modified_at: stamp() });
    return { ok: true };
  }

  function route(method, path, body) {
    const p = path.split("?")[0];
    const qs = new URLSearchParams(path.split("?")[1] || "");
    let m;
    if (method === "GET" && /^\/flow\/2\/[^/]+\/integration\/$/.test(p))
      return ok(Object.entries(integ).map(([id, x]) => ({ _id: id, Name: x.name, Status: x.status, IsActive: x.active })));
    if (method === "PUT" && (m = /^\/flow\/2\/[^/]+\/integration\/([^/]+)\/(activate|deactivate)$/.exec(p))) {
      const x = integ[m[1]];
      if (!x) return notFound(m[1]);
      x.active = m[2] === "activate";
      return ok({ IsActive: x.active, _id: m[1], _modified_at: stamp() });
    }
    if ((m = /^\/metadata\/2\/[^/]+\/integration\/([^/]+)\/draft$/.exec(p))) {
      const x = integ[m[1]];
      if (!x) return notFound(m[1]);
      if (method === "GET") return ok(clone(x.draft));
      if (method === "PUT") { if (!body?.Root || !body[m[1]]) return { status: 400, body: { status: "error", message: "sim: not a draft" } }; x.draft = clone(body); return ok(clone(body)); }
    }
    if (method === "POST" && (m = /^\/metadata\/2\/[^/]+\/integration\/([^/]+)\/publish$/.exec(p))) {
      const x = integ[m[1]];
      if (!x) return notFound(m[1]);
      x.published = clone(x.draft); x.status = "Live";
      return ok({ _id: `Runtime_${m[1]}`, _version: null, Blob: clone(x.draft) });
    }
    if (method === "GET" && (m = /^\/integration\/2\/[^/]+\/([^/]+)\/action\/([^/]+)\/fields$/.exec(p))) {
      const extra = m[2] === "Action_RR_update_request" ? ["Release_By_Email", "Release_By_Role"] : [];
      return ok([{ Kind: "Field", Id: "ActionField002", Name: "process_id", Label: "Process", Type: "String", IsRequired: true },
        ...extra.map((f) => ({ Kind: "Field", Id: f, Name: f, Label: f.replace(/_/g, " "), Type: "String", IsRequired: false }))]);
    }
    if (method === "POST" && (m = /^\/integration\/2\/[^/]+\/([^/]+)\/trigger\/([^/]+)\/test$/.exec(p))) {
      const x = integ[m[1]];
      if (!x) return notFound(m[1]);
      x.listenUntil = now() + 60000; // the builder listens 60 s; the answer comes at once
      return ok({ status: "success" });
    }
    if (method === "POST" && (m = /^\/integration\/2\/[^/]+\/([^/]+)\/action\/([^/]+)\/test$/.exec(p))) {
      const x = integ[m[1]];
      if (!x) return notFound(m[1]);
      const T = x.draft[x.draft.Root]["Integration::Trigger"][0];
      x.ctx[T] = clone(x.sample ?? x.draft[T]?.Output); // the server-side test store: the captured sample, else the old one
      const r = runStep(x.draft, m[2], x.ctx);
      if (!r.ok) return { status: 400, body: { status: "error", error_code: "SIM_STEP_FAILED", message: r.message } };
      x.ctx[m[2]] = r.out;
      return ok(clone(r.out));
    }
    if (method === "POST" && /^\/form\/2\/[^/]+\/CIQ_Config_Version_A00\/list$/.test(p))
      return ok({ Data: [{ _id: "SIMCFG01", Config_Key: "SET:current", Payload_JSON: JSON.stringify({ webhooks: Object.fromEntries(Object.keys(hooks).map((c) => [c, sim.url(c)])) }) }] });
    if (method === "GET" && (m = /^\/process\/2\/[^/]+\/admin\/([^/]+)\/item$/.exec(p))) return ok({ Data: search(m[1], qs.get("q")) });
    if ((m = /^\/process\/2\/[^/]+\/admin\/([^/]+)\/([^/]+)$/.exec(p))) {
      const it = items.get(m[2]);
      if (!it || it.proc !== m[1]) return notFound(`${m[1]} ${m[2]}`);
      if (method === "GET") return ok(clone(it.data));
      if (method === "PUT") { Object.assign(it.data, clone(body || {}), { _modified_at: stamp() }); return ok({ _id: m[2], ...clone(body || {}) }); }
      if (method === "DELETE") { items.delete(m[2]); return ok({ status: "success" }); }
    }
    if (method === "POST" && (m = /^\/process\/2\/[^/]+\/([^/]+)\/([^/]+)\/withdraw$/.exec(p))) {
      const it = items.get(m[2]);
      if (!it || it.proc !== m[1]) return notFound(`${m[1]} ${m[2]}`);
      Object.assign(it.data, { _status: "Withdrawn", _modified_at: stamp() });
      return ok({ status: "success" });
    }
    if (method === "POST" && (m = /^\/process\/2\/[^/]+\/([^/]+)\/([^/]+)\/([^/]+)\/submit$/.exec(p))) {
      const it = items.get(m[2]);
      if (!it || it.proc !== m[1]) return notFound(`${m[1]} ${m[2]}`);
      if (it.data._current_context?.[0]?._context_activity_instance_id !== m[3]) return { status: 400, body: { status: "error", message: "sim: not the current activity" } };
      const steps = STEPS[m[1]] || ["Start", "Next"];
      const next = steps[steps.indexOf(it.data._current_step) + 1];
      if (next) Object.assign(it.data, { _status: "InProgress", _current_step: next, _current_context: [{ _context_activity_instance_id: nid("Ak") }] });
      else Object.assign(it.data, { _status: "Completed", _current_step: null, _current_context: [] });
      it.data._modified_at = stamp();
      return ok({ status: "success" });
    }
    if (method === "POST" && (m = /^\/process\/2\/[^/]+\/([^/]+)$/.exec(p))) {
      if (!STEPS[m[1]]) return notFound(m[1]);
      return ok(createItem(m[1], body || {}, false));
    }
    return notFound(`sim: no route ${method} ${p}`);
  }

  function onHook(url, payload) {
    const code = decodeURIComponent(String(url).split("/hook/")[1] || "");
    const target = hooks[code];
    if (!target) return { status: 404, text: "not found" };
    if (target === "I-1") { sim.runs.push({ key: "I-1", code, payload: clone(payload), ...i1(payload?.caseItemId) }); return { status: 200, text: '{"status":"success"}' }; }
    const x = integ[target];
    const listening = x.listenUntil && now() <= x.listenUntil;
    if (listening) { x.sample = clone(payload); x.listenUntil = 0; x.ctx = {}; }
    if (x.active) sim.runs.push({ key: x.K, code, payload: clone(payload), ...runChain(x.published, payload) });
    else if (!listening) sim.runs.push({ key: x.K, code, payload: clone(payload), ok: false, lost: true, message: "OFF: the hand-off is lost" });
    return { status: 200, text: '{"status":"success"}' };
  }

  sim.call = async (method, path, body) => {
    const c = { n: sim.calls.length + 1, kind: "rest", method, path, body: clone(body) };
    sim.calls.push(c);
    const injected = sim.inject?.(c);
    if (injected) return injected;
    return route(method, path, body);
  };
  sim.hook = async (url, payload) => {
    const c = { n: sim.calls.length + 1, kind: "hook", method: "POST", path: url, body: clone(payload) };
    sim.calls.push(c);
    const injected = sim.inject?.(c);
    if (injected) return injected;
    return onHook(url, payload);
  };
  return sim;
}
