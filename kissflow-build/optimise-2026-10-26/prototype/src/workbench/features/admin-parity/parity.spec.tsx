// Admin parity pages over live CIQ_Config_Version_A00 rows: version picking (live release first), the Rule set reader,
// the ownership matrix, read-only for roles without E, "Create the first version" only for the Business administrator,
// and no write to a Published row. Fictional data only.
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WorkbenchData } from "../../data/hooks";
import { toConfigVM } from "../../data/map";
import type { ConfigVM, RawItem } from "../../data/viewModels";
import { fakeClient } from "../../testkit/fakeClient";
import { templatePreview } from "../admin/config";
import { configFixture } from "../case/t1.fixtures";
import { KindSection, OwnershipView, RuleListView } from "./AdminParity";
import { changedRuleIds, defaultVersion, deptTotals, groupRules, liveConfigKeys, openDraftOf, ownershipRows, parseRuleSet, previousVersion, roleIn, ruleMatches, versionStateOf, versionsOf } from "./model";

const cfg = (id: string, f: Record<string, unknown>): ConfigVM => toConfigVM({ _id: id, ...f } as RawItem);
const RULES = {
  rules: [
    { id: "R-01", question: "SF02", condition: "Plant origin", activates: ["K6.14"], outcome: "Mandatory", evidence: ["Origin certificate"], departments: ["REG", "SUS"], basis: "document" },
    { id: "R-02", question: "", condition: "Always", activates: ["BASIC"], outcome: "Mandatory", departments: ["RMM"], basis: "our-assumption" },
    { id: "R-03", question: "SF10", condition: "Nano form", activates: [], outcome: "Optional", evidence: "Particle size report", departments: ["SAF"], basis: "document" },
  ],
};
function ruleRows(): ConfigVM[] {
  const f = configFixture({ ruleSet: true }); // FmRule "rule-set-default-v3" is in the live release
  return [
    ...f.rows.map((r) => (r._id === "FmRule" ? { ...r, payloadJson: JSON.stringify({ rules: RULES.rules.slice(0, 2) }) } : r)),
    cfg("FmRule4", { Config_Key: "rule-set-default-v4", Config_Kind: "Rule set", Config_State: "Published", Version_Label: "4.0", Published_At: "2026-10-06T08:00:00Z", Payload_JSON: JSON.stringify(RULES) }),
    cfg("FmRule5", { Config_Key: "rule-set-default-v5", Config_Kind: "Rule set", Config_State: "Draft", Version_Label: "v5", Payload_JSON: JSON.stringify(RULES) }),
  ];
}

describe("versions of a kind", () => {
  it("newest first; the version in the live release shows first; one open draft", () => {
    const rows = ruleRows();
    const v = versionsOf(rows, "Rule set");
    expect(v.map((r) => r._id)).toEqual(["FmRule5", "FmRule4", "FmRule"]);
    const live = liveConfigKeys(rows);
    expect(defaultVersion(v, live)?._id).toBe("FmRule");
    expect(v.map((r) => versionStateOf(r, live))).toEqual(["draft", "published", "live"]);
    expect(openDraftOf(v)?._id).toBe("FmRule5");
    expect(previousVersion(v, v[0])?._id).toBe("FmRule4");
    expect(previousVersion(v, v[2])).toBeUndefined();
  });

  it("without a live release: the newest Published, else the newest row", () => {
    const rows = [cfg("A", { Config_Key: "settings-main-v1", Config_Kind: "Settings", Config_State: "Published" }), cfg("B", { Config_Key: "settings-main-v2", Config_Kind: "Settings", Config_State: "Draft" })];
    expect(defaultVersion(versionsOf(rows, "Settings"), liveConfigKeys(rows))?._id).toBe("A");
    expect(defaultVersion(versionsOf(rows.slice(1), "Settings"), new Set())?._id).toBe("B");
  });
});

describe("rule set reader", () => {
  it("reads { rules } (or a bare array), groups by question with 'no question' first, searches and marks new/changed rules", () => {
    const p = parseRuleSet(JSON.stringify(RULES));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.rules[2].evidence).toEqual(["Particle size report"]);
    expect(groupRules(p.rules).map((g) => g.question)).toEqual(["", "SF02", "SF10"]);
    expect(p.rules.filter((r) => ruleMatches(r, "k6.14")).map((r) => r.id)).toEqual(["R-01"]);
    expect(parseRuleSet(JSON.stringify(RULES.rules)).ok).toBe(true);
    const prev = parseRuleSet(JSON.stringify({ rules: [{ ...RULES.rules[0], condition: "Plant" }, RULES.rules[1]] }));
    expect(prev.ok && [...changedRuleIds(prev.rules, p.rules)]).toEqual([
      ["R-01", "changed"],
      ["R-03", "new"],
    ]);
    expect(changedRuleIds(null, p.rules).size).toBe(0);
  });

  it("refuses what is not a rule list, in plain words", () => {
    expect(parseRuleSet("{")).toEqual({ ok: false, error: "This version's content is not valid JSON." });
    expect(parseRuleSet("{}")).toEqual({ ok: false, error: "This version has no list of rules." });
  });
});

