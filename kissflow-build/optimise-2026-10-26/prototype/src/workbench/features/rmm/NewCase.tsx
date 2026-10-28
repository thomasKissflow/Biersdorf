// §8.3 New case #/cases/new (RMM; createCase.ts). Also: ?reactivate=<caseId> (same Case_Code, next cycle, within
// Settings reactivationDays of the Cancellation event) and ?draft=<id>&act=<act> (continue an interrupted create at
// Start). Owner_RMM and the BDF contact are the signed-in user (no user picker: there is no user-search API).
import { FilePlus2, Info } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, CardHeader, Mono, PageHeader } from "@/components/ui/primitives";
import { EmptyState, KeyValue } from "@/components/ui/data";
import { Checkbox, Field, Segmented, TextInput, Toggle } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { ActionError } from "../../data/actions";
import { useActions, useCaseBundle, useFormRows, useWorkbench, useWorkbenchContext } from "../../data/hooks";
import { str } from "../../data/map";
import type { Problem, RawItem, SupplierVM } from "../../data/viewModels";
import { ProblemsBanner } from "../case/panels/PanelKit";
import { ActionBanner, ErrorBanner, LoadingCard, Page, fmtDateTime } from "../case/shared";
import { usePinnedConfig } from "../case/useConfig";
import { contactChoices, createCase, defaultNewCaseInput, deriveContacts, newCaseConfigFrom, newCaseProblems, reactivationBlocker, reactivationInput, type NewCaseInput } from "./createCase";

