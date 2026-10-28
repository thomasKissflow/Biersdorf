// Keeps an unexpected error on one page (e.g. a live item in a shape the screens don't expect) from blanking the whole
// app: the page shows what went wrong and the rest keeps working. Reset on navigation (keyed by the route).
// A copy of src/portal/PageBoundary.tsx with internal wording (DESIGN §2, owner E). The Development sandbox shows the
// error and the way to Diagnostics (the person menu of its top bar); production has neither, so it says what to do
// (FE-CLEANUP A3, C6). The error is logged here once (main.tsx passes React no second logger).
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Card, EmptyState } from "@/components/ui";
import type { AppEnv } from "./env";
import { PAGE_FAILED, trimEnd } from "./userText";

export class PageBoundary extends Component<{ children: ReactNode; env?: AppEnv }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CIQ Digital page failed:", error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Card data-testid="page-error">
        <EmptyState title="This page could not be shown">
          {this.props.env === "prod"
            ? PAGE_FAILED
            : `Something on this page is not in the shape CIQ Digital expects (${trimEnd(this.state.error.message)}). Other pages and cases are not affected. Reload, and open Diagnostics from the person menu if it stays.`}
        </EmptyState>
      </Card>
    );
  }
}
