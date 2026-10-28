// The built-in rules as data behave exactly like the earlier rule functions (spec §8.1, §8.4). The oracle below is the
// earlier code, copied verbatim from rules.ts before the conversion (Rule.when functions, RULE_SETS, deriveScope and
// sectionsInTemplate), and is compared with the data rules over a broad matrix of metadata answers.
// 28 Oct (matrix v0.6): R-80 and the questions SF-02 and SF-08 were dropped from the built-in data, and from the oracle.
import { describe, expect, it } from "vitest";
import { BUILTIN_SECTIONS } from "./catalog";
import { RS1, RS2 } from "./builtinRules";
import { deriveScope, requiredEvidence, ruleSet, ruleSetsOf, sectionsInTemplate } from "./rules";
import { buildSeed } from "./seed";
import type { Applicability, ConfigAnswers, Market, OriginType } from "./types";

// ------------------------------------------------------------------ the earlier code (oracle), verbatim

interface LegacyRule {
  id: string;
  condition: string;
  when: (c: ConfigAnswers) => boolean;
  activates: string[];
  outcome: Applicability;
  evidence?: string[];
}

const has = (c: ConfigAnswers, o: OriginType) => (c.SF01 ?? []).includes(o);
const market = (c: ConfigAnswers, m: Market) => (c.SF11 ?? []).includes(m);

const ALWAYS_DOC = ["GEN", "K1", "K5.2", "K6.1", "A10"];
const ALWAYS_ASSUMED = ["K2.1", "K2.2", "K2.3", "K3", "K4.1", "K4.2", "K5.3", "K6.5", "K6.6", "K6.7", "K6.9", "K6.10", "K6.11", "K6.12", "K6.16", "K7", "K8"];

const BASE_RULES: LegacyRule[] = [
  { id: "R-00", condition: "Every case", when: () => true, activates: ALWAYS_DOC, outcome: "mandatory", evidence: ["SDS", "CoA", "Specification", "Statements"] },
  { id: "R-01", condition: "Every case", when: () => true, activates: ALWAYS_ASSUMED, outcome: "mandatory" },
  { id: "R-02", condition: "Every case", when: () => true, activates: ["K6.8", "K8.1"], outcome: "optional" },
  { id: "R-10", condition: "Origin includes Vegetable", when: (c) => has(c, "vegetable"), activates: ["A1", "A2", "A9"], outcome: "mandatory", evidence: ["Pesticide and mycotoxin analysis", "Sustainability certificates"] },
  { id: "R-12", condition: "Origin includes Animal", when: (c) => has(c, "animal"), activates: [], outcome: "mandatory", evidence: ["BSE/TSE certificate", "Conformity with Annex II entry 419"] },
  { id: "R-13", condition: "Origin includes Mineral", when: (c) => has(c, "mineral"), activates: ["A1"], outcome: "mandatory", evidence: ["Origin and specification of the mineral source"] },
  { id: "R-14", condition: "Origin includes Petrochemical", when: (c) => has(c, "petrochemical"), activates: ["A1", "A4", "A9"], outcome: "mandatory", evidence: ["MOAH value", "PAH analysis against BDF limits"] },
  { id: "R-15", condition: "Origin includes Polymer", when: (c) => has(c, "polymer"), activates: ["A1", "A6", "K4.3"], outcome: "mandatory", evidence: ["Residual monomer content", "SPM scope statement"] },
  { id: "R-16", condition: "Origin includes Waste, CCU or Chemical recycling", when: (c) => has(c, "waste") || has(c, "ccu") || has(c, "chemrec"), activates: [], outcome: "mandatory" },
  { id: "R-30", condition: "SF-03 = Yes (polymer / REACH polymer definition)", when: (c) => c.SF03 === true, activates: ["K4.3", "A6"], outcome: "mandatory" },
  { id: "R-40", condition: "SF-04 = Yes (UV filter)", when: (c) => c.SF04 === true, activates: ["A5"], outcome: "mandatory" },
  { id: "R-50", condition: "SF-05 includes Colorant", when: (c) => (c.SF05 ?? []).includes("colorant"), activates: ["A7"], outcome: "mandatory" },
  { id: "R-51", condition: "SF-05 includes Preservative", when: (c) => (c.SF05 ?? []).includes("preservative"), activates: ["A8"], outcome: "mandatory" },
  { id: "R-60", condition: "SF-06 = Yes (fermentation / GMO)", when: (c) => c.SF06 === true, activates: ["A3"], outcome: "mandatory" },
  { id: "R-70", condition: "SF-07 = Yes (mineral oil / hydrocarbon)", when: (c) => c.SF07 === true, activates: ["A4", "A9"], outcome: "mandatory" },
  { id: "R-90", condition: "SF-09 = Yes (EUDR scope)", when: (c) => c.SF09 === true, activates: ["K6.17"], outcome: "mandatory" },
  { id: "R-100", condition: "SF-10 = Yes (Brazilian genetic heritage)", when: (c) => c.SF10 === true, activates: ["K6.16.1"], outcome: "mandatory" },
  { id: "R-110", condition: "Markets include United Kingdom", when: (c) => market(c, "UK"), activates: ["K6.2", "A11"], outcome: "mandatory" },
  { id: "R-112", condition: "Markets include China", when: (c) => market(c, "CN"), activates: ["K6.13"], outcome: "mandatory" },
  { id: "R-113", condition: "Markets include USA", when: (c) => market(c, "US"), activates: ["K6.14"], outcome: "mandatory" },
  { id: "R-114", condition: "Markets include Canada", when: (c) => market(c, "CA"), activates: ["K6.15"], outcome: "mandatory" },
  { id: "R-115", condition: "Any market outside the EU", when: (c) => (c.SF11 ?? []).some((m) => m !== "EU"), activates: ["K6.4", "A13"], outcome: "mandatory" },
  { id: "R-120", condition: "SF-12 = No (micro test waived)", when: (c) => c.SF12 === false, activates: ["K5.1"], outcome: "na" },
  { id: "R-121", condition: "SF-12 = Yes or not answered", when: (c) => c.SF12 !== false, activates: ["K5.1"], outcome: "mandatory" },
];

