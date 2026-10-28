// Formula engine of the emulated host (WORKBENCH-DESIGN.md §11.1 formula.ts). Evaluates the spec formula strings
// after every write, as Kissflow does server-side (SPIKES L75, L105): IF, OR, AND, NOT, ISBLANK, `+`, `=`, `!=`, `<`,
// `>`, `<=`, `>=`, string and number literals and field references. The results must equal the shared vectors in
// schema/formulaSamples.ts (v4: `<D>_Gate` = "" and Hold = "Yes" when a count is blank).
// childFormula=off leaves child-column formulas (Criteria_Open_Num) blank (§11.2).
import { CHILD_TABLES, FIELDS, type ChildTableId, type FlowId } from "../schema/generated";

export type Value = string | number | boolean | null;

type Node =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "ref"; name: string }
  | { k: "call"; fn: string; args: Node[] }
  | { k: "bin"; op: "+" | "-" | "=" | "!=" | "<" | ">" | "<=" | ">="; a: Node; b: Node };

type Tok = { t: "num"; v: number } | { t: "str"; v: string } | { t: "id"; v: string } | { t: "op"; v: string } | { t: "(" } | { t: ")" } | { t: "," };

export class FormulaError extends Error {}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "(" || c === ")" || c === ",") {
      out.push({ t: c } as Tok);
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== '"') s += src[j++];
      if (src[j] !== '"') throw new FormulaError(`unterminated string in ${src}`);
      out.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ t: "num", v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === "!=" || two === "<=" || two === ">=" || two === "<>") {
      out.push({ t: "op", v: two === "<>" ? "!=" : two });
      i += 2;
      continue;
    }
    if ("+-=<>".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new FormulaError(`unexpected '${c}' in ${src}`);
  }
  return out;
}

function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const take = () => toks[p++];
  const expect = (t: Tok["t"]) => {
    const x = take();
    if (!x || x.t !== t) throw new FormulaError(`expected ${t} in ${src}`);
    return x;
  };
  function primary(): Node {
    const x = take();
    if (!x) throw new FormulaError(`unexpected end of ${src}`);
    if (x.t === "num") return { k: "num", v: x.v };
    if (x.t === "str") return { k: "str", v: x.v };
    if (x.t === "(") {
      const e = expr();
      expect(")");
      return e;
    }
    if (x.t === "id") {
      if (peek()?.t === "(") {
        take();
        const args: Node[] = [];
        if (peek()?.t !== ")") {
          args.push(expr());
          while (peek()?.t === ",") {
            take();
            args.push(expr());
          }
        }
        expect(")");
        return { k: "call", fn: x.v.toUpperCase(), args };
      }
      return { k: "ref", name: x.v };
    }
    throw new FormulaError(`unexpected token in ${src}`);
  }
  function additive(): Node {
    let a = primary();
    while (peek()?.t === "op" && ((peek() as { v: string }).v === "+" || (peek() as { v: string }).v === "-")) {
      const op = (take() as { v: string }).v as "+" | "-";
      a = { k: "bin", op, a, b: primary() };
    }
    return a;
  }
  function expr(): Node {
    const a = additive();
    const x = peek();
    if (x?.t === "op" && ["=", "!=", "<", ">", "<=", ">="].includes(x.v)) {
      take();
      return { k: "bin", op: x.v as "=", a, b: additive() };
    }
    return a;
  }
  const e = expr();
  if (p !== toks.length) throw new FormulaError(`trailing tokens in ${src}`);
  return e;
}

export const isBlank = (v: unknown): boolean => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

