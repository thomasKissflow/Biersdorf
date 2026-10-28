// The "manual record" label (WB-10): supplier hand-offs are not connected; RMM (or the task holder) records supplier
// steps by hand. The UI never says "sent to supplier", "PDF generated" or "supplier e-mailed".
import { Hand } from "lucide-react";
import type { ReactNode } from "react";
import { MANUAL_HANDOFF_NOTE } from "../domain/labels";

export function ManualRecordNote({ children }: { children?: ReactNode }) {
  return (
    <div data-testid="wb-manual-note" className="flex gap-2.5 rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-2">
      <Hand size={15} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        <strong className="font-medium text-ink">Manual record.</strong> {children ?? MANUAL_HANDOFF_NOTE}
      </span>
    </div>
  );
}
