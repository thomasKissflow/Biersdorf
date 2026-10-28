// The live store of the internal app (DESIGN §2 D, §3.3, §4, §6), modelled on portal/data/LiveSupplierStore.tsx: it
// reads what the acting persona may read (load.ts), maps it to the prototype's AppState (map/toAppState.ts) and
// provides a StoreApi (api.ts) through StoreContext, so the approved internal screens render live data unchanged.
// - Writes: every accepted action is shown at once (optimistic state) and its writer runs on ONE serial chain, one
//   write in flight, with the write context of the click (api.ts); when it settles the result is toasted and logged
//   (Diagnostics). A save that moved no step shows Kissflow's read-backs (load.ts withSaved: no list is read again,
//   the portal's autosave rule); a step move, a hand-off that writes its item back, or a failure reads everything
//   again once the last queued write settled (APP-SAVING-GAPS gap 1); either drops the optimistic state. A failed
//   write drops it at once, and the writes queued behind it are not sent (gap 2; api.ts enqueueJob). Reads run on the
//   same chain, so a reload never sees a write half done; a reload that started before a newer action keeps that
//   action's optimistic state. A read that could not read a part again shows that part as the last load read it
//   (load.ts keepUnread, gap 8), keeps the optimistic state and blocks the load-time effects that decide from that
//   part; such a read, like one that failed, stays owed (the next write job reads again). A hand-off that fails after
//   its save is a warning and a write-log line (gap 5). Since a save that moves no step reads nothing, the load-time
//   effects below run on a full read only: the first load, Reload, a step move or a failure.
// - Persona: the store is not remounted when the persona changes (AppLiveApp keeps it); a new persona reads
//   differently, so the store shows the loader and reads again. setPersona goes out through onPersona.
// - After each successful load, on the chain: SAF/REG create their RMES row (owner C's ensureRmes; the reviews and the
//   final-release request are the integrations' since 22 Oct: I-2 with E-A, E-B), each case at most once per session (RMES
//   once per case and department, so a switch from Safety to Regulatory still creates Regulatory's) and only when the
//   reads they decide from answered (load.ts effectBlocked); one reload when something was written. A note (nothing
//   written) goes to Diagnostics only. Their toasts are grouped: one per effect and load (userText.ts effectToasts).
// - Texts: in production a failure's toast, the load-failed page and the hand-off warning carry no raw Kissflow text
//   (userText.ts); the write log keeps it. The screens get LIVE_FEATURES (components/liveFeatures.tsx), so a feature
//   this version lacks does not pretend it worked.
// - The header says "Loading…" while a read runs and "Saving…" while a write runs (separate counters).
// - Toasts live here (the shell has no Toaster); the configuration registry follows the loaded configuration.
// Owner C's write layer comes in through `wiring` (default WIRING: write/*): a method without a writer toasts "not
// available".
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from "react";
import { LIVE_FEATURES, LiveFeaturesContext } from "@/components/liveFeatures";
import { Button, Card, EmptyState, ProductionContext, Toaster } from "@/components/ui";
import { syncRegistry } from "@/domain/rules";
import type { AppState, InternalPersonaId, Toast } from "@/domain/types";
import { BrandLoader } from "@/portal/BrandLoader";
import type { RawItem } from "@/portal/data/raw";
import { errorText, kfDateTime } from "@/portal/kf/sdk";
import { StoreContext, type StoreApi } from "@/store/store";
import { createLiveApi, enqueueJob, failedResult, handoffProblemText, mailProblemText, newWriteChain, type ApiDeps, type Fresh } from "./api";
import { useAppEnv } from "./appEnv";
import { BUILD } from "./build";
import { AppExtrasContext, type LiveAppExtras } from "./extras";
import { actingAs } from "./identity";
import { APP_ID } from "./ids";
import { NOT_IN_APP } from "./kf/client";
import { caseBannerOf, keepUnread, keptSince, loadSnapshot, runLoadEffects, viewOf, withSaved, type LoadEffects, type LoadedView } from "./load";
import type { HandoffCode } from "./shared/handoff";
import type { Acting, AppClient, Identity, LiveWriters, ProcessKey, WriteCtx, WriteResult } from "./types";
import { LOAD_FAILED, PlainError, STILL_EMPTY, effectToasts } from "./userText";
import { draftSentAudit, liveWriters } from "./write/actions";
import { ensureRmes } from "./write/activation";
import { liveGuard } from "./write/guards";
import { webhooksOf, type HookBase } from "./write/handoff";
import { assertMandatory } from "./write/verify";

