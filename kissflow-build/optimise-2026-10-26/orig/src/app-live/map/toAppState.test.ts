// toAppState per persona and read mode (DESIGN §7.1): `me` and its alias, the users roleOf and the pickers need, the
// supplier master or the suppliers of the cases, a configuration syncRegistry can take, and a state the prototype
// screens render: every array present, every date a date, no NaN (deep scan), the domain's invariants and selectors.
import { describe, expect, it } from "vitest";
import { configVersions } from "@/domain/configActions";
import { checkInvariants } from "@/domain/invariants";
import { kpis, pipeline } from "@/domain/metrics";
import { check, roleOf } from "@/domain/permissions";
import { syncRegistry } from "@/domain/rules";
import { buildSeed } from "@/domain/seed";
import { visibleCasesFor } from "@/domain/selectors";
import type { AppState, InternalPersonaId } from "@/domain/types";
import { queueRows } from "@/features/review/lib";
import { str, type RawItem } from "@/portal/data/raw";
import { parseSnapshot } from "./auditMap";
import { KF_USERS, NO_PORTAL_CONTACT, PERSONA_USER, appFixtures, fixtureActing, fixtureIdentity, fixtureInput, fixtureSnapshot } from "../testing/rawFixtures";
import { toAppState } from "./toAppState";

const PERSONAS: InternalPersonaId[] = ["rmm", "reg", "saf", "qm", "mic", "sus", "cus", "leg", "admin", "auditor", "owner"];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const DATE_KEY = /(^at$|At$|^dueDate$|^generatedAt$|^releasedAt$)/;

/** Every problem a screen would trip over: an undefined in an array, a NaN, a date key that is not an ISO date. */
function renderProblems(v: unknown, path = "state", out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x, i) => (x === undefined || x === null ? out.push(`${path}[${i}] is ${x}`) : renderProblems(x, `${path}[${i}]`, out)));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === "number" && !Number.isFinite(x)) out.push(`${path}.${k} is ${x}`);
      if (DATE_KEY.test(k) && x !== undefined && (typeof x !== "string" || !ISO.test(x) || !Number.isFinite(Date.parse(x)))) out.push(`${path}.${k} = ${JSON.stringify(x)}`);
      renderProblems(x, `${path}.${k}`, out);
    }
  }
  return out;
}

describe("every persona, both read modes", () => {
  for (const mode of ["full", "role"] as const)
    for (const p of PERSONAS)
      it(`${p} (${mode}): renders without gaps`, () => {
        const m = toAppState(fixtureInput(p, mode));
        const s = m.state;
        expect(renderProblems(s)).toEqual([]);
        expect([s.toasts, s.mails]).toEqual([[], []]);
        expect(s.personaId).toBe(p);
        expect(s.cases.map((c) => c.id).sort()).toEqual(["ZZT-0001", "ZZT-0003", "ZZT-0005"]);
        for (const c of s.cases) {
          for (const k of ["supplierContactIds", "scope", "components", "documents", "reviews", "informed", "openPoints", "confirmations", "audit", "phaseHistory", "internalNotes"] as const) expect(Array.isArray(c[k]), `${c.id}.${k}`).toBe(true);
          expect(c.phaseHistory.length).toBeGreaterThan(0);
          expect(c.phaseHistory.at(-1)!.phase).toBe(c.phase);
          for (const id of [c.ownerId, ...c.supplierContactIds, ...c.reviews.map((r) => r.assigneeId), ...c.openPoints.flatMap((op) => [op.createdBy, op.responsibleId, ...op.thread.map((x) => x.by)]), ...c.audit.map((e) => e.by)])
            if (id !== "system") expect(s.users.some((u) => u.id === id), `${c.id}: user ${id}`).toBe(true);
        }
        // the domain's own consistency rules hold for every view of the data; a case whose item this role can't read
        // has no completeness confirmation (nothing names who gave it, and nothing is made up: the banner says so)
        const unreadable = (msg: string) => /^(ZZT-\d{4}): .* without a completeness confirmation$/.exec(msg)?.[1];
        expect(checkInvariants(s).filter((v) => !(unreadable(v) && m.index.cases.get(unreadable(v)!)?.readable === false))).toEqual([]);
        // a few of the selectors the screens call
        syncRegistry(s.config);
        expect(configVersions(s).length).toBeGreaterThan(0);
        expect(pipeline(s).reduce((n, x) => n + x.count, 0)).toBeGreaterThan(0);
        expect(Object.values(kpis(s, "2026-10-24T08:00:00Z")).every((x) => x === null || typeof x !== "number" || Number.isFinite(x))).toBe(true);
        expect(queueRows(s, "RMM").done.length + queueRows(s, "RMM").todo.length + queueRows(s, "RMM").waiting.length).toBeGreaterThan(0);
      });
});

