// Spike S-1 (plan v5 §14): can a REAL portal user write through the SDK? One click per question, run by the signed-in
// builder (Thomas) on his own tasks, through exactly the calls the supplier screens use (data/client.ts). Each test
// shows PASS or FAIL with Kissflow's own error text.
// Safety: a test only ever touches an item whose Case_Code starts with "ZZT-" (checked again on the full read, right
// before any write). Tests 4 and 5 move an item forward for good, so they ask first.
import { FlaskConical, Play, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardHeader, Mono, Modal, Select } from "@/components/ui";
import { STEPS, UPLOADS_TABLE, FILES_FIELD, type FlowKey, type StepKey } from "../kf/portal";
import { errorText, kfDateTime, type Kf } from "../kf/sdk";
import type { PortalClient } from "../data/client";
import { attachmentsOf } from "../data/map";
import { childRows, num, str, type RawItem } from "../data/raw";

export const TEST_PREFIX = "ZZT-";

interface Candidate {
  flow: FlowKey;
  step: StepKey;
  id: string;
  act: string;
  code: string;
}

interface Result {
  state: "running" | "pass" | "fail";
  text: string;
}

interface TestDef {
  n: number;
  title: string;
  what: string;
  steps: StepKey[];
  /** Moves the item forward for good: asks first. */
  final?: boolean;
}

export const S1_TESTS: TestDef[] = [
  { n: 1, title: "Save on the request (updateItem)", what: "Writes Editing_By, Editing_Since and Answers_JSON (unchanged) on a ZZT request you hold, then reads them back.", steps: ["fill", "keep"] },
  { n: 2, title: "Upload and attach to Supplier_Files", what: "kf.client.uploadFile with a 1-byte text file, then Supplier_Files = the current files + the new one, read back.", steps: ["fill", "keep"] },
  { n: 3, title: "Add an Uploads metadata row", what: "Adds a row to CIQP_Request_A00_Uploads through the item's form (initForm → addRow), and if Kissflow doesn't keep it, through the update's Table:: delta; read back.", steps: ["fill", "keep"] },
  { n: 4, title: "Submit “Supplier: fill in the CIQ”", what: "Writes the Completeness_* fields and submits the step on a ZZT request at “fill in the CIQ”. It then sits at “keep the CIQ up to date” for good.", steps: ["fill"], final: true },
  { n: 5, title: "Answer a query", what: "Writes Response_Kind = Answer, Response_Text and Supplier_Responsible_Email on a ZZT query you hold, then submits “Supplier: respond”.", steps: ["respond"], final: true },
];

const flowOfStep = (s: StepKey): FlowKey => STEPS[s].flow as FlowKey;

