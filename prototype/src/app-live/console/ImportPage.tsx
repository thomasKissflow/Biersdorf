// Import a file into a form of CIQ Digital (26 Oct; the rules are console/importRows.ts): choose the form (its natural
// key is shown), choose a .json or .xlsx file, look at how its columns map to field ids and what each row will do, then
// import. Rows go one at a time, each read back in full and compared field by field; the result is shown per row. The
// form's rows are read again right before the first create, so a row added meanwhile is skipped too. 26 Oct: the form's
// rows are the session's list (session.ts: read once, shared with the overview and the form's page); that fresh read
// and each created row's read-back go into it, so nothing is read again after the import.
// Phones (< 768 px, Thomas 30 Oct): an import changes the data, so the page only says to use a larger screen.
import { FileUp, Square, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Mono, PageHeader, Select, Table, Td, Tr, cx, type Tone } from "@/components/ui";
import { errorText } from "@/portal/kf/sdk";
import { useIsPhone } from "@/shell/useLayoutMode";
import type { FormKey } from "../types";
import { CONSOLE_FORMS, FLOW_LABEL, FLOW_NAME, KEY_FIELD } from "./common";
import { useDataConsole } from "./ConsoleContext";
import { useFlowList } from "./session";
import { importSummary, keyOf, planImport, readImportFile, rowsFingerprint, runImport, SKIP_WHY, type ImportSource, type Outcome, type PlanStatus, type RowPlan, type RowResult } from "./importRows";

const STATUS: Record<PlanStatus, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "info" },
  exists: { label: "Already in the form", tone: "neutral" },
  duplicate: { label: "Twice in the file", tone: "warn" },
  "no-key": { label: "No key", tone: "bad" },
};
const OUTCOME: Record<Outcome, { label: string; tone: Tone }> = {
  created: { label: "Created and verified", tone: "ok" },
  differs: { label: "Created, differs", tone: "warn" },
  skipped: { label: "Skipped", tone: "neutral" },
  failed: { label: "Failed", tone: "bad" },
  "not-run": { label: "Not sent", tone: "neutral" },
};

interface Loaded {
  name: string;
  source: ImportSource;
  fingerprint: string;
}

