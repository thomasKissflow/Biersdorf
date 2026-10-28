// "Timeline": the plan from the process walkthrough to production testing (client call view only).

import { Check, UserRoundCheck } from "lucide-react";
import { Badge, Card, cx } from "@/components/ui";
import { TIMELINE } from "./content";
import { PageSection } from "./shared";

const fmtDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtWeekday = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });

export function Timeline() {
  const next = TIMELINE.findIndex((m) => !m.done);
  return (
    <PageSection id="timeline" title="Timeline" hint="Our plan from the process walkthrough to production testing with your end users.">
      <Card>
        <ol>
          {TIMELINE.map((m, i) => {
            const status = m.done ? "done" : i === next ? "next" : "planned";
            const last = i === TIMELINE.length - 1;
            return (
              <li key={m.date} className="grid grid-cols-[7.5rem_1.5rem_minmax(0,1fr)] gap-x-4 px-5 max-sm:grid-cols-[1.5rem_minmax(0,1fr)] max-sm:gap-x-3">
                <div className="pt-4 pb-5 text-right max-sm:hidden">
                  <div className={cx("text-[13.5px] font-semibold tabular-nums", status === "planned" ? "text-ink-2" : "text-ink")}>{fmtDay(m.date)}</div>
                  <div className="text-[12px] text-ink-3">{fmtWeekday(m.date)}</div>
                </div>
                <div className="relative flex justify-center" aria-hidden>
                  {i > 0 && <span className={cx("absolute top-0 h-[1.375rem] w-px", TIMELINE[i - 1].done ? "bg-ok" : "bg-line-strong")} />}
                  {!last && <span className={cx("absolute top-[1.375rem] bottom-0 w-px", m.done ? "bg-ok" : "bg-line-strong")} />}
                  <span
                    className={cx(
                      "relative z-[1] mt-4 flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-full border-2",
                      status === "done" && "border-ok bg-ok text-surface",
                      status === "next" && "border-brand bg-surface",
                      status === "planned" && "border-line-strong bg-surface",
                    )}
                  >
                    {status === "done" && <Check size={12} strokeWidth={3} />}
                    {status === "next" && <span className="h-2 w-2 rounded-full bg-brand" />}
                  </span>
                </div>
                <div className={cx("min-w-0 pt-4 pb-5", !last && "border-b border-line")}>
                  <div className="text-[12.5px] font-semibold text-ink-2 tabular-nums sm:hidden">{fmtDay(m.date)}</div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[14px] font-semibold text-ink">{m.title}</span>
                    {status === "done" && <Badge tone="ok">Completed</Badge>}
                    {status === "next" && <Badge tone="brand">Next</Badge>}
                  </div>
                  <p className="mt-1 max-w-[70ch] text-[13px] leading-snug text-pretty text-ink-2">{m.detail}</p>
                  {m.needs && (
                    <p className="mt-2 flex max-w-[70ch] items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] leading-snug text-ink">
                      <UserRoundCheck size={15} className="mt-px shrink-0 text-ink-2" aria-hidden />
                      <span>
                        <span className="font-semibold">Needed from you: </span>
                        {m.needs}
                      </span>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </PageSection>
  );
}
