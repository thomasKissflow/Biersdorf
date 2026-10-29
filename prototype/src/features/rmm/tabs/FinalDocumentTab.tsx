// Final document tab (spec §1.10, AS-12, R-2): the immutable document generated automatically at the supplier's final
// release, shown on screen only. It holds the case header and CIQ ID, the released answers by section, the K2.1
// components, the evidence list, every open-point thread round by round, and all confirmations, with a fingerprint
// over its content. It holds no RMES decision, finding or internal note. Internal only. "Download PDF" (Thomas, 22 Oct)
// saves exactly the PDF the final-document service attaches to the case (../finalPdf.ts), once the case is completed.
// Phones (< 768 px, Thomas 30 Oct): Download PDF moves into the case page's bar above the tab bar (CaseDetail.tsx), the
// header's case ID and seal sit under the title, and the tables (composition, evidence) become one card per row.
import { Download, FileCheck2, Paperclip, ShieldAlert, ShieldCheck } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { Badge, Button, Card, CardList, CardListItem, Mono, Table, Td, Tr, cx } from "@/components/ui";
import { kindLabel } from "@/components/status";
import { MARKET_LABEL, ORIGIN_LABEL, shownCode } from "@/domain/catalog";
import { additiveText, concText } from "@/domain/composition";
import { verifyFinalDocument } from "@/domain/finalDocument";
import { MESSAGE_ACTION_LABEL, fmtDate, fmtDateTime } from "@/domain/selectors";
import type { CiqCase, FinalDocument } from "@/domain/types";
import { useIsPhone } from "@/shell/useLayoutMode";
import { finalPdfOf } from "../finalPdf";
import { ComponentCards } from "../phone";

/** Saves the document's PDF (<Case_Code>-final-document.pdf); a failure is said under the button, nothing else changes.
 *  `bar`: the phone's action bar holds it (a 44 px primary button, the failure beside it). */
