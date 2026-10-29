// S-RMES-PROBE (29 Oct): READ-ONLY. The RMES sheet (BDF's 8 fields, domain/rmesSheet.ts) derived from a case loaded live
// from the dev sandbox, as Safety and as Regulatory load it. It writes nothing: boot is the app's load only (no load
// effects, so no ensureRmes), and this file calls no writer.
//
// Why a probe: since 25 Oct I-2 creates the round-1 reviews after its Approve, and that Approve is refused while
// Integration service has no members, so S-CASE 5 to 9 cannot run in dev. This reads R1's showcase case instead (R1
// keeps its items; released on 20 Oct, with its Safety and Regulatory RMES rows), through R1's ledger (scope "run"), so
// only R1's items are mapped. It also records the RMES record's time: a form list row has no _created_at (29 Oct), so
// it comes from the record's rmes.saved creation row (trackMap.rmesOf).
// Run: LIVE=1 RUN=R1 KF_GAP_MS=12000 npx vitest run --config vitest.live.config.ts live/rmes.live.ts
//      env -u LIVE npx vitest run --config vitest.live.config.ts live/rmes.live.ts   (offline: the fake has no R1 case)
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rmesSheet } from "@/domain/rmesSheet";
import type { InternalPersonaId } from "@/domain/types";
import { caseBannerOf } from "@/app-live/load";
import { caseIn } from "./case/compare";
import { RESULTS_DIR } from "./lib/results";
import { RUN, boot, createWorld } from "./lib/world";

const CASE = "ZZT-N21-R1-SC1-C01";
const DIR = `${RESULTS_DIR}R1/`;
const OUT = `${DIR}S-RMES-PROBE.json`;

describe("S-RMES-PROBE: the RMES sheet from a live case (read-only)", () => {
  it(`Safety and Regulatory load ${CASE}; the sheet shows the 8 fields`, async () => {
    const w = await createWorld();
    if (!w.live) {
      // offline there is no R1 showcase case: nothing to probe
      expect(w.live).toBe(false);
      return;
    }
    expect(RUN).toBe("R1");
    const out: Record<string, unknown> = { suite: "S-RMES-PROBE", run: RUN, case: CASE, at: new Date().toISOString(), personas: {} };
    const fails: string[] = [];
    for (const persona of ["saf", "reg"] as InternalPersonaId[]) {
      const b = await boot(w, persona, { scope: "run" });
      const c = caseIn(b.state, CASE);
      if (!c) {
        fails.push(`${persona}: ${CASE} is not in the load`);
        (out.personas as Record<string, unknown>)[persona] = { loaded: false, cases: b.state.cases.map((x) => x.id) };
        continue;
      }
      const banner = caseBannerOf(b.mapped.index, b.snap, CASE);
      const sheet = rmesSheet(b.state, c, { readable: !banner });
      const view = sheet.readable
        ? {
            record: sheet.record,
            recordAt: sheet.recordAt ?? null,
            header: sheet.header.map((h) => ({ field: h.label, from: h.source.fieldId, text: h.text, state: h.state, note: h.note ?? null })),
            rows: sheet.rows.map((r) => ({ inci: r.inci, conc: r.conc, cas: r.cas, ec: r.ec, origin: r.originLabel, freeText: r.freeText.map((f) => ({ from: f.source.fieldId, text: f.text, state: f.state })) })),
            sharedOrigins: sheet.sharedOrigins,
            rmesRecord: c.rmes ? { createdAt: c.rmes.createdAt || null } : null,
            rmesRows: (b.mapped.index.rmes.get(`${CASE}|${persona === "saf" ? "SAF" : "REG"}`) ?? null) && { itemId: b.mapped.index.rmes.get(`${CASE}|${persona === "saf" ? "SAF" : "REG"}`)!.itemId },
            rmesSaved: b.snap.forms.audit
              .filter((r) => r.Case_Code === CASE && r.Action_Code === "rmes.saved")
              .map((r) => ({ at: r.Event_At ?? null, objectItemId: r.Object_Item_Id ?? null, state: r.Object_State ?? null, text: String(r.New_Value_Text ?? "").slice(0, 80) })),
            components: c.components.length,
            phase: c.phase,
            templateVersion: c.templateVersion,
          }
        : { notice: sheet.notice, banner };
      (out.personas as Record<string, unknown>)[persona] = { loaded: true, readable: sheet.readable, ...view };
      if (!sheet.readable) {
        fails.push(`${persona}: unreadable (${banner})`);
        continue;
      }
      // R1's case answers all three header fields and every component's INCI and CAS: each must show as answered
      for (const h of sheet.header) if (h.state !== "answered" || !h.text || h.text === CASE) fails.push(`${persona}: ${h.label} reads "${h.text}" (${h.state})`);
      if (!c.components.length) fails.push(`${persona}: the case has no K2.1 components`);
      for (const r of sheet.rows) if (!r.inci || r.inci === "—" || !r.cas || r.cas === "—" || !r.conc || r.conc === "—" || !r.freeText.length) fails.push(`${persona}: row ${r.rowId} reads INCI "${r.inci}", CAS "${r.cas}", % "${r.conc}", ${r.freeText.length} free text(s)`);
      // the record's time: its own department's rmes.saved creation row (a list row has no _created_at)
      const dept = persona === "saf" ? "SAF" : "REG";
      const ref = b.mapped.index.rmes.get(`${CASE}|${dept}`);
      const made = b.snap.forms.audit.find((r) => r.Action_Code === "rmes.saved" && r.Object_State === "Created" && !!ref && r.Object_Item_Id === ref.itemId);
      if (!c.rmes || !ref) fails.push(`${persona}: the case's ${dept} RMES record is not mapped`);
      else if (!made) fails.push(`${persona}: no rmes.saved creation row names the ${dept} record ${ref.itemId}`);
      else if (!sheet.recordAt || Date.parse(sheet.recordAt) !== Date.parse(String(made.Event_At))) fails.push(`${persona}: the record time "${sheet.recordAt ?? ""}" is not its creation row's "${String(made.Event_At)}"`);
    }
    out.fails = fails;
    mkdirSync(DIR, { recursive: true });
    writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log(`S-RMES-PROBE: ${OUT}\n${JSON.stringify(out, null, 2)}`);
    expect(fails).toEqual([]);
  });
});
