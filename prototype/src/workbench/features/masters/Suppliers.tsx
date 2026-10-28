// §8.14 Suppliers and contacts: #/suppliers, #/suppliers/:itemId, #/suppliers/new (F1 CIQ Supplier).
// Writes only for roles with E on F1 (RMM); Business Admin and everyone else read (wb-supplier-readonly).
// Contacts: one row per save with re-read and merge; deactivate instead of delete; "Request portal invite" is
// "requested, not sent"; the portal user id is typed by hand as given by portal user management (Thomas).
import { Building2, MailPlus, Pencil, Plus, Power, Save, Search, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState, KeyValue, Table, Td, Tr } from "@/components/ui/data";
import { Field, Segmented, TextInput } from "@/components/ui/form";
import { Badge, Button, Card, CardHeader, Mono, PageHeader } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";
import { fieldLabel, listValues } from "../../schema";
import { useFormRows, useWorkbench } from "../../data/hooks";
import type { ContactVM, RowOp, SaveResult, SupplierVM } from "../../data/viewModels";
import { errorText } from "../../kf/sdk";
import { FieldInput } from "../../ui/FieldInput";
import { ReadQualityBanner } from "../../ui/ReadQualityBanner";
import { WriteOutcome } from "../../ui/WriteOutcome";
import { fmtDateTime } from "../audit/format";
import { ErrorBanner, Notice, Page, Skeleton, WarningList } from "../audit/kit";
import {
  SUPPLIER_FLOW,
  SUPPLIER_HEADER_FIELDS,
  addContactOp,
  deactivateOp,
  headerPatch,
  isPendingInvite,
  modifyContactOp,
  requestInviteOp,
  saveContact,
  supplierCodeTaken,
  validateContact,
  type ContactInput,
  type ContactSave,
} from "./contacts";

// ---------------------------------------------------------------- list

