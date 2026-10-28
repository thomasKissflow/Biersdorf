// Left column of the workspace: my sections and every other active section. In RMM's lane every active section is
// its own ("Whole CIQ"). A department may ask on any section too; its own ones come first. Sections the supplier
// changed since the reviewer's reference point carry a "Changed" marker.
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button, Select, cx } from "@/components/ui";
import { sectionOf } from "@/domain/catalog";
import { scopeOf } from "@/domain/selectors";
import type { AppState, CiqCase, ReviewDept } from "@/domain/types";

function Item({ c, id, active, onSelect, role, changed, sinceLabel }: { c: CiqCase; id: string; active: boolean; onSelect: (id: string) => void; role?: "Lead" | "Co"; changed: boolean; sinceLabel: string }) {
  const sec = sectionOf(id, c.templateVersion); // as the case's questionnaire version defines it (spec §8.1)
  const sc = scopeOf(c, id);
  const ops = c.openPoints.filter((p) => p.ref.sectionId === id && p.status !== "closed");
  return (
    <button
      onClick={() => onSelect(id)}
      aria-current={active ? "true" : undefined}
      data-testid={`section-nav-${id}`}
      className={cx("flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors", active ? "bg-brand-soft" : "hover:bg-surface-2")}
    >
      <span className={cx("w-[52px] shrink-0 pt-px font-mono text-[11.5px]", active ? "font-medium text-brand" : "text-ink-3")}>{sec?.code.replace("Annex ", "A")}</span>
      <span className="min-w-0 flex-1">
        <span className={cx("line-clamp-2 block text-[13px] leading-snug", active ? "font-semibold text-ink" : "text-ink-2")}>{sec?.title ?? id}</span>
        {(role || changed || sc?.addedLater || sc?.applicability === "optional") && (
          <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-ink-3">
            {changed && (
              <span className="inline-flex items-center gap-1 font-medium text-ink-2" title={`The supplier changed answers or documents ${sinceLabel}`} data-testid={`section-changed-${id}`}>
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warn" />
                Changed
              </span>
            )}
            {role && <span>{role === "Lead" ? "Lead" : "Co-review"}</span>}
            {sc?.applicability === "optional" && <span>Optional</span>}
            {sc?.addedLater && <span className="font-medium text-brand">Added in review</span>}
          </span>
        )}
      </span>
      {ops.length > 0 && (
        <span title={`${ops.length} unresolved open point${ops.length === 1 ? "" : "s"}`} className="mt-0.5 shrink-0 rounded-full bg-warn-soft px-1.5 text-[11px] font-semibold text-ink-2">
          {ops.length}
        </span>
      )}
    </button>
  );
}

/** Small screens: a compact picker instead of the long section list. */
export function SectionPicker({ lane = "dept", templateVersion, mine, others, changed, selected, onSelect, canActivate, onActivate }: { lane?: "rmm" | "dept"; templateVersion: string; mine: string[]; others: string[]; changed: string[]; selected: string; onSelect: (id: string) => void; canActivate: boolean; onActivate: () => void }) {
  const label = (id: string) => {
    const sec = sectionOf(id, templateVersion);
    return `${sec?.code ?? id} · ${sec?.title ?? ""}${changed.includes(id) ? " · changed" : ""}`;
  };
  return (
    // min-w-0: this is a grid item in an auto-sized column; without it a long section name widens the
    // column past the phone screen.
    <div className="flex min-w-0 items-center gap-2 lg:hidden">
      <Select value={selected} onChange={(e) => onSelect(e.target.value)} aria-label="Section" className="min-w-0 flex-1">
        <optgroup label={lane === "rmm" ? "Whole CIQ" : "My sections"}>
          {mine.map((id) => (
            <option key={id} value={id}>
              {label(id)}
            </option>
          ))}
        </optgroup>
        {others.length > 0 && (
          <optgroup label="Other sections">
            {others.map((id) => (
              <option key={id} value={id}>
                {label(id)}
              </option>
            ))}
          </optgroup>
        )}
      </Select>
      {canActivate && (
        <Button variant="secondary" icon={<Plus size={14} />} onClick={onActivate} aria-label="Add a section" className="shrink-0" data-testid="add-section-mobile">
          Section
        </Button>
      )}
    </div>
  );
}

export function SectionNav({
  c,
  dept,
  ownership,
  mine,
  others,
  changed,
  sinceLabel,
  selected,
  onSelect,
  canActivate,
  onActivate,
}: {
  c: CiqCase;
  dept: ReviewDept;
  ownership: AppState["ownership"];
  mine: string[];
  others: string[];
  changed: string[];
  sinceLabel: string;
  selected: string;
  onSelect: (id: string) => void;
  canActivate: boolean;
  onActivate: () => void;
}) {
  const [showOthers, setShowOthers] = useState(true);
  const rmm = dept === "RMM";
  // RMM reads every section: show Lead / Co only where RMM really owns the section (e.g. GEN, K2.3).
  const roleOf = (id: string): "Lead" | "Co" | undefined => {
    const sec = sectionOf(id, c.templateVersion);
    const own = ownership[id] ?? { lead: sec?.lead, co: sec?.co ?? [] };
    if (own.lead === dept) return "Lead";
    if (!rmm || own.co.includes(dept)) return "Co";
    return undefined;
  };
  const changedOthers = others.filter((id) => changed.includes(id)).length;
  return (
    <nav aria-label="CIQ sections" data-testid="section-nav" className="hidden space-y-4 lg:sticky lg:block lg:top-[calc(var(--app-header-h,56px)_+_24px)] lg:max-h-[calc(100vh_-_var(--app-header-h,56px)_-_24px_-_var(--complete-bar,1rem))] lg:overflow-y-auto lg:pr-1 scrollbar-thin">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between px-2.5">
          <span className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{rmm ? "Whole CIQ" : "My sections"}</span>
          <span className="text-[11px] text-ink-3">{mine.length}</span>
        </div>
        {mine.length === 0 ? (
          <p className="px-2.5 text-[12.5px] text-ink-3">No section of this case is assigned to your department.</p>
        ) : (
          <div className="space-y-0.5">
            {mine.map((id) => (
              <Item key={id} c={c} id={id} active={id === selected} onSelect={onSelect} role={roleOf(id)} changed={changed.includes(id)} sinceLabel={sinceLabel} />
            ))}
          </div>
        )}
      </div>
      {others.length > 0 && (
        <div>
          <button onClick={() => setShowOthers((v) => !v)} className="mb-1.5 flex w-full items-start justify-between gap-2 px-2.5 text-left" aria-expanded={showOthers}>
            <span className="text-[11px] leading-snug font-semibold tracking-wide text-balance text-ink-3 uppercase">Other sections</span>
            <span className="shrink-0 text-[11px] leading-snug whitespace-nowrap text-ink-3 hover:text-ink">{showOthers ? "Hide" : `Show ${others.length}${changedOthers ? ` · ${changedOthers} changed` : ""}`}</span>
          </button>
          {showOthers && (
            <div className="space-y-0.5">
              {others.map((id) => (
                <Item key={id} c={c} id={id} active={id === selected} onSelect={onSelect} changed={changed.includes(id)} sinceLabel={sinceLabel} />
              ))}
            </div>
          )}
        </div>
      )}
      {canActivate && (
        <div className="border-t border-line px-1 pt-3">
          <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={onActivate} className="w-full justify-start" data-testid="add-section">
            Add a section
          </Button>
          <p className="mt-1 px-2.5 text-[11.5px] text-ink-3">For a section that does not apply yet. You give a justification and the supplier gets a task.</p>
        </div>
      )}
    </nav>
  );
}
