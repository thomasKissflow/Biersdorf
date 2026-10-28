// One input per field type and list (§8.5). Computed fields never get an input (StepForm filters them; this
// component refuses them too). User fields have no picker (there is no user-search API): "Me" sets the signed-in user.
import { Field, TextArea, TextInput } from "@/components/ui/form";
import { Button } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";
import { childTableDef, fieldDef, listValues as listValuesOf, type ChildTableId, type FieldDef, type FlowId } from "../schema";
import { displayValue, kfDateTime, toLocalInput } from "../data/normalize";
import type { Me } from "../data/runtime";

export interface FieldInputProps {
  flow: FlowId;
  field: string;
  /** For a child-table column. */
  table?: ChildTableId;
  value: unknown;
  onChange(v: unknown): void;
  disabled?: boolean;
  invalid?: boolean;
  me?: Me;
  id?: string;
  /** Override the list values (e.g. flags-filtered options). */
  options?: string[];
}

export function fieldDefOf(flow: FlowId, field: string, table?: ChildTableId): FieldDef | undefined {
  return table ? childTableDef(table).fields[field] : fieldDef(flow, field);
}

export function FieldInput({ flow, field, table, value, onChange, disabled, invalid, me, id, options }: FieldInputProps) {
  const def = fieldDefOf(flow, field, table);
  if (!def) return <span className="text-bad">Unknown field {field}</span>;
  if (def.computed) return <span className="text-ink-3">{displayValue(value) || "—"} (computed)</span>;
  const testId = `wb-field-${field}`;
  const str = value === null || value === undefined ? "" : typeof value === "object" ? displayValue(value) : String(value);
  switch (def.type) {
    case "Textarea":
      return <TextArea id={id} data-testid={testId} value={str} rows={3} disabled={disabled} invalid={invalid} onChange={(e) => onChange(e.target.value)} />;
    case "Number":
      return <TextInput id={id} data-testid={testId} type="number" value={str} disabled={disabled} invalid={invalid} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
    case "Date":
      return <TextInput id={id} data-testid={testId} type="date" value={str.slice(0, 10)} disabled={disabled} invalid={invalid} onChange={(e) => onChange(e.target.value || null)} />;
    case "DateTime": {
      const d = str ? new Date(str) : null;
      return (
        <TextInput
          id={id}
          data-testid={testId}
          type="datetime-local"
          value={d && !isNaN(d.getTime()) ? toLocalInput(d) : ""}
          disabled={disabled}
          invalid={invalid}
          onChange={(e) => onChange(e.target.value ? kfDateTime(new Date(e.target.value)) : null)}
        />
      );
    }
    case "Email":
      return <TextInput id={id} data-testid={testId} type="email" value={str} disabled={disabled} invalid={invalid} onChange={(e) => onChange(e.target.value)} />;
    case "Select": {
      const opts = options ?? (def.list ? listValuesOf(def.list) : []);
      return (
        <Select id={id} value={str} disabled={disabled} invalid={invalid} onChange={(e) => onChange(e.target.value || null)} aria-label={def.name}>
          <option value="">Select…</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
    }
    case "User":
      return (
        <div className="flex items-center gap-2" data-testid={testId}>
          <TextInput id={id} value={str} readOnly disabled className="flex-1" />
          {me && !disabled && (
            <Button size="sm" onClick={() => onChange({ _id: me._id, Name: me.Name })}>
              Me
            </Button>
          )}
        </div>
      );
    case "Reference":
    case "Attachment":
      return <TextInput id={id} data-testid={testId} value={str} readOnly disabled />;
    default:
      return <TextInput id={id} data-testid={testId} value={str} disabled={disabled} invalid={invalid} onChange={(e) => onChange(e.target.value)} />;
  }
}


/** A labelled FieldInput. */
export function FieldRow(p: FieldInputProps & { required?: boolean; hint?: string; error?: string }) {
  const def = fieldDefOf(p.flow, p.field, p.table);
  return (
    <Field label={def?.name ?? p.field} required={p.required} hint={p.hint} error={p.error}>
      <FieldInput {...p} />
    </Field>
  );
}
