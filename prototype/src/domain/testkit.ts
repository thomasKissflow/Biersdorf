// Test-only scenario builder (imported by *.test.ts only). It drives the pure actions with an explicit clock, checks
// after EVERY step that the action was (or was not) refused as expected and that checkInvariants(state) is clean, so
// every scenario test is also an invariant test.

import * as A from "./actions";
import { fieldOf } from "./catalog";
import { wasRefused } from "./core";
import { isSectionUploadKey, isSlotKey, uploadKeySection } from "./requestedDocs";
import { checkInvariants } from "./invariants";
import { buildSeed, makeUser } from "./seed";
import { DAY, completenessBlockers } from "./selectors";
import type { AnswerValue, AppState, CiqCase, ConfigAnswers, FieldDef, OpenPoint, ReviewDept } from "./types";

export const T0 = "2026-10-14T08:00:00.000Z";

/** The empty start plus a second (fictional) Regulatory reviewer, for tests where raiser and responsible differ. */
export const seedWithRegColleague = (): AppState => {
  const s = buildSeed();
  return { ...s, users: [...s.users, makeUser("u-reg-2", "Tobias Brandt", "Regulatory Affairs Specialist", "internal", "REG")] };
};

/** Metadata answers that open few sections: vegetable origin, everything else "no", micro test required. */
export const PLAIN_CONFIG: ConfigAnswers = { SF01: ["vegetable"], SF03: false, SF04: false, SF05: [], SF06: false, SF07: false, SF09: false, SF10: false, SF12: true };

export const NEW_CASE: A.NewCaseInput = { materialName: "OLIVIA Pure 100", inci: "Olea Europaea Fruit Oil", materialNo: "RM-500123", supplierId: "s1", contactIds: ["u-sup-1", "u-sup-2"], markets: ["EU"], dueDate: "2026-12-31T00:00:00.000Z", priority: "normal" };

function valueFor(f: FieldDef): AnswerValue {
  switch (f.type) {
    case "email":
      return "qa@solvaro.example";
    case "number":
      return 1;
    case "decimal":
      return 0.5;
    case "range":
      return { min: 1, max: 2 };
    case "yesno":
      return false;
    case "single":
      return f.options?.[0]?.value ?? "x";
    case "multi":
      return [f.options?.[0]?.value ?? "x"];
    case "longtext":
      return "Described in the attached statement.";
    default:
      return "Test value";
  }
}

export class Scenario {
  s: AppState;
  t: number;
  id = "";
  log: string[] = [];

  constructor(s: AppState = buildSeed(), start = T0) {
    this.s = s;
    this.t = Date.parse(start);
    this.verify("start");
  }

  /** The next timestamp (one hour after the previous step). */
  now(): string {
    this.t += 3_600_000;
    return new Date(this.t).toISOString();
  }

  later(days: number): this {
    this.t += days * DAY;
    return this;
  }

  get c(): CiqCase {
    return this.s.cases.find((x) => x.id === this.id)!;
  }

  op(id?: string): OpenPoint {
    return id ? this.c.openPoints.find((p) => p.id === id)! : this.c.openPoints.at(-1)!;
  }

  track(dept: ReviewDept) {
    return this.c.reviews.find((r) => r.dept === dept);
  }

  verify(label: string) {
    const v = checkInvariants(this.s);
    if (v.length) throw new Error(`Invariants broken after "${label}":\n${v.join("\n")}`);
  }

  /** Runs one action. Throws when it was refused (or, with expectRefusal, when it was not) or broke an invariant. */
  step(label: string, fn: (s: AppState, at: string) => AppState, expectRefusal = false): this {
    const prev = this.s;
    const next = fn(prev, this.now());
    const refused = wasRefused(prev, next);
    if (refused !== expectRefusal) throw new Error(`"${label}" was ${refused ? `refused: ${next.toasts.at(-1)?.text}` : "accepted but should have been refused"}`);
    this.s = next;
    this.log.push(label);
    this.verify(label);
    return this;
  }

