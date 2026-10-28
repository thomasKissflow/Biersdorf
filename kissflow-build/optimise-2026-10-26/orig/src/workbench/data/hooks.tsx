// The WorkbenchData provider and hooks (WORKBENCH-DESIGN.md §6.5, §12.2). Screens read through these hooks and write
// through useActions() (or the module-level actions in data/actions.ts); they never call the SDK directly.
// Each hook returns { data, loading, error, warnings, reload }. On a failed reload the last good data stays and an
// error banner shows. Reads may run in parallel (pools of 4); writes never (the write queue).
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { isProcess, type FlowId, type RoleIr, type StepIr } from "../schema";
import { DEFAULT_FLAGS, type Flags } from "../domain/flags";
import { loadPinnedConfig } from "../domain/config";
import { capsFor, heldRolesOf, lensRoles, type Caps, type HeldRoles } from "../kf/app";
import { errorText, type Kf, type KfRolesAnswer } from "../kf/sdk";
import { probeBuilder, readLens, writeLens } from "../kf/viewAs";
import { createActions, type Actions } from "./actions";
import { createClient, type RawItem, type WbClient } from "./client";
import { crBelongsTo } from "./counts";
import { caseIndexFromAudit, isOpenStatus, statusOf, toAuditVM, toCaseVM, toConfigVM, toCrVM, toNoteVM, toPointVM, toRmesVM, toRunVM, toSectionVM, toSupplierVM } from "./map";
import { createPendingStore, type PendingStore } from "./pendingSheet";
import { adminRungAllowed, bindRuntime, fillAdminRows, readList, type Me, type Runtime } from "./runtime";
import { createSession, isClosedAct, type SessionState } from "./session";
import { findHeldTask, lensTasks, loadTasks } from "./tasks";
import type { AuditVM, CaseVM, ConfigVM, CrVM, ListQuality, ListRead, Loaded, NoteVM, PointVM, RunVM, SectionVM, TaskVM } from "./viewModels";
import { createWriteQueue, type WriteQueue } from "./writeQueue";
import { plural } from "../domain/labels";

export type ToastTone = "success" | "info" | "warning" | "danger";
export interface Toast {
  id: string;
  tone: ToastTone;
  text: string;
}

interface TasksState {
  all: TaskVM[];
  loading: boolean;
  error: string | null;
  warnings: string[];
  loadedAt: number;
}

interface CacheEntry {
  data: unknown;
  error: string | null;
  warnings: string[];
  at: number;
}

export interface WorkbenchContextValue {
  kf: Kf;
  client: WbClient;
  rt: Runtime;
  actions: Actions;
  me: Me;
  /** After the lens. */
  caps: Caps;
  /** Without the lens (Diagnostics). */
  capsAll: Caps;
  heldRoles: HeldRoles;
  isBuilder: boolean;
  /** The builder probe has answered (until then isBuilder is false without meaning "no"). */
  builderProbed: boolean;
  builderRoles: KfRolesAnswer | null;
  lens: RoleIr | null;
  setLens(r: RoleIr | null): void;
  notify(msg: string, tone?: ToastTone): void;
  toasts: Toast[];
  dismissToast(id: string): void;
  /** "Saving…" while a write runs; "Updated hh:mm" after the last successful write or reload. */
  busy: { saving: boolean; updatedAt: string | null };
  /** Never swallowed: partial reads, degraded routes, unidentified steps. */
  warnings: string[];
  flagsFor(c: CaseVM): Flags;
  policyOf(releaseItemId: string): { policy: Flags["countsPolicy"]; source: "settings" | "default" | "unread" } | undefined;
  /** Counts policy per pinned release read this session (Diagnostics). */
  policies: Map<string, { policy: Flags["countsPolicy"]; source: "settings" | "default" | "unread" }>;
  containerOk: boolean;
  readyMs: number;
  session: SessionState;
  queue: WriteQueue;
  pending: PendingStore;
  /** Bumped after every write that changes server state: hooks reload. */
  version: number;
  tasksState: TasksState;
  reloadTasks(): Promise<void> | void;
  cache: Map<string, CacheEntry>;
  /** In-flight loads by key, so two components on one key share one read. */
  inflight: Map<string, Promise<unknown>>;
}

