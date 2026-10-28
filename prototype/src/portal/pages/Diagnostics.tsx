// Diagnostics: what Kissflow gives this custom UI and how each portal flow answers for the signed-in user. Shown to
// the Admin role. Every probe is read-only, runs on its own with a timeout (one silent call can't block the page), and
// reports the SHAPE of the answers (list envelope, fields on list rows, activity ids on task rows): the facts the
// supplier screens depend on and that only a real session inside Kissflow can show.
// Plan v5: the supplier screens read My tasks per step (the activity filter), never the participated list (it fails
// platform-wide). The S-1 card below runs the one-click WRITE tests on the builder's own ZZT test items.
import { useEffect, useState } from "react";
import { Badge, Card, CardHeader, KeyValue, Mono, PageHeader, Table, Td, Tr } from "@/components/ui";
import { envelopeOf, errorText, rowsOf, type Kf, type KfData } from "../kf/sdk";
import { FLOWS, PORTAL_ID, STEPS, portalRoleOf, type FlowKey, type StepKey } from "../kf/portal";
import { useOptionalPortalMode } from "../mode";
import { BUILD } from "../build";
import { createClient } from "../data/client";
import { S1Tests } from "./S1Tests";

const PROBE_MS = 15000;
function withTimeout<T>(p: Promise<T>, ms = PROBE_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`no answer within ${ms / 1000} s`)), ms)))]).finally(() => clearTimeout(timer));
}

interface Probe {
  text: string;
  ok: boolean;
}
const pending: Probe = { text: "checking…", ok: true };

/** "3 rows · {items,total} · 24 fields" for a list answer. */
function describeList(body: unknown, extra?: (rows: KfData[]) => string): Probe {
  try {
    const rows = rowsOf(body);
    const fields = rows[0] ? Object.keys(rows[0]).length : 0;
    return { text: [`${rows.length} row${rows.length === 1 ? "" : "s"}`, envelopeOf(body), rows[0] ? `${fields} fields on a row` : "", extra?.(rows) ?? ""].filter(Boolean).join(" · "), ok: true };
  } catch (e) {
    return { text: errorText(e), ok: false };
  }
}

async function probe(fn: () => Promise<unknown>, describe: (body: unknown) => Probe = describeList): Promise<Probe> {
  try {
    return describe(await withTimeout(fn()));
  } catch (e) {
    return { text: `error: ${errorText(e)}`, ok: false };
  }
}

interface FlowRow {
  key: string;
  name: string;
  mine: Probe;
  tasks: Probe;
  admin: Probe;
}

/** The lists the supplier screens read: My tasks at each supplier step. */
const LISTS: { key: string; flow: FlowKey; step?: StepKey }[] = [
  { key: "fill", flow: "request", step: "fill" },
  { key: "keep", flow: "request", step: "keep" },
  { key: "respond", flow: "query", step: "respond" },
  { key: "release", flow: "finalRelease", step: "release" },
];