  /** The step must be refused; returns the refusal text. */
  refused(label: string, fn: (s: AppState, at: string) => AppState): string {
    this.step(label, fn, true);
    return this.s.toasts.at(-1)?.text ?? "";
  }

  create(input: Partial<A.NewCaseInput> = {}, by = "u-rmm"): this {
    let id = "";
    this.step("create case", (s, at) => {
      const r = A.createCase(s, by, { ...NEW_CASE, ...input }, at);
      id = r.id;
      return r.state;
    });
    this.id = id;
    return this;
  }

  metadata(config: ConfigAnswers = PLAIN_CONFIG, by = "u-sup-1"): this {
    return this.step("answer metadata", (s, at) => A.saveConfig(s, by, this.id, config, at));
  }

  /** Fills every completeness blocker: typed values first, a justification where a value does not validate. */
  fillMandatory(by = "u-sup-1", second = "u-sup-2"): this {
    const tried = new Set<string>();
    for (let round = 0; round < 8; round++) {
      let blockers = completenessBlockers(this.c, this.s.config);
      if (!blockers.length) return this;
      if (blockers.some((b) => b.fieldId?.startsWith("SF"))) {
        this.metadata(PLAIN_CONFIG, by);
        blockers = completenessBlockers(this.c, this.s.config);
      }
      let composed = false; // the K2.1 blockers without a field (one per row problem, D6) need one composition step
      blockers.forEach((b, i) => {
        const who = i % 3 === 2 ? second : by;
        if (b.fieldId?.startsWith("SF")) return;
        if (!b.fieldId) {
          if (composed) return;
          composed = true;
          // One valid row per SF-01 origin, so every component's origin is an SF-01 answer and every answer is used.
          const origins = this.c.config.SF01?.length ? this.c.config.SF01 : (["vegetable"] as const);
          const rows = origins.map((o, i) => ({ id: `c${i + 1}`, inci: i ? `Component ${i + 1}` : this.c.inci, fn: "emollient", additive: false, origin: o, concMin: i ? 0.1 : 90, concMax: i ? 1 : 99, cas: "8001-25-0" }));
          if (b.sectionId === "K2.1") this.step("composition", (s, at) => A.setComponents(s, who, this.id, rows, at));
          return;
        }
        // A requested document (requestedDocs.ts): uploaded to its slot.
        if (isSlotKey(b.fieldId) && !tried.has(b.fieldId)) {
          tried.add(b.fieldId);
          this.step(`upload ${b.fieldId}`, (s, at) => A.uploadDocument(s, who, this.id, { name: `${b.fieldId!.slice(3)}.pdf`, kind: "Analysis", sectionId: b.sectionId, fieldId: b.fieldId }, at).state);
          return;
        }
        // A documents-only section that requires an upload: a file in the section itself (no question).
        if (isSectionUploadKey(b.fieldId) && !tried.has(b.fieldId)) {
          tried.add(b.fieldId);
          const sectionId = uploadKeySection(b.fieldId);
          this.step(`upload ${b.fieldId}`, (s, at) => A.uploadDocument(s, who, this.id, { name: `${sectionId}_template.pdf`, kind: "Statement", sectionId }, at).state);
          return;
        }
        const f = fieldOf(b.fieldId, this.c.templateVersion, this.s.config);
        if (b.fieldId === "FLD-5.1-002" || tried.has(b.fieldId) || !f) {
          if (this.c.answers[b.fieldId] !== undefined && this.c.answers[b.fieldId] !== null) this.step(`clear ${b.fieldId}`, (s, at) => A.setAnswer(s, who, this.id, b.fieldId!, null, at));
          if (!this.c.justifications[b.fieldId]) this.step(`justify ${b.fieldId}`, (s, at) => A.setJustification(s, who, this.id, b.fieldId!, "Not available for this material; statement attached.", at));
          return;
        }
        tried.add(b.fieldId);
        if (f.type === "file") this.step(`upload ${f.id}`, (s, at) => A.uploadDocument(s, who, this.id, { name: `${f.id}_statement.pdf`, kind: "Statement", sectionId: f.sectionId, fieldId: f.id }, at).state);
        else this.step(`answer ${f.id}`, (s, at) => A.setAnswer(s, who, this.id, f.id, valueFor(f), at));
      });
    }
    throw new Error(`Could not fill: ${completenessBlockers(this.c, this.s.config).map((b) => b.label).join("; ")}`);
  }

