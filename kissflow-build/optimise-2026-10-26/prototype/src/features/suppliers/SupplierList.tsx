// Suppliers (/suppliers): the supplier master, an imported data master with no onboarding flow. Only the Business
// administrator adds, edits, deactivates and reactivates suppliers and contacts; RMM looks them up read-only; other
// roles have no access.
import { Building2, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Mono, PageHeader, Table, Td, TextInput, Tr } from "@/components/ui";
import { can } from "@/domain/permissions";
import { supplierRows } from "@/domain/suppliers";
import { useStore } from "@/store/store";
import { NoAccess } from "@/features/rmm/shared";
import { SupplierFormModal } from "./forms";
import { MaintainedByAdmin } from "./ReadOnlyNote";

export function SupplierList() {
  const { state, me } = useStore();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState("");
  const manage = can(state, me.id, "supplier.manage");
  // "?add=1" opens the add form directly for the administrator (a link from elsewhere); after saving, the new
  // supplier's page opens.
  const [adding, setAdding] = useState(() => params.get("add") === "1");
  if (!can(state, me.id, "supplier.view")) return <NoAccess>The supplier master is for Raw Material Management and the business administrator.</NoAccess>;

  const needle = q.trim().toLowerCase();
  const all = supplierRows(state).sort((a, b) => Number(a.status === "inactive") - Number(b.status === "inactive") || a.supplier.name.localeCompare(b.supplier.name));
  const rows = all.filter((r) => !needle || `${r.supplier.name} ${r.supplier.duns} ${r.supplier.country} ${r.supplier.city ?? ""}`.toLowerCase().includes(needle.replace(/[\s-]/g, "")) || r.supplier.name.toLowerCase().includes(needle));
  const active = all.filter((r) => r.status === "active").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Suppliers"
        subtitle={`The supplier master: ${active} active supplier${active === 1 ? "" : "s"}. New cases are started for an active supplier and one or two of its active contacts.`}
        actions={
          manage ? (
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)} data-testid="supplier-add">
              Add supplier
            </Button>
          ) : (
            <MaintainedByAdmin testId="suppliers-read-only" />
          )
        }
      />
      <Card>
        <div className="border-b border-line p-3">
          <div className="relative max-w-md">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
            <TextInput aria-label="Search suppliers" placeholder="Search name, DUNS or country…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" data-testid="supplier-search" />
          </div>
        </div>
        {rows.length === 0 ? (
          <div data-testid="empty-suppliers">
            <EmptyState icon={<Building2 size={28} />} title={all.length ? "No supplier matches" : "No supplier yet"}>
              {all.length ? "Try another name or DUNS number." : manage ? "Add the first supplier with at least one contact." : "The business administrator adds the suppliers."}
            </EmptyState>
          </div>
        ) : (
          <Table head={["Supplier", "DUNS", "Country", "Type", "Contacts", "Open cases", "Status"]}>
            {rows.map((r) => (
              <Tr key={r.supplier.id} onClick={() => nav(`/suppliers/${r.supplier.id}`)} data-testid={`supplier-row-${r.supplier.id}`} data-status={r.status}>
                <Td className="min-w-[200px]">
                  <span className="font-medium text-ink">{r.supplier.name}</span>
                  {r.supplier.city && <span className="block text-[12px] text-ink-3">{r.supplier.city}</span>}
                </Td>
                <Td className="whitespace-nowrap">
                  <Mono>{r.supplier.duns}</Mono>
                </Td>
                <Td className="whitespace-nowrap text-ink-2">{r.supplier.country}</Td>
                <Td className="whitespace-nowrap text-ink-2">{r.supplier.type === "manufacturer" ? "Manufacturer" : "Distributor"}</Td>
                <Td className="whitespace-nowrap">
                  <span className={r.activeContacts ? "text-ink" : "font-medium text-bad"}>{r.activeContacts} active</span>
                  {r.contacts > r.activeContacts && <span className="text-ink-3"> · {r.contacts - r.activeContacts} inactive</span>}
                </Td>
                <Td className="whitespace-nowrap">
                  {r.openCases ? (
                    <Link to={`/cases?supplier=${r.supplier.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-brand hover:underline">
                      {r.openCases} open
                    </Link>
                  ) : (
                    <span className="text-ink-3">None</span>
                  )}
                  {r.cases > r.openCases && <span className="text-ink-3"> · {r.cases - r.openCases} closed</span>}
                </Td>
                <Td>
                  <Badge tone={r.status === "active" ? "ok" : "neutral"} dot>
                    {r.status === "active" ? "Active" : "Inactive"}
                  </Badge>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
      {manage && <SupplierFormModal open={adding} onClose={() => setAdding(false)} onSaved={(id) => nav(`/suppliers/${id}`)} />}
    </div>
  );
}
