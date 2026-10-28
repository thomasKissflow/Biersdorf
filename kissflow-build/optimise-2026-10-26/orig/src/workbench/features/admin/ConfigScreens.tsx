// §8.13 Business Admin: #/config (F2 list + release builder), #/config/:itemId and #/config/new?kind= (editor),
// #/templates (the same list filtered to Template and Section definition, with the template preview).
// Draft rows are editable; Published rows are read-only (New version = copy-on-write; Retire = WB-D6). No Delete.
// Only roles with E on CIQ_Config_Version_A00 (Business Admin) get any write control; everyone else reads.
import { Archive, Copy, FilePlus2, PackagePlus, Save, Send, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EmptyState, KeyValue, Table, Td, Tr } from "@/components/ui/data";
import { Checkbox, Field, Segmented, TextArea, TextInput } from "@/components/ui/form";
import { Badge, Button, Card, CardHeader, Mono, PageHeader, type Tone } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";
import { useFormRows, useWorkbench } from "../../data/hooks";
import type { ConfigVM, SaveResult } from "../../data/viewModels";
import { errorText } from "../../kf/sdk";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Modal } from "../../ui/overlay";
import { ReadQualityBanner } from "../../ui/ReadQualityBanner";
import { WriteOutcome } from "../../ui/WriteOutcome";
import { fmtDateTime } from "../audit/format";
import { ErrorBanner, Notice, Page, Skeleton, WarningList } from "../audit/kit";
import {
  CONFIG_FLOW,
  CONFIG_KINDS,
  MANIFEST_KINDS,
  TEMPLATE_KINDS,
  createRelease,
  draftEditPatch,
  newConfigData,
  newVersionData,
  payloadSkeleton,
  prettyJson,
  publishConfig,
  recordPublishEvent,
  retireConfig,
  splitVersion,
  templatePreview,
  validateAnnotations,
  validatePayload,
  validateSelection,
  type ReleaseInput,
  type StepOutcome,
} from "./config";
import { PayloadPreview } from "./PayloadPreview";

const STATE_TONE: Record<string, Tone> = { Draft: "warn", Published: "ok", Retired: "neutral" };
const StateBadge = ({ state }: { state: string }) => (
  <Badge tone={STATE_TONE[state] ?? "neutral"} dot>
    {state || "No state"}
  </Badge>
);

const NEW_KINDS = CONFIG_KINDS.filter((k) => k !== "Release");

// ---------------------------------------------------------------- list

