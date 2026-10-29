// The draft bar and the version history on Rules and Questionnaire (spec §8.3). A configuration release is a pair:
// rule set RS-2026.N plus questionnaire vM. The administrator creates a draft, changes it, checks and publishes it;
// only the side that changed gets a new number (the bar says live what publishing would give). The auditor reads the
// same bar and history without the buttons.
// Phones (< 768 px, Thomas 30 Oct): no buttons (useAdminAccess canChange); the history is folded (so the rules or the
// sections come next) and opens as a list, each version one row that selects it, with the table rows' test hooks.
import { CalendarCheck, ChevronDown, FilePlus2, GitBranch, Rocket, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useLiveFeatures } from "@/components/liveFeatures";
import { Badge, Button, Card, Field, Modal, Table, Td, TextArea, Tr, cx } from "@/components/ui";
import { configVersions, currentPair, draftPair, pairLabel, publishPlan, shortTemplate, type ConfigVersion } from "@/domain/configActions";
import { fmtDate, userName } from "@/domain/selectors";
import type { AppState } from "@/domain/types";
import { useStore } from "@/store/store";
import { casesText, changesCount, nextVersions } from "./config";
import { useAdminAccess } from "./shared";

const STATUS_TONE: Record<ConfigVersion["status"], "warn" | "ok" | "neutral"> = { draft: "warn", current: "ok", superseded: "neutral" };

/** "No case yet" / "2 cases (1 running)". */
function casesCell(v: ConfigVersion): string {
  if (v.status === "draft") return "Not in use yet";
  if (!v.casesUsing) return "No case yet";
  return `${casesText(v.casesUsing)}${v.runningCases && v.runningCases !== v.casesUsing ? ` (${v.runningCases} running)` : v.runningCases ? ", all running" : ""}`;
}

/** " · questionnaire v1 kept" after a release's kind: the side it did not change. */
function keptText(v: ConfigVersion): string {
  if (v.status !== "draft" && v.kind === "rules") return ` · questionnaire ${shortTemplate(v.templateVersion)} kept`;
  if (v.status !== "draft" && v.kind === "questionnaire") return ` · rules ${v.ruleSetVersion} kept`;
  return "";
}

const dateText = (v: ConfigVersion) => (v.date ? `${v.status === "draft" ? "Started " : ""}${fmtDate(v.date)}` : "—");

const changeNote = (v: ConfigVersion): ReactNode => v.changeNote || (v.note ? `Draft note: ${v.note}` : <span className="text-ink-3">Written when it is published</span>);

/** The history on a phone: folded to one line (how many versions, which one is shown); opened, one row per version,
 *  the whole row selects it. Test hook: `config-history-toggle`. */