export function S1Tests({ kf, client }: { kf: Kf; client: PortalClient }) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, Result>>({});
  const [asking, setAsking] = useState<TestDef | null>(null);
  const [lastAttachment, setLastAttachment] = useState<string>("");
  const me = { name: kf.user?.Name ?? "", email: kf.user?.Email ?? "" };

  const load = useCallback(async () => {
    setCandidates(null);
    setListError(null);
    try {
      const out: Candidate[] = [];
      for (const step of ["fill", "keep", "respond"] as StepKey[]) {
        const flow = flowOfStep(step);
        for (const r of await client.listTasks(flow, STEPS[step].activity)) {
          const act = typeof r._activity_instance_id === "string" ? r._activity_instance_id : "";
          if (!act) continue;
          let code = str(r, "Case_Code");
          if (!code) code = str(await client.getFull(flow, r._id, act).catch(() => null) ?? undefined, "Case_Code");
          if (code.startsWith(TEST_PREFIX) && !out.some((c) => c.id === r._id)) out.push({ flow, step, id: r._id, act, code });
        }
      }
      setCandidates(out);
    } catch (e) {
      setListError(errorText(e));
      setCandidates([]);
    }
  }, [client]);
  useEffect(() => void load(), [load]);

  const eligible = (t: TestDef) => (candidates ?? []).filter((c) => t.steps.includes(c.step));
  const chosen = (t: TestDef) => eligible(t).find((c) => c.id === pick[t.n]) ?? eligible(t)[0];

  /** The full item through its task, refused unless it is a ZZT test item. */
  const readTest = async (c: Candidate): Promise<RawItem> => {
    const it = await client.getFull(c.flow, c.id, c.act);
    if (!it) throw new Error("the item could not be read through its task");
    if (!str(it, "Case_Code").startsWith(TEST_PREFIX)) throw new Error(`refused: ${str(it, "Case_Code") || it._id} is not a ${TEST_PREFIX} test item`);
    return it;
  };

  const tests: Record<number, (c: Candidate) => Promise<string>> = {
    1: async (c) => {
      const it = await readTest(c);
      const at = kfDateTime();
      const answers = str(it, "Answers_JSON") || "{}";
      await client.update("request", c.id, c.act, { Editing_By: me.email, Editing_Since: at, Answers_JSON: answers });
      const back = await readTest(c);
      if (str(back, "Editing_By") !== me.email) throw new Error(`read back Editing_By = "${str(back, "Editing_By")}", expected "${me.email}"`);
      if ((str(back, "Answers_JSON") || "{}") !== answers) throw new Error("read back Answers_JSON differs from what was written");
      return `updateItem accepted; Editing_By, Editing_Since (${str(back, "Editing_Since") || "not returned"}) and Answers_JSON read back.`;
    },
    2: async (c) => {
      const it = await readTest(c);
      const meta = await client.uploadFile(new File(["x"], "ciq-s1-probe.txt", { type: "text/plain" }));
      const id = String(meta.id ?? "");
      if (!id) throw new Error(`uploadFile answered without an id: ${JSON.stringify(meta).slice(0, 200)}`);
      const before = attachmentsOf(it);
      await client.update("request", c.id, c.act, { [FILES_FIELD]: [...before, meta] });
      const after = attachmentsOf(await readTest(c));
      if (!after.some((f) => String(f.id ?? "") === id)) throw new Error(`the new file ${id} is not in Supplier_Files after the update (${after.length} file(s) there)`);
      if (after.length < before.length + 1) throw new Error(`Supplier_Files lost files: ${before.length} before, ${after.length} after`);
      setLastAttachment(id);
      return `uploaded ${id}; Supplier_Files now holds ${after.length} file(s), the earlier ones kept.`;
    },
    3: async (c) => {
      await readTest(c);
      const uploadId = `${TEST_PREFIX}S1-${Date.now()}`;
      const row = { Upload_Id: uploadId, Upload_Section_Key: "GEN", Upload_Doc_Kind: "Other", Upload_File_Name: "ciq-s1-probe.txt", Uploaded_By_Email: me.email, Uploaded_At: kfDateTime(), ...(lastAttachment ? { Upload_Attachment_Id: lastAttachment } : {}) };
      const kept = async () => childRows(await readTest(c), UPLOADS_TABLE, "Upload_Id").some((r) => r.Upload_Id === uploadId);
      let formError = "";
      try {
        await client.addChildRow("request", c.id, c.act, UPLOADS_TABLE, row);
        if (await kept()) return `row ${uploadId} added through the item's form (initForm → addRow) and read back.`;
        formError = "the form route answered, but the row was not kept";
      } catch (e) {
        formError = errorText(e);
      }
      await client.update("request", c.id, c.act, { [`Table::${UPLOADS_TABLE}`]: [{ _is_created: true, ...row }] });
      if (await kept()) return `row ${uploadId} added through the update's Table:: delta and read back (the form route failed: ${formError}).`;
      throw new Error(`neither route kept the row. Form route: ${formError}. Table:: delta: accepted, but the row was not read back.`);
    },
    4: async (c) => {
      const it = await readTest(c);
      const at = kfDateTime();
      await client.update("request", c.id, c.act, { Completeness_Confirm: "Confirmed", Completeness_By_Name: me.name, Completeness_By_Email: me.email, Completeness_By_Role: "S-1 test", Completeness_At: at });
      const back = await readTest(c);
      if (str(back, "Completeness_Confirm") !== "Confirmed") throw new Error("Completeness_Confirm was not read back");
      await client.submit("request", c.id, c.act);
      const keep = await client.listTasks("request", STEPS.keep.activity);
      const moved = keep.some((r) => r._id === c.id);
      return `Completeness_* written and read back; submit accepted${moved ? "; the request is now listed at “keep the CIQ up to date”" : "; NOT yet listed at “keep the CIQ up to date” (check the item)"} (Answers_Rev ${num(it, "Answers_Rev") ?? 0}).`;
    },
    5: async (c) => {
      await readTest(c);
      const text = `S-1 probe answer from Diagnostics, ${kfDateTime()}`;
      await client.update("query", c.id, c.act, { Response_Kind: "Answer", Response_Text: text, Supplier_Responsible_Email: me.email });
      const back = await readTest(c);
      if (str(back, "Response_Text") !== text) throw new Error("Response_Text was not read back");
      await client.submit("query", c.id, c.act);
      return "Response_* written and read back; submit of “Supplier: respond” accepted.";
    },
  };

  const run = async (t: TestDef) => {
    const c = chosen(t);
    if (!c) return;
    setResults((r) => ({ ...r, [t.n]: { state: "running", text: `running on ${c.code}…` } }));
    try {
      const text = await tests[t.n](c);
      setResults((r) => ({ ...r, [t.n]: { state: "pass", text: `${c.code}: ${text}` } }));
    } catch (e) {
      setResults((r) => ({ ...r, [t.n]: { state: "fail", text: `${c.code}: ${errorText(e)}` } }));
    }
    if (t.final) void load();
  };

  return (
    <Card data-testid="s1-tests">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <FlaskConical size={16} /> S-1 write tests (real user, SDK)
          </span>
        }
        subtitle={`Runs as ${me.name || "you"} on your own tasks. Only items whose case code starts with ${TEST_PREFIX} are touched.`}
        action={
          <Button size="sm" icon={<RefreshCw size={14} />} onClick={() => void load()}>
            Reload test items
          </Button>
        }
      />
      {listError && <p className="px-5 pb-2 text-[13px] text-bad">Your tasks could not be listed: {listError}</p>}
      <ul className="divide-y divide-line">
        {S1_TESTS.map((t) => {
          const list = eligible(t);
          const res = results[t.n];
          return (
            <li key={t.n} className="grid gap-3 px-5 py-3.5 md:grid-cols-[minmax(0,1fr)_240px_auto] md:items-center" data-testid={`s1-test-${t.n}`}>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-ink">
                  {t.n}. {t.title}
                </p>
                <p className="text-[12.5px] text-ink-3">{t.what}</p>
                {res && (
                  <p className={`mt-1 text-[12.5px] ${res.state === "fail" ? "text-bad" : "text-ink-2"}`} data-testid={`s1-result-${t.n}`} data-state={res.state}>
                    <Badge tone={res.state === "pass" ? "ok" : res.state === "fail" ? "bad" : "info"} dot>
                      {res.state === "pass" ? "PASS" : res.state === "fail" ? "FAIL" : "running"}
                    </Badge>{" "}
                    {res.text}
                  </p>
                )}
              </div>
              <div>
                {candidates === null ? (
                  <span className="text-[12.5px] text-ink-3">Looking for test items…</span>
                ) : list.length ? (
                  <Select aria-label={`Test item for test ${t.n}`} value={chosen(t)?.id ?? ""} onChange={(e) => setPick((p) => ({ ...p, [t.n]: e.target.value }))}>
                    {list.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} · {STEPS[c.step].name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span className="text-[12.5px] text-ink-3">No {TEST_PREFIX} item of yours at {t.steps.map((s) => `“${STEPS[s].name}”`).join(" or ")}.</span>
                )}
              </div>
              <Button size="sm" variant="primary" icon={<Play size={14} />} disabled={!list.length || res?.state === "running"} onClick={() => (t.final ? setAsking(t) : void run(t))} data-testid={`s1-run-${t.n}`}>
                Run
              </Button>
            </li>
          );
        })}
      </ul>
      <Modal
        open={!!asking}
        onClose={() => setAsking(null)}
        title={asking ? `Run test ${asking.n}?` : ""}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              data-testid="s1-confirm"
              onClick={() => {
                const t = asking!;
                setAsking(null);
                void run(t);
              }}
            >
              Run and submit
            </Button>
          </>
        }
      >
        {asking && (
          <p className="text-[13.5px] text-ink-2">
            {asking.what} It submits <Mono>{chosen(asking)?.code}</Mono>, which can't be undone.
          </p>
        )}
      </Modal>
    </Card>
  );
}
