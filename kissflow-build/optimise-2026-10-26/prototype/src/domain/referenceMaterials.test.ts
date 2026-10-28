import { describe, expect, it } from "vitest";
import { REFERENCE_MATERIALS } from "./referenceMaterials";
import { deriveScope } from "./rules";

const app = (id: string, rs: string, tpl: string, sec: string) => deriveScope(REFERENCE_MATERIALS.find((m) => m.id === id)!.config, rs, tpl).find((x) => x.sectionId === sec)?.applicability;

describe("built-in reference materials for Test rules", () => {
  it("cover the typical patterns with unique ids, independent of any case", () => {
    expect(new Set(REFERENCE_MATERIALS.map((m) => m.id)).size).toBe(REFERENCE_MATERIALS.length);
    expect(REFERENCE_MATERIALS.length).toBeGreaterThanOrEqual(6);
    expect(REFERENCE_MATERIALS.map((m) => m.look).join(" ")).not.toMatch(/OP-\d|AS-\d|assumption/);
  });

  it("show what they promise", () => {
    expect(app("mineral-oil", "RS-2026.1", "CIQ-2026 v1", "A4")).toBe("mandatory");
    expect(app("paraffin", "RS-2026.1", "CIQ-2026 v1", "K5.1")).toBe("na");
    expect(app("turkey", "RS-2026.1", "CIQ-2026 v1", "K6.3")).toBeUndefined(); // not in questionnaire v1
    expect(app("turkey", "RS-2026.1", "CIQ-2026 v2", "K6.3")).toBe("na");
    expect(app("turkey", "RS-2026.2", "CIQ-2026 v2", "K6.3")).toBe("mandatory");
  });
});
