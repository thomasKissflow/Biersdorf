// Explains a degraded read (§6.2) in the reader's terms (UX-04, UX-10): which items the list shows and why, never
// the read-rung name. "Only your items" is the normal view for most roles, so it is an info note, not a warning; the
// counts sentence appears only where counts are computed (`counts`). A list that could not be read is a warning.
import { AlertTriangle, Info } from "lucide-react";
import type { ListQuality } from "../data/viewModels";

export function ReadQualityBanner({
  quality,
  indexOnly = 0,
  warnings = [],
  what,
  scope = "items",
  counts = false,
}: {
  quality: ListQuality | undefined;
  indexOnly?: number;
  warnings?: string[];
  what?: string;
  /** What the list holds, in plain words ("cases", "open points", …). */
  scope?: string;
  /** True where counts are computed from this list (open-items checks): says that a count stays partial. */
  counts?: boolean;
}) {
  const degraded = !!quality && quality !== "admin" && quality !== "form";
  if (!degraded && !indexOnly && !warnings.length) return null;
  const failed = quality === "failed";
  const text =
    quality === "failed"
      ? "This list could not be read. Try again in a moment."
      : quality === "viewer"
        ? `You see the ${scope} shared with you.`
        : quality === "mine+tasks" && !indexOnly
          ? `You see the ${scope} you created or have a task on.`
          : "";
  const tone = failed || warnings.length ? "border-warn/40 bg-warn-soft" : "border-info/40 bg-info-soft";
  return (
    <div role="status" data-testid="wb-readquality" className={`flex gap-3 rounded-lg border px-4 py-3 text-[13px] text-ink ${tone}`}>
      {failed ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden /> : <Info size={16} className="mt-0.5 shrink-0 text-info" aria-hidden />}
      <div className="space-y-1">
        {degraded && text && (
          <p>
            {what ? <strong>{what}: </strong> : null}
            {text}
            {counts && !failed ? " Counts based on this list cannot be confirmed with your access." : ""}
          </p>
        )}
        {indexOnly > 0 && <p>{what ? <strong>{what}: </strong> : null}You see every CIQ case from the audit log. Status and step are shown only for cases you work on.</p>}
        {warnings.map((w, i) => (
          <p key={i} className="text-ink-2">
            {w}
          </p>
        ))}
      </div>
    </div>
  );
}
