// The field ids the app's and the portal's code name (S-INTEGRITY "Names": SPEC §4), for the comparison with the flows'
// fields. Two sources, both read-only and offline:
// - scanCode: a static scan of src/app-live and src/portal (no tests, no fixtures, comments left out): every string
//   literal, object key and property name that has the shape of a Kissflow field id ("Case_Code", "Table::Contacts").
//   It cannot tell which flow a name is meant for, so a name no used flow has is attributed to the flow its neighbours
//   belong to (attribute), and a name that exists on the wrong flow is not seen (the declared lists below are exact).
// - declared: the per-flow lists the code keeps (ids.ts MANDATORY/EDITABLE per step, FORMULA_FIELDS, TABLES, STEPS and
//   STEP_NAMES; shared/caseStartPayload.ts CASE_START_FIELDS; shared/handoff.ts SYNCED_REQUEST_FIELDS; portal.ts STEPS,
//   UPLOADS_TABLE, FILES_FIELD), each bound to its flow.
// fieldReport compares both with the flows' drafts (drafts.ts), both ways, per flow.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_ID, EDITABLE, FLOWS, FORMULA_FIELDS, MANDATORY, OTHER_ROLES, ROLES, STEPS, STEP_NAMES, TABLES } from "@/app-live/ids";
import { CASE_START_FIELDS } from "@/app-live/shared/caseStartPayload";
import { SYNCED_REQUEST_FIELDS } from "@/app-live/shared/handoff";
import { FILES_FIELD, PORTAL_ID, FLOWS as PORTAL_FLOWS, ROLES as PORTAL_ROLES, STEPS as PORTAL_STEPS, UPLOADS_TABLE } from "@/portal/kf/portal";
import type { FlowMeta } from "./drafts";

/** prototype/src/ */
export const SRC_DIR = fileURLToPath(new URL("../../src/", import.meta.url));
/** The code under test (SPEC §4 S-INTEGRITY). */
export const SCANNED = ["app-live", "portal"] as const;
/** Not the code under test: tests, the offline fixtures and the portal's demo data (they mirror data, not the code). */
const SKIP_FILE = /\.test\.tsx?$|\.d\.ts$|[\\/]testing[\\/]|[\\/]portal[\\/]data[\\/]fixtures\.ts$/;
const FIELD_ID = /^[A-Z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+$/;
/** Ids of other Kissflow things with a field id's shape: activities and layout parts. Flow ids (…_A00) are kept apart. */
const LAYOUT_ID = /^(Activity|Row|Column|Appearance|Style|Permission|Node|Expression|QueryDefinition|ProcessDef)_/;
const FLOW_ID = /_A00$/;
/** Role ids have the shape too ("RoEK3_yhR4wx"), and the two app ids that of a flow. */
const NOT_NAMES = new Set<string>([...[...Object.values(ROLES), ...Object.values(OTHER_ROLES), ...Object.values(PORTAL_ROLES)].map((r) => r.id), APP_ID, PORTAL_ID]);
/** Field-id shaped names that are no form's field: a user record's key from the user directory (colleagues.ts) and the
 *  data console's placeholder for a field id (console/ItemDrawer.tsx). */
const NOT_FIELDS = new Set<string>(["Full_Name", "Field_Id"]);

export interface Use {
  token: string;
  /** Relative to src/. */
  file: string;
  line: number;
}
export interface Scan {
  files: string[];
  /** Field-id shaped names (child models included). */
  fields: Use[];
  /** Flow ids (…_A00) the code names. */
  flows: Use[];
}

/** A `/` here starts a regular expression, not a division (the code before it ends in an operator or a keyword). */
const REGEX_BEFORE = /(?:^|[(,=:[!&|?{};+\-*%>~^]|\breturn|\btypeof|\bcase)\s*$/;

/** The code with its comments and regular expressions removed, and its string literals (template parts included),
 *  each with its line. Lines stay where they were. A '…' or "…" never spans a line (JSX text like "Don't" is not a
 *  string): at the line's end it is taken back as code. */
export function lex(src: string): { code: string; strings: { text: string; line: number }[] } {
  let code = "";
  const strings: { text: string; line: number }[] = [];
  let line = 1;
  let i = 0;
  // template literals nest: each open `${` is a code level inside the template it interrupts
  const templates: number[] = [];
  let depth = 0;
  const readString = (quote: string) => {
    const start = line;
    const open = i;
    let text = "";
    i++;
    while (i < src.length) {
      const ch = src[i]!;
      if (ch === "\\") {
        text += src.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === "\n" && quote !== "`") {
        // not a string after all: the quote is code, and the rest of the line is lexed again
        code += quote;
        i = open + 1;
        return;
      }
      if (ch === "\n") {
        line++;
        code += "\n"; // keeps the code's line numbers
      }
      if (quote === "`" && ch === "$" && src[i + 1] === "{") {
        strings.push({ text, line: start });
        templates.push(depth);
        depth++;
        i += 2;
        code += " ";
        return;
      }
      if (ch === quote) {
        i++;
        strings.push({ text, line: start });
        code += " ";
        return;
      }
      text += ch;
      i++;
    }
    // the end of the file: an unclosed template is still a string; a quote is code, as at a line's end
    if (quote === "`") strings.push({ text, line: start });
    else {
      code += quote;
      i = open + 1;
    }
  };
  while (i < src.length) {
    const ch = src[i]!;
    const next = src[i + 1];
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") {
          line++;
          code += "\n";
        }
        i++;
      }
      i += 2;
      continue;
    }
    if (ch === "/" && REGEX_BEFORE.test(code.slice(-40))) {
      // up to the closing slash outside a [class], on this line
      let inClass = false;
      for (i++; i < src.length && src[i] !== "\n"; i++) {
        const c = src[i]!;
        if (c === "\\") i++;
        else if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) break;
      }
      i++;
      code += " ";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      readString(ch);
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (templates.length && templates.at(-1) === depth) {
        templates.pop();
        readString("`"); // the rest of the template the `${…}` interrupted (readString skips the "}")
        continue;
      }
    }
    if (ch === "\n") line++;
    code += ch;
    i++;
  }
  return { code, strings };
}

