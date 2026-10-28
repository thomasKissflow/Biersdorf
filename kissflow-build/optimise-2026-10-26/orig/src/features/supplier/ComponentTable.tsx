// K2.1 composition table (assumption AS-04: one row per component). Rows keep stable ids (c1, c2 …)
// because Beiersdorf questions point at a row ("K2.1 › component 2 › CAS number").
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Checkbox, IconButton, Select, Table, Td, TextInput, Tr, cx } from "@/components/ui";
import { ORIGIN_LABEL } from "@/domain/catalog";
import type { CiqCase, ComponentRow, OriginType } from "@/domain/types";
import { useStore } from "@/store/store";
import { casError, ecError } from "./cas";
import { Attribution, RequestedBadge } from "./parts";

type Draft = Omit<ComponentRow, "concMin" | "concMax"> & { concMin: string; concMax: string };

const toDraft = (r: ComponentRow): Draft => {
  const blank = !r.concMin && !r.concMax; // a freshly added row: keep the placeholders visible
  return { ...r, cas: r.cas ?? "", ec: r.ec ?? "", concMin: blank ? "" : String(r.concMin), concMax: blank ? "" : String(r.concMax) };
};
const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() === "" || !Number.isFinite(n) ? 0 : n;
};
const toRow = (d: Draft): ComponentRow => ({ id: d.id, inci: d.inci.trim(), cas: d.cas?.trim() || undefined, ec: d.ec?.trim() || undefined, fn: d.fn.trim(), additive: d.additive, origin: d.origin, concMin: num(d.concMin), concMax: num(d.concMax) });

function concError(d: Draft): string | null {
  const a = d.concMin.trim() === "" ? null : Number(d.concMin.replace(",", "."));
  const b = d.concMax.trim() === "" ? null : Number(d.concMax.replace(",", "."));
  if (a === null || b === null) return "Enter a minimum and a maximum concentration";
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "Concentrations must be numbers";
  if (a < 0 || b > 100) return "Concentrations must be between 0 and 100 %";
  if (a > b) return "The minimum is higher than the maximum";
  return null;
}

