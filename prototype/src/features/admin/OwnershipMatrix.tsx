// /admin/ownership: the section × department responsibility matrix (REQ-CFG-006).
// Phones (< 768 px, Thomas 30 Oct): one card per section that names its lead, its co-reviewers and the departments not
// involved (each department keeps its cell's test id and status), then the counts per department; read-only (the
// business administrator gets "Use a larger screen to edit").
import { RotateCcw, Users, X } from "lucide-react";
import { Badge, Card, CardList, CardListItem, IconButton, Mono, PageHeader, Table, Td, Tr, cx } from "@/components/ui";
import { DEPT_LABEL, DEPT_SHORT, REVIEW_DEPTS, SECTIONS, SECTION_BY_ID, SHARED_SECTIONS } from "@/domain/catalog";
import type { Dept, SectionDef } from "@/domain/types";
import { useStore } from "@/store/store";
import { AdminOnly, Callout, ReadOnlyNote, useAdminAccess } from "./shared";

const DEPTS: Dept[] = ["RMM", "REG", "SAF", "QM", "MIC", "SUS", "CUS", "LEG"];
const GROUPS: { kind: SectionDef["kind"]; label: string }[] = [
  { kind: "basic", label: "Basic data" },
  { kind: "chapter", label: "Chapters" },
  { kind: "annex", label: "Annexes" },
];

type Role = "lead" | "co" | "none";

const sameSet = (a: Dept[], b: Dept[]) => a.length === b.length && a.every((x) => b.includes(x));