const Ctx = createContext<WorkbenchContextValue | null>(null);

const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export function WorkbenchData({ kf, readyMs, children, client: clientIn }: { kf: Kf; readyMs: number; children: ReactNode; client?: WbClient }) {
  const client = useMemo(() => clientIn ?? createClient(kf), [kf, clientIn]);
  const heldRoles = useMemo(() => heldRolesOf(kf.user), [kf]);
  const session = useMemo(() => createSession(), []);
  const pending = useMemo(() => createPendingStore(), []);
  const queue = useMemo(() => createWriteQueue({ appId: kf.app._id }), [kf]);
  const me = useMemo<Me>(() => ({ _id: kf.user._id, Name: kf.user.Name, Email: kf.user.Email ?? "" }), [kf]);

  const [lens, setLensState] = useState<RoleIr | null>(() => readLens(heldRoles.held));
  const [builderRoles, setBuilderRoles] = useState<KfRolesAnswer | null>(null);
  const [probed, setProbed] = useState(false);
  const isBuilder = !!builderRoles;
  useEffect(() => {
    let alive = true;
    void probeBuilder(kf).then((r) => {
      if (!alive) return;
      setBuilderRoles(r);
      setProbed(true);
    });
    return () => {
      alive = false;
    };
  }, [kf]);
  // A remembered lens applies while the probe is pending (it can only narrow, so this is safe and keeps rung 1 off
  // from the first read); once the probe answers "no", there is no switcher and no lens.
  const effectiveLens = !probed || isBuilder ? lens : null;
  const setLens = useCallback((r: RoleIr | null) => {
    writeLens(r);
    setLensState(r);
  }, []);
  const caps = useMemo(() => capsFor(lensRoles(heldRoles.held, effectiveLens)), [heldRoles, effectiveLens]);
  const capsAll = useMemo(() => capsFor(heldRoles.held), [heldRoles]);

  // ---- toasts, busy, warnings
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((text: string, tone: ToastTone = "success") => setToasts((t) => [...t, { id: `${Date.now()}-${Math.random()}`, tone, text }]), []);
  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const [saving, setSaving] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // ---- tasks (all; the lens filters below)
  const [tasksState, setTasksState] = useState<TasksState>({ all: [], loading: true, error: null, warnings: [], loadedAt: 0 });
  const capsRef = useRef(caps);
  capsRef.current = caps;
  const lensRef = useRef(effectiveLens);
  lensRef.current = effectiveLens;
  const lensedTasks = useMemo(() => lensTasks(tasksState.all, caps.roles), [tasksState.all, caps]);
  const tasksRef = useRef(lensedTasks);
  tasksRef.current = lensedTasks;
  const reloadTasks = useCallback((): Promise<void> => {
    setTasksState((s) => ({ ...s, loading: true }));
    return loadTasks(client, { roles: capsFor(heldRoles.held).roles, session })
      .then((r) =>
        setTasksState({
          all: r.tasks,
          loading: false,
          error: r.errors.length ? r.errors.map((e) => `${e.flow}: ${e.message}`).join(" · ") : null,
          warnings: r.warnings,
          loadedAt: Date.now(),
        }),
      )
      .catch((e) => setTasksState((s) => ({ ...s, loading: false, error: errorText(e) })));
  }, [client, heldRoles, session]);
  useEffect(() => {
    void reloadTasks();
  }, [reloadTasks]);

  // ---- flags per pinned release (fail-closed until read)
  const [policies, setPolicies] = useState<Map<string, { policy: Flags["countsPolicy"]; source: "settings" | "default" | "unread" }>>(new Map());
  const configLoad = useRef<Promise<ConfigVM[] | null> | null>(null);
  const requested = useRef(new Set<string>());
  const loadPolicy = useCallback(
    (releaseItemId: string) => {
      if (requested.current.has(releaseItemId)) return;
      requested.current.add(releaseItemId);
      configLoad.current ??= client
        .formList("CIQ_Config_Version_A00")
        .then((rows) => rows.map((r) => toConfigVM(r)))
        .catch(() => null);
      void configLoad.current.then(async (rows) => {
        const pinned = rows ? await loadPinnedConfig(rows, releaseItemId) : null;
        setPolicies((m) => new Map(m).set(releaseItemId, pinned ? { policy: pinned.countsPolicy, source: pinned.countsPolicySource } : { policy: "fail-closed", source: "unread" }));
      });
    },
    [client],
  );
  const flagsFor = useCallback(
    (c: CaseVM): Flags => {
      if (!c.releaseItemId) return DEFAULT_FLAGS;
      const p = policies.get(c.releaseItemId);
      if (!p) {
        loadPolicy(c.releaseItemId);
        return DEFAULT_FLAGS;
      }
      return { ...DEFAULT_FLAGS, countsPolicy: p.policy };
    },
    [policies, loadPolicy],
  );
  const flagsRef = useRef(flagsFor);
  flagsRef.current = flagsFor;

  // ---- runtime + actions
  // CR-T2-review-1 (b), T5: the task list reloads FIRST and the version is bumped only once the new list is in, so the
  // hooks never re-read an item with the activity that was just submitted or sent back ("moved out of your queue").
  const changed = useCallback(() => {
    setUpdatedAt(hhmm());
    void reloadTasks().finally(() => setVersion((v) => v + 1));
  }, [reloadTasks]);
  const rt = useMemo<Runtime>(
    () => ({
      client,
      queue,
      session,
      pending,
      me,
      caps: () => capsRef.current,
      lensActive: () => !!lensRef.current,
      tasks: () => tasksRef.current,
      flagsFor: (c) => flagsRef.current(c),
      now: () => new Date(),
      rnd: Math.random,
      viewerRoute: null,
      changed,
    }),
    [client, queue, session, pending, me, changed],
  );
  useEffect(() => {
    bindRuntime(rt);
    return () => bindRuntime(null);
  }, [rt]);
  const actions = useMemo<Actions>(() => {
    const raw = createActions(rt);
    const wrapped = {} as Record<string, unknown>;
    for (const [k, fn] of Object.entries(raw))
      wrapped[k] = async (...args: unknown[]) => {
        setSaving((n) => n + 1);
        try {
          return await (fn as (...a: unknown[]) => Promise<unknown>)(...args);
        } finally {
          setSaving((n) => n - 1);
        }
      };
    return wrapped as unknown as Actions;
  }, [rt]);

  const cache = useMemo(() => new Map<string, CacheEntry>(), []);
  const inflight = useMemo(() => new Map<string, Promise<unknown>>(), []);
  const warnings = useMemo(() => [...heldRoles.warnings, ...tasksState.warnings, ...(queue.containerOk ? [] : [`Wrong container: ${kf.app._id ?? "unknown"} is not CIQ_Digital_A00. Nothing can be saved.`])], [heldRoles, tasksState.warnings, queue, kf]);

  const value: WorkbenchContextValue = {
    kf,
    client,
    rt,
    actions,
    me,
    caps,
    capsAll,
    heldRoles,
    isBuilder,
    builderProbed: probed,
    builderRoles,
    lens: effectiveLens,
    setLens,
    notify,
    toasts,
    dismissToast,
    busy: { saving: saving > 0, updatedAt },
    warnings,
    flagsFor,
    policyOf: (id) => policies.get(id),
    policies,
    containerOk: queue.containerOk,
    readyMs,
    session,
    queue,
    pending,
    version,
    tasksState,
    reloadTasks,
    cache,
    inflight,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The full context (provider internals included). Features normally use useWorkbench(). */
export function useWorkbenchContext(): WorkbenchContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkbench outside WorkbenchData");
  return v;
}

/** §12.2: { kf, me, caps, isBuilder, lens, setLens, notify, busy, warnings, flagsFor } (+ actions, containerOk). */
export function useWorkbench() {
  const v = useWorkbenchContext();
  return {
    kf: v.kf,
    me: v.me,
    caps: v.caps,
    isBuilder: v.isBuilder,
    lens: v.lens,
    setLens: v.setLens,
    notify: v.notify,
    busy: v.busy,
    warnings: v.warnings,
    flagsFor: v.flagsFor,
    actions: v.actions,
    containerOk: v.containerOk,
  };
}

export const useActions = (): Actions => useWorkbenchContext().actions;

// ---------------------------------------------------------------- generic loader

function useLoader<T>(key: string | null, load: () => Promise<{ data: T; warnings?: string[] }>): Loaded<T> {
  const ctx = useWorkbenchContext();
  const [, force] = useState(0);
  const [loading, setLoading] = useState(key !== null);
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (key === null) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const flightKey = `${key}#${ctx.version}#${nonce}`; // a write or an explicit reload never reuses an older read
    let p = ctx.inflight.get(flightKey) as Promise<{ data: T; warnings?: string[] }> | undefined;
    if (!p) {
      p = loadRef.current();
      ctx.inflight.set(flightKey, p);
      void p.catch(() => undefined).finally(() => ctx.inflight.delete(flightKey));
    }
    p
      .then((r) => {
        ctx.cache.set(key, { data: r.data, error: null, warnings: r.warnings ?? [], at: Date.now() });
      })
      .catch((e) => {
        const prev = ctx.cache.get(key);
        ctx.cache.set(key, { data: prev?.data, error: errorText(e), warnings: prev?.warnings ?? [], at: prev?.at ?? 0 });
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        force((n) => n + 1);
      });
    return () => {
      alive = false;
    };
    // ctx.version: reload after writes; nonce: explicit reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce, ctx.version]);
  const entry = key ? ctx.cache.get(key) : undefined;
  return { data: entry?.data as T | undefined, loading, error: entry?.error ?? null, warnings: entry?.warnings ?? [], reload: () => setNonce((n) => n + 1) };
}

// ---------------------------------------------------------------- hooks (§12.2)

export function useTasks(): Loaded<TaskVM[]> & { heldTask(flow: FlowId, instanceId: string, step?: StepIr | null): TaskVM | null } {
  const ctx = useWorkbenchContext();
  const tasks = useMemo(() => lensTasks(ctx.tasksState.all, ctx.caps.roles), [ctx.tasksState.all, ctx.caps]);
  return {
    data: ctx.tasksState.loadedAt ? tasks : undefined,
    loading: ctx.tasksState.loading,
    error: ctx.tasksState.error,
    warnings: ctx.tasksState.warnings,
    reload: ctx.reloadTasks,
    heldTask: (flow, instanceId, step) => findHeldTask(tasks, flow, instanceId, step),
  };
}

/** Cases: the read ladder plus the F8 case index (§6.2). On rung 1 each OPEN row is read per item for its step. */
export async function loadCaseList(rt: Runtime): Promise<{ data: ListRead<CaseVM>; warnings: string[] }> {
  const l = await readList(rt, "CIQ_Case_A00");
  const warnings = [...l.warnings];
  let rows: CaseVM[];
  if (l.quality === "admin") {
    const f = await fillAdminRows(rt, "CIQ_Case_A00", l.rows, (r) => isOpenStatus(statusOf(r)));
    warnings.push(...f.warnings.map((w) => `Case step not readable: ${w}`));
    rows = f.rows.map((r) => (f.full.has(r._id) ? toCaseVM(r, "full") : toCaseVM(r, "row")));
  } else rows = l.rows.map((r) => toCaseVM(r, "row", { trustStep: true }));
  const indexOnly = new Set<string>();
  const f8 = await readList(rt, "CIQ_Audit_Event_A00");
  if (f8.quality === "form") {
    const known = new Set(rows.map((r) => r._id));
    for (const c of caseIndexFromAudit(f8.rows.map((r) => toAuditVM(r))))
      if (!known.has(c._id)) {
        rows.push(c);
        indexOnly.add(c._id);
      }
  } else warnings.push("The case index (audit events) could not be read.");
  if (indexOnly.size) warnings.push(`${plural(indexOnly.size, "case")} ${indexOnly.size === 1 ? "is" : "are"} known only from the audit log: status and step are shown only for cases you work on.`);
  return { data: { rows, quality: l.quality, indexOnly, warnings, viewerProven: l.viewerProven }, warnings };
}

export function useCaseList(): Loaded<CaseVM[]> & { quality: ListQuality | undefined; indexOnly: Set<string> } {
  const { rt } = useWorkbenchContext();
  const r = useLoader("caseList", () => loadCaseList(rt));
  return { ...r, data: r.data?.rows, quality: r.data?.quality, indexOnly: r.data?.indexOnly ?? new Set() };
}

export interface CaseBundle {
  case: CaseVM;
  points: PointVM[];
  crs: CrVM[];
  sections: SectionVM[];
  runs: RunVM[];
  notes: NoteVM[];
  events: AuditVM[];
  quality: Record<"points" | "crs" | "sections" | "runs" | "notes" | "events", ListQuality>;
  /** The full list reads (with indexOnly and viewerProven), for count confidence. */
  lists: { points: ListRead<PointVM>; crs: ListRead<CrVM> };
}

/** Reads one item in the §6.2 order: a held task's getItem → getAdminItem on rung 1 → the list row. */
async function readItem(rt: Runtime, flow: FlowId, id: string, act?: string): Promise<{ raw: RawItem; q: "full" | "row"; step?: StepIr | null } | null> {
  // CR-T2-review-1 (a), T5: an activity this session already submitted, rejected or sent back is never read again
  // (the host answers "moved out of your queue"); the next rung answers instead.
  const open = (x: string) => !isClosedAct(rt.session, flow, id, x);
  const mine = rt.tasks().filter((t) => t.flow === flow && t.instanceId === id && open(t.activityInstanceId));
  const held = act ? (mine.find((t) => t.activityInstanceId === act) ?? (open(act) ? undefined : mine[0])) : mine[0];
  const a = act && open(act) ? act : held?.activityInstanceId;
  if (a)
    try {
      return { raw: await rt.client.getItem(flow, id, a), q: "full", step: held?.step };
    } catch {
      /* next rung */
    }
  if (isProcess(flow) && adminRungAllowed(rt, flow))
    try {
      return { raw: await rt.client.getAdminItem(flow, id), q: "full" };
    } catch {
      /* next rung */
    }
  const l = await readList(rt, flow);
  const row = l.rows.find((r) => r._id === id);
  return row ? { raw: row, q: "row" } : null;
}

export async function loadCaseBundle(rt: Runtime, caseId: string): Promise<{ data: CaseBundle; warnings: string[] }> {
  const warnings: string[] = [];
  let c: CaseVM | null = null;
  const got = await readItem(rt, "CIQ_Case_A00", caseId);
  if (got) {
    c = toCaseVM(got.raw, got.q, { trustStep: true });
    const heldSteps = rt.tasks().filter((t) => t.flow === "CIQ_Case_A00" && t.instanceId === caseId && t.step).map((t) => t.step!);
    if (heldSteps.length) c = { ...c, currentSteps: [...new Set([...heldSteps, ...c.currentSteps])] };
  } else {
    const f8 = await readList(rt, "CIQ_Audit_Event_A00");
    c = caseIndexFromAudit(f8.rows.map((r) => toAuditVM(r))).find((x) => x._id === caseId) ?? null;
    if (c) warnings.push("This case is known only from the audit index: its fields and status are not readable with your access.");
  }
  if (!c) throw new Error("This case could not be found with your access.");
  const cc = c;
  const [pl, cl, sl, rl, nl, el] = await Promise.all([
    readList(rt, "CIQ_Open_Point_A00"),
    readList(rt, "CIQ_Change_Request_A00"),
    readList(rt, "CIQ_Section_A00"),
    readList(rt, "CIQ_Scope_Run_A00"),
    readList(rt, "CIQ_Internal_Note_A00"),
    readList(rt, "CIQ_Audit_Event_A00"),
  ]);
  for (const l of [pl, cl, sl, rl, nl, el]) warnings.push(...l.warnings);
  const byCase = (r: RawItem) => r.Case_Item_Id === caseId;
  const points = pl.rows.filter(byCase).map((r) => toPointVM(r));
  const crs = cl.rows.map((r) => toCrVM(r)).filter((cr) => crBelongsTo(cr, cc));
  return {
    data: {
      case: cc,
      points,
      crs,
      sections: sl.rows.filter(byCase).map((r) => toSectionVM(r)).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)),
      runs: rl.rows.filter(byCase).map((r) => toRunVM(r)),
      notes: nl.rows.filter(byCase).map((r) => toNoteVM(r)),
      events: el.rows.filter(byCase).map((r) => toAuditVM(r)).sort((a, b) => String(b.at).localeCompare(String(a.at))),
      quality: { points: pl.quality, crs: cl.quality, sections: sl.quality, runs: rl.quality, notes: nl.quality, events: el.quality },
      lists: { points: { ...pl, rows: points }, crs: { ...cl, rows: crs } },
    },
    warnings,
  };
}

