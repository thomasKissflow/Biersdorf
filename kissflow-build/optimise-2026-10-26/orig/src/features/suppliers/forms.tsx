// Supplier-master forms (spec §4 Suppliers): add or edit a supplier, add or edit a contact, deactivate a contact with
// a replacement. Every form validates with the domain validators (suppliers.ts) and shows all problems at once after
// the first save attempt; the store action then re-checks the same rules.
import { CircleAlert, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLiveFeatures } from "@/components/liveFeatures";
import { Button, Checkbox, Field, IconButton, Modal, Segmented, Select, TextInput } from "@/components/ui";
import { contactDeactivationImpact, contactsOf, normaliseDuns, similarSuppliers, validateContact, validateSupplier, type ContactInput, type FieldErrors } from "@/domain/suppliers";
import type { Supplier, User } from "@/domain/types";
import { useStore } from "@/store/store";

/** Countries offered as suggestions; any other country can be typed. */
const COUNTRIES = [
  "Austria", "Belgium", "Brazil", "Canada", "China", "Czech Republic", "Denmark", "Finland", "France", "Germany", "Hungary", "India", "Indonesia", "Ireland", "Italy", "Japan", "Malaysia",
  "Mexico", "Netherlands", "Norway", "Poland", "Portugal", "Singapore", "South Korea", "Spain", "Sweden", "Switzerland", "Thailand", "Turkey", "United Kingdom", "USA", "Vietnam",
];

const emptyContact = (): ContactInput => ({ name: "", email: "", title: "", mayConfirm: true });