export function DownloadPdf({ d, bar }: { d: FinalDocument; bar?: boolean }) {
  const [failed, setFailed] = useState(false);
  const save = () => {
    try {
      const { bytes, name } = finalPdfOf(d);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };
  if (bar)
    return (
      <>
        {failed && <span className="mr-auto min-w-0 flex-1 text-[11.5px] text-bad">The PDF could not be made. Please try again.</span>}
        <Button variant="primary" icon={<Download size={15} aria-hidden />} onClick={save} data-testid="fd-download-pdf">
          Download PDF
        </Button>
      </>
    );
  return (
    <span className="mt-2 flex flex-col items-end gap-1">
      <Button size="sm" icon={<Download size={14} aria-hidden />} onClick={save} data-testid="fd-download-pdf">
        Download PDF
      </Button>
      {failed && <span className="text-[11.5px] text-bad">The PDF could not be made. Please try again.</span>}
    </span>
  );
}

/** The metadata answers SF-01…SF-12 that set the scope, as released (documents generated before this block have none). */
function MetadataBlock({ d }: { d: FinalDocument }) {
  if (!d.metadata?.length) return null;
  return (
    <section data-testid="fd-metadata">
      <h4 className="flex flex-wrap items-baseline gap-2 border-b border-line pb-1.5 text-[14px] font-semibold text-ink">
        Metadata answers <span className="text-[11.5px] font-normal text-ink-3">SF-01 to SF-12 · they set the scope</span>
      </h4>
      <dl className="mt-1 divide-y divide-line">
        {d.metadata.map((m) => (
          <div key={m.id} className="grid gap-0.5 py-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4" data-testid={`fd-metadata-${m.id}`}>
            <dt className="text-[12.5px] text-ink-2">
              <Mono className="mr-1.5 text-[11.5px] text-ink-3">{m.code}</Mono>
              {m.label}
            </dt>
            <dd className="text-[13px] text-ink">
              {m.value === "—" ? <span className="text-ink-3">Not answered</span> : m.value}
              {(m.setByBdf || m.by) && (
                <span className="mt-0.5 block text-[11.5px] text-ink-3">
                  {m.setByBdf ? "Set by Beiersdorf at case start" : `${m.by}${m.at ? ` · ${fmtDateTime(m.at)}` : ""}`}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function FinalDocumentTab({ c }: { c: CiqCase }) {
  const d = c.finalDocument;
  if (!d) return null;
  const ok = verifyFinalDocument(d);
  const h = d.header;
  const phone = useIsPhone();
  return (
    <div className="mx-auto max-w-[900px]">
      <Card className="overflow-hidden" data-testid="final-document">
        <header className={cx("border-b border-line", phone ? "px-4 py-5" : "px-6 py-6 sm:px-10 sm:py-8")}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-brand uppercase">
                <FileCheck2 size={14} aria-hidden /> CIQ final document
              </p>
              <h2 className="mt-1.5 text-[22px] leading-tight font-semibold tracking-tight text-ink">{h.materialName}</h2>
              <p className="mt-1 text-[13.5px] text-ink-2">{h.inci}</p>
            </div>
            <div className={phone ? "text-left" : "text-right"}>
              <Mono className="block text-[15px] font-semibold text-ink">{h.caseId}</Mono>
              <span className="mt-1 inline-flex" data-testid="fd-fingerprint" data-verified={ok ? "true" : "false"}>
                <Badge tone={ok ? "ok" : "bad"}>
                  {ok ? <ShieldCheck size={12} aria-hidden /> : <ShieldAlert size={12} aria-hidden />} {ok ? "Document seal: unchanged" : "Document seal broken"}
                </Badge>
              </span>
              {c.phase === "completed" && !phone && <DownloadPdf d={d} />}
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-2.5 text-[13px] sm:grid-cols-2">
            <Meta k="BDF material no." v={<Mono>{h.materialNo}</Mono>} />
            <Meta k="Supplier" v={`${h.supplierName} · DUNS ${h.duns}`} />
            <Meta k="Manufacturer" v={h.manufacturer || "—"} />
            <Meta k="Production site" v={h.site || "—"} />
            <Meta k="Target markets" v={h.markets.map((m) => MARKET_LABEL[m]).join(", ") || "—"} />
            <Meta k="Questionnaire · rule set" v={<><Mono>{h.templateVersion}</Mono> · <Mono>{h.ruleSetVersion}</Mono></>} />
            <Meta k="Case owner (RMM)" v={h.ownerName} />
            <Meta k="Case started · released" v={`${fmtDate(h.createdAt)} · ${fmtDateTime(h.releasedAt)}`} />
          </dl>
          <p className="mt-5 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
            Created automatically at the supplier's final release ({d.trigger.replace(/^Final release by /, "")}, {fmtDateTime(d.generatedAt)}). It cannot be changed.{" "}
            {ok ? "The document seal confirms it is unchanged since the final release." : "The document seal is broken: the content has changed since the final release. Report this to the business administrator."}
          </p>
        </header>

        <Part n={1} title="Released answers by section" testId="fd-sections">
          <div className="space-y-6">
            {!d.sections.some((s) => s.sectionId === "GEN" && hasAnswers(s)) && <MetadataBlock d={d} />}
            {d.sections.filter(hasAnswers).map((s) => (
              <Fragment key={s.sectionId}>
              <section data-testid={`fd-section-${s.sectionId}`}>
                <h4 className="flex flex-wrap items-baseline gap-2 border-b border-line pb-1.5 text-[14px] font-semibold text-ink">
                  {shownCode(s.code, s.title) && <Mono>{s.code}</Mono>} {s.title}
                  <span className="text-[11.5px] font-normal text-ink-3">{s.applicability === "na" ? "Not applicable, justified" : s.applicability === "mandatory" ? "Mandatory" : "Optional"}{s.addedLater ? " · added after completeness" : ""}</span>
                </h4>
                {s.justification && <p className="mt-2 text-[13px] text-ink-2">Justification: {s.justification}</p>}
                {s.answers.length === 0 ? (
                  <p className="mt-2 text-[12.5px] text-ink-3">{s.sectionId === "K2.1" ? "See the composition in part 2." : "No field-level answers."}</p>
                ) : (
                  <dl className="mt-1 divide-y divide-line">
                    {s.answers.map((a) => (
                      <div key={a.fieldId} className="grid gap-0.5 py-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
                        <dt className="text-[12.5px] text-ink-2">{a.label}</dt>
                        <dd className="text-[13px] text-ink">
                          <span className="whitespace-pre-line">{a.value}</span>
                          {a.justification && <span className="mt-0.5 block text-[12px] text-ink-2 italic">Justification: {a.justification}</span>}
                          {a.by && (
                            <span className="mt-0.5 block text-[11.5px] text-ink-3">
                              {a.by}
                              {a.at ? ` · ${fmtDateTime(a.at)}` : ""}
                            </span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
              {s.sectionId === "GEN" && <MetadataBlock d={d} />}
              </Fragment>
            ))}
            {d.sections.some((s) => !hasAnswers(s)) && (
              <section data-testid="fd-sections-other">
                <h4 className="border-b border-line pb-1.5 text-[14px] font-semibold text-ink">Further sections in scope</h4>
                <p className="mt-2 text-[12.5px] text-ink-2">Answered with documents (the CIQ template document, statements or certificates). Each section shows the files uploaded to it, which are also listed under Evidence (part 3).</p>
                <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-[12.5px] text-ink-2 sm:grid-cols-2">
                  {d.sections
                    .filter((s) => !hasAnswers(s))
                    .map((s) => {
                      const files = d.evidence.filter((e) => e.sectionId === s.sectionId);
                      return (
                        <li key={s.sectionId} data-testid={`fd-section-${s.sectionId}`} data-files={files.length} className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <Mono className="shrink-0 text-ink">{shownCode(s.code, s.title)}</Mono>
                            <span className="min-w-0 truncate" title={s.title}>
                              {s.title}
                            </span>
                            <span className="ml-auto shrink-0 text-[11px] text-ink-3">
                              {files.length ? `${files.length} ${files.length === 1 ? "document" : "documents"}` : "No document provided"}
                              {s.addedLater ? " · added later" : ""}
                            </span>
                          </div>
                          {files.length > 0 && <p className="mt-0.5 text-[11.5px] text-ink-3 [overflow-wrap:anywhere]">{files.map((e) => e.name).join(", ")}</p>}
                        </li>
                      );
                    })}
                </ul>
              </section>
            )}
          </div>
        </Part>

        <Part n={2} title="Composition (K2.1)" testId="fd-components">
          {d.components.length === 0 ? (
            <p className="text-[13px] text-ink-3">No components.</p>
          ) : phone ? (
            <ComponentCards rows={d.components} />
          ) : (
            <Table dense head={["#", "INCI / IUPAC", "CAS", "EC / REACH no.", "Function", "Origin", "Additive", "Concentration"]}>
              {d.components.map((r, i) => (
                <Tr key={r.id}>
                  <Td className="text-ink-3">{i + 1}</Td>
                  <Td className="font-medium">{r.inci}</Td>
                  <Td className="whitespace-nowrap">
                    <Mono>{r.cas ?? "—"}</Mono>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <Mono>{r.ec ?? "—"}</Mono>
                  </Td>
                  <Td className="text-ink-2">{r.fn}</Td>
                  <Td className="text-ink-2">{ORIGIN_LABEL[r.origin].split(" (")[0]}</Td>
                  <Td className="text-ink-2">{additiveText(r.additive)}</Td>
                  <Td className="whitespace-nowrap">{concText(r)}</Td>
                </Tr>
              ))}
            </Table>
          )}
        </Part>

        <Part n={3} title="Evidence" testId="fd-evidence">
          {d.evidence.length === 0 ? (
            <p className="text-[13px] text-ink-3">No documents were uploaded.</p>
          ) : phone ? (
            <CardList label="Evidence">
              {d.evidence.map((e) => (
                <CardListItem
                  key={e.documentId}
                  data-testid={e.requested ? `fd-requested-${e.documentId}` : undefined}
                  title={
                    e.justification !== undefined ? (
                      <span className="text-ink-2 [overflow-wrap:anywhere]">Not provided</span>
                    ) : (
                      <span className="inline-flex items-start gap-1.5">
                        <Paperclip size={13} className="mt-1 shrink-0 text-ink-3" aria-hidden />
                        <span className="[overflow-wrap:anywhere]">{e.name}</span>
                      </span>
                    )
                  }
                  meta={
                    <>
                      <Mono>{e.sectionCode}</Mono>
                      {e.fieldLabel && <> · {e.fieldLabel}</>}
                    </>
                  }
                  fields={[
                    { label: e.justification !== undefined ? "Justified by" : "Uploaded by", value: e.uploadedBy },
                    { label: "Upload date", value: fmtDateTime(e.uploadedAt) },
                  ]}
                >
                  {e.justification !== undefined && <span className="italic">Justification: {e.justification}</span>}
                </CardListItem>
              ))}
            </CardList>
          ) : (
            <Table dense head={["Document", "Section / question", "Uploaded by", "Upload date"]}>
              {d.evidence.map((e) => (
                <Tr key={e.documentId} data-testid={e.requested ? `fd-requested-${e.documentId}` : undefined} data-status={e.requested ? (e.justification !== undefined ? "justified" : "received") : undefined}>
                  <Td className="max-w-[300px] min-w-[180px]">
                    {e.justification !== undefined ? (
                      <>
                        <span className="font-medium text-ink-2 [overflow-wrap:anywhere]">Not provided</span>
                        <span className="mt-0.5 block text-[12px] text-ink-2 italic">Justification: {e.justification}</span>
                      </>
                    ) : (
                      <span className="inline-flex items-start gap-1.5">
                        <Paperclip size={13} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                        <span className="font-medium [overflow-wrap:anywhere]">{e.name}</span>
                      </span>
                    )}
                  </Td>
                  <Td className="min-w-[160px]">
                    <Mono>{e.sectionCode}</Mono>
                    {e.fieldLabel && <span className="block text-[12px] text-ink-3">{e.fieldLabel}</span>}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-2">
                    {e.uploadedBy}
                    {e.justification !== undefined && <span className="block text-[11.5px] text-ink-3">justified</span>}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-2">{fmtDateTime(e.uploadedAt)}</Td>
                </Tr>
              ))}
            </Table>
          )}
        </Part>

        <Part n={4} title="Open points, round by round" testId="fd-threads">
          {d.threads.length === 0 ? (
            <p className="text-[13px] text-ink-3">No open point was raised.</p>
          ) : (
            <div className="space-y-5">
              {d.threads.map((t) => (
                <Thread key={t.opId} t={t} />
              ))}
            </div>
          )}
        </Part>

        <Part n={5} title="Confirmations" testId="fd-confirmations">
          <ul className="divide-y divide-line">
            {d.confirmations.map((x, i) => (
              <li key={`${x.type}-${x.at}-${i}`} className="grid gap-0.5 py-2.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_auto] sm:gap-4" data-testid={`fd-confirmation-${x.type}`}>
                <span className="text-[13px] font-medium text-ink">{x.label}</span>
                <span className="text-[12.5px] text-ink-2">
                  {x.name} · {x.role} · <span className="text-ink-3">{x.email}</span>
                  {x.note && <span className="mt-0.5 block text-[12px] text-ink-3">{x.note}</span>}
                </span>
                <span className="text-[12px] whitespace-nowrap text-ink-3">{fmtDateTime(x.at)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-ink-3">None of these confirmations is a raw-material approval.</p>
        </Part>

        <footer className={cx("flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2", phone ? "px-4" : "px-6", "py-3 text-[12px] text-ink-3", !phone && "sm:px-10")}>
          <span>
            {d.id} · generated {fmtDateTime(d.generatedAt)}
          </span>
          <span>
            <span className={cx("inline-flex items-center gap-1", ok ? "text-ok" : "text-bad")}>{ok ? <ShieldCheck size={12} aria-hidden /> : <ShieldAlert size={12} aria-hidden />} Document seal</span> <span title="Seal code: recalculated from the content each time the document opens"><Mono className="text-ink-3">{d.fingerprint}</Mono></span>
          </span>
        </footer>
      </Card>
    </div>
  );
}

/** Sections shown with their own block: answers, a justification, or the K2.1 pointer to the composition. */
const hasAnswers = (s: FinalDocument["sections"][number]) => s.answers.length > 0 || !!s.justification || s.sectionId === "K2.1";

function Meta({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-ink-3">{k}</dt>
      <dd className="text-ink [overflow-wrap:anywhere]">{v}</dd>
    </div>
  );
}

function Part({ n, title, testId, children }: { n: number; title: string; testId: string; children: ReactNode }) {
  const phone = useIsPhone();
  return (
    <section className={cx("border-b border-line", phone ? "px-4 py-5" : "px-6 py-6", "last:border-b-0", !phone && "sm:px-10")} data-testid={testId}>
      <h3 className="mb-3 text-[15px] font-semibold text-ink">
        <span className="text-ink-3">{n}.</span> {title}
      </h3>
      {children}
    </section>
  );
}

function Thread({ t }: { t: FinalDocument["threads"][number] }) {
  return (
    <article data-testid={`fd-op-${t.opId}`} className="rounded-lg border border-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line bg-surface-2 px-3.5 py-2">
        <p className="text-[13px] text-ink">
          <Mono className="font-semibold">{t.opId}</Mono> · {kindLabel(t.kind)} · {t.ref}
        </p>
        <span className="text-[12px] text-ink-3">
          Raised by {t.raisedBy}, {fmtDateTime(t.raisedAt)} · <span className={cx("font-medium", t.result === "Accepted" ? "text-ok" : "text-ink-2")}>{t.result}</span>
        </span>
      </div>
      <ol className="divide-y divide-line">
        {t.rounds.map((r) => (
          <li key={r.n} className="px-3.5 py-2.5">
            <p className="text-[11.5px] font-semibold tracking-wide text-ink-3 uppercase">Round {r.n}</p>
            <ul className="mt-1.5 space-y-2">
              {r.entries.map((e, i) => (
                <li key={`${e.at}-${i}`} className="text-[13px]">
                  <p className="text-[12px] text-ink-3">
                    <span className="font-medium text-ink-2">{e.by}</span> ({e.side === "supplier" ? "supplier" : "Beiersdorf"}) · {MESSAGE_ACTION_LABEL[e.action]} · {fmtDateTime(e.at)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-line text-ink">{e.text}</p>
                  {e.attachment && (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-ink-2">
                      <Paperclip size={12} aria-hidden /> {e.attachment}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </article>
  );
}
