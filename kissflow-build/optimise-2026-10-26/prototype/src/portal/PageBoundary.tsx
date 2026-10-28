// Keeps an unexpected error on one page (e.g. a portal item the screens don't expect) from blanking the whole
// portal: the page shows what went wrong and the rest keeps working. Reset on navigation (keyed by the route).
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Card, EmptyState } from "@/components/ui";

export class PageBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Portal page failed:", error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Card>
        <EmptyState title="This page could not be shown">
          Something in this request is not in the shape the portal expects ({this.state.error.message}). Your other requests are not affected. Reload the page, or tell your Beiersdorf contact if it stays.
        </EmptyState>
      </Card>
    );
  }
}
