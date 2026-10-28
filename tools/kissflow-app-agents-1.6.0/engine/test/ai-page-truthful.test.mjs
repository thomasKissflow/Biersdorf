// ai-page-truthful.test.mjs — an AI dashboard's result must track whether it actually went LIVE, not
// merely whether it was created (#13). A page whose publish returns >=300 exists only as a draft; the
// role would land on a blank/unavailable page. Reporting it ok:true is a lie the apply then acts on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateAppPagesAI } from "../ai-page-builder.mjs";

// A URL-routing fake Kissflow client. Every page creates/previews/generates fine; ONLY the publish of
// the page whose id carries `failFor` returns 500 — the created-but-not-published case.
function fakeClient({ failFor }) {
  return {
    acc: "Ac", host: "dev-test",
    call: async (method, url, body) => {
      if (method === "GET" && /\/application\/[^/]+\/flow\?/.test(url)) return { status: 200, body: [] };        // empty flow catalog
      if (/\/page\/create\?/.test(url)) return { status: 200, body: { message: { flow_id: "job1" } } };
      if (/\/page\/preview\?/.test(url)) return { status: 200, body: { Root: "r1", r1: { Kind: "Component" } } }; // ready immediately
      if (/\/page\/generate\?/.test(url)) return { status: 200, body: { message: { _id: `pid_${body?.Name || "x"}` } } };
      if (/\/page\/[^/]+\/publish$/.test(url)) {
        const failed = failFor && url.includes(failFor);
        return { status: failed ? 500 : 200, body: {} };
      }
      if (method === "GET" && /\/application\/[^/]+\/draft$/.test(url)) return { status: 200, body: {} };         // no Root → skip nav wiring, isolate per-page ok
      return { status: 200, body: {} };
    },
  };
}

const IR = { app: { name: "Truth Test" }, roles: [{ name: "Alpha" }, { name: "Beta" }] };
const roleIdByName = { Alpha: "ra", Beta: "rb" };

test("#13 a page that publishes is ok:true; one that only drafts is ok:false with a reason", async () => {
  const c = fakeClient({ failFor: "Beta Dashboard" });   // Beta's publish returns 500
  const { results, failed } = await generateAppPagesAI(c, "Ac", "App1", IR, { roleIdByName });

  const alpha = results.find((r) => r.role.name === "Alpha");
  const beta = results.find((r) => r.role.name === "Beta");
  assert.equal(alpha.ok, true, "Alpha published → ok");
  assert.equal(alpha.published, true);
  assert.equal(beta.ok, false, "Beta only drafted → NOT ok (was reported ok:true before #13)");
  assert.equal(beta.published, false);
  assert.match(beta.error || "", /publish failed/i, "the failure carries a truthful reason");

  assert.deepEqual(failed.map((r) => r.role.name), ["Beta"], "the failed set is truthful, so the apply can fail");
});

test("#13 when every page publishes, none are reported as failed", async () => {
  const c = fakeClient({ failFor: null });
  const { results, failed } = await generateAppPagesAI(c, "Ac", "App1", IR, { roleIdByName });
  assert.ok(results.every((r) => r.ok === true && r.published === true));
  assert.equal(failed.length, 0);
});