  confirm(by = "u-sup-1"): this {
    return this.step("confirm completeness", (s, at) => A.confirmCompleteness(s, by, this.id, at));
  }

  /** create → metadata → fill → confirm. */
  toReview(input: Partial<A.NewCaseInput> = {}, config: ConfigAnswers = PLAIN_CONFIG): this {
    return this.create(input).metadata(config).fillMandatory().confirm();
  }

  raise(dept: ReviewDept, by: string, sectionId = "K1", question = "Please confirm the specification limit.", extra: Partial<A.RaiseInput> = {}): this {
    return this.step(`raise ${dept}`, (s, at) => A.raiseOpenPoint(s, by, this.id, { dept, kind: "query", ref: { sectionId, label: `${sectionId} › specification` }, question, justification: "Needed for the review", dueDate: new Date(this.t + 10 * DAY).toISOString(), ...extra }, at));
  }

  answer(opId: string, by = "u-sup-1", text = "The limit is 5 meq/kg; see the specification.", documentName?: string): this {
    return this.step(`answer ${opId}`, (s, at) => A.supplierRespond(s, by, this.id, opId, { text, documentName }, at));
  }

  decide(opId: string, by: string, decision: "accept" | "return" | "not-accepted" = "accept", text = ""): this {
    return this.step(`${decision} ${opId}`, (s, at) => A.reviewResponse(s, by, this.id, opId, decision, text, at));
  }

  decision(dept: "SAF" | "REG", by: string, d: "approved" | "rejected", reason = ""): this {
    return this.step(`decision ${dept} ${d}`, (s, at) => A.rmesDecision(s, by, this.id, dept, d, reason, at));
  }

  complete(dept: ReviewDept, by: string, opts?: A.CompleteOptions): this {
    return this.step(`complete ${dept}`, (s, at) => A.completeReview(s, by, this.id, dept, at, opts));
  }

  /** The role holder of a track (one person per role in the empty start). */
  static readonly REVIEWER: Record<ReviewDept, string> = { RMM: "u-rmm", REG: "u-reg", SAF: "u-saf", QM: "u-qm", MIC: "u-mic", SUS: "u-sus" };

  /** Completes every open track (the decision first for Safety and Regulatory), departments before RMM; `except` stay open. */
  completeAll(opts?: A.CompleteOptions, except: ReviewDept[] = []): this {
    const order = this.c.reviews.filter((r) => r.status !== "completed" && !except.includes(r.dept)).map((r) => r.dept).sort((a, b) => Number(a === "RMM") - Number(b === "RMM"));
    for (const d of order) {
      const by = this.track(d)!.assigneeId;
      if ((d === "SAF" || d === "REG") && !this.track(d)!.decision) this.decision(d, by, "approved");
      this.complete(d, by, d === "RMM" ? opts : undefined);
    }
    return this;
  }

  /** A reviewer reopens its own completed review (B-25). */
  reopen(dept: ReviewDept, reason = "The supplier must update an answer.", by = Scenario.REVIEWER[dept]): this {
    return this.step(`reopen ${dept}`, (s, at) => A.reopenReview(s, by, this.id, dept, reason, at));
  }

  release(by = "u-sup-1"): this {
    return this.step("final release", (s, at) => A.finalRelease(s, by, this.id, at));
  }

  /** Mails of this case for one event. */
  mails(event?: string) {
    return this.s.mails.filter((m) => m.caseId === this.id && (!event || m.event === event));
  }
}
