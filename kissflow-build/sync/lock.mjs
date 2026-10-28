// One Kissflow caller at a time (Kissflow-internal). The live-e2e driver (every mode) and the sync runner (every mode
// that calls Kissflow) take the same exclusive lock file, .state/kissflow.lock, before their first call. Pacing and the
// 429 back-off live in each process (createPort `pace`), so two processes at once would double the call rate on the
// dev account and could overwrite each other's ledger; the lock refuses the second one before it calls anything.
//
// The file is created with O_EXCL ("wx") and holds { pid, label, at } (no secret, no e-mail). It is removed when the
// process exits. A lock whose pid no longer runs (a crash, a kill -9) is taken over; a live one refuses.

import { openSync, writeSync, closeSync, readFileSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class LockedError extends Error {
  constructor(path, holder) {
    super(`another Kissflow caller is running: ${holder?.label ?? "unknown"} (pid ${holder?.pid ?? "?"}, since ${holder?.at ?? "?"}); lock ${path}. Wait for it to end (or, if no such process runs any more, delete the lock file).`);
    this.locked = true;
    this.holder = holder;
  }
}

const defaultAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM"; // exists, but owned by someone else
  }
};

/**
 * Takes the lock or throws LockedError. Returns { release() }; release() removes the file only while it is still ours.
 * @param {string} path
 * @param {object} o
 * @param {string} o.label            what holds it (printed to the second caller), e.g. "live-e2e --all ZZT-E2E-0001"
 * @param {number} [o.pid]            tests
 * @param {(pid: number) => boolean} [o.isAlive]  tests
 * @param {boolean} [o.onExit]        remove the file on process exit (default true)
 */
export function acquireLock(path, { label, pid = process.pid, isAlive = defaultAlive, onExit = true } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const mine = JSON.stringify({ pid, label, at: new Date().toISOString() });
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const fd = openSync(path, "wx");
      writeSync(fd, mine + "\n");
      closeSync(fd);
      const release = () => {
        try {
          if (JSON.parse(readFileSync(path, "utf8")).pid === pid) unlinkSync(path);
        } catch {
          /* gone already */
        }
      };
      if (onExit) process.once("exit", release);
      return { path, release };
    } catch (e) {
      if (e?.code !== "EEXIST") throw e;
      let holder = null;
      try {
        holder = JSON.parse(readFileSync(path, "utf8"));
      } catch {
        holder = null; // unreadable or half-written: treat as held (never steal a lock we cannot read)
      }
      if (attempt === 1 && holder && Number.isInteger(holder.pid) && holder.pid !== pid && !isAlive(holder.pid)) {
        try {
          unlinkSync(path); // stale: its process is gone
        } catch {
          /* raced: retry the create */
        }
        continue;
      }
      throw new LockedError(path, holder ?? { label: "unreadable lock file" });
    }
  }
  throw new LockedError(path, null);
}
