// ui-deps-licence.test.mjs — the generated UI ships to customers, so its licences do too.
//
// "Don't add anything that is commercial" (2026-08-11). A licence obligation on a library the agent
// puts into a generated app does not stop at us: it follows the app into the customer's Kissflow
// account. So the rule lives here rather than in somebody's memory of the conversation.
//
// The denylist is the widely-used libraries that are genuinely tempting for exactly the screens this
// product builds — grids, schedulers, Gantt charts, charts — and that carry a paid tier or a
// non-OSI restriction. Each one is here because it is the obvious choice for a real need, which is
// precisely why it needs a rule and not a recollection.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PKG = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "starter", "package.json"), "utf8"));

// name → why it is not allowed
const DENY = {
  "ag-grid-enterprise": "paid per-developer licence",
  "@ag-grid-enterprise/core": "paid per-developer licence",
  "@fullcalendar/resource-timeline": "FullCalendar Premium",
  "@fullcalendar/resource-timegrid": "FullCalendar Premium",
  "@fullcalendar/scheduler": "FullCalendar Premium",
  "highcharts": "commercial for non-personal use",
  "highcharts-react-official": "commercial for non-personal use",
  "dhtmlx-gantt": "commercial",
  "@bryntum/gantt": "commercial",
  "@bryntum/scheduler": "commercial",
  "@syncfusion/ej2-react-grids": "commercial",
  "devextreme": "commercial",
  "@mui/x-data-grid-pro": "paid tier of MUI X",
  "@mui/x-data-grid-premium": "paid tier of MUI X",
  "handsontable": "commercial for non-open-source use",
  "@handsontable/react": "commercial for non-open-source use",
};

test("no commercial library is a dependency of the generated UI", () => {
  const deps = { ...PKG.dependencies, ...PKG.devDependencies };
  const found = Object.keys(deps).filter((d) => DENY[d]);
  assert.deepEqual(found, [],
    found.map((d) => `${d} — ${DENY[d]}`).join("; ") + " · a licence on a generated app follows it to the customer");
});

test("the libraries that were added are all present and permissive", () => {
  // MIT, every one, verified against node_modules at the time they were added
  for (const d of ["@tanstack/react-table", "@tanstack/react-virtual", "@tanstack/react-query",
    "@xyflow/react", "@dnd-kit/core", "@dnd-kit/sortable", "react-hook-form", "zod",
    "@hookform/resolvers", "three", "@react-three/fiber", "@react-three/drei", "papaparse",
    "react-dropzone", "framer-motion", "react-big-calendar", "frappe-gantt", "react-error-boundary"]) {
    assert.ok(PKG.dependencies[d], `${d} is missing from the starter`);
  }
});

test("the three wrappers stay on the React 18 line", () => {
  // fiber 9 / drei 10 require React >=19; the starter and @kissflow/app-ui are on 18, and pnpm
  // installed them anyway with only an unmet-peer warning — a runtime failure waiting for the first
  // 3D page rather than a build error anybody would notice.
  assert.match(PKG.dependencies["@react-three/fiber"], /\^8/);
  assert.match(PKG.dependencies["@react-three/drei"], /\^9/);
  assert.match(PKG.dependencies.react, /18/);
});
