// The world a suite runs in (SPEC §3): the run and its tag, Thomas holding every persona as the dev role switch would,
// the guarded app and portal clients over the ONE queue, the ledger, the request log, the hand-off hooks; and the
// app's own flow on top: boot(persona) = loadSnapshot + viewOf/toAppState (as LiveAppStore readAll, and
// map/roundtrip.test.ts) with the webhooks from the loaded SET:current, a WriteCtx like LiveAppStore's ctxOf,
// perform() = the store's write steps (domain action → refusal → liveGuard → the writer), runEffects() = the load-time
// effects, and bootPortal() = the portal's own load and writers as the self contact.
// LIVE=1 runs against the dev sandbox (RUN=R1|R2|R3|R4 required; the key through kf.mjs). Otherwise (the default) the fake
// client (src/app-live/kf/fakeClient.ts, seeded with the live-shaped fixtures and SET:current with fake hook URLs), the
// fake portal and the fake integrations, on a virtual clock (no real waits), with an in-memory ledger and log.
import * as A from "@/domain/actions";
import { syncRegistry } from "@/domain/rules";
import type { AppState, InternalPersonaId } from "@/domain/types";
import { actingAs, PERSONA_ORDER, withRoles } from "@/app-live/identity";
import { APP_ID, FLOWS, ROLES } from "@/app-live/ids";
import { NOT_IN_APP } from "@/app-live/kf/client";
import { createFakeClient, type FakeClient } from "@/app-live/kf/fakeClient";
import { loadSnapshot, runLoadEffects, viewOf, type DraftRef, type EffectOutcome } from "@/app-live/load";
import type { HandoffCode } from "@/app-live/shared/handoff";
import { KF_USERS, PERSONA_USER, appFixtures, configRows } from "@/app-live/testing/rawFixtures";
import type { Acting, FlowKey, FormKey, Identity, LiveRoleRef, LiveSnapshot, Mapped, ProcessKey, WritableMethod, WriteCtx, WriteResult } from "@/app-live/types";
import { liveWriters } from "@/app-live/write/actions";
import { ensureRmes } from "@/app-live/write/activation";
import { liveGuard } from "@/app-live/write/guards";
import { webhooksOf } from "@/app-live/write/handoff";
import type { Who } from "@/portal/data/answers";
import { loadSupplierData, type LoadedData } from "@/portal/data/LiveSupplierStore";
import { liveActions, type LiveActions } from "@/portal/data/liveActions";
import { emptyNotes, type LocalNotes } from "@/portal/data/map";
import type { RawItem } from "@/portal/data/raw";
import { FLOWS as PORTAL_FLOWS, PORTAL_ID, ROLES as PORTAL_ROLES, webhooksFor, type FlowKey as PortalFlowKey, type Webhooks } from "@/portal/kf/portal";
import { errorText, kfDateTime } from "@/portal/kf/sdk";
import { DEV_ACCOUNT } from "@/shell/env";
import { createFakeIntegrations, offlineApp, type FakeIntegrations } from "./fakeIntegrations";
import { createFakePortal, type FakePortal } from "./fakePortal";
import { loadHooks, type Hooks } from "./hooks";
import { createLedger, LEDGER_FILE, TESTS_DIR, type Ledger } from "./ledger";
import {
  GuardError,
  KfError,
  PORTAL_CODES,
  REQUEST_LOG,
  THOMAS,
  createGuard,
  createLiveClient,
  createRequestLog,
  createRest,
  guardApp,
  kfTransport,
  kindOfFlow,
  readHeldRoles,
  type Guard,
  type HookCode,
  type LiveAppClient,
  type ReadScope,
  type RequestLog, DEV_HOST
} from "./liveClient";
import { createLivePortalClient, guardPortal, type LivePortalClient } from "./livePortalClient";
import { StopError, createQueue, sharedQueue, virtualClock, type Clock, type Queue } from "./queue";
import { RESULTS_DIR, recorder, type Recorder } from "./results";

