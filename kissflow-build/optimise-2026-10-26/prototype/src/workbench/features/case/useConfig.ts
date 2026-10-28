// The pinned configuration of a case (or the one a new case would pin), read through the contract hook
// useFormRows(CIQ_Config_Version_A00) and resolved with domain/config's loadPinnedConfig. Read-only.
import { useEffect, useState } from "react";
import { loadPinnedConfig, type PinnedConfig } from "../../domain/config";
import { useFormRows } from "../../data/hooks";
import type { ConfigVM, ListQuality } from "../../data/viewModels";

export interface PinnedState {
  pinned: PinnedConfig | null;
  rows: ConfigVM[] | undefined;
  quality: ListQuality | undefined;
  loading: boolean;
  error: string | null;
  reload(): void;
}

/**
 * releaseItemId set → that release (the case's pin); null/undefined → the newest Published release of stage Live
 * (Test when `test`). `enabled: false` reads nothing.
 */
export function usePinnedConfig(releaseItemId: string | null | undefined, o: { test?: boolean; enabled?: boolean } = {}): PinnedState {
  const rows = useFormRows<ConfigVM>(o.enabled === false ? null : "CIQ_Config_Version_A00");
  const [state, setState] = useState<{ pinned: PinnedConfig | null; resolving: boolean; error: string | null; key: string }>({ pinned: null, resolving: false, error: null, key: "" });
  const key = `${releaseItemId ?? ""}|${o.test ? "T" : "L"}`;
  useEffect(() => {
    if (!rows.data) return;
    let alive = true;
    setState((s) => ({ ...s, resolving: true }));
    loadPinnedConfig(rows.data, releaseItemId || undefined, { test: o.test })
      .then((p) => alive && setState({ pinned: p, resolving: false, error: null, key }))
      .catch((e) => alive && setState({ pinned: null, resolving: false, error: e instanceof Error ? e.message : String(e), key }));
    return () => {
      alive = false;
    };
  }, [rows.data, releaseItemId, o.test, key]);
  const stale = state.key !== key;
  return {
    pinned: stale ? null : state.pinned,
    rows: rows.data,
    quality: rows.quality,
    loading: rows.loading || state.resolving || (!!rows.data && stale),
    error: rows.error ?? state.error,
    reload: rows.reload,
  };
}
