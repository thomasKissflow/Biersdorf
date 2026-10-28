// OFFLINE ONLY. The 12 hand-off integrations as their effects on the fake app (src/app-live/kf/fakeClient.ts) and the
// fake portal (fakePortal.ts), close enough for the suites' offline runs. Each one follows its live script's guard and
// target writes (kissflow-build/ciq-digital/integrations/SPEC.md + scripts/*.js for the app container's six,
// kissflow-build/night-2026-10-20/integrations/STATUS.md + specs.mjs + scripts/*.js for I-1, I-2, I-4, I-6, I-7 and
// request.changed): it reads the item the payload names, refuses what does not hold (a run recorded as not ok, as in
// Kissflow's Run history: the webhook POST itself always "succeeds"), and writes the target. Live they run 5–15 s after
// the POST; here at once, so the first poll finds them.
// The connection acts as Thomas, and since 02:30 on 21 Oct (SPEC §2) the Integration service role, which holds the
// case's "Waiting for supplier: CIQ", has no members: I-2 records its fields, then its Approve fails with 050201 and the
// case stays at that step (`caseStepsHeld: true` replays the 20 Oct state, when the Approve moved it). I-7's "Skip and
// complete" ends a case from any step.
// Also here: offlineApp, the fake client as the suites' inner LiveAppClient (admin PUT, withdraw, delete, webhook
// dispatch, raw reads), so guardApp runs over it exactly as over REST.
import { LIST, STEPS } from "@/app-live/ids";
import { FAKE_ERRORS, type FakeClient } from "@/app-live/kf/fakeClient";
import { SYNCED_REQUEST_FIELDS } from "@/app-live/shared/handoff";
import { playEA } from "@/app-live/testing/playEA";
import type { ReviewDept } from "@/domain/types";
import { kfDateTime, type KfData } from "@/portal/kf/sdk";
import { str, type RawItem } from "@/portal/data/raw";
import type { FakePortal } from "./fakePortal";
import { INTEGRATIONS } from "./hooks";
import type { HookCode, LiveAppClient } from "./liveClient";

export interface IntegrationRun {
  at: string;
  code: HookCode | "unknown";
  /** The integration's flow id ("" when none is built for the code). */
  integration: string;
  ok: boolean;
  /** What it wrote, or why it refused (the script's own wording). */
  detail: string;
  payload: unknown;
}

export interface FakeIntegrations {
  /** Every run, in order (Kissflow's Run history). */
  runs: IntegrationRun[];
  /** Runs the integration of `code` on `payload` now. */
  dispatch(code: HookCode | undefined, payload: unknown): IntegrationRun;
}

/** The I-1 copy list (night-2026-10-20/integrations/scripts/i1-case-started.js COPY). */
const I1_COPY = ["Case_Code", "Supplier_Code", "Trade_Name", "Main_INCI", "BDF_Material_No", "BDF_Contact_Name", "BDF_Contact_Email", "Markets_Label", "Template_Label",
  "Supplier_Due_Date", "Rule_Set_Version", "Template_Version", "Config_Bundle_JSON", "Config_Bundle_Hash", "BDF_Set_JSON", "Case_Contacts_JSON"];
const COMPLETENESS = ["Completeness_Confirm", "Completeness_By_Name", "Completeness_By_Email", "Completeness_By_Role", "Completeness_At"];
/** I-7 tolerates 15 minutes between the supplier's clock and the server's (i7-case.js). */
const SKEW_MS = 15 * 60 * 1000;

class Refused extends Error {}
function refuse(why: string): never {
  throw new Refused(why);
}
/** A JSON list of users ([{_id}]) as unique {_id} values (i1-case-started.js users). */
function users(text: unknown): { _id: string }[] {
  try {
    const list = JSON.parse(typeof text === "string" && text ? text : "[]") as unknown;
    const ids = (Array.isArray(list) ? list : []).map((u) => (u && typeof (u as { _id?: unknown })._id === "string" ? (u as { _id: string })._id.trim() : "")).filter(Boolean);
    return [...new Set(ids)].map((_id) => ({ _id }));
  } catch {
    return [];
  }
}
const pick = (it: RawItem, fields: readonly string[]): KfData => Object.fromEntries(fields.map((f) => [f, it[f] === undefined ? null : it[f]]));
const cancelled = (r: RawItem) => str(r, "Case_Phase_Label").toLowerCase() === "cancelled";