export const LIVE = process.env.LIVE === "1";
/** The run (env RUN): R1 (the showcase), R2, R3 live; offline any name (default "OFF"; R1–R3 rehearse those runs'
 *  data, with their results under results/offline/ and an in-memory ledger). */
export const RUN = process.env.RUN || "OFF";
/** R4 (21 Oct evening): a second showcase, which keeps its items like R1. */
export const LIVE_RUNS = ["R1", "R2", "R3", "R4"] as const;
export const tagOf = (run: string) => `ZZT-N21-${run}`;
export const TAG = tagOf(RUN);
/** The queue's shared state (last call, a stop) across the suite's processes, live only. */
export const QUEUE_STATE = `${TESTS_DIR}queue-state.json`;

/** Fake hook URLs offline (".invalid" never resolves); webhooksOf keeps https URLs only. */
export const FAKE_APP_HOOK = (code: HandoffCode) => `https://hooks.invalid/app/${code}`;
export const FAKE_PORTAL_HOOKS: Webhooks = Object.fromEntries(PORTAL_CODES.map((c) => [c, `https://hooks.invalid/portal/${c}`])) as unknown as Webhooks;
/** The 8 app hand-offs SET:current carries live. */
const BUILT_APP_CODES: HandoffCode[] = ["case.started", "op.round", "op.edited", "op.closed", "release.requested", "review.reopened", "case.cancelled", "history.updated"];

export interface World {
  live: boolean;
  run: string;
  tag: string;
  clock: Clock;
  queue: Queue;
  ledger: Ledger;
  log: RequestLog;
  guard: Guard;
  /** Thomas (offline: the fixture RMM user) holding every CIQ persona. */
  identity: Identity;
  /** The same user as the portal's signed-in contact (the self contact). */
  who: Who;
  /** The roles the user really holds (My tasks emulation): live read at boot; offline as read live at 02:30 on 21 Oct
   *  (SPEC §2): Business administrator (app), Admin (portal). */
  heldRoles: { app: LiveRoleRef[]; portal: LiveRoleRef[] };
  client: LiveAppClient;
  portal: LivePortalClient;
  hooks: Hooks;
  /** Offline only: the fakes behind the clients. */
  offline?: { app: FakeClient; portal: FakePortal; integrations: FakeIntegrations };
  /** Hand-offs that failed after their save (WriteCtx.onHandoffProblem, the portal's onSyncProblem). */
  problems: { code: string; why: string; key?: string }[];
  /** runLoadEffects' session memory, kept for the world (as the store keeps it across reloads). */
  attempted: Set<string>;
  /** "ZZT-N21-<run> " + s: every text the suite writes starts with it. */
  text(s: string): string;
  /** "ZZT-N21-<run>-" + s: case codes, supplier codes, keys. */
  key(s: string): string;
  recorder(suite: string): Recorder;
  /** Records an item the integrations created (once its id is read back), or a new stage of a ledger item. A NEW id
   *  is taken for the portal processes only (CIQP Request, CIQP Query: the integrations create them; the guards check,
   *  live, that it names this run's items before its first write); an app item enters the ledger by its create. */
  adopt(flowId: string, id: string, what: string, stage: string): void;
  /** Throws the queue's StopError when it stopped (writers turn errors into results, so check after each). */
  assertRunning(): void;
}

export interface WorldOptions {
  /** Default: env LIVE === "1". */
  live?: boolean;
  /** Default: env RUN, else "OFF". */
  run?: string;
  /** Offline seed: the live-shaped fixtures (default: realistic, other users' items the guards must leave alone) or
   *  just the configuration rows. */
  seed?: "fixtures" | "config";
  /** Offline clock (default: a virtual clock). */
  clock?: Clock;
  /** Offline: the Integration service role has a member again, so I-2's Approve moves the case (default false, as the
   *  roles were read live at 02:30 on 21 Oct). */
  caseStepsHeld?: boolean;
}

