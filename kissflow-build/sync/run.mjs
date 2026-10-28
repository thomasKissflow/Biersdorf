#!/usr/bin/env node
// CIQ Sync Service runner (plan v5 §8).
//
//   node kissflow-build/sync/run.mjs --once  --dry-run [--case CIQ-2026-0001]   one pass, reads only, intended writes listed
//   node kissflow-build/sync/run.mjs --loop  --dry-run [--interval 60]           a pass every minute (reminders hourly)
//   node kissflow-build/sync/run.mjs --replay CIQ-2026-0001 --dry-run            re-run every idempotent effect of one case
//   node kissflow-build/sync/run.mjs --list-failed --dry-run                     Service Requests in status Failed
//   node kissflow-build/sync/run.mjs --dead-letters --dry-run                    outbox rows given up after 3 attempts
//   node kissflow-build/sync/run.mjs --verify-ids                                verifyIds only (GETs)
//   node kissflow-build/sync/run.mjs --seed                                      write the seed rows to seed-out/ (no Kissflow call)
//   node kissflow-build/sync/run.mjs --s8                                        spike S-8 sizes (no Kissflow call)
//
// Without --dry-run the runner refuses to start unless CIQ_SYNC_LIVE=1 is set (night of 14 Oct: dry-run only).
// The key is read only by kissflow-build/lib/kf.mjs from .env (dev) or the host's environment/secret store; this
// runner never prints, logs or stores it.

process.env.TZ ||= "Europe/Berlin";

import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);

async function main() {
  if (flag("--seed")) {
    const { seedRows } = await import("./config.mjs");
    const out = resolve(here, "seed-out");
    mkdirSync(out, { recursive: true });
    for (const [file, rows] of Object.entries(seedRows())) {
      writeFileSync(resolve(out, file), JSON.stringify({ form: "CIQ_Config_Version_A00", note: "Seed rows (plan v5 §11.2). NOT written to Kissflow by the service; import on Thomas's go.", rows }, null, 2) + "\n");
      console.log(`seed-out/${file}: ${rows.length} row(s)`);
    }
    return 0;
  }
  if (flag("--s8")) {
    const { measureS8 } = await import("./config.mjs");
    const r = measureS8();
    for (const x of r.rows) console.log(`${x.row.padEnd(22)} ${x.field.padEnd(42)} ${String(x.bytes).padStart(7)} B  ${x.kb} KB`);
    for (const a of r.answers) console.log(`${a.what}: ${JSON.stringify(Object.fromEntries(Object.entries(a).filter(([k]) => k !== "what")))}`);
    for (const v of r.verdict) console.log(`verdict: ${v}`);
    return 0;
  }

  // --verify-ids only reads, so it always runs with the read-only client.
  const dryRun = flag("--dry-run") || flag("--verify-ids");
  if (!dryRun && process.env.CIQ_SYNC_LIVE !== "1") {
    console.error("Refused: live mode needs CIQ_SYNC_LIVE=1 (tonight the service runs with --dry-run only).");
    return 2;
  }
  const { client, loadEnv } = await import("../lib/kf.mjs");
  const { createPort, liveFileTransport } = await import("./kissflow.mjs");
  const { verifyIds, verifySummary } = await import("./ids.mjs");
  const { createService, fileState, heartbeatLine } = await import("./service.mjs");
  const stateDir = resolve(here, ".state");
  mkdirSync(stateDir, { recursive: true });
  const logFile = resolve(stateDir, dryRun ? "dry-run-log.jsonl" : "run-log.jsonl");
  const log = (e) => appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...e }) + "\n");

  // kf.mjs loads the key itself; in dry-run its client refuses every non-GET, and no file transport exists at all.
  const kf = client({ readOnly: dryRun });
  const port = createPort({ kf, dryRun, files: dryRun ? null : liveFileTransport(loadEnv()), serviceUserId: process.env.CIQ_SERVICE_USER_ID || null, log, minIntervalMs: Number(opt("--pace-ms", 1000)) });
  const linkBase = { internal: `https://${kf.domain}/view/application/CIQ_Digital_A00/ui#`, supplier: `https://${kf.domain}/view/portal/CIQ_Supplier_Portal_A00` };
  const service = createService({ port, log, linkBase, state: fileState(resolve(stateDir, dryRun ? "dry-run-state.json" : "state.json")) });

  if (flag("--verify-ids") || flag("--once") || flag("--loop")) {
    const ids = await verifyIds(port.paced);
    console.log(verifySummary(ids));
    writeFileSync(resolve(stateDir, "verify-ids.json"), JSON.stringify(ids, null, 2) + "\n");
    if (ids.aborted) {
      console.log("Stopped: Kissflow answered 429 / a challenge page. No further call was made.");
      return 3;
    }
    if (flag("--verify-ids")) return 0;
  }
  if (flag("--replay")) {
    const rep = await service.replay(opt("--replay"));
    console.log(JSON.stringify(rep));
  } else if (flag("--list-failed")) {
    console.log(JSON.stringify(await service.listFailed(), null, 2));
  } else if (flag("--dead-letters")) {
    console.log(JSON.stringify(await service.deadLetters(), null, 2));
  } else if (flag("--once")) {
    const hb = await service.runOnce({ caseCode: opt("--case") });
    report(hb, port, heartbeatLine);
  } else if (flag("--loop")) {
    const every = Number(opt("--interval", 60)) * 1000;
    let stop = false;
    process.on("SIGINT", () => (stop = true));
    process.on("SIGTERM", () => (stop = true));
    while (!stop) {
      const hb = await service.runOnce({ caseCode: opt("--case") });
      report(hb, port, heartbeatLine);
      // after a 429 the port's own back-off governs; the loop simply waits for its next tick
      for (let waited = 0; waited < every && !stop; waited += 1000) await new Promise((r) => setTimeout(r, 1000));
    }
    console.log("[ciq-sync] stopped.");
  } else {
    console.log("Nothing to do. Use --once, --loop, --replay, --list-failed, --dead-letters, --verify-ids, --seed or --s8.");
  }
  return 0;
}

function report(hb, port, heartbeatLine) {
  console.log(heartbeatLine(hb));
  if (port.dryRun) {
    const counts = port.intended.reduce((m, w) => ((m[w.op] = (m[w.op] ?? 0) + 1), m), {});
    console.log(`[ciq-sync] dry-run: ${port.intended.length} intended write(s) ${JSON.stringify(counts)}; nothing was sent.`);
    for (const n of port.notes) console.log(`[ciq-sync] note: ${n}`);
  }
}

main().then(
  (code) => process.exit(code ?? 0),
  (e) => {
    console.error(`[ciq-sync] error: ${e.message}`);
    process.exit(1);
  },
);