function RoleCell({ role, canEdit, label, testid, onCycle, onRemove }: { role: Role; canEdit: boolean; label: string; testid: string; onCycle: () => void; onRemove: () => void }) {
  const chip =
    role === "lead" ? (
      <span className="inline-flex h-6 min-w-[46px] items-center justify-center rounded-md bg-brand-soft px-2 text-xs font-semibold text-brand">Lead</span>
    ) : role === "co" ? (
      <span className="inline-flex h-6 min-w-[46px] items-center justify-center rounded-md border border-line-strong bg-surface px-2 text-xs font-medium text-ink-2">Co</span>
    ) : (
      <span className="inline-flex h-6 min-w-[46px] items-center justify-center rounded-md text-xs text-ink-3 opacity-40 group-hover:opacity-100">{canEdit ? "+" : "·"}</span>
    );
  if (!canEdit)
    return (
      <span data-testid={testid} data-status={role} aria-label={`${label}: ${role === "none" ? "no role" : role}`}>
        {chip}
      </span>
    );
  const next = role === "none" ? "make co-reviewer" : role === "co" ? "make lead" : "lead (exactly one per section)";
  return (
    <span className="group relative inline-flex items-center">
      <button
        type="button"
        data-testid={testid}
        data-status={role}
        onClick={onCycle}
        title={`${label}: ${next}`}
        aria-label={`${label}: ${role === "none" ? "no role" : role}. Click to ${next}.`}
        className="rounded-md transition-colors hover:bg-surface-3"
      >
        {chip}
      </button>
      {role === "co" && (
        <button
          type="button"
          onClick={onRemove}
          title={`${label}: remove co-reviewer`}
          aria-label={`${label}: remove co-reviewer`}
          className="absolute top-1/2 -right-4 -translate-y-1/2 rounded p-0.5 text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-surface-3 hover:text-ink focus-visible:opacity-100"
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}

const PHONE_CHIP: Record<Role, string> = {
  lead: "bg-brand-soft font-semibold text-brand",
  co: "border border-line-strong bg-surface font-medium text-ink-2",
  none: "text-ink-3",
};

/** A section's departments on a phone, grouped by their role: Lead, Co-reviewers, Not involved. */
function PhoneRoles({ s, roleOf }: { s: SectionDef; roleOf: (id: string, d: Dept) => Role }) {
  const rows: { role: Role; label: string }[] = [
    { role: "lead", label: "Lead" },
    { role: "co", label: "Co-reviewers" },
    { role: "none", label: "Not involved" },
  ];
  return (
    <dl className="space-y-1.5">
      {rows.map(({ role, label }) => {
        const depts = DEPTS.filter((d) => roleOf(s.id, d) === role);
        return (
          <div key={role} className="flex items-baseline gap-2">
            <dt className="w-[6.5rem] shrink-0 text-[11.5px] text-ink-3">{label}</dt>
            <dd className="flex min-w-0 flex-1 flex-wrap gap-1">
              {depts.length ? (
                depts.map((d) => (
                  <span
                    key={d}
                    data-testid={`owner-cell-${s.id}-${d}`}
                    data-status={role}
                    title={DEPT_LABEL[d]}
                    aria-label={`${s.code} · ${DEPT_SHORT[d]}: ${role === "none" ? "no role" : role}`}
                    className={cx("inline-flex h-6 items-center rounded-md px-2 text-xs", PHONE_CHIP[role])}
                  >
                    {DEPT_SHORT[d]}
                  </span>
                ))
              ) : (
                <span className="text-xs text-ink-3">None</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function OwnershipMatrix() {
  return (
    <AdminOnly>
      <OwnersPage />
    </AdminOnly>
  );
}

function OwnersPage() {
  const { state, setOwnership, notify } = useStore();
  const { canChange, phone } = useAdminAccess();
  const own = (id: string) => state.ownership[id] ?? { lead: SECTION_BY_ID[id].lead, co: SECTION_BY_ID[id].co };
  const roleOf = (id: string, d: Dept): Role => (own(id).lead === d ? "lead" : own(id).co.includes(d) ? "co" : "none");
  const changed = (s: SectionDef) => own(s.id).lead !== s.lead || !sameSet(own(s.id).co, s.co);

  const cycle = (s: SectionDef, d: Dept) => {
    const o = own(s.id);
    const r = roleOf(s.id, d);
    if (r === "none") setOwnership(s.id, o.lead, [...o.co, d]);
    else if (r === "co") setOwnership(s.id, d, [...o.co.filter((x) => x !== d), o.lead]);
    else notify("warning", `${s.code} needs exactly one lead. Make another department lead first; ${DEPT_SHORT[d]} then becomes co-reviewer.`);
  };
  const remove = (s: SectionDef, d: Dept) =>
    setOwnership(
      s.id,
      own(s.id).lead,
      own(s.id).co.filter((x) => x !== d),
    );

  const changedCount = SECTIONS.filter(changed).length;
  const ledBy = (d: Dept) => SECTIONS.filter((s) => own(s.id).lead === d).length;
  const coBy = (d: Dept) => SECTIONS.filter((s) => own(s.id).co.includes(d)).length;

  return (
    <div>
      <PageHeader
        eyebrow="Business administration"
        title="Section owners"
        subtitle="Which department leads the review of each chapter and annex, and who co-reviews. Review tasks follow this matrix when they are created at the completeness confirmation; tasks already given stay as they are."
      />

      <ReadOnlyNote what="section ownership" onPhone="On a phone you can look at the section owners, but not change them." />

      <div className="grid gap-3 lg:grid-cols-2">
        <Callout tone="info" icon={<Users size={16} />} title="Shared sections">
          K2.2, K6.14 and K6.17 have more than one department. The lead department reviews and decides; a co-reviewer reads the section and asks the supplier through the lead.
        </Callout>
        <Callout tone="neutral" title="Customs and Legal are informed, not reviewing">
          They lead K7 and K8 / K8.1 without a review step: they are informed when the review starts, read the whole case and may post internal notes.
        </Callout>
      </div>

      {phone ? (
        <div className="mt-5" data-testid="owners-phone">
          <h3 className="text-[15px] font-semibold text-ink">Responsibility matrix</h3>
          <p className="mt-0.5 text-[13px] text-ink-3">Lead decides on the section; Co reads and comments.</p>
          <p className="mt-1 text-[13px] text-ink-2">
            {changedCount === 0 ? "Matches the requirements document" : `${changedCount} section${changedCount > 1 ? "s" : ""} changed from the requirements document`} · changes apply to review tasks created from now on
          </p>
          {GROUPS.map((g) => (
            <section key={g.kind} aria-label={g.label} className="mt-4">
              <h4 className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink-3 uppercase">{g.label}</h4>
              <CardList label={`${g.label}: section owners`}>
                {SECTIONS.filter((s) => s.kind === g.kind).map((s) => {
                  const shared = SHARED_SECTIONS.includes(s.id);
                  const isChanged = changed(s);
                  return (
                    <CardListItem
                      key={s.id}
                      data-testid={`owner-row-${s.id}`}
                      title={
                        <>
                          <Mono className="mr-1.5 font-medium">{s.code}</Mono>
                          {s.title}
                        </>
                      }
                      badge={
                        (shared || isChanged) && (
                          <>
                            {shared && <Badge tone="info">Shared</Badge>}
                            {isChanged && <Badge tone="warn">Changed</Badge>}
                          </>
                        )
                      }
                    >
                      <PhoneRoles s={s} roleOf={roleOf} />
                    </CardListItem>
                  );
                })}
              </CardList>
            </section>
          ))}
          <section aria-label="Sections per department" className="mt-4">
            <CardList>
              <CardListItem
                data-testid="owner-totals"
                title="Sections per department"
                fields={DEPTS.map((d) => ({ label: <span title={DEPT_LABEL[d]}>{DEPT_SHORT[d]}</span>, value: <span className="tabular-nums">{`${ledBy(d)} lead · ${coBy(d)} co`}</span> }))}
              />
            </CardList>
          </section>
        </div>
      ) : (
        <Card className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <h3 className="text-[15px] font-semibold text-ink">Responsibility matrix</h3>
              <p className="mt-0.5 text-[13px] text-ink-3">
                {canChange ? "Click a cell: empty → Co → Lead. Making a department lead moves the previous lead to Co. Each section keeps exactly one lead." : "Lead decides on the section; Co reads and comments."}
              </p>
            </div>
            <div className="text-[13px] text-ink-2">
              {changedCount === 0 ? "Matches the requirements document" : `${changedCount} section${changedCount > 1 ? "s" : ""} changed from the requirements document`} · changes apply to review tasks created from now on
            </div>
          </div>
          <Table
            dense
            tightHead
            head={[
              "Section",
              ...DEPTS.map((d) => (
                <span key={d} title={DEPT_LABEL[d]} className="block text-center">
                  <span className="text-ink-2">{DEPT_SHORT[d]}</span>
                  <span className="mx-auto block max-w-[7.5rem] text-[10.5px] leading-tight font-normal whitespace-normal">{(REVIEW_DEPTS as Dept[]).includes(d) ? "reviews" : d === "RMM" ? "case owner · reviews the whole CIQ" : "informed"}</span>
                </span>
              )),
              "",
            ]}
          >
            {GROUPS.map((g) => [
              <tr key={`h-${g.kind}`} className="bg-surface-2">
                <td colSpan={DEPTS.length + 2} className="px-4 py-1.5 text-xs font-semibold tracking-wide text-ink-3 uppercase">
                  {g.label}
                </td>
              </tr>,
              ...SECTIONS.filter((s) => s.kind === g.kind).map((s) => {
                const shared = SHARED_SECTIONS.includes(s.id);
                const isChanged = changed(s);
                return (
                  <Tr key={s.id} className={cx(shared && "bg-info-soft/40")}>
                    <Td className="min-w-[220px] py-1.5 sm:min-w-[240px] 2xl:min-w-[320px]">
                      {/* Code in its own column so a wrapping title or badge never drops under the code. */}
                      <div className="flex items-baseline gap-1.5">
                        <Mono className="w-[64px] shrink-0 font-medium">{s.code}</Mono>
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span className="text-[13px] text-ink">{s.title}</span>
                          {shared && <Badge tone="info">Shared</Badge>}
                          {isChanged && <Badge tone="warn">Changed</Badge>}
                        </div>
                      </div>
                    </Td>
                    {DEPTS.map((d) => (
                      <Td key={d} className="px-2 py-1.5 text-center">
                        <RoleCell role={roleOf(s.id, d)} canEdit={canChange} label={`${s.code} · ${DEPT_SHORT[d]}`} testid={`owner-cell-${s.id}-${d}`} onCycle={() => cycle(s, d)} onRemove={() => remove(s, d)} />
                      </Td>
                    ))}
                    <Td className="w-10 px-2 py-1.5">
                      {canChange && isChanged && (
                        <IconButton label={`Restore ${s.code} to the requirements document`} data-testid={`owner-restore-${s.id}`} onClick={() => setOwnership(s.id, s.lead, s.co)}>
                          <RotateCcw size={14} />
                        </IconButton>
                      )}
                    </Td>
                  </Tr>
                );
              }),
            ])}
            <tr className="border-t-2 border-line-strong bg-surface-2">
              <td className="px-4 py-2.5 text-[13px] font-semibold text-ink">Sections per department</td>
              {DEPTS.map((d) => (
                <td key={d} className="px-2 py-2.5 text-center text-xs whitespace-nowrap">
                  <div className="font-semibold text-ink tabular-nums">{ledBy(d)} lead</div>
                  <div className="text-ink-3 tabular-nums">{coBy(d)} co</div>
                </td>
              ))}
              <td />
            </tr>
          </Table>
        </Card>
      )}
    </div>
  );
}
