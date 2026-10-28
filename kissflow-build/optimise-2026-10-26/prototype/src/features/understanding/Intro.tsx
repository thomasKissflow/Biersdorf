// Page intro (three honest facts) and the sticky in-page section navigation with scroll spy.

import { ArrowDown, Play } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Button, PageHeader, cx } from "@/components/ui";
import { ASSUMPTIONS_LIST, PERSONAS } from "@/domain/catalog";
import { STICKY_VAR, reviewCounts, scrollToId, type Reviews, type SectionId } from "./shared";
import { useCallMode } from "./callMode";

export function Intro({ reviews, onWalkthrough }: { reviews: Reviews; onWalkthrough: () => void }) {
  const roles = PERSONAS.length;
  const suppliers = PERSONAS.filter((p) => p.side === "supplier").length;
  const total = ASSUMPTIONS_LIST.length;
  const { correct, change } = reviewCounts(reviews, total);
  const reviewed = correct + change;
  const call = useCallMode();

  const facts: { id: SectionId; value: string; hint: string }[] = [
    { id: "process", value: "2 parts, 1 gate", hint: "The supplier's completeness confirmation closes Part 1" },
    { id: "roles", value: `${roles} roles incl. ${suppliers} supplier contacts`, hint: call ? "In production the role comes from the login" : "Switch to any of them in this prototype" },
    call
      ? { id: "timeline", value: "Production testing from 27 Oct", hint: "Our plan from the walkthrough to production testing" }
      : { id: "assumptions", value: `${total} assumptions to confirm`, hint: reviewed ? `${correct} confirmed, ${change} to change in this session` : "Where your documents disagree or are silent" },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Our understanding"
        title="How we understand the CIQ process"
        actions={
          <Button variant="primary" icon={<Play size={14} />} onClick={onWalkthrough}>
            Walk through the process
          </Button>
        }
      >
        <p className="mt-2 max-w-[70ch] text-[14px] leading-relaxed text-pretty text-ink-2">
          The supplier opens the CIQ and answers a few basic questions. As it answers, Beiersdorf's rules open only the sections that apply to this raw material. The supplier fills them in, uploads evidence at the right question and confirms completeness. Then RMM and only the departments the case concerns review in parallel and ask the supplier directly. When all of them have completed, the supplier gives the final release and the case completes with an immutable final document for RMM.
        </p>
        <p className="mt-2 max-w-[70ch] text-[12.5px] text-ink-3">
          {call
            ? "Built from your requirements PDF, the requirements matrix, the field-level matrix v0.6, our call of 9 October and your answers to our follow-up questions."
            : "Built from your requirements PDF, the requirements matrix, the field-level matrix v0.6 and your answers on our call of 9 October. Where they disagree or are silent, we say so and mark our assumption."}
        </p>
      </PageHeader>

      <div className="grid overflow-hidden rounded-card border border-line bg-surface shadow-card sm:grid-cols-3">
        {facts.map((f, i) => (
          <button
            key={f.id}
            type="button"
            onClick={() => scrollToId(f.id)}
            className={cx("group flex items-start justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-2", i > 0 && "border-line max-sm:border-t sm:border-l")}
          >
            <span className="min-w-0">
              <span className="block text-[15px] leading-snug font-semibold text-ink">{f.value}</span>
              <span className="mt-1 block text-[12.5px] leading-snug text-ink-3">{f.hint}</span>
            </span>
            <ArrowDown size={15} className="mt-1 shrink-0 text-ink-3 transition-colors group-hover:text-brand" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}

const NAV: { id: SectionId; label: string }[] = [
  { id: "process", label: "Process map" },
  { id: "assumptions", label: "Assumptions" },
  { id: "rules", label: "Questionnaire rules" },
  { id: "roles", label: "Who does what" },
  { id: "scope", label: "MVP scope" },
  { id: "needs", label: "What we need" },
];

/** The client call view ends with the timeline instead of MVP scope and open inputs, and has no assumption list (answered 12 Oct). */
const CALL_NAV: { id: SectionId; label: string }[] = [...NAV.filter((n) => n.id !== "assumptions" && n.id !== "scope" && n.id !== "needs"), { id: "timeline", label: "Timeline" }];

function useScrollSpy(ids: readonly SectionId[], offset = 150): SectionId {
  const [active, setActive] = useState<SectionId>(ids[0]);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      let current: SectionId = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - offset <= 0) current = id;
      }
      // At the very bottom the last section may be too short to reach the offset.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = ids[ids.length - 1];
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ids, offset]);
  return active;
}

/**
 * Sticky geometry: the nav sits right under the shell header, whose height differs per breakpoint
 * (below lg it also holds the mobile nav row). Measures both and publishes the bottom edge as a CSS
 * variable on the page root, used for the sections' scroll margin and the scroll spy.
 */
function useStickyGeometry(navRef: RefObject<HTMLElement | null>) {
  const [geo, setGeo] = useState({ top: 56, bottom: 104 });
  useLayoutEffect(() => {
    const nav = navRef.current;
    const header = document.querySelector<HTMLElement>("[data-app-header]");
    if (!nav) return;
    const update = () => {
      // Tuck 1px under the header so its bottom border stays the single dividing line.
      const top = header ? Math.max(0, Math.round(header.getBoundingClientRect().height) - 1) : 0;
      const bottom = top + Math.round(nav.getBoundingClientRect().height);
      setGeo((g) => (g.top === top && g.bottom === bottom ? g : { top, bottom }));
      nav.parentElement?.style.setProperty(STICKY_VAR, `${bottom}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    if (header) ro.observe(header);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [navRef]);
  return geo;
}

export function SectionNav({ assumptionsLabel }: { assumptionsLabel: string }) {
  const ref = useRef<HTMLElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const { top, bottom } = useStickyGeometry(ref);
  const nav = useCallMode() ? CALL_NAV : NAV;
  const ids = useMemo(() => nav.map((n) => n.id), [nav]);
  const active = useScrollSpy(ids, bottom + 46);

  // On narrow screens the nav row scrolls sideways: keep the active entry in view.
  useEffect(() => {
    const r = row.current;
    const btn = r?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!r || !btn || r.scrollWidth <= r.clientWidth) return;
    const left = btn.offsetLeft; // the row is the offsetParent (relative)
    const right = left + btn.offsetWidth;
    if (left < r.scrollLeft + 8) r.scrollTo({ left: Math.max(0, left - 16) });
    else if (right > r.scrollLeft + r.clientWidth - 8) r.scrollTo({ left: right - r.clientWidth + 16 });
  }, [active]);

  return (
    <nav ref={ref} aria-label="On this page" style={{ top }} className="sticky z-20 -mx-4 border-b border-line bg-bg px-4 lg:-mx-8 lg:px-8">
      <div ref={row} className="relative flex gap-1 overflow-x-auto py-2 scrollbar-thin">
        {nav.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => scrollToId(n.id)}
            aria-current={active === n.id ? "location" : undefined}
            className={cx("shrink-0 rounded-md px-2.5 py-1.5 text-[13px] whitespace-nowrap transition-colors", active === n.id ? "bg-brand-soft font-semibold text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
          >
            {n.label}
            {n.id === "assumptions" && <span className="ml-1.5 text-[11.5px] font-medium tabular-nums opacity-80">{assumptionsLabel}</span>}
          </button>
        ))}
      </div>
    </nav>
  );
}
