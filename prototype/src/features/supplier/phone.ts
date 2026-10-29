// The supplier screens on a phone (Thomas, 30 Oct; < 768 px, src/shell/useLayoutMode.ts). Each phone touch is added
// only where useIsPhone() says so, so the markup at 768 px and up stays exactly as it was. The portal's own CSS
// (src/portal/portal.css) makes every form field 16 px and 44 px tall on a phone, and the Yes/No and chip toggles 44 px.
import { cx } from "@/components/ui";

export { useIsPhone } from "@/shell/useLayoutMode";

/** The classes that make a control a 44 px tap target on a phone (plus `more`); nothing on a big screen, so a
 *  `className={tap(phone)}` or `cx(own, tap(phone))` leaves the desktop markup unchanged. */
export const tap = (phone: boolean, ...more: (string | false | undefined)[]) => (phone ? cx("min-h-11", ...more) : undefined);
