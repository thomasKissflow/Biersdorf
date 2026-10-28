// S-INTEGRITY (tests-2026-10-21/SPEC.md §4): read only, at the start and at the end of each run. It writes NOTHING
// (no item, no ledger line, no webhook): the last step proves it from the client calls and, live, the request log.
// Steps (each one recorded, each with its read-back):
//  1. the 12 hand-off integrations are Live and ON (SPEC §2, read-only);
//  2. names: every flow of both apps follows the rule (app "CIQ ", portal "CIQP "), with the exceptions listed (spikes,
//     retired flows, Thomas's own); the flows the code uses exist, are Live and carry the names the code gives them;
//  3. names: the field ids the code reads and writes (live/integrity/codeFields.ts: a static scan of src/app-live and
//     src/portal, and the per-flow lists the code declares) against each flow's fields, per flow both ways. The fields
//     come from the 02:29 snapshot's draft wherever the live flow list shows the flow unchanged since (else the live
//     draft, one call); the source is recorded per flow. Offline (every draft the snapshot's) a flow also gets the
//     fields it gained since, as integrity/snapshotOverlay.ts lists them (recorded with the source); live never;
//  4. names: the steps the code knows (ids.ts STEPS/STEP_NAMES, portal.ts STEPS) exist with those names;
//  5. names: the roles of both apps against ids.ts ROLES / OTHER_ROLES and portal.ts ROLES (and who is in them);
//  6. no corruption: the fingerprint of every item that is not this run's (fingerprint.ts) at the start, saved under
//     results/<run>/ (the start phase first removes an earlier attempt's file; a completed end phase retires the one
//     it compared with, so an end phase never compares with a stale start); at the end the same again and its diff,
//     which must be empty. A flow that either phase could not read is left out of the diff and named. Every changed or
//     new item is read in full: one that is this run's after all (guard.owns: an integration made it for the run, no
//     suite adopted it) is reported as such, not blamed on someone else;
//  7. no corruption: every ledger item of this run reads back (raw, and as the app's own load maps it), or is gone
//     (404) where it should be: R2/R3 delete their items before the end, R1 keeps them at their stages. Its values are
//     also checked against sources apart from the item: the key fields its ledger lines recorded, the run's tag, the
//     app's own audit snapshot (a case's header, a note's text, an open point's question); child tables row for row;
//     no warning of the loads names it. Step 6's run items that are not in the ledger fail here (cleanup reads only
//     the ledger). The item's _modified_at is NOT bounded by its ledger lines: the ledger gets a line on a create or a
//     stage, not on every write, and the integrations write run items after writes to other items (I-2 the case after
//     the request's confirm, history.updated the request after a decision on a point);
//  8. no corruption: this run's items: each JSON field parses (no `self:` inside), no user field holds a pseudo id
//     (`self:`, `contact:`, `u-…`), every date is valid;
//  9. no corruption: the same for every other item the fingerprint read (not this run's doing, but on the morning list);
// 10. read-only: no write call, no new ledger line, (live) every logged request a read; so nothing of its own to delete.
// Live, one phase per process, named explicitly: LIVE=1 RUN=R1|R2|R3 PHASE=start before the other suites, PHASE=end
// after them (the end phase diffs against the start's fingerprint file).
// Offline (the default) the suite runs both phases around a rehearsed run (the app's own writers on the fakes); the
// names steps read the 02:29 snapshot (and its overlay) instead of the live lists. INTEGRITY_FULL=1 reads every process
// item in full for the fingerprint (one admin GET each, about 100 calls live) instead of its My items row.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import * as A from "@/domain/actions";
import * as M from "@/domain/suppliers";
import type { Market } from "@/domain/types";
import { APP_ID, FLOWS, LIST, OTHER_ROLES, ROLES, TABLES } from "@/app-live/ids";
import { FLOW_LABEL } from "@/app-live/load";
import { ACTION_LABEL, parseSnapshot, type AuditSnapshot } from "@/app-live/map/auditMap";
import type { FlowKey, FormKey, WritableMethod } from "@/app-live/types";
import { childRows, str, userIds, type RawItem } from "@/portal/data/raw";
import { PORTAL_ID, FLOWS as PORTAL_FLOWS, ROLES as PORTAL_ROLES, STEPS as PORTAL_STEP_DEFS, type FlowKey as PortalFlowKey } from "@/portal/kf/portal";
import { errorText, rowsOf } from "@/portal/kf/sdk";
import { DEV_ACCOUNT } from "@/shell/env";
import { attribute, declared, fieldReport, lex, scanCode, type Use } from "./integrity/codeFields";
import { classifyFlow, isGone, itemProblems, usedFlows, validDate, type FlowRow, type Problem } from "./integrity/checks";
import { FLOW_TYPES, draftAfterPublish, offlineAnswer, parseDraft, snapshotCurrent, snapshotFlow, snapshotIndex, type FlowMeta } from "./integrity/drafts";
import { SNAPSHOT_OVERLAY, withOverlay } from "./integrity/snapshotOverlay";
import { tap, type TapCall } from "./integrity/tap";
import { diff, fingerprint, type Fingerprint } from "./lib/fingerprint";
import { checkIntegrations } from "./lib/hooks";
import { createLedger, type LedgerEntry } from "./lib/ledger";
import { DEV_HOST, GuardError, KfError, appOfFlow, classifyPath, createGuard, createLiveClient, createRequestLog, createRest, heldSteps, kindOfFlow, type Holder, type LiveAppClient, type LogEntry, type Transport } from "./lib/liveClient";
import { PORTAL_STEPS, createLivePortalClient } from "./lib/livePortalClient";
import { StopError, createQueue, virtualClock } from "./lib/queue";
import { recorder, type Recorder, type StepCtx } from "./lib/results";
import { LIVE, RUN, boot, bootPortal, cleanupRun, createWorld, perform, type Booted, type PortalBooted, type World } from "./lib/world";

export type Phase = "start" | "end";
const FULL = process.env.INTEGRITY_FULL === "1";
/** A test item of ANOTHER session, by its known tags (OTHER_TEST_TAGS, default the portal session's "ZZT-NT" of 21 Oct):
 *  one of its keys starts with such a tag. Only named tags: the fixtures and older dev data use "ZZT-" codes too. */
const OTHER_TAGS = (process.env.OTHER_TEST_TAGS ?? "ZZT-NT").split(",").map((t) => t.trim()).filter(Boolean);
const OTHER_KEYS = ["Case_Code", "Request_Key", "Query_Key", "OP_Key", "Review_Key", "Supplier_Code", "RMES_Key", "Note_Key"];
const otherTestItem = (it: RawItem): boolean => OTHER_KEYS.some((k) => typeof it[k] === "string" && OTHER_TAGS.some((t) => (it[k] as string).startsWith(`${t}-`) || it[k] === t));
const START_PRINT = "integrity-fingerprint-start.json";
/** The start fingerprint once an end phase compared with it (kept for the reader; never compared with again). */
const START_PRINT_USED = "integrity-fingerprint-start.compared.json";
/** A ledger stage saying the item was taken away on purpose (a discarded draft, a suite's cleanup). */
const GONE_STAGE = /discard|delet|remov|gone|clean/i;
/** SPEC §3: R2 and R3 delete their own items at the end; R1 (and an offline rehearsal) keeps them. */
export const deletesItsItems = (run: string) => run === "R2" || run === "R3";

/** Every flow the code uses (ids.ts FLOWS, portal.ts FLOWS), by flow id. */
const CODE_FLOWS = [
  ...Object.entries(FLOWS).map(([key, f]) => ({ app: APP_ID, key, id: f.id, kind: f.kind as string })),
  ...Object.entries(PORTAL_FLOWS).map(([key, f]) => ({ app: PORTAL_ID, key, id: f.id, kind: f.kind as string })),
];
const APP_KEY = new Map(Object.entries(FLOWS).map(([k, f]) => [f.id as string, k as FlowKey]));
const PORTAL_KEY = new Map(Object.entries(PORTAL_FLOWS).map(([k, f]) => [f.id as string, k as PortalFlowKey]));
/** The raw fields that matter in a read-back: the item's state, its key and its links. */
const KEY_FIELDS = ["_id", "_status", "_current_step", "_modified_at", "Case_Code", "Cycle_No", "Review_Key", "Review_Dept", "OP_Key", "OP_Dept", "Round_No", "Query_Key", "Request_Key",
  "Note_Key", "Event_Key", "Action_Code", "Supplier_Code", "Supplier_Legal_Name", "RMES_Key", "Case_Item_Id", "Object_Item_Id", "Portal_Request_Item_Id", "Portal_Query_Item_Id",
  "App_Case_Item_Id", "App_Open_Point_Id"];
const keysOf = (it: RawItem | undefined) => (it ? Object.fromEntries(KEY_FIELDS.filter((k) => it[k] != null && it[k] !== "").map((k) => [k, it[k]])) : undefined);
const day = (iso: unknown) => (typeof iso === "string" ? iso.slice(0, 10) : "");
const same = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");
/** The forms whose rows carry child tables (load.ts CHILD_TABLE_FORMS): their list rows have none. */
const CHILD_TABLE_FORMS = new Set<string>([FLOWS.supplier.id, FLOWS.rmesSAF.id, FLOWS.rmesREG.id]);
/** The key fields a ledger line may name ("Case_Code=… Supplier_Code=…" as liveClient whatOf writes it, "Request_Key=
 *  …|1" as the suites adopt): identities, set once. Supplier_Legal_Name is left out (a name: editable, with spaces). */
const LEDGER_KEYS = new Set(["Case_Code", "Review_Key", "OP_Key", "RMES_Key", "Event_Key", "Action_Code", "Note_Key", "Supplier_Code", "Request_Key", "Query_Key"]);
/** The step names the offline tests and the matrix refer to. */
const STEP6_START = "no corruption: the fingerprint of everything that is not this run's, at the start";
const STEP6_END = "no corruption: nothing that is not this run's changed during the run";
const STEP7 = "no corruption: every ledger item of this run reads back (or is gone where it should be)";
const STEP8 = "no corruption: this run's items (JSON parses, real user ids, valid dates)";

// ------------------------------------------------------------------------------------------------ one phase

interface LedgerRead {
  flow: string;
  app: string;
  id: string;
  stage: string;
  what: string;
  item?: RawItem;
  gone?: boolean;
  error?: string;
}

interface Phased {
  rec: Recorder;
  calls: TapCall[];
  print?: Fingerprint;
}

