// Supplier detail (/suppliers/:id): company data, the contacts (deactivated, never deleted), the supplier's cases and
// the history of master-data changes. Only the Business administrator edits, deactivates and reactivates the supplier
// and its contacts; RMM sees the page read-only; other roles have no access.
import { ArrowLeft, Building2, Pencil, Plus, Power, UserRoundX } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, KeyValue, Mono, Modal, Table, Td, Timeline, Tr } from "@/components/ui";
import { PhaseBadge } from "@/components/status";
import { can } from "@/domain/permissions";
import { fmtDate, fmtDateTime, isClosed, userName } from "@/domain/selectors";
import { DEMO_SUPPLIER_IDS } from "@/domain/seed";
import { casesOfSupplier, contactsOf, isActiveSupplier, supplierHistory } from "@/domain/suppliers";
import type { Supplier, User } from "@/domain/types";
import { useStore } from "@/store/store";
import { DueCell, NoAccess } from "@/features/rmm/shared";
import { ContactFormModal, DeactivateContactModal, SupplierFormModal } from "./forms";
import { MaintainedByAdmin } from "./ReadOnlyNote";

type Dialog = { kind: "edit" } | { kind: "status" } | { kind: "contact"; user?: User } | { kind: "deactivate"; user: User } | null;

export function SupplierDetail() {
  const { id } = useParams();
  const { state, me } = useStore();
  if (!can(state, me.id, "supplier.view")) return <NoAccess>The supplier master is for Raw Material Management and the business administrator.</NoAccess>;
  const sup = state.suppliers.find((s) => s.id === id);
  if (!sup) {
    return (
      <Card data-testid="supplier-not-found">
        <EmptyState
          icon={<Building2 size={28} />}
          title="Supplier not found"
          action={
            <Link to="/suppliers" className="text-[13px] font-medium text-brand hover:underline">
              Back to the suppliers
            </Link>
          }
        >
          {id ? `There is no supplier ${id}.` : "No supplier selected."}
        </EmptyState>
      </Card>
    );
  }
  return <SupplierView key={sup.id} sup={sup} manage={can(state, me.id, "supplier.manage")} newCase={can(state, me.id, "case.create")} />;
}

/** `manage`: the administrator's controls (edit, deactivate, reactivate, contacts); without it the page is read-only.
 *  `newCase`: the viewer may start a case (RMM), so the empty case list links to New case. */