export function Diagnostics({ kf, readyMs }: { kf: Kf; readyMs: number }) {
  const [rows, setRows] = useState<FlowRow[]>([]);
  const [apiList, setApiList] = useState<Probe>(pending);
  const [devRoles, setDevRoles] = useState<Probe>(pending);
  // the role the UI acts in now (after a dev role switch it is no longer the handshake's); outside the provider, the handshake's
  const mode = useOptionalPortalMode();
  const role = mode?.role ?? portalRoleOf(kf);
  const [client] = useState(() => createClient(kf));

  useEffect(() => {
    let alive = true;
    void probe(() => kf.api(`/flow/2/${kf.account._id}/process/?_application_id=${PORTAL_ID}&page_number=1&page_size=50`, { method: "GET" }), (b) => describeList(b)).then((p) => alive && setApiList(p));
    void probe(
      async () => (kf.app.getRoles ? kf.app.getRoles() : undefined),
      (r) => ({ text: r ? `available (builder session): ${(r as { roles?: { Name: string }[] }).roles?.map((x) => x.Name).join(", ") ?? "?"}` : "not available (published page)", ok: true }),
    ).then((p) => alive && setDevRoles({ ...p, ok: true }));

    const initial = LISTS.map((l) => ({ key: l.key, name: `${FLOWS[l.flow].name}${l.step ? ` · ${STEPS[l.step].name}` : ""}`, mine: pending, tasks: pending, admin: pending }));
    setRows(initial);
    const set = (key: string, col: keyof Omit<FlowRow, "key" | "name">, p: Probe) => alive && setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [col]: p } : r)));
    for (const l of LISTS) {
      const proc = kf.app.getProcess(FLOWS[l.flow].id);
      const first = LISTS.find((x) => x.flow === l.flow)!.key === l.key; // per-flow lists once, on the flow's first row
      if (first) void probe(() => proc.getMyItems({ status: "all", pageNumber: 1, pageSize: 50 })).then((p) => set(l.key, "mine", p));
      else set(l.key, "mine", { text: "(see above)", ok: true });
      void probe(
        () => proc.getMyTasksItems({ pageNumber: 1, pageSize: 50, ...(l.step ? { activityId: STEPS[l.step].activity } : {}) }),
        (b) => describeList(b, (rs) => (rs.length ? `activity id on rows: ${rs.every((r) => typeof r._activity_instance_id === "string") ? "yes" : "NO"} · case code on rows: ${rs.every((r) => typeof r.Case_Code === "string") ? "yes" : "NO"}` : "")),
      ).then((p) => set(l.key, "tasks", p));
      if (first && role === "admin" && proc.getAdminItems)
        void probe(
          () => proc.getAdminItems!({ pageNumber: 1, pageSize: 50 }),
          (b) => describeList(b, (rs) => (rs.length ? `current step on rows: ${rs.some((r) => r._current_step) ? "yes" : "no"}` : "")),
        ).then((p) => set(l.key, "admin", p));
      else set(l.key, "admin", { text: "—", ok: true });
    }
    return () => {
      alive = false;
    };
  }, [kf, role]);

  const appId = kf.app?._id;
  const cell = (p: Probe) => <span className={p.ok ? "text-ink-2" : "text-bad"}>{p.text}</span>;
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader eyebrow="CIQ Supplier Portal" title="Diagnostics" subtitle="What Kissflow gives this custom UI, and how each portal process answers for you. Read-only." />
      <Card>
        <CardHeader title="Session" subtitle={`Connected to Kissflow in ${readyMs} ms`} action={<Badge tone="ok" dot>Live</Badge>} />
        <div className="p-4">
          <KeyValue
            items={[
              { k: "Signed in as", v: `${kf.user?.Name ?? "?"}${kf.user?.Email ? ` · ${kf.user.Email}` : ""}` },
              { k: "Portal role (acting)", v: <Badge tone={role === "none" ? "bad" : "brand"}>{role}</Badge> },
              { k: "AppRoles", v: <Mono>{JSON.stringify(mode ? mode.roles.map((r) => r.name || r.id) : (kf.user?.AppRoles ?? []).map((r) => r.Name))}</Mono> },
              { k: "Account", v: <Mono>{kf.account?._id ?? "?"}</Mono> },
              { k: "Container", v: appId ? <span className={appId === PORTAL_ID ? "" : "text-bad"}><Mono>{appId}</Mono>{appId === PORTAL_ID ? "" : ` (expected ${PORTAL_ID})`}</span> : "not reported" },
              { k: "kf.api (list portal processes)", v: cell(apiList) },
              { k: "kf.app.getRoles (dev only)", v: cell(devRoles) },
              { k: "File upload", v: <UploadProbe kf={kf} /> },
              { k: "Build", v: <Mono>{BUILD}</Mono> },
            ]}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Supplier task lists" subtitle="My tasks at each supplier step (the activity filter the supplier screens use): first page (50 rows), its shape, and what list rows carry. If the activity filter is ignored, every row of a process shows the same count." />
        <Table head={["Process · step", "My items", "My tasks at this step", "All items (admin)"]}>
          {rows.map((r) => (
            <Tr key={r.key}>
              <Td className="font-medium">{r.name}</Td>
              <Td>{cell(r.mine)}</Td>
              <Td>{cell(r.tasks)}</Td>
              <Td>{cell(r.admin)}</Td>
            </Tr>
          ))}
        </Table>
      </Card>
      <S1Tests kf={kf} client={client} />
    </div>
  );
}

/** Uploads a 1-byte text file on request, to show whether this portal accepts uploads and what Kissflow returns (the
 *  SDK always defines uploadFile, so its presence proves nothing). The file is stored but attached to nothing. */
function UploadProbe({ kf }: { kf: Kf }) {
  const [out, setOut] = useState<Probe | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const file = new File(["x"], "ciq-portal-upload-test.txt", { type: "text/plain" });
    setOut(await probe(async () => (kf.client?.uploadFile ? kf.client.uploadFile(file, file.name) : Promise.reject(new Error("uploadFile is not offered here"))), (meta) => (meta && typeof meta === "object" ? { text: `stored · answered with ${JSON.stringify(meta).slice(0, 220)}`, ok: true } : { text: `no file metadata returned (${String(meta)})`, ok: false })));
    setBusy(false);
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className="rounded-md border border-line px-2 py-0.5 text-[12.5px] font-medium text-brand hover:bg-surface-2 disabled:opacity-60" disabled={busy} onClick={() => void run()}>
        {busy ? "Uploading…" : "Test upload (1-byte file)"}
      </button>
      {out && <span className={out.ok ? "text-ink-2" : "text-bad"}>{out.text}</span>}
    </span>
  );
}