/** One S-INTEGRITY phase on world `w0`. Reads only; a StopError ends it at once (after the results so far are saved). */
export async function runIntegrity(w0: World, phase: Phase, o: { rec?: Recorder; startPrint?: Fingerprint } = {}): Promise<Phased> {
  const rec = o.rec ?? w0.recorder(`integrity-${phase}`);
  const calls: TapCall[] = [];
  // the suite's own view of the world: the same clients, every call recorded
  const w: World = { ...w0, client: tap(w0.client, "app", calls), portal: tap(w0.portal, "portal", calls) };
  const acc = w.client.accountId;
  const ledgerLines = w.ledger.byRun().length;
  const logFrom = w.log.entries.length;
  /** Over the fakes (the REST rehearsal too: its stub transport answers from them and the snapshot), never live. */
  const offline = !LIVE && !!w.offline;
  w.assertRunning();
  // an earlier attempt's start fingerprint must never stand in for this attempt's (a start that stops before step 6)
  const printFile = join(dirname(rec.file), START_PRINT);
  if (phase === "start") rmSync(printFile, { force: true });

  // a stop during a step is a stop, whatever the step made of it (the app's load turns a 429 on its index read into
  // its own error, and a 429 on a row read into a warning): the step is not-run and the run ends (results.ts)
  const step = (name: string, fn: (s: StepCtx) => Promise<void> | void) =>
    rec.step(name, async (s) => {
      try {
        await fn(s);
      } finally {
        w.assertRunning();
      }
    });

  // read-only routes only (classifyPath, offline too), each path read once per phase
  const cache = new Map<string, Promise<unknown>>();
  const raw = (path: string): Promise<unknown> => {
    // the live suite's own allow-list (offline: the same path with the dev account, which the fakes do not use)
    const use = classifyPath("GET", path.replace(`/${acc}/`, `/${DEV_ACCOUNT}/`), DEV_ACCOUNT);
    if (!use.read) return Promise.reject(new GuardError(`S-INTEGRITY reads only (${path.split("?")[0]}).`));
    let p = cache.get(path);
    if (!p) cache.set(path, (p = w.live ? w.client.getRaw(path) : Promise.resolve().then(() => offlineAnswer(path) ?? w.client.getRaw(path))));
    return p;
  };
  const scan = scanCode();
  let rows: FlowRow[] | undefined;
  let metas: Map<string, FlowMeta> | undefined;
  let print: Fingerprint | undefined;
  let ledger: LedgerRead[] | undefined;
  /** Step 6 (end): changed or new items that are this run's although no ledger line names them. */
  const unledgered: Record<string, unknown>[] = [];

  // 1 ------------------------------------------------------------------------------------------------
  await step("integrations: the 12 hand-offs are Live and ON", async (s) => {
    const r = await checkIntegrations({ accountId: acc, getRaw: raw } as unknown as LiveAppClient);
    s.readBack("integration list rows of both apps (code, id, Status, IsActive)", r.states);
    s.check("every hand-off integration is listed, Live and ON", r.ok, r.problems);
  });

  // 2 ------------------------------------------------------------------------------------------------
  await step("names: every flow of both apps follows the naming rule; the code's flows exist with their names", async (s) => {
    const got: FlowRow[] = [];
    const failed: { app: string; type: string; error: string }[] = [];
    for (const app of [APP_ID, PORTAL_ID])
      for (const type of FLOW_TYPES) {
        try {
          for (const r of rowsOf(await raw(`/flow/2/${acc}/${type}/?_application_id=${app}&page_number=1&page_size=300`)))
            got.push({ app, type, id: String(r._id ?? ""), name: String(r.Name ?? ""), status: String(r.Status ?? ""), ...(typeof r.IsActive === "boolean" ? { isActive: r.IsActive } : {}), modifiedAt: String(r._modified_at ?? ""), lastPublishedAt: String(r.LastPublishedAt ?? "") });
        } catch (e) {
          if (e instanceof GuardError || e instanceof StopError) throw e;
          failed.push({ app, type, error: errorText(e) });
        }
      }
    s.readBack("flow list rows of both apps (app, type, id, Name, Status)", got.map((r) => ({ app: r.app, type: r.type, id: r.id, name: r.name, status: r.status, ...(r.isActive !== undefined ? { isActive: r.isActive } : {}) })));
    s.check("every flow list was read", !failed.length, failed.map((f) => `${f.app} ${f.type}: ${f.error}`));
    // a list that failed leaves its flows out, not missing: what depends on a whole app's lists is checked only for the
    // apps read in full, and the drafts (steps 3, 4) only when every list was read
    const unreadApps = new Set(failed.map((f) => f.app));
    if (!failed.length) rows = got;

    const used = usedFlows(FLOW_LABEL);
    const classified = got.map((r) => ({ r, ...classifyFlow(r, used) }));
    const breaks = classified.filter((x) => !x.follows && !x.why).map((x) => `${x.r.app} ${x.r.type} ${x.r.id} "${x.r.name}"`);
    s.check(`every flow name starts "CIQ " (app) or "CIQP " (portal), or is a listed exception`, !breaks.length, breaks);
    s.note("exceptions", classified.filter((x) => !x.follows || (x.kind !== "used" && x.kind !== "other")).map((x) => ({ app: x.r.app, type: x.r.type, id: x.r.id, name: x.r.name, kind: x.kind, follows: x.follows, why: x.why ?? "(not a known exception)" })));
    s.note("notUsedByTheCode", classified.filter((x) => x.kind === "other").map((x) => `${x.r.type} ${x.r.id} "${x.r.name}"`));

    const byName = new Map<string, FlowRow[]>();
    for (const r of got) byName.set(r.name.trim().toLowerCase(), [...(byName.get(r.name.trim().toLowerCase()) ?? []), r]);
    const dupes = [...byName.values()].filter((l) => l.length > 1).map((l) => l.map((r) => `${r.app} ${r.id} "${r.name}"`).join(" = "));
    s.check("flow names are unique across both apps", !dupes.length, dupes);

    const missing: string[] = [];
    const notLive: string[] = [];
    const misnamed: string[] = [];
    const notChecked: string[] = [];
    for (const [id, u] of used) {
      const r = got.find((x) => x.id === id && x.app === u.app);
      if (!r && unreadApps.has(u.app)) {
        notChecked.push(`${u.app} ${id}`);
        continue;
      }
      if (!r) {
        missing.push(`${u.app} ${id}`);
        continue;
      }
      if (r.status !== "Live") notLive.push(`${id} is ${r.status || "?"}`);
      if (u.name && r.name !== u.name && !(u.retired && r.name === `ZZZ (Not in Use) ${u.name}`)) misnamed.push(`${id}: "${r.name}", the code says "${u.name}"`);
    }
    s.check("every flow the code uses is listed in its app", !missing.length, missing);
    s.check("every flow the code uses is Live", !notLive.length, notLive);
    s.check("every flow the code names has that name (load.ts FLOW_LABEL, portal.ts FLOWS)", !misnamed.length, misnamed);
    if (notChecked.length) s.note("notChecked", { why: `the flow lists of ${[...unreadApps].join(", ")} could not all be read`, flows: notChecked });
    const ids = new Set(got.map((r) => r.id));
    const unknown = group(scan.flows.filter((u) => !ids.has(u.token)));
    if (failed.length) s.note("flowIdsNotChecked", "the flow ids the code names are checked only when every flow list was read");
    else s.check("every flow id the code names (…_A00) is a flow of one of the apps", !unknown.length, unknown);
  });

  // 3 ------------------------------------------------------------------------------------------------
  if (!rows) rec.notRun("names: the code's field ids against each flow's fields", "needs every flow list of step 2, and not all could be read");
  else
    await step("names: the code's field ids against each flow's fields", async (s) => {
      const got = new Map<string, FlowMeta>();
      const sources: Record<string, unknown>[] = [];
      for (const f of CODE_FLOWS) {
        const row = rows!.find((r) => r.id === f.id && r.app === f.app);
        if (!row) {
          s.check(`${f.id}: listed (its fields can be read)`, false, "not in the flow list");
          continue;
        }
        const snap = snapshotFlow(f.app, row.type, f.id);
        const current = !!snap && snapshotCurrent(snap.list, { _modified_at: row.modifiedAt });
        const base = { flow: f.id, app: f.app, modifiedAt: row.modifiedAt, lastPublishedAt: row.lastPublishedAt, draftAfterPublish: draftAfterPublish({ _modified_at: row.modifiedAt, LastPublishedAt: row.lastPublishedAt }) };
        try {
          const draft = current ? snap!.draft : await raw(`/metadata/2/${acc}/${row.type}/${f.id}/draft?_application_id=${f.app}`);
          // offline every draft is the snapshot's (offlineAnswer serves the route from it too): with the fields the flow
          // gained since (snapshotOverlay.ts); live the draft as read, a flow changed after the snapshot read afresh
          const added = offline ? (SNAPSHOT_OVERLAY[f.id] ?? []) : [];
          const meta = offline ? withOverlay(parseDraft(f.id, draft)) : parseDraft(f.id, draft);
          got.set(f.id, meta);
          sources.push({ ...base, source: current ? `snapshot ${snap!.file} (flow unchanged since ${String(snap!.list._modified_at)})` : snap ? `live draft (the flow changed at ${row.modifiedAt}, after the snapshot's ${String(snap.list._modified_at)})` : "live draft (no snapshot file)", ...(added.length ? { overlay: added.map((a) => `${a.field} (${a.type}, as ${a.like}): ${a.source}`) } : {}), fields: meta.fields.size, tables: [...meta.models.keys()] });
          s.check(`${f.id}: its draft has fields`, meta.fields.size > 0, base);
        } catch (e) {
          if (e instanceof GuardError || e instanceof StopError) throw e;
          s.check(`${f.id}: its metadata was read`, false, errorText(e));
        }
      }
      metas = got;
      s.note("sources", sources);
      // a flow changed after its last publish may have a draft whose fields are not live yet (the published field list
      // has no route the suite may call, so the draft stands in for it): for the reader to weigh
      s.note("changedAfterPublish", sources.filter((x) => x.draftAfterPublish).map((x) => `${String(x.flow)}: modified ${String(x.modifiedAt)}, published ${String(x.lastPublishedAt)}`));
      for (const [id, m] of got) s.readBack(`${id} fields (id: type, model)`, Object.fromEntries([...m.fields].map(([k, v]) => [k, `${v.type}${v.model === id ? "" : ` in ${v.model}`}`])));

      // both ways, per flow (codeFields.ts fieldReport): what the code names that no flow has (attributed to its
      // neighbours' flow), what each flow lacks of what the code declares for it, what each flow has that the code never
      // names (fields only the integrations or the portal write, the build's history), and ids.ts's step gate against
      // the draft's permissions (Thomas sets them by hand: a drift is for his morning list, not a failure)
      const report = fieldReport(scan, got);
      s.check("every field id the code names is a field (or table) of a flow it uses", !report.lacks.length, report.lacks);
      s.note("scan", { files: scan.files.length, names: new Set(scan.fields.map((u) => u.token)).size, uses: scan.fields.length });
      for (const [id, r] of report.perFlow) {
        s.check(`${id}: every field and table the code declares for it exists`, !r.missing.length, r.missing);
        s.check(`${id}: every field the code treats as a formula is one (an Expression in the draft)`, !r.noFormula.length, r.noFormula);
      }
      s.note("perFlow", Object.fromEntries([...report.perFlow].map(([id, r]) => [id, { codeLacks: r.codeLacks, flowOnly: r.flowOnly, ...(r.drift.length ? { permissionDrift: r.drift } : {}) }])));
    });

  // 4 ------------------------------------------------------------------------------------------------
  if (!metas) rec.notRun("names: the code's steps exist with their names", "needs the flows' drafts of step 3");
  else
    await step("names: the code's steps exist with their names", async (s) => {
      for (const [id, d] of declared()) {
        if (!d.steps.length) continue;
        const m = metas!.get(id);
        if (!m) {
          s.check(`${id}: its draft was read`, false);
          continue;
        }
        s.readBack(`${id} steps (activity id: name)`, Object.fromEntries(m.activities));
        const wrong = d.steps.filter((x) => m.activities.get(x.activity) !== x.name).map((x) => `${x.activity}: the code says "${x.name}" (${x.why}), the draft ${m.activities.has(x.activity) ? `"${m.activities.get(x.activity)}"` : "has no such step"}`);
        s.check(`${id}: every step the code knows exists with that name`, !wrong.length, wrong);
      }
    });

  // 5 ------------------------------------------------------------------------------------------------
  await step("names: the roles of both apps match ids.ts ROLES and portal.ts ROLES", async (s) => {
    const expect = [
      ...[...Object.values(ROLES), ...Object.values(OTHER_ROLES)].map((r) => ({ app: APP_ID, id: r.id, name: r.name, why: "ids.ts" })),
      ...Object.values(PORTAL_ROLES).map((r) => ({ app: PORTAL_ID, id: r.id, name: r.name, why: "portal.ts" })),
    ];
    const members: Record<string, Record<string, number>> = {};
    for (const app of [APP_ID, PORTAL_ID]) {
      const list = rowsOf(await raw(`/app_role/2/${acc}/list?_application_id=${app}&page_number=1&page_size=100`)).map((r) => ({ id: String(r._id ?? ""), name: String(r.Name ?? ""), userCount: Number(r.UserCount ?? 0) }));
      s.readBack(`${app} roles (id, Name, UserCount)`, list);
      members[app] = Object.fromEntries(list.map((r) => [r.name, r.userCount]));
      const wrong = expect.filter((e) => e.app === app).filter((e) => list.find((r) => r.id === e.id)?.name !== e.name).map((e) => `${e.id}: ${e.why} says "${e.name}", live ${list.find((r) => r.id === e.id) ? `"${list.find((r) => r.id === e.id)!.name}"` : "has no such role"}`);
      s.check(`${app}: every role the code knows exists with that name`, !wrong.length, wrong);
      const names = list.map((r) => r.name.toLowerCase());
      s.check(`${app}: role names are unique`, new Set(names).size === names.length, list.map((r) => r.name));
      s.note(`${app} roles the code does not know`, list.filter((r) => !expect.some((e) => e.id === r.id)).map((r) => r.name));
    }
    // SPEC §2 as read at 02:30: only Business administrator and Admin have Thomas; Integration service is empty
    s.note("members", members);
    const integration = members[APP_ID]?.[OTHER_ROLES.integration.name] ?? 0;
    if (integration > 0) s.note("specDrift", `${OTHER_ROLES.integration.name} has ${integration} member(s) now (SPEC §2: none): I-2's Approve may move a case again.`);
  });

  // 6 ------------------------------------------------------------------------------------------------
  const STEP6 = phase === "start" ? STEP6_START : STEP6_END;
  // the start file of this attempt only: the start phase removed an earlier one, a completed end phase retires it
  const fromFile = phase === "end" && !o.startPrint && existsSync(printFile);
  const before = phase === "end" ? (o.startPrint ?? (fromFile ? (JSON.parse(readFileSync(printFile, "utf8")) as Fingerprint) : undefined)) : undefined;
  const printCalls = { from: 0, to: 0 };
  if (phase === "end" && !before) rec.notRun(STEP6, `no start fingerprint of this attempt (${START_PRINT}): S-INTEGRITY's start phase did not run for ${w.run} since its last end phase, or stopped before its step 6`);
  else
    await step(STEP6, async (s) => {
      printCalls.from = calls.length;
      print = await fingerprint({ app: w.client, portal: w.portal }, w.ledger, { adminGet: FULL });
      printCalls.to = calls.length;
      const counts: Record<string, number> = {};
      for (const p of print.prints) counts[p.flow] = (counts[p.flow] ?? 0) + 1;
      s.readBack(`items per flow (${FULL ? "each read by an admin GET" : "My items rows and form list rows"}), with their _modified_at`, counts);
      s.check("every flow was read", !print.errors.length, print.errors);
      if (phase === "start") {
        mkdirSync(dirname(printFile), { recursive: true });
        writeFileSync(printFile, JSON.stringify(print, null, 1));
        s.note("saved", printFile);
        return;
      }
      // a flow either phase could not read is not compared (every one of its items would read as gone, or as new)
      const unread = [...before!.errors.map((e) => ({ ...e, phase: "start" })), ...print.errors.map((e) => ({ ...e, phase: "end" }))];
      const skip = new Set(unread.map((e) => e.flow));
      const compared = (f: Fingerprint) => f.prints.filter((p) => !skip.has(p.flow));
      const d = diff(compared(before!), compared(print), new Set(w.ledger.byRun().map((e) => e.id)));
      s.readBack("the diff from the start (this run's ledger items left out)", { changed: d.changed, removed: d.removed, added: d.added, same: d.same, startedAt: before!.at, ...(skip.size ? { notCompared: [...skip] } : {}) });
      s.check("every flow was compared (read at the start and now)", !unread.length, unread);
      // every changed or new item in full (a My items row holds system fields only; a form list row and INTEGRITY_FULL's
      // admin reads are whole): who changed it (the portal session shares the key), and whether it is this run's after
      // all (guard.owns: it names only this run's ledger items, or carries the tag): e.g. a query op.round made after the
      // suite's 60-s poll gave up. Those fail step 7, not this one.
      const printed = printedRows(calls.slice(printCalls.from, printCalls.to));
      const ours = new Set<string>();
      const others = new Set<string>();
      const otherTests: Record<string, unknown>[] = [];
      const who: Record<string, unknown>[] = [];
      for (const p of [...d.changed, ...d.added]) {
        const whole = FULL || kindOfFlow(p.flow) === "form" ? printed.get(`${p.flow}|${p.id}`)?.item : undefined;
        const r = whole ? { item: whole } : await readOne(w, p.flow, p.id);
        const row = { flow: p.flow, id: p.id, ...(r.item ? { modifiedAt: r.item._modified_at, modifiedBy: r.item._modified_by, keys: keysOf(r.item) } : { error: r.error ?? "gone" }) };
        if (r.item && w.guard.owns(r.item)) {
          ours.add(`${p.flow}|${p.id}`);
          unledgered.push(row);
        } else if (r.item && otherTestItem(r.item)) {
          // another session's ZZT test item (the portal session tests on the same key tonight, tag ZZT-NT…): listed, not a
          // failure of this run; anything else that changed still fails
          others.add(`${p.flow}|${p.id}`);
          otherTests.push(row);
        } else who.push(row);
      }
      if (otherTests.length) s.note("other sessions' ZZT test items (changed or new, not this run's)", otherTests);
      const theirs = (l: { flow: string; id: string }[]) => l.filter((p) => !ours.has(`${p.flow}|${p.id}`) && !others.has(`${p.flow}|${p.id}`)).length;
      s.check("no item that is not this run's changed, appeared or went away", !theirs(d.changed) && !d.removed.length && !theirs(d.added), { changed: theirs(d.changed), removed: d.removed.length, added: theirs(d.added) });
      if (who.length) s.note("whoChanged", who);
      if (unledgered.length) s.note("thisRunsButNotInTheLedger", unledgered);
    });

  // 7 ------------------------------------------------------------------------------------------------
  await step(STEP7, async (s) => {
    const entries = w.ledger.latest().filter((e) => e.stage !== "draft");
    const drafts = w.ledger.latest().filter((e) => e.stage === "draft");
    if (drafts.length) s.note("skipped", drafts.map((e) => `${e.flow} ${e.id}: a form's draft id (the user's single draft), not an item`));
    // step 6's finds: R2/R3 cannot delete them, and R1's morning cleanup (cleanup.mjs reads the ledger) will not see them
    if (unledgered.length) s.check(`every item of ${w.run} is in its ledger (cleanup reads only the ledger)`, false, unledgered);
    if (!entries.length) {
      ledger = [];
      if (!unledgered.length) s.skip(`the ${w.run} ledger names no item yet: nothing to read back`);
      s.readBack(`the ${w.run} ledger`, { items: 0 });
      return;
    }
    // R2/R3 at their end: each item once (it should answer 404); otherwise the app's own loads first, so the item reads
    // share their reads (one load's listings and admin reads; the form rows as the load read them)
    const deletes = phase === "end" && deletesItsItems(w.run);
    const read = await w.client.oneRead(async () => {
      const views = deletes ? {} : await views0(w, entries);
      const items: LedgerRead[] = [];
      // `what` as first recorded (a later stage line, e.g. cleanupRun's "deleted", may say only "cleanup")
      const whatOf = (id: string) => w.ledger.byRun().find((x) => x.id === id)?.what ?? "";
      for (const e of entries) items.push({ flow: e.flow, app: e.app || appOfFlow(e.flow) || "?", id: e.id, stage: e.stage, what: whatOf(e.id), ...(rowOfViews(views, e.flow, e.id) ?? (await readOne(w, e.flow, e.id))) });
      return { views, items };
    }, { scope: "run" });
    ledger = read.items;
    const views = read.views;
    // a load's warning that names an item of this run: the app could not read it in full (a supplier's contacts, an
    // RMES row's criteria; the load then keeps the list row), which the item's own read-back would not show
    const warnings = loadWarnings(views);
    if (warnings.length) s.note("loadWarnings", warnings);
    const naming = warnings.filter((t) => ledger!.some((r) => mentions(t, r.id)));
    if (!deletes) s.check("no warning of the app's loads names an item of this run", !naming.length, naming);
    const holder = { userId: w.who.id, roleIds: new Set(w.heldRoles.portal.map((x) => x.id)) };
    for (const r of ledger) {
      const label = `${r.flow} ${r.id} (${r.what}; stage ${r.stage})`;
      const goneOk = GONE_STAGE.test(r.stage) || deletes;
      if (r.error) {
        s.check(`${label}: reads back`, false, r.error);
        continue;
      }
      if (r.gone) {
        s.readBack(label, { gone: true });
        const ok = goneOk || phase === "start";
        s.check(`${label}: gone (404) only where it should be`, ok, ok ? undefined : `stage "${r.stage}" does not say it was taken away`);
        continue;
      }
      if (deletes) {
        // a leftover: the app's loads did not run (every item should be gone), so its raw keys only
        s.readBack(label, { raw: keysOf(r.item) });
        s.check(`${label}: deleted by the end of ${w.run}`, false, "still there: a leftover for the morning list");
        continue;
      }
      const m = mappedOf(r, views, holder);
      s.readBack(label, { raw: keysOf(r.item), mapped: m.mapped ?? m.note });
      if (GONE_STAGE.test(r.stage)) s.check(`${label}: taken away as its stage says`, false, "it still reads back");
      for (const [what, ok, detail] of [...sourceChecks(r, w, views), ...m.checks]) s.check(`${label}: ${what}`, ok, detail);
    }
    s.note("expect", deletes ? `${w.run} deletes its items: every one must be gone (404)` : phase === "end" ? `${w.run} keeps its items at their stages` : "start of the run: earlier attempts' items read back or gone");
  });

  // 8, 9 ---------------------------------------------------------------------------------------------
  const metaOf = (flowId: string) => metas?.get(flowId);
  if (!ledger) rec.notRun(STEP8, "needs the ledger read-back of step 7");
  else
    await step(STEP8, async (s) => {
      const items = ledger!.filter((r) => r.item);
      if (!items.length) s.skip(ledger!.length ? `every item of ${w.run} is gone: nothing to check` : `the ${w.run} ledger names no item yet: nothing to check`);
      const found = items.flatMap((r) => itemProblems(r.item!, metaOf(r.flow)).map((p) => ({ flow: r.flow, id: r.id, ...p })));
      s.readBack("this run's items checked (flow, id, fields)", items.map((r) => ({ flow: r.flow, id: r.id, fields: Object.keys(r.item!).length })));
      s.check("every JSON field parses and holds no self: id; every user field a real user; every date valid", !found.length, found);
      if (!metas) s.note("types", "no drafts (step 3): the field types are guessed from the names");
    });
  const rest = print ? restRows(calls.slice(printCalls.from, printCalls.to), w) : undefined;
  if (!rest) rec.notRun("no corruption: every other item the key reads (JSON parses, real user ids, valid dates)", "needs the fingerprint's reads of step 6");
  else
    await step("no corruption: every other item the key reads (JSON parses, real user ids, valid dates)", async (s) => {
      if (!rest.length) s.skip("the fingerprint read no item that is not this run's: nothing to check");
      const found: (Problem & { flow: string; id: string })[] = [];
      for (const r of rest) for (const p of itemProblems(r.item, metaOf(r.flow))) found.push({ flow: r.flow, id: r.id, ...p });
      const per: Record<string, number> = {};
      for (const r of rest) per[r.flow] = (per[r.flow] ?? 0) + 1;
      s.readBack(`rows checked per flow (${FULL ? "full items" : "form rows in full, process items as their My items rows"})`, per);
      // not this run's doing, but corruption all the same (Thomas's morning list): its own line in the matrix
      s.check("every JSON field parses and holds no self: id; every user field a real user; every date valid", !found.length, found.slice(0, 50));
      if (found.length > 50) s.note("more", found.length - 50);
    });

  // 10 -----------------------------------------------------------------------------------------------
  await step("read-only: S-INTEGRITY wrote nothing (so it has nothing of its own to clean up)", (s) => {
    const entries = w.log.entries.slice(logFrom);
    const r = readOnlyProblems(calls, entries);
    const perMethod: Record<string, number> = {};
    for (const c of calls) perMethod[`${c.side}.${c.method}`] = (perMethod[`${c.side}.${c.method}`] ?? 0) + 1;
    s.readBack("this phase's client calls per method, and its logged requests", { calls: perMethod, requests: entries.length });
    s.check("no write call (create, update, submit, PUT, withdraw, delete, webhook)", !r.writes.length, r.writes);
    s.check("every logged request is a read (classifyPath)", !r.requests.length, r.requests);
    s.check("no new ledger line", w.ledger.byRun().length === ledgerLines, { before: ledgerLines, after: w.ledger.byRun().length });
    s.note("cleanup", `S-INTEGRITY creates no items, so ${w.run} has nothing of its own to delete`);
  });
  // the end phase ran to its end (a stop throws before this): its start file is used up, and kept beside for the reader
  if (fromFile) renameSync(printFile, join(dirname(printFile), START_PRINT_USED));
  return { rec, calls, ...(print ? { print } : {}) };
}

