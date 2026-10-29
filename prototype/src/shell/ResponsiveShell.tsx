// The frame of every live shell (the app's AppLiveShell and DataShell, the portal's PortalSupplierShell and AdminShell;
// Thomas, 30 Oct). On a big screen (>= 768 px) it renders exactly what each shell rendered before: the left pane
// (SidePane.tsx), then a column with the dev top bar, `beforeMain`, <main> and `afterMain`. On a phone (< 768 px,
// useLayoutMode.ts) the pane gives way to the phone chrome (PhoneChrome.tsx): the slim header (with the compact dev top
// bar inside it), the same column, and the bottom tab bar with its More sheet over the pane's own items, status and
// actions. <main> keeps its place in the tree, so a rotate or resize across 768 px re-renders the page in place
// (nothing in it is lost); only the chrome around it is rebuilt. A page sets its own phone title with usePhoneHeader.
import { useState, type ComponentProps, type ReactNode } from "react";
import { headerOffsetStyle } from "./DevTopBar";
import { PhoneHeader, PhoneHeaderContext, PhoneTabBar, phoneOffsetStyle, useKeyboardOpen, type PhoneHead, type PhoneHeaderOverride } from "./PhoneChrome";
import { SidePane } from "./SidePane";
import { useIsPhone } from "./useLayoutMode";

/** <main> on a phone: the 16 px gutter (or the notch's inset, when wider), a little less air above and below. */
export const PHONE_MAIN = "mx-auto w-full min-w-0 flex-1 py-4 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]";

export function ResponsiveShell({
  env,
  testId,
  hasTopBar,
  pane,
  topBar,
  beforeMain,
  afterMain,
  mainClassName,
  phone,
  children,
}: {
  /** The root's data-env. */
  env: string;
  /** The root's data-testid (the data console's "data-console"). */
  testId?: string;
  /** The dev top bar shows: the sticky panels' offset (headerOffsetStyle / phoneOffsetStyle). */
  hasTopBar: boolean;
  /** The left pane's props; on a phone its items, status and actions feed the tab bar and the More sheet. */
  pane: ComponentProps<typeof SidePane>;
  /** The dev top bar (null where there is none); on a phone it renders compact inside the header. */
  topBar?: ReactNode;
  beforeMain?: ReactNode;
  afterMain?: ReactNode;
  /** <main>'s classes on a big screen (each shell's own, unchanged); a phone uses PHONE_MAIN. */
  mainClassName: string;
  /** The phone header for the current path (phoneHeadOf); a page may replace it (usePhoneHeader). */
  phone: PhoneHead;
  children: ReactNode;
}) {
  const isPhone = useIsPhone();
  const keyboard = useKeyboardOpen(isPhone);
  const [own, setOwn] = useState<PhoneHeaderOverride | null>(null);
  const title = own?.title ?? phone.title;
  const back = own?.back === false ? undefined : (own?.back ?? phone.back);
  return (
    <PhoneHeaderContext.Provider value={setOwn}>
      <div className="flex min-h-full" data-env={env} data-testid={testId} data-layout={isPhone ? "phone" : undefined} data-keyboard={isPhone && keyboard ? "open" : undefined} style={isPhone ? phoneOffsetStyle(hasTopBar) : headerOffsetStyle(hasTopBar)}>
        {isPhone ? null : <SidePane {...pane} />}
        {/* on a phone the column ends above the fixed tab bar */}
        <div className={isPhone ? "flex min-w-0 flex-1 flex-col pb-[var(--app-tabbar-h)]" : "flex min-w-0 flex-1 flex-col"}>
          {isPhone ? <PhoneHeader title={title} back={back} topBar={topBar} status={pane.status} /> : topBar}
          {beforeMain}
          <main className={isPhone ? PHONE_MAIN : mainClassName}>{children}</main>
          {/* a phone: no footer between the page's sticky action bar and the tab bar */}
          {isPhone ? null : afterMain}
          {isPhone ? <PhoneTabBar items={pane.items} status={pane.status} actions={pane.actions} navLabel={pane.navLabel} /> : null}
        </div>
      </div>
    </PhoneHeaderContext.Provider>
  );
}