/** Owner C's write layer as the store uses it (DESIGN §3.3 C). Every part is optional: a missing writer toasts "not
 *  available", a missing guard or side effect is skipped, no webhooksOf = every hand-off slot empty (pending). */
export interface LiveWiring extends LoadEffects {
  writers: LiveWriters;
  /** C liveGuard. */
  guard?: ApiDeps["guard"];
  /** C webhooksOf(SET:current Payload_JSON, where the client runs: its account and Kissflow host). */
  webhooksOf?: (settings: Record<string, unknown>, at: HookBase) => Partial<Record<HandoffCode, string>>;
  /** C assertMandatory: blank Mandatory fields of an item at a step (Diagnostics' Send checks a draft with it). */
  assertMandatory?: (item: RawItem, activityId: string) => string[];
  /** C draftSentAudit: the history line of a draft sent from Diagnostics (its writer stopped before its audit row);
   *  `state` (the last load's) lets an open point send its history hand-off too. */
  draftSent?: (ctx: WriteCtx, flow: ProcessKey, item: RawItem, state?: AppState) => Promise<WriteResult>;
}

/** Owner C's write layer as the app uses it (DESIGN §3.3 C signatures). Tests pass their own `wiring`. */
export const WIRING: LiveWiring = { writers: liveWriters, guard: liveGuard, ensureRmes, webhooksOf, assertMandatory, draftSent: draftSentAudit };

/** The hand-off URLs of a load: the wiring's webhooksOf on the Settings payload, built where the client runs (its
 *  account, the host of the Kissflow page around the frame), so production posts to its own hooks although SET:current
 *  is the dev sandbox's copy. */
export const webhooksFor = (wiring: Pick<LiveWiring, "webhooksOf">, client: Pick<AppClient, "accountId" | "hookHost">, settings: Record<string, unknown>): Partial<Record<HandoffCode, string>> =>
  wiring.webhooksOf?.(settings, { accountId: client.accountId, host: client.hookHost }) ?? {};

type WriteLogEntry = LiveAppExtras["writeLog"][number];

interface Loaded extends LoadedView {
  /** The persona this data was read for. */
  acting: Acting;
  webhooks: Partial<Record<HandoffCode, string>>;
}