export function NewCase() {
  const { caps, me, notify } = useWorkbench();
  const actions = useActions();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const reactivateId = params.get("reactivate");
  const draftParam = params.get("draft") && params.get("act") ? { instanceId: params.get("draft")!, activityInstanceId: params.get("act")! } : null;
  const now = useMemo(() => new Date(), []);

  const suppliersQ = useFormRows<SupplierVM>("CIQ_Supplier_A00");
  const suppliers = useMemo(() => (suppliersQ.data ?? []).filter((s) => s.active).sort((a, b) => a.legalName.localeCompare(b.legalName)), [suppliersQ.data]);
  const old = useCaseBundle(reactivateId);
  const [input, setInput] = useState<NewCaseInput>(() => defaultNewCaseInput(now, null));
  const cfgState = usePinnedConfig(null, { test: input.isTest });
  const cfg = useMemo(() => newCaseConfigFrom(cfgState.pinned), [cfgState.pinned]);
  const defaultsApplied = useRef(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(draftParam);
  const [prefilled, setPrefilled] = useState(false);

  // Settings defaults (due date, overall approval) once the pinned config is read
  useEffect(() => {
    if (!cfg || defaultsApplied.current || reactivateId || draftParam) return;
    defaultsApplied.current = true;
    setInput((i) => ({ ...i, supplierDueDate: defaultNewCaseInput(now, cfg.settings).supplierDueDate, overallApprovalRequired: cfg.settings.overallApprovalRequired }));
  }, [cfg, reactivateId, draftParam, now]);

  // reactivation prefill from the cancelled case's read fields
  useEffect(() => {
    if (prefilled || !reactivateId || !old.data || !suppliersQ.data) return;
    const sup = suppliers.find((s) => s.code === old.data!.case.supplierCode) ?? null;
    setInput(reactivationInput(old.data.case, sup, now, cfg?.settings ?? null));
    setPrefilled(true);
  }, [prefilled, reactivateId, old.data, suppliersQ.data, suppliers, now, cfg]);

  // draft prefill (continue an interrupted create)
  const { client } = useWorkbenchContext();
  const [draftErr, setDraftErr] = useState<string | null>(null);
  useEffect(() => {
    if (prefilled || !draftParam || !suppliersQ.data) return;
    let alive = true;
    client
      .getItem("CIQ_Case_A00", draftParam.instanceId, draftParam.activityInstanceId)
      .then((raw: RawItem) => {
        if (!alive) return;
        const sup = suppliers.find((s) => s.code === str(raw, "Supplier_Code")) ?? null;
        const emails = str(raw, "Supplier_Contact_Emails").toLowerCase().split(/[,;\s]+/).filter(Boolean);
        setInput({
          ...defaultNewCaseInput(now, cfg?.settings ?? null),
          supplier: sup,
          contactIds: (sup?.contacts ?? []).filter((c) => emails.includes(c.email.toLowerCase())).map((c) => c._id),
          tradeName: str(raw, "Trade_Name"),
          mainInci: str(raw, "Main_INCI"),
          bdfMaterialNo: str(raw, "BDF_Material_No"),
          sapMaterialNo: str(raw, "SAP_Material_No"),
          irmaRef: str(raw, "IRMA_Ref"),
          caseTitle: str(raw, "Case_Title"),
          targetMarketsText: str(raw, "Target_Markets_Text"),
          marketsLabel: str(raw, "Markets_Label"),
          supplierDueDate: str(raw, "Supplier_Due_Date").slice(0, 10) || defaultNewCaseInput(now, cfg?.settings ?? null).supplierDueDate,
          overallApprovalRequired: str(raw, "Overall_Approval_Required") === "Yes",
          isTest: str(raw, "Case_Test") === "Yes",
        });
        setPrefilled(true);
      })
      .catch((e: unknown) => alive && setDraftErr(`The draft could not be read: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      alive = false;
    };
  }, [prefilled, draftParam, suppliersQ.data, suppliers, client, now, cfg]);

  if (!caps.canInitiate("CIQ_Case_A00"))
    return (
      <Page testId="wb-newcase">
        <Card>
          <EmptyState title="Not available for your role">Only the Raw Material Manager (RMM) creates cases.</EmptyState>
        </Card>
      </Page>
    );

  const re = reactivateId && old.data ? { from: old.data.case } : undefined;
  const reactBlock = reactivateId ? (old.data ? reactivationBlocker(old.data.case, old.data.events, cfg?.settings ?? { reactivationDays: 365 }, now) : old.error) : null;
  const set = <K extends keyof NewCaseInput>(k: K, v: NewCaseInput[K]) => setInput((i) => ({ ...i, [k]: v }));
  const choices = contactChoices(input.supplier);
  const selected = choices.filter((x) => input.contactIds.includes(x.contact._id)).map((x) => x.contact);
  const derived = deriveContacts(selected);
  const err = (f: string) => problems.find((p) => p.field === f)?.message;

  const submit = async () => {
    setError(null);
    const ps = newCaseProblems(input, cfg);
    if (reactBlock) ps.unshift({ field: "Reactivates_Case_Item", label: "Reactivation", message: reactBlock });
    setProblems(ps);
    if (ps.length || !cfg) return;
    setBusy(true);
    try {
      const r = await createCase({ ...actions, now: () => new Date(), me }, input, cfg, { reactivate: re, draft: draft ?? undefined });
      const failed = r.setup.section === "failed" || r.setup.audit === "failed";
      notify(failed ? `Case ${r.caseCode} created. Setup is not finished: use Finish setup on the case.` : `Case ${r.caseCode} created.`, failed ? "warning" : "success");
      nav(`/cases/${r.instanceId}`);
    } catch (e) {
      if (e instanceof ActionError) {
        if (e.draft) setDraft(e.draft);
        setProblems(e.problems);
        setError(e.draft ? `${e.message} The draft is kept: fix the values and press Create case again.` : e.message);
      } else {
        const ps2 = (e as { problems?: Problem[] }).problems;
        if (ps2) setProblems(ps2);
        else setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const loading = suppliersQ.loading && !suppliersQ.data;
  return (
    <Page testId="wb-newcase">
      <PageHeader
        eyebrow={reactivateId ? "Reactivate" : draft ? "Continue draft" : "New case"}
        title={reactivateId ? `Reactivate ${old.data?.case.caseCode ?? "case"}` : "New case"}
        subtitle={reactivateId ? "A new cycle of the cancelled case: same case code, next cycle." : "Creates the case in Kissflow, then its basic-data section and the audit event. Supplier hand-offs are not connected yet."}
      />
      <ErrorBanner error={suppliersQ.error ? `Suppliers: ${suppliersQ.error}` : null} onRetry={suppliersQ.reload} />
      <ErrorBanner error={cfgState.error ? `Configuration: ${cfgState.error}` : null} onRetry={cfgState.reload} />
      <ErrorBanner error={draftErr} />
      {reactivateId && reactBlock && <ActionBanner result={{ ok: false, message: `This case cannot be reactivated: ${reactBlock}` }} />}
      {loading ? (
        <LoadingCard label="Loading suppliers and configuration…" rows={6} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <Card>
              <CardHeader title="Supplier and contacts" subtitle="Tick the contacts for this case. At least one must be allowed to confirm and have a portal user id." />
              <div className="space-y-4 p-4">
                <Field label="Supplier" required error={err("Supplier_Code")}>
                  <div data-testid="wb-newcase-supplier">
                    <Select
                      value={input.supplier?._id ?? ""}
                      onChange={(e) => {
                        const s = suppliers.find((x) => x._id === e.target.value) ?? null;
                        setInput((i) => ({ ...i, supplier: s, contactIds: [] }));
                      }}
                      invalid={!!err("Supplier_Code")}
                      aria-label="Supplier"
                    >
                      <option value="">Select a supplier…</option>
                      {suppliers.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.legalName}
                        </option>
                      ))}
                    </Select>
                  </div>
                </Field>
                {!suppliers.length && <p className="text-[13px] text-ink-3">No active supplier is readable. Suppliers are kept under Suppliers.</p>}
                {input.supplier && (
                  <div className="space-y-1">
                    <p className="text-[13px] font-medium text-ink">Contacts</p>
                    {choices.length ? (
                      choices.map(({ contact: c, warning }) => (
                        <div key={c._id} data-testid={`wb-newcase-contact-${c._id}`} className="flex flex-wrap items-center gap-2">
                          <Checkbox
                            checked={input.contactIds.includes(c._id)}
                            onChange={(on) => set("contactIds", on ? [...input.contactIds, c._id] : input.contactIds.filter((x) => x !== c._id))}
                            label={`${c.fullName || c.email} · ${c.email}`}
                            description={[c.role, c.canConfirm ? "can confirm" : "cannot confirm", c.portalUserId ? `portal id ${c.portalUserId}` : ""].filter(Boolean).join(" · ")}
                          />
                          {warning && <Badge tone="warn">{warning}</Badge>}
                        </div>
                      ))
                    ) : (
                      <p className="text-[13px] text-ink-3">This supplier has no active contact.</p>
                    )}
                    {(err("Confirm_Contact_Ids") || err("Portal_Contact_Ids")) && <p className="text-xs font-medium text-bad">{err("Confirm_Contact_Ids") ?? err("Portal_Contact_Ids")}</p>}
                  </div>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Material" />
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <Field label="Trade name" required error={err("Trade_Name")}>
                  <TextInput value={input.tradeName} onChange={(e) => set("tradeName", e.target.value)} invalid={!!err("Trade_Name")} data-testid="wb-field-Trade_Name" />
                </Field>
                <Field label="Main INCI" required error={err("Main_INCI")}>
                  <TextInput value={input.mainInci} onChange={(e) => set("mainInci", e.target.value)} invalid={!!err("Main_INCI")} data-testid="wb-field-Main_INCI" />
                </Field>
                <Field label="BDF material no" required error={err("BDF_Material_No")}>
                  <TextInput value={input.bdfMaterialNo} onChange={(e) => set("bdfMaterialNo", e.target.value)} invalid={!!err("BDF_Material_No")} data-testid="wb-field-BDF_Material_No" />
                </Field>
                <Field label="SAP material no">
                  <TextInput value={input.sapMaterialNo} onChange={(e) => set("sapMaterialNo", e.target.value)} data-testid="wb-field-SAP_Material_No" />
                </Field>
                <Field label="IRMA ref">
                  <TextInput value={input.irmaRef} onChange={(e) => set("irmaRef", e.target.value)} data-testid="wb-field-IRMA_Ref" />
                </Field>
                <Field label="Case title">
                  <TextInput value={input.caseTitle} onChange={(e) => set("caseTitle", e.target.value)} data-testid="wb-field-Case_Title" />
                </Field>
                <Field label="Target markets">
                  <TextInput value={input.targetMarketsText} onChange={(e) => set("targetMarketsText", e.target.value)} data-testid="wb-field-Target_Markets_Text" />
                </Field>
                <Field label="Markets label">
                  <TextInput value={input.marketsLabel} onChange={(e) => set("marketsLabel", e.target.value)} data-testid="wb-field-Markets_Label" />
                </Field>
              </div>
            </Card>
            <Card>
              <CardHeader title="Case settings" />
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <Field label="Supplier due date" required error={err("Supplier_Due_Date")} hint={cfg ? `Default: today + ${cfg.settings.defaultSupplierDueDays} days (Settings).` : undefined}>
                  <TextInput
                    type="date"
                    value={input.supplierDueDate}
                    onChange={(e) => set("supplierDueDate", e.target.value)}
                    data-testid="wb-field-Supplier_Due_Date"
                  />
                </Field>
                <Field label="Overall approval required" hint="Adds the overall approval before the final release.">
                  <Segmented value={input.overallApprovalRequired} onChange={(v) => set("overallApprovalRequired", v)} options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} />
                </Field>
                <div className="sm:col-span-2">
                  <Toggle checked={input.isTest} onChange={(v) => set("isTest", v)} label="Test case (uses the Test release; hidden from the case list by default)" />
                </div>
              </div>
            </Card>
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Pinned configuration" />
              <div className="space-y-2 p-4 text-[13px]">
                {cfgState.loading && !cfg ? (
                  <p className="text-ink-3">Reading the configuration…</p>
                ) : cfg ? (
                  <>
                    <KeyValue
                      cols={1}
                      items={[
                        { k: "Release", v: <Mono>{cfg.release.releaseKey || cfg.release.configKey}</Mono> },
                        { k: "Stage · published", v: `${cfg.release.releaseStage} · ${fmtDateTime(cfg.release.publishedAt) || "—"}` },
                        { k: "Template", v: cfg.templateLabel || "—" },
                        { k: "Basic data section", v: cfg.basic ? `${cfg.basic.code} ${cfg.basic.title}` : "missing" },
                      ]}
                    />
                    {cfg.problems.map((p, i) => (
                      <p key={i} className="text-bad">
                        {p}
                      </p>
                    ))}
                  </>
                ) : (
                  <p className="text-bad">No published {input.isTest ? "Test" : "Live"} release is readable, so no case can be created.</p>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Set by the Workbench" />
              <div className="space-y-2 p-4 text-[13px]">
                <KeyValue
                  cols={1}
                  items={[
                    { k: "Owner RMM and BDF contact", v: `${me.Name} · ${me.Email || "—"}` },
                    { k: "Portal contact ids", v: derived.Portal_Contact_Ids || "—" },
                    { k: "Confirm contact ids", v: derived.Confirm_Contact_Ids || "—" },
                    { k: "Supplier contact e-mails", v: derived.Supplier_Contact_Emails || "—" },
                    { k: "Cycle", v: re ? String((re.from.cycleNo ?? 1) + 1) : "1" },
                    { k: "Case code", v: re ? re.from.caseCode : "CIQ-<year>-<item id>, after the create" },
                  ]}
                />
                <p className="flex gap-1.5 text-ink-3">
                  <Info size={13} className="mt-0.5 shrink-0" aria-hidden /> The portal is not contacted; the supplier is not notified automatically.
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}
      <div data-testid="wb-newcase-errors">
        <ProblemsBanner problems={problems} title="Nothing was created. Fix these first." />
        {error && <ActionBanner result={{ ok: false, message: error }} />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/my-work">
          <span className="text-[13px] text-ink-3 hover:text-ink">Back to My work</span>
        </Link>
        <span className="flex-1" />
        <Button variant="primary" icon={<FilePlus2 size={16} />} disabled={busy || loading || (cfgState.loading && !cfg) || !!(reactivateId && !old.data)} onClick={submit} data-testid="wb-newcase-submit">
          {busy ? "Creating…" : reactivateId ? "Create the new cycle" : draft ? "Create case from the draft" : "Create case"}
        </Button>
      </div>
    </Page>
  );
}
