import { Cpu } from "lucide-react";
import { Avatar, Badge } from "@/components/ui";
import { supplierName, userById } from "@/domain/selectors";
import type { AppState } from "@/domain/types";
import type { EventSide } from "./auditData";

export function SideBadge({ side }: { side: EventSide }) {
  if (side === "system") return <Badge tone="neutral">System</Badge>;
  return side === "supplier" ? <Badge tone="violet">Supplier</Badge> : <Badge tone="brand">Beiersdorf</Badge>;
}

/** Person cell for the audit log: avatar, name, side badge and (for suppliers) the company. */
export function Who({ state, by }: { state: AppState; by: string }) {
  if (by === "system") {
    return (
      <span className="flex items-start gap-2">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-ink-3">
          <Cpu size={14} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-ink">System</span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <SideBadge side="system" />
            <span className="text-xs text-ink-3">automatic step</span>
          </span>
        </span>
      </span>
    );
  }
  const u = userById(state, by);
  if (!u) return <span className="text-ink-2">{by}</span>;
  const org = u.side === "supplier" ? supplierName(state, u.supplierId ?? "") : u.title;
  return (
    <span className="flex items-start gap-2" title={`${u.name} · ${org} · ${u.email}`}>
      <Avatar initials={u.initials} side={u.side} />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium whitespace-nowrap text-ink">{u.name}</span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <SideBadge side={u.side} />
          <span className="max-w-[190px] truncate text-xs text-ink-3">{org}</span>
        </span>
      </span>
    </span>
  );
}
