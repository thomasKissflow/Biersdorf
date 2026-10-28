// The data console drawer's pieces (ItemDrawer): one field shown or edited by its kind (console/fields.ts), and a child
// table shown or edited row by row. JSON shows pretty-printed; it is edited as the text Kissflow holds, and checked.
import { Plus } from "lucide-react";
import { Badge, Button, Field, Mono, Table, TextArea, TextInput, Td, Tr, cx } from "@/components/ui";
import { editText, jsonProblem, showText, type FieldKind, type Row, type RowDraft } from "./fields";

const LONG = 80;

export function FieldView({ id, value, kind }: { id: string; value: unknown; kind: FieldKind }) {
  const text = showText(value);
  return (
    <div data-testid={`data-view-${id}`}>
      <div className="flex items-center gap-2 text-[12px] font-medium text-ink-3">
        <Mono>{id}</Mono>
        {kind === "formula" && <Badge tone="violet">Formula</Badge>}
        {kind === "json-text" && text && <Badge>JSON</Badge>}
      </div>
      <pre className="mt-0.5 max-h-60 overflow-auto rounded-md bg-surface-2 px-3 py-2 text-[12px] whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{text || "—"}</pre>
    </div>
  );
}

export function FieldEditor({ id, value, kind, text, onChange }: { id: string; value: unknown; kind: FieldKind; text: string; onChange(t: string): void }) {
  if (kind === "formula") return <FieldView id={id} value={value} kind={kind} />;
  const json = kind === "json-text" || kind === "value";
  const problem = jsonProblem(text, kind);
  const changed = text !== editText(value, kind);
  const label = (
    <span className="flex items-center gap-2">
      <Mono>{id}</Mono>
      {json && <Badge>{kind === "value" ? "JSON value" : "JSON text"}</Badge>}
      {changed && <Badge tone="info">Changed</Badge>}
    </span>
  );
  const hint = kind === "value" ? "Sent as the JSON value it holds (a user is {\"_id\": …})." : kind === "json-text" ? "Sent exactly as written: the text is not reformatted." : undefined;
  return (
    <Field label={label} hint={hint} error={problem}>
      {json || text.length > LONG || text.includes("\n") ? (
        <TextArea value={text} onChange={(e) => onChange(e.target.value)} invalid={!!problem} className={cx("min-h-[90px] text-[12px]", json && "font-mono")} spellCheck={false} data-testid={`data-field-${id}`} />
      ) : (
        <TextInput value={text} onChange={(e) => onChange(e.target.value)} data-testid={`data-field-${id}`} />
      )}
    </Field>
  );
}

const cell = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function TableView({ model, rows, columns }: { model: string; rows: Row[]; columns: string[] }) {
  return (
    <div data-testid={`data-table-${model}`}>
      <div className="mb-1 flex items-center gap-2 text-[12px] font-medium text-ink-3">
        <Mono>Table::{model}</Mono>
        <span>
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      {rows.length ? (
        <div className="rounded-md border border-line">
          <Table head={["_id", ...columns]} dense>
            {rows.map((r, i) => (
              <Tr key={String(r._id ?? i)}>
                <Td className="py-1.5 text-[12px]">
                  <Mono>{cell(r._id)}</Mono>
                </Td>
                {columns.map((c) => (
                  <Td key={c} className="max-w-[260px] truncate py-1.5 text-[12px]" title={cell(r[c])}>
                    {cell(r[c]) || "—"}
                  </Td>
                ))}
              </Tr>
            ))}
          </Table>
        </div>
      ) : (
        <p className="text-[12.5px] text-ink-3">No rows.</p>
      )}
    </div>
  );
}

/** Rows are edited cell by cell and added at the end; a formula column is read-only; rows are not removed here. */
export function TableEditor({ model, columns, drafts, formulas, onChange }: { model: string; columns: string[]; drafts: RowDraft[]; formulas: readonly string[]; onChange(d: RowDraft[]): void }) {
  const set = (i: number, col: string, text: string) => onChange(drafts.map((d, j) => (j === i ? { ...d, cells: { ...d.cells, [col]: text } } : d)));
  return (
    <div data-testid={`data-table-edit-${model}`}>
      <div className="mb-1 flex items-center gap-2 text-[12px] font-medium text-ink-3">
        <Mono>Table::{model}</Mono>
        <span>Changed rows are sent by their _id, new rows as new. Rows are not removed here.</span>
      </div>
      <div className="overflow-x-auto rounded-md border border-line scrollbar-thin">
        <table className="w-full border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-line">
              <th className="px-2 py-1.5 font-medium whitespace-nowrap text-ink-3">_id</th>
              {columns.map((c) => (
                <th key={c} className="px-2 py-1.5 font-medium whitespace-nowrap text-ink-3">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drafts.map((d, i) => (
              <tr key={d.id ?? `new-${i}`} className="border-b border-line last:border-0">
                <td className="px-2 py-1 whitespace-nowrap text-ink-3">{d.id ? <Mono>{d.id}</Mono> : <Badge tone="info">New</Badge>}</td>
                {columns.map((c) => (
                  <td key={c} className="min-w-[140px] px-1 py-1">
                    <TextInput value={d.cells[c] ?? ""} disabled={formulas.includes(c)} onChange={(e) => set(i, c, e.target.value)} className="text-[12px]" aria-label={`${c}, row ${i + 1}`} data-testid={`data-cell-${model}-${i}-${c}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="ghost" size="sm" className="mt-1" icon={<Plus size={14} />} onClick={() => onChange([...drafts, { cells: Object.fromEntries(columns.map((c) => [c, ""])) }])} data-testid={`data-add-row-${model}`}>
        Add a row
      </Button>
    </div>
  );
}