/** Every CIQ persona's role, as the dev role switch gives them (the domain's rights hang on the persona). */
const personaRoles = (): LiveRoleRef[] => PERSONA_ORDER.map((p) => ({ id: ROLES[p].id, name: ROLES[p].name }));

/** The configuration rows with SET:current carrying fake hook URLs for the 8 built app hand-offs. */
function offlineConfig(rows: RawItem[]): RawItem[] {
  return rows.map((r) => {
    if (r.Config_Key !== "SET:current") return r;
    const payload = JSON.parse(String(r.Payload_JSON || "{}")) as Record<string, unknown>;
    return { ...r, Payload_JSON: JSON.stringify({ ...payload, webhooks: Object.fromEntries(BUILT_APP_CODES.map((c) => [c, FAKE_APP_HOOK(c)])) }) };
  });
}

export async function createWorld(o: WorldOptions = {}): Promise<World> {
  const live = o.live ?? LIVE;
  const run = o.run ?? RUN;
  if (live && !(LIVE_RUNS as readonly string[]).includes(run)) throw new Error(`LIVE=1 needs RUN=R1, R2, R3 or R4 (got "${run}").`);
  const tag = tagOf(run);
  const problems: World["problems"] = [];
  const base = { live, run, tag, problems, attempted: new Set<string>(), text: (s: string) => `${tag} ${s}`, key: (s: string) => `${tag}-${s}` };

  if (live) {
    const transport = await kfTransport(); // refuses any account or host but the dev sandbox
    const queue = sharedQueue({ stateFile: QUEUE_STATE });
    const ledger = createLedger({ run, file: LEDGER_FILE });
    const log = createRequestLog({ file: REQUEST_LOG });
    const guard = createGuard({ ledger, tag });
    const rest = createRest({ transport, queue, log, guard });
    const app = await readHeldRoles(rest, APP_ID, THOMAS);
    const portalRoles = await readHeldRoles(rest, PORTAL_ID, THOMAS);
    const name = app.name ?? portalRoles.name ?? "Thomas";
    const email = app.email ?? portalRoles.email ?? "";
    const identity = withRoles({ kfUserId: THOMAS, name, email }, personaRoles());
    const client = createLiveClient(rest, { userId: THOMAS, roleIds: new Set(app.roles.map((r) => r.id)) });
    const portal = createLivePortalClient(rest, { userId: THOMAS, roleIds: new Set(portalRoles.roles.map((r) => r.id)) });
    // the portal builds its hook URLs from the host of the page around it (portal.ts webhooksFor, 21 Oct)
    const hooks = await loadHooks({ client, portal, guard, portalHooks: webhooksFor(DEV_ACCOUNT, DEV_HOST), clock: queue.clock });
    return finish({ ...base, clock: queue.clock, queue, ledger, log, guard, identity, who: { id: THOMAS, name, email }, heldRoles: { app: app.roles, portal: portalRoles.roles }, client, portal, hooks });
  }

  const clock = o.clock ?? virtualClock();
  const queue = createQueue({ clock });
  const ledger = createLedger({ run });
  const log = createRequestLog();
  const guard = createGuard({ ledger, tag });
  const user = KF_USERS[PERSONA_USER.rmm]!;
  const identity = withRoles({ kfUserId: user._id, name: user.Name, email: user.Email }, personaRoles());
  const heldRoles = { app: [{ id: ROLES.admin.id, name: ROLES.admin.name }], portal: [{ ...PORTAL_ROLES.admin }] };
  const items: Partial<Record<FlowKey, RawItem[]>> = o.seed === "config" ? { config: configRows() } : structuredClone(appFixtures().db);
  items.config = offlineConfig(items.config ?? []);
  // the user's live roles only (not the personas): review department steps stay unheld, as live (SPEC §2)
  const fake = createFakeClient({ items, me: { _id: user._id, Name: user.Name, Email: user.Email, roles: heldRoles.app.map((r) => r.id) } }, { admin: true, enforceMandatory: false });
  const fakePortal = createFakePortal({ me: { _id: user._id, Name: user.Name } });
  const integrations = createFakeIntegrations({ app: fake, portal: fakePortal, caseStepsHeld: o.caseStepsHeld === true });
  const dispatch = (url: string, payload: unknown, code?: HookCode) => void integrations.dispatch(code ?? guard.hookCode(url), payload);
  const client = guardApp(offlineApp(fake, { dispatch }), guard);
  const portal = guardPortal(fakePortal.client({ me: { _id: user._id, Name: user.Name }, onWebhook: (url, payload) => dispatch(url, payload) }), guard);
  const hooks = await loadHooks({ client, portal, guard, portalHooks: FAKE_PORTAL_HOOKS, clock });
  return finish({ ...base, clock, queue, ledger, log, guard, identity, who: { id: user._id, name: user.Name, email: user.Email }, heldRoles, client, portal, hooks, offline: { app: fake, portal: fakePortal, integrations } });
}