export function SupplierList() {
  const { caps } = useWorkbench();
  const canEdit = caps.canEditForm(SUPPLIER_FLOW);
  const rows = useFormRows<SupplierVM>(SUPPLIER_FLOW);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const all = useMemo(() => [...(rows.data ?? [])].sort((a, b) => a.legalName.localeCompare(b.legalName)), [rows.data]);
  const shown = all.filter((s) => !q.trim() || `${s.code} ${s.legalName}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Page testId="wb-suppliers">
      <PageHeader
        eyebrow="Masters"
        title="Suppliers"
        subtitle="Supplier master and contacts. Portal users are managed separately; contact portal ids are recorded here by hand."
        actions={
          canEdit ? (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate("/suppliers/new")} data-testid="wb-supplier-new">
              New supplier
            </Button>
          ) : (
            <Badge tone="neutral">Read-only for your roles</Badge>
          )
        }
      />
      <ErrorBanner error={rows.error} onRetry={rows.reload} />
      <ReadQualityBanner quality={rows.quality} what="Suppliers" />
      <WarningList warnings={rows.warnings} />
      <Card>
        <div className="border-b border-line p-4">
          <div className="relative max-w-md">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code or name" className="pl-9" aria-label="Search suppliers" data-testid="wb-suppliers-search" />
          </div>
        </div>
        {rows.loading && !rows.data ? (
          <Skeleton rows={4} bare />
        ) : !shown.length ? (
          <EmptyState icon={<Building2 size={22} />} title={all.length ? "No supplier matches" : rows.quality === "failed" ? "Suppliers could not be read" : "No suppliers yet"} />
        ) : (
          <Table head={["Code", "Legal name", "Kind", "Country", "Active", "Test", "Contacts", "Pending invites"]} dense>
            {shown.map((s) => (
              <Tr key={s._id} onClick={() => navigate(`/suppliers/${s._id}`)}>
                <Td>
                  <Link to={`/suppliers/${s._id}`} onClick={(e) => e.stopPropagation()} className="text-brand hover:underline" data-testid={`wb-suppliers-row-${s._id}`}>
                    <Mono>{s.code || "—"}</Mono>
                  </Link>
                </Td>
                <Td className="font-medium">{s.legalName || "—"}</Td>
                <Td className="text-ink-2">{s.kind || "—"}</Td>
                <Td className="text-ink-2">{s.countryCode || "—"}</Td>
                <Td>
                  <Badge tone={s.active ? "ok" : "neutral"} dot>
                    {s.active ? "Active" : "Inactive"}
                  </Badge>
                </Td>
                <Td className="text-ink-2">{s.test ? "Yes" : "No"}</Td>
                <Td className="text-ink-2">{s.contacts.length}</Td>
                <Td className="text-ink-2">{s.pendingInvites ?? "—"}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
    </Page>
  );
}

// ---------------------------------------------------------------- detail

export function SupplierDetail() {
  const { itemId } = useParams();
  return itemId ? <ExistingSupplier id={itemId} /> : <NewSupplier />;
}

function NewSupplier() {
  const { caps, actions, notify } = useWorkbench();
  const canEdit = caps.canEditForm(SUPPLIER_FLOW);
  const rows = useFormRows<SupplierVM>(SUPPLIER_FLOW);
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listOk = rows.quality === "form";
  const taken = !!code.trim() && supplierCodeTaken(code, rows.data ?? []);
  if (!canEdit)
    return (
      <Page testId="wb-supplier">
        <Notice tone="info" testId="wb-supplier-readonly">
          Only the Raw Material Manager (RMM) creates suppliers.
        </Notice>
      </Page>
    );
  return (
    <Page testId="wb-supplier">
      <Link to="/suppliers" className="text-[13px] text-ink-2 hover:text-ink">
        ← Suppliers
      </Link>
      <PageHeader eyebrow="Masters" title="New supplier" subtitle="Code and legal name first; the other details and the contacts follow on the supplier page." />
      <Card className="max-w-xl space-y-4 p-4">
        <Field label="Supplier code" required error={taken ? "This code is already used by another supplier." : undefined} hint="Unique. It links every case and portal item to this supplier and cannot be changed later.">
          <TextInput value={code} onChange={(e) => setCode(e.target.value)} invalid={taken} data-testid="wb-supplier-code" />
        </Field>
        <Field label="Legal name" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} data-testid="wb-supplier-name" />
        </Field>
        {!listOk && !rows.loading && <Notice tone="warn">The supplier list could not be read completely, so the code cannot be checked for uniqueness. Try again later.</Notice>}
        <Button
          variant="primary"
          icon={<Save size={15} />}
          disabled={!code.trim() || !name.trim() || taken || !listOk || busy}
          data-testid="wb-supplier-create"
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const r = await actions.createFormRow(SUPPLIER_FLOW, { Supplier_Code: code.trim(), Supplier_Legal_Name: name.trim() }, "Supplier_Code");
              notify("Supplier created and checked.", "success");
              rows.reload();
              navigate(`/suppliers/${r.itemId}`, { replace: true });
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Creating…" : "Create supplier"}
        </Button>
        {error && (
          <Notice tone="bad" testId="wb-supplier-error">
            {error}
          </Notice>
        )}
      </Card>
    </Page>
  );
}

const EMPTY_CONTACT: ContactInput = { fullName: "", email: "", role: "", canConfirm: false, portalUserId: "", active: true };
const toInput = (c: ContactVM): ContactInput => ({ fullName: c.fullName, email: c.email, role: c.role, canConfirm: c.canConfirm, portalUserId: c.portalUserId, active: c.active });

function ContactSaveOutcome({ r, id }: { r: ContactSave | null; id: string }) {
  if (!r) return null;
  return (
    <div className="space-y-2">
      <WriteOutcome result={r.contact} flow={SUPPLIER_FLOW} itemId={id} okMessage="Contact saved and checked." />
      {r.mirrors && !r.mirrors.ok && <WriteOutcome result={r.mirrors} flow={SUPPLIER_FLOW} itemId={id} />}
    </div>
  );
}

function ContactForm({ s, editing, onDone }: { s: SupplierVM; editing: ContactVM | null; onDone(r: ContactSave | null): void }) {
  const { actions } = useWorkbench();
  const [i, setI] = useState<ContactInput>(editing ? toInput(editing) : EMPTY_CONTACT);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const problems = validateContact(i, s.contacts, editing?._id ?? null);
  const set = (p: Partial<ContactInput>) => setI((x) => ({ ...x, ...p }));
  const save = async () => {
    setTried(true);
    if (problems.length) return;
    const op: RowOp | null = editing ? modifyContactOp(editing, i) : addContactOp(i);
    if (!op) return onDone(null);
    setBusy(true);
    try {
      onDone(await saveContact(actions, s._id, op));
    } catch (e) {
      onDone({ contact: { ok: false, kind: "refused", message: errorText(e) } });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 border-t border-line bg-surface-2 px-4 py-4" data-testid="wb-supplier-contact-form">
      <p className="text-[13.5px] font-medium text-ink">{editing ? `Edit ${editing.fullName || editing.email}` : "New contact"}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required>
          <TextInput value={i.fullName} onChange={(e) => set({ fullName: e.target.value })} data-testid="wb-contact-name" />
        </Field>
        <Field label="E-mail" required>
          <TextInput type="email" value={i.email} onChange={(e) => set({ email: e.target.value })} data-testid="wb-contact-email" />
        </Field>
        <Field label="Role">
          <Select value={i.role} onChange={(e) => set({ role: e.target.value })} aria-label="Contact role">
            <option value="">Select…</option>
            {listValues("CIQ_Contact_Role").map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="May confirm for the supplier">
          <Segmented<boolean>
            value={i.canConfirm}
            onChange={(v) => set({ canConfirm: v })}
            options={[
              { value: true, label: "Yes" },
              { value: false, label: "No" },
            ]}
          />
        </Field>
        <Field label="Portal user id" hint="Manual entry: type it exactly as given by portal user management. The Workbench never creates portal users.">
          <TextInput value={i.portalUserId} onChange={(e) => set({ portalUserId: e.target.value })} placeholder="Leave blank until it is given" data-testid="wb-contact-portal-user-id" />
        </Field>
        <Field label="Active">
          <Segmented<boolean>
            value={i.active}
            onChange={(v) => set({ active: v })}
            options={[
              { value: true, label: "Active" },
              { value: false, label: "Inactive" },
            ]}
          />
        </Field>
      </div>
      {tried && problems.length > 0 && (
        <Notice tone="bad" testId="wb-contact-problems">
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Notice>
      )}
      <div className="flex gap-2">
        <Button variant="primary" icon={<Save size={14} />} onClick={save} disabled={busy} data-testid="wb-contact-save">
          {busy ? "Saving…" : "Save contact"}
        </Button>
        <Button variant="ghost" onClick={() => onDone(null)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ExistingSupplier({ id }: { id: string }) {
  const { caps, actions } = useWorkbench();
  const canEdit = caps.canEditForm(SUPPLIER_FLOW);
  const rows = useFormRows<SupplierVM>(SUPPLIER_FLOW);
  const s = (rows.data ?? []).find((x) => x._id === id);
  const [head, setHead] = useState<{ id: string; v: Record<string, unknown> } | null>(null);
  const [headResult, setHeadResult] = useState<SaveResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<{ editing: ContactVM | null } | null>(null);
  const [contactResult, setContactResult] = useState<ContactSave | null>(null);

  if (rows.loading && !rows.data) return <Page testId="wb-supplier"><Skeleton rows={6} /></Page>;
  if (!s)
    return (
      <Page testId="wb-supplier">
        <ErrorBanner error={rows.error} onRetry={rows.reload} />
        <Card>
          <EmptyState title="This supplier was not found">
            <Link to="/suppliers" className="text-brand hover:underline">
              Back to suppliers
            </Link>
          </EmptyState>
        </Card>
      </Page>
    );

  const values = head && head.id === s._id ? head.v : s.v;
  const patch = canEdit ? headerPatch(s.v, values) : { fields: {} };
  const dirty = Object.keys(patch.fields).length > 0;
  const rowAction = async (key: string, op: RowOp) => {
    setBusy(key);
    setContactResult(null);
    try {
      setContactResult(await saveContact(actions, s._id, op));
    } catch (e) {
      setContactResult({ contact: { ok: false, kind: "refused", message: errorText(e) } });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page testId="wb-supplier">
      <Link to="/suppliers" className="text-[13px] text-ink-2 hover:text-ink">
        ← Suppliers
      </Link>
      <PageHeader
        eyebrow="Supplier"
        title={s.legalName || s.code}
        subtitle={<Mono>{s.code}</Mono>}
        actions={
          <>
            <Badge tone={s.active ? "ok" : "neutral"} dot>
              {s.active ? "Active" : "Inactive"}
            </Badge>
            {s.test && <Badge tone="warn">Test supplier</Badge>}
          </>
        }
      />
      <ErrorBanner error={rows.error} onRetry={rows.reload} />
      {!canEdit && (
        <Notice tone="info" testId="wb-supplier-readonly">
          Read-only for your roles: the Raw Material Manager (RMM) maintains suppliers and contacts.
        </Notice>
      )}
      <Card>
        <CardHeader title="Supplier details" />
        <div className="space-y-4 p-4">
          {canEdit ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SUPPLIER_HEADER_FIELDS.map((f) => (
                <Field key={f} label={fieldLabel(SUPPLIER_FLOW, f)} required={f === "Supplier_Legal_Name"}>
                  <FieldInput flow={SUPPLIER_FLOW} field={f} value={values[f]} onChange={(v) => setHead({ id: s._id, v: { ...values, [f]: v } })} id={`wb-supplier-${f}`} />
                </Field>
              ))}
            </div>
          ) : (
            <KeyValue
              cols={3}
              items={[
                { k: "Legal name", v: s.legalName || "—" },
                { k: "Kind", v: s.kind || "—" },
                { k: "Country", v: s.countryCode || "—" },
                { k: "DUNS", v: String(s.v.DUNS_Number ?? "") || "—" },
                { k: "SAP vendor id", v: String(s.v.SAP_Vendor_Id ?? "") || "—" },
                { k: "Teamcenter id", v: String(s.v.Teamcenter_Supplier_Id ?? "") || "—" },
              ]}
            />
          )}
          <KeyValue
            cols={2}
            items={[
              { k: "Portal ids of active contacts (mirror)", v: s.contactPortalIdsText ? <Mono>{s.contactPortalIdsText}</Mono> : "—" },
              { k: "Pending portal invites (mirror)", v: s.pendingInvites ?? "—" },
            ]}
          />
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                icon={<Save size={15} />}
                disabled={!dirty || !String(values.Supplier_Legal_Name ?? "").trim() || !!busy}
                data-testid="wb-supplier-save"
                onClick={async () => {
                  setBusy("head");
                  try {
                    const r = await actions.updateFormRow(SUPPLIER_FLOW, s._id, patch);
                    setHeadResult(r);
                    if (r.ok) setHead(null);
                  } catch (e) {
                    setHeadResult({ ok: false, kind: "refused", message: errorText(e) });
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === "head" ? "Saving…" : "Save details"}
              </Button>
              {dirty && (
                <Button variant="ghost" onClick={() => setHead(null)}>
                  Discard changes
                </Button>
              )}
            </div>
          )}
          <WriteOutcome result={headResult} flow={SUPPLIER_FLOW} itemId={s._id} okMessage="Supplier saved and checked." />
        </div>
      </Card>

      <Card data-testid="wb-supplier-contacts">
        <CardHeader
          title="Contacts"
          subtitle="One contact is saved at a time and checked against Kissflow. Contacts are deactivated, never deleted."
          action={
            canEdit && !form ? (
              <Button
                size="sm"
                icon={<UserPlus size={14} />}
                onClick={() => {
                  setContactResult(null);
                  setForm({ editing: null });
                }}
                data-testid="wb-supplier-contact-add"
              >
                Add contact
              </Button>
            ) : undefined
          }
        />
        {!s.contacts.length ? (
          <p className="px-4 py-4 text-[13px] text-ink-3">No contacts yet.</p>
        ) : (
          <Table head={["Contact", "Role", "Portal user id", "Portal invite", ...(canEdit ? [""] : [])]} dense>
            {s.contacts.map((c) => (
              <Tr key={c._id} className={c.active ? undefined : "opacity-60"}>
                <Td>
                  <span className="flex flex-wrap items-center gap-1.5 font-medium whitespace-nowrap" data-testid={`wb-supplier-contact-${c.email.toLowerCase()}`}>
                    {c.fullName || "—"}
                    {!c.active && <Badge tone="neutral">Inactive</Badge>}
                  </span>
                  <span className="block text-[12.5px] text-ink-2">{c.email}</span>
                </Td>
                <Td className="text-ink-2">
                  {c.role || "—"}
                  {c.canConfirm && (
                    <Badge tone="info" className="ml-1.5">
                      may confirm
                    </Badge>
                  )}
                </Td>
                <Td>{c.portalUserId ? <Mono>{c.portalUserId}</Mono> : <span className="text-ink-3">not given yet</span>}</Td>
                <Td className="text-[12.5px] text-ink-2">
                  {c.invitedAt ? `invited ${fmtDateTime(c.invitedAt)}` : c.inviteRequestedAt ? <span title="Requested, not sent: portal users are managed separately.">requested {fmtDateTime(c.inviteRequestedAt)}, not sent</span> : "—"}
                  {isPendingInvite(c) && (
                    <Badge tone="warn" className="ml-1">
                      pending
                    </Badge>
                  )}
                </Td>
                {canEdit && (
                  <Td className="text-right whitespace-nowrap">
                    <span className="inline-flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Pencil size={13} />}
                        disabled={!!busy || !!form}
                        onClick={() => {
                          setContactResult(null);
                          setForm({ editing: c });
                        }}
                        data-testid={`wb-contact-edit-${c._id}`}
                      >
                        Edit
                      </Button>
                      {c.active && !c.portalUserId && !c.inviteRequestedAt && (
                        <Button size="sm" variant="ghost" icon={<MailPlus size={13} />} disabled={!!busy || !!form} onClick={() => rowAction(`invite-${c._id}`, requestInviteOp(c, new Date()))} data-testid={`wb-contact-invite-${c._id}`}>
                          Request invite
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" icon={<Power size={13} />} disabled={!!busy || !!form} onClick={() => rowAction(`active-${c._id}`, deactivateOp(c, !c.active))} data-testid={`wb-contact-active-${c._id}`}>
                        {c.active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </span>
                  </Td>
                )}
              </Tr>
            ))}
          </Table>
        )}
        {form && canEdit && (
          <ContactForm
            s={s}
            editing={form.editing}
            onDone={(r) => {
              setForm(null);
              setContactResult(r);
            }}
          />
        )}
        <div className="px-4 pb-4 empty:hidden">
          <ContactSaveOutcome r={contactResult} id={s._id} />
        </div>
        <p className="border-t border-line px-4 py-3 text-[12.5px] text-ink-3">
          "Request invite" only records the request. Nothing is sent from the Workbench; portal users are created by portal user management.
        </p>
      </Card>
    </Page>
  );
}