/** Uses grouped by name, with up to five places each. */
function group(uses: Use[]): { token: string; at: string[] }[] {
  const m = new Map<string, string[]>();
  for (const u of uses) m.set(u.token, [...(m.get(u.token) ?? []), `${u.file}:${u.line}`]);
  return [...m].map(([token, at]) => ({ token, at: at.slice(0, 5) }));
}

/** Writes among the calls, and logged requests that are not reads (webhooks included). */
export function readOnlyProblems(calls: TapCall[], log: LogEntry[], acc = DEV_ACCOUNT): { writes: string[]; requests: string[] } {
  const writes = calls.filter((c) => c.write).map((c) => `${c.side}.${c.method}${c.flow ? ` ${c.flow}` : ""}${c.id ? ` ${c.id}` : ""}`);
  const requests: string[] = [];
  for (const e of log) {
    let read = false;
    try {
      read = !e.path.startsWith("webhook:") && classifyPath(e.method, e.path, acc).read;
    } catch {
      read = false;
    }
    if (!read) requests.push(`${e.method} ${e.path.split("?")[0]}`);
  }
  return { writes, requests };
}

/** One item by its flow id, read once (admin GET, a form GET): the item, gone (404), or the read's error. */
async function readOne(w: World, flowId: string, id: string): Promise<{ item?: RawItem; gone?: boolean; error?: string }> {
  try {
    const app = APP_KEY.get(flowId);
    const portal = PORTAL_KEY.get(flowId);
    if (app) return { item: kindOfFlow(flowId) === "process" ? await w.client.adminGet(app as "case", id) : await w.client.formGet(app as "audit", id) };
    if (portal) return { item: await w.portal.adminGet(portal, id) };
    return { error: `${flowId} is no flow of either app` };
  } catch (e) {
    if (e instanceof GuardError || e instanceof StopError) throw e;
    return isGone(e) ? { gone: true } : { error: errorText(e) };
  }
}

