// CASE_S2 "Scope check" (§8.5; WB-12 manual scope; WB-D10). The pinned config gives the sections; RMM picks the
// applicability per section (extend only, with a justification), the department flags follow the leads (RMM from
// Settings; RMM may add with a reason), the texts and due dates are set, and "Save scope" writes the F4 run once,
// the missing F3 rows one at a time, then the S2 fields. A content-hash mismatch against the case's manifest copy
// blocks the step and is recorded as an F8 "Configuration" event (config.hash.mismatch).
import { AlertTriangle, Lock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import { Checkbox, Field, TextArea, TextInput } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { DEPTS, editableAt, mandatoryAt, type Dept } from "../../../schema";
import { sha256Hex, type Applicability } from "../../../domain/config";
import { DEPT_LABEL, ruleSetLabel } from "../../../domain/labels";
import { addDays } from "../../../data/normalize";
import { useWorkbench, type CaseBundle } from "../../../data/hooks";
import type { Problem, TaskVM } from "../../../data/viewModels";
import { StepForm } from "../../../ui/StepForm";
import { ActionBanner, LoadingCard } from "../shared";
import {
  applicabilityOptions,
  buildRunRow,
  buildS2Fields,
  buildScope,
  buildSectionRows,
  checkCaseManifest,
  defaultTextKey,
  initialRunKey,
  parseRecordedScope,
  s2TextProblems,
  saveScope,
  scopeConfigFrom,
  scopeFromRecorded,
  scopeInputJson,
  scopeRowsProblems,
  type S2Texts,
  type SaveScopeLog,
  type ScopeChoices,
} from "../scope";
import { usePinnedConfig } from "../useConfig";
import { PanelButtons, PanelCard, PanelOutcome, SubBlock, useBusy, usePanelValues, type PanelResult } from "./PanelKit";

/** Per session: hash mismatches already recorded (case id + config key), so a re-render never writes twice. */
const recordedMismatch = new Set<string>();

const PANEL_SET: string[] = [
  "Confirm_Contact_Ids",
  "Supplier_Contact_Emails",
  "Rule_Set_Version",
  ...DEPTS.map((d) => `Dept_${d}_Active`),
  "Initial_Scope_Run_Key",
  "Completeness_Request_Key",
  "Completeness_Declaration_Text",
  "Completeness_Text_Key",
  "Completeness_Due_Date",
  "RMES_Key",
  "Final_Release_Request_Key",
  "Final_Release_Declaration_Text",
  "Final_Release_Text_Key",
  "Final_Release_Due_Date",
  "Supplier_Closing_Text",
];

/** The optional S2 fields the StepForm shows (editableAt(CASE_S2) minus what the panel sets itself). */
const OPTIONAL = [...mandatoryAt("CASE_S2"), ...editableAt("CASE_S2")].filter((k) => !PANEL_SET.includes(k));

export function ScopePanel({ task, b, onChanged }: { task: TaskVM; b: CaseBundle; onChanged(): void }) {
  const c = b.case;
  const { actions, me } = useWorkbench();
  const cfgState = usePinnedConfig(c.releaseItemId || null, { enabled: !!c.releaseItemId });
  const cfg = useMemo(() => (cfgState.pinned ? scopeConfigFrom(cfgState.pinned) : null), [cfgState.pinned]);
  const pv = usePanelValues(c);
  const { busy, run } = useBusy();
  const now = useMemo(() => new Date(), []);

  // content hashes against the case's manifest copy
  const [hash, setHash] = useState<{ mismatches: { configKey: string; expected: string; actual: string }[]; problems: string[] } | null>(null);
  const [hashEvent, setHashEvent] = useState<string | null>(null);
  useEffect(() => {
    if (!cfgState.pinned || !cfgState.rows) return;
    let alive = true;
    void checkCaseManifest(String(c.v.Release_Manifest_JSON ?? ""), cfgState.rows, cfgState.pinned.manifest).then((h) => alive && setHash(h));
    return () => {
      alive = false;
    };
  }, [cfgState.pinned, cfgState.rows, c.v.Release_Manifest_JSON]);
  const writing = useRef(false);
  useEffect(() => {
    const todo = (hash?.mismatches ?? []).filter((m) => !recordedMismatch.has(`${c._id}|${m.configKey}`));
    if (!todo.length || writing.current) return;
    writing.current = true;
    for (const m of todo) recordedMismatch.add(`${c._id}|${m.configKey}`);
    void actions
      .writeAudit({ category: "Configuration", actionCode: "config.hash.mismatch", caseCode: c.caseCode, cycleNo: c.cycleNo, caseItemId: c._id, objectKind: "Configuration", objectKey: todo.map((m) => m.configKey).join(","), configKeys: todo.map((m) => m.configKey).join(","), oldValueText: todo.map((m) => `${m.configKey}: ${m.expected}`).join("\n"), newValueText: todo.map((m) => `${m.configKey}: ${m.actual}`).join("\n"), eventReason: "Content hash differs from the case's manifest copy at the scope check." })
      .then(() => setHashEvent("The mismatch is recorded in the audit log."))
      .catch((e) => {
        for (const m of todo) recordedMismatch.delete(`${c._id}|${m.configKey}`);
        setHashEvent(`The mismatch could not be recorded: ${e instanceof Error ? e.message : String(e)}`);
      })
      .finally(() => (writing.current = false));
  }, [hash, actions, c]);

  // Rows created by this panel count as existing until the bundle re-reads them (createFormRow does not trigger a
  // reload), so a second Save scope never creates them twice.
  const created = useRef<{ runs: string[]; sections: string[] }>({ runs: [], sections: [] });
  const existing = useMemo(() => {
    const runKeys = new Set(b.runs.map((r) => r.runKey));
    const secKeys = new Set(b.sections.map((x) => x.sectionItemKey));
    return {
      runs: [...b.runs, ...created.current.runs.filter((k) => !runKeys.has(k)).map((k) => ({ runKey: k }) as (typeof b.runs)[number])],
      sections: [...b.sections, ...created.current.sections.filter((k) => !secKeys.has(k)).map((k) => ({ sectionItemKey: k }) as (typeof b.sections)[number])],
      complete: b.quality.runs === "form" && b.quality.sections === "form",
    };
  }, [b, created.current.runs.length, created.current.sections.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const recorded = useMemo(() => {
    const r = b.runs.find((x) => x.runKey === initialRunKey(c));
    return r ? parseRecordedScope(r.resultJson) : null;
  }, [b.runs, c]);
  const runExists = b.runs.some((x) => x.runKey === initialRunKey(c));
  const ctx = useMemo(() => ({ existingSectionKeys: new Set(b.sections.map((s) => s.sectionKey)), activeDepts: new Set(DEPTS.filter((d) => c.lanes[d].active)) }), [b.sections, c]);
  const [choices, setChoices] = useState<ScopeChoices>({ applicability: {}, justification: {}, deptOn: {}, deptReason: "" });
  const result = useMemo(() => (cfg ? (recorded ? scopeFromRecorded(recorded, cfg, ctx) : buildScope(cfg, choices, ctx)) : null), [cfg, recorded, choices, ctx]);

  const texts = cfg?.texts ?? {};
  const [t, setT] = useState<S2Texts | null>(null);
  useEffect(() => {
    if (!cfg || t) return;
    const ck = String(c.v.Completeness_Text_Key ?? "") || defaultTextKey(cfg.texts, /complet/i);
    const fk = String(c.v.Final_Release_Text_Key ?? "") || defaultTextKey(cfg.texts, /final|release/i);
    const xk = defaultTextKey(cfg.texts, /clos/i);
    setT({
      completenessTextKey: ck in cfg.texts ? ck : "__manual",
      completenessText: String(c.v.Completeness_Declaration_Text ?? "") || cfg.texts[ck] || "",
      completenessDue: String(c.v.Completeness_Due_Date ?? "") || addDays(now, cfg.settings.defaultSupplierDueDays),
      finalTextKey: fk in cfg.texts ? fk : "__manual",
      finalText: String(c.v.Final_Release_Declaration_Text ?? "") || cfg.texts[fk] || "",
      finalDue: String(c.v.Final_Release_Due_Date ?? ""),
      closingText: String(c.v.Supplier_Closing_Text ?? "") || cfg.texts[xk] || "",
      confirmContactIds: c.confirmContactIds,
      supplierContactEmails: c.supplierContactEmails,
    });
  }, [cfg, t, c, now]);

  const [log, setLog] = useState<SaveScopeLog | null>(null);
  /** True once the scope (rows + case fields) is saved, by the Workbench or in the Kissflow form after a K-WB refusal;
   *  any change of an input makes it false again. Submit saves first only when it is false. */
  const [savedSig, setSavedSig] = useState<string | null>(null);
  const sig = JSON.stringify([choices, t, OPTIONAL.map((k) => pv.values[k] ?? null)]);
  const saved = savedSig === sig;
  const [result2, setResult2] = useState<PanelResult>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const blocked = !!hash?.mismatches.length;

  if (!c.releaseItemId) return <ActionBanner result={{ ok: false, message: "This case has no pinned release (Release item id is blank), so the scope cannot be built." }} />;
  if (cfgState.loading && !cfg) return <LoadingCard label="Loading the pinned configuration…" />;
  if (!cfg) return <ActionBanner result={{ ok: false, message: cfgState.error ?? "The pinned release of this case could not be read with your access." }} />;
  if (!result || !t) return <LoadingCard label="Preparing the scope…" />;

  const have = new Set(b.sections.map((s) => s.sectionItemKey));
  const rowProblems = buildSectionRows(c, result, initialRunKey(c))
    .filter((r) => r.problem && !have.has(r.key))
    .map((r) => ({ label: "Section definition", message: r.problem! }));
  const allProblems = (): Problem[] => [...cfg.problems.map((m) => ({ label: "Configuration", message: m })), ...result.problems, ...rowProblems, ...s2TextProblems(t)];

  const doSave = async (): Promise<SaveScopeLog | null> => {
    const ps = allProblems();
    if (blocked) ps.unshift({ label: "Configuration", message: "The pinned configuration does not match the case's manifest copy; the scope check is blocked." });
    setProblems(ps);
    if (ps.length) return null;
    const inputJson = scopeInputJson(c, cfg);
    let inputHash = "";
    try {
      inputHash = await sha256Hex(inputJson);
    } catch {
      inputHash = "";
    }
    const runRow = runExists ? null : buildRunRow({ c, result, deptReason: choices.deptReason, inputJson, inputHash, me, now: new Date() });
    const fields = { ...pv.changed(PANEL_SET), ...buildS2Fields(c, result, t, new Date()) };
    const l = await saveScope(actions, { task, c, result, runRow, existing, s2Fields: fields });
    if (l.createdRun) created.current.runs.push(initialRunKey(c));
    created.current.sections.push(...l.createdSections);
    if (l.createdRun || l.createdSections.length) onChanged();
    setLog(l);
    if (l.save) setResult2(l.save);
    else if (!l.ok) setResult2({ ok: false, kind: "refused", message: l.message });
    if (l.save?.ok) {
      pv.clean();
      setSavedSig(sig);
    }
    return l;
  };
  const save = () =>
    run(async () => {
      try {
        await doSave();
      } catch (e) {
        setLog({ ok: false, message: e instanceof Error ? e.message : String(e), createdRun: false, createdSections: [], skippedSections: [] });
      }
    });
  const submit = () =>
    run(async () => {
      try {
        const l = saved ? log : await doSave();
        if (!saved && !l?.ok) return;
        // the rows just created count as existing for the before-submit check
        const merged = { ...existing, runs: [...existing.runs, ...created.current.runs.map((k) => ({ runKey: k }) as (typeof existing.runs)[number])], sections: [...existing.sections, ...created.current.sections.map((k) => ({ sectionItemKey: k }) as (typeof existing.sections)[number])] };
        setResult2(await actions.submitStep(task, { extraChecks: [() => scopeRowsProblems(c, result, merged)] }));
      } catch (e) {
        setResult2({ ok: false, kind: "refused", message: e instanceof Error ? e.message : String(e) });
      }
    });

  const locked = !!recorded;
  const setA = (k: string, a: Applicability) => setChoices((x) => ({ ...x, applicability: { ...x.applicability, [k]: a } }));
  const setJ = (k: string, j: string) => setChoices((x) => ({ ...x, justification: { ...x.justification, [k]: j } }));

  return (
    <PanelCard step="CASE_S2" title="Scope check" subtitle={`Manual scope check: sections can be added, never removed. Rule set version: ${ruleSetLabel(result.ruleSetVersion)}.`}>
      {blocked && (
        <div role="alert" data-testid="wb-scope-hash-mismatch" className="flex gap-2.5 rounded-lg border border-bad/40 bg-bad-soft px-4 py-3 text-[13.5px] text-ink">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden />
          <div>
            <p className="font-medium">The pinned configuration changed after this case was created. The scope check is blocked.</p>
            <ul className="mt-1 list-disc pl-5 text-ink-2">
              {hash!.mismatches.map((m) => (
                <li key={m.configKey}>{m.configKey}: content hash differs from the case's manifest copy</li>
              ))}
            </ul>
            {hashEvent && <p className="mt-1 text-ink-2">{hashEvent}</p>}
          </div>
        </div>
      )}
      {hash?.problems.map((p, i) => (
        <p key={i} className="text-[12.5px] text-ink-3">
          {p}
        </p>
      ))}
      <SubBlock title="Sections" hint={locked ? "The scope run is recorded; the table shows it. Save scope only adds missing section rows." : "Applicability per section. A section can be raised above its template default (with a justification), never lowered."} testId="wb-scope-sections">
        {locked && (
          <p className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
            <Lock size={13} aria-hidden /> Recorded in {initialRunKey(c)}.
          </p>
        )}
        <div className="relative overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-ink-3">
                <th className="px-2 py-2 font-medium">Section</th>
                <th className="px-2 py-2 font-medium">Default</th>
                <th className="px-2 py-2 font-medium">Applicability</th>
                <th className="px-2 py-2 font-medium">Lead</th>
                <th className="px-2 py-2 font-medium">Justification</th>
              </tr>
            </thead>
            <tbody>
              {result.sections.map((s) => (
                <tr key={s.sectionKey} className="border-b border-line align-top last:border-0" data-testid={`wb-scope-section-${s.sectionKey}`}>
                  <td className="px-2 py-2">
                    <span className="font-medium text-ink">{s.code}</span> <span className="text-ink-2">{s.title}</span>
                    {s.exists && (
                      <Badge tone="neutral" className="ml-1.5">
                        row exists
                      </Badge>
                    )}
                  </td>
                  <td className="px-2 py-2 text-ink-2">{s.default}</td>
                  <td className="px-2 py-2" data-testid={`wb-scope-applic-${s.sectionKey}`}>
                    {locked || applicabilityOptions(s.default, s.exists).length === 1 ? (
                      <Badge tone={s.inScope ? "brand" : "neutral"}>
                        {s.applicability}
                        {!locked && " (fixed)"}
                      </Badge>
                    ) : (
                      <Select value={s.applicability} onChange={(e) => setA(s.sectionKey, e.target.value as Applicability)} aria-label={`Applicability ${s.code}`}>
                        {applicabilityOptions(s.default, s.exists).map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </Select>
                    )}
                  </td>
                  <td className="px-2 py-2 text-ink-2">{s.lead || "—"}</td>
                  <td className="px-2 py-2">
                    {s.deviates ? locked ? <span className="text-ink-2">{s.justification}</span> : <TextInput value={choices.justification[s.sectionKey] ?? ""} onChange={(e) => setJ(s.sectionKey, e.target.value)} invalid={!s.justification} aria-label={`Justification ${s.code}`} /> : <span className="text-ink-3">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result.notes.map((n, i) => (
          <p key={i} className="text-[12.5px] text-ink-3">
            {n}
          </p>
        ))}
        <p className="text-[12.5px] text-ink-3">Basic-data answers: not checked (portal answers are not readable from the Workbench yet).</p>
      </SubBlock>
      <SubBlock title="Department review" hint="Computed from the leads of the sections in scope; RMM review follows Settings. You may add a department with a reason, never remove one." testId="wb-scope-depts">
        <div className="grid gap-1 sm:grid-cols-3">
          {DEPTS.map((d: Dept) => {
            const on = result.depts[d] === "Yes";
            const forced = result.required[d] || ctx.activeDepts.has(d) || locked;
            return (
              <div key={d} data-testid={`wb-scope-dept-${d}`} data-on={on ? "1" : "0"}>
                <Checkbox
                  checked={on}
                  disabled={forced}
                  onChange={(v) => setChoices((x) => ({ ...x, deptOn: { ...x.deptOn, [d]: v } }))}
                  label={DEPT_LABEL[d]}
                  description={result.required[d] ? (d === "RMM" ? "from Settings" : "leads a section in scope") : ctx.activeDepts.has(d) ? "already active" : result.added.includes(d) ? "added by you" : undefined}
                />
              </div>
            );
          })}
        </div>
        {!locked && result.added.length > 0 && (
          <Field label="Reason for the added departments" required>
            <TextInput value={choices.deptReason} onChange={(e) => setChoices((x) => ({ ...x, deptReason: e.target.value }))} data-testid="wb-scope-dept-reason" />
          </Field>
        )}
      </SubBlock>
      <SubBlock title="Supplier texts and due dates" hint="From the release's text bundle, or typed by hand (saved with key MANUAL-<date>).">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextChoice label="Completeness declaration" texts={texts} keyValue={t.completenessTextKey} text={t.completenessText} onKey={(k) => setT({ ...t, completenessTextKey: k, completenessText: texts[k] ?? t.completenessText })} onText={(v) => setT({ ...t, completenessText: v })} />
          <Field label="Completeness due date" required>
            <TextInput type="date" value={t.completenessDue} onChange={(e) => setT({ ...t, completenessDue: e.target.value })} />
          </Field>
          <TextChoice label="Final release declaration" texts={texts} keyValue={t.finalTextKey} text={t.finalText} onKey={(k) => setT({ ...t, finalTextKey: k, finalText: texts[k] ?? t.finalText })} onText={(v) => setT({ ...t, finalText: v })} />
          <Field label="Final release due date">
            <TextInput type="date" value={t.finalDue} onChange={(e) => setT({ ...t, finalDue: e.target.value })} />
          </Field>
          <Field label="Supplier closing text" required>
            <TextArea rows={2} value={t.closingText} onChange={(e) => setT({ ...t, closingText: e.target.value })} />
          </Field>
          <div className="space-y-4">
            <Field label="Confirm contact ids" required hint="Portal user ids of the contacts who may confirm (comma-separated).">
              <TextInput value={t.confirmContactIds} onChange={(e) => setT({ ...t, confirmContactIds: e.target.value })} />
            </Field>
            <Field label="Supplier contact e-mails" required>
              <TextInput value={t.supplierContactEmails} onChange={(e) => setT({ ...t, supplierContactEmails: e.target.value })} />
            </Field>
          </div>
        </div>
      </SubBlock>
      <SubBlock title="Other case details (optional)">
        <StepForm step="CASE_S2" values={pv.values} onChange={pv.set} held exclude={PANEL_SET} me={me} />
      </SubBlock>
      {log && <ActionBanner result={{ ok: log.ok, message: log.message, notes: [log.createdRun ? `Scope run ${initialRunKey(c)} created.` : "", log.createdSections.length ? `Section rows created: ${log.createdSections.join(", ")}.` : "", log.skippedSections.length ? `Already there: ${log.skippedSections.length} section row(s).` : ""].filter(Boolean) }} testId="wb-scope-log" />}
      <PanelOutcome
        task={task}
        c={c}
        problems={problems}
        result={result2}
        onResolved={() => {
          // the case fields were saved in the Kissflow form; the rows were created before the refused write
          pv.clean();
          setSavedSig(sig);
          onChanged();
        }}
      />
      <PanelButtons busy={busy} onSave={save} saveLabel="Save scope" onSubmit={submit} submitLabel="Save scope and submit" saveDisabled={blocked}>
        <Button variant="ghost" size="sm" onClick={() => cfgState.reload()} disabled={busy}>
          Reload configuration
        </Button>
      </PanelButtons>
    </PanelCard>
  );
}

function TextChoice({ label, texts, keyValue, text, onKey, onText }: { label: string; texts: Record<string, string>; keyValue: string; text: string; onKey(k: string): void; onText(v: string): void }) {
  return (
    <div className="space-y-2">
      <Field label={`${label}: text`} required>
        <Select value={keyValue} onChange={(e) => onKey(e.target.value)} aria-label={`${label} text key`}>
          {Object.keys(texts).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
          <option value="__manual">Manual text (key MANUAL-&lt;date&gt;)</option>
        </Select>
      </Field>
      <TextArea rows={2} value={text} onChange={(e) => onText(e.target.value)} readOnly={keyValue !== "__manual"} aria-label={label} />
    </div>
  );
}
