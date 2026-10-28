// build-progress.test.mjs — progress the host MEASURED, not progress the model described.
//
// The pane's timeline is fed by `<<KF:building prototype|…>>` markers, so how far along a build is
// was something the conductor had to remember to say. When it doesn't — and mostly it doesn't — the
// pane shows one gerund for nine minutes, and a working build is indistinguishable from a hung one.
//
// The host never needed telling. It already watches the parts directory to re-splice the page, and
// the experience spec already says how many roles the app has. Built-over-expected is a fact on
// disk: it moves on its own and cannot be forgotten.
import "./_env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { __test } from "../app.mjs";

const { partsProgress } = __test;

// runDir() resolves a session to KF_RUNS_DIR/<slug>, which _env.mjs points at a throwaway directory —
// so the fixture builds a run where the code will actually look for one.
let nth = 0;
const run = (roles, parts, { shell = true } = {}) => {
  const slug = `prog-${++nth}`;
  const dir = join(process.env.KF_RUNS_DIR, slug);
  const pd = join(dir, "prototype", "parts");
  mkdirSync(pd, { recursive: true });
  if (roles != null) {
    writeFileSync(join(dir, "prototype", "experience-spec.json"),
      JSON.stringify({ app: { name: "X" }, roles: Array.from({ length: roles }, (_, i) => ({ role: `r${i}` })) }));
  }
  if (shell) writeFileSync(join(pd, "shell.html"), "<html></html>");
  for (const p of parts) writeFileSync(join(pd, `role-${p}.html`), "<div></div>");
  return { slug, id: `s-${slug}` };
};

test("progress is a proportion, counted off the disk", () => {
  const s = run(9, ["fin", "ops", "hr", "adm"]);
  const p = partsProgress(s);
  assert.equal(p.built, 4);
  assert.equal(p.expected, 9, "the experience spec knows how many roles the app has");
});

test("the shell is not a page — it must not inflate the count", () => {
  const s = run(3, []);
  const p = partsProgress(s);
  assert.equal(p.built, 0, "shell.html is chrome, not one of the pages being waited for");
  assert.equal(p.shell, true, "…but the pane can still say the shell is up");
});

test("it names the page that just landed", () => {
  const s = run(5, ["fin"]);
  assert.equal(partsProgress(s).latest, "fin", "so the line reads as work, not as a number ticking");
});

test("no spec yet still reports what exists — early progress is the progress that matters", () => {
  const s = run(null, ["fin", "ops"]);
  const p = partsProgress(s);
  assert.equal(p.built, 2);
  assert.equal(p.expected, 0, "unknown total, and the pane phrases it as 'N pages so far'");
});

test("a run with nothing yet reports nothing rather than a false zero", () => {
  const s = { slug: "prog-never-started", id: "s-none" };
  assert.equal(partsProgress(s), null, "no parts directory — the build has not reached pages yet");
});