export function createFakeIntegrations(o: { app: FakeClient; portal: FakePortal; now?: () => string; caseStepsHeld?: boolean }): FakeIntegrations {
  const { app, portal } = o;
  const now = () => kfDateTime(new Date(o.now?.() ?? new Date().toISOString()));
  const inApp = (flow: "case" | "op", id: unknown, what: string): RawItem => {
    const hit = typeof id === "string" ? app.find(id) : undefined;
    return hit && hit.flow === flow ? hit.item : refuse(`${what} ${String(id || "(no id)")} was not found`);
  };
  const inPortal = (flow: "request" | "query", id: unknown, what: string): RawItem => {
    const hit = typeof id === "string" ? portal.find(id) : undefined;
    return hit && hit.flow === flow ? hit.item : refuse(`${what} ${String(id || "(no id)")} was not found`);
  };
  const inProgress = (it: RawItem, what: string, also: string[] = []) => {
    const s = str(it, "_status");
    if (s && s !== "InProgress" && !also.includes(s)) refuse(`${what} ${it._id} is ${s}`);
  };
  const requestOfCase = (c: RawItem) => str(c, "Portal_Request_Item_Id") || refuse(`Case ${str(c, "Case_Code")} has no supplier request`);

  const RUN: Partial<Record<HookCode, (p: Record<string, unknown>) => string>> = {
    // I-1: the case → its CIQP Request (create and submit), linked on the case
    "case.started": (p) => {
      const c = inApp("case", p.caseItemId, "CIQ Case");
      inProgress(c, "CIQ Case");
      if (str(c, "Portal_Request_Item_Id")) refuse(`CIQ Case ${c._id} already has its CIQP Request ${str(c, "Portal_Request_Item_Id")}`);
      if (str(c, "Completeness_Confirm")) refuse(`CIQ Case ${c._id} is past the supplier's fill-in`);
      const twin = portal.db.request.find((r) => str(r, "App_Case_Item_Id") === c._id);
      if (twin) refuse(`CIQ Case ${c._id} already has CIQP Request ${twin._id} (not linked on the case yet)`);
      const assignees = users(c.Portal_Assignees_JSON);
      if (!assignees.length) refuse(`CIQ Case ${c._id} has no portal contact in Portal_Assignees_JSON`);
      const release = users(c.Release_Assignees_JSON);
      const cycleNo = Number(c.Cycle_No) || 1;
      const req = portal.createSubmitted("request", {
        Request_Key: str(c, "Request_Key").trim() || `${str(c, "Case_Code")}|${cycleNo}`,
        Cycle_No: cycleNo,
        App_Case_Item_Id: c._id,
        Supplier_Display_Name: c.Supplier_Legal_Name ?? null,
        ...pick(c, I1_COPY),
        Case_Phase_Label: "Filling in",
        Request_Locked: "No",
        Manual_Scope_JSON: "[]",
        Assigned_Contacts: assignees,
        Release_Contacts: release.length ? release : assignees,
      });
      app.set(c._id, { Portal_Request_Item_Id: req._id, Case_Phase: LIST.phase["supplier-input"] });
      return `created CIQP Request ${req._id} and linked it on the case`;
    },
    // op.round (I-3): the point's own fields → a CIQP Query round; its id onto the point
    "op.round": (p) => {
      const op = inApp("op", p.opItemId, "CIQ Open Point");
      if (str(op, "OP_Outcome")) refuse(`Open point ${str(op, "OP_Key")} is closed (${str(op, "OP_Outcome")}): no new round`);
      const assignees = str(op, "Portal_Contact_Ids").split(/[,;\s]+/).filter(Boolean).map((_id) => ({ _id }));
      if (!assignees.length) refuse(`Open point ${str(op, "OP_Key")} names no portal contact (Portal_Contact_Ids)`);
      const round = Number(op.Round_No) || 1;
      const or = (k: string, d: string) => str(op, k) || d;
      const q = portal.createSubmitted("query", {
        Query_Key: or("Query_Key", `${str(op, "OP_Key")}-R${round}`),
        Round_No: round,
        App_Open_Point_Id: op._id,
        Case_Code: or("Case_Code", ""),
        Cycle_No: Number(op.Cycle_No) || 1,
        Supplier_Code: or("Supplier_Code", ""),
        Kind_Label: or("Kind_Label", "Question"),
        Responsible_Department: or("Responsible_Dept_Label", ""),
        Responsible_Name: or("Responsible_Name", ""),
        Ref_Kind: or("Ref_Kind", "Section"),
        Ref_Label: or("Ref_Label", ""),
        Ref_Section_Key: or("Ref_Section_Key", ""),
        Ref_Field_Key: or("Ref_Field_Key", ""),
        Ref_Row_Id: or("Ref_Row_Id", ""),
        Ref_Doc_Id: or("Ref_Doc_Id", ""),
        Ref_Doc_File_Name: or("Ref_Doc_File_Name", ""),
        Ref_Doc_Uploaded_At: str(op, "Ref_Doc_Uploaded_At") || null,
        New_Section_Item_Key: or("New_Section_Item_Key", ""),
        Question_Text: or("Question_Text", ""),
        Supplier_Justification: or("Supplier_Justification", "—"),
        Supplier_Due_Date: str(op, "Supplier_Due_Date") || null,
        Assigned_Contacts: assignees,
      });
      app.set(op._id, { Portal_Query_Item_Id: q._id });
      return `created CIQP Query ${q._id} (round ${round}) and linked it on the point`;
    },
    "op.edited": (p) => {
      const op = inApp("op", p.opItemId, "CIQ Open Point");
      if (str(op, "OP_Outcome")) refuse(`Open point ${str(op, "OP_Key")} is closed (${str(op, "OP_Outcome")}): nothing to edit`);
      const qid = str(op, "Portal_Query_Item_Id") || refuse(`Open point ${str(op, "OP_Key")} has no supplier query yet`);
      portal.set(qid, { Question_Text: str(op, "Question_Text"), Supplier_Justification: str(op, "Supplier_Justification") || "—", Supplier_Due_Date: str(op, "Supplier_Due_Date") || null, Edited_At: now() });
      return `updated CIQP Query ${qid}`;
    },
    // "Skip and complete" on the point's query
    "op.closed": (p) => {
      const op = inApp("op", p.opItemId, "CIQ Open Point");
      if (!str(op, "OP_Outcome")) refuse(`Open point ${str(op, "OP_Key")} is still open: its query stays`);
      const qid = str(op, "Portal_Query_Item_Id") || refuse(`Open point ${str(op, "OP_Key")} has no supplier query`);
      if (portal.stepOf(qid) === "end" || !portal.find(qid)) refuse(`CIQP Query ${qid} is no longer open`);
      portal.complete(qid);
      return `completed CIQP Query ${qid}`;
    },
    // I-5: the case's stamp, then the request asked for its final release
    "release.requested": (p) => {
      const c = inApp("case", p.caseItemId, "CIQ Case");
      const rid = requestOfCase(c);
      const contacts = users(c.Release_Assignees_JSON);
      if (!contacts.length) refuse(`Case ${str(c, "Case_Code")} names no release contact (Release_Assignees_JSON)`);
      app.set(c._id, { Release_Requested_At: now() });
      portal.set(rid, { Release_Flag: "Requested", Request_Locked: "Yes", Case_Phase_Label: "Awaiting your final release", Release_At: null, Release_By_Name: null, Release_Contacts: contacts });
      return `stamped the case and asked CIQP Request ${rid} for its final release`;
    },
    "history.updated": (p) => {
      const c = inApp("case", p.caseItemId, "CIQ Case");
      const rid = requestOfCase(c);
      const hist = typeof p.questionsHistoryJson === "string" ? p.questionsHistoryJson : JSON.stringify(p.questionsHistoryJson ?? []);
      let parsed: unknown;
      try {
        parsed = JSON.parse(hist);
      } catch {
        refuse("questionsHistoryJson is not JSON");
      }
      if (!Array.isArray(parsed)) refuse("questionsHistoryJson is not a list");
      portal.set(rid, { Questions_History_JSON: hist });
      return `wrote Questions_History_JSON on CIQP Request ${rid}`;
    },
    "case.cancelled": (p) => {
      const c = inApp("case", p.caseItemId, "CIQ Case");
      const rid = requestOfCase(c);
      if (p.phaseLabel !== "Cancelled") refuse(`phaseLabel "${String(p.phaseLabel ?? "")}" is not accepted`);
      if (p.locked !== "Yes") refuse(`locked "${String(p.locked ?? "")}" is not accepted`);
      portal.set(rid, { Case_Phase_Label: "Cancelled", Request_Locked: "Yes" });
      return `locked CIQP Request ${rid} as Cancelled`;
    },
    // I-6
    "review.reopened": (p) => {
      const c = inApp("case", p.caseItemId, "CIQ Case");
      inProgress(c, "CIQ Case");
      const rid = str(c, "Portal_Request_Item_Id") || refuse(`CIQ Case ${c._id} has no CIQP Request`);
      const r = inPortal("request", rid, "CIQP Request");
      inProgress(r, "CIQP Request");
      if (cancelled(r)) refuse(`CIQP Request ${r._id}: the case was cancelled`);
      if (str(r, "Release_Flag") !== "Requested") refuse(`CIQP Request ${r._id} is not waiting for its final release (Release_Flag ${JSON.stringify(str(r, "Release_Flag"))})`);
      portal.set(rid, { Release_Flag: "Reopened", Request_Locked: "No", Case_Phase_Label: "With Beiersdorf" });
      return `reopened CIQP Request ${rid}`;
    },
    // request.changed: the request's 15 supplier-data fields onto its own case
    requestChanged: (p) => {
      const r = inPortal("request", p.portalRequestItemId, "CIQP Request");
      if (cancelled(r)) refuse(`CIQP Request ${r._id}: the case was cancelled`);
      const c = inApp("case", str(r, "App_Case_Item_Id") || refuse(`CIQP Request ${r._id} names no app case`), "CIQ Case");
      inProgress(c, "CIQ Case", ["Completed"]);
      if (str(c, "Portal_Request_Item_Id") !== r._id) refuse(`CIQ Case ${c._id} is linked to ${str(c, "Portal_Request_Item_Id") || "no request"}, not ${r._id}`);
      app.set(c._id, pick(r, SYNCED_REQUEST_FIELDS));
      return `copied the ${SYNCED_REQUEST_FIELDS.length} supplier-data fields to CIQ Case ${c._id}`;
    },
    // I-2: completeness and the answers onto the case with Review_Depts, then E-A (22 Oct: the round-1 reviews and ONE
    // case-level review.started row, before the Approve, so a refused Approve leaves them), then the Approve
    completenessConfirmed: (p) => {
      const r = inPortal("request", p.portalRequestItemId, "CIQP Request");
      if (cancelled(r)) refuse(`CIQP Request ${r._id}: the case was cancelled`);
      if (str(r, "Completeness_Confirm") !== "Confirmed") refuse(`CIQP Request ${r._id}: completeness is not confirmed`);
      const c = inApp("case", str(r, "App_Case_Item_Id") || refuse(`CIQP Request ${r._id} names no app case`), "CIQ Case");
      inProgress(c, "CIQ Case");
      if (str(c, "Portal_Request_Item_Id") !== r._id) refuse(`CIQ Case ${c._id} is linked to ${str(c, "Portal_Request_Item_Id") || "no request"}, not ${r._id}`);
      if (str(c, "Completeness_Confirm")) refuse(`CIQ Case ${c._id} already has its completeness (${str(c, "Completeness_Confirm")})`);
      if (!app.stepOf(c._id)?.act) refuse(`CIQ Case ${c._id} has no open step`);
      app.set(c._id, { ...pick(r, [...COMPLETENESS, ...SYNCED_REQUEST_FIELDS, "Review_Depts"]), Case_Phase: LIST.phase.review });
      const depts = str(r, "Review_Depts").split(",").map((d) => d.trim().toUpperCase()).filter(Boolean) as ReviewDept[];
      const started = playEA(app, c._id, depts, now());
      if (!o.caseStepsHeld) refuse(`recorded the completeness on CIQ Case ${c._id} and started ${started.length} reviews, then its Approve of "Waiting for supplier: CIQ" was refused: ${FAKE_ERRORS.queue} (held by Integration service, which has no members)`);
      app.move(c._id, STEPS.case.release);
      return `recorded the completeness on CIQ Case ${c._id}, started ${started.length} reviews and moved it to review`;
    },
    // I-4: the supplier's answer onto the open point this query belongs to
    queryAnswered: (p) => {
      const q = inPortal("query", p.portalQueryItemId, "CIQP Query");
      if (!str(q, "Response_Kind") && !str(q, "Response_Text")) refuse(`CIQP Query ${q._id} has no answer`);
      const op = inApp("op", str(q, "App_Open_Point_Id") || refuse(`CIQP Query ${q._id} names no open point`), "CIQ Open Point");
      inProgress(op, "CIQ Open Point");
      if (str(op, "Portal_Query_Item_Id") !== q._id) refuse(`CIQ Open Point ${op._id} waits on ${str(op, "Portal_Query_Item_Id") || "no query"}, not ${q._id}`);
      if (str(op, "OP_Outcome")) refuse(`CIQ Open Point ${op._id} already has its outcome (${str(op, "OP_Outcome")})`);
      app.set(op._id, { ...pick(q, ["Response_Kind", "Response_Text", "Response_Doc_Refs_JSON", "Supplier_Responsible_Email"]), OP_Progress: LIST.opProgress["in-progress"] });
      return `wrote the answer of CIQP Query ${q._id} on CIQ Open Point ${op._id}`;
    },
    // I-7: the supplier's release onto the case, which completes ("Skip and complete")
    releaseGiven: (p) => {
      const r = inPortal("request", p.portalRequestItemId, "CIQP Request");
      if (!str(r, "Release_At") || !str(r, "Release_By_Name")) refuse(`CIQP Request ${r._id} has no final release`);
      if (cancelled(r)) refuse(`CIQP Request ${r._id}: the case was cancelled`);
      if (str(r, "Release_Flag") === "Reopened") refuse(`CIQP Request ${r._id} was reopened`);
      if (str(r, "Release_Flag") !== "Requested") refuse(`CIQP Request ${r._id}: Beiersdorf has not requested its final release (Release_Flag ${JSON.stringify(str(r, "Release_Flag"))})`);
      const c = inApp("case", str(r, "App_Case_Item_Id") || refuse(`CIQP Request ${r._id} names no app case`), "CIQ Case");
      inProgress(c, "CIQ Case");
      if (!str(c, "Completeness_Confirm")) refuse(`CIQ Case ${c._id} has no completeness yet, so it cannot be released`);
      if (str(c, "Portal_Request_Item_Id") !== r._id) refuse(`CIQ Case ${c._id} is linked to ${str(c, "Portal_Request_Item_Id") || "no request"}, not ${r._id}`);
      const asked = Date.parse(str(c, "Release_Requested_At"));
      const given = Date.parse(str(r, "Release_At"));
      if (!Number.isFinite(asked)) refuse(`CIQ Case ${c._id}: Beiersdorf has not requested the final release`);
      if (!Number.isFinite(given) || given + SKEW_MS < asked) refuse(`CIQ Case ${c._id}: the supplier's release (${str(r, "Release_At") || "none"}) is older than the request for it (${str(c, "Release_Requested_At")})`);
      app.set(c._id, { Final_Release_Confirm: "Confirmed", Final_Release_By_Name: str(r, "Release_By_Name"), Final_Release_At: str(r, "Release_At"), Case_Phase: LIST.phase.completed });
      app.move(c._id, STEPS.case.end);
      return `recorded the final release on CIQ Case ${c._id} and completed it`;
    },
  };

  const runs: IntegrationRun[] = [];
  return {
    runs,
    dispatch(code, payload) {
      const i = code ? INTEGRATIONS[code] : undefined;
      const fn = code ? RUN[code] : undefined;
      let ok = false;
      let detail: string;
      if (!code) detail = "no integration listens on this URL";
      else if (!i || !fn) detail = `no integration is built for ${code}`;
      else {
        try {
          detail = fn((payload ?? {}) as Record<string, unknown>);
          ok = true;
        } catch (e) {
          // a refusal is the script's own error; anything else is a bug in this fake
          if (!(e instanceof Refused)) throw e;
          detail = e.message;
        }
      }
      const run: IntegrationRun = { at: now(), code: code ?? "unknown", integration: i?.id ?? "", ok, detail, payload: structuredClone(payload) };
      runs.push(run);
      return run;
    },
  };
}

