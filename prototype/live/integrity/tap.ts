// A recording tap on the suite's clients (S-INTEGRITY is read-only: SPEC §4): every client call S-INTEGRITY makes,
// with its flow and id, whether it is a write, and what it answered, so the suite can (1) prove it wrote nothing,
// offline too, where the fakes keep no complete call log (offlineApp's admin PUT, withdraw and delete bypass it); (2)
// check every row the fingerprint read without reading it again; (3) count its calls for the live estimate.
import type { RawItem } from "@/portal/data/raw";

/** Client methods that change something (both clients). */
export const WRITE_METHODS = new Set([
  "create", "update", "submit", "discard", "formCreate", "formUpdate", "formDelete", "postWebhook", "adminPut", "withdraw", "remove",
  "adminUpdate", "adminDelete", "updateChildRow", "addChildRow", "uploadFile",
]);

export interface TapCall {
  side: "app" | "portal";
  method: string;
  /** The flow key (first argument) when it is one. */
  flow?: string;
  /** The item id (second argument) when it is one. */
  id?: string;
  /** getRaw / apiGet: the route. */
  path?: string;
  write: boolean;
  /** Item reads and lists: what came back (a list's rows, an item). */
  rows?: RawItem[];
  error?: string;
}

const isRow = (x: unknown): x is RawItem => !!x && typeof x === "object" && !Array.isArray(x) && typeof (x as RawItem)._id === "string";

/** `inner` with every method call recorded in `calls` (it is otherwise unchanged; nothing is refused here). */
export function tap<T extends object>(inner: T, side: TapCall["side"], calls: TapCall[]): T {
  return new Proxy(inner, {
    get(target, key, receiver) {
      const v = Reflect.get(target, key, receiver) as unknown;
      if (typeof v !== "function" || typeof key !== "string") return v;
      return (...args: unknown[]) => {
        const a0 = typeof args[0] === "string" ? args[0] : undefined;
        const c: TapCall = { side, method: key, write: WRITE_METHODS.has(key), ...(a0 ? (a0.startsWith("/") ? { path: a0 } : { flow: a0 }) : {}), ...(typeof args[1] === "string" ? { id: args[1] } : {}) };
        calls.push(c);
        const out = (v as (...a: unknown[]) => unknown).apply(target, args);
        if (!(out instanceof Promise)) return out;
        return out.then(
          (r) => {
            if (Array.isArray(r) && r.every(isRow)) c.rows = r;
            else if (isRow(r)) c.rows = [r];
            return r;
          },
          (e: unknown) => {
            c.error = e instanceof Error ? e.message : String(e);
            throw e;
          },
        );
      };
    },
  });
}
