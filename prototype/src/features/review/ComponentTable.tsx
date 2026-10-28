// K2.1 composition table (one row per component) with a per-row "Ask supplier".
import { MessageSquarePlus } from "lucide-react";
import { Badge, Mono, TrafficLight } from "@/components/ui";
import { ORIGIN_LABEL } from "@/domain/catalog";
import { additiveText, concText } from "@/domain/composition";
import { fmtDate, fmtDateTime, userName } from "@/domain/selectors";
import type { AppState, CiqCase } from "@/domain/types";
import { changedAfter } from "./lib";
import type { AskTarget } from "./shared";

// The attributes a reviewer can ask about (open-point labels; matrix v0.6 names: INCI / IUPAC, EC or REACH no.).
const ATTRIBUTES = ["INCI / IUPAC", "CAS number", "EC / REACH registration no.", "Function", "Origin", "Concentration range", "Additive flag"];

export function ComponentTable({ c, state, since, canAsk, onAsk, onFocusOp }: { c: CiqCase; state: AppState; since?: string; canAsk: boolean; onAsk: (t: AskTarget) => void; onFocusOp: (id: string) => void }) {
  const by = c.answeredBy["K2.1:components"];
  if (c.components.length === 0) return <p className="px-4 py-6 text-center text-[13px] text-ink-3">The supplier has not entered any component yet.</p>;
  return (
    <div data-testid="component-table">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-ink-3">
              <th className="py-2 pr-2 pl-4 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Component</th>
              <th className="px-2 py-2 font-medium">CAS / EC or REACH no.</th>
              <th className="px-2 py-2 font-medium">Origin</th>
              <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Conc. %</th>
              <th className="py-2 pr-4 pl-2" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {c.components.map((r, i) => {
              const ops = c.openPoints.filter((p) => p.ref.sectionId === "K2.1" && p.ref.rowId === r.id && p.status !== "closed");
              return (
                <tr key={r.id} className="border-b border-line align-top last:border-0">
                  <td className="py-2.5 pr-2 pl-4 text-ink-3">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <div className="font-medium text-ink">{r.inci || "—"}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                      <span>{r.fn}</span>
                      {r.additive === true && <Badge tone="neutral">Additive</Badge>}
                      {typeof r.additive !== "boolean" && <span>Additive: {additiveText(r.additive)}</span>}
                    </div>
                    {ops.map((p) => (
                      <button key={p.id} onClick={() => onFocusOp(p.id)} className="mt-1 flex items-center gap-1.5 text-left text-xs text-ink-2 hover:text-ink">
                        <TrafficLight status={p.status} label={`${p.id} · ${p.ref.label.split(" › ").slice(2).join(" › ") || "row"}`} />
                      </button>
                    ))}
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <Mono className="text-ink">{r.cas ?? "—"}</Mono>
                    <div className="text-xs text-ink-3">{r.ec ? <Mono>{r.ec}</Mono> : "EC —"}</div>
                  </td>
                  <td className="px-2 py-2.5 text-ink-2">{ORIGIN_LABEL[r.origin]}</td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap text-ink">{concText(r, "")}</td>
                  <td className="py-2 pr-4 pl-2 text-right">
                    {canAsk && (
                      <button
                        onClick={() => onAsk({ ref: { sectionId: "K2.1", rowId: r.id, label: `K2.1 › component ${i + 1} (${r.inci})` }, attributes: ATTRIBUTES, defaultKind: "query" })}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-medium whitespace-nowrap text-brand hover:bg-brand-soft"
                        aria-label={`Ask supplier about component ${i + 1}`}
                        data-testid={`ask-row-${r.id}`}
                      >
                        <MessageSquarePlus size={14} /> Ask supplier
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {by && (
        <p className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2 text-[11.5px] text-ink-3">
          <span>
            Composition entered by {userName(state, by.by)} · {fmtDateTime(by.at)}
          </span>
          {changedAfter(since, by.at) && (
            <Badge tone="warn" dot>
              Changed {fmtDate(by.at)} by {userName(state, by.by)}
            </Badge>
          )}
        </p>
      )}
    </div>
  );
}
