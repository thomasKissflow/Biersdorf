// Opening the supplier's files from the internal screens (27 Oct, Thomas's prod test: "the attachments are not able to
// view in the app … fix this in both the questionnaire and the Documents overview"). The supplier uploads in the portal;
// the integrations copy the request's Documents_JSON verbatim onto the CIQ Case, so the app knows each file by its
// entry: uploadId (the DocumentRef id), attachmentId, fileName and, since 27 Oct (portal map.ts documentsJsonOf), `file`,
// the upload answer's preview metadata (id, key, name, size, fileExtension).
// A document opens in Kissflow's own file preview (AppClient.previewFiles: kf.client.openFilePreview, as the portal's
// "Preview"), with every openable file of the case's Documents_JSON to page through, on the clicked one:
//   1. the entry's own `file` (with a key);
//   2. an older entry (no `file`): the case's portal request (Portal_Request_Item_Id), read ONCE per case and set of such
//      files (AppClient.portalGet: kf.api GET /process/2/{acc}/admin/CIQP_Request_A00/{id}?_application_id=
//      CIQ_Supplier_Portal_A00, [unverified live from the app's frame]), its Supplier_Files by attachmentId;
//   3. neither: the name with a quiet note that the supplier portal opens it (components/docOpener.tsx PORTAL_ONLY_NOTE);
//      the reason goes to `problem` (the store: a Diagnostics line; a toast when the person clicked).
// Whether an app user may preview a file a portal user stored is [unverified live]. React-free, so it is unit-tested;
// LiveAppStore provides it to DocName through DocOpenerContext.
import type { DocOpener, DocOpenStatus } from "@/components/docOpener";
import { attachmentsOf } from "@/portal/data/map";
import { json, str, type RawItem } from "@/portal/data/raw";
import { errorText } from "@/portal/kf/sdk";
import type { AppClient, LiveIndex } from "./types";

/** One Documents_JSON entry, as the opener needs it. */
export interface DocEntry {
  uploadId: string;
  attachmentId: string;
  fileName: string;
  /** The stored file's preview metadata (27 Oct entries), as stored. */
  file?: Record<string, unknown>;
}

/** A case's files, as the opener knows them. */
export interface CaseDocs {
  caseId: string;
  caseItemId: string;
  /** The case's CIQP Request in the supplier portal (I-1 writes it on the case). */
  requestItemId?: string;
  /** Documents_JSON in its stored order. */
  entries: DocEntry[];
}

/** A stored file Kissflow's preview can open: an object with an id and a key. */
export const previewable = (f: unknown): f is Record<string, unknown> => {
  const o = f as { id?: unknown; key?: unknown } | null;
  return !!o && typeof o === "object" && typeof o.key === "string" && !!o.key && typeof o.id === "string" && !!o.id;
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A case item's Documents_JSON entries, in stored order (as map/caseMap.ts documentsOf reads them: an entry needs its
 *  uploadId; one id once). */
export function docEntriesOf(item: RawItem | undefined): DocEntry[] {
  const rows = json<unknown>(item, "Documents_JSON", []);
  if (!Array.isArray(rows)) return [];
  const out: DocEntry[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!isObj(r) || typeof r.uploadId !== "string" || !r.uploadId || seen.has(r.uploadId)) continue;
    seen.add(r.uploadId);
    out.push({
      uploadId: r.uploadId,
      attachmentId: typeof r.attachmentId === "string" ? r.attachmentId : "",
      fileName: typeof r.fileName === "string" ? r.fileName : "",
      ...(isObj(r.file) ? { file: r.file } : {}),
    });
  }
  return out;
}