interface Views {
  rmm?: Booted;
  auditor?: Booted;
  portal?: PortalBooted;
}

/** The app's own loads (scope "run": this run's items only) the read-back compares with: RMM (cases, reviews, open
 *  points, notes, audit, suppliers), the Auditor (the RMES forms), the portal as the self contact. */
async function views0(w: World, entries: { flow: string; app: string }[]): Promise<Views> {
  const flows = new Set(entries.map((e) => e.flow));
  const v: Views = {};
  if (entries.some((e) => (e.app || appOfFlow(e.flow)) === APP_ID)) v.rmm = await boot(w, "rmm", { scope: "run" });
  if (flows.has(FLOWS.rmesSAF.id) || flows.has(FLOWS.rmesREG.id)) v.auditor = await boot(w, "auditor", { scope: "run" });
  if (entries.some((e) => (e.app || appOfFlow(e.flow)) === PORTAL_ID)) v.portal = await bootPortal(w, { scope: "run" });
  return v;
}

/** A form row as the app's load read it (its child tables included); process items are read through the load's
 *  shared admin reads instead (readOne). A child-table form row whose full read failed in the load (load.ts keeps the
 *  list row, which has no tables: snap.unreadRows) is read once more by its form GET, so its rows are still checked. */
function rowOfViews(v: Views, flowId: string, id: string): { item: RawItem } | undefined {
  const key = APP_KEY.get(flowId);
  if (!key || kindOfFlow(flowId) !== "form" || key === "scopeRun" || key === "config") return undefined;
  const form = key as Exclude<FormKey, "scopeRun">;
  const b = key === "rmesSAF" || key === "rmesREG" ? v.auditor : v.rmm;
  const item = b?.snap.forms[form].find((r) => r._id === id);
  if (!item) return undefined;
  const unread = b!.snap.unreadRows?.[form]?.includes(id) || !Object.keys(item).some((k) => k.startsWith("Table::"));
  return CHILD_TABLE_FORMS.has(flowId) && unread ? undefined : { item };
}

/** Every warning of the loads (the app's as RMM and as the Auditor, the portal's as the self contact). */
function loadWarnings(v: Views): string[] {
  return [
    ...(v.rmm?.warnings ?? []).map((t) => `RMM load: ${t}`),
    ...(v.auditor?.warnings ?? []).map((t) => `Auditor load: ${t}`),
    ...(v.portal?.data.warnings ?? []).map((t) => `portal load: ${t}`),
  ];
}

/** The text names the item id (as a word: "PkCase5" is not named by "PkCase50"). */
const mentions = (text: string, id: string) => new RegExp(`(^|[^A-Za-z0-9_])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-z0-9_])`).test(text);

type MappedCheck = [string, boolean, unknown?];

/** One ledger item against the app's (or portal's) own mapping of it: the domain object the screens show, compared on
 *  the fields they rely on (as map/roundtrip.test.ts does). */
function mappedOf(r: LedgerRead, v: Views, holder: Holder): { mapped?: Record<string, unknown>; note?: string; checks: MappedCheck[] } {
  const it = r.item!;
  const checks: MappedCheck[] = [];
  const eq = (label: string, raw: unknown, mapped: unknown) => checks.push([`maps ${label}`, same(raw, mapped), { raw, mapped }]);
  const b = r.flow === FLOWS.rmesSAF.id || r.flow === FLOWS.rmesREG.id ? v.auditor : v.rmm;
  const caseOfItem = (itemId: string) => {
    const ref = b && [...b.mapped.index.cases.values()].find((x) => x.itemId === itemId);
    return ref ? { ref, c: b!.state.cases.find((c) => c.id === ref.caseId) } : undefined;
  };
  const draft = (flow: "case" | "review" | "op") => {
    const d = b?.drafts.find((x) => x.flow === flow && x.itemId === it._id);
    checks.push(["is the user's own Start draft (Diagnostics' drafts)", !!d]);
    return { mapped: d ? { draft: d.label, activityId: d.activityId } : undefined, checks };
  };
  if (!b && r.app === APP_ID) return { note: "no app load", checks: [["the app loaded", false]] };
  switch (r.flow) {
    case FLOWS.case.id: {
      if (str(it, "_status") === "Draft") return draft("case");
      const x = caseOfItem(it._id);
      checks.push(["is a case on the screens", !!x?.c]);
      if (!x?.c) break;
      const c = x.c;
      eq("Case_Code → id", str(it, "Case_Code"), c.id.replace(/·\d+$/, ""));
      eq("Trade_Name → materialName", it.Trade_Name, c.materialName);
      eq("Main_INCI → inci", it.Main_INCI, c.inci);
      eq("BDF_Material_No → materialNo", it.BDF_Material_No, c.materialNo);
      eq("Supplier_Code → supplierId", it.Supplier_Code, c.supplierId);
      eq("Supplier_Due_Date → dueDate", day(it.Supplier_Due_Date), day(c.dueDate));
      eq("Cycle_No → cycleNo", Number(it.Cycle_No ?? 1), x.ref.cycleNo);
      if (str(it, "Portal_Request_Item_Id")) eq("Portal_Request_Item_Id", it.Portal_Request_Item_Id, x.ref.portalRequestItemId);
      return { mapped: { id: c.id, phase: c.phase, materialName: c.materialName, supplierId: c.supplierId, dueDate: c.dueDate, reviews: c.reviews.length, openPoints: c.openPoints.length, notes: c.internalNotes.length }, checks };
    }
    case FLOWS.review.id: {
      if (str(it, "_status") === "Draft") return draft("review");
      const ref = b && [...b.mapped.index.reviews.values()].find((x) => x.itemId === it._id);
      const t = ref && b!.state.cases.find((c) => c.id === ref.caseId)?.reviews.find((x) => x.dept === ref.dept);
      checks.push(["is a review track on the screens", !!t]);
      if (!ref || !t) break;
      eq("Review_Dept → dept", it.Review_Dept, t.dept);
      eq("Review_Key", it.Review_Key, ref.reviewKey);
      eq("Round_No → roundNo", Number(it.Round_No ?? 1), ref.roundNo);
      return { mapped: { caseId: ref.caseId, dept: t.dept, status: t.status, roundNo: ref.roundNo }, checks };
    }
    case FLOWS.op.id: {
      if (str(it, "_status") === "Draft") return draft("op");
      const ref = b && [...b.mapped.index.ops.values()].find((x) => x.itemId === it._id);
      const p = ref && b!.state.cases.find((c) => c.id === ref.caseId)?.openPoints.find((x) => x.id === ref.opId);
      checks.push(["is an open point on the screens", !!p]);
      if (!ref || !p) break;
      eq("OP_Key → id", it.OP_Key, p.id);
      eq("OP_Dept → dept", it.OP_Dept, p.dept);
      eq("Question_Text → question", it.Question_Text, p.question);
      eq("Round_No → rounds", Number(it.Round_No ?? 1), p.rounds);
      eq("Supplier_Due_Date → dueDate", day(it.Supplier_Due_Date), day(p.dueDate));
      eq("OP_Outcome → outcome", str(it, "OP_Outcome"), p.outcome ? LIST.opOutcome[p.outcome] : "");
      if (str(it, "Portal_Query_Item_Id")) eq("Portal_Query_Item_Id", it.Portal_Query_Item_Id, ref.portalQueryItemId);
      return { mapped: { id: p.id, caseId: ref.caseId, dept: p.dept, status: p.status, rounds: p.rounds, outcome: p.outcome }, checks };
    }
    case FLOWS.note.id: {
      const x = caseOfItem(str(it, "Case_Item_Id"));
      const n = x?.c?.internalNotes.find((y) => y.id === (str(it, "Note_Key") || it._id));
      checks.push(["is a note on its case", !!n]);
      if (!n) break;
      eq("Note_Text → text", it.Note_Text, n.text);
      return { mapped: { caseId: x!.c!.id, id: n.id, by: n.by, dept: n.dept, text: n.text }, checks };
    }
    case FLOWS.audit.id: {
      const code = str(it, "Action_Code");
      checks.push(["Action_Code is a code the app reads (auditMap ACTION_LABEL)", code in ACTION_LABEL, code]);
      // every row the app writes has one (write/audit.ts); a list row without it would make the JSON check vacuous
      checks.push(["Snapshot_JSON is there and reads as the app's snapshot (parseSnapshot)", !!parseSnapshot(it)]);
      const caseItem = str(it, "Case_Item_Id");
      if (caseItem) checks.push(["names a case on the screens", !!caseOfItem(caseItem)?.c, caseItem]);
      return { mapped: { code, label: ACTION_LABEL[code as keyof typeof ACTION_LABEL], caseId: caseItem ? caseOfItem(caseItem)?.c?.id : undefined }, checks };
    }
    case FLOWS.supplier.id: {
      const ref = b && [...b.mapped.index.suppliers.values()].find((x) => x.itemId === it._id);
      const sup = ref && b!.state.suppliers.find((x) => x.id === ref.supplierId);
      checks.push(["is a supplier on the screens", !!sup]);
      if (!ref || !sup) break;
      eq("Supplier_Code → id", it.Supplier_Code, sup.id);
      eq("Supplier_Legal_Name → name", it.Supplier_Legal_Name, sup.name);
      // row for row, and at least one (an empty table proves nothing: a list row has none)
      const rowIds = childRows(it, TABLES.contacts, "Contacts_Email").map((x) => String(x._id ?? ""));
      const known = Object.values(ref.contactRows);
      checks.push(["has contact rows (its Contacts table was read)", rowIds.length > 0, rowIds.length]);
      checks.push(["every contact row is one contact on the screens (as many as rows)", rowIds.length === known.length && rowIds.every((id) => known.includes(id)), { rows: rowIds, mapped: known }]);
      return { mapped: { id: sup.id, name: sup.name, contacts: sup.contactIds.length, active: sup.active !== false }, checks };
    }
    case FLOWS.rmesSAF.id:
    case FLOWS.rmesREG.id: {
      const ref = b && [...b.mapped.index.rmes.values()].find((x) => x.itemId === it._id);
      checks.push(["is an RMES record on the screens", !!ref]);
      if (!ref) break;
      // row for row (trackMap.ts rmesOf): ensureRmes writes the criteria with the row, so there is at least one; findings
      // come with saveRmes, so none is fine
      const t = TABLES[ref.dept];
      const rows = (model: string, field: string) => childRows(it, model, field).map((x) => String(x._id ?? ""));
      const oneEach = (got: string[], mapped: string[]) => got.length === mapped.length && got.every((id) => mapped.includes(id));
      const crit = Object.values(ref.criteriaRows);
      const find = Object.values(ref.findingRows);
      const critRows = rows(t.criteria, "Criteria_Code");
      const findRows = rows(t.findings, "Findings_Key");
      checks.push(["has criteria rows (its criteria table was read)", critRows.length > 0, critRows.length]);
      checks.push(["every criteria row is one criterion on the screens (as many as rows)", oneEach(critRows, crit), { rows: critRows, mapped: crit }]);
      checks.push(["every finding row is one finding on the screens (as many as rows)", oneEach(findRows, find), { rows: findRows, mapped: find }]);
      return { mapped: { caseId: ref.caseId, dept: ref.dept, criteria: crit.length, findings: find.length }, checks };
    }
    case FLOWS.scopeRun.id:
      return { note: "raw only: the app's load reads no CIQ Scope Run rows (the app's ensureReviews wrote them until 22 Oct)", checks };
    case PORTAL_FLOWS.request.id:
    case PORTAL_FLOWS.query.id: {
      const bundles = v.portal?.data.bundles ?? [];
      const isRequest = r.flow === PORTAL_FLOWS.request.id;
      const bundle = bundles.find((x) => (isRequest ? x.request?._id === it._id : x.queries.some((q) => q._id === it._id)));
      // an item whose current step Kissflow assigns to the self contact (its _current_context, as the portal's own task
      // listing reads it) must be on the supplier's screen
      const mine = heldSteps(it, PORTAL_STEPS[isRequest ? "request" : "query"] ?? {}, holder).length > 0;
      if (mine) checks.push(["is on the self contact's screen (the portal's own load)", !!bundle]);
      if (bundle) eq("Case_Code → the bundle's code", it.Case_Code, bundle.code);
      return bundle ? { mapped: { code: bundle.code, step: bundle.step, queries: bundle.queries.length }, checks } : { note: mine ? "missing from the portal's load" : "not a task of the self contact: raw only", checks };
    }
    default:
      checks.push(["is a flow the suite knows", false, r.flow]);
  }
  return { checks };
}