const toNum = (v: Value): number => {
  if (isBlank(v)) return 0; // a blank Number counts as 0 in arithmetic (SPIKES L75)
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const truthy = (v: Value): boolean => (typeof v === "boolean" ? v : typeof v === "number" ? v !== 0 : !isBlank(v) && v !== "false");

function compare(op: string, a: Value, b: Value): boolean {
  const numeric = (typeof a === "number" || typeof b === "number") && !(typeof a === "string" && a !== "" && !Number.isFinite(Number(a))) && !(typeof b === "string" && b !== "" && !Number.isFinite(Number(b)));
  if (numeric) {
    const x = toNum(a);
    const y = toNum(b);
    return op === "=" ? x === y : op === "!=" ? x !== y : op === "<" ? x < y : op === ">" ? x > y : op === "<=" ? x <= y : x >= y;
  }
  const x = isBlank(a) ? "" : String(a);
  const y = isBlank(b) ? "" : String(b);
  return op === "=" ? x === y : op === "!=" ? x !== y : op === "<" ? x < y : op === ">" ? x > y : op === "<=" ? x <= y : x >= y;
}

function evalNode(n: Node, get: (name: string) => unknown): Value {
  switch (n.k) {
    case "num":
      return n.v;
    case "str":
      return n.v;
    case "ref": {
      const v = get(n.name);
      if (v === undefined || v === null) return null;
      if (typeof v === "object") return (v as { _id?: string })._id ?? JSON.stringify(v);
      return v as Value;
    }
    case "bin": {
      const a = evalNode(n.a, get);
      const b = evalNode(n.b, get);
      if (n.op === "+") return toNum(a) + toNum(b);
      if (n.op === "-") return toNum(a) - toNum(b);
      return compare(n.op, a, b);
    }
    case "call": {
      const args = n.args;
      switch (n.fn) {
        case "IF":
          if (args.length < 2) throw new FormulaError("IF needs 2 or 3 arguments");
          return truthy(evalNode(args[0], get)) ? evalNode(args[1], get) : args[2] ? evalNode(args[2], get) : "";
        case "OR":
          return args.some((x) => truthy(evalNode(x, get)));
        case "AND":
          return args.every((x) => truthy(evalNode(x, get)));
        case "NOT":
          return !truthy(evalNode(args[0], get));
        case "ISBLANK":
          return isBlank(evalNode(args[0], get));
        default:
          throw new FormulaError(`function ${n.fn} is not emulated`);
      }
    }
  }
}

const cache = new Map<string, Node>();
/** Evaluates one formula string against a field getter. */
export function evaluate(formula: string, get: (name: string) => unknown): Value {
  let ast = cache.get(formula);
  if (!ast) {
    ast = parse(formula);
    cache.set(formula, ast);
  }
  const v = evalNode(ast, get);
  return typeof v === "boolean" ? (v ? "true" : "false") : v;
}

type FieldLike = { id: string; formula?: string; computed?: boolean };
const headerFormulas = (flow: FlowId): FieldLike[] => Object.values(FIELDS[flow] as Record<string, FieldLike>).filter((f) => !!f.formula);
const tableFormulas = (table: ChildTableId): FieldLike[] => Object.values(CHILD_TABLES[table].fields as Record<string, FieldLike>).filter((f) => !!f.formula);
export const tablesOfFlow = (flow: FlowId): ChildTableId[] => (Object.keys(CHILD_TABLES) as ChildTableId[]).filter((t) => CHILD_TABLES[t].flow === flow);
/** The `Table::<id>` key the host stores child rows under (server child model ids are unknown: the spec id). */
export const tableKey = (t: ChildTableId): string => {
  const sid: string | null = CHILD_TABLES[t].serverModelId;
  return `Table::${sid ?? CHILD_TABLES[t].id}`;
};

/** A formula result as Kissflow would store it: "" stays "" (blank), numbers stay numbers. */
const stored = (v: Value): unknown => (v === null ? "" : v);

/**
 * Recomputes every formula field of an item in place: header formulas, then child-column formulas per row (blank when
 * childFormula is off). Returns the header formula ids whose value changed (for tests and the recorder).
 */
export function recompute(flow: FlowId, fields: Record<string, unknown>, o: { childFormula: boolean } = { childFormula: true }): string[] {
  const changed: string[] = [];
  for (const t of tablesOfFlow(flow)) {
    const rows = fields[tableKey(t)];
    if (!Array.isArray(rows)) continue;
    for (const row of rows as Record<string, unknown>[]) for (const f of tableFormulas(t)) row[f.id] = o.childFormula ? stored(evaluate(f.formula!, (n) => row[n])) : null;
  }
  for (const f of headerFormulas(flow)) {
    const v = stored(evaluate(f.formula!, (n) => fields[n]));
    if (fields[f.id] !== v) changed.push(f.id);
    fields[f.id] = v;
  }
  return changed;
}

/** Every formula in the generated schema, header and child columns (the parity test walks this list). */
export function allFormulas(): { flow: FlowId; table?: ChildTableId; field: string; formula: string }[] {
  const out: { flow: FlowId; table?: ChildTableId; field: string; formula: string }[] = [];
  for (const flow of Object.keys(FIELDS) as FlowId[]) for (const f of headerFormulas(flow)) out.push({ flow, field: f.id, formula: f.formula! });
  for (const t of Object.keys(CHILD_TABLES) as ChildTableId[]) for (const f of tableFormulas(t)) out.push({ flow: CHILD_TABLES[t].flow as FlowId, table: t, field: f.id, formula: f.formula! });
  return out;
}
