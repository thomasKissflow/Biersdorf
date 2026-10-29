// New case (/cases/new), RMM only (spec §1.1): trade name, main INCI, BDF material no., a supplier from the master with
// one or two of its active contacts, the owner, the target markets (SF-11) and the due date. Warns about an open case
// for the same supplier and material number. Every missing item is listed at once. RMM never adds suppliers or contacts
// here: the Business administrator maintains the supplier master, so a missing one is asked for there.
// Phones (< 768 px, Thomas 30 Oct): one column of cards; Cancel and "Create case" sit in the bar above the tab bar (a
// refused Create scrolls the list of what is missing into view); fields, market chips and the priority switch are 44 px.
import { Building2, CircleAlert, Search, Send, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, CardHeader, Checkbox, Field, Mono, PageHeader, Segmented, Select, StickyActionBar, TextArea, TextInput, cx } from "@/components/ui";
import { MARKET_LABEL, sectionLabel } from "@/domain/catalog";
import { currentPair } from "@/domain/configActions";
import { ruleSet, sectionsInTemplate } from "@/domain/rules";
import { DAY, duplicateOpenCases, nowIso, userName } from "@/domain/selectors";
import { activeSuppliers, contactsOf, validateCaseContacts } from "@/domain/suppliers";
import type { Market, Supplier } from "@/domain/types";
import { useIsPhone } from "@/shell/useLayoutMode";
import { useStore } from "@/store/store";
import { PHONE_CHIP, PHONE_FIELDS, PHONE_TAPS } from "./phone";
import { NoAccess, canManage } from "./shared";

const MARKETS = Object.keys(MARKET_LABEL) as Market[];
/** Only the Business administrator maintains suppliers and contacts; RMM asks for a missing one. */
const ASK_ADMIN = "Ask the business administrator to add it in Suppliers.";
const dateInput = (iso: string) => iso.slice(0, 10);

interface Form {
  supplierId: string;
  contactIds: string[];
  materialName: string;
  inci: string;
  materialNo: string;
  markets: Market[];
  dueDate: string;
  priority: "normal" | "high";
  ownerId: string;
  duplicateNote: string;
}

type ErrKey = keyof Form;