/** The flows whose new items a run adopts: the integrations create them (SPEC §1 "Allowed writes"; since 22 Oct also
 *  I-2's E-A: the round-1 CIQ Reviews and their case-level review.started row). */
const ADOPTABLE = new Set<string>([PORTAL_FLOWS.request.id, PORTAL_FLOWS.query.id, FLOWS.review.id, FLOWS.audit.id]);

function finish(w: Omit<World, "recorder" | "adopt" | "assertRunning">): World {
  return {
    ...w,
    // offline results never land beside a live run's
    recorder: (suite) => recorder({ suite, run: w.run, queue: w.queue, ...(w.live ? {} : { dir: `${RESULTS_DIR}offline/` }) }),
    adopt(flowId, id, what, stage) {
      const known = w.ledger.byRun().some((e) => e.flow === flowId && e.id === id);
      if (!known && !ADOPTABLE.has(flowId)) throw new GuardError(`adopting ${flowId} ${id || "(no id)"}: only the items the integrations create are adopted; an app item enters the ledger by its own create.`);
      w.guard.record(flowId, id, what, stage);
    },
    assertRunning() {
      const stop = w.queue.stopped();
      if (stop) throw stop;
    },
  };
}

// ---------------------------------------------------------------------------------- the app's own flow

export interface Booted {
  persona: InternalPersonaId;
  acting: Acting;
  /** As read (drafts included). */
  snap: LiveSnapshot;
  /** The screens' state and the writers' index (drafts left out), as LiveAppStore shows it. */
  mapped: Mapped;
  state: AppState;
  drafts: DraftRef[];
  warnings: string[];
  /** The hand-off URLs from the loaded SET:current (webhooksOf); never print them. */
  webhooks: Partial<Record<HandoffCode, string>>;
  /** The write context of this load, as LiveAppStore's ctxOf builds it. */
  ctx(): WriteCtx;
}

/** One load as `persona` (the dev role switch): what the store's readAll does, without React. `scope: "run"` reads only
 *  this run's items and rows (opt-in: live, the default reads every item Thomas ever created, at 2.5 s per call). */
export async function boot(w: World, persona: InternalPersonaId, o: ReadScope = {}): Promise<Booted> {
  const acting = actingAs(w.identity, persona);
  const snap = await w.client.oneRead(() => loadSnapshot(w.client, w.identity, acting), o);
  w.assertRunning();
  const view = viewOf(snap, w.identity, acting);
  syncRegistry(view.mapped.state.config);
  const webhooks = webhooksOf(view.mapped.index.settings);
  const ctx: WriteCtx = {
    client: w.client,
    identity: w.identity,
    acting,
    index: view.mapped.index,
    webhooks,
    now: () => kfDateTime(new Date()),
    containerOk: w.client.appId === APP_ID,
    onHandoffProblem: (code, key, why) => void w.problems.push({ code, key, why }),
  };
  return { persona, acting, snap, mapped: view.mapped, state: view.mapped.state, drafts: view.drafts, warnings: view.warnings, webhooks, ctx: () => ctx };
}

