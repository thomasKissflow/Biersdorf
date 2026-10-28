// Prints the v5 portal test fixtures as JSON for the headless harness (run with vite-node). Fictional data only:
// the demo's Solvaro contacts on "ZZT-" test cases (src/portal/data/fixtures.ts).
import { FLOWS } from "../src/portal/kf/portal";
import { PORTAL_USERS, fixtureSet } from "../src/portal/data/fixtures";

const fx = fixtureSet();
const byFlow: Record<string, unknown[]> = {};
for (const { flow, item } of fx.items) (byFlow[FLOWS[flow].id] ??= []).push(item);
const help = [
  { _id: "PkHelp1", Article_Title: "How do I fill in the CIQ?", Article_Body: "Open the request from My requests. Answer the metadata questions first: they decide which sections you fill in.", Sort_Order: 10 },
  { _id: "PkHelp2", Article_Title: "Who can confirm completeness?", Article_Body: "Every contact named on the request can fill it in; only the contacts Beiersdorf marked may confirm and release.", Sort_Order: 20 },
];
process.stdout.write(JSON.stringify({ byFlow, tasks: fx.tasks, help, helpFlow: FLOWS.helpArticle.id, users: PORTAL_USERS }));
