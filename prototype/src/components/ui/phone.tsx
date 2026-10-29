// The phone layout's shared pieces (Thomas, 30 Oct: the live app and the supplier portal get a phone view below 768 px;
// src/shell/useLayoutMode.ts decides). Everything here renders only on a phone, or renders its desktop form unchanged,
// so a screen can use it without changing what a desktop or tablet shows:
//   PhoneOnly / HideOnPhone      a part only phones see, or one they don't (e.g. an edit button)
//   CardList / CardListItem      a table's rows as stacked cards (a 44 px tap target each when it opens something)
//   ResponsiveTable              a Table on a big screen, the same rows as a CardList on a phone
//   StickyActionBar              the page's primary actions, sticky just above the bottom tab bar (phones only)
//   LargerScreenNote             "Use a larger screen to edit": the configuration editor and the data consoles
// The Sheet (components/ui/overlay.tsx) is the full-height or bottom sheet Drawer and wide modals become on a phone.
import { ChevronRight, MonitorSmartphone } from "lucide-react";
import type { ReactNode } from "react";
import { useIsPhone } from "@/shell/useLayoutMode";
import { Table, Td, Tr } from "./data";
import { cx } from "./primitives";

/** Its children on a phone only. */
export function PhoneOnly({ children }: { children: ReactNode }) {
  return useIsPhone() ? <>{children}</> : null;
}

/** Its children everywhere but on a phone (a fragment: the desktop markup stays as it is). */
export function HideOnPhone({ children }: { children: ReactNode }) {
  return useIsPhone() ? null : <>{children}</>;
}

/** Rows as stacked cards (a list, for screen readers). Test hook: `data-testid` on the list. */
export function CardList({ children, label, className, "data-testid": testId }: { children: ReactNode; label?: string; className?: string; "data-testid"?: string }) {
  return (
    <ul aria-label={label} data-testid={testId} className={cx("space-y-2", className)}>
      {children}
    </ul>
  );
}

export interface CardField {
  label: ReactNode;
  value: ReactNode;
  /** Takes the card's whole row (an e-mail address). */
  wide?: boolean;
}

/**
 * One row as a card: its title (and a badge beside it), a line of meta text, label / value pairs in two columns, then
 * anything else. With `onClick` the whole card is one button (at least 44 px, a chevron at its end); `aside` holds
 * controls of its own (they must not sit inside that button), right of the title. Test hook: `data-testid` on the
 * <li>, so a row keeps the test id its table row had.
 */