export interface Performed {
  /** The domain's result (the optimistic state the screens would show). */
  next: AppState;
  /** The writer's result; absent when the action was refused before any write. */
  result?: WriteResult;
  /** Why nothing was written: the domain's refusal, the live guard's, or no writer. */
  refused?: string;
}

/** The store's write steps (api.ts write): the pure domain action as the acting user, its refusal, the container, C's
 *  liveGuard, then the writer with this load's context. `run` is the domain action (A.createCase(s, by, …).state, …). */
export async function perform(w: World, b: Booted, method: WritableMethod, args: unknown[], run: (s: AppState, by: string) => AppState): Promise<Performed> {
  const prev = b.state;
  const next = run(prev, b.acting.me.id);
  if (A.wasRefused(prev, next)) return { next, refused: next.toasts.at(-1)?.text || "Refused by the domain." };
  const ctx = b.ctx();
  if (!ctx.containerOk) return { next, refused: NOT_IN_APP };
  const why = liveGuard(method, ctx, prev, args);
  if (why) return { next, refused: why };
  const writer = liveWriters[method];
  if (!writer) return { next, refused: `${method} has no live writer.` };
  const result = await writer(ctx, prev, next, args);
  w.assertRunning();
  return { next, result };
}

/** The load-time effects of the booted persona (SAF/REG: ensureRmes; the reviews and the release request are the integrations' since 22 Oct), as the store
 *  runs them after a load; `only` limits them to these case codes (the run's), so nobody else's case is attempted. */
export async function runEffects(w: World, b: Booted, o: { only?: string[] } = {}): Promise<EffectOutcome[]> {
  const state = o.only ? { ...b.state, cases: b.state.cases.filter((c) => o.only!.includes(c.id)) } : b.state;
  const out = await runLoadEffects({
    acting: b.acting,
    state,
    ctx: b.ctx(),
    effects: { ensureRmes },
    attempted: w.attempted,
    facts: { reads: b.snap.reads, audit: b.snap.forms.audit, ...(b.snap.kept ? { kept: b.snap.kept } : {}) },
  });
  w.assertRunning();
  return out;
}

export interface PortalBooted {
  data: LoadedData;
  actions: LiveActions;
  local: LocalNotes;
}

/** The portal's own load (loadSupplierData) and writers (liveActions) as the self contact, with the hook URLs the
 *  guard knows (live: webhooksFor(DEV_ACCOUNT); offline: the fake ones). */
export async function bootPortal(w: World, o: ReadScope & { local?: LocalNotes } = {}): Promise<PortalBooted> {
  const local = o.local ?? emptyNotes();
  const data = await w.portal.oneRead(() => loadSupplierData(w.portal, w.who, local), o);
  w.assertRunning();
  const actions = liveActions(w.portal, data, w.who, { webhooks: w.hooks.urls().portal, local, wait: (ms) => w.clock.sleep(ms), onSyncProblem: (why) => void w.problems.push({ code: "portal", why }) });
  return { data, actions, local };
}

// ---------------------------------------------------------------------------------- R2/R3 teardown

export interface CleanupReport {
  run: string;
  /** Deleted, then read back as gone. */
  deleted: { flow: string; id: string; stage: string }[];
  /** Already gone before the delete. */
  gone: { flow: string; id: string }[];
  /** Not deleted on purpose: a form draft (its id names the user's next draft), an unknown flow. */
  skipped: { flow: string; id: string; why: string }[];
  failed: { flow: string; id: string; error: string }[];
}