describe("ownership matrix", () => {
  it("follows the published template order, marks changes against the previous version, and totals per department", () => {
    const rows = configFixture().rows;
    const own = rows.find((r) => r.kind === "Section ownership")!;
    const next = JSON.parse(own.payloadJson);
    next.owners["GEN"] = { lead: "REG", co: ["QM"], queryOwner: "REG" };
    next.owners["K7"] = { lead: "CUS", co: [], queryOwner: "RMM" };
    const m = ownershipRows(JSON.stringify(next), templatePreview(rows), own.payloadJson);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.rows.map((r) => r.code)).toEqual(["K1", "K2", "K2.1", "S-A", "R-B", "SU1", "K7"]);
    expect(m.rows.filter((r) => r.changed).map((r) => r.sectionKey)).toEqual(["GEN", "K7"]);
    expect(roleIn(m.rows[1], "REG")).toBe("lead");
    expect(roleIn(m.rows[1], "QM")).toBe("co");
    expect(roleIn(m.rows[1], "SAF")).toBe("none");
    const t = deptTotals(m.rows);
    expect(t.CUS).toEqual({ lead: 1, co: 0 });
    expect(t.REG).toEqual({ lead: 3, co: 0 });
    expect(ownershipRows("{}", null)).toMatchObject({ ok: false });
  });
});

function render(node: ReactNode, roleName = "CIQ Business Admin"): { html: string; calls: string[] } {
  const client = fakeClient();
  client.kf.user.AppRoles = [{ _id: "RoX", Name: roleName }];
  const html = renderToString(
    <WorkbenchData kf={client.kf} readyMs={0} client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </WorkbenchData>,
  );
  return { html, calls: client.calls.map((c) => c.op) };
}

describe("parity pages render", () => {
  it("Rule table for the Business administrator: versions, the open draft to continue, the live version's rules; nothing written", () => {
    const rows = ruleRows();
    const { html, calls } = render(<KindSection kind="Rule set" all={rows} canEdit render={(row, v) => <RuleListView row={row} prev={previousVersion(v, row)} />} />);
    expect(html).toContain('data-testid="wb-parity-rule-set"');
    expect(html).toContain("In the live release");
    expect(html).toContain('data-testid="wb-parity-open-draft"');
    expect(html).not.toContain('data-testid="wb-parity-new-version"');
    expect(html).toContain('data-testid="wb-rules-list"');
    expect(calls.filter((c) => /create|update|submit/i.test(c))).toEqual([]);
  });

  it("read-only (the Auditor): no new-version, draft or first-version control", () => {
    const rows = ruleRows().filter((r) => r._id !== "FmRule5");
    const { html } = render(<KindSection kind="Rule set" all={rows} canEdit={false} render={(row) => <RuleListView row={row} />} />, "CIQ Reader");
    expect(html).toContain('data-testid="wb-parity-open-config"');
    expect(html).not.toMatch(/wb-parity-(new-version|open-draft|first-)/);
    const empty = render(<KindSection kind="Rule set" all={[]} canEdit={false} render={() => null} />, "CIQ Reader").html;
    expect(empty).toContain("A Business administrator creates the first version.");
    expect(empty).not.toContain("wb-parity-first-rule-set");
  });

  it("an empty kind offers 'Create the first version' to the Business administrator, and a published version offers a new draft", () => {
    const { html } = render(<KindSection kind="Section ownership" all={[]} canEdit render={() => null} />);
    expect(html).toContain('data-testid="wb-parity-first-section-ownership"');
    expect(html).toContain("Create the first version");
    const rows = configFixture().rows;
    const own = render(<KindSection kind="Section ownership" all={rows} canEdit render={(row, v) => <OwnershipView row={row} prev={previousVersion(v, row)} all={rows} />} />).html;
    expect(own).toContain('data-testid="wb-parity-new-version"');
    expect(own).toContain('data-testid="wb-ownership-matrix"');
    expect(own).toContain("First version");
  });
});