export function CardListItem({
  title,
  badge,
  meta,
  fields,
  children,
  onClick,
  aside,
  selected,
  label,
  "data-testid": testId,
}: {
  title: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  fields?: CardField[];
  children?: ReactNode;
  onClick?: () => void;
  aside?: ReactNode;
  selected?: boolean;
  /** The button's accessible name when the title alone does not say what it opens. */
  label?: string;
  "data-testid"?: string;
}) {
  const content = (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 text-[14px] font-semibold break-words text-ink">{title}</span>
        {badge}
      </div>
      {meta && <div className="mt-0.5 text-[12.5px] text-ink-3">{meta}</div>}
      {!!fields?.length && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
          {fields.map((f, i) => (
            <div key={i} className={cx("min-w-0", f.wide && "col-span-2")}>
              <dt className="text-[11.5px] text-ink-3">{f.label}</dt>
              <dd className="mt-0.5 text-[13px] break-words text-ink">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children && <div className="mt-2 text-[13px] text-ink-2">{children}</div>}
    </>
  );
  return (
    <li data-testid={testId} className={cx("flex items-start gap-2 rounded-card border bg-surface shadow-card", selected ? "border-brand ring-1 ring-brand" : "border-line")}>
      {onClick ? (
        <button type="button" onClick={onClick} aria-label={label} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-card px-4 py-3 text-left transition-colors hover:bg-surface-2">
          <span className="min-w-0 flex-1">{content}</span>
          {!aside && <ChevronRight size={16} className="shrink-0 text-ink-3" aria-hidden />}
        </button>
      ) : (
        <div className="min-w-0 flex-1 px-4 py-3">{content}</div>
      )}
      {aside && <div className="flex shrink-0 items-center gap-1 py-2 pr-2">{aside}</div>}
    </li>
  );
}

export interface ResponsiveColumn<T> {
  /** The column's header (a big screen) and the field's label (a phone card). */
  header: ReactNode;
  cell(row: T): ReactNode;
  /** The card's title on a phone (the first such column; else the first column). */
  primary?: boolean;
  /** Left out of the phone card (e.g. a column the card's title or badge already shows). */
  phoneHidden?: boolean;
  /** Shown beside the card's title on a phone instead of as a field (a status badge). */
  badge?: boolean;
  /** The cell's class on a big screen. */
  className?: string;
}

/**
 * The same rows as a Table (Tr / Td, as written by hand today) at >= 768 px and as a CardList on a phone, with the same
 * row test ids (`rowTestId`) and the same click. `phoneCard` replaces the generated card for a row.
 */
export function ResponsiveTable<T>({
  rows,
  columns,
  rowKey,
  rowTestId,
  onRowClick,
  phoneCard,
  dense,
  tightHead,
  label,
  empty,
  "data-testid": testId,
}: {
  rows: T[];
  columns: ResponsiveColumn<T>[];
  rowKey(row: T): string;
  rowTestId?(row: T): string;
  onRowClick?(row: T): void;
  phoneCard?(row: T): ReactNode;
  dense?: boolean;
  tightHead?: boolean;
  /** The card list's accessible name on a phone. */
  label?: string;
  /** Shown instead of the rows when there are none. */
  empty?: ReactNode;
  "data-testid"?: string;
}) {
  const phone = useIsPhone();
  if (!rows.length && empty) return <>{empty}</>;
  if (!phone)
    return (
      <div data-testid={testId}>
        <Table head={columns.map((c) => c.header)} dense={dense} tightHead={tightHead}>
          {rows.map((r) => (
            <Tr key={rowKey(r)} data-testid={rowTestId?.(r)} onClick={onRowClick && (() => onRowClick(r))}>
              {columns.map((c, i) => (
                <Td key={i} className={c.className}>
                  {c.cell(r)}
                </Td>
              ))}
            </Tr>
          ))}
        </Table>
      </div>
    );
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const badges = columns.filter((c) => c.badge && c !== primary);
  const fields = columns.filter((c) => c !== primary && !c.badge && !c.phoneHidden);
  return (
    <CardList data-testid={testId} label={label}>
      {rows.map((r) =>
        phoneCard ? (
          <li key={rowKey(r)} data-testid={rowTestId?.(r)}>
            {phoneCard(r)}
          </li>
        ) : (
          <CardListItem
            key={rowKey(r)}
            data-testid={rowTestId?.(r)}
            title={primary?.cell(r)}
            badge={badges.length ? <>{badges.map((c, i) => <span key={i}>{c.cell(r)}</span>)}</> : undefined}
            fields={fields.map((c) => ({ label: c.header, value: c.cell(r) }))}
            onClick={onRowClick && (() => onRowClick(r))}
          />
        ),
      )}
    </CardList>
  );
}

/**
 * A page's primary actions on a phone, sticky just above the bottom tab bar (the shell's `--app-tabbar-h`), edge to
 * edge across the 16 px gutter; at the page's end it rests flush on the tab bar (as the last element it takes back the
 * page's bottom padding). Renders nothing at >= 768 px: the page keeps its own action row there. Put it as a direct
 * child of the page's outermost element, so it sticks while any of the page is in view. On a short screen (a phone
 * held sideways, <= 560 px tall, as the portal's section bar) it is not sticky but ends the page: the header, the tab
 * bar and a sticky bar would leave next to nothing to read, and a sticky bar can sit under the tab bar there. While the
 * on-screen keyboard is open it scrolls away too (styles.css).
 * Test hooks: `data-testid` (default "sticky-actions"); `data-sticky-actions` (the toasts keep clear of it).
 */
export function StickyActionBar({ children, className, "data-testid": testId = "sticky-actions" }: { children: ReactNode; className?: string; "data-testid"?: string }) {
  if (!useIsPhone()) return null;
  return (
    <div
      data-testid={testId}
      data-sticky-actions=""
      className={cx(
        "sticky bottom-[var(--app-tabbar-h,0px)] z-20 -mx-4 mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur last:-mb-4 [&_button]:min-h-11 [@media(max-height:560px)]:static",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** An e-mail address that a narrow column breaks only after the @ or before a dot ("elena.marquez@" / "solvaro.example"),
 *  never in the middle of a word. */
export function BreakableEmail({ email }: { email: string }) {
  // no look-behind in the pattern: older iOS WebViews cannot parse one
  const parts = email.replace(/@/g, "@\u0000").replace(/\./g, "\u0000.").split("\u0000");
  return (
    <span className="break-normal">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <wbr />}
          {p}
        </span>
      ))}
    </span>
  );
}

/** Thomas, 30 Oct: the configuration editor and the data consoles are not edited on a phone; viewing still works.
 *  Renders nothing at >= 768 px. Test hook: `data-testid` (default "larger-screen-note"). */
export function LargerScreenNote({ children, "data-testid": testId = "larger-screen-note" }: { children?: ReactNode; "data-testid"?: string }) {
  if (!useIsPhone()) return null;
  return (
    <div role="note" data-testid={testId} className="mb-4 flex items-start gap-3 rounded-lg border border-info/30 bg-info-soft px-4 py-3 text-[13px] text-ink">
      <MonitorSmartphone size={16} className="mt-0.5 shrink-0 text-info" aria-hidden />
      <span className="min-w-0">
        <span className="font-semibold">Use a larger screen to edit.</span> {children ?? "On a phone you can look at everything here, but not change it."}
      </span>
    </div>
  );
}
