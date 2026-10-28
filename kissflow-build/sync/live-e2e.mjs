#!/usr/bin/env node
// ⚠️ WORK IN PROGRESS (paused 15 Oct ~11:45 IST at Thomas's request). The build/review workflow was stopped before
// its review and fix finished; 2 of its 8 offline tests failed (test/live-e2e-driver.test.mjs.wip). DO NOT RUN until it is
// finished and reviewed. The guard below refuses every run.
if (process.env.CIQ_E2E_WIP_ACK !== "finished-and-reviewed") {
  console.error("live-e2e.mjs is unfinished work in progress (paused 15 Oct). Not runnable until it is finished and reviewed.");
  process.exit(9);
}
// Live end-to-end driver (Kissflow-internal; dev sandbox only): walks ONE throwaway case ZZT-E2E-#### through the whole
// CIQ against LIVE Kissflow, playing every human with the API key and running the REAL sync service between the steps,
// then cleans up everything the case created. The scenario itself is live-e2e-scenario.mjs (the same steps run offline
// on the in-memory fake: test/live-e2e-driver.test.mjs).
//
// USAGE (from the project root; every mode needs CIQ_SYNC_LIVE=1, else it refuses before any Kissflow call):
//
//   CIQ_SYNC_LIVE=1 node kissflow-build/sync/live-e2e.mjs --step 0      [--case ZZT-E2E-0001]   preflight (reads only)
//   CIQ_SYNC_LIVE=1 node kissflow-build/sync/live-e2e.mjs --step N      [--case …]   one step (N = 1…7; earlier steps must have passed)
//   CIQ_SYNC_LIVE=1 node kissflow-build/sync/live-e2e.mjs --all         [--case …]   steps 0…7 in order, stops at the first failed check
//   CIQ_SYNC_LIVE=1 node kissflow-build/sync/live-e2e.mjs --status      [--case …]   what exists for the case (reads only)
//   CIQ_SYNC_LIVE=1 node kissflow-build/sync/live-e2e.mjs --cleanup     [--case …]   delete everything the case created (= --step 9)
//   options: --pace-ms N (≥ 1000; default 1000), --quiet-ms N (wait before each service pass; ≥ 2500, default 3500),
//            --force (with --step N: run it although an earlier step did not pass; the preflight must have passed)
//
// STEPS
//   0 preflight: verifyIds 17/17; Release row RS-2026.1 + v1 Published; the dev user (role GET) in every role the walk
//     needs; dev supplier ZZT-SUP-DEV with the dev user as its single contact; the mail integration's state is noted
//     (not readable); nothing with the case code exists yet.
//   1 RMM creates the case at Start + case.created → service → portal request, bundle, Case Data, C-01, audit.
//   2 supplier fills in (metadata, answers, K2.1, "Cannot provide" justifications; one OPTIONAL upload attempt) → service
//     → mirror in Case Data, no mail.
//   3 completeness → service → reviews per lead department + RMM, RMES rows, case step, C-02/C-03, scope run.
//   4 Safety raises → query round 1 → answer → returned → round 2 → answer → Safety accepts → C-04…C-07.
//   5 RMES results (SAF/REG) + rmes.saved; every review's own step + submit + review.completed → final release, C-11.
//   6 supplier releases → final document + seal, final PDF attached and downloaded (%PDF), case completed, C-13/C-14.
//   7 supplier reports a change → change report row, C-17.
//   9 --cleanup: the driver's ledger AND Case_Code (only rows/items whose Case_Code IS the run's code), both containers.
//
// PROVEN LIVE FACTS IT RELIES ON (plan v5 §1.2, NIGHT-2026-10-14.md): the key acts as the dev user UsEJUfjYLM8Y, member
// of every app role and the only portal Supplier user; the key cannot write after Start through the assignee route
// (050313), so every human "save" is the admin PUT (what the portal UI's SDK updateItem / the Workbench writes) and every
// human step is then submitted with the key, instance id from the admin GET (S-5); Forms are draft + submit, one at a
// time; Form list rows carry no system fields (P16); no milliseconds in DateTimes (P17); attach/download S-2.
//
// SAFETY
//   - Pacing ≥ 1 s between ALL calls (the driver's and the service's port share one pacing/back-off state). The first
//     429 (Kissflow JSON or the Cloudflare HTML challenge) stops the run at once: exit 3, no retry, nothing more sent.
//   - Writes only items of the run's case; the service runs with caseOnly (no notes, retries or reminders of other cases).
//   - The ledger .state/live-e2e-<case>.json is written after every create, before the next call (ids and keys only).
//     A re-run of a step skips the human acts already done and re-checks.
//   - The key is read only by kissflow-build/lib/kf.mjs (from .env) and by the S-2 transport in-process; nothing here
//     prints, logs or stores it. The dev user's e-mail is read from the role GET at run time and masked in every line.
//
// EXIT CODES: 0 all PASS · 1 a check failed · 2 refused (guards) · 3 stopped on a 429 / challenge.

