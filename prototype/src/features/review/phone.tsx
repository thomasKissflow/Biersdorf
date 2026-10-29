// The review screens on a phone (Thomas, 30 Oct: below 768 px, src/shell/useLayoutMode.ts). The pieces here render
// their desktop form unchanged at 768 px and up:
//   FormWindow   a form's window: the Modal on a big screen; on a phone a full-height Sheet with the same title, body,
//                footer and test id, its fields and buttons 44 px tall (ask the supplier, edit or close a point, …);
//                one element tree in both, so a rotate keeps the fields and the one being typed in (Modal's Overlay)
//   tap          a small button's classes plus a 44 px height, on a phone only
//   jumpTo       scrolls the phone's single column to a card of the right rail (open points, notes, decision)
import type { ComponentProps } from "react";
import { Modal, cx } from "@/components/ui";

/** Controls in a phone's form window: 44 px tall (Segmented, Select, the date field and the buttons). */
const PHONE_FIELDS = "[&_button]:min-h-11 [&_input]:min-h-11";
/** Its footer: Cancel and the action share the row, each half of it. */
const PHONE_FOOTER = "[&>button]:min-h-11 [&>button]:flex-1";

export function FormWindow(props: ComponentProps<typeof Modal>) {
  return <Modal {...props} phoneSheet phoneBodyClassName={PHONE_FIELDS} phoneFooterClassName={PHONE_FOOTER} />;
}

/** `cls` on a big screen (unchanged); on a phone with a 44 px minimum height. */
export const tap = (phone: boolean, cls: string) => (phone ? cx(cls, "min-h-11") : cls);

/** Scrolls to the element with this test id (the phone's jump row: the cards below the section's answers), its top
 *  just below the sticky phone header. */
export function jumpTo(testId: string) {
  const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!el) return;
  const header = document.querySelector('[data-testid="phone-header"]')?.getBoundingClientRect().bottom ?? 0;
  window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - header - 12), behavior: "smooth" });
}