export function useCaseBundle(caseId: string | null | undefined): Loaded<CaseBundle> {
  const { rt } = useWorkbenchContext();
  return useLoader(caseId ? `case:${caseId}` : null, () => loadCaseBundle(rt, caseId!));
}

export function usePoint(id: string | null | undefined, act?: string): Loaded<PointVM> {
  const { rt } = useWorkbenchContext();
  return useLoader(id ? `point:${id}:${act ?? ""}` : null, async () => {
    const got = await readItem(rt, "CIQ_Open_Point_A00", id!, act);
    if (!got) throw new Error("This open point could not be read with your access.");
    const vm = toPointVM(got.raw, got.q, { trustStep: true });
    return { data: got.step ? { ...vm, step: got.step } : vm };
  });
}

export function useCr(id: string | null | undefined, act?: string): Loaded<CrVM> {
  const { rt } = useWorkbenchContext();
  return useLoader(id ? `cr:${id}:${act ?? ""}` : null, async () => {
    const got = await readItem(rt, "CIQ_Change_Request_A00", id!, act);
    if (!got) throw new Error("This change request could not be read with your access.");
    const vm = toCrVM(got.raw, got.q, { trustStep: true });
    return { data: got.step ? { ...vm, step: got.step } : vm };
  });
}

/** The mapper of each Form (F1–F8). */
export function mapFormRow(flow: FlowId, raw: RawItem): unknown {
  switch (flow) {
    case "CIQ_Supplier_A00":
      return toSupplierVM(raw);
    case "CIQ_Config_Version_A00":
      return toConfigVM(raw);
    case "CIQ_Section_A00":
      return toSectionVM(raw);
    case "CIQ_Scope_Run_A00":
      return toRunVM(raw);
    case "CIQ_RMES_Safety_A00":
    case "CIQ_RMES_Regulatory_A00":
      return toRmesVM(raw, flow);
    case "CIQ_Internal_Note_A00":
      return toNoteVM(raw);
    case "CIQ_Audit_Event_A00":
      return toAuditVM(raw);
    default:
      return raw;
  }
}