/** Every mapped case's files by upload id (the DocumentRef id the screens show), from the case items this load read. */
export function docIndexOf(caseItems: readonly RawItem[], index: Pick<LiveIndex, "cases">): Map<string, CaseDocs> {
  const byId = new Map(caseItems.map((it) => [it._id, it]));
  const out = new Map<string, CaseDocs>();
  for (const ref of index.cases.values()) {
    const item = byId.get(ref.itemId);
    if (!item) continue;
    const entries = docEntriesOf(item);
    if (!entries.length) continue;
    const requestItemId = str(item, "Portal_Request_Item_Id") || ref.portalRequestItemId || undefined;
    const docs: CaseDocs = { caseId: ref.caseId, caseItemId: ref.itemId, ...(requestItemId ? { requestItemId } : {}), entries };
    for (const e of entries) if (!out.has(e.uploadId)) out.set(e.uploadId, docs);
  }
  return out;
}

/** The read of a case's portal request for its stored files. */
export type RequestRead = { state: "pending" } | { state: "ok"; files: Record<string, unknown>[] } | { state: "failed"; why: string };

/** The entries that have no previewable file of their own (they need the portal request). */
const legacyOf = (docs: CaseDocs) => docs.entries.filter((e) => !previewable(e.file));

/** The cache key of a case's request read: the request and the attachments it is read for (a new older-format upload, e.g.
 *  from a portal bundle without `file`, reads again). Undefined when nothing needs it. */
export function requestKeyOf(docs: CaseDocs): string | undefined {
  const need = legacyOf(docs).map((e) => e.attachmentId).filter(Boolean).sort();
  return need.length && docs.requestItemId ? `${docs.requestItemId}|${need.join(",")}` : undefined;
}

export type PreviewPlan =
  /** Open these, on `index`. */
  | { files: Record<string, unknown>[]; index: number }
  /** The case's portal request must be read first. */
  | { need: "request" }
  /** Not openable here; `why` is the reason (dev). */
  | { none: string };

/** What opening `docId` takes: every openable file of the case's list (each entry's own `file`, else its Supplier_Files
 *  value from `read`), on the clicked one; the request read while it is still needed; or why it can't be opened. */
export function previewPlan(docs: CaseDocs, docId: string, read?: RequestRead): PreviewPlan {
  const target = docs.entries.find((e) => e.uploadId === docId);
  if (!target) return { none: "the file is not in the case's file list (Documents_JSON)" };
  const stored = read?.state === "ok" ? read.files : [];
  const fileOf = (e: DocEntry): Record<string, unknown> | undefined => (previewable(e.file) ? e.file : e.attachmentId ? stored.find((f) => f.id === e.attachmentId && previewable(f)) : undefined);
  const own = fileOf(target);
  if (own) {
    const files: Record<string, unknown>[] = [];
    let index = 0;
    for (const e of docs.entries) {
      const f = e === target ? own : fileOf(e);
      if (!f) continue;
      if (e === target) index = files.length;
      files.push(f);
    }
    return { files, index };
  }
  if (!target.attachmentId) return { none: "its entry names no stored file (no attachmentId)" };
  if (!docs.requestItemId) return { none: "the case names no portal request (Portal_Request_Item_Id is empty)" };
  if (!read || read.state === "pending") return { need: "request" };
  if (read.state === "failed") return { none: `the portal request could not be read (${read.why})` };
  return { none: `${target.attachmentId} is not among the portal request's stored files (Supplier_Files)` };
}

export interface DocOpenerDeps {
  client: Pick<AppClient, "previewFiles" | "portalGet">;
  /** The case files of the data on screen (they change with every load). */
  docs(): Map<string, CaseDocs>;
  /** A request read settled: the screens show the new status. */
  changed(): void;
  /** Why a file can't be opened here (dev wording). `opening`: the person clicked it (a toast); otherwise found while
   *  preparing (a Diagnostics line only), once per case and reason. */
  problem(why: string, doc: { docId: string; name: string; caseId: string; opening: boolean }): void;
}

/** The opener the live store provides (DocOpenerContext). Its request reads are kept for its life (one store = one
 *  role and session), by requestKeyOf. */
