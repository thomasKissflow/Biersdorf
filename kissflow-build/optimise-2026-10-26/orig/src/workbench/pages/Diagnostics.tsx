// Diagnostics #/diagnostics (WORKBENCH-DESIGN.md §9): NEVER writes. Every probe is independent, with a 15 s timeout,
// and reports the SHAPE of the answers (envelopes, keys, field coverage, step-key candidates, Table:: keys): the facts
// only a live session can show (§13.2). "Copy diagnostics JSON" redacts people by default; "Copy as read-back JSON"
// holds ids only (§4.4).
import { Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Card, CardHeader, Mono, PageHeader } from "@/components/ui/primitives";
import { Checkbox } from "@/components/ui/form";
import { EmptyState, KeyValue, Table, Td, Tr } from "@/components/ui/data";
import { Button } from "@/components/ui/primitives";
import { APP_ID, SPEC, allSteps, formFlows, headerFields, processFlows, roleOf, type FlowId } from "../schema";
import { ADDITIONAL_PART_RAISE, SCOPE_EXTENDED_OUTCOME } from "../domain/flags";
import { roleName, skipAdminRung } from "../kf/app";
import { envelopeOf, errorText, rowsOf, type KfData } from "../kf/sdk";
import { BUILD, SDK_VERSION } from "../build";
import { useWorkbenchContext } from "../data/hooks";
import { STEP_KEYS } from "../data/map";
import { activityKey } from "../data/session";
import { progressActivities } from "../data/tasks";
import { CodeText } from "../ui/codes";
import { redactPeople } from "./redact";

const PROBE_MS = 15000;

export interface ListShape {
  ok: boolean;
  text: string;
  envelope?: string;
  rows?: number;
  keys?: string[];
  coverage?: string;
  hasAct?: boolean;
  stepKeys?: string[];
  tableKeys?: string[];
}

/** The shape of a list answer, for one flow. Pure. */
export function describeList(flow: FlowId, body: unknown): ListShape {
  try {
    const rows = rowsOf(body);
    const first = (rows[0] ?? {}) as KfData;
    const keys = Object.keys(first);
    const ids = headerFields(flow).map((f) => f.id);
    const covered = ids.filter((id) => id in first).length;
    const stepKeys = STEP_KEYS.filter((k) => k in first);
    const tableKeys = keys.filter((k) => k.startsWith("Table::"));
    const hasAct = rows.length ? rows.every((r) => typeof r._activity_instance_id === "string" && !!r._activity_instance_id) : undefined;
    return {
      ok: true,
      envelope: envelopeOf(body),
      rows: rows.length,
      keys,
      coverage: rows.length ? `${covered}/${ids.length} fields` : undefined,
      hasAct,
      stepKeys,
      tableKeys,
      text: [`${rows.length} row${rows.length === 1 ? "" : "s"}`, envelopeOf(body), rows.length ? `${covered}/${ids.length} fields on a row` : ""].filter(Boolean).join(" · "),
    };
  } catch (e) {
    return { ok: false, text: errorText(e) };
  }
}

const pending: ListShape = { ok: true, text: "checking…" };

interface ProcProbe {
  mine: ListShape;
  tasks: ListShape;
  admin: ListShape;
  participated: ListShape;
  item: ListShape;
  progress: ListShape;
}

/**
 * Builder-only (F-02, UX-02): a user without the builder signal (kf.app.getRoles answers) gets a short card and NO
 * probe runs. The signal is [unverified] (it may answer every user in a Development account), so the page itself also
 * carries no internal doc or test references.
 */
export function Diagnostics() {
  const { isBuilder, builderProbed } = useWorkbenchContext();
  if (!isBuilder)
    return (
      <div className="p-4 sm:p-6" data-testid="wb-diag-restricted">
        <Card>
          <EmptyState title={builderProbed ? "Not available" : "Checking access…"}>{builderProbed ? "This page is for Workbench administrators." : null}</EmptyState>
        </Card>
      </div>
    );
  return <DiagnosticsPage />;
}