describe("malformed history rows (M4)", () => {
  /** A history row of ZZT-0003 with this Snapshot_JSON (parseable, but not the shape the writers write). */
  const row = (n: number, code: string, snapshot: unknown): RawItem => ({ _id: `PkEvBad${n}`, _created_at: `2026-10-24T07:0${n}:00Z`, Event_Key: `EV-ZZT-0003-BAD-${n}`, Case_Code: "ZZT-0003", Cycle_No: 1, Case_Item_Id: "AppZZT-0003", Event_At: `2026-10-24T07:0${n}:00Z`, Action_Code: code, Actor_Side: "BDF", Snapshot_JSON: JSON.stringify(snapshot) });

  it("the reviewer's rows (a thread, contacts and mentions that are not lists): every role still loads, with a warning", () => {
    const input = fixtureInput("qm", "role");
    const header = parseSnapshot(input.snap.forms.audit.find((r) => str(r, "Action_Code") === "case.created" && str(r, "Case_Code") === "ZZT-0003"))!.case!;
    const op = appFixtures().cases["ZZT-0003"].openPoints[0]!;
    const bad = [
      row(1, "op.raised", { v: 1, code: "op.raised", op: { id: "OP-0003-99", thread: "oops" } }),
      row(2, "case.created", { v: 1, code: "case.created", case: { ...header, contacts: "oops" } }),
      row(3, "note.added", { v: 1, code: "note.added", note: { id: "N-0003-99", at: "2026-10-24T07:03:00Z", by: KF_USERS["u-qm"]!._id, text: "Checked.", mentions: "x" } }),
      // a complete point whose history is not a list
      row(4, "op.edited", { v: 1, code: "op.edited", op: { ...op, id: "OP-0003-98", thread: "oops", edits: "oops" } }),
    ];
    for (const p of ["qm", "rmm", "auditor"] as const) {
      const x = p === "qm" ? input : fixtureInput(p, "role");
      const m = toAppState({ ...x, snap: { ...x.snap, forms: { ...x.snap.forms, audit: [...x.snap.forms.audit, ...bad] } } });
      expect(m.state.cases.map((c) => c.id).sort(), p).toEqual(["ZZT-0001", "ZZT-0003", "ZZT-0005"]);
      expect(renderProblems(m.state), p).toEqual([]);
      const c = m.state.cases.find((k) => k.id === "ZZT-0003")!;
      // the incomplete point is left out; the complete one shows with its question only; the note without mentions
      expect(c.openPoints.some((q) => q.id === "OP-0003-99")).toBe(false);
      expect(c.openPoints.find((q) => q.id === "OP-0003-98")?.thread).toEqual([]);
      expect(c.internalNotes.find((n) => n.id === "N-0003-99")?.mentions).toEqual([]);
      expect(m.warnings.filter((w) => /EV-ZZT-0003-BAD-\d/.test(w)).length, p).toBe(4);
    }
  });

  it("a case whose mapping still fails is left out with a warning; the other cases load", () => {
    const input = fixtureInput("qm", "role");
    // a note row of ZZT-0005 that throws when its text is read (anything the guards did not foresee)
    const trap = { ...input.snap.forms.note.find((n) => str(n, "Case_Item_Id") !== "AppZZT-0005") ?? input.snap.forms.note[0]!, _id: "PkNoteTrap", Case_Item_Id: "AppZZT-0005", Case_Code: "ZZT-0005" } as RawItem;
    Object.defineProperty(trap, "Note_Text", { enumerable: true, get: () => { throw new Error("unreadable row"); } });
    const m = toAppState({ ...input, snap: { ...input.snap, forms: { ...input.snap.forms, note: [...input.snap.forms.note, trap] } } });
    expect(m.state.cases.map((c) => c.id).sort()).toEqual(["ZZT-0001", "ZZT-0003"]);
    expect(m.warnings).toContain("ZZT-0005: this case could not be read (unreadable row); it is not shown. Diagnostics lists the other warnings.");
    expect(m.index.cases.has("ZZT-0005")).toBe(false);
  });
});

