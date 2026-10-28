// The run ledger (tests-2026-10-21/SPEC.md §1 "Ledger"): every item a run creates or adopts, appended the moment its
// id is known, before any further call (appendFileSync, so it is on disk first). Append-only JSONL; a later line for
// the same id records a new stage. The guards write only items of the current run's ledger; cleanup reads only it.
// Offline the ledger lives in memory (fake ids must never reach the live file).
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** kissflow-build/ciq-digital/tests-2026-10-21/ */
export const TESTS_DIR = fileURLToPath(new URL("../../../kissflow-build/ciq-digital/tests-2026-10-21/", import.meta.url));
export const LEDGER_FILE = `${TESTS_DIR}ledger.jsonl`;

export interface LedgerEntry {
  at: string;
  run: string;
  /** The Kissflow flow id (CIQ_Case_A00, CIQP_Request_A00, …). */
  flow: string;
  /** The app id (CIQ_Digital_A00 or CIQ_Supplier_Portal_A00). */
  app: string;
  id: string;
  what: string;
  stage: string;
}

export interface Ledger {
  readonly run: string;
  /** Live: the JSONL file; offline: undefined (memory). */
  readonly file?: string;
  add(e: Omit<LedgerEntry, "at" | "run">): LedgerEntry;
  /** The id is in THIS run's ledger. */
  has(id: string): boolean;
  /** Every line of a run (default this run), in order. */
  byRun(run?: string): LedgerEntry[];
  /** One entry per id (its latest stage), in the order the ids first appeared. */
  latest(run?: string): LedgerEntry[];
}

export function createLedger(o: { run: string; file?: string; now?: () => string }): Ledger {
  const now = o.now ?? (() => new Date().toISOString());
  const lines: LedgerEntry[] = [];
  if (o.file && existsSync(o.file)) {
    for (const l of readFileSync(o.file, "utf8").split("\n")) {
      if (!l.trim()) continue;
      try {
        lines.push(JSON.parse(l) as LedgerEntry);
      } catch {
        // a torn last line (a crash mid-write) is skipped; the rest still counts
      }
    }
  }
  const byRun = (run = o.run) => lines.filter((e) => e.run === run);
  return {
    run: o.run,
    file: o.file,
    add(e) {
      if (!e.id) throw new Error(`Ledger: ${e.flow} "${e.what}" has no id.`);
      const entry: LedgerEntry = { at: now(), run: o.run, ...e };
      if (o.file) {
        mkdirSync(dirname(o.file), { recursive: true });
        appendFileSync(o.file, `${JSON.stringify(entry)}\n`);
      }
      lines.push(entry);
      return entry;
    },
    has: (id) => !!id && lines.some((e) => e.run === o.run && e.id === id),
    byRun,
    latest(run = o.run) {
      // a Map keeps the first insertion's place and takes the later value
      const out = new Map<string, LedgerEntry>();
      for (const e of byRun(run)) out.set(e.id, e);
      return [...out.values()];
    },
  };
}
