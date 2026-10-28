// "In the MVP vs later" and "What we still need from you".

import { Check, CircleDashed, FileQuestion } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui";
import { IN_MVP, LATER, NEEDS } from "./content";
import { NoBreakIds, PageSection } from "./shared";
import { callText, useCallMode } from "./callMode";

const TAG_TONE = { Integration: "info", Scope: "neutral", "Your decision": "warn" } as const;

export function MvpScope() {
  const call = useCallMode();
  const t = (s: string) => (call ? callText(s) : s);
  return (
    <PageSection id="scope" title="In the MVP, and what comes later" hint={call ? "What the MVP covers, and what we left out on purpose or need your decision on." : "What this prototype shows as MVP scope, and what we left out on purpose or need your decision on."}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="In the MVP" subtitle={call ? "In scope" : "Shown in this prototype"} action={<Badge tone="ok">{IN_MVP.length} items</Badge>} />
          <ul className="divide-y divide-line">
            {IN_MVP.map((i) => (
              <li key={i.title} className="flex gap-3 px-4 py-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok">
                  <Check size={12} strokeWidth={3} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-ink">{t(i.title)}</div>
                  <div className="mt-0.5 text-[12.5px] leading-snug text-pretty text-ink-2">
                    <NoBreakIds text={t(i.detail)} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Later, or for you to decide" subtitle={call ? "Not in the MVP" : "Not in this prototype"} action={<Badge tone="neutral">{LATER.length} items</Badge>} />
          <ul className="divide-y divide-line">
            {LATER.map((i) => (
              <li key={i.title} className="flex gap-3 px-4 py-3">
                <CircleDashed size={18} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium text-ink">{i.title}</span>
                    <Badge tone={TAG_TONE[i.tag]}>{i.tag}</Badge>
                  </div>
                  <div className="mt-0.5 text-[12.5px] leading-snug text-pretty text-ink-2">
                    <NoBreakIds text={t(i.detail)} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </PageSection>
  );
}

export function Needs() {
  const call = useCallMode();
  return (
    <PageSection id="needs" title="What we still need from you" hint="These would let us replace our assumptions and illustrative values with yours.">
      <Card>
        <ol className="grid sm:grid-cols-2">
          {NEEDS.map((n, i) => (
            <li key={n.title} className="flex gap-3 border-line px-5 py-4 max-sm:border-b max-sm:last:border-b-0 sm:border-b sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0">
              <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-[11.5px] font-semibold text-ink-2 tabular-nums">{i + 1}</span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold text-ink">{n.title}</div>
                <div className="mt-0.5 text-[12.5px] leading-snug text-pretty text-ink-2">{call ? callText(n.why) : n.why}</div>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-2 border-t border-line bg-surface-2 px-5 py-3 text-[12.5px] text-ink-2">
          <FileQuestion size={15} className="shrink-0 text-ink-3" aria-hidden />
          Anything you can share before the next session helps. Anonymised or partial versions are fine.
        </div>
      </Card>
    </PageSection>
  );
}
