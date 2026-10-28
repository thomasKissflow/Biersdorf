// Admin overview: every portal process with its item count and how many are still open.
import { Workflow } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader, StatCard } from "@/components/ui";
import { itemState } from "../data/raw";
import { usePortalMode } from "../mode";
import { FLOW_LABEL, PROCESS_KEYS, useAsync } from "./common";

function FlowCard({ flow }: { flow: (typeof PROCESS_KEYS)[number] }) {
  const { client } = usePortalMode();
  const navigate = useNavigate();
  const q = useAsync(() => client!.listAll(flow), [client, flow]);
  const total = q.data?.length ?? 0;
  const open = q.data?.filter((r) => itemState(r) === "open").length ?? 0;
  return (
    <StatCard
      label={FLOW_LABEL[flow]}
      value={q.loading ? "…" : q.error ? "—" : total}
      hint={q.error ? `Could not load: ${q.error}` : q.loading ? "Loading" : `${open} open · ${total - open} done or closed`}
      tone={q.error ? "bad" : "neutral"}
      icon={<Workflow size={16} />}
      onClick={() => navigate(`/admin/flow/${flow}`)}
    />
  );
}

export function AdminOverview() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="CIQ Supplier Portal" title="Overview" subtitle="Every portal process. Items are created by Beiersdorf's app and completed by supplier contacts." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PROCESS_KEYS.map((f) => (
          <FlowCard key={f} flow={f} />
        ))}
      </div>
    </div>
  );
}
