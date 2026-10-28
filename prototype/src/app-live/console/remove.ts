// The data console's delete (26 Oct, Thomas: "when I am deleting an item just delete the item, no need to check for
// dependencies"): ONE call per item (a form row by formDelete, a process item by the admin delete), then nothing: no
// dependency search, no read-back; an answer without an error is success. 27 Oct: a CIQ Case is deleted WITH everything
// that belongs to it (caseDelete.ts, the drawer's and the bulk delete's CaseCascadeDialog); deleteItem stays the
// one-call delete of every other item.
// The bulk delete (checkboxes on a flow's table) deletes strictly one at a time, BULK_GAP_MS apart, stops when asked,
// and pauses when Kissflow still answers 429 after the console client's backoff (kf/client.ts CONSOLE_RETRY).
import { errorText } from "@/portal/kf/sdk";
import { RateLimitError } from "../kf/client";
import type { AppClient, FlowKey, FormKey } from "../types";
import { isNotFound, isProcess, need } from "./common";

/** The pause between two deletes of a bulk delete. */
export const BULK_GAP_MS = 400;

/** A delete's refusal, as the console shows it: Kissflow's text; "not found" also says the item may be gone already. */
export const deleteProblem = (text: string) => (isNotFound(text) ? `${text} It may be deleted already: Refresh the list to check.` : text);

/** Deletes one item with one call; throws Kissflow's answer when it refuses. */
export async function deleteItem(client: AppClient, flow: FlowKey, id: string): Promise<void> {
  if (isProcess(flow)) await need(client.adminDelete?.bind(client), "The admin delete")(flow, id);
  else await need(client.formDelete?.bind(client), "Deleting a row")(flow as FormKey, id);
}

export interface BulkItem {
  id: string;
  /** What the table shows for it (its business key, else its id). */
  key: string;
}
export interface BulkProgress {
  /** Items handled so far (deleted or failed). */
  done: number;
  total: number;
  /** The item being deleted now. */
  current?: BulkItem;
}
export interface BulkResult {
  deleted: BulkItem[];
  failed: (BulkItem & { why: string })[];
  /** Not tried (Stop, or the pause). */
  remaining: BulkItem[];
  stopped?: boolean;
  /** Kissflow still answered 429 after the backoff: the run paused here (RATE_LIMITED); `remaining` starts with it. */
  paused?: string;
}
export interface BulkRun {
  /** The pause between two deletes (default BULK_GAP_MS). */
  gapMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Asked before each delete: true ends the run there. */
  stop?: () => boolean;
  onProgress?: (p: BulkProgress) => void;
  /** Each item Kissflow deleted (the table drops it at once). */
  onDeleted?: (x: BulkItem) => void;
}

/** Deletes the items strictly one at a time, `gapMs` apart. A refusal is noted and the run goes on; a call still
 *  rate-limited after the backoff pauses the run (nothing more is sent). */
export async function runBulkDelete(client: AppClient, flow: FlowKey, items: BulkItem[], run: BulkRun = {}): Promise<BulkResult> {
  const gap = run.gapMs ?? BULK_GAP_MS;
  const sleep = run.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const out: BulkResult = { deleted: [], failed: [], remaining: [] };
  for (const [i, x] of items.entries()) {
    if (run.stop?.()) {
      out.stopped = true;
      out.remaining = items.slice(i);
      break;
    }
    if (i > 0 && gap > 0) {
      await sleep(gap);
      if (run.stop?.()) {
        out.stopped = true;
        out.remaining = items.slice(i);
        break;
      }
    }
    run.onProgress?.({ done: i, total: items.length, current: x });
    try {
      await deleteItem(client, flow, x.id);
      out.deleted.push(x);
      run.onDeleted?.(x);
    } catch (e) {
      if (e instanceof RateLimitError) {
        out.paused = e.message;
        out.remaining = items.slice(i);
        break;
      }
      out.failed.push({ ...x, why: errorText(e) });
    }
  }
  run.onProgress?.({ done: items.length - out.remaining.length, total: items.length });
  return out;
}
