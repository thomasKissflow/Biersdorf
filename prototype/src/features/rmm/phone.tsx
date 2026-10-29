// Phone pieces of the RMM screens, the Cases register, the case page, the suppliers, reports and the audit trail
// (Thomas, 30 Oct: below 768 px the live app is the phone layout; src/shell/useLayoutMode.ts decides). Each one only
// changes what a phone shows: at 768 px and up it renders nothing, or the screen keeps its own desktop markup.
//   PHONE_FIELDS      a container class: its text fields and dropdowns become 44 px tap targets
//   PHONE_CHIP        a filter chip's size on a phone (44 px tall)
//   PHONE_TAPS        a container class: every button inside is at least 44 px tall (a Segmented control)
//   PhoneFilters      "Filters" (with the number set) opening the screen's filters in a bottom sheet
//   usePhoneTabs      a tab row that runs edge to edge, 44 px tabs, the current tab scrolled into view
//   PhoneFacts        label / value pairs in two columns (KeyValue stacks them in one on a phone)
//   ComponentCards    the K2.1 composition as one card per component (the questionnaire tab, the final document)
import { SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, CardList, CardListItem, Mono, Sheet, cx } from "@/components/ui";
import { ORIGIN_LABEL } from "@/domain/catalog";
import { additiveText, concText } from "@/domain/composition";
import type { ComponentRow } from "@/domain/types";

/** On a phone, the text fields and dropdowns inside get 44 px tall (checkboxes, radios and files keep their size). */
export const PHONE_FIELDS = "[&_input:not([type=checkbox]):not([type=radio]):not([type=file])]:h-11 [&_[role=combobox]]:h-11";

/** A filter chip on a phone: a 44 px target. */
export const PHONE_CHIP = "min-h-11 px-3.5";

/** On a phone, every button inside (a Segmented control's options, a row of small buttons) is at least 44 px tall. */
export const PHONE_TAPS = "[&_button]:min-h-11";

/**
 * A phone's filters: a "Filters" button (the number of filters set beside it) that opens them in a bottom sheet. The
 * filters apply as they change; the sheet's footer clears them (when any is set) and closes with the number of results.
 * Test hooks: `data-testid` on the sheet, `<data-testid>-open` on the button, `clearTestId` on Clear, `<data-testid>-done`
 * on the close button.
 */
export function PhoneFilters({ active, onClear, results, clearTestId, children, "data-testid": testId }: { active: number; onClear?: () => void; results: string; clearTestId?: string; children: ReactNode; "data-testid": string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" icon={<SlidersHorizontal size={16} aria-hidden />} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className="h-11 shrink-0" data-testid={`${testId}-open`}>
        Filters
        {active > 0 && (
          <span className="rounded-full bg-brand px-1.5 text-[11px] leading-4 font-semibold text-brand-ink" aria-label={`${active} set`}>
            {active}
          </span>
        )}
      </Button>
      <Sheet
        variant="bottom"
        open={open}
        onClose={() => setOpen(false)}
        title="Filters"
        data-testid={testId}
        footer={
          <>
            {onClear && active > 0 && (
              <Button variant="ghost" onClick={onClear} className="h-11" data-testid={clearTestId}>
                Clear all
              </Button>
            )}
            <Button variant="primary" onClick={() => setOpen(false)} className="h-11" data-testid={`${testId}-done`}>
              {results}
            </Button>
          </>
        }
      >
        <div className={cx("space-y-4", PHONE_FIELDS)}>{children}</div>
      </Sheet>
    </>
  );
}

/**
 * A tab row on a phone: it runs edge to edge across the page's 16 px gutter and scrolls sideways, each tab a 44 px
 * target, and the current tab is scrolled into view (a deep link to the last tab, a tap on one half cut off). Wrap the
 * Tabs in a <div ref={ref}> and pass `className` to them; both are inert on a big screen.
 */
export function usePhoneTabs(phone: boolean, value: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!phone) return;
    const list = ref.current?.querySelector<HTMLElement>('[role="tablist"]');
    const tab = list?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!list || !tab) return;
    // only the row scrolls, never the page
    const l = list.getBoundingClientRect();
    const r = tab.getBoundingClientRect();
    if (r.left < l.left) list.scrollLeft -= l.left - r.left + 16;
    else if (r.right > l.right) list.scrollLeft += r.right - l.right + 16;
  }, [phone, value]);
  return { ref, className: phone ? "-mx-4 px-4 [&>[role=tab]]:min-h-11" : undefined };
}

/** Label / value pairs in two columns on a phone (a long value takes the whole row with `wide`). */
export function PhoneFacts({ items, "data-testid": testId }: { items: { k: ReactNode; v: ReactNode; wide?: boolean }[]; "data-testid"?: string }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3" data-testid={testId}>
      {items.map((it, i) => (
        <div key={i} className={cx("min-w-0", it.wide && "col-span-2")}>
          <dt className="text-xs text-ink-3">{it.k}</dt>
          <dd className="mt-0.5 text-[13.5px] break-words text-ink">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The K2.1 composition on a phone: one card per component with the table's eight columns. */
export function ComponentCards({ rows }: { rows: ComponentRow[] }) {
  return (
    <CardList label="Components">
      {rows.map((r, i) => (
        <CardListItem
          key={r.id}
          title={r.inci}
          meta={`Component ${i + 1}`}
          fields={[
            { label: "CAS", value: <Mono>{r.cas ?? "—"}</Mono> },
            { label: "EC / REACH no.", value: <Mono>{r.ec ?? "—"}</Mono> },
            { label: "Function", value: r.fn },
            { label: "Origin", value: ORIGIN_LABEL[r.origin].split(" (")[0] },
            { label: "Additive", value: additiveText(r.additive) },
            { label: "Concentration", value: concText(r) },
          ]}
        />
      ))}
    </CardList>
  );
}
