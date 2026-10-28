// Navigation by persona, like the clickable prototype (src/domain/catalog.ts PERSONAS: labels, order, landings), mapped
// to Workbench routes. Pure: buildNav(caps, items) is unit-tested. Features declare their nav items
// (features/*/index.ts navItems); this table decides which persona groups show them. A user holding several roles gets
// the union, one group per persona in the prototype's order; an item (by id or path) shows once, in its first group.
import { roleDef, type RoleIr } from "../schema";
import type { Caps } from "../kf/app";

export interface NavItem {
  id: string;
  path: string;
  label: string;
}
export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export interface PersonaNav {
  /** The prototype persona id (also the group's test id). */
  id: string;
  role: RoleIr;
  /** The persona's first page (the prototype's landing). */
  landing: string;
  items: string[];
}

const REVIEWER_ITEMS = ["review", "rmes", "cases"];

/** The prototype's personas in its order. The label is the role's display name (ROLES[role].name). Technical roles
 *  (Case administrator, Integration service) are not personas: Case administrator acts inside the RMM pages. */
export const PERSONA_NAV: PersonaNav[] = [
  { id: "rmm", role: "ciq_rmm", landing: "/rmm", items: ["dashboard", "my-work", "cases", "new-case", "change-requests", "suppliers", "reports"] },
  { id: "reg", role: "ciq_regulatory_reviewer", landing: "/review", items: REVIEWER_ITEMS },
  { id: "saf", role: "ciq_safety_reviewer", landing: "/review", items: REVIEWER_ITEMS },
  { id: "qm", role: "ciq_qm_reviewer", landing: "/review", items: ["review", "cases"] },
  { id: "mic", role: "ciq_microbiology_reviewer", landing: "/review", items: ["review", "cases"] },
  { id: "sus", role: "ciq_sustainability_reviewer", landing: "/review", items: ["review", "cases"] },
  { id: "cus", role: "ciq_customs", landing: "/informed", items: ["informed", "cases"] },
  { id: "leg", role: "ciq_legal", landing: "/informed", items: ["informed", "cases"] },
  { id: "approver", role: "ciq_overall_approver", landing: "/approvals", items: ["approvals", "cases", "reports"] },
  { id: "admin", role: "ciq_business_admin", landing: "/admin/rules", items: ["rules", "templates", "ownership", "reminders", "suppliers", "config"] },
  { id: "auditor", role: "ciq_reader", landing: "/audit", items: ["audit", "cases", "rules"] },
  { id: "owner", role: "ciq_business_owner", landing: "/reports", items: ["reports", "operations", "cases"] },
];

/** Items that need more than the persona. */
const ITEM_GATES: Record<string, (c: Caps) => boolean> = {
  rmes: (c) => c.rmesEditorOf.size > 0, // ground rule 7: the editing sheet only for its editor role
  "new-case": (c) => c.canInitiate("CIQ_Case_A00"),
};

export const FOOTER_ITEMS: NavItem[] = [{ id: "diagnostics", path: "/diagnostics", label: "Diagnostics" }];

/** The personas the (lensed) roles give, in the prototype's order. */
export const personasOf = (caps: Caps): PersonaNav[] => PERSONA_NAV.filter((p) => caps.roles.has(p.role));

export function buildNav(caps: Caps, registry: NavItem[]): NavGroup[] {
  const byId = new Map(registry.map((i) => [i.id, i]));
  const used = new Set<string>();
  const out: NavGroup[] = [];
  for (const p of personasOf(caps)) {
    const items: NavItem[] = [];
    for (const id of p.items) {
      const it = byId.get(id);
      if (!it || used.has(it.id) || used.has(it.path) || (ITEM_GATES[id] && !ITEM_GATES[id](caps))) continue;
      used.add(it.id).add(it.path);
      items.push(it);
    }
    if (items.length) out.push({ id: p.id, label: roleDef(p.role).name, items });
  }
  return out;
}

/** The nav entry lit for a path: the longest matching path wins, so /cases/new lights "New case", not "All cases". */
export function activeNavPath(paths: string[], pathname: string): string | undefined {
  return paths.filter((p) => pathname === p || pathname.startsWith(p + "/")).sort((a, b) => b.length - a.length)[0];
}
