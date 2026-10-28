/**
 * useFlow — one place that knows how to reach a Kissflow flow.
 *
 * Extracted because four components need the same thing and the logic is genuinely hard to get
 * right: ModelChart, DataTable, the SDK-bound Timeline and the SDK-bound KanbanBoard. It was
 * duplicated in the first two, which is how the Process bug in the original Chart.jsx survived
 * so long — the fix lived in one copy.
 *
 * THE PROCESS PROBLEM, which is the whole reason this file exists. The three surfaces disagree
 * about how to list a Process's records:
 *   offline mock    getProcess(id).getItems  does not exist and THROWS (mock-kf.ts:225, on purpose)
 *   live dev proxy  getProcess(id).getItems  works, lists via /myitems (live-kf.ts:76)
 *   real SDK        documented as getAdminItems / getParticipatedItems / getMyItems, and
 *                   agents/kissflow-sdk.md:69 says those return { items, total }, not
 *                   { Data, Columns }
 * So a Process is a try-in-order across four method names with two response shapes normalised.
 * Calling getItems() unconditionally — which the original Chart.jsx did — renders in live dev
 * and dies everywhere else.
 *
 * KEEP GOING PAST AN EMPTY SUCCESS. getAdminItems under a non-admin key, and getMyItems for a
 * user who has raised nothing, both answer `{ items: [] }` rather than throwing. Stopping at the
 * first call that merely doesn't throw renders an empty screen while a later API still had the
 * rows.
 */

import { useEffect, useState } from "react";
import { useKf, useKfDev } from "@kissflow/app-ui";

/** Normalise the two response shapes the surfaces return. */
const normalise = (r) => ({ Data: r?.Data ?? r?.items ?? [], Columns: r?.Columns ?? [] });

/** A handle for any flow type. Exported because the write paths (create/update) need it too. */
export function flowHandle(kf, flowType, flowId) {
  if (flowType === "Case") return kf.app.getBoard(flowId);
  if (flowType === "Process") return kf.app.getProcess(flowId);
  return kf.app.getDataform(flowId);
}

/** Read a flow's records, whichever surface we are running against. */
export async function fetchRows(kf, flowType, flowId) {
  const handle = flowHandle(kf, flowType, flowId);
  if (flowType !== "Process") return normalise(await handle.getItems());

  // getAdminItems is the closest analogue to a dataform's getItems (every record), but it needs
  // admin scope — so this is a try-in-order, not a capability check.
  const attempts = ["getAdminItems", "getParticipatedItems", "getMyItems", "getItems"];
  let lastError, empty = null;
  for (const name of attempts) {
    if (typeof handle?.[name] !== "function") continue;
    try {
      // getMyItems defaults to drafts only; "all" is the documented widest scope.
      const result = normalise(await handle[name](name === "getMyItems" ? { status: "all" } : {}));
      if (result.Data.length) return result;
      empty = empty ?? result;
    } catch (e) {
      lastError = e;
    }
  }
  if (empty) return empty;
  throw lastError ?? new Error(`No listing API on process ${flowId}`);
}

/**
 * The hook every SDK-bound kit component uses.
 *
 * Returns { rows, columns, loading, error, blocked, reload }. `blocked` is the dev role-switcher
 * saying this role cannot see the flow — a distinct state from "no rows", because they want
 * different copy: one is a permission boundary, the other an invitation to create something.
 */
export function useFlow(flowType = "Form", flowId, deps = []) {
  const kf = useKf();
  const { active, canAccess } = useKfDev();
  const blocked = active && !canAccess(flowId);

  const [state, setState] = useState({ rows: [], columns: [], loading: true, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (blocked) { setState((s) => ({ ...s, loading: false })); return; }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      try {
        const { Data, Columns } = await fetchRows(kf, flowType, flowId);
        if (alive) setState({ rows: Data ?? [], columns: Columns ?? [], loading: false, error: null });
      } catch (e) {
        if (alive) setState({ rows: [], columns: [], loading: false, error: String(e?.message ?? e) });
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kf, flowType, flowId, blocked, nonce, ...deps]);

  return { ...state, blocked, reload: () => setNonce((n) => n + 1) };
}

/** Cell values arrive as objects on reference and user fields ({Name} / {value} / {_id}).
 *  Rendering the raw object prints [object Object], which is the most common way a generated
 *  page looks broken while the data is fine. */
export const cellText = (v) =>
  v && typeof v === "object" ? (v.Name ?? v.value ?? v._id ?? "—") : (v ?? "—");

/** Pick a column to group or label by. Mirrors the original Chart.jsx's heuristic, plus a
 *  row-key fallback for the { items, total } shape, which carries no Columns to choose from. */
export function pickKey(preferred, columns, firstRow) {
  if (preferred) return preferred;
  const cols = columns || [];
  const typed = cols.find((c) => !c.IsInternal && /select|status|text/i.test(c.Type));
  if (typed) return typed.Id;
  if (cols[0]) return cols[0].Id;
  return Object.keys(firstRow || {}).find((k) => !k.startsWith("_"));
}