/** One ledger item against sources apart from the item (its mapping compares a value with the app's reading of the same
 *  value, which finds mapper bugs, not a value someone else wrote): the key fields its ledger lines recorded when its
 *  id became known; that it is this run's (guard.owns; a case code carries the tag); the app's own latest audit
 *  snapshot of it (write/audit.ts records the object with each action, in a row of its own): a case's header, a note,
 *  an open point's key, department and question. */
function sourceChecks(r: LedgerRead, w: World, v: Views): MappedCheck[] {
  const it = r.item!;
  const out: MappedCheck[] = [];
  const agree = (label: string, item: unknown, source: unknown, from: string) => {
    const ok = same(item, source);
    out.push([`${label} is as ${from}`, ok, ok ? undefined : { item: item ?? null, [from]: source ?? null }]);
  };
  for (const [k, want] of Object.entries(ledgerKeys(w.ledger.byRun(), r.id))) agree(k, it[k], want, "the ledger recorded it");
  out.push([`is ${w.run}'s (names only its ledger items, or carries "${w.tag}")`, w.guard.owns(it)]);
  const code = str(it, "Case_Code");
  if (code) out.push([`Case_Code carries "${w.tag}"`, code.startsWith(`${w.tag}-`), code]);
  if (str(it, "_status") === "Draft") return out; // an unsent Start draft has no audit row yet
  const audit = v.rmm?.snap.forms.audit ?? [];
  if (r.flow === FLOWS.case.id) {
    const h = lastSnap(audit, it._id, "case");
    out.push(["has the app's audit snapshot of its header (case.created)", !!h]);
    if (h) {
      const from = `its audit (${h.code})`;
      agree("Case_Code", it.Case_Code, h.value.caseId, from);
      agree("Trade_Name", it.Trade_Name, h.value.materialName, from);
      agree("Main_INCI", it.Main_INCI, h.value.inci, from);
      agree("BDF_Material_No", it.BDF_Material_No, h.value.materialNo, from);
      agree("Supplier_Code", it.Supplier_Code, h.value.supplierId, from);
      agree("Supplier_Due_Date", day(it.Supplier_Due_Date), day(h.value.dueDate), from);
      agree("Cycle_No", Number(it.Cycle_No ?? 1), h.value.cycleNo, from);
    }
  } else if (r.flow === FLOWS.note.id) {
    const n = lastSnap(audit, it._id, "note");
    out.push(["has the app's audit snapshot (note.added)", !!n]);
    if (n) {
      agree("Note_Key", it.Note_Key, n.value.id, `its audit (${n.code})`);
      agree("Note_Text", it.Note_Text, n.value.text, `its audit (${n.code})`);
    }
  } else if (r.flow === FLOWS.op.id) {
    const p = lastSnap(audit, it._id, "op");
    out.push(["has the app's audit snapshot (op.raised, …)", !!p]);
    if (p) {
      agree("OP_Key", it.OP_Key, p.value.id, `its audit (${p.code})`);
      agree("OP_Dept", it.OP_Dept, p.value.dept, `its audit (${p.code})`);
      agree("Question_Text", it.Question_Text, p.value.question, `its audit (${p.code})`);
    }
  }
  return out;
}

/** The key fields every ledger line of the item names ("Key=value"; the first line that names a key wins). */
function ledgerKeys(lines: LedgerEntry[], id: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of lines) {
    if (e.id !== id) continue;
    for (const m of e.what.matchAll(/(?:^|\s)([A-Za-z_]+)=(\S+)/g)) if (LEDGER_KEYS.has(m[1]!) && !(m[1]! in out)) out[m[1]!] = m[2]!;
  }
  return out;
}

/** The app's latest audit snapshot (by Event_At) of `part` for the item (a case's by its header's itemId, the others by
 *  the row's Object_Item_Id), with the row's Action_Code. */
function lastSnap<K extends "case" | "note" | "op">(audit: RawItem[], itemId: string, part: K): { value: NonNullable<AuditSnapshot[K]>; code: string } | undefined {
  const at = (row: RawItem) => str(row, "Event_At") || str(row, "_created_at");
  let out: { value: NonNullable<AuditSnapshot[K]>; code: string } | undefined;
  for (const row of [...audit].sort((a, b) => at(a).localeCompare(at(b)))) {
    const snap = parseSnapshot(row);
    const value = snap?.[part];
    if (!value) continue;
    const of = part === "case" ? snap!.case!.itemId || str(row, "Object_Item_Id") || str(row, "Case_Item_Id") : str(row, "Object_Item_Id");
    if (of === itemId) out = { value: value as NonNullable<AuditSnapshot[K]>, code: str(row, "Action_Code") };
  }
  return out;
}

/** The rows the fingerprint's calls read, by flow id and item id (its list rows, or its admin reads when INTEGRITY_FULL). */
function printedRows(calls: TapCall[]): Map<string, { flow: string; id: string; item: RawItem }> {
  const out = new Map<string, { flow: string; id: string; item: RawItem }>();
  for (const c of calls) {
    if (!c.rows || !c.flow) continue;
    const flow = c.side === "app" ? FLOWS[c.flow as FlowKey]?.id : PORTAL_FLOWS[c.flow as PortalFlowKey]?.id;
    if (!flow) continue;
    for (const it of c.rows) out.set(`${flow}|${it._id}`, { flow, id: it._id, item: { ...out.get(`${flow}|${it._id}`)?.item, ...it } });
  }
  return out;
}

/** The rows the fingerprint read that are not this run's. */
const restRows = (calls: TapCall[], w: World) => [...printedRows(calls).values()].filter((r) => !w.ledger.has(r.id));

// ------------------------------------------------------------------------------------------------ live

/** PHASE=start|end, required live (a phase guessed from the files on disk could be taken mid-run). */
const livePhase = (): Phase => {
  const p = process.env.PHASE;
  if (p === "start" || p === "end") return p;
  throw new Error(`LIVE=1 needs PHASE=start (before the other suites) or PHASE=end (after them); got "${p ?? ""}".`);
};

// ------------------------------------------------------------------------------------------------ offline

/** OFFLINE ONLY: a run in between the phases, through the app's own writers on the fakes: a supplier (a row with its
 *  contacts table), a case (I-1 makes its request, adopted as the suites do), a note on it. The data varies by run. */
async function rehearse(w: World): Promise<void> {
  const v = { R1: { market: "EU", type: "manufacturer" }, R2: { market: "UK", type: "distributor" }, R3: { market: "CN", type: "manufacturer" } }[w.run] ?? { market: "US", type: "distributor" };
  const write = async (persona: "admin" | "rmm", method: WritableMethod, args: unknown[], run: Parameters<typeof perform>[4]) => {
    const r = await perform(w, await boot(w, persona), method, args, run);
    expect(r.result, r.refused ?? r.result?.message).toMatchObject({ ok: true });
  };
  const sup: M.SupplierInput = { name: w.text("Supplier"), duns: "000000021", country: "DE", city: "Hamburg", type: v.type as M.SupplierInput["type"], contacts: [{ name: "Ines Kaltenbach", email: `ines.kaltenbach.${w.run.toLowerCase()}@zzt-n21.example`, title: "Quality", mayConfirm: true }] };
  await write("admin", "addSupplier", [sup], (s, by) => M.addSupplier(s, by, sup).state);
  const input: A.NewCaseInput = { materialName: w.text("Glycerin"), inci: "Glycerin", materialNo: w.key("RM-1"), supplierId: "SUP-ZZT-SOLVARO", contactIds: ["UsElena", "UsRavi"], markets: [v.market as Market], dueDate: "2026-11-30T17:00:00.000Z", priority: "normal" };
  const code = w.key("INT-C01");
  await write("rmm", "createCase", [input], (s, by) => A.createCase(s, by, input, undefined, code).state);
  const caseRow = w.ledger.latest().find((e) => e.flow === FLOWS.case.id)!;
  const polled = await w.hooks.poll(() => w.client.adminGet("case", caseRow.id), (it) => !!it.Portal_Request_Item_Id);
  expect(polled.ok).toBe(true);
  w.adopt(PORTAL_FLOWS.request.id, String(polled.value!.Portal_Request_Item_Id), `Request_Key=${code}|1 (created by I-1)`, "fill");
  const text = w.text("note: the CoA is from 2025.");
  await write("rmm", "addInternalNote", [code, text], (s, by) => A.addInternalNote(s, by, code, text));
}

/**
 * OFFLINE ONLY: the world `src` as the live suite sees it, over the live REST layer (createRest, restApp, restPortal, the
 * guards, the ONE queue on a virtual clock, the request log) with a stub transport instead of kf.mjs. The stub answers
 * the read routes from `src`'s fakes (My items, form lists, admin and task GETs, in pages of 50) and the 02:29 snapshot
 * (flow lists, role lists, drafts), in their live shapes; any other route fails the test. `fail` answers a call in its
 * place (a 429, a 500), for the tests of a stop and of a failed read.
 */
function restWorld(src: World, o: { fail?: StubFail } = {}): World {
  const fake = src.offline!.app;
  const fakePortal = src.offline!.portal;
  const clock = virtualClock();
  const queue = createQueue({ clock });
  const ledger = createLedger({ run: src.run });
  for (const e of src.ledger.byRun()) ledger.add({ flow: e.flow, app: e.app, id: e.id, what: e.what, stage: e.stage });
  const log = createRequestLog();
  const guard = createGuard({ ledger, tag: src.tag });
  const err = (status: number, code: string, text: string) => ({ status, body: { error_code: code, en_message: text } });
  const page = (rows: RawItem[], q: URLSearchParams) => {
    const n = Number(q.get("page_number") ?? 1);
    const size = Number(q.get("page_size") ?? 50);
    return { status: 200, body: { Data: rows.slice((n - 1) * size, n * size).map((r) => structuredClone(r)) } };
  };
  const find = (flowId: string, id: string): RawItem | undefined => {
    const app = APP_KEY.get(flowId);
    if (app) return fake.db[app].find((x) => x._id === id);
    const p = PORTAL_KEY.get(flowId);
    return p === "request" || p === "query" ? fakePortal.db[p].find((x) => x._id === id) : undefined;
  };
  const mine = (flowId: string) => {
    const app = APP_KEY.get(flowId);
    const p = PORTAL_KEY.get(flowId);
    const rows = app ? fake.db[app] : p === "request" || p === "query" ? fakePortal.db[p] : [];
    return rows.filter((r) => userIds(r, "_created_by")[0] === src.who.id);
  };
  const transport: Transport = {
    acc: DEV_ACCOUNT,
    domain: DEV_HOST,
    async call(method, path) {
      const failed = o.fail?.(method, path);
      if (failed) return failed;
      const [p = "", query = ""] = path.split("?");
      const q = new URLSearchParams(query);
      const s = p.split("/").filter(Boolean); // [family, 2, acc, …]
      const snap = method === "GET" ? offlineAnswer(path) : undefined;
      if (snap !== undefined) return { status: 200, body: snap };
      if (s[0] === "process" && method === "GET") {
        if (s[3] === "admin") {
          const it = find(s[4]!, s[5]!);
          return it ? { status: 200, body: structuredClone(it) } : err(404, "KISSFLOW_ERROR_01015", "The item could not be located.");
        }
        if (s[4] === "myitems") return page(mine(s[3]!), q);
        const it = find(s[3]!, s[4]!);
        const ctx = Array.isArray(it?._current_context) ? (it!._current_context as Record<string, unknown>[]) : [];
        if (it && s.length === 6 && ctx.some((c) => c._context_activity_instance_id === s[5])) return { status: 200, body: { ...structuredClone(it), _activity_instance_id: s[5] } };
        return err(400, "KISSFLOW_ERROR_050201", "This item has moved out of your queue.");
      }
      if (s[0] === "form" && method === "POST" && s[4] === "list") return page(fake.db[APP_KEY.get(s[3]!)!].map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith("Table::"))) as RawItem), q);
      if (s[0] === "form" && method === "GET" && s.length === 5) {
        const it = find(s[3]!, s[4]!);
        return it ? { status: 200, body: structuredClone(it) } : err(404, "KISSFLOW_ERROR_01015", "The item could not be located.");
      }
      throw new Error(`the stub has no answer for ${method} ${p}`);
    },
  };
  const rest = createRest({ transport, queue, log, guard });
  const client = createLiveClient(rest, { userId: src.who.id, roleIds: new Set(src.heldRoles.app.map((r) => r.id)) });
  const portal = createLivePortalClient(rest, { userId: src.who.id, roleIds: new Set(src.heldRoles.portal.map((r) => r.id)) });
  return {
    ...src,
    live: true,
    clock,
    queue,
    ledger,
    log,
    guard,
    client,
    portal,
    recorder: (suite) => recorder({ suite, run: src.run, queue, dir: scratch() }),
    adopt: (flowId, id, what, stage) => guard.record(flowId, id, what, stage),
    assertRunning() {
      const stop = queue.stopped();
      if (stop) throw stop;
    },
  };
}

