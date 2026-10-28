// Shared bits of the admin console: loading hook, per-flow labels and key fields.
import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import type { FlowKey } from "../kf/portal";
import { errorText } from "../kf/sdk";

/** The portal processes the admin console shows. Thomas, 16 Oct: the flows no longer used (Sections, Completeness
 *  confirmations, Notices, Change requests; kept published, plan v5 §3.5) are hidden. */
export const PROCESS_KEYS: FlowKey[] = ["request", "query", "finalRelease"];

export const FLOW_LABEL: Record<FlowKey, string> = {
  request: "Requests",
  query: "Queries",
  finalRelease: "Final releases",
  section: "Sections (not used)",
  completeness: "Completeness confirmations (not used)",
  notice: "Notices (not used)",
  changeRequest: "Change requests (not used)",
  helpArticle: "Help articles",
};

/** The business key shown first in tables, per flow. */
export const KEY_FIELD: Record<FlowKey, string> = {
  request: "Request_Key",
  section: "Section_Item_Key",
  query: "Query_Key",
  completeness: "Confirmation_Key",
  finalRelease: "Confirmation_Key",
  notice: "Notice_Key",
  changeRequest: "CR_Key",
  helpArticle: "Article_Title",
};

export interface AsyncState<T> {
  loading: boolean;
  data?: T;
  error?: string;
  reload(): Promise<void>;
}

/** Loads on mount and when deps change. Only the latest request may set state (an older, slower answer is dropped),
 *  and data from different deps is cleared rather than shown under the new ones. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<{ loading: boolean; data?: T; error?: string }>({ loading: true });
  const seq = useRef(0);
  const run = useCallback(fn, deps);
  const lastRun = useRef(run);
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    const sameDeps = lastRun.current === run;
    lastRun.current = run;
    setState((s) => ({ loading: true, data: sameDeps ? s.data : undefined }));
    try {
      const data = await run();
      if (mine === seq.current) setState({ loading: false, data });
    } catch (e) {
      if (mine === seq.current) setState({ loading: false, error: errorText(e) });
    }
  }, [run]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { ...state, reload };
}

export const statusTone = (s: string): "ok" | "info" | "bad" | "neutral" => (s === "Completed" ? "ok" : s === "Rejected" || s === "Withdrawn" ? "bad" : s ? "info" : "neutral");