export function NewCase() {
  const { state, persona, me, createCase } = useStore();
  const nav = useNavigate();
  const phone = useIsPhone();
  const formId = useId();
  // ?from=<caseId>: the follow-up of a change the supplier reported after the release (spec §1.12).
  const [params] = useSearchParams();
  const from = state.cases.find((x) => x.id === params.get("from") && x.phase === "completed");
  const fromReport = from ? state.changeReports.filter((r) => r.caseId === from.id).at(-1) : undefined;
  const [f, setF] = useState<Form>(() => ({
    supplierId: from && activeSuppliers(state).some((s) => s.id === from.supplierId) ? from.supplierId : "",
    contactIds: from ? from.supplierContactIds.filter((id) => contactsOf(state, from.supplierId, true).some((u) => u.id === id)) : [],
    materialName: from?.materialName ?? "",
    inci: from?.inci ?? "",
    materialNo: from?.materialNo ?? "",
    markets: from?.config.SF11?.length ? [...from.config.SF11] : ["EU"],
    dueDate: dateInput(new Date(Date.parse(nowIso()) + 60 * DAY).toISOString()),
    priority: "normal",
    ownerId: me.id,
    duplicateNote: "",
  }));
  const [tried, setTried] = useState(false);
  // a phone's Create sits in the bar at the bottom, wherever the page is scrolled: a refused Create scrolls the list of
  // what is missing into view
  const [refused, setRefused] = useState(0);
  const errorsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (refused && phone) errorsRef.current?.scrollIntoView({ block: "center" });
  }, [refused, phone]);
  const [find, setFind] = useState("");
  const [findContact, setFindContact] = useState("");
  /** While the case is being created (the live app waits for Kissflow): the case ids at the click. The new case shows
   *  at once, and must not count as an open duplicate of itself meanwhile. */
  const [sending, setSending] = useState<ReadonlySet<string> | null>(null);
  // false once the form is left: the late answer to its send must not pull the user back to the new case
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);

  if (!canManage(persona)) return <NoAccess>Only Raw Material Management starts CIQ cases.</NoAccess>;

  const suppliers = activeSuppliers(state).sort((a, b) => a.name.localeCompare(b.name));
  const supplier = suppliers.find((s) => s.id === f.supplierId);
  const contacts = supplier ? contactsOf(state, supplier.id, true) : [];
  // The newest published pair: the versions the case starts on (createCase uses the same), kept for its whole life.
  const { ruleSetVersion, templateVersion: template } = currentPair(state);
  const today = dateInput(nowIso());
  const dups = supplier && f.materialNo.trim() ? duplicateOpenCases(state, supplier.id, f.materialNo).filter((x) => !sending || sending.has(x.id)) : [];
  const owner = state.users.find((u) => u.id === f.ownerId);

  // Every problem at once, in the order of the form.
  const errors: Partial<Record<ErrKey, string>> = {};
  if (!f.materialName.trim()) errors.materialName = "Enter the trade name.";
  if (!f.inci.trim()) errors.inci = "Enter the main INCI.";
  if (!f.materialNo.trim()) errors.materialNo = "Enter the BDF material number.";
  if (!supplier) errors.supplierId = "Choose the supplier.";
  else if (!contacts.length) errors.supplierId = `${supplier.name} has no active contact. ${ASK_ADMIN}`;
  else {
    const problem = validateCaseContacts(state, supplier.id, f.contactIds);
    if (problem) errors.contactIds = f.contactIds.length ? problem : "Choose one or two case contacts.";
  }
  if (!f.markets.length) errors.markets = "Choose at least one target market.";
  if (!f.dueDate) errors.dueDate = "Set a due date.";
  else if (f.dueDate < today) errors.dueDate = "The due date must be today or later.";
  if (dups.length && !f.duplicateNote.trim()) errors.duplicateNote = "Say why a second case is needed for this material.";
  const missing = Object.values(errors);
  const err = (k: ErrKey) => (tried ? errors[k] : undefined);
  const noConfirmer = contacts.length > 0 && f.contactIds.length > 0 && !f.contactIds.some((id) => contacts.find((u) => u.id === id)?.mayConfirm !== false);

  // What the chosen markets switch on (SF-11 rules of the active rule set), shown before the case starts.
  const marketRules = ruleSet(ruleSetVersion).rules.filter((r) => r.question === "SF11" && r.when({ SF11: f.markets }));
  const inTemplate = new Set(sectionsInTemplate(template));
  const marketSections = [...new Set(marketRules.flatMap((r) => r.activates))].filter((id) => inTemplate.has(id));

  const pickSupplier = (id: string) => setF((p) => ({ ...p, supplierId: id, contactIds: contactsOf(state, id, true).slice(0, 2).map((u) => u.id), duplicateNote: "" }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (missing.length) setRefused((n) => n + 1);
    if (missing.length || sending) return;
    const input = {
      materialName: f.materialName.trim(),
      inci: f.inci.trim(),
      materialNo: f.materialNo.trim(),
      supplierId: f.supplierId,
      contactIds: f.contactIds,
      markets: f.markets,
      dueDate: new Date(`${f.dueDate}T17:00:00.000Z`).toISOString(),
      priority: f.priority,
      ownerId: f.ownerId,
      duplicateNote: dups.length ? f.duplicateNote.trim() : undefined,
      followUpOf: from && fromReport ? { caseId: from.id, reportId: fromReport.id } : undefined,
    };
    // The domain re-checks the same rules; a refusal shows its own message and the form stays. The live app gives the id
    // once Kissflow holds the case, and "" when it does not (the toast says why; the form stays as filled in, gap 6).
    const r = createCase(input);
    setSending(new Set(state.cases.map((x) => x.id)));
    void Promise.resolve(r).then((id) => {
      setSending(null);
      if (id && open.current) nav(`/cases/${id}`);
    });
  };

  const needle = find.trim().toLowerCase();
  const haystack = (s: (typeof suppliers)[number]) => [s.name, s.duns, s.country, s.city ?? "", ...contactsOf(state, s.id, true).flatMap((u) => [u.name, u.email])].join(" ").toLowerCase();
  const listed = suppliers.filter((s) => !needle || haystack(s).includes(needle));
  const contactNeedle = findContact.trim().toLowerCase();
  const shownContacts = contacts.filter((u) => !contactNeedle || `${u.name} ${u.email} ${u.title}`.toLowerCase().includes(contactNeedle) || f.contactIds.includes(u.id));

  return (
    <div>
      <PageHeader eyebrow="New CIQ case" title="Start a Cosmetic Ingredient Questionnaire" subtitle="Creates the case and gives the chosen supplier contacts one task: fill in the CIQ. Their answers to the metadata questions open the sections that apply as they go." />
      {from && fromReport && (
        <div className="mb-5 rounded-lg border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-2" data-testid="newcase-follow-up">
          <p className="font-medium text-ink">
            Follow-up of <Mono>{from.id}</Mono>: {userName(state, fromReport.by)} reported a change after the release
          </p>
          <p className="mt-0.5 whitespace-pre-line">“{fromReport.text}”</p>
          <p className="mt-1 text-[12.5px] text-ink-3">The form is pre-filled from {from.id}. Check the contacts, markets and due date before you start the case.</p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <form id={phone ? formId : undefined} onSubmit={submit} noValidate className={cx("space-y-6 xl:col-span-2", phone && PHONE_FIELDS)} data-testid="newcase-form">
          <Card>
            <CardHeader title="Raw material" subtitle="Pre-filled for the supplier, who sees but cannot change it" />
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <Field label="Trade name" required error={err("materialName")}>
                <TextInput value={f.materialName} onChange={(e) => setF({ ...f, materialName: e.target.value })} placeholder="e.g. HELIOSOFT 200" invalid={!!err("materialName")} data-testid="newcase-material" />
              </Field>
              <Field label="Main INCI" required error={err("inci")}>
                <TextInput value={f.inci} onChange={(e) => setF({ ...f, inci: e.target.value })} placeholder="e.g. Helianthus Annuus Seed Oil" invalid={!!err("inci")} data-testid="newcase-inci" />
              </Field>
              <Field label="BDF material no." required error={err("materialNo")} hint="The Teamcenter reference, entered manually">
                <TextInput value={f.materialNo} onChange={(e) => setF({ ...f, materialNo: e.target.value })} placeholder="e.g. RM-405217" className="font-mono" invalid={!!err("materialNo")} data-testid="newcase-material-no" />
              </Field>
              <Field label="Case owner" hint={owner && owner.id !== me.id ? `${owner.name} will own the case and do the RMM review.` : "Owns the case and does the RMM review of the whole CIQ"}>
                <div data-testid="newcase-owner">
                  <Select value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>
                    {state.users
                      .filter((u) => u.side === "internal" && u.dept === "RMM" && u.active !== false)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                          {u.id === me.id ? " (me)" : ""}
                        </option>
                      ))}
                  </Select>
                </div>
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Supplier and case contacts" subtitle="Active suppliers from the supplier master. The case contacts get the invitation e-mail and fill in the CIQ." />
            <div className="space-y-4 p-4">
              <div className="relative max-w-md">
                <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
                <TextInput aria-label="Find a supplier" placeholder="Find by supplier, DUNS, country, city or contact…" value={find} onChange={(e) => setFind(e.target.value)} className="pl-9" data-testid="newcase-supplier-search" />
              </div>
              <div role="radiogroup" aria-label="Supplier" className="grid gap-2 sm:grid-cols-2">
                {listed.map((s) => (
                  <SupplierChoice key={s.id} s={s} selected={s.id === f.supplierId} activeContacts={contactsOf(state, s.id, true).length} onPick={() => pickSupplier(s.id)} />
                ))}
                {listed.length === 0 && <p className="text-[13px] text-ink-3 sm:col-span-2">{suppliers.length ? "No supplier matches." : "There is no active supplier yet."}</p>}
              </div>
              {err("supplierId") && <p className="text-xs font-medium text-bad">{err("supplierId")}</p>}
              <p className="text-[12.5px] text-ink-3" data-testid="newcase-supplier-missing">
                Supplier not in the list? Ask the business administrator to add it in{" "}
                <Link to="/suppliers" className="font-medium text-brand hover:underline">
                  Suppliers
                </Link>
                .
              </p>

              {supplier && contacts.length > 0 && (
                <div className="rounded-lg border border-line bg-surface-2 p-3" data-testid="newcase-contacts">
                  <p className="mb-1 text-[13px] font-medium text-ink">
                    Case contacts <span className="text-bad">*</span> <span className="font-normal text-ink-3">· one or two</span>
                  </p>
                  <p className="mb-2 text-xs text-ink-3">Only the contacts named here see the request and get its e-mails. Both can work on it at the same time.</p>
                  {contacts.length > 3 && (
                    <div className="relative mb-2 max-w-sm">
                      <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
                      <TextInput aria-label="Find a contact" placeholder="Find a contact by name or e-mail…" value={findContact} onChange={(e) => setFindContact(e.target.value)} className="pl-9" data-testid="newcase-contact-search" />
                    </div>
                  )}
                  {shownContacts.length === 0 && <p className="text-[13px] text-ink-3">No contact matches.</p>}
                  {shownContacts.map((u) => {
                    const on = f.contactIds.includes(u.id);
                    const full = !on && f.contactIds.length >= 2;
                    return (
                      <span key={u.id} data-testid={`newcase-contact-${u.id}`} className="block">
                        <Checkbox
                          checked={on}
                          disabled={full}
                          onChange={(v) => setF((p) => ({ ...p, contactIds: v ? [...p.contactIds, u.id] : p.contactIds.filter((x) => x !== u.id) }))}
                          label={
                            <>
                              {u.name} <span className="text-ink-3">· {u.title}</span>
                              {u.mayConfirm === false && (
                                <Badge tone="neutral" className="ml-1.5">
                                  May not confirm
                                </Badge>
                              )}
                            </>
                          }
                          description={full ? `${u.email} · a case has at most two contacts` : u.email}
                        />
                      </span>
                    );
                  })}
                  {err("contactIds") && <p className="mt-1 text-xs font-medium text-bad">{err("contactIds")}</p>}
                  {noConfirmer && <p className="mt-1 text-xs font-medium text-ink-2">None of the chosen contacts may confirm completeness or give the final release. Add one who may.</p>}
                  <p className="mt-2 text-xs text-ink-3" data-testid="newcase-contact-missing">
                    Contact not in the list? Ask the business administrator to add it in{" "}
                    <Link to={`/suppliers/${supplier.id}`} className="font-medium text-brand hover:underline">
                      Suppliers
                    </Link>
                    .
                  </p>
                </div>
              )}
            </div>
          </Card>

          {dups.length > 0 && (
            <div role="alert" data-testid="newcase-duplicate-warning" className="rounded-lg border border-warn/50 bg-warn-soft px-4 py-3 text-[13px] text-ink">
              <p className="flex items-start gap-2 font-medium">
                <TriangleAlert size={16} className="mt-px shrink-0 text-warn" aria-hidden />
                <span>
                  {dups.length === 1 ? "A case is" : `${dups.length} cases are`} already open for {supplier?.name} and BDF material no. <Mono>{f.materialNo.trim()}</Mono>:{" "}
                  {dups.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && ", "}
                      <Link to={`/cases/${c.id}`} className="font-mono text-brand hover:underline">
                        {c.id}
                      </Link>{" "}
                      ({c.materialName})
                    </span>
                  ))}
                  .
                </span>
              </p>
              <div className="mt-2.5 pl-6">
                <Field label="Why is a second case needed?" required error={err("duplicateNote")} hint="Recorded in the case history.">
                  <TextArea value={f.duplicateNote} onChange={(e) => setF({ ...f, duplicateNote: e.target.value })} rows={2} placeholder="e.g. A second production site needs its own CIQ." invalid={!!err("duplicateNote")} data-testid="newcase-duplicate-note" />
                </Field>
              </div>
            </div>
          )}

          <Card>
            <CardHeader title="Target markets and timing" />
            <div className="space-y-5 p-4">
              <Field label="Target markets (SF-11)" required error={err("markets")} hint="Set by Beiersdorf; the supplier sees them read-only.">
                <div className="flex flex-wrap gap-1.5" data-testid="newcase-markets">
                  {MARKETS.map((m) => {
                    const on = f.markets.includes(m);
                    return (
                      <button
                        type="button"
                        key={m}
                        aria-pressed={on}
                        data-testid={`newcase-market-${m}`}
                        onClick={() => setF((p) => ({ ...p, markets: on ? p.markets.filter((x) => x !== m) : [...p.markets, m] }))}
                        className={cx("rounded-full border px-3 py-1 text-[13px] transition-colors", phone && PHONE_CHIP, on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line-strong bg-surface text-ink-2 hover:border-ink-3")}
                      >
                        {MARKET_LABEL[m]}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] text-ink-2">
                {marketSections.length ? (
                  <>
                    <span className="font-medium text-ink">These markets add:</span> {marketSections.map((id) => sectionLabel(id, template)).join("; ")}.
                  </>
                ) : (
                  <>No market-specific chapter or annex. EU REACH applies to every case.</>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Due date" required error={err("dueDate")} hint="Default: 60 days from today">
                  <TextInput type="date" min={today} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} invalid={!!err("dueDate")} data-testid="newcase-due" />
                </Field>
                <Field label="Priority">
                  <div data-testid="newcase-priority" className={phone ? PHONE_TAPS : undefined}>
                    <Segmented<"normal" | "high">
                      value={f.priority}
                      onChange={(v) => setF({ ...f, priority: v })}
                      options={[
                        { value: "normal", label: "Normal" },
                        { value: "high", label: "High" },
                      ]}
                    />
                  </div>
                </Field>
              </div>
            </div>
          </Card>

          {tried && missing.length > 0 && (
            <div ref={errorsRef} role="alert" data-testid="newcase-errors" data-count={missing.length} className="flex items-start gap-2.5 rounded-lg border border-bad/40 bg-bad-soft px-4 py-3 text-[13px] text-ink">
              <CircleAlert size={16} className="mt-px shrink-0 text-bad" aria-hidden />
              <div>
                <p className="font-medium">
                  Complete {missing.length} item{missing.length > 1 ? "s" : ""} before creating the case:
                </p>
                <ul className="mt-1 list-disc pl-5 text-ink-2">
                  {missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {!phone && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => nav(-1)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" icon={<Send size={15} />} disabled={!!sending} data-testid="newcase-submit">
                {sending ? "Sending…" : "Create case and invite supplier"}
              </Button>
            </div>
          )}
        </form>

        <aside className="space-y-4">
          <Card>
            <CardHeader title="What happens next" />
            <ol className="space-y-4 p-4">
              {[
                ["The supplier is invited", `${f.contactIds.length ? f.contactIds.map((id) => userName(state, id)).join(" and ") : supplier ? `${supplier.name}'s case contacts` : "The case contacts"} get an e-mail and one task in the supplier portal.`],
                ["The supplier fills in the CIQ", "Basic data and the metadata questions SF-01 to SF-12 first; the sections that apply open as they answer. Then they fill in, upload evidence and confirm completeness."],
                ["The reviews start", "Only the departments whose sections apply get a review task, and you review the whole CIQ at the same time."],
                ["The final release completes the case", "When you and every department have completed, the supplier gives the final release. The case completes and the final document comes to you."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand">{i + 1}</span>
                  <div>
                    <p className="text-[13.5px] font-medium text-ink">{t}</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-3">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="border-t border-line px-4 py-3 text-[12.5px] text-ink-3">
              Uses questionnaire{" "}
              <span data-testid="newcase-template-version">
                <Mono className="text-ink-2">{template}</Mono>
              </span>{" "}
              and rule set{" "}
              <span data-testid="newcase-rule-set">
                <Mono className="text-ink-2">{ruleSetVersion}</Mono>
              </span>
              . Running cases keep the versions they started with.
            </div>
          </Card>
        </aside>
      </div>
      {/* a phone: the page's actions above the tab bar, for the form by its id */}
      <StickyActionBar>
        <Button type="button" variant="ghost" onClick={() => nav(-1)}>
          Cancel
        </Button>
        <Button type="submit" form={formId} variant="primary" icon={<Send size={15} />} disabled={!!sending} data-testid="newcase-submit" className="min-w-0 flex-1">
          {sending ? "Sending…" : "Create case and invite supplier"}
        </Button>
      </StickyActionBar>
    </div>
  );
}

/** One selectable supplier card. A supplier without an active contact cannot be chosen: its card links to the master. */
function SupplierChoice({ s, selected, activeContacts, onPick }: { s: Supplier; selected: boolean; activeContacts: number; onPick: () => void }) {
  const usable = activeContacts > 0;
  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-disabled={!usable}
      tabIndex={usable ? 0 : -1}
      data-testid={`newcase-supplier-${s.id}`}
      onClick={() => usable && onPick()}
      onKeyDown={(e) => {
        if (usable && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          onPick();
        }
      }}
      className={cx(
        "rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none",
        selected ? "border-brand bg-brand-soft/60" : "border-line bg-surface",
        usable ? "cursor-pointer hover:border-line-strong" : "cursor-not-allowed opacity-75",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span aria-hidden className={cx("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-brand" : "border-line-strong")}>
          {selected && <span className="h-2 w-2 rounded-full bg-brand" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink">
            <Building2 size={14} className="shrink-0 text-ink-3" aria-hidden />
            <span className="truncate">{s.name}</span>
          </p>
          <p className="mt-0.5 text-[12px] text-ink-3">
            DUNS <Mono className="text-ink-2">{s.duns}</Mono> · {s.city ? `${s.city}, ` : ""}
            {s.country} · {s.type === "manufacturer" ? "Manufacturer" : "Distributor"}
          </p>
          {usable ? (
            <p className="mt-0.5 text-[12px] text-ink-3">
              {activeContacts} active contact{activeContacts === 1 ? "" : "s"}
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] font-medium text-bad">
              No active contact. Ask the business administrator to add it in{" "}
              <Link to={`/suppliers/${s.id}`} onClick={(e) => e.stopPropagation()} className="text-brand hover:underline">
                Suppliers
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
