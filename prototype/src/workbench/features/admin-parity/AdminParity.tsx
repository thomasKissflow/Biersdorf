// The Business administrator's prototype pages over the live configuration (CIQ_Config_Version_A00 by Config_Kind):
// Rule table (#/admin/rules, "Rule set"; the Auditor reads it), Section owners (#/admin/ownership, "Section
// ownership") and Reminders (#/admin/reminders, "Settings" + "Text bundle"). Modelled on the prototype's
// src/features/admin RuleTable/RuleList, OwnershipMatrix and ReminderSettings/EmailPreviews.
// Nothing here edits a row: changes go through the existing versioning (a new Draft copied from a version, edited and
// published in Configuration). Only roles with E on the form (Business administrator) get those buttons.
import { CalendarCheck, FilePlus2, FileText, Lock, PencilLine, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Card, CardHeader, Mono, PageHeader, cx, type Tone } from "@/components/ui/primitives";
import { EmptyState, Table, Td, Tr } from "@/components/ui/data";
import { Segmented, TextInput } from "@/components/ui/form";
import { useFormRows, useWorkbench } from "../../data/hooks";
import type { ConfigVM, ListQuality } from "../../data/viewModels";
import { errorText } from "../../kf/sdk";
import { ReadQualityBanner } from "../../ui/ReadQualityBanner";
import { CONFIG_FLOW, newVersionData, templatePreview } from "../admin/config";
import { PayloadPreview } from "../admin/PayloadPreview";
import { fmtDateTime } from "../audit/format";
import { ErrorBanner, Notice, Page, Skeleton, WarningList } from "../audit/kit";
import {
  DEPT_NAMES,
  MATRIX_DEPTS,
  basisKind,
  changedRuleIds,
  defaultVersion,
  deptKindOf,
  deptTotals,
  groupRules,
  liveConfigKeys,
  openDraftOf,
  ownershipRows,
  parseRuleSet,
  previousVersion,
  roleIn,
  ruleMatches,
  versionStateOf,
  versionsOf,
  type RuleRow,
  type VersionState,
} from "./model";

const slug = (kind: string) => kind.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// ---------------------------------------------------------------- page frame

function ParityPage({ testId, title, subtitle, canEdit, rows, children }: { testId: string; title: string; subtitle: string; canEdit: boolean; rows: { error: string | null; warnings: string[]; loading: boolean; data: unknown; quality: ListQuality | undefined; reload(): void }; children: ReactNode }) {
  return (
    <Page testId={testId}>
      <PageHeader eyebrow="Business administration" title={title} subtitle={subtitle} />
      {!canEdit && (
        <Notice tone="info" testId="wb-parity-readonly">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Lock size={14} aria-hidden /> Read-only for your roles.
          </span>{" "}
          Only the Business administrator changes this configuration.
        </Notice>
      )}
      <ErrorBanner error={rows.error} onRetry={rows.reload} />
      <ReadQualityBanner quality={rows.quality} what="Configuration" />
      <WarningList warnings={rows.warnings} />
      {rows.loading && !rows.data ? <Skeleton rows={6} /> : children}
    </Page>
  );
}

// ---------------------------------------------------------------- versions of one kind

const STATE: Record<VersionState, { text: string; tone: Tone }> = {
  live: { text: "In the live release", tone: "ok" },
  published: { text: "Published · not in the live release", tone: "info" },
  draft: { text: "Draft", tone: "warn" },
  retired: { text: "Retired", tone: "neutral" },
  other: { text: "No state", tone: "neutral" },
};

function VersionCard({ row, state, selected, onSelect }: { row: ConfigVM; state: VersionState; selected: boolean; onSelect(): void }) {
  const s = STATE[state];
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      data-testid={`wb-parity-version-${row._id}`}
      className={cx("flex w-full flex-col rounded-card border bg-surface p-4 text-left shadow-card transition-[border-color,box-shadow]", selected ? "border-brand ring-2 ring-brand-soft" : "border-line hover:border-line-strong")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Mono className="text-[14px] font-semibold text-ink">{row.versionLabel || row.configKey}</Mono>
        <Badge tone={s.tone} dot>
          {s.text}
        </Badge>
        {selected && <span className="ml-auto text-xs font-medium text-brand">Viewing</span>}
      </div>
      {row.changeNote && <p className="mt-1.5 text-[13px] text-ink-2">{row.changeNote}</p>}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        <Mono>{row.configKey}</Mono>
        <span className="inline-flex items-center gap-1">
          <CalendarCheck size={12} aria-hidden />
          {row.publishedAt ? `Published ${fmtDateTime(row.publishedAt)}${row.publishedBy?.name ? ` by ${row.publishedBy.name}` : ""}` : "Not published"}
        </span>
      </div>
    </button>
  );
}