process.env.TZ ||= "Europe/Berlin";

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CASE_RE, DEFAULT_CASE, createEnv, fileLedger, runStep, runAll, cleanup, status, isStop } from "./live-e2e-scenario.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const DEV_USER = "UsEJUfjYLM8Y"; // the dev user (Thomas): every app role, the only portal user, the key's user (dev sandbox)
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);

async function main() {
  const caseCode = opt("--case", DEFAULT_CASE);
  const mode = flag("--cleanup") || opt("--step") === "9" ? "cleanup" : flag("--status") ? "status" : flag("--all") ? "all" : opt("--step") !== undefined ? "step" : null;
  if (!mode) {
    console.log("Usage: CIQ_SYNC_LIVE=1 node kissflow-build/sync/live-e2e.mjs --step N | --all | --status | --cleanup [--case ZZT-E2E-0001]");
    return 2;
  }
  if (!CASE_RE.test(caseCode)) {
    console.error(`Refused: the case code ${caseCode} does not match ${CASE_RE}. Nothing was sent.`);
    return 2;
  }
  if (process.env.CIQ_SYNC_LIVE !== "1") {
    console.error("Refused: the live end-to-end driver writes to the dev sandbox only with CIQ_SYNC_LIVE=1. Nothing was sent.");
    return 2;
  }
  const n = mode === "step" ? Number(opt("--step")) : null;
  if (mode === "step" && !(Number.isInteger(n) && n >= 0 && n <= 7)) {
    console.error("Refused: --step takes 0…7 (or 9 = --cleanup).");
    return 2;
  }
  const { client, loadEnv } = await import("../lib/kf.mjs");
  const { liveFileTransport } = await import("./kissflow.mjs");
  const { fileState } = await import("./service.mjs");
  const stateDir = resolve(here, ".state");
  mkdirSync(stateDir, { recursive: true });
  const logFile = resolve(stateDir, `live-e2e-${caseCode}-run-log.jsonl`);
  const kf = client({ readOnly: false });
  const quietMs = Math.max(2500, Number(opt("--quiet-ms", 3500)));
  const env = createEnv({
    kf,
    files: liveFileTransport(loadEnv()),
    caseCode,
    devUserId: DEV_USER,
    ledger: fileLedger(resolve(stateDir, `live-e2e-${caseCode}.json`), caseCode, "live"),
    serviceState: fileState(resolve(stateDir, `live-e2e-${caseCode}-service-state.json`)),
    serviceUserId: process.env.CIQ_SERVICE_USER_ID || null,
    liveAllowed: true,
    label: "live",
    minIntervalMs: Math.max(1000, Number(opt("--pace-ms", 1000))),
    quiet: () => new Promise((r) => setTimeout(r, quietMs)),
    linkBase: { internal: `https://${kf.domain}/view/application/CIQ_Digital_A00/ui#`, supplier: `https://${kf.domain}/view/portal/CIQ_Supplier_Portal_A00` },
    log: (e) => appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...e }) + "\n"),
  });
  try {
    if (mode === "status") {
      await status(env);
      return 0;
    }
    if (mode === "cleanup") {
      const r = await cleanup(env);
      return r.result === "PASS" ? 0 : 1;
    }
    const results = mode === "all" ? await runAll(env) : [await runStep(env, n, { force: flag("--force") })];
    const last = results.at(-1);
    console.log(`\n${results.map((r) => `step ${r.n}: ${r.result}${r.skipped ? " (skipped)" : ""}`).join(" · ")}`);
    if (mode === "all" && last?.result === "PASS" && last.n === 7) console.log(`All steps passed. Clean up with: CIQ_SYNC_LIVE=1 node kissflow-build/sync/live-e2e.mjs --cleanup --case ${caseCode}`);
    return { PASS: 0, FAIL: 1, REFUSED: 2, STOPPED: 3 }[last?.result] ?? 1;
  } catch (e) {
    if (isStop(e)) {
      console.error(`STOPPED: Kissflow answered 429 / a challenge page (${env.mask(e.message)}). No further call was made.`);
      return 3;
    }
    if (e?.refused) {
      console.error(`Refused: ${env.mask(e.message)}`);
      return 2;
    }
    console.error(`Error: ${env.mask(e.message)}`);
    return 1;
  }
}

main().then(
  (code) => process.exit(code ?? 0),
  (e) => {
    console.error(`[live-e2e] error: ${String(e?.message ?? e).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "‹e-mail›")}`);
    process.exit(1);
  },
);
