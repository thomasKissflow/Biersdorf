// The live app's entry (main.tsx) gives React ROOT_OPTIONS (FE-CLEANUP "Console", 22 Oct): without them React 19 logs
// every crash a boundary caught a second time (rootOptions.ts). createRoot is replaced here, so nothing renders.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROOT_OPTIONS } from "./rootOptions";

const { roots } = vi.hoisted(() => ({ roots: [] as unknown[][] }));
vi.mock("react-dom/client", () => ({
  createRoot: (...args: unknown[]) => {
    roots.push(args);
    return { render: () => {} };
  },
}));

afterEach(() => vi.unstubAllGlobals());

describe("main.tsx", () => {
  it("creates the root with ROOT_OPTIONS: a caught crash is logged once, by its boundary", async () => {
    const el = { id: "root" };
    vi.stubGlobal("document", { getElementById: (id: string) => (id === "root" ? el : null) });
    await import("./main");
    expect(roots).toEqual([[el, ROOT_OPTIONS]]);
  });
});
