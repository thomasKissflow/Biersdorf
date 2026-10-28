// Live mode for the supplier screens (plan v5): loads the signed-in contact's open tasks from My tasks, one list per
// supplier step (the SDK's activity filter), reads each item in full through its task, assembles CiqCase objects of
// the prototype's own flow (map.ts) in the case's pinned configuration (bundle.ts), and provides the prototype's
// StoreApi, so the approved supplier screens render live data unchanged.
// The supplier keeps its request as a task at "keep the CIQ up to date", so finished requests stay listed without the
// participated list (which fails platform-wide).
// Answer edits are shown at once (overlay; the scope re-derives live with them) and written per request after 700 ms
// of quiet; task actions flush pending edits first. Every write runs on ONE serial chain. An autosave shows the request
// as it read it back after the write (no reload of every task, which made saving slow); task actions, uploads and a
// failed save reload everything.
// 27 Oct: a file picked for an answer is stored in Kissflow at once (liveActions stageFile), so the contact can open
// Kissflow's preview before sending; the answer then reuses that upload. A file sent with an answer is never removable.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button, Card, EmptyState, ProductionContext, Toaster } from "@/components/ui";
import { COMPLETENESS_CONFIRMED } from "@/domain/actions";
import { PERSONA_BY_ID } from "@/domain/catalog";
import { syncRegistry } from "@/domain/rules";
import { SCHEMA } from "@/domain/seed";
import { isSetByBdf, questionnaireLocked } from "@/domain/selectors";
import type { AnswerValue, AppState, CiqCase, ComponentRow, ConfigAnswers, ConfigState, Toast, User } from "@/domain/types";
import type { KfFileMeta } from "../kf/sdk";
import { PortalCapsContext, type PortalCaps } from "@/store/portalCaps";
import { StoreContext, type StoreApi } from "@/store/store";
import { FLOWS, STEPS, UPLOADS_TABLE, type FlowKey, type StepKey } from "../kf/portal";
import { BrandLoader } from "../BrandLoader";
import { errorText } from "../kf/sdk";
import { RELEASE_LOCKED_TEXT } from "@/domain/permissions";
import { LockedError, isClosedRequest, isEmptyPatch, mergePatch, type AnswerPatch, type Who } from "./answers";
import { bundleHashMatches } from "./bundle";
import { caseWithConfig, configPatch } from "./configSave";
import type { PortalClient } from "./client";
import { liveActions, moveAtReleaseSteps, type LiveActions, type LiveData, type Task } from "./liveActions";
import { attachmentsOf, emptyNotes, groupBundles, requestStepOf, sentUploadIds, toSupplierSide, writableAnswer, type CaseExtra, type Loaded, type LocalNotes } from "./map";
import { childRows, str, type RawItem } from "./raw";

/** The supplier's task lists: one per step, through My tasks' activity filter (plan v5 §3.1–§3.3). */
export const TASK_LISTS: { flow: FlowKey; step: StepKey }[] = [
  { flow: "request", step: "fill" },
  { flow: "request", step: "keep" },
  { flow: "query", step: "respond" },
  // 16 Oct: the final release is a step of the request itself (CIQP Final Release is no longer used)
  { flow: "request", step: "release" },
  // 20 Oct: after the release the request is held at "view the released CIQ"
  { flow: "request", step: "released" },
];

