// The note RMM sees instead of the supplier-master controls: suppliers and contacts are maintained by the Business
// administrator only (Thomas, 14 Oct).
import { Lock } from "lucide-react";
import { cx } from "@/components/ui";

export function MaintainedByAdmin({ testId, className }: { testId: string; className?: string }) {
  return (
    <p className={cx("inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-ink-2", className)} data-testid={testId}>
      <Lock size={13} className="shrink-0 text-ink-3" aria-hidden />
      Maintained by the business administrator.
    </p>
  );
}
