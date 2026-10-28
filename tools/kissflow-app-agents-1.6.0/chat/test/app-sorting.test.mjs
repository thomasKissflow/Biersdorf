// app-sorting.test.mjs — ordering the app list by when it was made, when it was touched, and by whom.
//
// The list only ever came back in one order. With a hundred apps across a team that makes two
// ordinary questions unanswerable — "which of these is new" and "what has harini been building" —
// and the second is what sent somebody looking for an app they thought had vanished.
//
// The comparator is EXECUTED here. Sort order is exactly the kind of thing that looks right in a diff
// and puts the oldest app at the top.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const UI = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui.html"), "utf8");
const src = UI.match(/  const label = \(it\) =>[\s\S]*?\n\s*: \(b\.touchedAt \|\| b\.mtime \|\| 0\) - \(a\.touchedAt \|\| a\.mtime \|\| 0\)\);/);
assert.ok(src, "the comparator must exist");

const APPS = [
  { name: "Zebra", owner: "harini.v@kissflow.com", createdAt: 300, touchedAt: 100 },
  { name: "apple", owner: "dinesh@kissflow.com", createdAt: 100, touchedAt: 300 },
  { name: "Mango", owner: "harini.v@kissflow.com", createdAt: 200, touchedAt: 200 },
];
const sortBy = (homeSort) => {
  const items = APPS.map((a) => ({ ...a }));
  new Function("items", "homeSort", `${src[0].replace(/^  /gm, "")}`)(items, homeSort);
  return items;
};

test("last modified puts the most recently touched first", () => {
  assert.deepEqual(sortBy("touched").map((a) => a.name), ["apple", "Mango", "Zebra"]);
});

test("date created is newest first — nobody is looking for their oldest app", () => {
  assert.deepEqual(sortBy("created").map((a) => a.name), ["Zebra", "Mango", "apple"]);
});

test("by developer groups a person's apps, newest of theirs first", () => {
  const out = sortBy("owner");
  assert.deepEqual(out.map((a) => a.owner), [
    "dinesh@kissflow.com", "harini.v@kissflow.com", "harini.v@kissflow.com",
  ]);
  assert.deepEqual(out.slice(1).map((a) => a.name), ["Mango", "Zebra"],
    "within one person it stays a timeline, not database order");
});

test("by name is A→Z and case does not decide it", () => {
  assert.deepEqual(sortBy("name").map((a) => a.name), ["apple", "Mango", "Zebra"],
    "an uppercase Z sorting above a lowercase a is the classic version of this bug");
});

test("the choice is remembered, and the control shows it", () => {
  assert.match(UI, /let homeSort = localStorage\.kfHomeSort \|\| "touched"/);
  assert.match(UI, /\$\("homeSort"\)\.onchange[^\n]*localStorage\.kfHomeSort/);
  assert.match(UI, /if \(\$\("homeSort"\)\) \$\("homeSort"\)\.value = homeSort;/,
    "a remembered sort that the dropdown does not show reads as broken");
});

test("the two dates are separate facts, not one blended one", () => {
  const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "app.mjs"), "utf8");
  assert.match(app, /createdAt: Date\.parse\(row\.created_at \|\| 0\)/);
  assert.match(app, /touchedAt: Date\.parse\(row\.last_accessed_at \|\| row\.created_at \|\| 0\)/,
    "mtime conflates a prototype file changing with the row being touched — right for 'recent', wrong for 'created'");
});