export function createDocOpener(deps: DocOpenerDeps): DocOpener & { reads: Map<string, RequestRead> } {
  const reads = new Map<string, RequestRead>();
  const inFlight = new Map<string, Promise<void>>();
  const told = new Set<string>();

  const readOf = (docs: CaseDocs): RequestRead | undefined => {
    const key = requestKeyOf(docs);
    return key ? reads.get(key) : undefined;
  };

  function planOf(docId: string): { docs: CaseDocs; plan: PreviewPlan } | undefined {
    const docs = deps.docs().get(docId);
    if (!docs) return undefined;
    let plan = previewPlan(docs, docId, readOf(docs));
    // no route to read the request with: nothing to wait for
    if ("need" in plan && typeof deps.client.portalGet !== "function") plan = { none: "this page has no route to read the supplier portal's request" };
    if ("files" in plan && typeof deps.client.previewFiles !== "function") plan = { none: "this page cannot open Kissflow's file preview" };
    return { docs, plan };
  }

  const nameOf = (docs: CaseDocs, docId: string) => docs.entries.find((e) => e.uploadId === docId)?.fileName || "Document";

  /** Reads the case's portal request once (per requestKeyOf); the result is kept, a failure too. */
  function readRequest(docs: CaseDocs): Promise<void> {
    const key = requestKeyOf(docs);
    if (!key || !docs.requestItemId || typeof deps.client.portalGet !== "function") return Promise.resolve();
    const done = reads.get(key);
    if (done && done.state !== "pending") return Promise.resolve();
    const running = inFlight.get(key);
    if (running) return running;
    reads.set(key, { state: "pending" });
    const requestId = docs.requestItemId;
    const p = deps.client
      .portalGet("request", requestId)
      .then((item): RequestRead => {
        // the request must be this case's (I-1 writes App_Case_Item_Id on it)
        const owner = str(item, "App_Case_Item_Id");
        if (owner && owner !== docs.caseItemId) return { state: "failed", why: `the portal request ${requestId} belongs to another case (${owner})` };
        return { state: "ok", files: attachmentsOf(item) };
      })
      .catch((e: unknown): RequestRead => ({ state: "failed", why: errorText(e) }))
      .then((r) => {
        reads.set(key, r);
        inFlight.delete(key);
        deps.changed();
      });
    inFlight.set(key, p);
    return p;
  }

  /** Tells a reason once per case while preparing (a load re-renders every name; a refused request read is one line,
   *  not one per file: a file's own reason names its attachment, so it is told for that file). */
  function tellOnce(why: string, docs: CaseDocs, docId: string) {
    const k = `${docs.caseId}|${why}`;
    if (told.has(k)) return;
    told.add(k);
    deps.problem(why, { docId, name: nameOf(docs, docId), caseId: docs.caseId, opening: false });
  }

  return {
    reads,
    status(docId): DocOpenStatus | undefined {
      const hit = planOf(docId);
      if (!hit) return undefined;
      const { plan } = hit;
      return "files" in plan ? "ready" : "need" in plan ? "checking" : "portal";
    },
    prepare(docId) {
      const hit = planOf(docId);
      if (!hit) return;
      if ("need" in hit.plan) {
        void readRequest(hit.docs).then(() => {
          const after = planOf(docId);
          if (after && "none" in after.plan) tellOnce(after.plan.none, after.docs, docId);
        });
      } else if ("none" in hit.plan) tellOnce(hit.plan.none, hit.docs, docId);
    },
    async open(docId) {
      let hit = planOf(docId);
      if (!hit) return;
      if ("need" in hit.plan) {
        await readRequest(hit.docs);
        hit = planOf(docId) ?? hit;
      }
      const { docs, plan } = hit;
      const doc = { docId, name: nameOf(docs, docId), caseId: docs.caseId, opening: true };
      if ("none" in plan) return deps.problem(plan.none, doc);
      if (!("files" in plan)) return deps.problem("the portal request is still being read", doc);
      try {
        await deps.client.previewFiles!(plan.files, plan.index);
      } catch (e) {
        deps.problem(`Kissflow's file preview did not open (${errorText(e)})`, doc);
      }
    },
  };
}