async function pool<T, R>(items: T[], lanes: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(lanes, items.length) }, async () => {
      while (next < items.length) {
        const k = next++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

export interface LoadedData extends LiveData {
  warnings: string[];
}

/** Every open task of the contact, each read in full through its own task. A failed full read keeps the list row. */
export async function loadSupplierData(client: PortalClient, me: Who, local: LocalNotes = emptyNotes()): Promise<LoadedData> {
  const warnings: string[] = [];
  const listed = new Map<string, { flow: FlowKey; row: RawItem; steps: StepKey[] }>();
  // the task lists go out together (none needs another's answer) and are merged in TASK_LISTS order, as when they
  // were read one by one (26 Oct optimisation: 5 round trips became 1)
  const lists = await Promise.all(TASK_LISTS.map((l) => client.listTasks(l.flow, STEPS[l.step].activity)));
  for (const [i, l] of TASK_LISTS.entries()) {
    for (const r of lists[i]) {
      const id = String(r._id ?? "");
      if (!id) continue;
      const cur = listed.get(id) ?? { flow: l.flow, row: r, steps: [] };
      cur.steps.push(l.step);
      listed.set(id, cur);
    }
  }
  const loaded: Loaded[] = await pool([...listed.values()], 4, async ({ flow, row, steps }) => {
    const id = String(row._id);
    const act = typeof row._activity_instance_id === "string" ? row._activity_instance_id : undefined;
    if (!act) {
      warnings.push(`${FLOWS[flow].name} ${id}: listed without its step, so it can't be opened.`);
      return { flow, item: row, listedAt: steps };
    }
    try {
      const detail = await client.getFull(flow, id, act);
      return { flow, item: detail ? ({ ...row, ...detail, _activity_instance_id: act } as RawItem) : row, listedAt: steps };
    } catch (e) {
      warnings.push(`${FLOWS[flow].name} ${id}: ${errorText(e)}`);
      return { flow, item: row, listedAt: steps };
    }
  });
  // Thomas, 21 Oct: the screen moves a request at its release steps itself (keep → release once Beiersdorf requested
  // the release, release → keep after a reopen), at most once per task per page load; after a move everything is read
  // again (that read moves nothing more: the request is at another step). A failed move is only a warning.
  const moves = await moveAtReleaseSteps(client, loaded, local);
  if (moves.moved) return loadSupplierData(client, me, local);
  warnings.push(...moves.warnings);
  const tasks = new Map<string, Task>();
  for (const l of loaded) {
    const act = l.item._activity_instance_id;
    if (typeof act !== "string") continue;
    const step: StepKey = l.flow === "request" ? requestStepOf(l.item, l.listedAt) : l.flow === "query" ? "respond" : "release";
    tasks.set(l.item._id, { act, step });
  }
  const bundles = groupBundles(loaded);
  // a request released from this page has ended (no task any more): keep showing it, completed, until the page closes
  for (const [code, kept] of local.released) {
    if (bundles.some((b) => b.code === code)) local.released.delete(code); // listed again (e.g. sent back by the go-to step)
    else bundles.push(kept);
  }
  for (const b of bundles) {
    if (!b.request) continue;
    // Kissflow's step wins over a release given from this page: back at "fill"/"keep" (the go-to after a reopen)
    if (b.step === "fill" || b.step === "keep") local.releases.delete(b.code);
    // the service has written the release back (closed). Not the release-step lock (Thomas, 15 Oct): it comes before.
    if (isClosedRequest(b.request)) local.releases.delete(b.code);
    if ((await bundleHashMatches(b.request).catch(() => undefined)) === false) warnings.push(`${b.code}: the pinned questionnaire version does not match its fingerprint. Tell your Beiersdorf contact.`);
  }
  const side = toSupplierSide(bundles, me, local);
  return { bundles, tasks, side, loadedAt: new Date().toISOString(), warnings: [...warnings, ...side.warnings] };
}

/** The data with saved requests replaced by their read-back (case id → item), without reading every task again. */
export function withSavedRequests(d: LoadedData, saved: Map<string, RawItem>, me: Who, local: LocalNotes): LoadedData {
  if (!saved.size) return d;
  const bundles = d.bundles.map((b) => {
    const it = saved.get(b.code);
    return it && b.request ? { ...b, request: { ...b.request, ...it, _activity_instance_id: b.request._activity_instance_id } } : b;
  });
  const side = toSupplierSide(bundles, me, local);
  return { ...d, bundles, side, loadedAt: new Date().toISOString(), warnings: [...new Set([...d.warnings, ...side.warnings])] };
}

/** The stored Kissflow file of an uploaded document (Uploads row → Supplier_Files), for the preview. */
export function fileOfDocument(d: LoadedData | null, docId: string): Record<string, unknown> | undefined {
  for (const b of d?.bundles ?? []) {
    const row = childRows(b.request, UPLOADS_TABLE, "Upload_Id").find((r) => (str(r, "Upload_Id") || str(r, "_id")) === docId);
    if (!row) continue;
    const att = str(row, "Upload_Attachment_Id");
    return attachmentsOf(b.request).find((f) => String(f.id ?? "") === att);
  }
  return undefined;
}

/** The case, the request's task step and the Uploads row of a document (by its Upload_Id). */
export function uploadOf(d: LoadedData | null, docId: string): { caseId: string; step?: string; row: Record<string, unknown> } | undefined {
  for (const b of d?.bundles ?? []) {
    const row = childRows(b.request, UPLOADS_TABLE, "Upload_Id").find((r) => str(r, "Upload_Id") === docId);
    if (row) return { caseId: b.code, step: b.step, row };
  }
  return undefined;
}

/**
 * Whether the signed-in contact may remove a document (plan v6 D-12, a soft delete): their own upload, not removed yet,
 * while the questionnaire is editable (filling in or in review); never a file sent with an answer, in any round and
 * whatever the question's state since (27 Oct: map.ts sentUploadIds), nor one a question Beiersdorf has not closed
 * refers to in its conversation (like B-15 for rows).
 */
export function canRemoveUpload(d: LoadedData | null, cases: readonly CiqCase[], docId: string, meEmail: string, local?: LocalNotes): boolean {
  const u = uploadOf(d, docId);
  if (!u || str(u.row, "Upload_Removed_At")) return false;
  const c = cases.find((x) => x.id === u.caseId);
  if (c && sentUploadIds(c, local).has(docId)) return false;
  if (c?.openPoints.some((p) => p.status !== "closed" && p.thread.some((m) => m.documentId === docId))) return false;
  const x = d?.side.extras.get(u.caseId);
  const own = str(u.row, "Uploaded_By_Email").trim().toLowerCase() === meEmail.trim().toLowerCase();
  return own && !!x && !x.locked && !x.closed && (u.step === "fill" || u.step === "keep");
}

export interface LiveExtras {
  loadedAt: string;
  busy: boolean;
  warnings: string[];
  articles: RawItem[];
  /** Why the latest reload failed (the last good data stays on screen), or null. */
  loadError: string | null;
  reload(): Promise<boolean>;
  /** A colleague saved this request in the last minutes (B-12 presence hint). */
  presence(caseId: string): CaseExtra["editing"];
}

const ExtrasContext = createContext<LiveExtras | null>(null);

/** Live-only extras (help articles, presence, load state). Null in demo mode. */
export const useLiveExtras = (): LiveExtras | null => useContext(ExtrasContext);

interface Overlay {
  answers: Record<string, AnswerValue>;
  config: ConfigAnswers;
  just: Record<string, string>;
  components?: ComponentRow[];
}

const EMPTY_CONFIG: ConfigState = { pairs: [] };

export function LiveSupplierStore({ client, me, children }: { client: PortalClient; me: Who; children: ReactNode }) {
  const [local] = useState<LocalNotes>(emptyNotes);
  const [data, setData] = useState<LoadedData | null>(null);
  const [articles, setArticles] = useState<RawItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyCount, setBusyCount] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [overlay, setOverlay] = useState<Record<string, Overlay>>({});
  /** Uploads in flight per "case|section", for the section's "Uploading…" note. */
  const [uploading, setUploading] = useState<Record<string, number>>({});
  const track = useCallback((key: string, d: number) => {
    setUploading((u) => {
      const n = (u[key] ?? 0) + d;
      const next = { ...u };
      if (n > 0) next[key] = n;
      else delete next[key];
      return next;
    });
  }, []);
  /** Files picked for an answer and already stored in Kissflow (27 Oct): the file → its upload answer. */
  const staged = useRef(new WeakMap<File, KfFileMeta>());
  const queue = useRef(new Map<string, AnswerPatch>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = (d: number) => setBusyCount((n) => n + d);

  const notify = useCallback((tone: Toast["tone"], text: string) => {
    setToasts((t) => [...t, { id: `t${Date.now()}${Math.random().toString(36).slice(2, 7)}`, tone, text }]);
  }, []);

  /** Reads everything again. Keeps the last good data on failure (the header shows the error); true on success. */
  const reload = useCallback(async (): Promise<boolean> => {
    busy(1);
    try {
      setData(await loadSupplierData(client, me, local));
      setLoadError(null);
      return true;
    } catch (e) {
      setLoadError(errorText(e));
      return false;
    } finally {
      busy(-1);
    }
  }, [client, me, local]);

  useEffect(() => {
    void reload();
    client
      .formList("helpArticle")
      .then(setArticles)
      .catch(() => setArticles([]));
  }, [reload, client]);

  // The screens resolve sections and fields through the synced registry: the cases' pinned configurations (B-50).
  const config = data?.side.config ?? EMPTY_CONFIG;
  useMemo(() => syncRegistry(config), [config]);

  const acts = useMemo(() => (data ? liveActions(client, data, me, { local, onSyncProblem: (t) => notify("warning", t) }) : null), [client, data, me, local, notify]);
  const actsRef = useRef(acts);
  actsRef.current = acts;

  /** Every write runs on this one chain, in order: autosave flushes and task actions never overlap. */
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const serial = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.current.then(fn);
    chain.current = p.catch(() => undefined);
    return p;
  }, []);

  /**
   * Saves what is queued, one read-merge-write per request. The queue is drained when this step RUNS on the chain, so
   * an edit made while an earlier save is in flight stays queued (and on screen) for the next one. On-screen copies are
   * dropped only after a successful reload, and never for a key that has a newer edit waiting.
   */
  // 22 Oct (FE clean-up A12): leaving the page while an answer is not saved yet asks the browser to confirm
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!queue.current.size) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  const flushNow = useCallback((): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    return serial(async () => {
      const items = [...queue.current.entries()];
      queue.current.clear();
      const a = actsRef.current;
      if (!items.length || !a) return true;
      busy(1);
      let allSaved = true;
      /** Requests whose save failed for a passing reason: their unsaved values stay on screen (a locked request's
       *  never can be saved, so those are dropped with the reload). */
      const keep = new Set<string>();
      /** The requests as read back after their save (case id → item). */
      const saved = new Map<string, RawItem>();
      try {
        for (const [caseId, patch] of items) {
          try {
            saved.set(caseId, await a.patchRequest(caseId, patch));
          } catch (e) {
            allSaved = false;
            if (!(e instanceof LockedError)) {
              keep.add(caseId);
              // back in the queue (newer edits win): the next save or task action tries it again, and (22 Oct, FE
              // clean-up A12) so does a retry in 15 s, so a failed answer is not left looking saved
              queue.current.set(caseId, mergePatch(patch, queue.current.get(caseId) ?? {}));
              if (!timer.current) timer.current = setTimeout(() => void flushNow(), 15000);
            }
            notify("danger", e instanceof LockedError ? `Not saved: ${errorText(e)}` : `Not saved: ${errorText(e)} We try again in 15 seconds; please keep this page open.`);
          }
        }
        // Every save landed: show the read-back requests (fast). A failed save reads everything again (the request may
        // have moved on, e.g. to the final release).
        if (allSaved) setData((d) => (d ? withSavedRequests(d, saved, me, local) : d));
        else if (!(await reload())) return false; // keep the on-screen copies: the last good data predates this save
        setOverlay((o) => {
          const next = { ...o };
          for (const [caseId, patch] of items) {
            const c = next[caseId];
            if (!c || keep.has(caseId)) continue;
            const waiting = queue.current.get(caseId);
            const answers = { ...c.answers };
            const cfg = { ...c.config } as Record<string, unknown>;
            const just = { ...c.just };
            for (const f of Object.keys(patch.set ?? {})) if (!waiting?.set || !(f in waiting.set)) delete answers[f];
            for (const f of Object.keys(patch.config ?? {})) if (!waiting?.config || !(f in waiting.config)) delete cfg[f];
            for (const f of Object.keys(patch.just ?? {})) if (!waiting?.just || !(f in waiting.just)) delete just[f];
            const components = patch.components && !waiting?.components ? undefined : c.components;
            next[caseId] = { answers, config: cfg as ConfigAnswers, just, components };
          }
          return next;
        });
        return allSaved;
      } finally {
        busy(-1);
      }
    });
  }, [notify, reload, serial, me, local]);

  const enqueue = useCallback(
    (caseId: string, patch: AnswerPatch) => {
      if (isEmptyPatch(patch)) return;
      queue.current.set(caseId, mergePatch(queue.current.get(caseId) ?? {}, patch));
      setOverlay((o) => {
        const c = o[caseId] ?? { answers: {}, config: {}, just: {} };
        return { ...o, [caseId]: { answers: { ...c.answers, ...patch.set }, config: { ...c.config, ...patch.config }, just: { ...c.just, ...patch.just }, components: patch.components ?? c.components } };
      });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flushNow(), 700);
    },
    [flushNow],
  );

  /** A task action: pending edits are saved first, then the action runs on the same chain, then everything reloads.
   *  Resolves with the action's result, or false when it did not reach Kissflow (the screens keep the user's input). */
  const run = useCallback(
    <T,>(success: string | null, fn: (a: LiveActions) => Promise<T>): Promise<T | false> => {
      busy(1);
      const saved = flushNow();
      return serial(async () => {
        if (!(await saved)) throw new Error("Your latest answers were not saved, so this step was not sent. Check the fields marked above and try again.");
        const a = actsRef.current;
        if (!a) throw new Error("Still loading — please try again in a moment.");
        return fn(a);
      })
        .then(async (r) => {
          if (success) notify("success", success);
          await serial(reload);
          return r;
        })
        .catch(async (e): Promise<false> => {
          notify("danger", errorText(e));
          await serial(reload).catch(() => false);
          return false;
        })
        .finally(() => busy(-1));
    },
    [flushNow, notify, reload, serial],
  );

  const cases = useMemo(
    () =>
      (data?.side.cases ?? []).map((c): CiqCase => {
        const o = overlay[c.id];
        const x = data?.side.extras.get(c.id);
        if (!o || !x) return c;
        const config = { ...c.config, ...o.config, SF11: c.config.SF11 };
        const justifications = { ...c.justifications };
        for (const [k, t] of Object.entries(o.just)) {
          if (t.trim()) justifications[k] = t;
          else delete justifications[k];
        }
        // the scope follows the unsaved metadata answers at once (B-07); after completeness it only grows (B-28)
        return { ...caseWithConfig(c, x, data!.side.config, config), answers: { ...c.answers, ...o.answers }, justifications, components: o.components ?? c.components };
      }),
    [data, overlay],
  );

  const meUser: User = useMemo(() => data?.side.users.find((u) => u.id === me.id) ?? { id: me.id, name: me.name, email: me.email, side: "supplier", title: "Supplier contact", initials: "?" }, [data, me]);

  const api = useMemo<StoreApi>(() => {
    const state: AppState = { schema: SCHEMA, personaId: "supplier", cases, users: data?.side.users ?? [meUser], suppliers: data?.side.suppliers ?? [], templates: [], activeRuleSet: "", config, ownership: {}, reminders: [], toasts, mails: [], log: [], changeReports: data?.side.changeReports ?? [] };
    const na = (what: string) => notify("warning", `${what} is not available in the supplier portal.`);
    const caseOf = (id: string) => cases.find((x) => x.id === id);
    /** No supplier change on a closed request, nor while the final release is requested (Thomas, 15 Oct). */
    const closed = (id: string) => {
      const c = caseOf(id);
      if (c && questionnaireLocked(c)) {
        notify("danger", c.phase === "completed" ? "The CIQ is frozen after the final release. Use “Report a change” instead." : c.phase === "final-release" ? RELEASE_LOCKED_TEXT : "This request was withdrawn; it can no longer be changed.");
        return true;
      }
      return false;
    };
    return {
      state,
      persona: { ...PERSONA_BY_ID.supplier, userId: me.id },
      me: meUser,
      setPersona: () => undefined,
      reset: () => void serial(reload),
      notify,
      dismissToast: (id) => setToasts((t) => t.filter((x) => x.id !== id)),
      createCase: () => {
        na("Creating a case");
        return "";
      },
      updateCaseContacts: () => (na("Changing case contacts"), false),
      saveConfig: (id, patch) => {
        if (closed(id)) return;
        // today's questions only (K12), and the pre-fills of the sections the answer opens (M9): configSave.ts
        enqueue(id, configPatch(caseOf(id), data?.side.extras.get(id), config, patch, overlay[id]?.answers));
      },
      submitMetadata: () => notify("info", "The metadata questions are part of the CIQ now: answer them in the questionnaire, then confirm completeness."),
      extendScope: () => na("Extending the scope"),
      setAnswer: (id, f, v) => {
        const c = caseOf(id);
        if (!c || closed(id)) return;
        if (isSetByBdf(c, f)) return notify("danger", "This answer is set by Beiersdorf at case start and can't be changed in the questionnaire. If it is wrong, tell your Beiersdorf contact.");
        if (!writableAnswer(f, c.templateVersion, config)) return; // a file question is answered by its upload
        enqueue(id, { set: { [f]: v } });
      },
      setComponents: (id, rows) => {
        const c = caseOf(id);
        if (!c || closed(id)) return;
        // B-15: a row Beiersdorf asked about cannot be deleted while the question is unresolved
        const asked = c.openPoints.filter((p) => p.status !== "closed" && p.ref.rowId && !rows.some((r) => r.id === p.ref.rowId));
        if (asked.length) return notify("danger", `Beiersdorf asked about this component (${asked.map((p) => p.ref.label).join(", ")}). Answer the question instead of removing the row.`);
        enqueue(id, { components: rows });
      },
      setJustification: (id, k, t) => {
        if (closed(id)) return;
        enqueue(id, { just: { [k]: t } });
      },
      uploadDocument: (id, doc, file) => {
        if (!file || closed(id)) return Promise.resolve("");
        const key = `${id}|${doc.sectionId}`;
        track(key, 1);
        return run(null, (a) => a.uploadDocument(id, doc, file).then((r) => r.uploadId))
          .then((r) => r || "")
          .finally(() => track(key, -1));
      },
      confirmCompleteness: (id) => void run(COMPLETENESS_CONFIRMED, (a) => a.confirmCompleteness(id)),
      raiseOpenPoint: () => na("Raising a question"),
      // a file stored at once for its preview (stageAnswerFile) is not uploaded again
      supplierRespond: (id, op, input) => run("Your response was sent to Beiersdorf.", (a) => a.supplierRespond(id, op, { ...input, staged: input.file ? staged.current.get(input.file) : undefined }, caseOf(id)).then(() => true)).then((r) => r === true),
      reviewResponse: () => na("Reviewing a response"),
      editOpenPoint: () => (na("Editing a question"), false),
      closeOpenPoint: () => (na("Closing a question"), false),
      recordCriterion: () => na("RMES"),
      addFinding: () => na("Findings"),
      findingToQuery: () => na("Findings"),
      closeFinding: () => na("Findings"),
      rmesDecision: () => na("RMES decisions"),
      completeReview: () => na("Department reviews"),
      reopenReview: () => na("Department reviews"),
      reassignReview: () => (na("Department reviews"), false),
      finalRelease: (id) => void run("Final release recorded. The CIQ is now frozen.", (a) => a.finalRelease(id)),
      cancelCase: () => na("Cancelling a case"),
      reactivateCase: () => (na("Reactivating a case"), false),
      reportChange: (id, text) => {
        const c = caseOf(id);
        if (c?.phase === "final-release") return (notify("info", RELEASE_LOCKED_TEXT), false);
        if (!c || c.phase !== "completed") return (notify("info", "Until the final release you change the answers directly in the questionnaire."), false);
        if (data?.side.extras.get(id)?.reportPending) return (notify("warning", "Your previous report is still being sent to Beiersdorf. You can send another one in about a minute."), false);
        if (!text.trim()) return (notify("danger", "Describe what has changed."), false);
        void run("Thank you. Beiersdorf has been told and will contact you if a new questionnaire is needed.", (a) => a.reportChange(id, text));
        return true;
      },
      addInternalNote: () => na("Internal notes"),
      addSupplier: () => (na("The supplier master"), null),
      updateSupplier: () => (na("The supplier master"), false),
      addContact: () => (na("The supplier master"), null),
      updateContact: () => (na("The supplier master"), false),
      setContactActive: () => (na("The supplier master"), false),
      markMailRead: () => na("The inbox"),
      markAllMailsRead: () => na("The inbox"),
      runReminders: () => (na("Reminders"), 0),
      publishTemplateV2: () => na("Publishing templates"),
      setOwnership: () => na("Section ownership"),
      updateReminder: () => na("Reminder settings"),
      createDraft: () => (na("The configuration"), false),
      discardDraft: () => (na("The configuration"), false),
      upsertRule: () => (na("The configuration"), null),
      deleteRule: () => (na("The configuration"), false),
      upsertSection: () => (na("The configuration"), null),
      retireSection: () => (na("The configuration"), false),
      restoreSection: () => (na("The configuration"), false),
      upsertField: () => (na("The configuration"), null),
      moveField: () => (na("The configuration"), false),
      removeField: () => (na("The configuration"), false),
      validateDraft: () => undefined,
      publishDraft: () => (na("The configuration"), false),
    };
  }, [cases, config, data, enqueue, me.id, meUser, notify, overlay, reload, run, serial, toasts, track]);

  const caps = useMemo<PortalCaps>(() => {
    const extra = (caseId: string) => data?.side.extras.get(caseId);
    const taskAt = (id: string | undefined) => (id ? data?.tasks.get(id) : undefined);
    return {
      // The release is still given while the questionnaire is locked for it (Thomas, 15 Oct); nothing on a closed request.
      canAct: (caseId, task) => {
        const x = extra(caseId);
        if (!x || x.closed) return false;
        return task === "completeness" ? !x.locked && taskAt(x.requestId)?.step === "fill" : taskAt(x.releaseId)?.step === "release";
      },
      whoCanAct: (caseId) => {
        const c = cases.find((k) => k.id === caseId);
        const users = data?.side.users ?? [];
        return (c?.supplierContactIds ?? []).filter((id) => id !== me.id).map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u && u.mayConfirm !== false).map((u) => u.name);
      },
      canUpload: (caseId) => {
        const x = extra(caseId);
        return !!x && !x.locked && !!taskAt(x.requestId);
      },
      changeReportPending: (caseId) => !!extra(caseId)?.reportPending,
      uploadsIn: (caseId, sectionId) => uploading[`${caseId}|${sectionId}`] ?? 0,
      canPreview: (docId) => !!fileOfDocument(data, docId),
      preview: (docId) => {
        const f = fileOfDocument(data, docId);
        if (!f) return notify("warning", "This file is not stored on the questionnaire yet. Reload and try again.");
        void client.previewFiles([f]).catch((e) => notify("danger", `The preview could not open: ${errorText(e)}`));
      },
      // plan v6 D-12: the contact's own upload, while the questionnaire is editable; never a file sent with an answer
      canRemove: (docId) => canRemoveUpload(data, cases, docId, me.email, local),
      remove: async (docId) => {
        const u = uploadOf(data, docId);
        if (!u) return false;
        const r = await run("File removed from the questionnaire.", (a) => a.removeDocument(u.caseId, docId).then(() => true));
        return r === true;
      },
      // 27 Oct: an answer's file is stored at once, so it can be previewed before it is sent (nothing is written to the
      // questionnaire until the answer goes). Off the write chain: it writes no item.
      stagesAnswerFiles: true,
      stageAnswerFile: async (caseId, opId, file) => {
        const a = actsRef.current;
        if (!a) return (notify("warning", "Still loading — please try again in a moment."), false);
        busy(1);
        try {
          staged.current.set(file, await a.stageFile(caseId, opId, file));
          return true;
        } catch (e) {
          notify("warning", `The preview of ${file.name} is not available: ${errorText(e)}`);
          return false;
        } finally {
          busy(-1);
        }
      },
      previewAnswerFile: (file) => {
        const f = staged.current.get(file);
        if (!f) return notify("warning", "This file can't be previewed yet. It is stored when you send your answer.");
        void client.previewFiles([f]).catch((e) => notify("danger", `The preview could not open: ${errorText(e)}`));
      },
    };
  }, [cases, client, data, local, me.email, me.id, notify, run, uploading]);

  const extras = useMemo<LiveExtras>(
    () => ({
      loadedAt: data?.loadedAt ?? "",
      busy: busyCount > 0,
      warnings: data?.warnings ?? [],
      articles,
      loadError,
      reload: () => serial(reload),
      presence: (caseId) => data?.side.extras.get(caseId)?.editing,
    }),
    [articles, busyCount, data, loadError, reload, serial],
  );

  if (!data && !loadError) {
    return <BrandLoader label="Loading your questionnaires…" />;
  }
  if (!data && loadError) {
    return (
      <div className="mx-auto max-w-xl p-10">
        <Card>
          <EmptyState
            title="Your questionnaires could not be loaded"
            action={
              <Button
                variant="primary"
                icon={<RefreshCw size={15} />}
                onClick={() => {
                  setLoadError(null); // back to the loader while it retries
                  void serial(reload);
                }}
              >
                Try again
              </Button>
            }
          >
            {loadError}
          </EmptyState>
        </Card>
      </div>
    );
  }
  return (
    <ProductionContext.Provider value={true}>
      <PortalCapsContext.Provider value={caps}>
        <StoreContext.Provider value={api}>
          <ExtrasContext.Provider value={extras}>
            {children}
            <Toaster />
          </ExtrasContext.Provider>
        </StoreContext.Provider>
      </PortalCapsContext.Provider>
    </ProductionContext.Provider>
  );
}