function SupplierView({ sup, manage, newCase }: { sup: Supplier; manage: boolean; newCase: boolean }) {
  const { state, setContactActive } = useStore();
  const nav = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const contacts = contactsOf(state, sup.id).sort((a, b) => Number(a.active === false) - Number(b.active === false) || a.name.localeCompare(b.name));
  const cases = casesOfSupplier(state, sup.id).sort((a, b) => Number(isClosed(a)) - Number(isClosed(b)) || b.createdAt.localeCompare(a.createdAt));
  const history = supplierHistory(state, sup.id);
  const active = isActiveSupplier(sup);
  const added = history.find((e) => e.action === "Added supplier");
  const source = added ? `Added in the app by ${userName(state, added.by)} on ${fmtDate(added.at)}` : DEMO_SUPPLIER_IDS.includes(sup.id) ? "Imported from the supplier master" : "Supplier master";
  const openOn = (u: User) => cases.filter((c) => !isClosed(c) && c.supplierContactIds.includes(u.id));

  return (
    <div className="space-y-5">
      <div>
        <Link to="/suppliers" className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
          <ArrowLeft size={14} /> Suppliers
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-ink" data-testid="supplier-title">
                {sup.name}
              </h1>
              <Badge tone={active ? "ok" : "neutral"} dot>
                {active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="mt-1.5 text-[13px] text-ink-2">
              DUNS <Mono className="text-ink">{sup.duns}</Mono> · {sup.city ? `${sup.city}, ` : ""}
              {sup.country} · {sup.type === "manufacturer" ? "Manufacturer" : "Distributor"}
            </p>
          </div>
          {manage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" icon={<Power size={15} />} onClick={() => setDialog({ kind: "status" })} data-testid="supplier-deactivate">
                {active ? "Deactivate supplier" : "Reactivate supplier"}
              </Button>
              <Button variant="secondary" icon={<Pencil size={15} />} onClick={() => setDialog({ kind: "edit" })} data-testid="supplier-edit">
                Edit supplier
              </Button>
            </div>
          ) : (
            <MaintainedByAdmin testId="supplier-read-only" />
          )}
        </div>
      </div>

      <Card>
        <CardHeader
          title="Contacts"
          subtitle="Deactivated, never deleted. A case names one or two active contacts; only they see it and get its e-mails."
          action={
            manage ? (
              <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setDialog({ kind: "contact" })} data-testid="contact-add">
                Add contact
              </Button>
            ) : undefined
          }
        />
        {contacts.length === 0 ? (
          <div data-testid="empty-contacts">
            <EmptyState title="No contact yet">{manage ? "Add a contact before starting a case for this supplier." : "Ask the business administrator to add a contact before starting a case for this supplier."}</EmptyState>
          </div>
        ) : (
          <Table head={["Name", "E-mail", "May confirm", "Open cases", "Status", ...(manage ? [""] : [])]}>
            {contacts.map((u) => {
              const on = u.active !== false;
              const n = openOn(u).length;
              return (
                <Tr key={u.id} data-testid={`contact-row-${u.id}`} data-active={on ? "true" : "false"}>
                  <Td className="min-w-[180px]">
                    <span className="inline-flex items-center gap-2">
                      <Avatar initials={u.initials} side="supplier" size={26} />
                      <span>
                        <span className="block text-[13px] font-medium text-ink">{u.name}</span>
                        <span className="block text-[11.5px] text-ink-3">{u.title}</span>
                      </span>
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-2">{u.email}</Td>
                  <Td className="whitespace-nowrap">{u.mayConfirm !== false ? <span className="text-ink">Yes</span> : <span className="text-ink-3">No</span>}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{n ? `${n} open` : <span className="text-ink-3">None</span>}</Td>
                  <Td className="whitespace-nowrap">
                    <Badge tone={on ? "ok" : "neutral"} dot>
                      {on ? "Active" : `Inactive since ${fmtDate(u.deactivatedAt)}`}
                    </Badge>
                  </Td>
                  {manage && (
                    <Td className="whitespace-nowrap text-right">
                      <span className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "contact", user: u })} data-testid={`contact-edit-${u.id}`}>
                          Edit
                        </Button>
                        {on ? (
                          <Button size="sm" variant="ghost" icon={<UserRoundX size={14} />} onClick={() => setDialog({ kind: "deactivate", user: u })} data-testid={`contact-deactivate-${u.id}`}>
                            Deactivate
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setContactActive(u.id, true)} data-testid={`contact-reactivate-${u.id}`}>
                            Reactivate
                          </Button>
                        )}
                      </span>
                    </Td>
                  )}
                </Tr>
              );
            })}
          </Table>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Cases" subtitle={cases.length ? `${cases.length} case${cases.length === 1 ? "" : "s"}, open ones first` : undefined} />
            {cases.length === 0 ? (
              <div data-testid="empty-supplier-cases">
                <EmptyState title="No case yet">
                  {newCase ? (
                    <>
                      Start one from{" "}
                      <Link to="/cases/new" className="font-medium text-brand hover:underline">
                        New case
                      </Link>
                      .
                    </>
                  ) : (
                    "Raw Material Management starts the cases."
                  )}
                </EmptyState>
              </div>
            ) : (
              <Table head={["Case", "Phase", "Contacts", "Due"]}>
                {cases.map((c) => (
                  <Tr key={c.id} onClick={() => nav(`/cases/${c.id}`)} data-testid={`supplier-case-${c.id}`}>
                    <Td className="min-w-[200px]">
                      <span className="block font-medium text-ink">{c.materialName}</span>
                      <Mono className="text-[11.5px] text-ink-3">{c.id}</Mono>
                    </Td>
                    <Td>
                      <PhaseBadge phase={c.phase} />
                    </Td>
                    <Td className="text-[12.5px] text-ink-2">{c.supplierContactIds.map((x) => userName(state, x)).join(", ")}</Td>
                    <Td>
                      <DueCell c={c} />
                    </Td>
                  </Tr>
                ))}
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Company" />
            <div className="p-4">
              <KeyValue
                cols={1}
                items={[
                  { k: "Legal name", v: sup.name },
                  { k: "DUNS number", v: <Mono>{sup.duns}</Mono> },
                  { k: "Country", v: sup.country },
                  { k: "City", v: sup.city || "—" },
                  { k: "Type", v: sup.type === "manufacturer" ? "Manufacturer" : "Distributor" },
                  { k: "Source", v: source },
                ]}
              />
            </div>
          </Card>
          <Card data-testid="supplier-history">
            <CardHeader title="History" subtitle="Changes to this supplier and its contacts" />
            <div className="px-4 py-4">
              {history.length === 0 ? (
                <p className="text-[13px] text-ink-3" data-testid="empty-supplier-history">
                  No change since the import from the supplier master.
                </p>
              ) : (
                <Timeline items={history.map((e) => ({ id: e.id, at: fmtDateTime(e.at), title: e.action, who: userName(state, e.by), tone: e.action.startsWith("Deactivated") ? "neutral" : "info", body: e.detail }))} />
              )}
            </div>
          </Card>
        </div>
      </div>

      {manage && dialog?.kind === "edit" && <SupplierFormModal open editing={sup} onClose={close} />}
      {manage && dialog?.kind === "status" && <SupplierStatusModal sup={sup} onClose={close} />}
      {manage && dialog?.kind === "contact" && <ContactFormModal supplier={sup} editing={dialog.user} onClose={close} />}
      {manage && dialog?.kind === "deactivate" && <DeactivateContactModal user={dialog.user} onClose={close} />}
    </div>
  );
}

/** Deactivating a supplier hides it in New case; it is refused while the supplier has open cases. */
function SupplierStatusModal({ sup, onClose }: { sup: Supplier; onClose: () => void }) {
  const { state, updateSupplier } = useStore();
  const active = isActiveSupplier(sup);
  const open = casesOfSupplier(state, sup.id).filter((c) => !isClosed(c));
  const blocked = active && open.length > 0;
  return (
    <Modal
      open
      onClose={onClose}
      title={active ? `Deactivate ${sup.name}?` : `Reactivate ${sup.name}?`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={active ? "danger" : "primary"}
            disabled={blocked}
            onClick={() => {
              if (updateSupplier(sup.id, { active: !active })) onClose();
            }}
            data-testid="supplier-status-confirm"
          >
            {active ? "Deactivate supplier" : "Reactivate supplier"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13.5px] text-ink-2">
        {active ? (
          blocked ? (
            <p className="rounded-lg border border-bad/40 bg-bad-soft px-3 py-2 text-ink">
              {sup.name} has {open.length === 1 ? "an open case" : `${open.length} open cases`} ({open.map((c) => c.id).join(", ")}). Cancel or complete {open.length === 1 ? "it" : "them"} first.
            </p>
          ) : (
            <p>An inactive supplier cannot be chosen for a new case, and its contacts can no longer open the supplier portal. Its history and closed cases are kept.</p>
          )
        ) : (
          <p>The supplier can be chosen for new cases again. Its contacts keep their own active or inactive status.</p>
        )}
      </div>
    </Modal>
  );
}