describe("me and its alias (DESIGN §3.4)", () => {
  it("a department user is itself, with its department, and the role rights follow", () => {
    const m = toAppState(fixtureInput("qm"));
    const me = m.state.users.find((u) => u.id === KF_USERS["u-qm"]!._id)!;
    expect([me.dept, me.name, me.title]).toEqual(["QM", "Lena Krause", "Quality Management reviewer"]);
    expect(roleOf(m.state, me.id)).toBe("qm");
    expect(check(m.state, me.id, "op.raise", m.state.cases.find((c) => c.id === "ZZT-0003"), { dept: "QM" })).toBeNull();
  });

  it("the Business administrator, Auditor and Business owner act under their static ids; their Kissflow id maps to it", () => {
    for (const p of ["admin", "auditor", "owner"] as const) {
      const m = toAppState(fixtureInput(p));
      expect(m.state.users.filter((u) => u.id === `u-${p}`)).toHaveLength(1);
      expect(m.state.users.some((u) => u.id === KF_USERS[PERSONA_USER[p]]!._id)).toBe(false);
      expect(roleOf(m.state, `u-${p}`)).toBe(p);
    }
    const admin = toAppState(fixtureInput("admin")).state;
    expect(check(admin, "u-admin", "supplier.manage")).toBeNull();
    expect(check(admin, "u-admin", "config.manage")).toBeNull();
    expect(check(admin, "u-admin", "note.add", admin.cases[0])).not.toBeNull();
  });

  it("the built-in configuration's publisher u-admin is an inactive user unless the Business administrator is me", () => {
    const rmm = toAppState(fixtureInput("rmm")).state;
    expect(rmm.users.find((u) => u.id === "u-admin")).toMatchObject({ name: "Business administrator", active: false });
    expect(toAppState(fixtureInput("admin")).state.users.find((u) => u.id === "u-admin")!.name).toBe(KF_USERS["u-admin"]!.Name);
  });

  it("one person holding two personas: the acting one decides me", () => {
    const identity = fixtureIdentity(["rmm", "admin"], "u-rmm");
    const asAdmin = toAppState({ snap: fixtureSnapshot("rmm"), identity, acting: fixtureActing(identity, "admin") }).state;
    // RMM's own items now name "u-admin" (the alias), whose role is admin
    expect(asAdmin.cases.every((c) => c.ownerId === "u-admin")).toBe(true);
    expect(roleOf(asAdmin, "u-admin")).toBe("admin");
  });
});

