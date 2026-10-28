// proto-publish.mjs — THE prototype publication boundary. Every path that writes or uploads a
// prototype (CLI, AI Builder v1 live+version, AI Builder v2 live+version) goes through here, so the
// correctness guarantee is enforced in ONE place instead of being re-implemented (and forgotten) per
// path. That distribution is exactly how an uncompiled prototype reached storage while the fix looked
// deployed: the compile step lived inside one assembly path and failed OPEN, and several other paths
// never compiled at all.
//
// FAIL CLOSED. The old precompile() degrades to the raw CDN document on any failure — a page that
// renders the old way beats one that renders not at all — which is correct for a best-effort helper
// but WRONG for a publish gate: the "old way" is precisely what dies inside the preview host. Here a
// candidate that still carries a raw Tailwind runtime, or (when final) fails verification, is REJECTED.
// The caller keeps the last-known-good artifact and surfaces the failure; it never uploads raw source.
//
//   partial (streaming): must have compiled CSS (no raw Tailwind runtime). In-progress placeholders
//                        and not-yet-spliced role parts are EXPECTED and tolerated.
//   final:               compiled CSS AND a clean verifier (zero error-level findings).
import { precompile } from "./proto-precompile.mjs";
import { verify, rawTailwindFindings } from "./proto-verify.mjs";

// Errors that are fatal even for a PARTIAL/streaming candidate — the raw-runtime family. A streaming
// page is allowed missing parts and "generating…" placeholders, but never uncompiled CSS.
const PARTIAL_FATAL = new Set(["RAW_TAILWIND_RUNTIME", "UNCOMPILED_PROTOTYPE_CSS", "UNRESOLVED_TAILWIND_IMPORT"]);

/**
 * Precompile + verify a candidate for publication. NEVER returns ok:true for a document that still
 * carries a raw Tailwind runtime.
 *
 * @param {string} html      the assembled candidate document
 * @param {object} opts
 * @param {string} opts.label   for logs
 * @param {"partial"|"final"} opts.phase  streaming splice vs the final publishable artifact
 * @returns {Promise<{ ok:boolean, html:string, phase:string, reason:string, findings:Array, stats:object|null, compiled:boolean }>}
 */
export async function preparePrototypeForPublication(html, { label = "prototype", phase = "final" } = {}) {
  const pc = await precompile(html, { label });
  const candidate = pc.html;

  // BELT: even if precompile reported success, prove the raw runtime is actually gone. precompile
  // fails open, so `pc.changed === false` can mean "compiler missing" — in which case the raw head is
  // still here and this must reject, not trust the earlier reason string.
  const rawNow = rawTailwindFindings(candidate);
  if (rawNow.length) {
    return { ok: false, html: candidate, phase, compiled: false, stats: pc.stats || null,
      reason: `uncompiled Tailwind runtime present after precompile (${pc.reason}): ${rawNow.map((f) => f.kind).join(", ")}`,
      findings: rawNow };
  }

  const v = verify(candidate);
  const errors = (v.findings || []).filter((x) => x.level === "error");
  const fatal = phase === "final" ? errors : errors.filter((x) => PARTIAL_FATAL.has(x.kind));
  if (fatal.length) {
    return { ok: false, html: candidate, phase, compiled: !!pc.changed, stats: pc.stats || null,
      reason: `${fatal.length} ${phase === "final" ? "verifier" : "fatal"} error(s): ${fatal.slice(0, 4).map((f) => f.kind).join(", ")}`,
      findings: fatal };
  }

  return { ok: true, html: candidate, phase, compiled: !!pc.changed, stats: pc.stats || null,
    reason: pc.changed ? `compiled + verified (tailwindcss ${pc.stats?.version || "?"})` : `verified (${pc.reason})`,
    findings: [] };
}
