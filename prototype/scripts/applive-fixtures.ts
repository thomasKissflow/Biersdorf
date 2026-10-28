// Prints the live-app harness fixtures as JSON (run with vite-node; scripts/harness-applive.mjs reads stdout).
// Fictional data only: the prototype's role holders as Kissflow users, "ZZT-" test cases and the Solvaro contacts.
//
// Items and open tasks come from src/app-live/testing/rawFixtures.ts harnessFixtures() (the createFakeClient seed shape,
// DESIGN §3.3): the ZZT cases with their reviews, open points, RMES rows, notes and audit rows, the supplier master and
// the 12 config rows of kissflow-build/config-seed/rows (read only). The Kissflow users are rawFixtures' KF_USERS, so
// the user ids in the items (Owner_RMM, Raiser_Assignee, _created_by, …) are the ones the host signs in.
// The ids, step names, Mandatory and Editable lists (src/app-live/ids.ts) travel with the fixtures, so the emulated host
// routes and refuses exactly as the tables the app itself (and kf/fakeClient.ts) is built on.
// 26 Oct: the supplier portal's CIQP Request / CIQP Query items of the fixture cases (rawFixtures portalFixtures), which
// the data console's case delete reaches through the REST admin routes in the portal's container.
// 27 Oct: the colleague directory of the @mentions (app-live/colleagues.ts): each CIQ role's members as the per-role
// REST GET answers them (here WITHOUT Email, so the account's user list fills the e-mails in), the persona's user plus a
// second QM reviewer known from no item (Ingrid Nolte) and a portal user in the RMM role (Kind ExternalUser, never
// listed); the account's users with their e-mails. Fictional.
import { LIVE_COUNTRY_CODES } from "../src/app-live/countries";
import { EDITABLE, FLOWS, LISTS, MANDATORY, OTHER_ROLES, PORTAL, ROLES, STEPS, STEP_NAMES } from "../src/app-live/ids";
import { CASE_START_FIELDS } from "../src/app-live/shared/caseStartPayload";
import { SYNCED_REQUEST_FIELDS } from "../src/app-live/shared/handoff";
import { KF_USERS, PERSONA_USER, harnessFixtures, portalFixtures } from "../src/app-live/testing/rawFixtures";
import type { FlowKey } from "../src/app-live/types";
import type { InternalPersonaId } from "../src/domain/types";
import type { RawItem } from "../src/portal/data/raw";
import { PORTAL_USERS } from "../src/portal/data/fixtures";

/** The Kissflow user behind each role key (rawFixtures KF_USERS; fictional). */
const USERS: Record<string, { _id: string; Name: string; Email: string }> = {
  ...Object.fromEntries((Object.keys(PERSONA_USER) as InternalPersonaId[]).map((p) => [p, { ...KF_USERS[PERSONA_USER[p]]! }])),
  caseAdmin: { _id: "UsCaseAdmin", Name: "Case Admin", Email: "case.admin@beiersdorf.example" },
  integration: { _id: "UsService", Name: "CIQ Integration Service", Email: "integration@beiersdorf.example" },
  developer: { _id: "UsDevAdmin", Name: "Jonas Falk", Email: "jonas.falk@beiersdorf.example" },
  none: { _id: "UsNone", Name: "No Role", Email: "norole@beiersdorf.example" },
};

/** kf.user.AppRoles entries as the host sends them ({_id, Name, Kind}). "none" is a role outside CIQ. */
const ROLE_REFS: Record<string, { _id: string; Name: string; Kind: string }> = {
  ...Object.fromEntries(Object.entries(ROLES).map(([k, r]) => [k, { _id: r.id, Name: r.name, Kind: "Role" }])),
  caseAdmin: { _id: OTHER_ROLES.caseAdmin.id, Name: OTHER_ROLES.caseAdmin.name, Kind: "Role" },
  integration: { _id: OTHER_ROLES.integration.id, Name: OTHER_ROLES.integration.name, Kind: "Role" },
  // the data console's role (26 Oct): no CIQ persona
  developer: { _id: OTHER_ROLES.developer.id, Name: OTHER_ROLES.developer.name, Kind: "Role" },
  none: { _id: "RoUser", Name: "User", Kind: "Role" },
};

/** The fields each step may update (Mandatory ∪ Editable, ids.ts; DESIGN G-9, G-10, G-11), for the host's 050313. */
const editable: Record<string, string[]> = Object.fromEntries(
  [...new Set([...Object.keys(MANDATORY), ...Object.keys(EDITABLE)])].map((a) => [a, [...new Set([...(MANDATORY[a] ?? []), ...(EDITABLE[a] ?? [])])]]),
);
// the case's waiting and release steps, and every End: nothing (all ReadOnly / Hidden)
for (const a of [STEPS.case.waiting, STEPS.case.release, STEPS.case.end, STEPS.review.end, STEPS.op.end]) editable[a] = [];

/** A QM colleague no fixture item names: only the role members list her (fictional). */
const INGRID = { _id: "UsQmIngrid", Name: "Ingrid Nolte", Email: "ingrid.nolte@beiersdorf.example" };
const person = (u: { _id: string; Name: string }, Kind = "User") => ({ _id: u._id, Name: u.Name, Kind });
const DIRECTORY = {
  members: Object.fromEntries(
    (Object.keys(ROLES) as (keyof typeof ROLES)[]).map((k) => [
      k,
      [person(USERS[k]!), ...(k === "qm" ? [person(INGRID)] : []), ...(k === "rmm" ? [person(PORTAL_USERS.elena, "ExternalUser")] : [])],
    ]),
  ),
  users: [...(Object.keys(ROLES) as (keyof typeof ROLES)[]).map((k) => ({ ...person(USERS[k]!), Email: USERS[k]!.Email })), { ...person(INGRID), Email: INGRID.Email }, { ...person(PORTAL_USERS.elena, "ExternalUser"), Email: PORTAL_USERS.elena.Email }],
  ingrid: INGRID,
};

const set = harnessFixtures();
const byFlow: Record<string, RawItem[]> = {};
for (const [k, rows] of Object.entries(set.items) as [FlowKey, RawItem[] | undefined][]) if (rows?.length) byFlow[FLOWS[k].id] = rows;
// [itemId, activityInstanceId, activityId]: the open tasks the host starts with
const tasks = set.tasks.map((t) => [t.itemId, t.act, t.activityId]);

process.stdout.write(
  JSON.stringify({
    source: "rawFixtures.harnessFixtures",
    byFlow,
    tasks,
    users: USERS,
    contacts: PORTAL_USERS,
    roles: ROLE_REFS,
    flows: FLOWS,
    steps: STEPS,
    stepNames: STEP_NAMES,
    mandatory: MANDATORY,
    editable,
    // the 15 supplier-data fields I-2 / request.changed copy onto the case (a scenario plays them), and the six Start
    // fields caseStartPayload computes (rmm-new-case checks them)
    synced: SYNCED_REQUEST_FIELDS,
    caseStartFields: Object.values(CASE_START_FIELDS),
    // 26 Oct: Supplier_Country_Code's list (the host answers its items and stores another value EMPTY, as live)
    countryList: { id: LISTS.country, codes: LIVE_COUNTRY_CODES },
    // 26 Oct: the portal's items the console's case delete reaches (by flow key: request, query)
    portal: { appId: PORTAL.appId, flows: PORTAL.flows, items: portalFixtures() },
    // 27 Oct: the CIQ roles' members and the account's users (the @mention colleagues; the host answers them with colleagues=1)
    directory: DIRECTORY,
  }),
);