const toastId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function LiveAppStore(props: { client: AppClient; identity: Identity; personaId: InternalPersonaId; onPersona(id: InternalPersonaId): void; children: ReactNode; wiring?: LiveWiring }): JSX.Element {
  const { client, identity, personaId, onPersona, children } = props;
  const { env } = useAppEnv();
  const acting = useMemo(() => actingAs(identity, personaId), [identity, personaId]);
  const containerOk = client.appId === APP_ID;
  // through a ref: a wiring object made inline by a caller must not start a new load on every render
  const wiringRef = useRef(props.wiring ?? WIRING);
  wiringRef.current = props.wiring ?? WIRING;

  // refs are the truth for the api (several actions in one tick see each other); the states re-render
  const actingRef = useRef(acting);
  actingRef.current = acting;
  const [loaded, setLoadedState] = useState<Loaded | null>(null);
  const loadedRef = useRef<Loaded | null>(null);
  const setLoaded = (l: Loaded | null) => {
    loadedRef.current = l;
    setLoadedState(l);
  };
  const [optimistic, setOptimisticState] = useState<AppState | null>(null);
  const optimisticRef = useRef<AppState | null>(null);
  /** Bumped by every optimistic commit: a reload clears the optimistic state only when none came after it started. */
  const generation = useRef(0);
  const setOptimistic = (s: AppState | null) => {
    optimisticRef.current = s;
    setOptimisticState(s);
  };
  const [toasts, setToastsState] = useState<Toast[]>([]);
  const toastsRef = useRef<Toast[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingCount, setLoadingCount] = useState(0);
  const [savingCount, setSavingCount] = useState(0);
  const [writeLog, setWriteLog] = useState<WriteLogEntry[]>([]);
  /** Side effects attempted this session ("ensureRmes|REG|<case>": per department), kept
   *  across reloads and persona switches (load.ts runLoadEffects). */
  const attempted = useRef(new Set<string>());
  /** The write jobs' counters: pending, the failure epoch, a read owed (api.ts enqueueJob). */
  const writes = useRef(newWriteChain());
  /** Reads in flight (the header's "Loading…") and writes in flight ("Saving…"), counted apart (m8). */
  const loading = useCallback((d: number) => setLoadingCount((n) => n + d), []);
  const saving = useCallback((d: number) => setSavingCount((n) => n + d), []);

  const toast = useCallback((tone: Toast["tone"], text: string) => {
    toastsRef.current = [...toastsRef.current.slice(-3), { id: toastId(), tone, text }];
    setToastsState(toastsRef.current);
  }, []);
  const dismiss = useCallback((id: string) => {
    toastsRef.current = toastsRef.current.filter((t) => t.id !== id);
    setToastsState(toastsRef.current);
  }, []);
  const logWrite = useCallback((method: string, r: WriteResult, note?: boolean) => {
    const message = [r.message, ...r.warnings].filter(Boolean).join(" ") || undefined;
    setWriteLog((w) => [...w, { at: new Date().toISOString(), method, ok: r.ok, ...(message ? { message } : {}), ...(r.detail ? { detail: r.detail } : {}), handoffs: r.handoffs, ...(note ? { note: true } : {}) }]);
  }, []);

  /** False once this store is unmounted (a dev role switch remounts it): an unfinished load of the old role must not
   *  set state or run its load effects (writes as a role the user has just left). */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Every write and every read runs on this one chain, in order (LiveSupplierStore.tsx:229-235). */
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const serial = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.current.then(fn);
    chain.current = p.catch(() => undefined);
    return p;
  }, []);

  /** Gap 5: a hand-off POST that failed after its save (write/handoff.ts never waits for it), as the portal's
   *  onSyncProblem: a warning toast and a line in Diagnostics' write log. */
  const handoffProblem = useCallback(
    (code: HandoffCode, key: string, why: string) => {
      toast("warning", handoffProblemText(code, why, env));
      logWrite(`handoff ${code}`, { ok: false, message: why, handoffs: [{ code, status: "failed", detail: why, key }], warnings: [] });
    },
    [env, logWrite, toast],
  );
  const mailProblem = useCallback(
    (what: string, why: string) => {
      toast("warning", mailProblemText(what, why, env));
      logWrite(`mail ${what}`, { ok: false, message: why, handoffs: [], warnings: [] });
    },
    [env, logWrite, toast],
  );

  const ctxOf = useCallback(
    (l: Loaded): WriteCtx => ({ client, identity, acting: l.acting, index: l.mapped.index, webhooks: l.webhooks, now: () => kfDateTime(new Date()), containerOk, onHandoffProblem: handoffProblem, onMailProblem: mailProblem, env }),
    [client, identity, containerOk, handoffProblem, mailProblem, env],
  );

  /** One read of everything as `a` (on the chain): where it could not read a part again, the same persona's last load
   *  is kept for that part (keepUnread, gap 8); then shown. Null when the store or the persona moved on meanwhile;
   *  throws when the load failed (the last good data stays). */
  const readAll = useCallback(
    async (a: Acting): Promise<Loaded | null> => {
      const read = await loadSnapshot(client, identity, a);
      if (!alive.current) return null; // unmounted meanwhile (dev role switch): the new store loads for itself
      if (actingRef.current !== a) return null; // the persona changed meanwhile: its own load follows
      const last = loadedRef.current;
      const snap = keepUnread(last && last.acting.personaId === a.personaId ? last.snap : undefined, read);
      const view = viewOf(snap, identity, a, env);
      syncRegistry(view.mapped.state.config);
      const next: Loaded = { ...view, acting: a, webhooks: webhooksFor(wiringRef.current, client, view.mapped.index.settings) };
      setLoaded(next);
      setLoadError(null);
      return next;
    },
    [client, identity, env],
  );

  /** Reads everything again (call it on the chain). Keeps the last good data on failure. True when everything was
   *  read again; false on a failure, and when a part could not be read again (kept from the last load), so a write job
   *  that owed this read still owes it. */
  const loadNow = useCallback(
    async (effects: boolean): Promise<boolean> => {
      const a = actingRef.current;
      const gen = generation.current;
      const wiring = wiringRef.current;
      loading(1);
      try {
        const next = await readAll(a);
        if (!next) return false;
        // a part this load could not read again shows the earlier read, from before the action: the action's optimistic
        // state stays until a complete read replaces it, and the read stays owed (gap 8)
        const complete = !next.snap.kept;
        if (complete) writes.current.readOwed = false; // what a write job owed is read now
        if (generation.current === gen && complete) setOptimistic(null);
        if (!effects || !alive.current) return complete;
        // the effects decide from what THIS load read (M1): its read reports, its audit rows and what it kept
        const done = await runLoadEffects({ acting: a, state: next.mapped.state, ctx: ctxOf(next), effects: wiring, attempted: attempted.current, facts: { reads: next.snap.reads, audit: next.snap.forms.audit, ...(next.snap.kept ? { kept: next.snap.kept } : {}) } });
        for (const o of done) logWrite(o.effect, o.result, o.note);
        // A13: one toast per effect and load (four cases confirmed overnight were four toasts, and the toaster keeps
        // four); a note (nothing written) is Diagnostics only
        const tally = done.filter((o) => !o.note).map((o) => ({ effect: o.effect, caseId: o.caseId, ok: o.result.ok, ...(o.result.message ? { message: o.result.message } : {}), ...(o.result.tone ? { tone: o.result.tone } : {}), done: o.result.tally?.done ?? [], failed: o.result.tally?.failed ?? [] }));
        for (const t of effectToasts(tally, env)) toast(t.tone, t.text);
        // DESIGN §4: one reload when something was written (without the side effects again)
        if (done.some((o) => o.result.ok && !o.note) && actingRef.current === a && alive.current) return loadNow(false);
        return complete;
      } catch (e) {
        if (actingRef.current === a && alive.current) setLoadError(errorText(e));
        return false;
      } finally {
        loading(-1);
      }
    },
    [ctxOf, env, loading, logWrite, readAll, toast],
  );

  // first load, and a new read whenever the persona changes (reads differ by role, DESIGN §3.4)
  useEffect(() => {
    if (loadedRef.current && loadedRef.current.acting.personaId !== acting.personaId) {
      setLoaded(null);
      setOptimistic(null);
      setLoadError(null);
    }
    void serial(() => loadNow(true));
  }, [acting, loadNow, serial]);

  /** Gap 1: a save's read-backs on the loaded data (load.ts withSaved), shown without reading anything; false when they
   *  could not be mapped (the job then reads everything again). */
  const showSaved = useCallback(
    (r: WriteResult): boolean => {
      const l = loadedRef.current;
      // the store or the persona moved on (its own load follows), or nothing to show
      if (!alive.current || !l || l.acting !== actingRef.current || (!r.saved?.length && !r.auditRow)) return true;
      try {
        const view = viewOf(withSaved(l.snap, r.saved ?? [], r.auditRow), identity, l.acting, env);
        syncRegistry(view.mapped.state.config);
        setLoaded({ ...view, acting: l.acting, webhooks: l.webhooks });
        return true;
      } catch {
        return false;
      }
    },
    [identity, env],
  );

  /** DESIGN §6 step 5–6: the writer on the chain; its result toasted and logged; its read-backs shown, or everything
   *  read again after the last queued one (api.ts enqueueJob). Resolves with the result once the screens show it. */
  const enqueue = useCallback(
    (label: string, job: () => Promise<WriteResult>): Promise<WriteResult> =>
      enqueueJob(
        writes.current,
        {
          serial,
          saving,
          report: (method, r) => {
            logWrite(method, r);
            if (r.ok) {
              toast(r.tone ?? "success", r.message || "Saved.");
              if (r.warnings.length) toast("warning", r.warnings.join(" "));
            } else toast(r.tone ?? "danger", r.message || "Not saved.");
          },
          generation: () => generation.current,
          dropOptimistic: () => setOptimistic(null),
          showSaved,
          read: () => loadNow(true),
          env,
        },
        label,
        job,
      ),
    [env, loadNow, logWrite, saving, serial, showSaved, toast],
  );

  /** Gap 9: everything read again inside a job (it is on the chain already, so not through `serial`) and shown, as the
   *  writer's state and context, with the snapshot (api.ts reviewGateCheck: what it could not read again); the
   *  optimistic state stays (the job has not finished). */
  const fresh = useCallback(
    async (a: Acting): Promise<Fresh> => {
      loading(1);
      try {
        const l = await readAll(a);
        if (!l) throw new PlainError("The role changed before this was sent, so nothing was sent.");
        return { state: { ...l.mapped.state, toasts: [] }, ctx: ctxOf(l), snap: l.snap };
      } finally {
        loading(-1);
      }
    },
    [ctxOf, loading, readAll],
  );

  const reloadOnChain = useCallback(() => serial(() => loadNow(true)), [serial, loadNow]);

  const api = useMemo<StoreApi | null>(() => {
    if (!loaded) return null;
    const compose = (): AppState => ({ ...(optimisticRef.current ?? loadedRef.current?.mapped.state ?? loaded.mapped.state), toasts: toastsRef.current });
    const wiring = wiringRef.current;
    return createLiveApi({
      state: compose,
      acting: loaded.acting,
      ctx: () => ctxOf(loadedRef.current ?? loaded),
      writers: wiring.writers,
      ...(wiring.guard ? { guard: wiring.guard } : {}),
      toast,
      dismiss,
      optimistic: (next) => {
        generation.current++;
        setOptimistic(next);
      },
      enqueue,
      fresh: () => fresh(loaded.acting),
      reload: () => void reloadOnChain(),
      setPersona: (id) => {
        if (id !== actingRef.current.personaId) onPersona(id);
      },
    });
    // optimistic and toasts are read through their refs; listed so the api (and its `state`) is rebuilt on change
  }, [loaded, optimistic, toasts, ctxOf, toast, dismiss, enqueue, fresh, reloadOnChain, onPersona]);

  /** Diagnostics' Send: the draft read through its Start task, its Mandatory fields checked again when C's check is
   *  there, submitted, then its history line written (C draftSentAudit: the writer had stopped before its audit row). */
  const sendDraft = useCallback(
    (itemId: string): Promise<void> =>
      serial(async () => {
        const l = loadedRef.current;
        const d = l?.drafts.find((x) => x.itemId === itemId);
        if (!l || !d) throw new PlainError("This draft is no longer listed. Reload and look again.");
        if (!containerOk) throw new Error(NOT_IN_APP);
        saving(1);
        let error: unknown;
        try {
          const wiring = wiringRef.current;
          const item = await client.getTask(d.flow, d.itemId, d.act);
          const blank = wiring.assertMandatory?.(item, d.activityId) ?? [];
          // the field ids are dev's (C15)
          if (blank.length) throw env === "prod" ? new PlainError(STILL_EMPTY) : new Error(`Still empty: ${blank.join(", ")}. Nothing was sent.`);
          await client.submit(d.flow, d.itemId, d.act);
          const after = wiring.draftSent ? await wiring.draftSent(ctxOf(l), d.flow, item, l.mapped.state) : undefined;
          const warnings = after?.warnings ?? [];
          logWrite("sendDraft", { ok: true, message: `${d.label} sent.`, handoffs: after?.handoffs ?? [], warnings });
          toast("success", `${d.label} sent.`);
          if (warnings.length) toast("warning", warnings.join(" "));
        } catch (e) {
          error = e;
          logWrite("sendDraft", failedResult(e, env));
        } finally {
          saving(-1);
        }
        await loadNow(true);
        if (error) throw error;
      }),
    [client, containerOk, ctxOf, env, loadNow, logWrite, saving, serial, toast],
  );
  const discardDraft = useCallback(
    (itemId: string): Promise<void> =>
      serial(async () => {
        const d = loadedRef.current?.drafts.find((x) => x.itemId === itemId);
        if (!d) throw new PlainError("This draft is no longer listed. Reload and look again.");
        if (!containerOk) throw new Error(NOT_IN_APP);
        saving(1);
        let error: unknown;
        try {
          await client.discard(d.flow, d.itemId);
          logWrite("discardDraft", { ok: true, message: `${d.label} discarded.`, handoffs: [], warnings: [] });
          toast("info", `${d.label} discarded.`);
        } catch (e) {
          error = e;
          logWrite("discardDraft", failedResult(e, env));
        } finally {
          saving(-1);
        }
        await loadNow(true);
        if (error) throw error;
      }),
    [client, containerOk, env, loadNow, logWrite, saving, serial, toast],
  );

  const extras = useMemo<LiveAppExtras | null>(() => {
    if (!loaded || !api) return null;
    return {
      loadedAt: loaded.snap.loadedAt,
      busy: loadingCount > 0 || savingCount > 0,
      loading: loadingCount > 0,
      saving: savingCount > 0,
      loadError,
      warnings: loaded.warnings,
      notes: loaded.notes,
      ...(keptSince(loaded.snap) ? { keptAt: keptSince(loaded.snap) } : {}),
      dropped: loaded.dropped,
      reads: loaded.snap.reads,
      reload: reloadOnChain,
      identity,
      acting: loaded.acting,
      setPersona: (id) => api.setPersona(id),
      caseBanner: (caseId) => caseBannerOf(loaded.mapped.index, loaded.snap, caseId),
      casePin: (caseId) => loaded.mapped.index.casePins?.get(caseId),
      drafts: loaded.drafts,
      sendDraft,
      discardDraft,
      writeLog,
      webhooks: loaded.webhooks,
      containerOk,
      build: BUILD,
    };
  }, [api, containerOk, discardDraft, identity, loadError, loaded, loadingCount, reloadOnChain, savingCount, sendDraft, writeLog]);

  // idempotent (identity check): the screens resolve sections and fields through the registry (store.tsx:296)
  if (loaded) syncRegistry((optimistic ?? loaded.mapped.state).config);
  // R1-9: right after a role switch the data is still the old role's (the effect above drops it): the loader, not one
  // frame of the old role's screens on the new role's landing page
  const switching = !!loaded && loaded.acting.personaId !== acting.personaId;
  if (!loaded || !api || !extras || switching) {
    if (!loadError || switching) return <BrandLoader label="Loading CIQ Digital…" />;
    return (
      <div className="mx-auto max-w-xl p-10" data-testid="load-failed">
        <Card>
          <EmptyState
            title="CIQ Digital could not be loaded"
            action={
              <Button
                variant="primary"
                icon={<RefreshCw size={15} />}
                onClick={() => {
                  setLoadError(null); // back to the loader while it retries
                  void reloadOnChain();
                }}
              >
                Try again
              </Button>
            }
          >
            {/* C3: production says what it means; dev keeps Kissflow's answer */}
            {env === "prod" ? LOAD_FAILED : loadError}
          </EmptyState>
        </Card>
      </div>
    );
  }
  return (
    <ProductionContext.Provider value={true}>
      <LiveFeaturesContext.Provider value={LIVE_FEATURES}>
        <StoreContext.Provider value={api}>
          <AppExtrasContext.Provider value={extras}>
            {children}
            <Toaster />
          </AppExtrasContext.Provider>
        </StoreContext.Provider>
      </LiveFeaturesContext.Provider>
    </ProductionContext.Provider>
  );
}