function ConfigListView({ kinds, testId, title, subtitle, eyebrow, withRelease, children }: { kinds?: string[]; testId: string; title: string; subtitle: string; eyebrow: string; withRelease?: boolean; children?: React.ReactNode }) {
  const { caps } = useWorkbench();
  const canEdit = caps.canEditForm(CONFIG_FLOW);
  const rows = useFormRows<ConfigVM>(CONFIG_FLOW);
  const navigate = useNavigate();
  const [kind, setKind] = useState("");
  const [state, setState] = useState("");
  const [newKind, setNewKind] = useState(kinds?.[0] ?? "Template");
  const [releaseOpen, setReleaseOpen] = useState(false);
  const all = useMemo(() => (rows.data ?? []).filter((r) => !kinds || kinds.includes(r.kind)), [rows.data, kinds]);
  const shown = useMemo(
    () => all.filter((r) => (!kind || r.kind === kind) && (!state || r.state === state)).sort((a, b) => a.kind.localeCompare(b.kind) || a.configKey.localeCompare(b.configKey)),
    [all, kind, state],
  );
  const kindOptions = kinds ?? CONFIG_KINDS;
  return (
    <Page testId={testId}>
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} actions={canEdit ? undefined : <Badge tone="neutral">Read-only for your roles</Badge>}>
        {canEdit && (
          // In the header's text column (not its action slot), so the bar wraps on a phone instead of overflowing.
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="w-48 max-w-full">
              <Select value={newKind} onChange={(e) => setNewKind(e.target.value)} aria-label="Kind of the new configuration">
                {(kinds ?? NEW_KINDS).filter((k) => k !== "Release").map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </div>
            <Button icon={<FilePlus2 size={15} />} onClick={() => navigate(`/config/new?kind=${encodeURIComponent(newKind)}`)} data-testid="wb-config-new">
              New draft
            </Button>
            {withRelease && (
              <Button variant="primary" icon={<PackagePlus size={15} />} onClick={() => setReleaseOpen(true)} data-testid="wb-release-new">
                New release
              </Button>
            )}
          </div>
        )}
      </PageHeader>
      <ErrorBanner error={rows.error} onRetry={rows.reload} />
      <ReadQualityBanner quality={rows.quality} what="Configuration" />
      <WarningList warnings={rows.warnings} />
      {children}
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <div className="w-56" data-testid="wb-config-filter-kind">
            <Field label="Kind">
              <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by kind">
                <option value="">All kinds</option>
                {kindOptions.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-44" data-testid="wb-config-filter-state">
            <Field label="State">
              <Select value={state} onChange={(e) => setState(e.target.value)} aria-label="Filter by state">
                <option value="">All states</option>
                {["Draft", "Published", "Retired"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <span className="ml-auto text-[13px] text-ink-3">
            <span className="font-semibold text-ink">{shown.length}</span> of {all.length}
          </span>
        </div>
        {rows.loading && !rows.data ? (
          <Skeleton rows={5} bare />
        ) : !shown.length ? (
          <EmptyState title={all.length ? "No configuration matches these filters" : "No configuration yet"}>{canEdit && !all.length ? "Start with a Template and its Section definitions, then build a release." : undefined}</EmptyState>
        ) : (
          <Table head={["Config key", "Kind", "Version", "State", "Section", "Release", "Published"]} dense>
            {shown.map((r) => (
              <Tr key={r._id} onClick={() => navigate(`/config/${r._id}`)}>
                <Td>
                  <Link to={`/config/${r._id}`} className="text-brand hover:underline" data-testid={`wb-config-row-${r._id}`} onClick={(e) => e.stopPropagation()}>
                    <Mono>{r.configKey}</Mono>
                  </Link>
                </Td>
                <Td>{r.kind}</Td>
                {/* tablet check: version, section and release codes never break inside (v1-draft, REL-20261001-1) */}
                <Td className="whitespace-nowrap">{r.versionLabel || "—"}</Td>
                <Td>
                  <StateBadge state={r.state} />
                </Td>
                <Td className="whitespace-nowrap text-ink-2">{r.sectionKey ? `${r.sectionKey}${r.sectionRev !== null ? ` · r${r.sectionRev}` : ""}` : "—"}</Td>
                <Td className="whitespace-nowrap text-ink-2">{r.releaseKey ? `${r.releaseKey}${r.releaseStage ? ` · ${r.releaseStage}` : ""}` : "—"}</Td>
                <Td className="whitespace-nowrap text-ink-2">
                  {r.publishedAt ? fmtDateTime(r.publishedAt) : "—"}
                  {r.publishedBy?.name ? ` · ${r.publishedBy.name}` : ""}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
      {withRelease && releaseOpen && <ReleaseBuilder rows={rows.data ?? []} onClose={() => setReleaseOpen(false)} onDone={() => rows.reload()} />}
    </Page>
  );
}

export function ConfigList() {
  return <ConfigListView testId="wb-config" eyebrow="Configuration" title="Configuration versions" subtitle="Templates, section definitions, ownership, RMES criteria, texts and settings. Drafts are edited; published versions never change." withRelease />;
}

export function Templates() {
  const rows = useFormRows<ConfigVM>(CONFIG_FLOW);
  const preview = useMemo(() => templatePreview(rows.data ?? []), [rows.data]);
  return (
    <ConfigListView kinds={TEMPLATE_KINDS} testId="wb-templates" eyebrow="Configuration" title="Section templates" subtitle="The questionnaire template (section order and defaults) and the section definitions it uses.">
      <Card data-testid="wb-templates-preview">
        <CardHeader title="Current template" subtitle={preview ? `${preview.template.configKey} · ${preview.template.versionLabel || "no label"} · published ${fmtDateTime(preview.template.publishedAt)}` : "No Template is published yet."} />
        {preview && (
          <ol className="divide-y divide-line">
            {preview.sections.map((s, i) => (
              <li key={`${s.sectionKey}-${i}`} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
                  <span className="w-6 text-right text-ink-3">{i + 1}.</span>
                  <Mono>{s.sectionKey}</Mono>
                  <span className="font-medium text-ink">{s.defined ? `${s.code} · ${s.title}` : "No published definition"}</span>
                  <Badge tone={s.default === "Mandatory" ? "brand" : s.default === "Optional" ? "info" : "neutral"}>{s.default}</Badge>
                </div>
                {s.fields.length > 0 && (
                  <p className="mt-1 pl-8 text-[12.5px] text-ink-2">
                    {s.fields.map((f) => `${f.label}${f.required ? " *" : ""}`).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </ConfigListView>
  );
}

// ---------------------------------------------------------------- outcomes

function Outcome({ o, row, onRetryAudit, okMessage = "Saved and checked." }: { o: StepOutcome | null; row?: ConfigVM; onRetryAudit?: () => void; okMessage?: string }) {
  if (!o) return null;
  return (
    <div className="space-y-2">
      {o.refused && (
        <Notice tone="bad" testId="wb-config-refused">
          {o.refused}
        </Notice>
      )}
      <WriteOutcome result={o.save ?? null} flow={CONFIG_FLOW} itemId={row?._id} okMessage={okMessage} />
      {o.audit?.ok === true && (
        <Notice tone="ok" testId="wb-config-audit-ok">
          Recorded in the audit log.
        </Notice>
      )}
      {o.audit?.ok === false && o.save?.ok && (
        <Notice tone="warn" testId="wb-config-audit-failed">
          The change was saved, but the audit event was not recorded ({o.audit.message}).{" "}
          {onRetryAudit && (
            <button className="font-medium text-brand underline" onClick={onRetryAudit}>
              Record it again
            </button>
          )}
        </Notice>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- editor

export function ConfigEdit() {
  const { itemId } = useParams();
  const [sp] = useSearchParams();
  return itemId ? <ExistingConfig id={itemId} /> : <NewConfig kind={sp.get("kind") ?? ""} />;
}

function JsonEditor({ label, value, onChange, disabled, error, testId, rows = 14, onPretty }: { label: string; value: string; onChange(v: string): void; disabled?: boolean; error?: string | null; testId: string; rows?: number; onPretty?: () => void }) {
  return (
    <Field
      label={label}
      error={error ?? undefined}
      aside={
        onPretty && !disabled ? (
          <Button size="sm" variant="ghost" icon={<Wand2 size={13} />} onClick={onPretty}>
            Pretty-print
          </Button>
        ) : undefined
      }
    >
      <TextArea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} disabled={disabled} invalid={!!error} spellCheck={false} className="font-mono text-[12.5px]" data-testid={testId} />
    </Field>
  );
}

function NewConfig({ kind: kindIn }: { kind: string }) {
  const { caps, actions, notify } = useWorkbench();
  const canEdit = caps.canEditForm(CONFIG_FLOW);
  const rows = useFormRows<ConfigVM>(CONFIG_FLOW);
  const navigate = useNavigate();
  const [kind, setKind] = useState(NEW_KINDS.includes(kindIn) ? kindIn : "Template");
  const [name, setName] = useState("main");
  const [payload, setPayload] = useState(() => payloadSkeleton(NEW_KINDS.includes(kindIn) ? kindIn : "Template"));
  const [touched, setTouched] = useState(false);
  const [versionLabel, setVersionLabel] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [annotations, setAnnotations] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const v = validatePayload(kind, payload);
  const annErr = validateAnnotations(annotations);
  const keyPreview = useMemo(() => {
    try {
      return v.ok ? String(newConfigData({ kind, name, payloadJson: payload }, rows.data ?? []).Config_Key) : "";
    } catch {
      return "";
    }
  }, [kind, name, payload, rows.data, v.ok]);

  if (!canEdit)
    return (
      <Page testId="wb-config-edit">
        <Notice tone="info">Only a Business administrator creates configuration.</Notice>
      </Page>
    );
  return (
    <Page testId="wb-config-edit">
      <Link to="/config" className="text-[13px] text-ink-2 hover:text-ink">
        ← Configuration
      </Link>
      <PageHeader eyebrow="New draft" title={`New ${kind}`} subtitle="A draft is saved as a new configuration row. It takes effect only once it is published and included in a release." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-4">
          <Field label="Kind" required>
            <Select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                if (!touched) setPayload(payloadSkeleton(e.target.value));
              }}
              aria-label="Kind"
            >
              {NEW_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </Field>
          {kind !== "Section definition" && (
            <Field label="Name in the key" hint="Section definitions take the section key from the payload.">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} data-testid="wb-config-name" />
            </Field>
          )}
          <Field label="Version label" hint="Defaults to v<n>.">
            <TextInput value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} />
          </Field>
          <JsonEditor
            label="Payload (JSON)"
            value={payload}
            onChange={(x) => {
              setPayload(x);
              setTouched(true);
            }}
            error={v.ok ? null : v.error}
            testId="wb-config-payload"
            onPretty={() => setPayload(prettyJson(payload))}
          />
          <Field label="Change note">
            <TextArea value={changeNote} onChange={(e) => setChangeNote(e.target.value)} rows={2} />
          </Field>
          <JsonEditor label="Internal annotations (JSON, optional)" value={annotations} onChange={setAnnotations} error={annErr} testId="wb-config-annotations" rows={3} />
          <p className="text-[13px] text-ink-3">Key: {keyPreview ? <Mono>{keyPreview}</Mono> : "—"}</p>
          <Button
            variant="primary"
            icon={<Save size={15} />}
            disabled={!v.ok || !!annErr || busy}
            data-testid="wb-config-create"
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const data = newConfigData({ kind, name, payloadJson: payload, versionLabel, changeNote, annotationsJson: annotations }, rows.data ?? []);
                const r = await actions.createFormRow(CONFIG_FLOW, data, "Config_Key");
                notify("Draft created and checked.", "success");
                rows.reload();
                navigate(`/config/${r.itemId}`, { replace: true });
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Creating…" : "Create draft"}
          </Button>
          {error && (
            <Notice tone="bad" testId="wb-config-error">
              {error}
            </Notice>
          )}
        </Card>
        <Card>
          <CardHeader title="Preview" subtitle={kind} />
          <div className="p-4">
            <PayloadPreview kind={kind} text={payload} />
          </div>
        </Card>
      </div>
    </Page>
  );
}

function ExistingConfig({ id }: { id: string }) {
  const { caps, actions, me, notify } = useWorkbench();
  const canEdit = caps.canEditForm(CONFIG_FLOW);
  const rows = useFormRows<ConfigVM>(CONFIG_FLOW);
  const navigate = useNavigate();
  const row = (rows.data ?? []).find((r) => r._id === id);
  const [edit, setEdit] = useState<{ id: string; payloadJson: string; changeNote: string; versionLabel: string; annotationsJson: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<StepOutcome | null>(null);
  const [lastAction, setLastAction] = useState<string>("save");
  const [retireOpen, setRetireOpen] = useState(false);

  if (rows.loading && !rows.data) return <Page testId="wb-config-edit"><Skeleton rows={8} /></Page>;
  if (!row)
    return (
      <Page testId="wb-config-edit">
        <ErrorBanner error={rows.error} onRetry={rows.reload} />
        <Card>
          <EmptyState title="This configuration was not found">It may not exist, or the list could not be read. <Link to="/config" className="text-brand hover:underline">Back to configuration</Link></EmptyState>
        </Card>
      </Page>
    );

  const isDraft = row.state === "Draft";
  const editable = isDraft && canEdit;
  const cur = edit && edit.id === row._id ? edit : { id: row._id, payloadJson: row.payloadJson, changeNote: row.changeNote, versionLabel: row.versionLabel, annotationsJson: row.annotationsJson };
  const set = (p: Partial<typeof cur>) => setEdit({ ...cur, ...p });
  const isRelease = row.kind === "Release";
  const v = isRelease ? { ok: true as const, value: null } : validatePayload(row.kind, cur.payloadJson);
  const annErr = validateAnnotations(cur.annotationsJson);
  let sectionErr: string | null = null;
  if (!isRelease && row.kind === "Section definition" && v.ok) {
    try {
      const sk = (JSON.parse(cur.payloadJson) as { sectionKey?: string }).sectionKey;
      if (row.sectionKey && sk !== row.sectionKey) sectionErr = `The section key is fixed for this row (${row.sectionKey}). Create a new configuration for another section.`;
    } catch {
      /* the payload error shows */
    }
  }
  const patch = editable ? draftEditPatch(row, cur) : { fields: {} };
  const dirty = Object.keys(patch.fields).length > 0;
  const versions = (rows.data ?? []).filter((r) => splitVersion(r.configKey).base === splitVersion(row.configKey).base).sort((a, b) => splitVersion(b.configKey).n - splitVersion(a.configKey).n);

  const run = async (what: string, fn: () => Promise<StepOutcome>) => {
    setBusy(what);
    setLastAction(what);
    setOutcome(null);
    try {
      const o = await fn();
      setOutcome(o);
      if (o.save?.ok) {
        setEdit(null);
        rows.reload();
      }
    } catch (e) {
      setOutcome({ refused: errorText(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page testId="wb-config-edit">
      <Link to={TEMPLATE_KINDS.includes(row.kind) ? "/templates" : "/config"} className="text-[13px] text-ink-2 hover:text-ink">
        ← {TEMPLATE_KINDS.includes(row.kind) ? "Section templates" : "Configuration"}
      </Link>
      <PageHeader
        eyebrow={row.kind}
        title={<Mono className="text-[20px]">{row.configKey}</Mono>}
        subtitle={row.changeNote || undefined}
        actions={
          <>
            <StateBadge state={row.state} />
            {canEdit && !isDraft && !isRelease && (
              <Button
                icon={<Copy size={15} />}
                disabled={!!busy}
                data-testid="wb-config-new-version"
                onClick={async () => {
                  setBusy("version");
                  setOutcome(null);
                  try {
                    const r = await actions.createFormRow(CONFIG_FLOW, newVersionData(row, rows.data ?? []), "Config_Key");
                    notify("New draft version created and checked.", "success");
                    rows.reload();
                    navigate(`/config/${r.itemId}`);
                  } catch (e) {
                    setOutcome({ refused: `No new version was created: ${errorText(e)}` });
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                New version
              </Button>
            )}
            {canEdit && row.state === "Published" && (
              <Button icon={<Archive size={15} />} disabled={!!busy} onClick={() => setRetireOpen(true)} data-testid="wb-config-retire">
                Retire
              </Button>
            )}
          </>
        }
      />
      <ErrorBanner error={rows.error} onRetry={rows.reload} />
      {!canEdit && (
        <Notice tone="info" testId="wb-config-readonly">
          Read-only for your roles.
        </Notice>
      )}
      {canEdit && !isDraft && (
        <Notice tone="info" testId="wb-config-readonly">
          {row.state} versions never change. Use <strong>New version</strong> to start a draft from this one.
        </Notice>
      )}
      <Card>
        <div className="p-4">
          <KeyValue
            cols={3}
            items={[
              { k: "Version label", v: row.versionLabel || "—" },
              { k: "Section", v: row.sectionKey ? `${row.sectionKey}${row.sectionRev !== null ? ` · rev ${row.sectionRev}` : ""}` : "—" },
              { k: "Content hash", v: row.contentHash ? <Mono>{row.contentHash.slice(0, 16)}…</Mono> : "—" },
              { k: "Published", v: row.publishedAt ? `${fmtDateTime(row.publishedAt)}${row.publishedBy?.name ? ` · ${row.publishedBy.name}` : ""}` : "—" },
              ...(isRelease
                ? [
                    { k: "Release", v: `${row.releaseKey || "—"} · ${row.releaseLabel || "no label"}` },
                    { k: "Stage", v: row.releaseStage || "—" },
                    { k: "Manifest hash", v: row.manifestHash ? <Mono>{row.manifestHash.slice(0, 16)}…</Mono> : "—" },
                  ]
                : []),
            ]}
          />
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-4">
          {isRelease ? (
            <JsonEditor label="Release manifest (JSON)" value={prettyJson(row.releaseManifestJson)} onChange={() => {}} disabled testId="wb-config-payload" />
          ) : (
            <JsonEditor
              label="Payload (JSON)"
              value={editable ? cur.payloadJson : prettyJson(row.payloadJson)}
              onChange={(x) => set({ payloadJson: x })}
              disabled={!editable}
              error={v.ok ? sectionErr : v.error}
              testId="wb-config-payload"
              onPretty={editable ? () => set({ payloadJson: prettyJson(cur.payloadJson) }) : undefined}
            />
          )}
          <Field label="Version label">
            <TextInput value={cur.versionLabel} onChange={(e) => set({ versionLabel: e.target.value })} disabled={!editable} />
          </Field>
          <Field label="Change note">
            <TextArea value={cur.changeNote} onChange={(e) => set({ changeNote: e.target.value })} rows={2} disabled={!editable} />
          </Field>
          {!isRelease && <JsonEditor label="Internal annotations (JSON, optional)" value={cur.annotationsJson} onChange={(x) => set({ annotationsJson: x })} disabled={!editable} error={annErr} testId="wb-config-annotations" rows={3} />}
          {editable && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                icon={<Save size={15} />}
                disabled={!dirty || !v.ok || !!annErr || !!sectionErr || !!busy}
                data-testid="wb-config-save"
                onClick={() =>
                  run("save", async () => {
                    const extra = row.kind === "Section definition" && !row.sectionKey && v.ok ? { Section_Key: (JSON.parse(cur.payloadJson) as { sectionKey: string }).sectionKey } : {};
                    return { save: await actions.updateFormRow(CONFIG_FLOW, row._id, { fields: { ...patch.fields, ...extra } }) };
                  })
                }
              >
                {busy === "save" ? "Saving…" : "Save draft"}
              </Button>
              <Button
                variant="primary"
                icon={<Send size={15} />}
                disabled={dirty || !v.ok || !!busy}
                title={dirty ? "Save the draft first: publishing uses the stored payload." : undefined}
                data-testid="wb-config-publish"
                onClick={() => run("publish", () => publishConfig(actions, row, { me, now: new Date() }))}
              >
                {busy === "publish" ? "Publishing…" : "Publish"}
              </Button>
              {dirty && <span className="text-[12.5px] text-ink-3">Save the draft before publishing.</span>}
            </div>
          )}
          <Outcome
            o={outcome}
            row={row}
            okMessage={lastAction === "publish" ? "Published and checked." : lastAction === "retire" ? "Retired and checked." : "Draft saved and checked."}
            onRetryAudit={async () => {
              const audit = await recordPublishEvent(actions, row);
              setOutcome((o) => (o ? { ...o, audit } : o));
            }}
          />
        </Card>
        <Card>
          <CardHeader title="Preview" subtitle={isRelease ? "Manifest of this release" : row.kind} />
          <div className="p-4">
            <PayloadPreview kind={row.kind} text={isRelease ? row.releaseManifestJson : cur.payloadJson} />
          </div>
        </Card>
      </div>
      {versions.length > 1 && (
        <Card>
          <CardHeader title="Versions of this configuration" />
          <ul className="divide-y divide-line">
            {versions.map((r) => (
              <li key={r._id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-[13px]">
                {r._id === row._id ? <Mono className="font-semibold">{r.configKey}</Mono> : <Link to={`/config/${r._id}`} className="text-brand hover:underline"><Mono>{r.configKey}</Mono></Link>}
                <StateBadge state={r.state} />
                <span className="text-ink-3">{r.publishedAt ? `published ${fmtDateTime(r.publishedAt)}` : r.versionLabel}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <ConfirmDialog
        open={retireOpen}
        title={`Retire ${row.configKey}?`}
        reason="Reason for retiring"
        confirmLabel="Retire"
        danger
        onClose={() => setRetireOpen(false)}
        onConfirm={async (reason) => {
          setRetireOpen(false);
          await run("retire", () => retireConfig(actions, row, reason));
        }}
      >
        <p>The audit event is recorded first. Then only the state changes to Retired; the payload, hash and publish details stay as they are. New cases no longer pick a retired release; cases that already pinned it keep it.</p>
      </ConfirmDialog>
    </Page>
  );
}

// ---------------------------------------------------------------- release builder

function ReleaseBuilder({ rows, onClose, onDone }: { rows: ConfigVM[]; onClose(): void; onDone(): void }) {
  const { actions, me } = useWorkbench();
  const navigate = useNavigate();
  const published = rows.filter((r) => r.state === "Published");
  const candidates = published.filter((r) => MANIFEST_KINDS.includes(r.kind));
  const regression = published.filter((r) => r.kind === "Regression set");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [input, setInput] = useState<ReleaseInput>({ label: "", stage: "", changeNote: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ error?: string; publish?: StepOutcome; itemId?: string } | null>(null);
  const sel = candidates.filter((r) => picked.has(r._id));
  const check = validateSelection(sel);
  const byKind = MANIFEST_KINDS.map((k) => ({ kind: k, rows: candidates.filter((r) => r.kind === k).sort((a, b) => a.sectionKey.localeCompare(b.sectionKey) || a.configKey.localeCompare(b.configKey)) })).filter((g) => g.rows.length);
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const done = !!result?.itemId;
  const publishSave: SaveResult | undefined = result?.publish?.save;
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="New release"
      subtitle="A release pins one published version of each configuration. New cases pin the newest published release of their stage."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {done ? "Close" : "Cancel"}
          </Button>
          {done ? (
            <Button variant="primary" onClick={() => navigate(`/config/${result!.itemId}`)}>
              Open the release
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={<PackagePlus size={15} />}
              disabled={busy || check.errors.length > 0 || !input.label.trim() || !input.stage}
              data-testid="wb-release-create"
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await createRelease(actions, sel, input, rows, { me, now: new Date() });
                  setResult(r);
                  if (r.itemId) onDone();
                } catch (e) {
                  setResult({ error: errorText(e) });
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Building…" : "Create and publish release"}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-[13.5px]" data-testid="wb-release-builder">
        {result?.error && (
          <Notice tone="bad" testId="wb-release-error">
            {result.error}
          </Notice>
        )}
        {result?.itemId && (
          <Notice tone={publishSave?.ok ? "ok" : "warn"} testId="wb-release-result">
            {publishSave?.ok ? "Release created and published. New cases of this stage pin it from now on." : "Release created as a draft; publishing did not complete. Open it to publish."}
          </Notice>
        )}
        {result?.publish && <Outcome o={result.publish} okMessage="Release published and checked." />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Release label" required>
            <TextInput value={input.label} onChange={(e) => setInput({ ...input, label: e.target.value })} disabled={done} data-testid="wb-release-label" />
          </Field>
          <Field label="Stage" required hint="Test releases are pinned only by test cases.">
            <Segmented<"Test" | "Live" | "">
              value={input.stage}
              onChange={(s) => setInput({ ...input, stage: s })}
              disabled={done}
              options={[
                { value: "Test", label: "Test" },
                { value: "Live", label: "Live" },
              ]}
            />
          </Field>
        </div>
        <Field label="Change note">
          <TextArea value={input.changeNote} onChange={(e) => setInput({ ...input, changeNote: e.target.value })} rows={2} disabled={done} />
        </Field>
        {!candidates.length ? (
          <p className="text-ink-3">No published configuration yet: publish drafts first.</p>
        ) : (
          <div className="space-y-3">
            {byKind.map((g) => (
              <fieldset key={g.kind} className="rounded-lg border border-line p-3">
                <legend className="px-1 text-[12px] font-semibold tracking-wide text-ink-3 uppercase">{g.kind}</legend>
                {g.rows.map((r) => (
                  <div key={r._id} data-testid={`wb-release-pick-${r._id}`}>
                    <Checkbox
                      checked={picked.has(r._id)}
                      onChange={() => toggle(r._id)}
                      disabled={done}
                      label={
                        <span>
                          <Mono>{r.configKey}</Mono> <span className="text-ink-3">· {r.versionLabel || "no label"}{r.sectionKey ? ` · ${r.sectionKey}` : ""} · published {fmtDateTime(r.publishedAt)}</span>
                        </span>
                      }
                    />
                  </div>
                ))}
              </fieldset>
            ))}
          </div>
        )}
        {regression.length > 0 && (
          <p className="text-[12.5px] text-ink-3">
            Regression set (shown only, not run here): {regression.map((r) => r.configKey).join(", ")}.
          </p>
        )}
        {check.errors.length > 0 && picked.size > 0 && (
          <Notice tone="bad" testId="wb-release-errors">
            <ul className="list-disc pl-5">
              {check.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Notice>
        )}
        {check.warnings.length > 0 && picked.size > 0 && <WarningList warnings={check.warnings} testId="wb-release-warnings" />}
      </div>
    </Modal>
  );
}
