// paste-attach.test.mjs — Cmd-V is where people reach first, and it did nothing.
//
// The composer already took files two ways: the paperclip and drag-and-drop. Paste was not wired at
// all, so a copied screenshot — the fastest way to show the thing you are describing — vanished, and
// the only feedback was a composer that had not changed.
//
// The ordering is the part worth pinning, not the wiring. Copying a range out of Excel, Numbers or a
// web table puts BOTH a text rendering and a picture of it on the clipboard. Taking the image would
// silently turn a paste of your data into a screenshot of your data: unreadable to the builder, and
// not obviously wrong until much later. Text wins whenever there is text; the file is only taken when
// there is nothing to paste, which is exactly the screenshot case.
//
// The handler is executed here against fake clipboard events, because the bug this prevents is a
// branch taken in the wrong order — and only running it takes a branch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const UI = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui.html"), "utf8");
const src = UI.match(/let pasted = 0;\n\s*input\.addEventListener\("paste",[\s\S]*?\n  \}\);/);
assert.ok(src, "the composer's paste handler must exist in ui.html");

// Run the handler with a stub textarea and a stub stageFiles, and report what it did.
function paste({ text = "", files = [] }) {
  const staged = [];
  let defaultPrevented = false;
  let handler;
  const input = { addEventListener: (_ev, fn) => { handler = fn; } };
  const stageFiles = (list) => staged.push(...list);
  // node's File is global from 20.x; the handler constructs one to rename clipboard images
  new Function("input", "stageFiles", src[0])(input, stageFiles);
  handler({
    clipboardData: { getData: (t) => (t === "text/plain" ? text : ""), files },
    preventDefault: () => { defaultPrevented = true; },
  });
  return { staged, defaultPrevented };
}
const img = (type = "image/png") => new File([new Uint8Array([1, 2, 3])], "image.png", { type });

test("a pasted screenshot is attached", () => {
  const { staged, defaultPrevented } = paste({ files: [img()] });
  assert.equal(staged.length, 1);
  assert.equal(defaultPrevented, true, "the browser must not also try to paste it as text");
});

test("pasted text stays text, even when the clipboard also holds a picture of it", () => {
  // this IS a spreadsheet copy: Excel and Numbers put both on the clipboard, every time
  const { staged, defaultPrevented } = paste({ text: "Vendor\tAmount\nAtlas\t42000", files: [img()] });
  assert.equal(staged.length, 0, "attaching here would replace the user's data with a picture of it");
  assert.equal(defaultPrevented, false, "and the text must land in the box");
});

test("plain text with no file is left entirely alone", () => {
  const { staged, defaultPrevented } = paste({ text: "onboard new vendors" });
  assert.equal(staged.length, 0);
  assert.equal(defaultPrevented, false);
});

test("clipboard images are renamed apart — every one of them arrives as image.png", () => {
  const staged = [];
  let handler;
  new Function("input", "stageFiles", src[0])(
    { addEventListener: (_e, fn) => { handler = fn; } },
    (list) => staged.push(...list));
  const fire = (f) => handler({ clipboardData: { getData: () => "", files: [f] }, preventDefault() {} });
  fire(img()); fire(img()); fire(img("image/jpeg"));
  assert.deepEqual(staged.map((f) => f.name), ["pasted-1.png", "pasted-2.png", "pasted-3.jpg"],
    "three chips all reading image.png would leave no way to tell which is which");
});

test("a non-image file keeps the name it was copied with", () => {
  const pdf = new File([new Uint8Array([1])], "vendor-policy.pdf", { type: "application/pdf" });
  const { staged } = paste({ files: [pdf] });
  assert.deepEqual(staged.map((f) => f.name), ["vendor-policy.pdf"],
    "renaming a real file would throw away the one thing that says what it is");
});

test("the affordance is discoverable — the paperclip says paste works", () => {
  const btn = UI.match(/id="attachBtn"[^>]*/)[0];
  assert.match(btn, /paste/i, "a capability nobody is told about is a capability nobody uses");
});