export function ComponentTable({ c, editable, requestedRows, focusRow, restrictTo }: { c: CiqCase; editable: boolean; requestedRows?: Set<string>; focusRow?: string | null; /** Live portal after submission: only these rows stay editable. */ restrictTo?: Set<string> }) {
  const { setComponents } = useStore();
  // A row Beiersdorf still has a question on cannot be removed (EC-OP-06); the domain refuses it as well.
  const askedRows = new Set(c.liveScope ? c.openPoints.filter((p) => p.status !== "closed" && p.ref.rowId).map((p) => p.ref.rowId!) : []);
  const origins: OriginType[] = c.config.SF01?.length ? c.config.SF01 : (Object.keys(ORIGIN_LABEL) as OriginType[]);
  const [rows, setRows] = useState<Draft[]>(() => c.components.map(toDraft));
  // The rows follow the stored components only when their CONTENT changes elsewhere (a colleague's save, a refused
  // save), and never over values still being typed. Comparing the array itself reset the rows after every save's
  // reload, which wiped a value typed meanwhile (e.g. the CAS number right after the INCI name; Thomas, 16 Oct).
  const incoming = JSON.stringify(c.components);
  const [seen, setSeen] = useState(incoming);
  const [dirty, setDirty] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  if (incoming !== seen) {
    setSeen(incoming);
    if (!dirty) setRows(c.components.map(toDraft));
  }

  const commit = (next: Draft[]) => {
    setRows(next);
    setDirty(false);
    const out = next.map(toRow);
    const key = JSON.stringify(out);
    setSeen(key); // our own save comes back with this content: no reset
    if (key !== incoming) setComponents(c.id, out);
  };
  const patch = (id: string, p: Partial<Draft>, now = false) => {
    const next = rows.map((r) => (r.id === id ? { ...r, ...p } : r));
    if (now) commit(next);
    else {
      setRows(next);
      setDirty(true);
    }
  };
  const add = () => {
    const n = Math.max(0, ...rows.map((r) => Number(r.id.replace(/\D/g, "")) || 0)) + 1;
    commit([...rows, { id: `c${n}`, inci: "", cas: "", ec: "", fn: "", additive: false, origin: origins[0], concMin: "", concMax: "" }]);
  };
  const remove = (id: string) => commit(rows.filter((r) => r.id !== id));

  const sumMax = rows.reduce((s, r) => s + num(r.concMax), 0);
  const sumMin = rows.reduce((s, r) => s + num(r.concMin), 0);
  const hint = rows.length === 0 ? null : sumMax < 100 ? `The maximum concentrations add up to ${round(sumMax)} %, less than 100 %. Is a component missing?` : sumMin > 100 ? `The minimum concentrations add up to ${round(sumMin)} %, more than 100 %. Please check the ranges.` : null;

  if (!editable) {
    return (
      <div className="px-5 py-4">
        <TableTitle c={c} />
        <div className="mt-2 overflow-hidden rounded-lg border border-line">
          <Table head={["#", "INCI", "CAS", "EC", "Function", "Additive", "Origin", "Concentration"]} dense>
            {c.components.map((r, i) => (
              <Tr key={r.id} className={cx(requestedRows?.has(r.id) && "bg-violet-soft/40")}>
                <Td className="text-ink-3">{i + 1}</Td>
                <Td className="font-medium">
                  {r.inci}
                  {requestedRows?.has(r.id) && <span className="ml-2"><RequestedBadge /></span>}
                </Td>
                <Td className="font-mono text-[12.5px] whitespace-nowrap">{r.cas ?? "—"}</Td>
                <Td className="font-mono text-[12.5px] whitespace-nowrap">{r.ec ?? "—"}</Td>
                <Td>{r.fn}</Td>
                <Td>{r.additive ? "Yes" : "No"}</Td>
                <Td>{ORIGIN_LABEL[r.origin]}</Td>
                <Td className="whitespace-nowrap">
                  {r.concMin}–{r.concMax} %
                </Td>
              </Tr>
            ))}
          </Table>
          {c.components.length === 0 && <p className="px-4 py-3 text-[13px] text-ink-3">No components entered.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-4">
      <TableTitle c={c} />
      <div className="mt-3 space-y-3">
        {rows.map((r, i) => {
          const t = touched.has(r.id);
          const cErr = casError(r.cas);
          const eErr = ecError(r.ec);
          const kErr = concError(r);
          const req = requestedRows?.has(r.id);
          const off = !!restrictTo && !restrictTo.has(r.id);
          return (
            <div
              key={r.id}
              id={`row-${r.id}`}
              data-testid={`q-component-${r.id}`}
              onBlur={() => {
                setTouched((s) => new Set(s).add(r.id));
                commit(rows);
              }}
              className={cx("scroll-mt-40 rounded-lg border px-3.5 pt-3 pb-3.5", req || focusRow === r.id ? "border-violet bg-violet-soft/30" : "border-line bg-surface")}
            >
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink">Component {i + 1}</span>
                  <span className="font-mono text-[11px] text-ink-3">{r.id}</span>
                  {req && <RequestedBadge />}
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <Checkbox checked={r.additive} disabled={off} onChange={(v) => patch(r.id, { additive: v }, true)} label="Additive" />
                  {!restrictTo &&
                    (askedRows.has(r.id) ? (
                      <span className="px-1 text-[11.5px] text-ink-3" title="Beiersdorf has a question on this component">
                        Asked about
                      </span>
                    ) : (
                      <IconButton label={`Remove component ${i + 1}`} onClick={() => remove(r.id)} data-testid={`q-component-remove-${r.id}`}>
                        <Trash2 size={15} />
                      </IconButton>
                    ))}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Cell label="INCI name" required error={t && !r.inci.trim() ? "Required" : null} className="sm:col-span-2 xl:col-span-1">
                  <TextInput disabled={off} value={r.inci} onChange={(e) => patch(r.id, { inci: e.target.value })} placeholder={off ? "—" : "e.g. Tocopherol"} />
                </Cell>
                <Cell label="CAS number" error={cErr}>
                  <TextInput disabled={off} className="font-mono" value={r.cas} onChange={(e) => patch(r.id, { cas: e.target.value })} placeholder={off ? "—" : "59-02-9"} invalid={!!cErr} />
                </Cell>
                <Cell label="EC number" error={eErr}>
                  <TextInput disabled={off} className="font-mono" value={r.ec} onChange={(e) => patch(r.id, { ec: e.target.value })} placeholder={off ? "—" : "200-412-2"} invalid={!!eErr} />
                </Cell>
                <Cell label="Function" required error={t && !r.fn.trim() ? "Required" : null}>
                  <TextInput disabled={off} value={r.fn} onChange={(e) => patch(r.id, { fn: e.target.value })} placeholder={off ? "—" : "e.g. antioxidant"} />
                </Cell>
                <Cell label="Origin" required>
                  <Select disabled={off} value={r.origin} onChange={(e) => patch(r.id, { origin: e.target.value as OriginType }, true)} aria-label={`Origin of component ${i + 1}`}>
                    {[...new Set([...origins, r.origin])].map((o) => (
                      <option key={o} value={o}>
                        {ORIGIN_LABEL[o]}
                      </option>
                    ))}
                  </Select>
                </Cell>
                <Cell label="Concentration in the raw material" required error={t ? kErr : null}>
                  <div className="flex items-center gap-1.5">
                    <TextInput disabled={off} inputMode="decimal" aria-label="Minimum %" value={r.concMin} onChange={(e) => patch(r.id, { concMin: e.target.value })} placeholder={off ? "—" : "min"} />
                    <span className="text-ink-3">–</span>
                    <TextInput disabled={off} inputMode="decimal" aria-label="Maximum %" value={r.concMax} onChange={(e) => patch(r.id, { concMax: e.target.value })} placeholder={off ? "—" : "max"} />
                    <span className="text-[13px] text-ink-3">%</span>
                  </div>
                </Cell>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-ink-3">No components yet. Add every component of the raw material, including additives such as antioxidants.</p>}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {restrictTo ? (
          <span className="text-[12.5px] text-ink-3">Only the component Beiersdorf asks about can be changed.</span>
        ) : (
          <Button size="sm" variant="secondary" icon={<Plus size={15} />} onClick={add} data-testid="q-component-add">
            Add component
          </Button>
        )}
        <span className="text-[12.5px] text-ink-3">
          Total: min {round(sumMin)} % · max {round(sumMax)} %
        </span>
      </div>
      {hint && (
        <p className="mt-2.5 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-ink">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
          <span>
            {hint} <span className="text-ink-3">This is a hint only and does not block your submission.</span>
          </span>
        </p>
      )}
    </div>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;

function TableTitle({ c }: { c: CiqCase }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <p className="text-[13.5px] font-medium text-ink">
          Composition<span className="ml-0.5 text-bad">*</span>
        </p>
        <p className="text-[12.5px] text-ink-3">One row per component. Origins are limited to those you selected in the {c.liveScope ? "metadata" : "basic"} questions.</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone="neutral">{c.components.length} component{c.components.length === 1 ? "" : "s"}</Badge>
        <Attribution c={c} keyId="K2.1:components" verb="Last changed" />
      </div>
    </div>
  );
}

function Cell({ label, required, error, className, children }: { label: string; required?: boolean; error?: string | null; className?: string; children: React.ReactNode }) {
  return (
    <div className={cx("min-w-0 space-y-1", className)}>
      <span className="block text-[12px] font-medium text-ink-2">
        {label}
        {required && <span className="ml-0.5 text-bad">*</span>}
      </span>
      {children}
      {error && <p className="text-[11.5px] font-medium text-bad">{error}</p>}
    </div>
  );
}