const APP_KEY = new Map<string, FlowKey>(Object.entries(FLOWS).map(([k, f]) => [f.id, k as FlowKey]));
const PORTAL_KEY = new Map<string, PortalFlowKey>(Object.entries(PORTAL_FLOWS).map(([k, f]) => [f.id, k as PortalFlowKey]));
/** A read that says the item is gone: Kissflow's 404 "could not be located" (01015), or the fakes' 01015 offline; after a
 *  delete that succeeded (`afterDelete`), any 404. */
function isGone(e: unknown, afterDelete = false): boolean {
  // any 404: live (21 Oct) a deleted process item answers 404 with 050201, a form row 404 with 01015 (145 logged 404/050201
  // items never read 200 again); `afterDelete` is kept for the callers' wording
  void afterDelete;
  if (e instanceof KfError) return e.status === 404;
  return !(e instanceof StopError) && !(e instanceof GuardError) && /01015/.test(errorText(e));
}

/**
 * The teardown of R2 and R3 (SPEC §3: they delete their own items at the end): every item of this run's ledger, newest
 * first, through the guarded clients and the queue — a process item: admin GET, withdraw while InProgress (app
 * processes; the portal client has no withdraw, and the admin delete works at any step), admin DELETE, GET → gone; a
 * form row: DELETE, GET → gone — each recorded as "deleted". Form drafts are never deleted. Call it from afterAll, so a
 * failed suite still cleans up. A StopError is thrown on at once (the rest waits for cleanup.mjs after the pause). R1,
 * the showcase, is refused live.
 */
export async function cleanupRun(w: World): Promise<CleanupReport> {
  if (w.live && w.run === "R1") throw new GuardError("R1 is the showcase: its items stay for Thomas (cleanup.mjs --run R1 in the morning).");
  const out: CleanupReport = { run: w.run, deleted: [], gone: [], skipped: [], failed: [] };
  for (const e of [...w.ledger.latest()].reverse()) {
    const { flow, id } = e;
    const kind = kindOfFlow(flow);
    if (!kind || flow === FLOWS.config.id) {
      out.skipped.push({ flow, id, why: "not a flow the suite deletes" });
      continue;
    }
    if (kind === "form" && (e.stage === "draft" || /^draft_/i.test(id))) {
      out.skipped.push({ flow, id, why: "a form draft" });
      continue;
    }
    const app = APP_KEY.get(flow);
    const portal = PORTAL_KEY.get(flow);
    if (!app && !(kind === "process" && portal)) {
      out.skipped.push({ flow, id, why: "not a flow the suite deletes" });
      continue;
    }
    try {
      if (kind === "process") {
        const read = () => (app ? w.client.adminGet(app as ProcessKey, id) : w.portal.adminGet(portal!, id));
        let it: RawItem;
        try {
          it = await read();
        } catch (x) {
          if (!isGone(x)) throw x;
          out.gone.push({ flow, id });
          continue;
        }
        if (app && String(it._status ?? "") === "InProgress") await w.client.withdraw(app as ProcessKey, id, w.text("cleanup"));
        if (app) await w.client.remove(app, id);
        else await w.portal.adminDelete(portal!, id);
        const still = await read().then(
          () => true,
          (x: unknown) => {
            if (isGone(x, true)) return false;
            throw x;
          },
        );
        if (still) throw new Error("the item still reads back after its delete.");
      } else {
        const f = app as FormKey;
        try {
          await w.client.remove(f, id);
        } catch (x) {
          if (!isGone(x, true)) throw x;
          out.gone.push({ flow, id });
          continue;
        }
        const still = await w.client.formGet(f, id).then(
          () => true,
          (x: unknown) => {
            if (isGone(x, true)) return false;
            throw x;
          },
        );
        if (still) throw new Error("the row still reads back after its delete.");
      }
      w.adopt(flow, id, "cleanup", "deleted");
      out.deleted.push({ flow, id, stage: e.stage });
    } catch (x) {
      if (x instanceof StopError) throw x;
      out.failed.push({ flow, id, error: errorText(x) });
    }
    w.assertRunning();
  }
  return out;
}
