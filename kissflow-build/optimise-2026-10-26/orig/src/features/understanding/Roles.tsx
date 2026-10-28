// "Who does what": every persona of the prototype, grouped by what they do in the process, with a
// working "View as" switch (store setPersona + navigate to the persona's start page).

import { ArrowRight, Factory, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Avatar, Badge, Button, Card, CardHeader, cx } from "@/components/ui";
import { PERSONAS } from "@/domain/catalog";
import type { Persona, PersonaId } from "@/domain/types";
import { useStore } from "@/store/store";
import { NoBreakIds, PageSection, firstName } from "./shared";
import { useCallMode } from "./callMode";

const GROUPS: { title: string; text: string; ids: PersonaId[] }[] = [
  { title: "Runs and reviews the case", text: "Starts every case, reviews the whole CIQ alongside the departments and receives the final PDF. No longer relays each question.", ids: ["rmm"] },
  { title: "Review in parallel", text: "Only the departments a case concerns get a task; they review alongside RMM.", ids: ["reg", "saf", "qm", "mic", "sus"] },
  { title: "Supplier, external", text: "Two contacts of one supplier, working at the same time.", ids: ["supplier", "supplier2"] },
  { title: "Informed, read-only", text: "They own sections, but no review step is defined for them.", ids: ["cus", "leg"] },
  { title: "Maintain, steer and audit", text: "Rules and questionnaire, reports, and the audit trail.", ids: ["admin", "owner", "auditor"] },
];

export function Roles() {
  const call = useCallMode();
  const grouped = new Set(GROUPS.flatMap((g) => g.ids));
  const rest = PERSONAS.filter((p) => !grouped.has(p.id)).map((p) => p.id);
  const groups = rest.length ? [...GROUPS, { title: "Other roles", text: "", ids: rest }] : GROUPS;
  const supplierCount = PERSONAS.filter((p) => p.side === "supplier").length;

  return (
    <PageSection
      id="roles"
      title="Who does what"
      hint={call ? `${PERSONAS.length} roles, including ${supplierCount} supplier contacts. In production the role comes from the login.` : `${PERSONAS.length} roles in this prototype, including ${supplierCount} supplier contacts. Switch to any of them to see the application through their eyes. In production the role comes from the login.`}
    >
      <div className="gap-4 lg:columns-2">
        {groups.map((g) => (
          <Card key={g.title} className="mb-4 break-inside-avoid">
            <CardHeader title={g.title} subtitle={g.text ? <NoBreakIds text={g.text} /> : undefined} action={<span className="text-[12px] text-ink-3 tabular-nums">{g.ids.length === 1 ? "1 role" : `${g.ids.length} roles`}</span>} />
            <ul className="divide-y divide-line">
              {g.ids.map((id) => {
                const p = PERSONAS.find((x) => x.id === id);
                return p ? <PersonaRow key={id} p={p} /> : null;
              })}
            </ul>
          </Card>
        ))}
      </div>
    </PageSection>
  );
}

function PersonaRow({ p }: { p: Persona }) {
  const { state, persona: current, setPersona } = useStore();
  const call = useCallMode();
  const nav = useNavigate();
  const user = state.users.find((u) => u.id === p.userId);
  const isCurrent = current.id === p.id;
  const name = user ? firstName(user.name) : p.label;

  return (
    <li className="flex gap-3 px-4 py-3.5">
      {call ? (
        <span className={cx("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full", p.side === "supplier" ? "bg-violet-soft text-violet" : "bg-brand-soft text-brand")} aria-hidden>
          {p.side === "supplier" ? <Factory size={15} /> : <UserRound size={15} />}
        </span>
      ) : (
        user && <Avatar initials={user.initials} side={p.side} size={32} />
      )}
      {/* Below sm the action moves under the text, so the description keeps a readable width. */}
      <div className="flex min-w-0 flex-1 flex-col gap-x-3 gap-y-2.5 sm:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h4 className="text-[13.5px] leading-snug font-semibold text-ink">{p.label}</h4>
            <Badge tone={p.side === "supplier" ? "violet" : "neutral"}>{p.side === "supplier" ? "External" : "Internal"}</Badge>
          </div>
          {user && !call && (
            <p className="mt-0.5 text-[12.5px] text-ink-3">
              {user.name} · {user.title}
            </p>
          )}
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-pretty text-ink-2">
            <NoBreakIds text={p.description} />
          </p>
        </div>
        <div className="shrink-0 sm:pt-0.5">
          {call ? null : isCurrent ? (
            <Badge tone="brand" dot>
              Current role
            </Badge>
          ) : (
            <Button
              size="sm"
              iconRight={<ArrowRight size={14} />}
              onClick={() => {
                setPersona(p.id);
                nav(p.landing);
              }}
            >
              View as {name}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
