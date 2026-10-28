// Structured preview of a Payload_JSON per Config_Kind (§8.13; payload shapes §4.6 [convention]). Read-only.
import { Badge, Mono } from "@/components/ui/primitives";
import { KeyValue } from "@/components/ui/data";
import {
  parseManifest,
  parseOwnership,
  parseRmesCriteria,
  parseSectionDefinition,
  parseSettings,
  parseTemplate,
  parseTextBundle,
} from "../../domain/config";
import { prettyJson } from "./config";

const th = "py-1 pr-3 text-left font-medium text-ink-3";
const td = "border-t border-line py-1 pr-3 align-top";

function Err({ text }: { text: string }) {
  return (
    <p className="text-[13px] text-bad" data-testid="wb-config-preview-error">
      {text}
    </p>
  );
}

export function PayloadPreview({ kind, text }: { kind: string; text: string }) {
  if (!text.trim()) return <p className="text-[13px] text-ink-3">No payload.</p>;
  switch (kind) {
    case "Template": {
      const p = parseTemplate(text);
      if (!p.ok) return <Err text={p.error} />;
      return (
        <ol className="space-y-1 text-[13px]">
          {p.value.sections.map((s, i) => (
            <li key={`${s.sectionKey}-${i}`} className="flex items-center gap-2">
              <span className="w-6 text-right text-ink-3">{i + 1}.</span>
              <Mono>{s.sectionKey}</Mono>
              <Badge tone={s.default === "Mandatory" ? "brand" : s.default === "Optional" ? "info" : "neutral"}>{s.default}</Badge>
            </li>
          ))}
        </ol>
      );
    }
    case "Section definition": {
      const p = parseSectionDefinition(text);
      if (!p.ok) return <Err text={p.error} />;
      return (
        <div className="space-y-3 text-[13px]">
          <KeyValue
            cols={3}
            items={[
              { k: "Section", v: <Mono>{p.value.sectionKey}</Mono> },
              { k: "Code · title", v: `${p.value.code} · ${p.value.title}` },
              { k: "Sort", v: p.value.sort },
            ]}
          />
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Field</th>
                <th className={th}>Label</th>
                <th className={th}>Type</th>
                <th className={th}>Required</th>
              </tr>
            </thead>
            <tbody>
              {p.value.fields.map((f) => (
                <tr key={f.key}>
                  <td className={td}>
                    <Mono>{f.key}</Mono>
                  </td>
                  <td className={td}>{f.label}</td>
                  <td className={td}>{f.type}</td>
                  <td className={td}>{f.required ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "Section ownership": {
      const p = parseOwnership(text);
      if (!p.ok) return <Err text={p.error} />;
      return (
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className={th}>Section</th>
              <th className={th}>Lead</th>
              <th className={th}>Co-review</th>
              <th className={th}>Query owner</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(p.value.owners).map(([k, o]) => (
              <tr key={k}>
                <td className={td}>
                  <Mono>{k}</Mono>
                </td>
                <td className={td}>{o.lead}</td>
                <td className={td}>{o.co.join(", ") || "—"}</td>
                <td className={td}>{o.queryOwner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case "RMES criteria": {
      const p = parseRmesCriteria(text);
      if (!p.ok) return <Err text={p.error} />;
      return (
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className={th}>Dept</th>
              <th className={th}>Part</th>
              <th className={th}>Code</th>
              <th className={th}>Title</th>
            </tr>
          </thead>
          <tbody>
            {[...p.value.criteria]
              .sort((a, b) => a.dept.localeCompare(b.dept) || a.part.localeCompare(b.part) || a.code.localeCompare(b.code))
              .map((c) => (
                <tr key={`${c.dept}-${c.code}`}>
                  <td className={td}>{c.dept}</td>
                  <td className={td}>{c.part}</td>
                  <td className={td}>
                    <Mono>{c.code}</Mono>
                  </td>
                  <td className={td}>{c.title}</td>
                </tr>
              ))}
          </tbody>
        </table>
      );
    }
    case "Text bundle": {
      const p = parseTextBundle(text);
      if (!p.ok) return <Err text={p.error} />;
      return <KeyValue cols={1} items={Object.entries(p.value.texts).map(([k, v]) => ({ k: <Mono>{k}</Mono>, v: <span className="whitespace-pre-line">{v}</span> }))} />;
    }
    case "Settings": {
      const p = parseSettings(text);
      if (!p.ok) return <Err text={p.error} />;
      const s = p.value;
      return (
        <KeyValue
          cols={2}
          items={[
            { k: "Department review mode (RMM review by default)", v: s.deptReviewMode ? "On" : "Off" },
            { k: "Overall approval required by default", v: s.overallApprovalRequired ? "Yes" : "No" },
            { k: "Default supplier due days", v: s.defaultSupplierDueDays },
            { k: "Reactivation window (days)", v: s.reactivationDays },
            { k: "Counts policy", v: s.countsPolicy ?? "fail-closed (default)" },
          ]}
        />
      );
    }
    case "Release": {
      const p = parseManifest(text);
      if (!p.ok) return <Err text={p.error} />;
      return (
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className={th}>Kind</th>
              <th className={th}>Config key</th>
              <th className={th}>Section</th>
              <th className={th}>Content hash</th>
            </tr>
          </thead>
          <tbody>
            {p.value.map((e) => (
              <tr key={e.configKey}>
                <td className={td}>{e.kind}</td>
                <td className={td}>
                  <Mono>{e.configKey}</Mono>
                </td>
                <td className={td}>{e.sectionKey ? `${e.sectionKey}${e.sectionRev !== undefined ? ` r${e.sectionRev}` : ""}` : "—"}</td>
                <td className={td}>
                  <Mono className="text-ink-3">{e.contentHash.slice(0, 12)}…</Mono>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    default:
      return <pre className="max-h-80 overflow-auto rounded-md bg-surface-2 p-2 font-mono text-[12px] whitespace-pre-wrap text-ink">{prettyJson(text)}</pre>;
  }
}
