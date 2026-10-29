// RMES tab (Safety and Regulatory only): the Raw Material Evaluation Sheet as BDF scoped it for the MVP (e-mail of
// 28 Oct, "exactly the scope … no more"): ONE read-only sheet of 8 fields, the same for both departments, derived live
// from the case by rmesSheet() (domain/rmesSheet.ts; nothing stored). The header (trade name, supplier, manufacturer)
// and the composition, each with its CIQ source reference (REQ-PROC-022); a source opens its section in the
// Questionnaire tab. Nothing here is editable: the Safety / Regulatory decision is on the Questionnaire tab
// (DecisionCard). A case the role could not read (live: the shell's case banner) shows one notice instead of the fields.
// On a phone (< 768 px) the composition is one stacked row per component instead of the 7-column table.
import { ArrowUpRight, Lock, TriangleAlert } from "lucide-react";
import { useAppExtras } from "@/app-live/extras";
import { useLiveFeatures } from "@/components/liveFeatures";
import { Card, CardHeader, Mono, cx } from "@/components/ui";
import { RMES_RECORD_NO_TIME, type RmesSheet, type RmesSource, type RmesValue, rmesSheet } from "@/domain/rmesSheet";
import { fmtDateTime } from "@/domain/selectors";
import type { AppState, CiqCase } from "@/domain/types";
import { useIsPhone } from "@/shell/useLayoutMode";
import { tap } from "./phone";
import { Notice, rmesRecordPending, secCode } from "./shared";

type Readable = Extract<RmesSheet, { readable: true }>;

/** "GEN · FLD-GEN-004 Manufacturer (name and address)": where the value comes from; opens its section when it can. */
function SourceRef({ c, source, onJump }: { c: CiqCase; source: RmesSource; onJump?: (sectionId: string) => void }) {
  const phone = useIsPhone();
  const code = secCode(source.sectionId, c.templateVersion);
  const text = (
    <>
      <span>{code}</span>
      <span aria-hidden>·</span>
      <Mono className="text-[11.5px]">{source.fieldId}</Mono>
      {/* the arrow stays with the label's last word when the line wraps */}
      <span className="min-w-0">
        {source.label}
        {onJump && <ArrowUpRight size={12} className="ml-0.5 inline-block align-[-2px]" />}
      </span>
    </>
  );
  if (!onJump) return <span className="inline-flex flex-wrap items-center gap-x-1 text-[11.5px] text-ink-3">{text}</span>;
  return (
    <button
      type="button"
      onClick={() => onJump(source.sectionId)}
      className={phone ? "inline-flex min-h-7 flex-wrap items-center gap-x-1 rounded py-1 text-left text-[11.5px] text-ink-3 hover:text-brand" : "inline-flex flex-wrap items-center gap-x-1 rounded text-left text-[11.5px] text-ink-3 hover:text-brand"}
      title={`Open ${code} in the questionnaire`}
      data-testid={`rmes-source-${source.fieldId}`}
    >
      {text}
    </button>
  );
}

/** A value as the CIQ holds it: the answer, the supplier's "Cannot provide: …", or "Not answered yet". */
function ValueText({ v, className }: { v: RmesValue; className?: string }) {
  return <span className={cx("break-words whitespace-pre-line", v.state === "answered" ? "text-ink" : v.state === "cannot-provide" ? "text-ink-2" : "text-ink-3", className)}>{v.text}</span>;
}