/**
 * Form rows (F1–F8) mapped to their VM, optionally filtered by field values or a predicate on the raw row.
 * CR-T3-admin-1 (T5): a predicate gets its own cache key: `key` when given (two call sites with the same `key` share
 * one read), else one per hook instance, so two panels with different predicates never read each other's rows.
 */
export function useFormRows<T>(flow: FlowId | null, where?: Record<string, unknown> | ((row: RawItem) => boolean), key?: string): Loaded<T[]> & { quality: ListQuality | undefined } {
  const { rt } = useWorkbenchContext();
  const instanceKey = useId();
  const whereKey = typeof where === "function" ? `fn:${key ?? instanceKey}` : JSON.stringify(where ?? {});
  const whereRef = useRef(where);
  whereRef.current = where;
  const r = useLoader(flow ? `form:${flow}:${whereKey}` : null, async () => {
    const l = await readList(rt, flow!);
    const w = whereRef.current;
    const keep = (row: RawItem) => (typeof w === "function" ? w(row) : Object.entries(w ?? {}).every(([k, v]) => row[k] === v));
    return { data: { rows: l.rows.filter(keep).map((row) => mapFormRow(flow!, row) as T), quality: l.quality }, warnings: l.warnings };
  });
  return { ...r, data: r.data?.rows, quality: r.data?.quality };
}