/** A list of every validation problem, shown above the save button after the first attempt. */
export function ErrorSummary({ errors, testId = "form-errors" }: { errors: string[]; testId?: string }) {
  if (!errors.length) return null;
  return (
    <div role="alert" data-testid={testId} data-count={errors.length} className="flex items-start gap-2.5 rounded-lg border border-bad/40 bg-bad-soft px-3.5 py-2.5 text-[13px] text-ink">
      <CircleAlert size={16} className="mt-px shrink-0 text-bad" aria-hidden />
      <div>
        <p className="font-medium">
          Fix {errors.length} item{errors.length > 1 ? "s" : ""} first:
        </p>
        <ul className="mt-1 list-disc pl-5 text-ink-2">
          {errors.map((e, i) => (
            <li key={`${i}-${e}`}>{e}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function FieldError({ k, errors }: { k: string; errors: FieldErrors }) {
  return errors[k] ? (
    <p className="text-xs font-medium text-bad" data-testid={`field-error-${k.replace(/\./g, "-")}`}>
      {errors[k]}
    </p>
  ) : null;
}

// ---------------------------------------------------------------------------------- supplier

interface SupplierDraft {
  name: string;
  duns: string;
  country: string;
  city: string;
  type: Supplier["type"];
  contacts: ContactInput[];
}

/**
 * Add a supplier (with at least one contact) or edit an existing one's company data. `onSaved` gets the supplier id.
 * Contacts of an existing supplier are maintained on its page, one by one.
 */
export function SupplierFormModal({ open, onClose, onSaved, editing }: { open: boolean; onClose: () => void; onSaved?: (id: string) => void; editing?: Supplier }) {
  if (!open) return null;
  return <SupplierForm onClose={onClose} onSaved={onSaved} editing={editing} />;
}

function SupplierForm({ onClose, onSaved, editing }: { onClose: () => void; onSaved?: (id: string) => void; editing?: Supplier }) {
  const { state, addSupplier, updateSupplier } = useStore();
  const [d, setD] = useState<SupplierDraft>(() =>
    editing ? { name: editing.name, duns: editing.duns, country: editing.country, city: editing.city ?? "", type: editing.type, contacts: [] } : { name: "", duns: "", country: "", city: "", type: "manufacturer", contacts: [emptyContact()] },
  );
  const [tried, setTried] = useState(false);
  const [sameNameOk, setSameNameOk] = useState(false);

  const input = { name: d.name, duns: d.duns, country: d.country, city: d.city, type: d.type, contacts: editing ? undefined : d.contacts };
  const errors = validateSupplier(state, input, editing?.id);
  const similar = d.name.trim() ? similarSuppliers(state, d.name, editing?.id) : [];
  const shown = tried ? errors : {};
  const list = Object.values(errors);
  const needsAck = similar.length > 0 && !sameNameOk;

  const setContact = (i: number, patch: Partial<ContactInput>) => setD((p) => ({ ...p, contacts: p.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  const save = () => {
    setTried(true);
    if (list.length || needsAck) return;
    if (editing) {
      const ok = updateSupplier(editing.id, { name: d.name.trim(), duns: normaliseDuns(d.duns), country: d.country.trim(), city: d.city.trim() || undefined, type: d.type });
      if (ok) {
        onSaved?.(editing.id);
        onClose();
      }
      return;
    }
    const id = addSupplier({ name: d.name.trim(), duns: normaliseDuns(d.duns), country: d.country.trim(), city: d.city.trim() || undefined, type: d.type, contacts: d.contacts.map((c) => ({ ...c, name: c.name.trim(), email: c.email.trim(), title: c.title?.trim() })) });
    if (id) {
      onSaved?.(id);
      onClose();
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : "Add a supplier"}
      subtitle={editing ? "Running cases keep the supplier data they were started with." : "Suppliers come from the supplier master. Add one here when it is not in the master yet."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} data-testid="supplier-save">
            {editing ? "Save changes" : "Add supplier"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Legal name" required error={shown.name}>
              <TextInput value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Solvaro Oleochemicals S.A." invalid={!!shown.name} data-testid="supplier-name" />
            </Field>
            {similar.length > 0 && (
              <div className="mt-2 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-[12.5px] text-ink">
                <p className="flex items-start gap-1.5">
                  <TriangleAlert size={14} className="mt-px shrink-0 text-warn" aria-hidden />
                  <span>
                    A supplier with a very similar name exists:{" "}
                    {similar.map((x, i) => (
                      <span key={x.id}>
                        {i > 0 && ", "}
                        <Link to={`/suppliers/${x.id}`} className="font-medium text-brand hover:underline">
                          {x.name}
                        </Link>{" "}
                        (DUNS {x.duns})
                      </span>
                    ))}
                    .
                  </span>
                </p>
                <div className="mt-1.5" data-testid="supplier-name-ack">
                  <Checkbox checked={sameNameOk} onChange={setSameNameOk} label="This is a different company" />
                </div>
                {tried && needsAck && <p className="mt-1 text-xs font-medium text-bad">Confirm that this is a different company, or use the existing supplier.</p>}
              </div>
            )}
          </div>
          <Field label="DUNS number" required error={shown.duns} hint="Exactly 9 digits. Spaces and dashes are removed; leading zeros are kept.">
            <TextInput value={d.duns} onChange={(e) => setD({ ...d, duns: e.target.value })} placeholder="e.g. 087342615" inputMode="numeric" className="font-mono" invalid={!!shown.duns} data-testid="supplier-duns" />
          </Field>
          <Field label="Type" required error={shown.type}>
            <div data-testid="supplier-type">
              <Segmented<Supplier["type"]>
                value={d.type}
                onChange={(v) => setD({ ...d, type: v })}
                options={[
                  { value: "manufacturer", label: "Manufacturer" },
                  { value: "distributor", label: "Distributor" },
                ]}
              />
            </div>
          </Field>
          <Field label="Country" required error={shown.country}>
            <TextInput value={d.country} onChange={(e) => setD({ ...d, country: e.target.value })} list="supplier-countries" placeholder="e.g. Spain" invalid={!!shown.country} data-testid="supplier-country" />
          </Field>
          <Field label="City">
            <TextInput value={d.city} onChange={(e) => setD({ ...d, city: e.target.value })} placeholder="e.g. Tarragona" data-testid="supplier-city" />
          </Field>
          <datalist id="supplier-countries">
            {[...new Set([...COUNTRIES, ...state.suppliers.map((x) => x.country)])].sort().map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        {!editing && (
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px] font-medium text-ink">
                Contacts <span className="text-bad">*</span>
              </p>
              <p className="text-xs text-ink-3">At least one. Each contact gets access to the requests it is named on.</p>
            </div>
            {tried && errors.contacts && <p className="mt-1 text-xs font-medium text-bad">{errors.contacts}</p>}
            <ul className="mt-2 space-y-3">
              {d.contacts.map((c, i) => (
                <li key={i} className="rounded-lg border border-line p-3" data-testid={`contact-form-${i}`}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <TextInput aria-label={`Contact ${i + 1} name`} placeholder="Full name" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} invalid={!!shown[`contacts.${i}.name`]} data-testid={`contact-name-${i}`} />
                      <FieldError k={`contacts.${i}.name`} errors={shown} />
                    </div>
                    <div className="space-y-1">
                      <TextInput aria-label={`Contact ${i + 1} e-mail`} type="email" placeholder="name@company.com" value={c.email} onChange={(e) => setContact(i, { email: e.target.value })} invalid={!!shown[`contacts.${i}.email`]} data-testid={`contact-email-${i}`} />
                      <FieldError k={`contacts.${i}.email`} errors={shown} />
                    </div>
                    <TextInput aria-label={`Contact ${i + 1} job title`} placeholder="Job title, e.g. Regulatory Manager" value={c.title ?? ""} onChange={(e) => setContact(i, { title: e.target.value })} data-testid={`contact-title-${i}`} />
                    <div className="flex items-center justify-between gap-2">
                      <span data-testid={`contact-may-confirm-${i}`}>
                        <Checkbox checked={c.mayConfirm !== false} onChange={(v) => setContact(i, { mayConfirm: v })} label="May confirm and release" />
                      </span>
                      {d.contacts.length > 1 && (
                        <IconButton label={`Remove contact ${i + 1}`} onClick={() => setD((p) => ({ ...p, contacts: p.contacts.filter((_, j) => j !== i) }))}>
                          <Trash2 size={15} />
                        </IconButton>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="sm" icon={<Plus size={14} />} className="mt-2" onClick={() => setD((p) => ({ ...p, contacts: [...p.contacts, emptyContact()] }))} data-testid="contact-add-row">
              Add another contact
            </Button>
          </div>
        )}

        {tried && <ErrorSummary errors={[...list, ...(needsAck ? ["Confirm that this is a different company from the similar supplier."] : [])]} testId="supplier-errors" />}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------- contact

/** Add a contact to a supplier, or edit one. The e-mail must be unique across all suppliers. */
export function ContactFormModal({ supplier, editing, onClose }: { supplier: Supplier; editing?: User; onClose: () => void }) {
  const { state, addContact, updateContact } = useStore();
  const [c, setC] = useState<ContactInput>(() => (editing ? { name: editing.name, email: editing.email, title: editing.title, mayConfirm: editing.mayConfirm !== false } : emptyContact()));
  const [tried, setTried] = useState(false);
  const errors = validateContact(state, c, { editingUserId: editing?.id });
  const shown = tried ? errors : {};
  const save = () => {
    setTried(true);
    if (Object.keys(errors).length) return;
    const input = { name: c.name.trim(), email: c.email.trim(), title: c.title?.trim(), mayConfirm: c.mayConfirm };
    const ok = editing ? updateContact(editing.id, input) : !!addContact(supplier.id, input);
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : `Add a contact to ${supplier.name}`}
      subtitle={editing ? "Earlier answers and confirmations keep the name they were given with." : "The contact can be named on new cases at once. Add it to a running case from that case's page."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} data-testid="contact-save">
            {editing ? "Save changes" : "Add contact"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Full name" required error={shown.name}>
          <TextInput value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} invalid={!!shown.name} data-testid="contact-name" />
        </Field>
        <Field label="E-mail" required error={shown.email} hint="Unique across all suppliers. Mails about the requests go here.">
          <TextInput type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} invalid={!!shown.email} placeholder="name@company.com" data-testid="contact-email" />
        </Field>
        <Field label="Job title">
          <TextInput value={c.title ?? ""} onChange={(e) => setC({ ...c, title: e.target.value })} placeholder="e.g. QA Specialist" data-testid="contact-title" />
        </Field>
        <span data-testid="contact-may-confirm">
          <Checkbox checked={c.mayConfirm !== false} onChange={(v) => setC({ ...c, mayConfirm: v })} label="May confirm completeness and give the final release" description="Recorded with name, e-mail, role and time." />
        </span>
        {tried && <ErrorSummary errors={Object.values(errors)} testId="contact-errors" />}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------- deactivate

/**
 * Contacts are deactivated, never deleted. On every open case the contact is named on, a replacement takes over; it is
 * required where the contact is the only case contact. The supplier's last active contact cannot be deactivated.
 * Where this version can't replace a contact on running cases (the live app refuses to deactivate a contact named on
 * an open case at all, FE-CLEANUP A9), the window says so up front instead of promising a takeover; a refused confirm
 * leaves it open.
 */
export function DeactivateContactModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { state, setContactActive } = useStore();
  const { replaceContact } = useLiveFeatures();
  const impact = contactDeactivationImpact(state, user.id);
  const others = contactsOf(state, user.supplierId ?? "", true).filter((u) => u.id !== user.id);
  const [rep, setRep] = useState("");
  const [tried, setTried] = useState(false);
  const needsRep = impact.needsReplacement.length > 0;
  const problem = impact.lastActive ? `${user.name} is the last active contact of this supplier. Add another contact first.` : needsRep && !rep ? "Choose the contact who takes over." : null;
  const submit = () => {
    setTried(true);
    if (problem) return;
    if (setContactActive(user.id, false, rep || undefined)) onClose();
  };
  const cases: ReactNode = impact.openCases.map((c, i) => (
    <span key={c.id}>
      {i > 0 && ", "}
      <Link to={`/cases/${c.id}`} className="font-mono font-medium text-brand hover:underline">
        {c.id}
      </Link>
    </span>
  ));
  return (
    <Modal
      open
      onClose={onClose}
      title={`Deactivate ${user.name}?`}
      subtitle={user.email}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep active
          </Button>
          <Button variant="danger" onClick={submit} disabled={impact.lastActive} data-testid="contact-deactivate-confirm">
            Deactivate contact
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-[13.5px] text-ink-2">
        <p>A deactivated contact keeps its history and the name on its answers and confirmations, but gets no more e-mails or tasks and can no longer open the supplier portal. It is never deleted and can be reactivated.</p>
        {impact.lastActive ? (
          <p className="rounded-lg border border-bad/40 bg-bad-soft px-3 py-2 text-ink" data-testid="contact-last-active">
            {user.name} is the last active contact of this supplier. Add another contact first.
          </p>
        ) : impact.openCases.length > 0 ? (
          <>
            <p>
              {user.name} is named on {impact.openCases.length === 1 ? "an open case" : `${impact.openCases.length} open cases`}: {cases}.
              {!replaceContact ? "" : needsRep ? " On at least one of them nobody else is named, so a replacement must take over." : " The other case contact continues; you can also name a replacement."}
            </p>
            {!replaceContact && (
              <p className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-ink" data-testid="contact-replace-not-available">
                {user.name} can't be deactivated while named on open cases: replacing a contact on running cases is not available in this version yet.
              </p>
            )}
            <Field label="Replacement contact" required={needsRep} error={tried && needsRep && !rep ? "Choose the contact who takes over." : undefined} hint="Takes over every open case of this contact and gets the invitation e-mail.">
              <div data-testid="contact-replacement">
                <Select value={rep} onChange={(e) => setRep(e.target.value)} invalid={tried && needsRep && !rep}>
                  <option value="">{needsRep ? "Select a contact…" : replaceContact ? "No replacement (the other case contact continues)" : "No replacement"}</option>
                  {others.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.title}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
            {others.find((u) => u.id === rep)?.mayConfirm === false && (
              <p className="text-[12.5px] text-ink-2" data-testid="contact-replacement-no-confirm">
                {others.find((u) => u.id === rep)!.name} may not confirm completeness or give the final release. On a case where nobody else is named, add a contact who may.
              </p>
            )}
          </>
        ) : (
          <p>{user.name} is not named on any open case.</p>
        )}
      </div>
    </Modal>
  );
}