/** New draft version (copy-on-write from the viewed version) or the open draft; both continue in Configuration. */
function VersionActions({ kind, viewed, versions, all, canEdit }: { kind: string; viewed: ConfigVM; versions: ConfigVM[]; all: ConfigVM[]; canEdit: boolean }) {
  const { actions, notify } = useWorkbench();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = openDraftOf(versions);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2" data-testid={`wb-parity-actions-${slug(kind)}`}>
        <Link to={`/config/${viewed._id}`} className="inline-flex items-center gap-1 text-[13px] text-brand hover:underline" data-testid="wb-parity-open-config">
          <FileText size={13} aria-hidden /> Open this version in Configuration
        </Link>
        {canEdit && (
          <span className="ml-auto flex flex-wrap gap-2">
            {draft ? (
              <Button variant="primary" icon={<PencilLine size={15} />} onClick={() => navigate(`/config/${draft._id}`)} data-testid="wb-parity-open-draft">
                Edit and publish the draft {draft.versionLabel}
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={<FilePlus2 size={15} />}
                disabled={busy}
                data-testid="wb-parity-new-version"
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const r = await actions.createFormRow(CONFIG_FLOW, newVersionData(viewed, all), "Config_Key");
                    notify("New draft version created and checked.", "success");
                    navigate(`/config/${r.itemId}`);
                  } catch (e) {
                    setError(`No new version was created: ${errorText(e)}`);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Creating…" : `New draft from ${viewed.versionLabel || "this version"}`}
              </Button>
            )}
          </span>
        )}
      </div>
      {canEdit && (
        <p className="text-[12.5px] text-ink-3">
          {draft ? "A draft is open for this configuration. Publish it, then include it in a release so new cases use it." : "Published versions never change: a new draft copies this version. Running cases keep the release they started with."}
        </p>
      )}
      {error && (
        <Notice tone="bad" testId="wb-parity-error">
          {error}
        </Notice>
      )}
    </div>
  );
}

/** The versions of one Config_Kind, the actions, and `render` for the viewed version. Empty: "Create the first version". */
export function KindSection({ kind, all, canEdit, title, hint, render }: { kind: string; all: ConfigVM[]; canEdit: boolean; title?: string; hint?: string; render(row: ConfigVM, versions: ConfigVM[]): ReactNode }) {
  const navigate = useNavigate();
  const versions = useMemo(() => versionsOf(all, kind), [all, kind]);
  const live = useMemo(() => liveConfigKeys(all), [all]);
  const [sel, setSel] = useState<string | null>(null);
  const viewed = versions.find((r) => r._id === sel) ?? defaultVersion(versions, live);
  return (
    <section className="space-y-4" data-testid={`wb-parity-${slug(kind)}`}>
      {title && (
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {hint && <p className="text-[13px] text-ink-3">{hint}</p>}
        </div>
      )}
      {!viewed ? (
        <Card>
          <EmptyState
            title={`No ${kind.toLowerCase()} version yet`}
            action={
              canEdit ? (
                <Button variant="primary" icon={<FilePlus2 size={15} />} onClick={() => navigate(`/config/new?kind=${encodeURIComponent(kind)}`)} data-testid={`wb-parity-first-${slug(kind)}`}>
                  Create the first version
                </Button>
              ) : undefined
            }
          >
            {canEdit ? "Start a draft, publish it and include it in a release." : "A Business administrator creates the first version."}
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {versions.map((r) => (
              <VersionCard key={r._id} row={r} state={versionStateOf(r, live)} selected={r._id === viewed._id} onSelect={() => setSel(r._id)} />
            ))}
          </div>
          <VersionActions kind={kind} viewed={viewed} versions={versions} all={all} canEdit={canEdit} />
          {render(viewed, versions)}
        </>
      )}
    </section>
  );
}

