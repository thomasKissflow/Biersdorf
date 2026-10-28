import { describe, expect, it } from "vitest";
import { CLEAR } from "./normalize";
import { createPendingStore, type StorageLike } from "./pendingSheet";

function memStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}
const sheet = { fields: { SAF_Review_Confirm: "Confirmed", Response_Kind: CLEAR }, stepName: "Review – Safety", savedAt: "2026-10-08T10:00:00Z" };

describe("pendingSheet (§7.4)", () => {
  it("with storage: survives a reload (a new store on the same storage), keyed wb:pending:<_id>|<act>, CLEAR round-trips", () => {
    const st = memStorage();
    createPendingStore(st).save("PkC4|a2", sheet);
    expect([...st.data.keys()]).toEqual(["wb:pending:PkC4|a2"]);
    const after = createPendingStore(st);
    const got = after.load("PkC4|a2")!;
    expect(got.fields.SAF_Review_Confirm).toBe("Confirmed");
    expect(got.fields.Response_Kind).toBe(CLEAR);
    expect(after.keys()).toEqual(["PkC4|a2"]);
    after.remove("PkC4|a2");
    expect(st.data.size).toBe(0);
  });
  it("without storage: memory only, never throws", () => {
    const s = createPendingStore(null);
    expect(s.persistent).toBe(false);
    s.save("x|y", sheet);
    expect(s.load("x|y")?.stepName).toBe("Review – Safety");
    expect(createPendingStore(null).load("x|y")).toBeNull();
  });
  it("a storage that throws falls back to memory", () => {
    const bad: StorageLike = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("blocked"); } };
    const s = createPendingStore(bad);
    expect(() => s.save("a|b", sheet)).not.toThrow();
    expect(s.load("a|b")?.stepName).toBe("Review – Safety");
    expect(() => s.remove("a|b")).not.toThrow();
  });
});