const TURKEY_RULE: LegacyRule = { id: "R-111", condition: "Markets include Turkey", when: (c) => market(c, "TR"), activates: ["K6.3", "A12"], outcome: "mandatory" };

const LEGACY_SETS: Record<string, LegacyRule[]> = { "RS-2026.1": BASE_RULES, "RS-2026.2": [...BASE_RULES, TURKEY_RULE] };

function legacySectionsInTemplate(templateVersion: string): string[] {
  const all = BUILTIN_SECTIONS.map((s) => s.id);
  return templateVersion.endsWith("v1") ? all.filter((id) => id !== "K6.3" && id !== "A12") : all;
}

const RANK: Record<Applicability, number> = { mandatory: 3, optional: 2, na: 1 };

function legacyDeriveScope(config: ConfigAnswers, ruleSetVersion: string, templateVersion = "CIQ-2026 v1") {
  const rules = LEGACY_SETS[ruleSetVersion] ?? BASE_RULES;
  const inTemplate = new Set(legacySectionsInTemplate(templateVersion));
  const best = new Map<string, { a: Applicability; rules: string[] }>();
  for (const rule of rules) {
    if (!rule.when(config)) continue;
    for (const sec of rule.activates) {
      if (!inTemplate.has(sec)) continue;
      const cur = best.get(sec);
      if (!cur || RANK[rule.outcome] > RANK[cur.a]) best.set(sec, { a: rule.outcome, rules: [rule.id] });
      else if (RANK[rule.outcome] === RANK[cur.a]) cur.rules.push(rule.id);
    }
  }
  return BUILTIN_SECTIONS.filter((s) => inTemplate.has(s.id)).map((s) => {
    const hit = best.get(s.id);
    return hit ? { sectionId: s.id, applicability: hit.a, firedRules: hit.rules } : { sectionId: s.id, applicability: "na" as const, firedRules: [] as string[] };
  });
}

const legacyEvidence = (config: ConfigAnswers, ruleSetVersion: string) =>
  (LEGACY_SETS[ruleSetVersion] ?? BASE_RULES).filter((r) => r.when(config) && r.evidence).flatMap((r) => r.evidence!.map((doc) => ({ ruleId: r.id, doc })));

// ------------------------------------------------------------------ the answer matrix

const ORIGINS: OriginType[] = ["vegetable", "animal", "mineral", "petrochemical", "polymer", "waste", "ccu", "chemrec"];
const MARKETS: Market[] = ["EU", "UK", "TR", "CN", "US", "CA", "OTHER"];
const YESNO = ["SF03", "SF04", "SF06", "SF07", "SF09", "SF10", "SF12"] as const;
const subsets = <T,>(xs: T[]): T[][] => xs.reduce<T[][]>((acc, x) => [...acc, ...acc.map((s) => [...s, x])], [[]]);