function useConfigRows() {
  const { caps } = useWorkbench();
  const rows = useFormRows<ConfigVM>(CONFIG_FLOW);
  return { rows, all: rows.data ?? [], canEdit: caps.canEditForm(CONFIG_FLOW) };
}

// ---------------------------------------------------------------- rule table

const OUTCOME_TONE: Record<string, Tone> = { Mandatory: "brand", Optional: "info", "N.A.": "neutral" };

function BasisBadge({ basis }: { basis: string }) {
  const k = basisKind(basis);
  if (k === "document")
    return (
      <Badge tone="ok" dot>
        From BDF document
      </Badge>
    );
  if (k === "assumption")
    return (
      <Badge tone="warn" dot>
        Assumption — to confirm
      </Badge>
    );
  return basis ? <Badge>{basis}</Badge> : <span className="text-ink-3">—</span>;
}

const Chips = ({ items }: { items: string[] }) =>
  items.length ? (
    <div className="flex flex-wrap gap-1">
      {items.map((x) => (
        <span key={x} className="inline-flex items-center rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2">
          {x}
        </span>
      ))}
    </div>
  ) : (
    <span className="text-[12.5px] text-ink-3">No section — evidence only</span>
  );

type BasisFilter = "all" | "document" | "assumption";

/** The rules of one Rule set version, grouped by configuration question (props only). */
export function RuleListView({ row, prev }: { row: ConfigVM; prev?: ConfigVM }) {
  const [basis, setBasis] = useState<BasisFilter>("all");
  const [query, setQuery] = useState("");
  const parsed = useMemo(() => parseRuleSet(row.payloadJson), [row.payloadJson]);
  const changed = useMemo(() => {
    const p = prev ? parseRuleSet(prev.payloadJson) : null;
    return parsed.ok ? changedRuleIds(p?.ok ? p.rules : null, parsed.rules) : new Map<string, "new" | "changed">();
  }, [parsed, prev]);
  if (!parsed.ok)
    return (
      <Card data-testid="wb-rules-list">
        <CardHeader title="Rules" subtitle={parsed.error} />
        <div className="p-4">
          <PayloadPreview kind="Rule set" text={row.payloadJson} />
        </div>
      </Card>
    );
  const rules = parsed.rules;
  const visible = rules.filter((r) => (basis === "all" || basisKind(r.basis) === basis) && ruleMatches(r, query));
  const groups = groupRules(visible);
  const docs = rules.filter((r) => basisKind(r.basis) === "document").length;
  const assumptions = rules.filter((r) => basisKind(r.basis) === "assumption").length;
  return (
    <Card data-testid="wb-rules-list">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">
            Rules in <Mono className="text-[14px]">{row.versionLabel || row.configKey}</Mono>
          </h3>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {rules.length} rules · {docs} from the BDF requirements document · {assumptions} assumptions to confirm. The strictest outcome wins.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" aria-hidden />
            <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search rules" aria-label="Search rules by id, section or department" className="w-52 pl-8" />
          </div>
          <Segmented<BasisFilter>
            value={basis}
            onChange={setBasis}
            options={[
              { value: "all", label: "All" },
              { value: "document", label: "BDF document" },
              { value: "assumption", label: "Assumptions" },
            ]}
          />
        </div>
      </div>
      {!rules.length ? (
        <EmptyState title="This version has no rules yet">Scope is checked by hand until a rule set with rules is published and released.</EmptyState>
      ) : !groups.length ? (
        <EmptyState icon={<Search size={20} />} title="No rule matches this filter">
          Try a section code, a department, or clear the filter.
        </EmptyState>
      ) : (
        <Table head={["Rule", "Condition", "Activates", "Outcome", "Evidence required", "Departments", "Basis"]}>
          {groups.map(({ question, rules: rs }) => [
            <tr key={`h-${question}`} className="bg-surface-2">
              <td colSpan={7} className="px-4 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Mono className="font-semibold text-ink">{question || "Always"}</Mono>
                  <span className="ml-auto text-xs text-ink-3">{rs.length === 1 ? "1 rule" : `${rs.length} rules`}</span>
                </div>
              </td>
            </tr>,
            ...rs.map((r: RuleRow) => (
              <Tr key={r.id} className={changed.has(r.id) ? "bg-brand-soft/50" : undefined}>
                <Td className="align-top whitespace-nowrap">
                  <Mono className="font-medium">{r.id}</Mono>
                  {changed.has(r.id) && (
                    <div className="mt-1">
                      <Badge tone="brand">{changed.get(r.id) === "new" ? "New" : "Changed"}</Badge>
                    </div>
                  )}
                </Td>
                <Td className="max-w-[300px] min-w-[220px] align-top">
                  <div className="text-ink">{r.condition || "—"}</div>
                  {r.note && <div className="mt-0.5 text-[12.5px] text-ink-3">{r.note}</div>}
                </Td>
                <Td className="max-w-[260px] min-w-[160px] align-top">
                  <Chips items={r.activates} />
                </Td>
                <Td className="align-top">{r.outcome ? <Badge tone={OUTCOME_TONE[r.outcome] ?? "neutral"}>{r.outcome}</Badge> : <span className="text-ink-3">—</span>}</Td>
                <Td className="max-w-[220px] min-w-[160px] align-top">
                  {r.evidence.length ? (
                    <ul className="space-y-0.5">
                      {r.evidence.map((e) => (
                        <li key={e} className="flex items-start gap-1.5 text-[12.5px] text-ink-2">
                          <FileText size={12} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                          {e}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </Td>
                <Td className="align-top">
                  <div className="flex flex-wrap gap-1">
                    {r.departments.map((d) => (
                      <span key={d} title={DEPT_NAMES[d] ?? d}>
                        <Badge>{d}</Badge>
                      </span>
                    ))}
                  </div>
                </Td>
                <Td className="align-top">
                  <BasisBadge basis={r.basis} />
                </Td>
              </Tr>
            )),
          ])}
        </Table>
      )}
    </Card>
  );
}

export function RuleTable() {
  const { rows, all, canEdit } = useConfigRows();
  return (
    <ParityPage
      testId="wb-admin-rules"
      title="Rule table"
      subtitle="The configuration answers decide which chapters, annexes and evidence each supplier gets. The business maintains these rules without IT; running cases keep the version they started with."
      canEdit={canEdit}
      rows={rows}
    >
      <KindSection kind="Rule set" all={all} canEdit={canEdit} render={(row, versions) => <RuleListView row={row} prev={previousVersion(versions, row)} />} />
    </ParityPage>
  );
}

// ---------------------------------------------------------------- section owners

function RoleChip({ role }: { role: "lead" | "co" | "none" }) {
  if (role === "lead") return <span className="inline-flex h-6 min-w-[46px] items-center justify-center rounded-md bg-brand-soft px-2 text-xs font-semibold text-brand">Lead</span>;
  if (role === "co") return <span className="inline-flex h-6 min-w-[46px] items-center justify-center rounded-md border border-line-strong bg-surface px-2 text-xs font-medium text-ink-2">Co</span>;
  return <span className="inline-flex h-6 min-w-[46px] items-center justify-center text-xs text-ink-3 opacity-40">·</span>;
}

/** The responsibility matrix of one Section ownership version (props only). */
export function OwnershipView({ row, prev, all }: { row: ConfigVM; prev?: ConfigVM; all: ConfigVM[] }) {
  const tpl = useMemo(() => templatePreview(all), [all]);
  const m = useMemo(() => ownershipRows(row.payloadJson, tpl, prev?.payloadJson), [row.payloadJson, tpl, prev]);
  if (!m.ok)
    return (
      <Card data-testid="wb-ownership-matrix">
        <CardHeader title="Responsibility matrix" subtitle={m.error} />
      </Card>
    );
  const totals = deptTotals(m.rows);
  const changed = m.rows.filter((r) => r.changed).length;
  return (
    <Card data-testid="wb-ownership-matrix">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Responsibility matrix</h3>
          <p className="mt-0.5 text-[13px] text-ink-3">Lead decides on the section; Co reads and comments. Queries go to the query owner.</p>
        </div>
        <div className="text-[13px] text-ink-2">{prev ? (changed ? `${changed === 1 ? "1 section" : `${changed} sections`} changed from ${prev.versionLabel || prev.configKey}` : `Same as ${prev.versionLabel || prev.configKey}`) : "First version"} · changes apply to new cases</div>
      </div>
      <Table
        dense
        head={[
          "Section",
          ...MATRIX_DEPTS.map((d) => (
            <span key={d} title={DEPT_NAMES[d] ?? d} className="block text-center">
              <span className="text-ink-2">{d}</span>
              <span className="block text-[10.5px] font-normal">{deptKindOf(d)}</span>
            </span>
          )),
          "Queries",
        ]}
      >
        {m.rows.map((r) => (
          <Tr key={r.sectionKey}>
            <Td className="min-w-[240px] py-1.5 sm:min-w-[300px]">
              <div className="flex items-baseline gap-1.5">
                <Mono className="w-[64px] shrink-0 font-medium">{r.code}</Mono>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="text-[13px] text-ink">{r.title || r.sectionKey}</span>
                  {r.co.length > 0 && <Badge tone="info">Shared</Badge>}
                  {r.changed && <Badge tone="warn">Changed</Badge>}
                  {!r.lead && <Badge tone="bad">No lead</Badge>}
                </div>
              </div>
            </Td>
            {MATRIX_DEPTS.map((d) => (
              <Td key={d} className="px-2 py-1.5 text-center">
                <span aria-label={`${r.code} · ${d}: ${roleIn(r, d) === "none" ? "no role" : roleIn(r, d)}`}>
                  <RoleChip role={roleIn(r, d)} />
                </span>
              </Td>
            ))}
            <Td className="px-2 py-1.5 text-center text-xs text-ink-2">{r.queryOwner || "—"}</Td>
          </Tr>
        ))}
        <tr className="border-t-2 border-line-strong bg-surface-2">
          <td className="px-4 py-2.5 text-[13px] font-semibold text-ink">Sections per department</td>
          {MATRIX_DEPTS.map((d) => (
            <td key={d} className="px-2 py-2.5 text-center text-xs whitespace-nowrap">
              <div className="font-semibold text-ink tabular-nums">{totals[d].lead} lead</div>
              <div className="text-ink-3 tabular-nums">{totals[d].co} co</div>
            </td>
          ))}
          <td />
        </tr>
      </Table>
    </Card>
  );
}

export function SectionOwners() {
  const { rows, all, canEdit } = useConfigRows();
  return (
    <ParityPage
      testId="wb-admin-ownership"
      title="Section owners"
      subtitle="Which department leads the review of each chapter and annex, and who co-reviews. Review tasks of new cases follow this matrix; running cases keep the tasks they were given."
      canEdit={canEdit}
      rows={rows}
    >
      <Notice tone="info">Customs & Trade Compliance and Legal / IP lead K7 and K8 / K8.1 but have no review step: they read their cases under Informed cases.</Notice>
      <KindSection kind="Section ownership" all={all} canEdit={canEdit} render={(row, versions) => <OwnershipView row={row} prev={previousVersion(versions, row)} all={all} />} />
    </ParityPage>
  );
}

// ---------------------------------------------------------------- reminders

export function Reminders() {
  const { rows, all, canEdit } = useConfigRows();
  return (
    <ParityPage
      testId="wb-admin-reminders"
      title="Reminders and notifications"
      subtitle="Supplier due dates, the reactivation window and the texts suppliers and departments see. Maintained by the business; no IT change needed."
      canEdit={canEdit}
      rows={rows}
    >
      <Notice tone="warn">Reminder and escalation timings are not part of the published configuration yet. Due dates below come from the Settings version.</Notice>
      <KindSection
        kind="Settings"
        all={all}
        canEdit={canEdit}
        title="Due dates and defaults"
        hint="The supplier due date of new cases, the reactivation window and the review defaults."
        render={(row) => (
          <Card data-testid="wb-reminders-settings">
            <CardHeader title={`Settings ${row.versionLabel || row.configKey}`} />
            <div className="p-4">
              <PayloadPreview kind="Settings" text={row.payloadJson} />
            </div>
          </Card>
        )}
      />
      <KindSection
        kind="Text bundle"
        all={all}
        canEdit={canEdit}
        title="Texts"
        hint="Declarations and closing texts shown to suppliers. They never carry internal comments, findings or decisions."
        render={(row) => (
          <Card data-testid="wb-reminders-texts">
            <CardHeader title={`Text bundle ${row.versionLabel || row.configKey}`} />
            <div className="p-4">
              <PayloadPreview kind="Text bundle" text={row.payloadJson} />
            </div>
          </Card>
        )}
      />
    </ParityPage>
  );
}