export function ImportPage() {
  const { client, session, changed } = useDataConsole();
  const [form, setForm] = useState<FormKey>("config");
  const existing = useFlowList(session, form);
  const readFailed = !!existing.error && !existing.rows;
  const [file, setFile] = useState<Loaded | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const stop = useRef(false);
  const phone = useIsPhone();
  const keyField = KEY_FIELD[form];
  // a run's rows show below the preview: bring them into view when it starts
  const resultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (running) resultsRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [running]);

  const plans = useMemo<RowPlan[]>(() => (file ? planImport(file.source.rows, keyField, (existing.rows ?? []).map((r) => keyOf(r, keyField))) : []), [file, keyField, existing.rows]);
  const count = (s: PlanStatus) => plans.filter((p) => p.status === s).length;

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // the same file can be picked again
    if (!f) return;
    setFile(null);
    setFileError(null);
    setResults(null);
    setRunError(null);
    setReading(true);
    try {
      const source = await readImportFile(f.name, new Uint8Array(await f.arrayBuffer()));
      setFile({ name: f.name, source, fingerprint: await rowsFingerprint(source.rows) });
    } catch (err) {
      setFileError(errorText(err));
    } finally {
      setReading(false);
    }
  };

  const run = async () => {
    if (!file) return;
    stop.current = false;
    setRunning(true);
    setResults([]);
    setRunError(null);
    try {
      // the form's rows again, right before the first create: a row another session added meanwhile is skipped too
      const fresh = await client.formList(form);
      session.setRows(form, fresh);
      const plan = planImport(file.source.rows, keyField, fresh.map((r) => keyOf(r, keyField)));
      setTotal(plan.filter((p) => p.status === "new").length);
      await runImport(client, form, plan, {
        onRow: (r) => {
          if (r.item) session.putRow(form, r.item); // the created row as read back: the list needs no read
          setResults((rs) => [...(rs ?? []), r]);
        },
        stop: () => stop.current,
      });
    } catch (err) {
      setRunError(errorText(err));
    } finally {
      changed();
      setRunning(false);
    }
  };

  const done = results?.filter((r) => r.outcome !== "skipped").length ?? 0;
  const newRows = count("new");
  const header = <PageHeader eyebrow="Data console" title="Import a file" subtitle="Rows of a .json or .xlsx file into one form, created one at a time; each is read back and compared field by field." />;
  if (phone && !running)
    return (
      <div className="space-y-5" data-testid="data-import">
        {header}
        <Card>
          <EmptyState icon={<Upload size={20} />} title="Import on a larger screen" data-testid="import-larger-screen">
            Choosing a file, checking how its columns and rows map and importing them needs a larger screen.
          </EmptyState>
        </Card>
      </div>
    );
  return (
    <div className="space-y-5" data-testid="data-import">
      {header}
      <Card>
        <CardHeader title="1. The form" subtitle={`Rows are matched by ${keyField}: a row whose ${keyField} the form already holds is skipped.`} />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-[minmax(0,320px)_1fr] sm:items-end">
          <Field label="Import into">
            <Select
              value={form}
              disabled={running}
              onChange={(e) => {
                setForm(e.target.value as FormKey);
                setResults(null);
              }}
              data-testid="import-form"
            >
              {CONSOLE_FORMS.map((f) => (
                <option key={f} value={f}>
                  {FLOW_LABEL[f]} ({FLOW_NAME[f]})
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-[13px] text-ink-2" data-testid="import-existing">
            {existing.loading ? "Reading the form's rows…" : readFailed ? <span className="text-bad">Could not read the form: {existing.error}</span> : `${FLOW_NAME[form]} holds ${existing.rows?.length ?? 0} row${existing.rows?.length === 1 ? "" : "s"} now. Key: `}
            {!existing.loading && !readFailed && <Mono>{keyField}</Mono>}
          </p>
        </div>
      </Card>
      <Card>
        <CardHeader title="2. The file" subtitle="JSON: an array of rows keyed by field id. Excel: the first sheet, a header row of field labels (Config Key) or ids (Config_Key)." />
        <div className="px-5 pb-5">
          <label className={cx("flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-3 text-[13px] text-ink-2", (running || reading) && "pointer-events-none opacity-60")}>
            <Upload size={15} className="text-brand" />
            <span>
              <span className="font-medium text-brand">{file ? "Choose another file" : "Choose a file"}</span> (.json or .xlsx)
            </span>
            <input type="file" accept=".json,.xlsx,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => void pick(e)} data-testid="import-file" />
          </label>
          {reading && <p className="mt-2 text-[13px] text-ink-3">Reading the file…</p>}
          {fileError && (
            <p className="mt-2 text-[13px] text-bad" role="alert" data-testid="import-file-error">
              {fileError}
            </p>
          )}
          {file && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-2" data-testid="import-file-summary">
              <FileUp size={14} className="text-ink-3" />
              <span className="font-medium text-ink">{file.name}</span>
              <span>
                {file.source.kind === "xlsx" ? `sheet “${file.source.sheet}”, ` : ""}
                {file.source.rows.length} row{file.source.rows.length === 1 ? "" : "s"}, {file.source.columns.filter((c) => c.field).length} of {file.source.columns.length} columns imported
              </span>
            </p>
          )}
          {file?.source.notes.map((n) => (
            <p key={n} className="mt-1 text-[12.5px] text-ink-3">
              {n}
            </p>
          ))}
        </div>
      </Card>
      {file && (
        <Card data-testid="import-mapping">
          <CardHeader title="3. Columns → fields" subtitle="A label's field id is the label with its spaces replaced by underscores." />
          <Table head={["Column in the file", "Field id", "Note"]} dense>
            {file.source.columns.map((c, i) => (
              <Tr key={`${i}-${c.header}`}>
                <Td>{c.header || <span className="text-ink-3">(empty)</span>}</Td>
                <Td>{c.field ? <Mono>{c.field}</Mono> : <Badge>Not imported</Badge>}</Td>
                <Td className="text-ink-3">{c.note ?? ""}</Td>
              </Tr>
            ))}
          </Table>
        </Card>
      )}
      {file && (
        <Card data-testid="import-preview" data-rows={file.source.rows.length} data-rows-sha={file.fingerprint}>
          <CardHeader
            title="4. The rows"
            subtitle={`${plans.length} rows: ${newRows} new, ${count("exists")} already in the form, ${count("duplicate")} twice in the file, ${count("no-key")} without a key.`}
            action={
              <div className="flex items-center gap-2">
                {running && (
                  <Button variant="ghost" icon={<Square size={14} />} onClick={() => (stop.current = true)} data-testid="import-stop">
                    Stop after this row
                  </Button>
                )}
                <Button variant="primary" disabled={running || existing.loading || readFailed || newRows === 0} onClick={() => void run()} data-testid="import-run">
                  {running ? `Creating row ${Math.min(done + 1, total)} of ${total}…` : `Import ${newRows} new row${newRows === 1 ? "" : "s"}`}
                </Button>
              </div>
            }
          />
          <p className="px-5 pb-2 text-[12px] text-ink-3">
            Fingerprint of the file's rows (SHA-256): <Mono>{file.fingerprint.slice(0, 16)}</Mono>
          </p>
          <Table head={["#", keyField, "Fields", "Plan"]} dense>
            {plans.map((p) => (
              <Tr key={p.n} data-testid={`import-plan-${p.n}`} data-status={p.status}>
                <Td>{p.n}</Td>
                <Td>{p.key ? <Mono>{p.key}</Mono> : "—"}</Td>
                <Td>{Object.keys(p.data).length}</Td>
                <Td>
                  <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                  {p.status !== "new" && <span className="ml-2 text-[12px] text-ink-3">{SKIP_WHY[p.status]}</span>}
                </Td>
              </Tr>
            ))}
          </Table>
        </Card>
      )}
      {(results || runError) && (
        <div ref={resultsRef} className="scroll-mt-4">
          <Card data-testid="import-results">
            <CardHeader title="5. Result" subtitle={results ? importSummary(results) : undefined} />
            {runError && (
              <p className="px-5 pb-3 text-[13px] text-bad" role="alert">
                {runError}
              </p>
            )}
            <p className="sr-only" data-testid="import-summary">
              {results ? importSummary(results) : ""}
            </p>
            {results && results.length > 0 ? (
              <Table head={["#", keyField, "Result", "Item id", "Detail"]} dense>
                {results.map((r) => (
                  <Tr key={r.n} data-testid={`import-result-${r.n}`} data-outcome={r.outcome}>
                    <Td>{r.n}</Td>
                    <Td>{r.key ? <Mono>{r.key}</Mono> : "—"}</Td>
                    <Td>
                      <Badge tone={OUTCOME[r.outcome].tone}>{OUTCOME[r.outcome].label}</Badge>
                    </Td>
                    <Td>{r.id ? <Mono>{r.id}</Mono> : "—"}</Td>
                    <Td className="max-w-[420px] text-[12px] text-ink-3 [overflow-wrap:anywhere]">
                      {r.diffs?.length ? `Differs: ${r.diffs.map((d) => `${d.field} (file ${d.sent} chars, Kissflow ${d.back})`).join("; ")}` : r.outcome === "created" ? `${Object.keys(plans.find((p) => p.n === r.n)?.data ?? {}).length} fields match` : (r.reason ?? "")}
                    </Td>
                  </Tr>
                ))}
              </Table>
            ) : (
              !runError && <EmptyState title="Starting…" />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
