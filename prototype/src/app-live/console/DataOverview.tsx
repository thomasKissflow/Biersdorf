// Data console overview: every process (items, how many still open) and every form (rows) of CIQ Digital; a card opens
// its table. 26 Oct, after Thomas's 429s: each flow's list is read ONCE a console session (session.ts), not on every
// visit; the flow pages use the same lists, a delete there changes the count here without a read, and Refresh reads
// every list again (the console client's 2 at a time). A flow this role may not read says so on its card.
import { Database, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { itemState } from "@/portal/data/raw";
import { useIsPhone } from "@/shell/useLayoutMode";
import type { FlowKey } from "../types";
import { CONSOLE_FLOWS, CONSOLE_FORMS, CONSOLE_PROCESSES, FLOW_LABEL, FLOW_NAME, flowPath, isProcess } from "./common";
import { useDataConsole } from "./ConsoleContext";
import { readAtText, useFlowList, useSessionVersion } from "./session";

function FlowCard({ flow }: { flow: FlowKey }) {
  const { session } = useDataConsole();
  const navigate = useNavigate();
  const q = useFlowList(session, flow);
  const total = q.rows?.length ?? 0;
  const open = q.rows?.filter((r) => itemState(r) === "open").length ?? 0;
  const failed = q.error && !q.rows;
  const hint = failed ? `Could not load: ${q.error}` : !q.rows ? "Loading" : isProcess(flow) ? `${open} open · ${total - open} done or closed` : `${FLOW_NAME[flow]} · ${total === 1 ? "1 row" : `${total} rows`}`;
  return (
    <StatCard
      label={FLOW_LABEL[flow]}
      value={!q.rows ? (failed ? "—" : "…") : total}
      hint={hint}
      tone={failed ? "bad" : "neutral"}
      icon={<Database size={16} />}
      onClick={() => navigate(flowPath(flow))}
      data-testid={`data-card-${flow}`}
    />
  );
}

export function DataOverview() {
  const { session } = useDataConsole();
  useSessionVersion(session);
  const states = CONSOLE_FLOWS.map((f) => session.list(f));
  const busy = states.some((s) => s.loading);
  // the oldest read: what Refresh would bring up to date
  const oldest = states.map((s) => s.readAt).filter((x): x is string => !!x).sort()[0];
  // a phone: viewing only (LargerScreenNote above), so the subtitle offers no change or delete
  const phone = useIsPhone();
  return (
    <div className="space-y-6" data-testid="data-overview">
      <PageHeader
        eyebrow="CIQ Digital"
        title="Data console"
        subtitle={phone ? "Every process and form of the app, read with your Kissflow rights once this session. Open one to search its items and look at every field." : "Every process and form of the app, read with your Kissflow rights once this session. Open one to search its items, look at every field and change or delete them."}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-ink-3" data-testid="data-overview-read-at">
              {busy ? "Reading…" : oldest ? readAtText({ loading: false, readAt: oldest }) : ""}
            </span>
            <Button variant="ghost" icon={<RefreshCw size={15} />} disabled={busy} onClick={() => void Promise.all(CONSOLE_FLOWS.map((f) => session.refresh(f)))} data-testid="data-overview-refresh" className={phone ? "h-11" : undefined}>
              Refresh
            </Button>
          </div>
        }
      />
      <SectionTitle>Processes</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CONSOLE_PROCESSES.map((f) => (
          <FlowCard key={f} flow={f} />
        ))}
      </div>
      <SectionTitle>Forms</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CONSOLE_FORMS.map((f) => (
          <FlowCard key={f} flow={f} />
        ))}
      </div>
    </div>
  );
}