function walk(dir: string, out: string[]): void {
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(n) && !SKIP_FILE.test(p)) out.push(p);
  }
}

/** Every field id and flow id src/app-live and src/portal name, with where. Role, app and layout ids are left out. */
export function scanCode(o: { dir?: string } = {}): Scan {
  const dir = o.dir ?? SRC_DIR;
  const paths: string[] = [];
  for (const d of SCANNED) walk(join(dir, d), paths);
  const fields: Use[] = [];
  const flows: Use[] = [];
  for (const p of paths) {
    const file = relative(dir, p);
    const { code, strings } = lex(readFileSync(p, "utf8"));
    const add = (raw: string, line: number) => {
      const token = raw.startsWith("Table::") ? raw.slice("Table::".length) : raw;
      if (!FIELD_ID.test(token) || !/[a-z]/.test(token) || LAYOUT_ID.test(token) || NOT_NAMES.has(token) || NOT_FIELDS.has(token)) return;
      (FLOW_ID.test(token) ? flows : fields).push({ token, file, line });
    };
    for (const s of strings) add(s.text, s.line);
    // object keys (`Case_Code: …`) and property reads (`it.Payload_JSON`) in the code itself
    code.split("\n").forEach((l, n) => {
      for (const m of l.matchAll(/(?:^|[{,\s])([A-Z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+)\s*\??:(?!:)|\.([A-Z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+)\b/g)) add(m[1] ?? m[2]!, n + 1);
    });
  }
  return { files: paths.map((p) => relative(dir, p)), fields, flows };
}

/** The flow a use of a name no used flow has most likely means: the flow most of the names within `window` lines of it
 *  belong to, else the file's (`fieldsOf(token)` = the used flows that have the name). Ties name every flow. */
export function attribute(use: Use, all: readonly Use[], fieldsOf: (token: string) => string[], window = 15): string[] {
  const near = new Map<string, number>();
  const file = new Map<string, number>();
  for (const u of all) {
    if (u.file !== use.file) continue;
    for (const f of fieldsOf(u.token)) {
      file.set(f, (file.get(f) ?? 0) + 1);
      if (Math.abs(u.line - use.line) <= window) near.set(f, (near.get(f) ?? 0) + 1);
    }
  }
  const counts = near.size ? near : file;
  const max = Math.max(0, ...counts.values());
  return max ? [...counts].filter(([, n]) => n === max).map(([f]) => f).sort() : [];
}

// ---------------------------------------------------------------------------------- what the code declares per flow

export interface Declared {
  /** Fields the code says the flow has, with the constant that says so. */
  fields: { field: string; why: string }[];
  /** Child tables (models) of the flow. */
  models: { model: string; why: string }[];
  /** Formula fields (Kissflow computes them): `model` for a child table's. */
  formulas: { field: string; model?: string; why: string }[];
  /** Steps: activity id → the live name the code expects. */
  steps: { activity: string; name: string; why: string }[];
  /** Per step, what the code's own gate says (ids.ts MANDATORY / EDITABLE): the permission drift note. */
  permissions: { activity: string; field: string; expect: "Mandatory" | "Editable" }[];
}

const empty = (): Declared => ({ fields: [], models: [], formulas: [], steps: [], permissions: [] });

/** Flow id → what the code declares of it, for every flow of ids.ts FLOWS and portal.ts FLOWS. */
export function declared(): Map<string, Declared> {
  const out = new Map<string, Declared>();
  const of = (flowId: string) => {
    let d = out.get(flowId);
    if (!d) out.set(flowId, (d = empty()));
    return d;
  };
  for (const f of Object.values(FLOWS)) of(f.id);
  for (const f of Object.values(PORTAL_FLOWS)) of(f.id);

  for (const [key, steps] of Object.entries(STEPS) as [keyof typeof STEPS, Record<string, string>][]) {
    const d = of(FLOWS[key].id);
    for (const [k, activity] of Object.entries(steps)) {
      d.steps.push({ activity, name: STEP_NAMES[activity] ?? "", why: `ids.ts STEPS.${key}.${k}` });
      for (const field of MANDATORY[activity] ?? []) {
        d.fields.push({ field, why: `ids.ts MANDATORY (${STEP_NAMES[activity]})` });
        d.permissions.push({ activity, field, expect: "Mandatory" });
      }
      for (const field of EDITABLE[activity] ?? []) {
        d.fields.push({ field, why: `ids.ts EDITABLE (${STEP_NAMES[activity]})` });
        d.permissions.push({ activity, field, expect: "Editable" });
      }
    }
  }
  const formulas = FORMULA_FIELDS as Record<string, readonly string[]>;
  for (const key of ["case", "review", "op"] as const) for (const field of formulas[key] ?? []) of(FLOWS[key].id).formulas.push({ field, why: `ids.ts FORMULA_FIELDS.${key}` });
  // the RMES forms keep their criteria and findings tables in Kissflow (no flow change on 28 Oct), although the app
  // writes and reads neither any more
  for (const [dept, flow] of [["SAF", FLOWS.rmesSAF.id], ["REG", FLOWS.rmesREG.id]] as const) {
    const t = TABLES[dept];
    of(flow).models.push({ model: t.criteria, why: `ids.ts TABLES.${dept}.criteria` }, { model: t.findings, why: `ids.ts TABLES.${dept}.findings` });
    for (const field of formulas[t.criteria] ?? []) of(flow).formulas.push({ field, model: t.criteria, why: `ids.ts FORMULA_FIELDS.${t.criteria}` });
  }
  of(FLOWS.supplier.id).models.push({ model: TABLES.contacts, why: "ids.ts TABLES.contacts" });
  for (const field of Object.values(CASE_START_FIELDS)) of(FLOWS.case.id).fields.push({ field, why: "shared/caseStartPayload.ts CASE_START_FIELDS" });
  for (const field of SYNCED_REQUEST_FIELDS) {
    of(FLOWS.case.id).fields.push({ field, why: "shared/handoff.ts SYNCED_REQUEST_FIELDS (the case's copy)" });
    of(PORTAL_FLOWS.request.id).fields.push({ field, why: "shared/handoff.ts SYNCED_REQUEST_FIELDS (the request's original)" });
  }
  for (const [k, s] of Object.entries(PORTAL_STEPS)) of(PORTAL_FLOWS[s.flow].id).steps.push({ activity: s.activity, name: s.name, why: `portal.ts STEPS.${k}` });
  of(PORTAL_FLOWS.request.id).models.push({ model: UPLOADS_TABLE, why: "portal.ts UPLOADS_TABLE" });
  of(PORTAL_FLOWS.request.id).fields.push({ field: FILES_FIELD, why: "portal.ts FILES_FIELD" });
  return out;
}

// ---------------------------------------------------------------------------------- the comparison

export interface FlowReport {
  /** What the code declares for the flow (fields, tables, formula fields) that the flow lacks. */
  missing: string[];
  /** Fields the code treats as formulas that have no Expression in the draft. */
  noFormula: string[];
  /** ids.ts's step gate against the draft's permissions (a field-level Required counts as Mandatory). */
  drift: string[];
  /** Names the code uses that no flow has, attributed to this flow. */
  codeLacks: string[];
  /** Fields and tables the flow has that the code never names. */
  flowOnly: string[];
}
export interface FieldReport {
  /** Names the code uses that no used flow has, with the flow(s) most of their uses sit among and where (five places). */
  lacks: { token: string; flows: string[]; at: string[]; uses: number }[];
  perFlow: Map<string, FlowReport>;
}

/** The code's field ids (scan, declared) against the flows' fields (flow id → its draft), both ways, per flow. */
export function fieldReport(scan: Scan, metas: Map<string, FlowMeta>, decl = declared()): FieldReport {
  const fieldsOf = (t: string) => [...metas].filter(([, m]) => m.fields.has(t) || m.models.has(t)).map(([id]) => id);
  // each use votes for the flow(s) of its neighbours; a name goes to the flow(s) with the most votes
  const byToken = new Map<string, { at: string[]; votes: Map<string, number> }>();
  for (const u of scan.fields) {
    if (fieldsOf(u.token).length) continue;
    const e = byToken.get(u.token) ?? { at: [], votes: new Map<string, number>() };
    e.at.push(`${u.file}:${u.line}`);
    for (const f of attribute(u, scan.fields, fieldsOf)) e.votes.set(f, (e.votes.get(f) ?? 0) + 1);
    byToken.set(u.token, e);
  }
  const top = (votes: Map<string, number>) => {
    const max = Math.max(0, ...votes.values());
    return [...votes].filter(([, n]) => n === max && max > 0).map(([f]) => f).sort();
  };
  const lacks = [...byToken].map(([token, e]) => ({ token, flows: top(e.votes), at: e.at.slice(0, 5), uses: e.at.length }));
  const tokens = new Set(scan.fields.map((u) => u.token));
  const perFlow = new Map<string, FlowReport>();
  for (const [id, m] of metas) {
    const d = decl.get(id);
    const missing = [
      ...(d?.fields ?? []).filter((x) => !m.fields.has(x.field)).map((x) => `field ${x.field} (${x.why})`),
      ...(d?.models ?? []).filter((x) => !m.models.has(x.model)).map((x) => `table ${x.model} (${x.why})`),
      ...(d?.formulas ?? []).filter((x) => !m.fields.has(x.field) || (x.model && m.fields.get(x.field)?.model !== x.model)).map((x) => `formula field ${x.field} (${x.why})`),
    ];
    const drift = (d?.permissions ?? [])
      .map((p) => ({ ...p, actual: m.permissions.get(p.activity)?.get(p.field) ?? "(not on the step)", required: m.fields.get(p.field)?.required === true }))
      .filter((p) => (p.expect === "Mandatory" ? p.actual !== "Mandatory" && !(p.required && p.actual === "Editable") : p.actual !== "Editable" && p.actual !== "Mandatory"))
      .map((p) => `${p.activity} ${p.field}: the code says ${p.expect}, the draft ${p.actual}`);
    perFlow.set(id, {
      missing: [...new Set(missing)],
      noFormula: (d?.formulas ?? []).filter((x) => m.fields.has(x.field) && !m.formulas.has(x.field)).map((x) => `${x.field} (${x.why})`),
      drift,
      codeLacks: lacks.filter((x) => x.flows.includes(id)).map((x) => x.token),
      flowOnly: [...m.fields.keys(), ...m.models.keys()].filter((k) => !tokens.has(k)).sort(),
    });
  }
  return { lacks, perFlow };
}