// ---------------------------------------------------------------------------------- the fake as the inner client

/** Raw reads offline: the integration lists (all 12 Live and ON); every other path has no offline answer. */
export function offlineRaw(path: string): unknown {
  const m = /^\/flow\/2\/[^/]+\/integration\/\?_application_id=([A-Za-z0-9_]+)/.exec(path);
  if (!m) throw new Error(`No offline answer for GET ${path.split("?")[0]}.`);
  return Object.values(INTEGRATIONS)
    .filter((i): i is { id: string; app: string } => !!i && i.app === m[1])
    .map((i) => ({ _id: i.id, Name: i.id, Type: "Integration", Status: "Live", IsActive: true, _application_id: i.app }));
}

/** The fake client as an inner LiveAppClient (wrap it in guardApp): admin PUT = the fake's integration write, withdraw
 *  = status Withdrawn, delete = gone, webhook POSTs recorded by the fake and dispatched to the fake integrations. */
export function offlineApp(fake: FakeClient, o: { dispatch(url: string, payload: unknown, code?: HookCode): void; raw?: (path: string) => unknown }): LiveAppClient {
  const known = (id: string) => {
    if (!fake.find(id)) throw new Error(FAKE_ERRORS.notFound(id));
  };
  return {
    accountId: fake.accountId,
    appId: fake.appId,
    adminList: fake.adminList,
    adminGet: fake.adminGet,
    myTasks: fake.myTasks,
    myItems: fake.myItems,
    getTask: fake.getTask,
    getById: fake.getById,
    update: fake.update,
    submit: fake.submit,
    discard: fake.discard,
    formList: fake.formList,
    formGet: fake.formGet,
    formUpdate: fake.formUpdate,
    async create(f, data, onId) {
      const r = await fake.create(f, data);
      onId?.(r.id);
      return r;
    },
    async formCreate(f, data, onDraft) {
      const id = await fake.formCreate(f, data);
      const made = fake.calls.at(-1)?.result as { draftId?: string } | undefined;
      if (made?.draftId) onDraft?.(made.draftId); // the fake creates and submits at once
      return id;
    },
    async postWebhook(url, payload, code) {
      const route = await fake.postWebhook(url, payload);
      o.dispatch(url, payload, code);
      return route;
    },
    async adminPut(_f, id, data) {
      known(id);
      fake.set(id, data);
    },
    async withdraw(_f, id) {
      known(id);
      fake.set(id, { _status: "Withdrawn" });
    },
    async remove(f, id) {
      const list = fake.db[f];
      const at = list.findIndex((x) => x._id === id);
      if (at < 0) throw new Error(FAKE_ERRORS.notFound(id));
      list.splice(at, 1);
    },
    oneRead: (fn) => fn(),
    async getRaw(path) {
      return (o.raw ?? offlineRaw)(path);
    },
    // Kissflow's search: an item any of whose top-level values is the text
    adminSearch: async (f, text) => fake.db[f].filter((it) => Object.values(it).some((v) => v === text)).map((it) => structuredClone(it)),
  };
}