/** A small deterministic PRNG (mulberry32), so the random part of the matrix is the same on every run. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function matrix(): ConfigAnswers[] {
  const out: ConfigAnswers[] = [{}];
  for (const o of subsets(ORIGINS)) out.push({ SF01: o });
  for (const m of subsets(MARKETS)) out.push({ SF11: m });
  for (const sf05 of subsets<"colorant" | "preservative">(["colorant", "preservative"])) out.push({ SF05: sf05 });
  for (const k of YESNO) for (const v of [true, false, undefined]) out.push({ [k]: v } as ConfigAnswers);
  const r = rng(20261014);
  const pick = <T,>(xs: T[]) => xs.filter(() => r() < 0.35);
  for (let i = 0; i < 4000; i++) {
    const c: ConfigAnswers = {};
    if (r() < 0.85) c.SF01 = pick(ORIGINS);
    if (r() < 0.85) c.SF11 = pick(MARKETS);
    if (r() < 0.6) c.SF05 = pick(["colorant", "preservative"]);
    for (const k of YESNO) {
      const x = r();
      if (x < 0.4) c[k] = true;
      else if (x < 0.8) c[k] = false;
    }
    out.push(c);
  }
  return out;
}

const shape = (items: { sectionId: string; applicability: Applicability; firedRules: string[] }[]) => items.map((x) => ({ sectionId: x.sectionId, applicability: x.applicability, firedRules: x.firedRules }));

const PAIRS: [string, string][] = [
  ["RS-2026.1", "CIQ-2026 v1"],
  ["RS-2026.2", "CIQ-2026 v2"],
  ["RS-2026.1", "CIQ-2026 v2"],
  ["RS-2026.2", "CIQ-2026 v1"],
];

describe("built-in rules as data = the earlier rule functions (spec §8.4)", () => {
  const answers = matrix();

  it("covers a broad matrix of answers", () => {
    expect(answers.length).toBeGreaterThan(4300);
  });

  for (const [rs, tpl] of PAIRS) {
    it(`gives identical scopes for ${rs} with ${tpl} (built-in catalogue)`, () => {
      for (const c of answers) expect(shape(deriveScope(c, rs, tpl)), JSON.stringify(c)).toEqual(legacyDeriveScope(c, rs, tpl));
    });
  }

  it("gives identical scopes with the empty start's config (RS-2026.2 + v2 as the stored draft)", () => {
    const cfg = buildSeed().config;
    for (const c of answers.slice(0, 1500)) {
      expect(shape(deriveScope(c, "RS-2026.1", "CIQ-2026 v1", cfg))).toEqual(legacyDeriveScope(c, "RS-2026.1", "CIQ-2026 v1"));
      expect(shape(deriveScope(c, "RS-2026.2", "CIQ-2026 v2", cfg))).toEqual(legacyDeriveScope(c, "RS-2026.2", "CIQ-2026 v2"));
    }
  });

  it("asks for identical evidence", () => {
    for (const rs of ["RS-2026.1", "RS-2026.2"]) for (const c of answers) expect(requiredEvidence(c, rs)).toEqual(legacyEvidence(c, rs));
  });

  it("each rule's check matches the earlier function, rule by rule", () => {
    for (const rs of ["RS-2026.1", "RS-2026.2"]) {
      const rules = ruleSet(rs).rules;
      expect(rules.map((r) => r.id)).toEqual(LEGACY_SETS[rs].map((r) => r.id));
      rules.forEach((r, i) => {
        const old = LEGACY_SETS[rs][i];
        expect([r.activates, r.outcome, r.evidence]).toEqual([old.activates, old.outcome, old.evidence]);
        for (const c of answers.slice(0, 2000)) expect(r.when(c), `${r.id} ${JSON.stringify(c)}`).toBe(old.when(c));
      });
    }
  });

  it("keeps the template split and the unknown-version fallbacks", () => {
    for (const v of ["CIQ-2026 v1", "CIQ-2026 v2", "", "Portal label v1", "anything"]) expect(sectionsInTemplate(v)).toEqual(legacySectionsInTemplate(v));
    expect(ruleSet("").version).toBe("RS-2026.1");
    expect(ruleSet("RS-9999.9").version).toBe("RS-2026.1");
    expect(ruleSetsOf(undefined).map((r) => [r.version, r.status])).toEqual([
      ["RS-2026.1", "published"],
      ["RS-2026.2", "draft"],
    ]);
  });

  it("reasons read '<sentence> → <rule id>', in the earlier format", () => {
    const s = deriveScope({ SF01: ["vegetable", "mineral"], SF11: ["EU", "UK"] }, "RS-2026.1");
    expect(s.find((x) => x.sectionId === "A1")!.reason).toBe("Origin includes Vegetable → R-10; Origin includes Mineral → R-13");
    expect(deriveScope({ SF01: ["vegetable"] }, "RS-2026.1").find((x) => x.sectionId === "A1")!.reason).toBe("Origin includes Vegetable → R-10");
    expect(s.find((x) => x.sectionId === "K6.4")!.reason).toBe("Any target market outside the EU → R-115");
    expect(s.find((x) => x.sectionId === "A3")!.reason).toBe("No rule activates this section for these answers");
  });

  it("the built-in data has the same rule ids and order as before", () => {
    expect(RS1.rules.map((r) => r.id)).toEqual(BASE_RULES.map((r) => r.id));
    expect(RS2.rules.map((r) => r.id)).toEqual([...BASE_RULES, TURKEY_RULE].map((r) => r.id));
  });
});
