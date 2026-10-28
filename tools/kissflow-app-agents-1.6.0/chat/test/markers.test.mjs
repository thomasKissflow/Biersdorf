// Marker parsing is the one piece of the chat server that CANNOT be eyeballed: text arrives as token
// deltas, so every marker is potentially split across chunks. A leaked half-marker shows up as
// garbage in the user's chat; a dropped one means the preview never loads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MarkerStream, describeTool } from "../markers.mjs";

const feed = (chunks) => {
  const ms = new MarkerStream();
  let text = "";
  const markers = [];
  for (const c of chunks) { const r = ms.push(c); text += r.text; markers.push(...r.markers); }
  text += ms.flush();
  return { text, markers };
};

test("plain prose passes straight through", () => {
  const r = feed(["Built the ", "review desk."]);
  assert.equal(r.text, "Built the review desk.");
  assert.deepEqual(r.markers, []);
});

test("a whole marker is extracted and stripped", () => {
  const r = feed(["ok <<KF:phase Shell>> done"]);
  assert.equal(r.text, "ok  done");
  assert.deepEqual(r.markers, [{ kind: "phase", value: "Shell" }]);
});

test("a marker split across every possible boundary still parses", () => {
  const full = "a<<KF:preview runs/x/prototype/index.html>>b";
  for (let i = 1; i < full.length; i++) {
    const r = feed([full.slice(0, i), full.slice(i)]);
    assert.deepEqual(r.markers, [{ kind: "preview", value: "runs/x/prototype/index.html" }], `split at ${i}`);
    assert.equal(r.text, "ab", `split at ${i}`);
  }
});

test("one delta per character never leaks a partial marker", () => {
  const full = "x <<KF:status writing the queue>> y";
  const ms = new MarkerStream();
  let text = "";
  const markers = [];
  for (const ch of full) { const r = ms.push(ch); text += r.text; markers.push(...r.markers); }
  text += ms.flush();
  assert.ok(!text.includes("<<KF"), `leaked: ${JSON.stringify(text)}`);
  assert.deepEqual(markers, [{ kind: "status", value: "writing the queue" }]);
});

test("multiple markers in one chunk, in order", () => {
  const r = feed(["<<KF:phase Verify>>\n<<KF:preview runs/a/prototype/index.html>>\n<<KF:done>>"]);
  assert.deepEqual(r.markers.map((m) => m.kind), ["phase", "preview", "done"]);
  assert.equal(r.markers[2].value, "");
});

test("a marker on its own line does not leave a blank line", () => {
  const r = feed(["done.\n<<KF:done>>\nnext"]);
  assert.equal(r.text, "done.\nnext");
});

test("an unterminated marker is released as prose at flush", () => {
  const r = feed(["text <<KF:phase Shell"]);
  assert.equal(r.text, "text <<KF:phase Shell");
  assert.deepEqual(r.markers, []);
});

test("phase detail survives the pipe separator", () => {
  const r = feed(["<<KF:phase Build|writing the approval queue>>"]);
  assert.deepEqual(r.markers, [{ kind: "phase", value: "Build|writing the approval queue" }]);
});

test("case is normalised on the kind, preserved in the value", () => {
  const r = feed(["<<KF:PHASE Design>>"]);
  assert.deepEqual(r.markers, [{ kind: "phase", value: "Design" }]);
});

test("tool descriptions stay to one short clause", () => {
  const b = describeTool("Bash", { description: "assemble the prototype", command: "node engine/proto-assemble.mjs runs/x/parts" });
  assert.equal(b.verb, "run");
  assert.equal(b.detail, "assemble the prototype");
  // `detail` is what a PERSON reads in the activity row and `code` is the path underneath it. That
  // split is the point of the friendly labels: "writing the FM pages" is a sentence about the app,
  // "writing runs/demo/prototype/parts/role-fm.html" is a sentence about a filesystem. The path is
  // not lost — it moved to `code`, where the row shows it on demand — so assert BOTH halves, or the
  // next person to make the labels nicer will quietly drop the path and no test will notice.
  const w = describeTool("Write", { file_path: "/Users/x/Projects/kf/runs/demo/prototype/parts/role-fm.html" });
  assert.equal(w.verb, "write");
  assert.equal(w.detail, "the FM pages", "a role part reads as the role, not as a filename");
  assert.equal(w.code, "runs/demo/prototype/parts/role-fm.html", "and the path is still one click away");
  // the other two labels that carry meaning, so a rename of either is caught here
  assert.equal(describeTool("Write", { file_path: "/x/runs/demo/prototype/parts/shell.html" }).detail, "the app frame");
  assert.equal(describeTool("Write", { file_path: "/x/runs/demo/app-spec.json" }).detail, "the blueprint");
  assert.equal(describeTool("Task", { description: "build the approver role" }).verb, "agent");
  assert.ok(describeTool("SomethingNew", {}).verb);
});