function DiagnosticsPage() {
  const ctx = useWorkbenchContext();
  const { kf, client, me, heldRoles, caps, capsAll, isBuilder, builderRoles, lens, session, queue, pending: sheets, readyMs } = ctx;
  const [includePeople, setIncludePeople] = useState(false);
  const [procs, setProcs] = useState<Partial<Record<FlowId, ProcProbe>>>({});
  const [forms, setForms] = useState<Partial<Record<FlowId, ListShape>>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const call = <T,>(fn: () => Promise<T>) => client.call(fn, PROBE_MS);
    const set = (flow: FlowId, k: keyof ProcProbe, v: ListShape) =>
      alive && setProcs((p) => ({ ...p, [flow]: { ...(p[flow] ?? { mine: pending, tasks: pending, admin: pending, participated: pending, item: pending, progress: pending }), [k]: v } }));
    for (const flow of processFlows()) {
      const p = client.process(flow);
      const page = { pageNumber: 1, pageSize: 50 };
      void call(() => p.getMyItems({ ...page, status: "all" })).then((b) => set(flow, "mine", describeList(flow, b)), (e) => set(flow, "mine", { ok: false, text: `error: ${errorText(e)}` }));
      void call(() => p.getMyTasksItems(page)).then(
        async (b) => {
          set(flow, "tasks", describeList(flow, b));
          let rows: KfData[] = [];
          try {
            rows = rowsOf(b);
          } catch {
            rows = [];
          }
          const first = rows.find((r) => typeof r._activity_instance_id === "string");
          if (!first) {
            set(flow, "item", { ok: true, text: "no task to read" });
            set(flow, "progress", { ok: true, text: "no task to read" });
            return;
          }
          const id = String(first._id);
          void call(() => p.getItem({ instanceId: id, activityInstanceId: String(first._activity_instance_id) })).then(
            (it) => set(flow, "item", { ...describeList(flow, [it]), text: `keys: ${Object.keys((it ?? {}) as object).filter((k) => k.startsWith("_") || k.startsWith("Table::")).join(", ")}` }),
            (e) => set(flow, "item", { ok: false, text: `error: ${errorText(e)}` }),
          );
          if (typeof p.getProgress !== "function") set(flow, "progress", { ok: false, text: "getProgress not available" });
          else
            void call(() => p.getProgress!({ instanceId: id })).then(
              (pr) => {
                const acts = progressActivities(pr);
                set(flow, "progress", { ok: true, text: `${envelopeOf(pr)} · ${acts.length} activities parsed${acts[0] ? ` · e.g. ${acts[0].name}` : ""} [shape unverified]` });
              },
              (e) => set(flow, "progress", { ok: false, text: `error: ${errorText(e)}` }),
            );
        },
        (e) => set(flow, "tasks", { ok: false, text: `error: ${errorText(e)}` }),
      );
      if (skipAdminRung(!!lens, caps, flow)) set(flow, "admin", { ok: true, text: "skipped: the View as lens has no flow Admin (rung 1 off)" });
      else if (typeof p.getAdminItems !== "function") set(flow, "admin", { ok: false, text: "getAdminItems not available" });
      else void call(() => p.getAdminItems!(page)).then((b) => set(flow, "admin", describeList(flow, b)), (e) => set(flow, "admin", { ok: false, text: `error: ${errorText(e)}` }));
      void call(() => p.getParticipatedItems(page)).then((b) => set(flow, "participated", describeList(flow, b)), (e) => set(flow, "participated", { ok: false, text: `error (expected for this list): ${errorText(e)}` }));
    }
    for (const flow of formFlows())
      void call(() => client.dataform(flow).getItems({ pageNumber: 1, pageSize: 50 })).then(
        (b) => alive && setForms((f) => ({ ...f, [flow]: describeList(flow, b) })),
        (e) => alive && setForms((f) => ({ ...f, [flow]: { ok: false, text: `error: ${errorText(e)}` } })),
      );
    return () => {
      alive = false;
    };
  }, [client, caps, lens]);

  const containerOk = kf.app._id === APP_ID;
  const tasks = ctx.tasksState.all;
  const steps = allSteps().filter((s) => s.kind === "UserTask" || s.kind === "Start");

  const readback = useMemo(() => {
    const roles: Record<string, string> = {};
    for (const r of kf.user.AppRoles ?? []) if (roleOf(r)) roles[r.Name] = r._id;
    for (const r of builderRoles?.roles ?? []) if (roleOf(r)) roles[r.Name] = r._id;
    const stepsOut: Record<string, Record<string, string>> = {};
    for (const [k, act] of session.activityIds) {
      const [flow, ...name] = k.split("|");
      (stepsOut[flow] ??= {})[name.join("|")] = act;
    }
    const childModels: Record<string, Record<string, string>> = {};
    for (const [flow, probe] of Object.entries({ ...procs, ...Object.fromEntries(Object.entries(forms).map(([f, s]) => [f, { list: s }])) }))
      for (const s of Object.values(probe as unknown as Record<string, ListShape>)) for (const t of s.tableKeys ?? []) (childModels[flow] ??= {})[t.replace(/^Table::/, "")] = t.replace(/^Table::/, "");
    return { roles, steps: stepsOut, childModels };
  }, [kf, builderRoles, session.activityIds, procs, forms]);

  const diagnostics = () => ({
    connection: { readyMs, account: kf.account._id, appId: kf.app._id ?? null, expectedAppId: APP_ID, containerOk, componentId: kf.context?._id ?? null, build: BUILD, spec: SPEC, sdk: SDK_VERSION },
    user: {
      name: me.Name,
      email: me.Email,
      _id: me._id,
      appRoles: (kf.user.AppRoles ?? []).map((r) => ({ id: r._id, role: r.Name })),
      matched: heldRoles.held,
      unmatched: heldRoles.unknown,
      warnings: heldRoles.warnings,
      builderSession: isBuilder,
      getRoles: builderRoles ? { roles: builderRoles.roles.map((r) => ({ id: r._id, role: r.Name })), currentRoles: builderRoles.currentRoles.map((r) => ({ id: r._id, role: r.Name ?? "" })) } : null,
      lens,
      caps: { roles: [...caps.roles], reviewerDepts: caps.reviewerDepts, rmesEditorOf: [...caps.rmesEditorOf], isCaseAdmin: caps.isCaseAdmin },
    },
    processes: procs,
    forms,
    policies: Object.fromEntries(ctx.policies),
    ladder: { rungs: Object.fromEntries(session.rungs), adminRefused: [...session.adminRefused], viewerRoute: "disabled (no viewer route known)", viewerProven: session.viewerRouteProven },
    flags: { additionalPartRaise: ADDITIONAL_PART_RAISE, scopeExtendedOutcome: SCOPE_EXTENDED_OUTCOME },
    steps: steps.map((s) => ({ step: s.irId, name: s.name, serverActivityId: s.serverActivityId ?? session.activityIds.get(activityKey(s.flow, s.name)) ?? null, tasks: tasks.filter((t) => t.step === s.irId).map((t) => ({ key: t.key, evidence: t.evidence })) })),
    unresolvedTasks: tasks.filter((t) => !t.step).map((t) => t.key),
    taskRowKeys: Object.fromEntries([...session.taskRowKeys].map(([f, k]) => [f, [...k]])),
    writePath: { kwb: Object.fromEntries(session.kwb), sendBack: session.sendBack, openForm: session.openForm, uncertain: queue.uncertainItems().map(([k, v]) => ({ item: k, since: v.since, kind: v.kind })), notKept: session.notKept, retries: session.retries, pendingSheets: sheets.keys() },
  });

  const copy = async (what: "diag" | "readback") => {
    const obj = what === "diag" ? redactPeople(diagnostics(), { includePeople, knownNames: [me.Name], knownEmails: [me.Email] }) : readback;
    const text = JSON.stringify(obj, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what === "diag" ? "Diagnostics copied." : "Read-back JSON copied.");
    } catch {
      setCopied("Copy is blocked in this frame. The JSON is shown below: select it by hand.");
      setShown(text);
    }
  };

  const probeCell = (s: ListShape | undefined) => (
    <span className={s && !s.ok ? "text-bad" : "text-ink-2"}>
      {s?.text ?? "checking…"}
      {s?.stepKeys?.length ? <span className="block text-[12px] text-ink-3">step keys: {s.stepKeys.join(", ")}</span> : null}
      {s?.hasAct !== undefined ? <span className="block text-[12px] text-ink-3">_activity_instance_id on every row: {s.hasAct ? "yes" : "NO"}</span> : null}
      {s?.tableKeys?.length ? <span className="block text-[12px] text-ink-3">{s.tableKeys.join(", ")}</span> : null}
    </span>
  );

  return (
    <div className="space-y-4 p-4 sm:p-6" data-testid="wb-diag">
      <PageHeader title="Diagnostics" subtitle="What Kissflow gives this Workbench and how each CIQ flow answers for you. Read-only: nothing here writes." />
      <div className="flex flex-wrap items-center gap-2">
        <span data-testid="wb-diag-include-people">
          <Checkbox checked={includePeople} onChange={setIncludePeople} label="include names and e-mails" />
        </span>
        <Button icon={<Copy size={14} />} onClick={() => copy("diag")} data-testid="wb-diag-copy">
          Copy diagnostics JSON
        </Button>
        <Button icon={<Copy size={14} />} onClick={() => copy("readback")} data-testid="wb-diag-copy-readback">
          Copy as read-back JSON
        </Button>
      </div>
      {copied && <p role="status" className="text-[13px] text-ink-2">{copied}</p>}
      {shown && <pre className="max-h-64 overflow-auto rounded-lg bg-surface-2 p-3 text-[12px]">{shown}</pre>}

      <Card>
        <CardHeader title="Connection" />
        <div className="px-5 pb-5">
          <KeyValue
            items={[
              { k: "Connected in", v: `${readyMs} ms` },
              { k: "Account", v: <Mono>{kf.account._id}</Mono> },
              {
                k: "Container",
                v: (
                  <span data-testid="wb-diag-container" className={containerOk ? "text-ok" : "font-semibold text-bad"}>
                    {kf.app._id ?? "(no app id in the handshake)"} {containerOk ? "✓" : `≠ ${APP_ID}: every write is refused`}
                  </span>
                ),
              },
              { k: "Component", v: <Mono>{kf.context?._id ?? "—"}</Mono> },
              { k: "Build", v: <Mono><span data-testid="wb-diag-build">{BUILD}</span></Mono> },
              { k: "Spec", v: <Mono>{`rev ${SPEC.revision} · ${String(SPEC.sha256).slice(0, 16)}…`}</Mono> },
              { k: "SDK", v: <Mono>{SDK_VERSION}</Mono> },
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="User and roles" />
        <div className="space-y-3 px-5 pb-5 text-[13.5px]" data-testid="wb-diag-roles">
          <KeyValue
            items={[
              { k: "User", v: `${me.Name} · ${me.Email} · ${me._id}` },
              { k: "AppRoles", v: (kf.user.AppRoles ?? []).map((r) => `${r.Name} (${r._id})`).join(", ") || "none" },
              { k: "Matched CIQ roles", v: heldRoles.held.map(roleName).join(", ") || "none" },
              { k: "Unmatched names", v: heldRoles.unknown.join(", ") || "none" },
              { k: "Case Admin needs RMM", v: heldRoles.warnings.join(" ") || "ok" },
              { k: "Builder session (getRoles answers)", v: isBuilder ? `yes · ${builderRoles?.roles.length ?? 0} roles, current ${builderRoles?.currentRoles.length ?? 0}` : "no" },
              { k: "View as", v: lens ? roleName(lens) : "All my roles" },
              { k: "Capabilities (after the lens)", v: `${[...caps.roles].map(roleName).join(", ")} · reviewer depts ${caps.reviewerDepts.join(",") || "—"} · RMES editor ${[...caps.rmesEditorOf].join(",") || "—"} · Case Admin ${caps.isCaseAdmin ? "yes" : "no"}` },
              { k: "Capabilities (all roles)", v: [...capsAll.roles].map(roleName).join(", ") },
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Processes" subtitle="Page 1 of each list. Participated is expected to fail." />
        <div className="overflow-x-auto px-2 pb-3">
          <Table head={["Flow", "My items", "My tasks", "Admin list", "Participated", "One task getItem", "getProgress"]} dense>
            {processFlows().map((f) => {
              const p = procs[f];
              return (
                <Tr key={f}>
                  <Td>
                    <span data-testid={`wb-diag-flow-${f}`}>
                      <Mono>{f}</Mono>
                    </span>
                  </Td>
                  <Td>{probeCell(p?.mine)}</Td>
                  <Td>{probeCell(p?.tasks)}</Td>
                  <Td>{probeCell(p?.admin)}</Td>
                  <Td>{probeCell(p?.participated)}</Td>
                  <Td>{probeCell(p?.item)}</Td>
                  <Td>{probeCell(p?.progress)}</Td>
                </Tr>
              );
            })}
          </Table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Forms" subtitle="Page 1 of each Dataform list." />
        <div className="overflow-x-auto px-2 pb-3">
          <Table head={["Form", "getItems (page 1)"]} dense>
            {formFlows().map((f) => (
              <Tr key={f}>
                <Td>
                  <span data-testid={`wb-diag-flow-${f}`}>
                    <Mono>{f}</Mono>
                  </span>
                </Td>
                <Td>{probeCell(forms[f])}</Td>
              </Tr>
            ))}
          </Table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Read ladder, policy and flags" />
        <div className="px-5 pb-5">
          <KeyValue
            cols={1}
            items={[
              { k: "Rung per flow (last read)", v: [...session.rungs].map(([f, q]) => `${f}: ${q}`).join(" · ") || "no list read yet" },
              { k: "Admin list refused this session", v: [...session.adminRefused].join(", ") || "none" },
              { k: "Viewer route (rung 2)", v: <span>disabled (no viewer route available) · proven this session: {session.viewerRouteProven ? "yes" : "no"}</span> },
              {
                k: "Counts policy",
                v: ctx.policies.size ? [...ctx.policies].map(([rel, p]) => `${rel}: ${p.policy} (${p.source})`).join(" · ") : "no pinned release read yet; absent or unreadable Settings → fail-closed",
              },
              { k: "additionalPartRaise", v: <Badge>{String(ADDITIONAL_PART_RAISE)}</Badge> },
              { k: "scopeExtendedOutcome", v: <Badge>{String(SCOPE_EXTENDED_OUTCOME)}</Badge> },
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Steps and held tasks" subtitle="Server activity ids are null until read-back; learned ids come from rows with activity-level evidence." />
        <div className="overflow-x-auto px-2 pb-3">
          <Table head={["Step", "Name", "Activity id", "Held tasks (evidence)", "Field saves at step"]} dense>
            {steps.map((s) => (
              <Tr key={s.irId}>
                <Td>
                  <Mono>{s.irId}</Mono>
                </Td>
                <Td>
                  <CodeText text={s.name} />
                </Td>
                <Td>
                  <Mono>{s.serverActivityId ?? session.activityIds.get(activityKey(s.flow, s.name)) ?? "—"}</Mono>
                </Td>
                <Td>
                  <CodeText
                    text={
                      tasks
                        .filter((t) => t.step === s.irId)
                        .map((t) => `${t.title} (${t.evidence})`)
                        .join("; ") || "—"
                    }
                  />
                </Td>
                <Td>{session.kwb.get(s.irId) ?? "untested"}</Td>
              </Tr>
            ))}
          </Table>
          {tasks.some((t) => !t.step) && <p className="px-3 pt-2 text-[13px] text-warn">Unidentified steps: {tasks.filter((t) => !t.step).map((t) => t.title).join("; ")}</p>}
          <p className="px-3 pt-2 text-[12.5px] text-ink-3">
            `_` keys seen on task rows: {[...session.taskRowKeys].map(([f, k]) => `${f}: ${[...k].join(", ")}`).join(" · ") || "none yet"}
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Write path this session" />
        <div className="px-5 pb-5">
          <KeyValue
            cols={1}
            items={[
              { k: "Field saves per step", v: [...session.kwb].map(([s, v]) => `${s}: ${v}`).join(" · ") || "untested" },
              { k: "Send-back", v: session.sendBack },
              { k: "Open task form", v: `${session.openForm.presses} presses · ${session.openForm.answered} answered · ${session.openForm.timedOut} timed out · ${session.openForm.refused} refused` },
              { k: "Uncertain items", v: queue.uncertainItems().map(([k]) => k).join(", ") || "none" },
              { k: "Not kept / retries", v: `${session.notKept} / ${session.retries}` },
              { k: "Stored pending sheets", v: sheets.keys().join(", ") || "none" },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}
