// The step form (§8.5): inputs ONLY for mandatoryAt(step) and editableAt(step) (writable fields; never a computed
// field), by type and list; gate fields (gateFieldsAt) shown READ-ONLY with the server value and the client mirror's
// explanation. Actions are enabled only for a held task (ground rule 13). stepFormModel is pure (unit-tested for every
// step); StepForm is a thin render over it.
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { editableAt, fieldDef, gateFieldsAt, isChildTable, isComputed, listOf, mandatoryAt, stepDef, type FieldType, type FlowId, type StepIr } from "../schema";
import { explainGate } from "../data/gates";
import type { Me } from "../data/runtime";
import { FieldRow } from "./FieldInput";

export interface StepFormInput {
  field: string;
  label: string;
  type: FieldType;
  list: string[];
  required: boolean;
}
export interface StepFormGate {
  field: string;
  label: string;
  value: string;
  ok: boolean;
  explanation: string;
}
export interface StepFormModel {
  step: StepIr;
  flow: FlowId;
  title: string;
  inputs: StepFormInput[];
  /** Child tables writable at the step (rendered by the feature, not here). */
  tables: string[];
  gates: StepFormGate[];
}

export function stepFormModel(step: StepIr, values: Record<string, unknown> = {}, o: { only?: string[]; exclude?: string[] } = {}): StepFormModel {
  const s = stepDef(step);
  const keep = (k: string) => (!o.only || o.only.includes(k)) && !o.exclude?.includes(k);
  const mand = mandatoryAt(step);
  const keys = [...mand, ...editableAt(step)].filter(keep);
  const inputs: StepFormInput[] = [];
  const tables: string[] = [];
  for (const k of keys) {
    if (isChildTable(s.flow, k)) {
      tables.push(k);
      continue;
    }
    if (isComputed(s.flow, k)) continue; // belt and braces: permsAt never holds one
    const def = fieldDef(s.flow, k)!;
    inputs.push({ field: k, label: def.name, type: def.type, list: listOf(s.flow, k), required: mand.includes(k) });
  }
  const gates = gateFieldsAt(step).map((g) => {
    const value = values[g] === null || values[g] === undefined ? "" : String(values[g]);
    return { field: g, label: fieldDef(s.flow, g)?.name ?? g, value, ok: value === "OK", explanation: value === "OK" ? "" : explainGate(s.flow, g, values) };
  });
  return { step, flow: s.flow, title: s.name, inputs, tables, gates };
}

export function GateList({ gates }: { gates: StepFormGate[] }) {
  if (!gates.length) return null;
  return (
    <ul className="space-y-1.5" data-testid="wb-gates">
      {gates.map((g) => (
        <li key={g.field} className="flex flex-wrap items-center gap-2 text-[13px]" data-testid={`wb-gate-${g.field}`}>
          <Lock size={13} className="text-ink-3" aria-hidden />
          <span className="font-medium text-ink">{g.label}</span>
          <Badge tone={g.ok ? "ok" : "warn"}>{g.ok ? "OK" : g.value || "blank"}</Badge>
          {!g.ok && g.explanation && <span className="text-ink-2">{g.explanation}</span>}
        </li>
      ))}
    </ul>
  );
}

export function StepForm({
  step,
  values,
  onChange,
  held,
  only,
  exclude,
  me,
  errors = {},
}: {
  step: StepIr;
  values: Record<string, unknown>;
  onChange(field: string, v: unknown): void;
  /** True when the user holds the task at this step (ground rule 13). */
  held: boolean;
  only?: string[];
  exclude?: string[];
  me?: Me;
  errors?: Record<string, string>;
}) {
  const m = stepFormModel(step, values, { only, exclude });
  return (
    <div className="space-y-4" data-testid={`wb-step-${step}`}>
      {!held && <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2">You don't hold this task.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {m.inputs.map((i) => (
          <FieldRow key={i.field} flow={m.flow} field={i.field} value={values[i.field]} onChange={(v) => onChange(i.field, v)} disabled={!held} required={i.required} me={me} error={errors[i.field]} />
        ))}
      </div>
      <GateList gates={m.gates} />
    </div>
  );
}
