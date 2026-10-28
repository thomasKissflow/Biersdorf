// The person chip (top right) and its menu. It shows who is signed in, as in the final app, plus a muted "Demo" part
// (spec §3): View as (every role holder and every active supplier contact, with open tasks and unread mails), Show
// prototype notes, and Reset to empty start with an in-page confirmation. In production the role comes from the login.

import { Check, ChevronDown, ListTodo, Mail as MailIcon, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Button, Modal, Toggle, cx } from "@/components/ui";
import { switchablePeople, type SwitchablePerson } from "@/domain/personas";
import { buildSeed } from "@/domain/seed";
import { useStore } from "@/store/store";
import { useDemoNotes } from "./demoNotes";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function RoleSwitcher() {
  const { state, persona, me, dismissToast } = useStore();
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", h);
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener("mousedown", h);
      window.removeEventListener("keydown", k);
    };
  }, [open]);

  const supplier = persona.side === "supplier" ? state.suppliers.find((s) => s.id === me.supplierId) : undefined;
  const subtitle = supplier ? supplier.name : persona.label;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          // Toasts are about the last action and sit where the menu opens: clear them before a persona switch.
          if (!open) for (const t of state.toasts) dismissToast(t.id);
          setOpen((o) => !o);
        }}
        data-testid="person-chip"
        data-persona={persona.id}
        className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5 text-left shadow-card transition-colors hover:bg-surface-2"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${me.name}, ${subtitle}. Open the person menu`}
      >
        <Avatar initials={me.initials} side={persona.side} size={26} />
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-[180px] truncate text-[13px] leading-tight font-medium text-ink">{me.name}</span>
          <span className="block max-w-[180px] truncate text-[11.5px] leading-tight text-ink-3">{subtitle}</span>
        </span>
        <ChevronDown size={14} className={cx("text-ink-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && <PersonMenu subtitle={subtitle} onClose={() => setOpen(false)} onReset={() => setConfirmReset(true)} />}
      <ResetModal open={confirmReset} onClose={() => setConfirmReset(false)} />
    </div>
  );
}

function PersonMenu({ subtitle, onClose, onReset }: { subtitle: string; onClose: () => void; onReset: () => void }) {
  const { state, persona, me, setPersona } = useStore();
  const notes = useDemoNotes();
  const nav = useNavigate();
  const groups = switchablePeople(state);

  const viewAs = (p: SwitchablePerson) => {
    setPersona(p.personaId);
    onClose();
    nav(p.landing);
  };

  return (
    <div
      role="menu"
      aria-label="Person and demo menu"
      data-testid="person-menu"
      className="absolute right-0 z-50 mt-2 flex max-h-[calc(100dvh-5rem)] w-[min(360px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
        <Avatar initials={me.initials} side={persona.side} size={36} />
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-ink">{me.name}</p>
          <p className="truncate text-[12px] text-ink-3">{me.email}</p>
          <p className="truncate text-[12px] text-ink-2">{persona.side === "supplier" ? `${me.title} · ${subtitle}` : subtitle}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-1">
        <span className="rounded border border-dashed border-line-strong px-1.5 py-px text-[10.5px] font-semibold tracking-wide text-ink-3 uppercase">Demo</span>
        <span className="text-[12px] text-ink-3">View as</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 scrollbar-thin">
        {groups.map((g) => (
          <div key={g.key} role="group" aria-label={g.side === "supplier" ? `Supplier ${g.title}` : g.title} className="mt-1.5">
            <div className="truncate px-2 py-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{g.side === "supplier" ? `Supplier · ${g.title}` : g.title}</div>
            {g.people.map((p) => {
              const current = p.personaId === persona.id;
              return (
                <button
                  key={p.personaId}
                  type="button"
                  role="menuitemradio"
                  aria-checked={current}
                  onClick={() => viewAs(p)}
                  data-testid={`view-as-${p.personaId}`}
                  data-tasks={p.tasks}
                  data-unread={p.unread}
                  className={cx("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors", current ? "bg-brand-soft" : "hover:bg-surface-2")}
                >
                  <Avatar initials={p.initials} side={p.side} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{p.name}</span>
                    <span className="block truncate text-[11.5px] text-ink-3">{p.roleLabel}</span>
                  </span>
                  {p.tasks > 0 && (
                    <span title={plural(p.tasks, "open task")} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-3 px-1.5 py-px text-[11px] font-medium text-ink-2 tabular-nums">
                      <ListTodo size={11} aria-hidden />
                      {p.tasks}
                      <span className="sr-only"> {p.tasks === 1 ? "open task" : "open tasks"}</span>
                    </span>
                  )}
                  {p.unread > 0 && (
                    <span title={plural(p.unread, "unread mail")} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-1.5 py-px text-[11px] font-semibold text-brand tabular-nums">
                      <MailIcon size={11} aria-hidden />
                      {p.unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                  <Check size={15} aria-hidden className={cx("shrink-0 text-brand", !current && "invisible")} />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="shrink-0 space-y-1 border-t border-line bg-surface-2 px-4 py-2.5">
        <Toggle checked={notes.show} onChange={notes.setShow} label="Show prototype notes" data-testid="toggle-prototype-notes" />
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onReset();
          }}
          data-testid="reset-demo"
          className="flex items-center gap-2 py-1 text-[13px] text-ink-2 transition-colors hover:text-ink"
        >
          <RotateCcw size={14} aria-hidden /> Reset to empty start
        </button>
      </div>
    </div>
  );
}

function ResetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { reset } = useStore();
  const nav = useNavigate();
  // What the empty start holds, described from the start state itself.
  const start = useMemo(() => (open ? buildSeed() : undefined), [open]);
  const roleHolders = start?.users.filter((u) => u.side === "internal").length ?? 0;
  const suppliers = (start?.suppliers ?? []).map((s) => {
    const contacts = start?.users.filter((u) => u.side === "supplier" && u.supplierId === s.id).length ?? 0;
    return `${s.name} with ${plural(contacts, "contact")}`;
  });
  const confirm = () => {
    reset();
    onClose();
    nav("/");
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reset to empty start?"
      subtitle="Only the demo data in this browser changes."
      data-testid="reset-demo-modal"
      footer={
        <>
          <Button onClick={onClose} data-testid="reset-demo-cancel">
            Cancel
          </Button>
          <Button variant="danger" icon={<RotateCcw size={14} />} onClick={confirm} data-testid="reset-demo-confirm">
            Reset
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13.5px] text-ink-2">
        <p>Every case, e-mail and added supplier or contact is removed, and the configuration goes back to its start.</p>
        <div>
          <p className="font-medium text-ink">What stays</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>The {plural(roleHolders, "Beiersdorf role holder")}, one per role</li>
            {suppliers.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