describe("people and suppliers", () => {
  it("the departments' users come from the items, with their department", () => {
    const s = toAppState(fixtureInput("rmm")).state;
    for (const d of ["u-reg", "u-saf", "u-qm", "u-mic", "u-sus"] as const) {
      const u = s.users.find((x) => x.id === KF_USERS[d]!._id)!;
      expect([u.name, u.dept, u.active]).toEqual([KF_USERS[d]!.Name, buildSeed().users.find((x) => x.id === d)!.dept, undefined]);
    }
  });

  it("RMM and the Business administrator read the supplier master; contacts without a portal user are contact:<key>", () => {
    for (const p of ["rmm", "admin"] as const) {
      const s = toAppState(fixtureInput(p, "role")).state;
      const sol = s.suppliers.find((x) => x.id === "SUP-ZZT-SOLVARO")!;
      expect(sol).toMatchObject({ name: "Solvaro Oleochemicals S.A.", duns: "471203958", country: "ES", city: "Tarragona", type: "manufacturer", active: true });
      expect(sol.contactIds).toEqual(["UsElena", "UsRavi", `contact:${NO_PORTAL_CONTACT.key}`]);
      expect(s.users.find((u) => u.id === "UsRavi")).toMatchObject({ side: "supplier", supplierId: "SUP-ZZT-SOLVARO", mayConfirm: false, active: true });
      expect(s.suppliers.find((x) => x.id === "SUP-ZZT-NORDHAFEN")!.type).toBe("distributor");
    }
    const m = toAppState(fixtureInput("admin", "role"));
    expect(m.index.suppliers.get("SUP-ZZT-SOLVARO")).toEqual({ supplierId: "SUP-ZZT-SOLVARO", itemId: "PkSupSolvaro", contactRows: { UsElena: "Contacts_celena", UsRavi: "Contacts_cravi", [`contact:${NO_PORTAL_CONTACT.key}`]: "Contacts_cjoana" } });
    // B6: the intended mapping is counted in the notes (dev only), never a load warning
    expect(m.notes).toContain('1 supplier has the kind "Trader", shown as distributor.');
    expect(m.warnings.some((w) => /Trader/.test(w))).toBe(false);
  });

  it("roles without the supplier master see the cases' supplier with the case contacts", () => {
    const s = toAppState(fixtureInput("qm", "role")).state;
    expect(s.suppliers).toEqual([{ id: "SUP-ZZT-SOLVARO", name: "Solvaro Oleochemicals S.A.", duns: "471203958", country: "", type: "manufacturer", contactIds: ["UsElena", "UsRavi"], active: true }]);
    expect(visibleCasesFor(s, KF_USERS["u-qm"]!._id)).toHaveLength(3);
  });
});

describe("configuration and index", () => {
  it("the configuration is the empty start's; templates and the active rule set follow it", () => {
    const m = toAppState(fixtureInput("admin"));
    const seed = buildSeed();
    expect(m.state.config.pairs.map((p) => [p.ruleSet.version, p.template.version, p.status])).toEqual(seed.config.pairs.map((p) => [p.ruleSet.version, p.template.version, p.status]));
    expect(m.state.templates.map((t) => [t.version, t.status])).toEqual(seed.templates.map((t) => [t.version, t.status]));
    expect(m.state.activeRuleSet).toBe(seed.activeRuleSet);
    expect([m.state.ownership, m.state.reminders]).toEqual([seed.ownership, seed.reminders]);
    expect(m.index.releases.map((r) => r.key)).toEqual(["RS-2026.1 + v1", "RS-2026.2 + v2"]);
    expect(m.index.settings).toMatchObject({ undefinedOrigins: ["waste", "ccu", "chemrec"] });
  });

  it("the index: reviews and points with their held tasks, RMES rows of the readable departments", () => {
    const m = toAppState(fixtureInput("saf", "role"));
    expect(m.index.reviews.get("ZZT-0003|SAF")).toMatchObject({ live: true, act: "ActPkRevZZT0003SAF1", roundNo: 1, reviewKey: "ZZT-0003-SAF-1" });
    expect(m.index.reviews.get("ZZT-0003|QM")).toMatchObject({ live: false, itemId: "PkRevZZT0003QM1" });
    expect(m.index.ops.get("OP-0003-04")).toMatchObject({ live: true, act: "ActPkOpOP000304" });
    expect(m.index.ops.get("OP-0003-01")).toMatchObject({ live: false });
    expect([...m.index.rmes.keys()].sort()).toEqual(["ZZT-0003|SAF", "ZZT-0005|SAF"]);
    expect(m.index.rmes.get("ZZT-0003|SAF")!.itemId).toBe("PkRmesZZT0003SAF");
  });

  it("the full view of ZZT-0003 equals the domain case on its key fields", () => {
    const got = toAppState(fixtureInput("rmm")).state.cases.find((c) => c.id === "ZZT-0003")!;
    const want = appFixtures().cases["ZZT-0003"];
    const key = (c: AppState["cases"][number]) => ({
      phase: c.phase,
      reviews: c.reviews.map((r) => [r.dept, r.status, r.assigneeId, r.decision]),
      points: c.openPoints.map((p) => [p.id, p.status, p.rounds, p.thread.length, p.outcome]),
      rmes: c.rmes?.criteria.map((x) => [x.id, x.result]).sort(),
      findings: c.rmes?.findings,
      notes: c.internalNotes.map((n) => [n.id, n.by, n.text, n.mentions]),
      informed: c.informed,
      reviewVersion: c.reviewVersion,
    });
    expect(key(got)).toEqual(key(want));
  });
});

