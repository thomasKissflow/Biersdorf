// The Rules page's rule list (business administrator and auditor). Thomas, 28 Oct: where a rule comes from (its basis:
// requirements document, agreed with Beiersdorf, not in the requirements) is not needed by the end users, so the list
// shows no Basis column, no basis filter and no basis counts. The rule data keeps its basis.
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BASIS_LABEL } from "@/domain/conditions";
import { RULE_SETS } from "@/domain/rules";
import { RuleList } from "./RuleList";

const flat = (html: string) => html.replace(/<!-- -->/g, "");
const RS1 = RULE_SETS[0];
const html = flat(renderToString(<RuleList ruleSet={RS1} marks={new Map()} inDraft={false} />));
const heads = [...html.matchAll(/<th(?:\s[^>]*)?>(.*?)<\/th>/g)].map((m) => m[1]);

describe("RuleList", () => {
  it("has no Basis column", () => {
    expect(heads).toEqual(["Rule", "Condition", "Activates", "Outcome", "Evidence required", "Departments"]);
  });

  it("shows no basis label, filter or count", () => {
    for (const label of [...Object.values(BASIS_LABEL), "from the requirements document", "agreed with Beiersdorf", "not in the requirements"]) expect(html).not.toContain(label);
    expect(html).toContain(`${RS1.rules.length} rules. The strictest outcome wins.`);
  });

  it("still lists every rule, and the rules keep their basis", () => {
    for (const r of RS1.rules) expect(html).toContain(`data-testid="rule-row-${r.id}"`);
    expect(RS1.rules.every((r) => !!r.basis)).toBe(true);
  });
});