/** A stub answer in place of the call's (undefined: the call is answered as usual). */
type StubFail = (method: string, path: string) => { status: number; body: unknown } | undefined;

/** OFFLINE ONLY: a throwaway results folder (the probes' and the REST rehearsal's results are not the run's). */
const scratchDirs: string[] = [];
const scratch = () => {
  const d = mkdtempSync(join(tmpdir(), "integrity-offline-"));
  scratchDirs.push(d);
  return `${d}/`; // the recorder appends "<run>/"
};

const statuses = (rec: Recorder) => Object.fromEntries(rec.steps.map((x) => [x.name, x.status]));
/** Every step that did not pass, but those expected not-run (`notRun`: a step with nothing to check is never a pass). */
const failures = (rec: Recorder, notRun: string[] = []) => rec.steps.filter((x) => x.status !== "pass" && !(x.status === "not-run" && notRun.includes(x.name))).map((x) => `${x.name}: ${x.status} ${x.reason ?? ""}`);
const stepOf = (rec: Recorder, name: string) => rec.steps.find((x) => x.name === name)!;
const failedLabels = (rec: Recorder, name: string) => stepOf(rec, name).evidence.checks.filter((c) => !c.ok).map((c) => c.label);

describe("S-INTEGRITY", () => {
  afterAll(() => {
    for (const d of scratchDirs) rmSync(d, { recursive: true, force: true });
  });
  if (LIVE) {
    it(`live ${RUN}: one phase, read only`, async () => {
      const phase = livePhase(); // before any call
      const w = await createWorld();
      const out = await runIntegrity(w, phase);
      // the verdict is the results file (SPEC §5); the test reports it
      const counts = Object.fromEntries(["pass", "fail", "blocked", "not-run"].map((k) => [k, out.rec.steps.filter((x) => x.status === k).length]));
      console.log(`S-INTEGRITY ${RUN} ${phase}: ${JSON.stringify(counts)} → ${out.rec.file}`);
      expect(out.rec.steps.length).toBe(10);
    });
    return;
  }

  it(`offline: start, a rehearsed run that keeps its items (${deletesItsItems(RUN) ? "R1" : RUN}), end: every step passes`, async () => {
    const w = await createWorld({ run: deletesItsItems(RUN) ? "R1" : RUN });
    const start = await runIntegrity(w, "start");
    // a fresh run has nothing of its own to read back: steps 7 and 8 are not-run (never a pass on nothing)
    expect(failures(start.rec, [STEP7, STEP8])).toEqual([]);
    expect([statuses(start.rec)[STEP7], statuses(start.rec)[STEP8]]).toEqual(["not-run", "not-run"]);
    expect(start.rec.steps).toHaveLength(10);
    // the request's and the open point's fields are the snapshot's plus what they gained since (snapshotOverlay.ts),
    // named with their source
    const sources = stepOf(start.rec, "names: the code's field ids against each flow's fields").evidence.notes.sources as { flow: string; overlay?: string[] }[];
    expect(sources.filter((x) => x.overlay).map((x) => [x.flow, x.overlay!.length]).sort()).toEqual([[FLOWS.op.id, 1], [PORTAL_FLOWS.request.id, 3]].sort());
    await rehearse(w);
    // the user as the request's contact, as S-CASE's self contact makes Thomas (the portal's own load then lists it)
    const rid = w.ledger.latest().find((e) => e.flow === PORTAL_FLOWS.request.id)!.id;
    w.offline!.portal.set(rid, { Assigned_Contacts: [{ _id: w.who.id, Name: w.who.name, Kind: "User" }] });
    const end = await runIntegrity(w, "end", { startPrint: start.print! });
    expect(failures(end.rec)).toEqual([]);
    // the read-back saw each kind the rehearsal made: the case, its request, the supplier row, the note, audit rows
    const back = end.rec.steps.find((x) => x.name.startsWith("no corruption: every ledger item"))!;
    const flows = new Set(back.evidence.readBacks.map((r) => r.what.split(" ")[0]));
    expect([...flows].sort()).toEqual([FLOWS.audit.id, FLOWS.case.id, FLOWS.note.id, FLOWS.supplier.id, PORTAL_FLOWS.request.id].sort());
    expect(back.evidence.checks.length).toBeGreaterThan(20);
    // the values against sources apart from the item: the ledger's keys, the tag, the app's audit snapshots, row for row
    expect(back.evidence.checks.map((c) => c.label)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Case_Code is as the ledger recorded it$/),
        expect.stringMatching(/Case_Code carries "ZZT-N21-/),
        expect.stringMatching(/Trade_Name is as its audit \(case\.created\)$/),
        expect.stringMatching(/Note_Text is as its audit \(note\.added\)$/),
        expect.stringMatching(/Request_Key is as the ledger recorded it$/),
        expect.stringMatching(/has contact rows/),
        "no warning of the app's loads names an item of this run",
      ]),
    );
    const req = back.evidence.readBacks.find((r) => r.what.startsWith(`${PORTAL_FLOWS.request.id} ${rid}`))!.value as { mapped: unknown };
    expect(req.mapped).toMatchObject({ code: w.key("INT-C01"), step: "fill" });
    // offline the names steps read the 02:29 snapshot, the rest the fakes; no REST call at all
    expect(w.log.entries).toEqual([]);
  });

  it(`offline: a run that deletes its items (${deletesItsItems(RUN) ? RUN : "R2"}): at the end every ledger item is gone (404)`, async () => {
    const w = await createWorld({ run: deletesItsItems(RUN) ? RUN : "R2" });
    const start = await runIntegrity(w, "start");
    await rehearse(w);
    const gone = await cleanupRun(w);
    expect(gone.failed).toEqual([]);
    expect(gone.deleted.length).toBeGreaterThanOrEqual(5);
    const end = await runIntegrity(w, "end", { startPrint: start.print! });
    // nothing of the run is left to check for corruption: step 8 is not-run
    expect(failures(end.rec, [STEP8])).toEqual([]);
    expect(statuses(end.rec)[STEP8]).toBe("not-run");
    const back = end.rec.steps.find((x) => x.name.startsWith("no corruption: every ledger item"))!;
    expect(back.evidence.readBacks.length).toBeGreaterThanOrEqual(5);
    expect(back.evidence.readBacks.every((r) => (r.value as { gone?: boolean }).gone === true)).toBe(true);
    // a passing gone check carries no detail that reads as a problem
    expect(back.evidence.checks.filter((c) => c.ok && c.detail !== undefined)).toEqual([]);
  });

  it("offline: the detectors fire — a changed item that is not the run's, a corrupted ledger item, a leftover", async () => {
    const w = await createWorld({ run: "R3" });
    const dir = scratch();
    const start = await runIntegrity(w, "start", { rec: recorder({ suite: "integrity-start", run: "R3", dir }) });
    await rehearse(w);
    const fake = w.offline!.app;
    // someone else's case changes; this run's case gets broken JSON, a pseudo id in a user field and a bad date
    const other = fake.db.case.find((c) => !w.ledger.has(c._id))!;
    fake.set(other._id, { Priority: "High" });
    const mine = w.ledger.latest().find((e) => e.flow === FLOWS.case.id)!;
    fake.set(mine.id, { Release_Manifest_JSON: "{not json", Owner_RMM: { _id: "self:UsRmmKatrin" }, Supplier_Due_Date: "2026-13-45" });
    // R3 should have deleted its items by now: nothing was deleted
    const end = await runIntegrity(w, "end", { rec: recorder({ suite: "integrity-end", run: "R3", dir }), startPrint: start.print! });
    const st = statuses(end.rec);
    expect(st["no corruption: nothing that is not this run's changed during the run"]).toBe("fail");
    const print = end.rec.steps.find((x) => x.name === "no corruption: nothing that is not this run's changed during the run")!;
    expect(print.evidence.readBacks[1]!.value).toMatchObject({ changed: [{ flow: FLOWS.case.id, id: other._id }] });
    const run = end.rec.steps.find((x) => x.name.startsWith("no corruption: this run's items"))!;
    expect(run.status).toBe("fail");
    expect(run.evidence.checks[0]!.detail).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: mine.id, field: "Release_Manifest_JSON", problem: expect.stringMatching(/does not parse/) }),
        expect.objectContaining({ id: mine.id, field: "Owner_RMM", value: "self:UsRmmKatrin" }),
        expect.objectContaining({ id: mine.id, field: "Supplier_Due_Date", value: "2026-13-45" }),
      ]),
    );
    const back = end.rec.steps.find((x) => x.name.startsWith("no corruption: every ledger item"))!;
    expect(back.status).toBe("fail");
    expect(back.reason).toMatch(/deleted by the end of R3/);
    expect(back.reason).not.toMatch(/the app loaded/); // a leftover is not mapped (no load runs when all should be gone)
    // the names, roles and read-only steps are not affected
    expect(st["read-only: S-INTEGRITY wrote nothing (so it has nothing of its own to clean up)"]).toBe("pass");
    expect(st["names: the roles of both apps match ids.ts ROLES and portal.ts ROLES"]).toBe("pass");
  });

  it("offline over the live REST layer (a stub transport answering from the fakes and the snapshot): all reads, every route allowed, the call count", async () => {
    const src = await createWorld({ run: "R1" });
    await rehearse(src);
    const w = restWorld(src);
    const dir = scratch();
    const start = await runIntegrity(w, "start", { rec: recorder({ suite: "integrity-start", run: "R1", dir, queue: w.queue }) });
    const startCalls = w.log.entries.length;
    const end = await runIntegrity(w, "end", { rec: recorder({ suite: "integrity-end", run: "R1", dir, queue: w.queue }), startPrint: start.print! });
    expect(failures(start.rec)).toEqual([]);
    expect(failures(end.rec)).toEqual([]);
    // every call went through the ONE queue at 2.5 s, was logged, and was a read of an allowed route
    expect(w.queue.history).toHaveLength(w.log.entries.length);
    expect(readOnlyProblems([], w.log.entries)).toEqual({ writes: [], requests: [] });
    expect(w.log.entries.every((e) => e.status === 200 || /01015|050201/.test(e.err ?? ""))).toBe(true);
    const gaps = w.queue.history.slice(1).map((h, i) => h.at - w.queue.history[i]!.at);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(2500);
    // the live estimate: this run's calls per phase on the fixtures' sizes (live: more rows per list, see the report)
    const families = (from: number, to: number) => {
      const out: Record<string, number> = {};
      for (const e of w.log.entries.slice(from, to)) {
        const k = `${e.method} ${e.path.split("?")[0]!.split("/").slice(0, 2).join("/")}${/myitems/.test(e.path) ? " myitems" : /\/list\b/.test(e.path) ? " list" : /\/admin\//.test(e.path) ? " admin" : ""}`;
        out[k] = (out[k] ?? 0) + 1;
      }
      return out;
    };
    console.log(`S-INTEGRITY REST rehearsal (R1, ${src.ledger.latest().length} ledger ids): start ${startCalls} calls ${JSON.stringify(families(0, startCalls))}; end ${w.log.entries.length - startCalls} calls ${JSON.stringify(families(startCalls, w.log.entries.length))}`);
    expect(startCalls).toBeLessThan(60);
  });

  it("offline: the end phase without a start fingerprint records the diff as not-run", async () => {
    const w = await createWorld({ run: "R1" });
    const dir = scratch();
    const end = await runIntegrity(w, "end", { rec: recorder({ suite: "integrity-end", run: "R1", dir }) });
    expect(statuses(end.rec)["no corruption: nothing that is not this run's changed during the run"]).toBe("not-run");
    expect(statuses(end.rec)["no corruption: every other item the key reads (JSON parses, real user ids, valid dates)"]).toBe("not-run");
  });

  it("offline: the end phase compares only with this attempt's start fingerprint (an earlier attempt's file never stands in)", async () => {
    const w = await createWorld({ run: "R1" });
    const dir = scratch();
    const rec = (suite: string) => recorder({ suite, run: "R1", dir });
    const file = join(dir, "R1", START_PRINT);
    await runIntegrity(w, "start", { rec: rec("integrity-start") });
    expect(existsSync(file)).toBe(true);
    const end = await runIntegrity(w, "end", { rec: rec("integrity-end") });
    expect(statuses(end.rec)[STEP6_END]).toBe("pass");
    // used up by the end phase that compared with it (kept beside, for the reader)
    expect([existsSync(file), existsSync(join(dir, "R1", START_PRINT_USED))]).toEqual([false, true]);
    const again = await runIntegrity(w, "end", { rec: rec("integrity-end") });
    expect(statuses(again.rec)[STEP6_END]).toBe("not-run");
    // an earlier attempt's file is removed before the start phase's first call, so a start that stops early leaves none
    writeFileSync(file, "{}");
    const src = await createWorld({ run: "R1" });
    const rw = restWorld(src, { fail: () => ({ status: 429, body: "Too Many Requests" }) });
    await expect(runIntegrity(rw, "start", { rec: recorder({ suite: "integrity-start", run: "R1", dir, queue: rw.queue }) })).rejects.toBeInstanceOf(StopError);
    expect(existsSync(file)).toBe(false);
  });

  it("offline: a value someone else wrote into this run's items fails step 7 (the ledger's keys, the tag, the app's audit), though the mapping agrees", async () => {
    const w = await createWorld({ run: "R1" });
    const dir = scratch();
    const start = await runIntegrity(w, "start", { rec: recorder({ suite: "integrity-start", run: "R1", dir }) });
    await rehearse(w);
    const idOf = (flow: string) => w.ledger.latest().find((e) => e.flow === flow && e.stage !== "draft")!.id;
    const fake = w.offline!.app;
    fake.set(idOf(FLOWS.case.id), { Case_Code: "ZZT-N21-R9-NOT-MINE", Trade_Name: "Someone else's material", Supplier_Due_Date: "2030-01-01" });
    fake.set(idOf(FLOWS.note.id), { Note_Text: "overwritten by another writer" });
    fake.set(idOf(FLOWS.supplier.id), { Supplier_Code: "SUP-OTHER2" });
    const end = await runIntegrity(w, "end", { rec: recorder({ suite: "integrity-end", run: "R1", dir }), startPrint: start.print! });
    expect(statuses(end.rec)[STEP7]).toBe("fail");
    const failed = failedLabels(end.rec, STEP7);
    expect(failed).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^CIQ_Case_A00 .*: Case_Code is as the ledger recorded it$/),
        expect.stringMatching(/^CIQ_Case_A00 .*: Case_Code carries "ZZT-N21-R1"$/),
        expect.stringMatching(/^CIQ_Case_A00 .*: Trade_Name is as its audit \(case\.created\)$/),
        expect.stringMatching(/^CIQ_Case_A00 .*: Supplier_Due_Date is as its audit \(case\.created\)$/),
        expect.stringMatching(/^CIQ_Internal_Note_A00 .*: Note_Text is as its audit \(note\.added\)$/),
        expect.stringMatching(/^CIQ_Supplier_A00 .*: Supplier_Code is as the ledger recorded it$/),
      ]),
    );
    // the app maps whatever is there: its mapping alone found nothing
    expect(failed.filter((l) => /: maps /.test(l))).toEqual([]);
  });

  it("offline: the load could not read the run supplier's contacts: step 7 reads the row again and fails; step 8 checks its rows", async () => {
    const w = await createWorld({ run: "R1" });
    const dir = scratch();
    const start = await runIntegrity(w, "start", { rec: recorder({ suite: "integrity-start", run: "R1", dir }) });
    await rehearse(w);
    const sup = w.ledger.latest().find((e) => e.flow === FLOWS.supplier.id && e.stage !== "draft")!.id;
    const row = w.offline!.app.db.supplier.find((r) => r._id === sup)!;
    (row["Table::Contacts"] as Record<string, unknown>[])[0]!.Contacts_Portal_User_Id = "self:UsFake1";
    // the load's full read of the row fails once (it keeps the list row, without the Contacts table, and warns)
    const formGet = w.client.formGet.bind(w.client);
    let failOnce = true;
    w.client.formGet = async (f, id) => {
      if (f === "supplier" && failOnce) {
        failOnce = false;
        throw new KfError("KISSFLOW_ERROR_00500 Internal error (test)", 500, "/form");
      }
      return formGet(f, id);
    };
    const end = await runIntegrity(w, "end", { rec: recorder({ suite: "integrity-end", run: "R1", dir }), startPrint: start.print! });
    expect(failedLabels(end.rec, STEP7)).toEqual(
      expect.arrayContaining(["no warning of the app's loads names an item of this run", expect.stringMatching(/^CIQ_Supplier_A00 .*: every contact row is one contact on the screens/)]),
    );
    expect(stepOf(end.rec, STEP8).evidence.checks[0]!.detail).toEqual([expect.objectContaining({ id: sup, field: "Contacts[0].Contacts_Portal_User_Id", value: "self:UsFake1" })]);
  });

  it("offline: an item an integration made for the run that no suite adopted is the run's (step 6), and fails step 7 (R2 cannot delete it)", async () => {
    const w = await createWorld({ run: "R2" });
    const dir = scratch();
    const start = await runIntegrity(w, "start", { rec: recorder({ suite: "integrity-start", run: "R2", dir }) });
    await rehearse(w);
    // a late request naming the run's case (as a query op.round makes after the suite's poll gave up), never adopted
    const fp = w.offline!.portal;
    const req = fp.db.request.find((r) => r._id === w.ledger.latest().find((e) => e.flow === PORTAL_FLOWS.request.id)!.id)!;
    fp.db.request.push({ ...structuredClone(req), _id: "PkLATE0001" });
    expect((await cleanupRun(w)).failed).toEqual([]);
    const end = await runIntegrity(w, "end", { rec: recorder({ suite: "integrity-end", run: "R2", dir }), startPrint: start.print! });
    expect(statuses(end.rec)[STEP6_END]).toBe("pass"); // not someone else's new item
    expect(stepOf(end.rec, STEP6_END).evidence.notes.thisRunsButNotInTheLedger).toEqual([expect.objectContaining({ flow: PORTAL_FLOWS.request.id, id: "PkLATE0001" })]);
    expect(failedLabels(end.rec, STEP7)).toEqual(["every item of R2 is in its ledger (cleanup reads only the ledger)"]);
  });

  it("offline: a fingerprint read that fails at the end leaves its flow out of the diff (named), not every item of it gone", async () => {
    const w = await createWorld({ run: "R1" });
    const dir = scratch();
    const start = await runIntegrity(w, "start", { rec: recorder({ suite: "integrity-start", run: "R1", dir }) });
    await rehearse(w);
    const formList = w.client.formList.bind(w.client);
    let failOnce = true;
    w.client.formList = async (f) => {
      if (f === "audit" && failOnce) {
        failOnce = false;
        throw new KfError("KISSFLOW_ERROR_00500 Internal error (test)", 500, "/form");
      }
      return formList(f);
    };
    const end = await runIntegrity(w, "end", { rec: recorder({ suite: "integrity-end", run: "R1", dir }), startPrint: start.print! });
    const s6 = stepOf(end.rec, STEP6_END);
    expect(s6.status).toBe("fail");
    expect(failedLabels(end.rec, STEP6_END)).toEqual(["every flow was read", "every flow was compared (read at the start and now)"]);
    expect(s6.evidence.readBacks[1]!.value).toMatchObject({ removed: [], added: [], changed: [], notCompared: [FLOWS.audit.id] });
  });

  it("offline over the REST layer: a flow list that fails fails step 2 only (no false names); steps 3 and 4 are not-run", async () => {
    const src = await createWorld({ run: "R1" });
    await rehearse(src);
    const w = restWorld(src, { fail: (m, p) => (m === "GET" && p.startsWith(`/flow/2/${DEV_ACCOUNT}/process/?_application_id=${PORTAL_ID}`) ? { status: 500, body: { error_code: "KISSFLOW_ERROR_00500", en_message: "Internal error (test)" } } : undefined) });
    const start = await runIntegrity(w, "start", { rec: recorder({ suite: "integrity-start", run: "R1", dir: scratch(), queue: w.queue }) });
    const st = statuses(start.rec);
    expect(failedLabels(start.rec, "names: every flow of both apps follows the naming rule; the code's flows exist with their names")).toEqual(["every flow list was read"]);
    expect([st["names: the code's field ids against each flow's fields"], st["names: the code's steps exist with their names"]]).toEqual(["not-run", "not-run"]);
    expect(failures(start.rec, ["names: the code's field ids against each flow's fields", "names: the code's steps exist with their names"])).toHaveLength(1);
  });

  it("offline over the REST layer: a 429 at any call of either phase stops it at once, the step not-run (never a fail), saved", async () => {
    const bad: string[] = [];
    for (const phase of ["start", "end"] as const) {
      let total = Infinity;
      for (let n = 1; n <= total; n++) {
        const src = await createWorld({ run: "R1" });
        await rehearse(src);
        let k = 0;
        let armed = false;
        const w = restWorld(src, { fail: () => (armed && ++k === n ? { status: 429, body: "Too Many Requests" } : undefined) });
        const dir = scratch();
        const startPrint = phase === "end" ? (await runIntegrity(w, "start", { rec: recorder({ suite: "integrity-start", run: "R1", dir, queue: w.queue }) })).print : undefined;
        const from = w.log.entries.length;
        armed = true;
        const rec = recorder({ suite: `integrity-${phase}`, run: "R1", dir, queue: w.queue });
        const err = await runIntegrity(w, phase, { rec, ...(startPrint ? { startPrint } : {}) }).then(() => undefined, (e: unknown) => e);
        if (k < n) {
          total = n - 1; // the phase makes fewer calls: every position was tried
          break;
        }
        const saved = JSON.parse(readFileSync(rec.file, "utf8")) as { stopped?: string; steps: { name: string; status: string; reason?: string }[] };
        const last = saved.steps.at(-1);
        const ok = err instanceof StopError && w.log.entries.length - from === n && last?.status === "not-run" && /stopped/.test(last.reason ?? "") && !!saved.stopped && !saved.steps.some((x) => x.status === "fail");
        if (!ok) bad.push(`${phase} call ${n}: ${err instanceof StopError ? "StopError" : String(err)}; last step ${last?.name} ${last?.status} ${last?.reason ?? ""}`);
      }
      expect(total, `${phase}: the number of calls`).toBeGreaterThan(20);
    }
    expect(bad).toEqual([]);
  });

  describe("the pure parts", () => {
    it("lex: comments and regular expressions leave, strings stay, a JSX apostrophe is no string", () => {
      const src = [
        "// Case_Code in a comment",
        "const a = { Trade_Name: 1 }; /* Main_INCI",
        "   still a comment */ const re = /[\"']Not_A_Field/g;",
        "const t = `x ${y ? `Case_Item_Id` : \"z\"} OP_Key`;",
        "const j = <p>Don't Review_Gate</p>; const k = \"Round_No\";",
      ].join("\n");
      const { code, strings } = lex(src);
      expect(strings.map((s) => [s.text, s.line])).toEqual([["x ", 4], ["Case_Item_Id", 4], ["z", 4], [" OP_Key", 4], ["Round_No", 5]]);
      expect(code).not.toMatch(/Case_Code|Main_INCI|Not_A_Field/);
      expect(code).toMatch(/Trade_Name/);
      expect(code.split("\n")).toHaveLength(5);
    });

    it("scanCode reads string literals, object keys and property reads of src/app-live and src/portal (no tests)", () => {
      const scan = scanCode();
      expect(scan.files.some((f) => /\.test\./.test(f) || /testing/.test(f))).toBe(false);
      expect(scan.fields).toContainEqual(expect.objectContaining({ token: "Review_Key", file: "app-live/write/encode.ts" })); // Review_Key: …
      expect(scan.fields).toContainEqual(expect.objectContaining({ token: "OP_Key", file: "app-live/write/encode.ts" })); // OP_Key: …
      expect(scan.fields).toContainEqual(expect.objectContaining({ token: "Thread_JSON" }));
      expect(scan.flows.map((u) => u.token)).toContain(FLOWS.case.id);
      expect(scan.fields.map((u) => u.token)).not.toContain(ROLES.owner.id); // "RoEKwvR_cPvv" has a field's shape
    });

    it("fieldReport finds a field the code uses that its flow lost, a declared one, and a formula that is no more", () => {
      // the flows as built now: the snapshot with what they gained since (snapshotOverlay.ts, tested below)
      const metas = new Map(CODE_FLOWS.map((f) => [f.id, withOverlay(parseDraft(f.id, snapshotFlow(f.app, f.kind, f.id)!.draft))]));
      expect(fieldReport(scanCode(), metas).lacks).toEqual([]);
      metas.get(FLOWS.case.id)!.fields.delete("Owner_RMM");
      metas.get(FLOWS.review.id)!.formulas.delete("Review_Gate");
      const r = fieldReport(scanCode(), metas);
      expect(r.lacks).toEqual([expect.objectContaining({ token: "Owner_RMM", flows: [FLOWS.case.id] })]);
      expect(r.perFlow.get(FLOWS.case.id)!.missing).toContain("field Owner_RMM (ids.ts MANDATORY (Create case))");
      expect(r.perFlow.get(FLOWS.case.id)!.codeLacks).toEqual(["Owner_RMM"]);
      expect(r.perFlow.get(FLOWS.review.id)!.noFormula).toEqual(["Review_Gate (ids.ts FORMULA_FIELDS.review)"]);
      // "Activate review": the four Required fields are Editable on the step and Mandatory by the model: no drift
      expect(r.perFlow.get(FLOWS.review.id)!.drift).toEqual([]);
    });

    it("withOverlay: the snapshot plus exactly the fields the code names that the flows gained since, each with its model field's step permissions", () => {
      const snap = new Map(CODE_FLOWS.map((f) => [f.id, parseDraft(f.id, snapshotFlow(f.app, f.kind, f.id)!.draft)]));
      // the overlay is exactly what the snapshot lacks of the code: without it these fail step 3, and it hides nothing else
      const byToken = (l: { token: string; flows: string[] }[]) => l.map((x) => ({ token: x.token, flows: x.flows })).sort((a, b) => a.token.localeCompare(b.token));
      // (a file that writes several flows names its token under each of them, e.g. encode.ts for the review and the
      // open point: the overlay's flow is one of those)
      const lacks = byToken(fieldReport(scanCode(), snap).lacks);
      const added = byToken(Object.entries(SNAPSHOT_OVERLAY).flatMap(([flow, l]) => l.map((a) => ({ token: a.field, flows: [flow] }))));
      expect(lacks.map((x) => x.token)).toEqual(added.map((x) => x.token));
      for (const a of added) expect(lacks.find((x) => x.token === a.token)?.flows, a.token).toContain(a.flows[0]);
      const req = snap.get(PORTAL_FLOWS.request.id)!;
      const over = withOverlay(req);
      expect([over.fields.get("Release_By_Email"), over.fields.get("Release_By_Role")]).toEqual([
        { type: "Email", model: PORTAL_FLOWS.request.id, required: false },
        { type: "Text", model: PORTAL_FLOWS.request.id, required: false },
      ]);
      // on every step Release_By_Name's permission (Mandatory where the supplier gives the final release); nothing else moves
      const perms = (m: FlowMeta, field: string) => Object.fromEntries([...m.permissions].filter(([, p]) => p.has(field)).map(([a, p]) => [a, p.get(field)]));
      expect(perms(req, "Release_By_Name")[PORTAL_STEP_DEFS.release.activity]).toBe("Mandatory");
      expect([perms(over, "Release_By_Email"), perms(over, "Release_By_Role")]).toEqual([perms(req, "Release_By_Name"), perms(req, "Release_By_Name")]);
      expect([...over.fields.keys()].filter((k) => !req.fields.has(k))).toEqual(["Release_By_Email", "Release_By_Role", "Review_Depts"]);
      expect([over.models, over.activities, over.formulas]).toEqual([req.models, req.activities, req.formulas]);
      // the snapshot's own metadata is left as it was; a flow that gained nothing is returned as it is
      expect(req.fields.has("Release_By_Email") || [...req.permissions.values()].some((p) => p.has("Release_By_Email"))).toBe(false);
      expect(withOverlay(snap.get(FLOWS.case.id)!)).toBe(snap.get(FLOWS.case.id));
      // an entry that no longer fits the snapshot throws: its field is there already (a newer snapshot), its model field is not
      expect(() => withOverlay(over)).toThrow(/has Release_By_Email in the snapshot already/);
      expect(() => withOverlay(req, { [req.flowId]: [{ field: "Zz_New", type: "Text", like: "No_Such_Field", source: "test" }] })).toThrow(/has no No_Such_Field/);
      // never in a live process
      vi.stubEnv("LIVE", "1");
      try {
        expect(() => withOverlay(req)).toThrow(/offline only/);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("attribute: a name no flow has goes to the flow of its neighbours", () => {
      const uses: Use[] = [
        { token: "Case_Code", file: "a.ts", line: 1 },
        { token: "Trade_Name", file: "a.ts", line: 2 },
        { token: "Case_Kode", file: "a.ts", line: 3 },
        { token: "OP_Key", file: "a.ts", line: 60 },
      ];
      const of = (t: string) => (t === "OP_Key" ? ["op"] : t.startsWith("Case_Code") || t === "Trade_Name" ? ["case"] : []);
      expect(attribute(uses[2]!, uses, of)).toEqual(["case"]);
    });

    it("classifyFlow: the rule, the known exceptions, and a new break", () => {
      const used = usedFlows(FLOW_LABEL);
      const row = (app: string, id: string, name: string): FlowRow => ({ app, type: "process", id, name, status: "Live", modifiedAt: "", lastPublishedAt: "" });
      expect(classifyFlow(row(APP_ID, "CIQ_Case_A00", "CIQ Case"), used)).toEqual({ kind: "used", follows: true });
      expect(classifyFlow(row(APP_ID, "CIQ_Case_Thomas_A00", "CIQ Case - Thomas"), used)).toMatchObject({ kind: "personal", follows: true });
      expect(classifyFlow(row(PORTAL_ID, "CIQP_Notice_A00", "ZZZ (Not in Use) CIQP Notice"), used)).toMatchObject({ kind: "retired", follows: false, why: expect.any(String) });
      expect(classifyFlow(row(PORTAL_ID, "ZZ_Spike_Assignee_A00", "ZZ Spike Assignee"), used)).toMatchObject({ kind: "spike", follows: false, why: expect.any(String) });
      expect(classifyFlow(row(APP_ID, "New_Flow_A00", "New flow"), used)).toEqual({ kind: "other", follows: false });
    });

    it("itemProblems: JSON, self: inside JSON, pseudo user ids, dates, child rows", () => {
      const meta = parseDraft("F_A00", {
        Root: "F_A00",
        a: { Id: "Owner_RMM", Kind: "Field", Type: "User", Model: "F_A00" },
        b: { Id: "Raiser_Assignee", Kind: "Field", Type: "MultiUser", Model: "F_A00" },
        c: { Id: "Due", Kind: "Field", Type: "Date", Model: "F_A00" },
        d: { Id: "Contacts", Kind: "Model", Model: "F_A00" },
        e: { Id: "Contacts_Portal_User_Id", Kind: "Field", Type: "Text", Model: "Contacts" },
      });
      const p = itemProblems(
        {
          _id: "x",
          _modified_at: "2026-10-21T01:00:00Z",
          Owner_RMM: { _id: "UsReal1", Name: "A" },
          Raiser_Assignee: [{ _id: "UsReal1" }, { _id: "contact:k1" }],
          Due: "2026-02-30x",
          Thread_JSON: JSON.stringify({ thread: [{ by: "self:UsReal1" }] }),
          Portal_Assignees_JSON: JSON.stringify([{ _id: "u-admin" }]),
          Snapshot_JSON: "{oops",
          Portal_Contact_Ids: "UsReal1, role:QM",
          "Table::Contacts": [{ _id: "Contacts_1", Contacts_Portal_User_Id: "self:UsReal1" }],
        },
        meta,
      );
      expect(p.map((x) => x.field).sort()).toEqual(["Contacts[0].Contacts_Portal_User_Id", "Due", "Portal_Assignees_JSON", "Portal_Contact_Ids", "Raiser_Assignee", "Snapshot_JSON", "Thread_JSON.thread[0].by"]);
      expect(itemProblems({ _id: "y", Supplier_Due_Date: "2026-11-30", Event_At: "2026-10-21T08:00:00Z", Owner_RMM: { _id: "UsReal1" } })).toEqual([]);
      expect(validDate("1999-01-01")).toBe(false);
    });

    it("ledgerKeys: the key fields of an item's ledger lines (whatOf's, an adopt's); not a name, not a suffix", () => {
      const line = (id: string, what: string): LedgerEntry => ({ at: "", run: "R1", flow: "F_A00", app: APP_ID, id, what, stage: "saved" });
      const lines = [
        line("Fm1", "Supplier_Code=ZZT-N21-R1-S1 Supplier_Legal_Name=ZZT-N21-R1 Supplier"),
        line("Pk2", "Request_Key=ZZT-N21-R1-C1|1 (I-1, S-FORMS note case)"),
        line("Pk2", "a request the S-FORMS case links (I-1)"),
        line("Pk3", "Case_Code=ZZT-N21-R1-C1 Supplier_Code=SUP-X"),
        line("Pk3", "Case_Code=ZZT-N21-R1-C9"),
      ];
      expect(ledgerKeys(lines, "Fm1")).toEqual({ Supplier_Code: "ZZT-N21-R1-S1" });
      expect(ledgerKeys(lines, "Pk2")).toEqual({ Request_Key: "ZZT-N21-R1-C1|1" });
      expect(ledgerKeys(lines, "Pk3")).toEqual({ Case_Code: "ZZT-N21-R1-C1", Supplier_Code: "SUP-X" });
      expect(ledgerKeys(lines, "Pk4")).toEqual({});
    });

    it("snapshotCurrent, draftAfterPublish, isGone", () => {
      expect(snapshotCurrent({ _modified_at: "2026-10-19T20:50:50Z" }, { _modified_at: "2026-10-19T20:50:50Z" })).toBe(true);
      expect(snapshotCurrent({ _modified_at: "2026-10-19T20:50:50Z" }, { _modified_at: "2026-10-21T01:00:00Z" })).toBe(false);
      expect(draftAfterPublish({ _modified_at: "2026-10-19T20:50:50Z", LastPublishedAt: "2026-10-16T07:42:32Z" })).toBe(true);
      expect(draftAfterPublish({ _modified_at: "2026-10-15T16:34:29Z", LastPublishedAt: "2026-10-15T16:34:28Z" })).toBe(false);
      expect(isGone(new Error("KISSFLOW_ERROR_01015 Document not found (x)"))).toBe(true);
      expect(isGone(new Error("KISSFLOW_ERROR_050201 This item has moved out of your queue."))).toBe(false);
      expect(isGone(new KfError("KISSFLOW_ERROR_00137 Resource not found. Verify the request URL and try again.", 404, "/x"))).toBe(false);
      expect(isGone(new KfError("KISSFLOW_ERROR_01015 The item could not be located.", 404, "/x"))).toBe(true);
    });

    it("readOnlyProblems: a write call or a logged write is found", () => {
      const acc = "AcDOSunMEpSA";
      const calls: TapCall[] = [{ side: "app", method: "formList", flow: "audit", write: false }, { side: "app", method: "adminPut", flow: "case", id: "Pk1", write: true }];
      const log: LogEntry[] = [
        { at: "", method: "GET", path: `/process/2/${acc}/admin/CIQ_Case_A00/Pk1?_application_id=${APP_ID}`, status: 200, ms: 1 },
        { at: "", method: "PUT", path: `/process/2/${acc}/admin/CIQ_Case_A00/Pk1?_application_id=${APP_ID}`, status: 200, ms: 1 },
        { at: "", method: "POST", path: "webhook:case.started", status: 200, ms: 1 },
      ];
      expect(readOnlyProblems(calls, log, acc)).toEqual({ writes: ["app.adminPut case Pk1"], requests: [`PUT /process/2/${acc}/admin/CIQ_Case_A00/Pk1`, "POST webhook:case.started"] });
    });

    it("the snapshot answers the offline reads in their live shapes", () => {
      const roles = offlineAnswer(`/app_role/2/AcTEST/list?_application_id=${APP_ID}`) as { _id: string; Name: string }[];
      expect(roles.map((r) => r.Name)).toContain(ROLES.admin.name);
      expect(snapshotIndex().at).toMatch(/^2026-10-20T/);
      const flows = offlineAnswer(`/flow/2/AcTEST/process/?_application_id=${PORTAL_ID}&page_number=1&page_size=300`) as { _id: string }[];
      expect(flows.map((f) => f._id)).toContain(PORTAL_FLOWS.request.id);
      expect(offlineAnswer(`/process/2/AcTEST/CIQ_Case_A00/myitems?_application_id=${APP_ID}`)).toBeUndefined();
    });
  });
});

