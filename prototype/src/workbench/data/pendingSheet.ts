// K-WB pending values (WORKBENCH-DESIGN.md §7.4): what the user must enter in the Kissflow task form when the
// Workbench may not save at a step. Kept in sessionStorage under `wb:pending:<_id>|<act>` (try/catch), because
// openForm may navigate away or unload the frame; without storage the sheet lives in memory only. Removed after a
// passing Re-read or a confirmed submit.
import { CLEAR, isClear } from "./normalize";
import type { Patch } from "./viewModels";

export interface PendingSheet {
  fields: Patch["fields"];
  tables?: Patch["tables"];
  stepName: string;
  savedAt: string;
  /** Extra instruction shown on the panel (e.g. the Return text, §7.5). */
  note?: string;
  /** "values+sendback": Re-read passes only once the task has left the user's queue (sent back in Kissflow, §7.5). */
  mode?: "values" | "values+sendback";
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  key?(i: number): string | null;
  readonly length?: number;
}

export const PENDING_PREFIX = "wb:pending:";
const CLEAR_MARK = { $wbClear: true };

const encode = (s: PendingSheet): string => JSON.stringify(s, (_k, v) => (isClear(v) ? CLEAR_MARK : v));
const decode = (text: string): PendingSheet | null => {
  try {
    const o = JSON.parse(text, (_k, v) => (v && typeof v === "object" && (v as { $wbClear?: unknown }).$wbClear === true ? CLEAR : v)) as PendingSheet;
    return o && typeof o === "object" && o.fields && typeof o.fields === "object" ? o : null;
  } catch {
    return null;
  }
};

export interface PendingStore {
  save(taskKey: string, sheet: PendingSheet): void;
  load(taskKey: string): PendingSheet | null;
  remove(taskKey: string): void;
  /** Task keys with a stored sheet (Diagnostics; reopening the fallback after a reload). */
  keys(): string[];
  /** True when the sheet survives a reload (sessionStorage usable). */
  readonly persistent: boolean;
}

function defaultStorage(): StorageLike | null {
  try {
    const s = globalThis.sessionStorage;
    if (!s) return null;
    const probe = "wb:probe";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function createPendingStore(storage: StorageLike | null | undefined = defaultStorage()): PendingStore {
  const memory = new Map<string, PendingSheet>();
  let store = storage ?? null;
  const k = (taskKey: string) => PENDING_PREFIX + taskKey;
  return {
    get persistent() {
      return !!store;
    },
    save(taskKey, sheet) {
      memory.set(taskKey, sheet);
      if (!store) return;
      try {
        store.setItem(k(taskKey), encode(sheet));
      } catch {
        store = null; // quota or blocked: memory only from now on
      }
    },
    load(taskKey) {
      if (store) {
        try {
          const t = store.getItem(k(taskKey));
          if (t) {
            const s = decode(t);
            if (s) return s;
          }
        } catch {
          /* fall back to memory */
        }
      }
      return memory.get(taskKey) ?? null;
    },
    remove(taskKey) {
      memory.delete(taskKey);
      try {
        store?.removeItem(k(taskKey));
      } catch {
        /* ignore */
      }
    },
    keys() {
      const out = new Set(memory.keys());
      try {
        if (store && typeof store.length === "number" && store.key)
          for (let i = 0; i < store.length; i++) {
            const key = store.key(i);
            if (key?.startsWith(PENDING_PREFIX)) out.add(key.slice(PENDING_PREFIX.length));
          }
      } catch {
        /* ignore */
      }
      return [...out];
    },
  };
}
