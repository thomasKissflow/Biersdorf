import { Badge } from "@/components/ui";
import type { Verdict } from "./shared";

/** Status of an assumption in this workshop session: always text plus colour. */
export function VerdictBadge({ verdict }: { verdict?: Verdict }) {
  if (verdict === "correct") return <Badge tone="ok" dot>Confirmed</Badge>;
  if (verdict === "change") return <Badge tone="warn" dot>Needs change</Badge>;
  return <Badge tone="neutral">To confirm</Badge>;
}