function PhoneHistory({ state, versions, page, viewing, onView }: { state: AppState; versions: ConfigVersion[]; page: "rules" | "questionnaire"; viewing: string; onView: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const shown = versions.find((v) => v.key === viewing);
  return (
    <>
      <button type="button" data-testid="config-history-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-ink">Version history</span>
          <span className="block text-xs text-ink-3">
            {versions.length} {versions.length === 1 ? "version" : "versions"}
            {shown && ` · viewing ${shown.label}`}
          </span>
        </span>
        <ChevronDown size={16} aria-hidden className={cx("shrink-0 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <p className="px-4 pb-2 text-xs text-ink-3">Select a version to see its {page === "rules" ? "rules" : "questionnaire"}. Published versions never change.</p>
          <ul className="divide-y divide-line border-t border-line" aria-label="Version history">
            {versions.map((v) => {
              const on = v.key === viewing;
              const hook = page === "rules" ? `ruleset-card-${v.key}` : `template-card-${v.templateKey}`;
              return (
                <li key={v.key} data-testid={`config-history-row-${v.key}`} data-status={v.status} data-kind={v.kind} data-pair={pairLabel(v.ruleSetVersion, v.templateVersion)}>
                  <button type="button" data-testid={hook} aria-pressed={on} onClick={() => onView(v.key)} className={cx("block min-h-11 w-full px-4 py-3 text-left transition-colors", on ? "bg-brand-soft/45" : "hover:bg-surface-2")}>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-ink">{v.label}</span>
                      <Badge tone={STATUS_TONE[v.status]} dot>
                        {v.statusLabel}
                      </Badge>
                      {on && <span className="text-xs font-medium text-brand">Viewing</span>}
                    </span>
                    <span data-testid={`config-history-kind-${v.key}`} className="mt-0.5 block text-[11.5px] font-medium text-ink-3">
                      {v.kindLabel}
                      {keptText(v)}
                    </span>
                    <span className="mt-1 block text-[12.5px] text-ink-2">
                      {dateText(v)}
                      {v.by ? ` · ${userName(state, v.by)}` : ""} · {casesCell(v)}
                    </span>
                    <span className="mt-1 line-clamp-3 block text-[12.5px] text-ink-2">{changeNote(v)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

/** The row shown by default: the draft, else the one used for new cases. */
export const defaultVersion = (versions: ConfigVersion[]) => versions.find((v) => v.status === "draft") ?? versions.find((v) => v.status === "current") ?? versions[0];

/**
 * The bar and the history. `viewing` is the key of the release shown below it (ConfigVersion.key, selected from the
 * history); each history row's own button carries `ruleset-card-<key>` on Rules and `template-card-<templateKey>` on
 * Questionnaire.
 */
export function VersionsPanel({ page, viewing, onView, onCheckPublish }: { page: "rules" | "questionnaire"; viewing: string; onView: (key: string) => void; onCheckPublish: () => void }) {
  const { state, createDraft, discardDraft } = useStore();
  const { canChange, phone } = useAdminAccess();
  const { configEdit } = useLiveFeatures();
  const draft = draftPair(state);
  const plan = publishPlan(state);
  const current = currentPair(state);
  const versions = configVersions(state);
  const [createOpen, setCreateOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [note, setNote] = useState("");
  const currentLabel = pairLabel(current.ruleSetVersion, current.templateVersion);
  const count = plan ? plan.ruleChanges + plan.questionnaireChanges : 0;
  const next = nextVersions(state.config);

  const create = () => {
    if (createDraft(note)) {
      setCreateOpen(false);
      setNote("");
      onView(next.ruleSetVersion); // the draft's row key: its working rule set number
    }
  };

  return (
    <Card className="overflow-hidden">
      <div
        data-testid="config-draft-bar"
        data-draft={draft ? "true" : "false"}
        className={cx(phone ? "flex flex-wrap items-start gap-x-3 gap-y-3 px-4 py-3.5" : "flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5", draft ? "bg-warn-soft/45" : "bg-surface")}
      >
        <span className={cx("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", draft ? "bg-warn-soft text-[color-mix(in_oklch,var(--warn)_75%,var(--ink))]" : "bg-ok-soft text-ok")} aria-hidden>
          {draft ? <GitBranch size={17} /> : <CalendarCheck size={17} />}
        </span>
        {/* a phone keeps the text beside its icon (16rem would push it under the icon at 360 px) */}
        <div className={phone ? "min-w-0 flex-1" : "min-w-0 flex-1 basis-[16rem]"}>
          {draft && plan ? (
            <>
              <p className="text-[14.5px] font-semibold text-ink" data-testid="config-draft-label" data-kind={plan.kind}>
                <span>Draft</span>
                <span className="text-ink-3"> · </span>
                <span data-testid="config-change-count" data-count={count} data-kind={plan.kind} className={count ? "text-ink" : "font-medium text-ink-3"}>
                  {plan.text}
                </span>
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-2">
                <span data-testid="config-published-label">
                  Published: {currentLabel} · used for new cases until the draft is published.
                </span>{" "}
                {/* nobody changes the configuration in the live app (FE-CLEANUP A7) */}
                {configEdit && <span className="text-ink-3">Only what you change gets a new version number.</span>}
                {draft.note && <span className="text-ink-3"> Draft note: “{draft.note}”</span>}
              </p>
            </>
          ) : (
            <>
              <p className="text-[14.5px] font-semibold text-ink" data-testid="config-published-label">
                Published: {currentLabel} · used for new cases
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-2">
                {canChange ? "To change the rules or the questionnaire, create a new version. Cases keep the version they started with." : "No draft is open. Cases keep the version they started with."}
              </p>
            </>
          )}
        </div>
        {canChange && (
          <div className="flex flex-wrap items-center gap-2">
            {draft ? (
              <>
                <Button data-testid="config-discard-draft" variant="ghost" icon={<Trash2 size={15} />} onClick={() => setDiscardOpen(true)}>
                  Discard draft
                </Button>
                <Button data-testid="config-check-publish" variant="primary" icon={<Rocket size={15} />} onClick={onCheckPublish}>
                  Check & publish
                </Button>
              </>
            ) : (
              <Button data-testid="config-create-version" variant="primary" icon={<FilePlus2 size={15} />} onClick={() => setCreateOpen(true)}>
                Create new version
              </Button>
            )}
          </div>
        )}
      </div>

      <div data-testid="config-history" className="border-t border-line">
        {!phone && (
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3 pb-1">
            <h3 className="text-[13px] font-semibold text-ink">Version history</h3>
            <p className="text-xs text-ink-3">Select a version to see its {page === "rules" ? "rules" : "questionnaire"}. Published versions never change.</p>
          </div>
        )}
        {phone ? (
          <PhoneHistory state={state} versions={versions} page={page} viewing={viewing} onView={onView} />
        ) : (
          <Table dense head={["Version", "Status", "Date", "By", "Change note", "Cases"]}>
            {versions.map((v) => {
              const on = v.key === viewing;
              const hook = page === "rules" ? `ruleset-card-${v.key}` : `template-card-${v.templateKey}`;
              return (
                <Tr key={v.key} data-testid={`config-history-row-${v.key}`} data-status={v.status} data-kind={v.kind} data-pair={pairLabel(v.ruleSetVersion, v.templateVersion)} aria-selected={on} onClick={() => onView(v.key)} className={on ? "bg-brand-soft/45 hover:bg-brand-soft/60" : undefined}>
                  <Td className="py-2 whitespace-nowrap">
                    <button type="button" data-testid={hook} aria-pressed={on} onClick={(e) => (e.stopPropagation(), onView(v.key))} className="inline-flex items-center gap-2 text-left font-semibold text-ink hover:underline">
                      {v.label}
                      {on && <span className="text-xs font-medium text-brand no-underline">Viewing</span>}
                    </button>
                    <div data-testid={`config-history-kind-${v.key}`} className="mt-0.5 text-[11.5px] font-medium text-ink-3">
                      {v.kindLabel}
                      {keptText(v)}
                    </div>
                  </Td>
                  <Td className="py-2 whitespace-nowrap">
                    <Badge tone={STATUS_TONE[v.status]} dot>
                      {v.statusLabel}
                    </Badge>
                  </Td>
                  <Td className="py-2 whitespace-nowrap text-ink-2">{dateText(v)}</Td>
                  <Td className="py-2 whitespace-nowrap text-ink-2">{v.by ? userName(state, v.by) : "—"}</Td>
                  <Td className="max-w-[380px] min-w-[200px] py-2 text-[12.5px] text-ink-2">
                    <span className="line-clamp-2" title={v.changeNote || v.note}>
                      {changeNote(v)}
                    </span>
                  </Td>
                  <Td className="py-2 whitespace-nowrap text-ink-2">{casesCell(v)}</Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </div>

      {canChange && (
        <Modal
          data-testid="config-create-modal"
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title="Create a new version"
          subtitle={`The draft starts as a copy of ${currentLabel}.`}
          footer={
            <>
              <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button variant="primary" data-testid="config-create-confirm" icon={<FilePlus2 size={15} />} onClick={create}>
                Create draft
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-[13px] text-ink-2">
            <p>Change the rules, the questionnaire or both in the draft, then check and publish it. Nothing changes for suppliers or cases until you publish; running cases always keep the version they started with.</p>
            <p data-testid="config-create-numbers" className="rounded-lg bg-surface-2 px-3 py-2">
              Only what you change gets a new number: changed rules become <span className="font-medium text-ink">{next.ruleSetVersion}</span>, a changed questionnaire becomes <span className="font-medium text-ink">{shortTemplate(next.templateVersion)}</span>. The side you leave alone keeps its version.
            </p>
            <Field label="What is this version for?" hint="Optional. A short note for your colleagues, e.g. “Microplastics declaration for polymers”.">
              <TextArea data-testid="config-create-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What you plan to change" />
            </Field>
          </div>
        </Modal>
      )}

      {canChange && draft && (
        <Modal
          data-testid="config-discard-modal"
          open={discardOpen}
          onClose={() => setDiscardOpen(false)}
          title="Discard the draft?"
          footer={
            <>
              <Button onClick={() => setDiscardOpen(false)}>Keep the draft</Button>
              <Button
                variant="danger"
                data-testid="config-discard-confirm"
                icon={<Trash2 size={15} />}
                onClick={() => {
                  if (discardDraft()) {
                    setDiscardOpen(false);
                    onView(versions.find((x) => x.status === "current")?.key ?? current.ruleSetVersion);
                  }
                }}
              >
                Discard draft
              </Button>
            </>
          }
        >
          <p className="text-[13px] text-ink-2">
            {count ? `Its ${changesCount(count)} will be lost.` : "It has no changes yet."} The published versions and every case stay exactly as they are. You can create a new version again at any time.
          </p>
        </Modal>
      )}
    </Card>
  );
}
