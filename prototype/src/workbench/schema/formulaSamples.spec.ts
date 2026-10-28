// The shared formula vectors (§12 "Shared test data"): checked here against the spec formula TEXT with a small
// reference evaluator (so the vectors are right), and against the T0 client mirrors in data/gates.ts. Every formula in
// FIELDS and the child tables has vectors.
import { describe, expect, it } from "vitest";
import { MIRRORS } from "../data/gates";
import { FORMULA_SAMPLES } from "./formulaSamples";
import { CHILD_TABLES, FIELDS } from "./generated";

// ---- a tiny reference evaluator for the spec's formula language (IF, OR, AND, NOT, ISBLANK, +, =, !=, <, >)
type Tok = { t: "num" | "str" | "id" | "op" | "(" | ")" | ","; v: string };
function lex(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) i++;
    else if (ch === '"') {
      const j = s.indexOf('"', i + 1);
      out.push({ t: "str", v: s.slice(i + 1, j) });
      i = j + 1;
    } else if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      out.push({ t: "num", v: s.slice(i, j) });
      i = j;
    } else if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      out.push({ t: "id", v: s.slice(i, j) });
      i = j;
    } else if (s.startsWith("!=", i) || s.startsWith("<>", i) || s.startsWith("<=", i) || s.startsWith(">=", i)) {
      out.push({ t: "op", v: s.slice(i, i + 2) });
      i += 2;
    } else if ("+-=<>".includes(ch)) {
      out.push({ t: "op", v: ch });
      i++;
    } else if (ch === "(" || ch === ")" || ch === ",") {
      out.push({ t: ch, v: ch });
      i++;
    } else throw new Error(`bad char ${ch} in ${s}`);
  }
  return out;
}
const blank = (v: unknown) => v === null || v === undefined || v === "";
function evaluate(formula: string, vars: Record<string, unknown>): unknown {
  const toks = lex(formula);
  let p = 0;
  const peek = () => toks[p];
  const take = () => toks[p++];
  const expr = (): unknown => {
    const left = sum();
    const op = peek();
    if (op?.t === "op" && ["=", "!=", "<>", "<", ">", "<=", ">="].includes(op.v)) {
      take();
      const right = sum();
      const a = blank(left) ? "" : left;
      const b = blank(right) ? "" : right;
      switch (op.v) {
        case "=":
          return String(a) === String(b);
        case "!=":
        case "<>":
          return String(a) !== String(b);
        case "<":
          return Number(a) < Number(b);
        case ">":
          return Number(a) > Number(b);
        case "<=":
          return Number(a) <= Number(b);
        default:
          return Number(a) >= Number(b);
      }
    }
    return left;
  };
  const sum = (): unknown => {
    let v = atom();
    while (peek()?.t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = take().v;
      const r = atom();
      v = op === "+" ? Number(blank(v) ? 0 : v) + Number(blank(r) ? 0 : r) : Number(v) - Number(r);
    }
    return v;
  };
  const args = (): unknown[] => {
    take(); // (
    const out: unknown[] = [];
    if (peek().t !== ")") {
      out.push(expr());
      while (peek().t === ",") {
        take();
        out.push(expr());
      }
    }
    take(); // )
    return out;
  };
  const atom = (): unknown => {
    const t = take();
    if (t.t === "num") return Number(t.v);
    if (t.t === "str") return t.v;
    if (t.t === "(") {
      const v = expr();
      take();
      return v;
    }
    if (t.t === "id") {
      if (peek()?.t === "(") {
        const fn = t.v.toUpperCase();
        if (fn === "IF") {
          const [c, a, b] = args();
          return c ? a : b;
        }
        const a = args();
        if (fn === "OR") return a.some(Boolean);
        if (fn === "AND") return a.every(Boolean);
        if (fn === "NOT") return !a[0];
        if (fn === "ISBLANK") return blank(a[0]);
        throw new Error(`unknown function ${fn}`);
      }
      return vars[t.v] ?? null;
    }
    throw new Error(`unexpected ${t.v}`);
  };
  const v = expr();
  if (p !== toks.length) throw new Error(`trailing tokens in ${formula}`);
  return v;
}

const formulaOf = (s: (typeof FORMULA_SAMPLES)[number]): string => {
  const f = s.table ? (CHILD_TABLES as any)[s.table].fields[s.field] : (FIELDS as any)[s.flow][s.field];
  return f.formula;
};

describe("formula vectors", () => {
  it("cover every formula field in FIELDS and in the child tables", () => {
    const want: string[] = [];
    for (const [flow, fields] of Object.entries(FIELDS)) for (const f of Object.values(fields) as any[]) if (f.formula) want.push(`${flow}.${f.id}`);
    for (const t of Object.values(CHILD_TABLES) as any[]) for (const f of Object.values(t.fields) as any[]) if (f.formula) want.push(`${t.flow}.${t.id}.${f.id}`);
    const have = new Set(FORMULA_SAMPLES.map((s) => (s.table ? `${s.flow}.${s.table}.${s.field}` : `${s.flow}.${s.field}`)));
    expect(want.filter((w) => !have.has(w))).toEqual([]);
    expect(want).toHaveLength(14); // 9 Case + 2 OP + 1 CR + 2 child-table columns
  });

  it.each(FORMULA_SAMPLES.map((s, i) => [i, s] as const))("vector %i agrees with the spec formula text", (_i, s) => {
    expect(evaluate(formulaOf(s), s.inputs)).toBe(s.output);
  });

  it("assert v4's results: a blank count gives SAF_Gate \"\" and Hold_For_Open_Items \"Yes\"", () => {
    expect(evaluate((FIELDS as any).CIQ_Case_A00.SAF_Gate.formula, {})).toBe("");
    expect(evaluate((FIELDS as any).CIQ_Case_A00.Hold_For_Open_Items.formula, {})).toBe("Yes");
  });
});

describe("client mirrors (data/gates.ts) match every vector", () => {
  it.each(FORMULA_SAMPLES.map((s, i) => [i, s] as const))("mirror %i", (_i, s) => {
    const key = s.table ? `${s.flow}.${s.table}.${s.field}` : `${s.flow}.${s.field}`;
    const m = MIRRORS[key];
    expect(m, key).toBeDefined();
    expect(m(s.inputs).value).toBe(s.output);
  });
});