describe("E-A's case-level review.started row (22 Oct): one row with every review's track, no review item ids", () => {
  const caseItem = "AppZZT-0003";
  const KF_RMM = KF_USERS[PERSONA_USER.rmm]!._id;
  /** RMM without admin rights after I-2 started the reviews: it reads only the review it holds (none is its own
   *  start), and ZZT-0003's review history is E-A's one row (or none). */
  const rmmAfterEA = (row?: RawItem) => {
    const input = fixtureInput("rmm", "role");
    const held = new Set(input.snap.tasks.map((t) => t.itemId));
    const reviews = input.snap.items.review.filter((it) => held.has(it._id));
    const audit = input.snap.forms.audit.filter((r) => !(str(r, "Case_Item_Id") === caseItem && /^review\./.test(str(r, "Action_Code"))));
    return toAppState({ ...input, snap: { ...input.snap, items: { ...input.snap.items, review: reviews }, forms: { ...input.snap.forms, audit: row ? [...audit, row] : audit } } });
  };
  const DEPTS = ["RMM", "REG", "SAF", "QM", "MIC", "SUS"] as const;
  const at = "2026-10-22T09:00:00Z";
  const text = "Reviews started: RMM, Regulatory, Safety, QM, Microbiology, Sustainability.";
  const row: RawItem = {
    _id: "PkEvEA1",
    Event_Key: "EV-ZZT-0003-20261022090000-ea01",
    Case_Code: "ZZT-0003",
    Cycle_No: 1,
    Case_Item_Id: caseItem,
    Event_At: at,
    Event_Category: "Review",
    Action_Code: "review.started",
    Actor_Side: "BDF",
    Actor_Name: "Integration",
    Object_Kind: "Case",
    Object_Key: "ZZT-0003",
    Object_Item_Id: caseItem,
    Object_State: "In review",
    New_Value_Text: text,
    Snapshot_JSON: JSON.stringify({
      v: 1,
      code: "review.started",
      audit: [{ id: "", at, by: "system", action: "Activated review", detail: text }],
      handoffs: [],
      tracks: DEPTS.map((dept) => ({ dept, status: "in-review", roundNo: 1, startedAt: at, ...(dept === "RMM" ? { assigneeId: KF_RMM } : {}) })),
    }),
  };

  it("without it, RMM sees none of the department reviews it cannot read", () => {
    const c = rmmAfterEA().state.cases.find((x) => x.id === "ZZT-0003")!;
    expect(c.reviews.filter((t) => t.dept !== "RMM")).toEqual([]);
  });

  it("with it, RMM sees every department's review in review, RMM's own assigned to its owner, and one history line", () => {
    const m = rmmAfterEA(row);
    const c = m.state.cases.find((x) => x.id === "ZZT-0003")!;
    expect(c.reviews.map((t) => t.dept).sort()).toEqual([...DEPTS].sort());
    for (const t of c.reviews.filter((x) => x.dept !== "RMM")) expect([t.dept, t.status === "in-review" || t.status === "waiting-supplier"]).toEqual([t.dept, true]);
    expect(c.reviews.find((t) => t.dept === "RMM")!.assigneeId).toBe(c.ownerId);
    const lines = c.audit.filter((e) => e.action === "Activated review");
    expect(lines.map((e) => e.detail)).toEqual([text]);
    // the row names the case, not a review: no review ref takes the case item id as its own
    for (const d of DEPTS) expect(m.index.reviews.get(`ZZT-0003|${d}`)?.itemId).not.toBe(caseItem);
  });

  it("a `tracks` that is not a list of tracks is said, and nothing of it is shown", () => {
    const bad = { ...row, Snapshot_JSON: JSON.stringify({ ...JSON.parse(String(row.Snapshot_JSON)), tracks: { dept: "QM" } }) };
    const m = rmmAfterEA(bad);
    expect(m.warnings.some((w) => /keeps the reviews in a shape this app does not know/.test(w))).toBe(true);
    expect(m.state.cases.find((x) => x.id === "ZZT-0003")!.reviews.filter((t) => t.dept !== "RMM")).toEqual([]);
  });
});
