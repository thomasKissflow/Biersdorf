// The stage cases left in dev for Thomas (MORNING-2026-10-22.md §5): from results.json only, no Kissflow call.
import { readFileSync } from "node:fs";
const r = JSON.parse(readFileSync(new URL("./results.json", import.meta.url)));
const STAGE = {
  NG1: ["ZZT-NT2-STAGE1-STARTED", "Started: the request is at the supplier's fill-in, nothing answered yet", "Case 'Supplier filling in the CIQ'; portal: a new request in My requests"],
  NG2: ["ZZT-NT2-STAGE2-FILLED", "Filled in: four saved revisions, one upload kept and one removed, no completeness yet", "Case shows the supplier's answers and documents; portal: the request with answers, still to confirm"],
  NG3: ["ZZT-NT2-STAGE3-IN-REVIEW", "Completeness confirmed: the case is in review", "Case phase 'Review' (reviews start on your first RMM load); portal: 'Beiersdorf is reviewing'"],
  NG4: ["ZZT-NT2-STAGE4-RELEASE-ASKED", "In review, a Rev 5 save, one SAF open point (two rounds, an edit, closed), then the final release requested", "Portal: 'Final release needed' with 'Give the final release'; case 'Awaiting final release'"],
  NG5: ["ZZT-NT2-STAGE5-REOPENED", "As stage 4 with a SUS point, then a review reopened (release request withdrawn) and the release requested again", "Portal: 'Final release needed' again, round 2; the request history shows the reopen"],
  NG6: ["ZZT-NT2-STAGE6-RELEASED", "As stage 4 with a QM point, then the supplier gave the final release: the case is completed", "Case 'Completed' with the releaser's name, e-mail, role and time; no PDF yet (the PDF rehearsal case)"],
  N3: ["ZZT-NT2-N3", "The full journey (REG + QM points, reopen round, 30 KB answers) to completed, a change report, then 6 reviews, audit rows and a supplier", "Completed case with its final PDF from the curl run"],
};
const rows = [];
for (const [p, [code, what, see]] of Object.entries(STAGE)) {
  const sc = Object.entries(r.scenarios).filter(([k]) => k.split(".")[0] === p);
  if (!sc.length) { rows.push(`| ${code} | not run yet | | | ${what} | |`); continue; }
  const out = r.scenarios[`${p}.1`]?.out || {};
  const checks = sc.flatMap(([, s]) => s.checks || []), ok = checks.filter((c) => c.pass).length;
  const done = sc.every(([, s]) => s.done);
  rows.push(`| ${code} | \`${out.caseId ?? "?"}\` | \`${out.reqId ?? "?"}\` | ${ok}/${checks.length}${done ? "" : " (running)"} | ${what} | ${see} |`);
}
console.log("| Case code | Case item | Portal request | Checks | Stage | What you should see |\n|---|---|---|---|---|---|\n" + rows.join("\n"));