function HeaderBlock({ c, sheet, onJump }: { c: CiqCase; sheet: Readable; onJump: (sectionId: string) => void }) {
  return (
    <dl className="divide-y divide-line">
      {sheet.header.map((h) => (
        <div key={h.key} className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[200px_minmax(0,1fr)]" data-testid={`rmes-header-${h.key}`}>
          <dt className="pt-0.5 text-[12.5px] text-ink-3">{h.label}</dt>
          <dd className="min-w-0">
            <ValueText v={h} className="block text-[14px]" />
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-ink-3">
              <SourceRef c={c} source={h.source} onJump={onJump} />
              {(h.at || h.note) && <span>{[h.at && `as of ${fmtDateTime(h.at)}`, h.note].filter(Boolean).join(" · ")}</span>}
            </p>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Phones: one component of the composition as a stacked row: its INCI, then the other columns as labelled values (each
 *  label with its CIQ field), then the free text per origin type with its sources. */
function PhoneRow({ c, sheet, r, i, shared, onJump }: { c: CiqCase; sheet: Readable; r: Readable["rows"][number]; i: number; shared: Set<string>; onJump: (sectionId: string) => void }) {
  const col = (key: string) => sheet.columns.find((x) => x.key === key);
  const head = (key: string) => {
    const x = col(key);
    return (
      <dt className="text-[11.5px] text-ink-3">
        {x?.label} <Mono className="text-[11px]">{x?.sources[0]?.fieldId}</Mono>
      </dt>
    );
  };
  return (
    <li className="px-4 py-3" data-testid={`rmes-row-${r.rowId}`}>
      <p className="text-[14px] font-medium break-words text-ink">
        <span className="mr-1.5 font-normal text-ink-3">{i + 1}.</span>
        {r.inci}
      </p>
      <p className="mt-0.5 text-[11.5px] text-ink-3">
        {col("inci")?.label} <Mono className="text-[11px]">{col("inci")?.sources[0]?.fieldId}</Mono>
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        <div className="min-w-0">
          {head("conc")}
          <dd className="mt-0.5 text-ink">{r.conc}</dd>
        </div>
        <div className="min-w-0">
          {head("cas")}
          <dd className="mt-0.5">
            <Mono className="text-ink">{r.cas}</Mono>
          </dd>
        </div>
        <div className="min-w-0">
          {head("ec")}
          <dd className="mt-0.5">
            <Mono className="text-ink">{r.ec}</Mono>
          </dd>
        </div>
        <div className="min-w-0">
          {head("origin")}
          <dd className="mt-0.5 text-ink-2">{r.originLabel}</dd>
        </div>
        <div className="col-span-2 min-w-0">
          <dt className="text-[11.5px] text-ink-3">{col("freeText")?.label} · per origin type (K2.3)</dt>
          <dd className="mt-0.5 space-y-1.5">
            {r.freeText.map((t) => (
              <div key={t.source.fieldId}>
                <ValueText v={t} />
                {shared.has(r.origin) && (
                  <sup className="ml-0.5 text-ink-3" aria-hidden>
                    *
                  </sup>
                )}
                <div>
                  <SourceRef c={c} source={t.source} onJump={onJump} />
                </div>
              </div>
            ))}
          </dd>
        </div>
      </dl>
    </li>
  );
}

function Composition({ c, sheet, onJump }: { c: CiqCase; sheet: Readable; onJump: (sectionId: string) => void }) {
  const phone = useIsPhone();
  const shared = new Set(sheet.sharedOrigins);
  const k21 = sheet.columns.find((x) => x.key === "inci")!.sources[0];
  return (
    <Card data-testid="rmes-composition">
      <CardHeader
        title="Composition"
        subtitle="One row per component, in the order of the supplier's K2.1 table, with the origin information of each component."
        action={
          <button type="button" onClick={() => onJump(k21.sectionId)} className={tap(phone, "inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline")} data-testid="rmes-open-composition">
            Open {secCode(k21.sectionId, c.templateVersion)} <ArrowUpRight size={13} />
          </button>
        }
      />
      {sheet.rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-ink-3">The supplier has not entered any component yet.</p>
      ) : phone ? (
        <ul className="divide-y divide-line" aria-label="Components">
          {sheet.rows.map((r, i) => (
            <PhoneRow key={r.rowId} c={c} sheet={sheet} r={r} i={i} shared={shared} onJump={onJump} />
          ))}
        </ul>
      ) : (
        <div className="relative overflow-x-auto scrollbar-thin">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line align-bottom text-ink-3">
                <th className="py-2 pr-2 pl-4 font-medium">#</th>
                {sheet.columns.map((col) => (
                  <th key={col.key} className={cx("px-2 py-2 font-medium last:pr-4", col.key === "conc" && "text-right")} title={col.sources.map((x) => `${x.fieldId} ${x.label}`).join(", ")}>
                    <span className="block whitespace-nowrap">{col.label}</span>
                    <span className="block text-[11px] font-normal whitespace-nowrap">{col.key === "freeText" ? "per origin type (K2.3)" : <Mono className="text-[11px]">{col.sources[0]?.fieldId}</Mono>}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((r, i) => (
                <tr key={r.rowId} className="border-b border-line align-top last:border-0" data-testid={`rmes-row-${r.rowId}`}>
                  <td className="py-2.5 pr-2 pl-4 text-ink-3">{i + 1}</td>
                  <td className="px-2 py-2.5 font-medium break-words text-ink">{r.inci}</td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap text-ink">{r.conc}</td>
                  <td className="px-2 py-2.5">
                    <Mono className="text-ink">{r.cas}</Mono>
                  </td>
                  <td className="px-2 py-2.5">
                    <Mono className="text-ink">{r.ec}</Mono>
                  </td>
                  <td className="px-2 py-2.5 text-ink-2">{r.originLabel}</td>
                  <td className="min-w-[220px] py-2.5 pr-4 pl-2">
                    <div className="space-y-1.5">
                      {r.freeText.map((t) => (
                        <div key={t.source.fieldId}>
                          <ValueText v={t} />
                          {shared.has(r.origin) && (
                            <sup className="ml-0.5 text-ink-3" aria-hidden>
                              *
                            </sup>
                          )}
                          <div>
                            <SourceRef c={c} source={t.source} onJump={onJump} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sheet.rows.length > 0 && (
        <p className="border-t border-line px-4 py-2 text-[11.5px] text-ink-3" data-testid="rmes-footnote">
          {sheet.sharedOrigins.length > 0 && "* "}
          {sheet.footnote}
        </p>
      )}
    </Card>
  );
}

export function RmesTab({ c, state, onJump }: { c: CiqCase; state: AppState; onJump: (sectionId: string) => void }) {
  const { instantRmes } = useLiveFeatures();
  // live: the shell's banner reason when Kissflow did not let the role read the case in full (its answers and
  // components are missing, so the 8 fields would read as blank or wrong)
  const unreadable = useAppExtras()?.caseBanner(c.id);
  const sheet = rmesSheet(state, c, { readable: !unreadable });
  return (
    <div className="space-y-5" data-testid="rmes-tab">
      <Card>
        <CardHeader
          title="Raw Material Evaluation Sheet"
          subtitle={
            <span className="inline-flex items-start gap-1.5" data-testid="rmes-record">
              <Lock size={12} className="mt-[3px] shrink-0" />
              {sheet.record}
            </span>
          }
          action={
            <span className="block max-w-[320px] text-xs text-ink-3 sm:text-right" data-testid="rmes-record-at">
              {!c.rmes ? rmesRecordPending(instantRmes) : sheet.recordAt ? `Record created ${fmtDateTime(sheet.recordAt)}` : RMES_RECORD_NO_TIME}
            </span>
          }
        />
        {sheet.readable ? (
          <HeaderBlock c={c} sheet={sheet} onJump={onJump} />
        ) : (
          <div className="p-4">
            <Notice tone="warn" icon={<TriangleAlert size={15} />} testId="rmes-unreadable">
              {sheet.notice}
            </Notice>
          </div>
        )}
      </Card>
      {sheet.readable && <Composition c={c} sheet={sheet} onJump={onJump} />}
    </div>
  );
}
