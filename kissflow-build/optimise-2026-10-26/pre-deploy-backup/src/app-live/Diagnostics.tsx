// Diagnostics of the live app (DESIGN §1.1 P1, §4, §8): who Kissflow says the user is, which read rung served each
// flow for the acting role (the morning tests R-1/R-2 read this table), the load warnings, the writes of this session
// with their hand-offs (and the notes of load-time effects that wrote nothing), the drafts a Mandatory check stopped
// (Send / Discard), the webhook slots and the build stamp. The My items reads list the fields their rows carried (R-1).
// Everything comes from useAppExtras() (LiveAppStore); the page itself calls nothing except Send / Discard.
// Webhook URLs are shown as their host only: a hook URL can carry a token. A relative one (no Kissflow page around the
// frame, write/handoff.ts webhooksOf) goes by the Kissflow API route.
// Production (FE-CLEANUP C26, 22 Oct) has no menu to it: testers come from the shell's Unsent items banner or its
// Details link. So it shows first the unsent items (#drafts; their errors in plain words), then what could not be
// loaded in plain words, and folds everything else away under "Technical details (for support)": Kissflow's raw
// warnings too. Dev shows every card unfolded, plus the mapper's notes.
import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Badge, Button, Card, CardHeader, EmptyState, KeyValue, Mono, PageHeader, Table, Td, Tr } from "@/components/ui";
import { PERSONA_BY_ID } from "@/domain/catalog";
import { fmtDateTime } from "@/domain/selectors";
import { errorText } from "@/portal/kf/sdk";
import { useAppEnv } from "./appEnv";
import { BUILD } from "./build";
import { useAppExtras, type LiveAppExtras } from "./extras";
import { APP_ID } from "./ids";
import type { HandoffCode } from "./shared/handoff";
import type { FlowKey, ReadReport, Rung } from "./types";
import { CASE_NOT_LISTED, DIAG_ALL_LOADED, DIAG_KEPT, DIAG_NOT_LOADED, DIAG_SUPPORT, UNSENT_ITEMS, plainError } from "./userText";

/** The flows as their Kissflow names, in read order. */
const FLOW_NAME: Record<FlowKey, string> = {
  audit: "CIQ Audit Event",
  config: "CIQ Config Version",
  case: "CIQ Case",
  review: "CIQ Review",
  op: "CIQ Open Point",
  note: "CIQ Internal Note",
  rmesSAF: "CIQ RMES Safety",
  rmesREG: "CIQ RMES Regulatory",
  supplier: "CIQ Supplier",
  scopeRun: "CIQ Scope Run",
};

const RUNG_LABEL: Record<Rung, string> = {
  admin: "All items (admin)",
  tasks: "My tasks",
  mine: "My items",
  byId: "Item by id",
  form: "Form list",
  snapshot: "History snapshots",
  skipped: "Skipped for this role",
};

/** Every hand-off code (a Record, so a code added to shared/handoff.ts must be added here to compile). */
const HANDOFF_LABEL: Record<HandoffCode, string> = {
  "case.started": "Case started (the supplier's request)",
  "op.round": "New round of an open point",
  "op.edited": "Open question edited",
  "op.closed": "Open point closed",
  "release.requested": "Final release requested",
  "review.reopened": "Review reopened during the release",
  "change.received": "Change report received",
  "case.cancelled": "Case cancelled",
  "case.reactivated": "Case reactivated",
  "history.updated": "Questions history",
  "scope.extended": "Section added",
  "case.contacts": "Case contacts changed",
};
const HANDOFF_CODES = Object.keys(HANDOFF_LABEL) as HandoffCode[];

const hostOf = (url: string): string => {
  if (/^\/(?!\/)/.test(url)) return "Kissflow API route";
  try {
    return new URL(url).host || "no host";
  } catch {
    return "not a valid URL";
  }
};

const personaLabel = (id: string) => PERSONA_BY_ID[id]?.label ?? id;

/** The rung that served each flow: the first successful read, in the order they were tried. */
function servedBy(reads: ReadReport[]): Map<FlowKey, ReadReport> {
  const out = new Map<FlowKey, ReadReport>();
  for (const r of reads) if (r.ok && r.rung !== "skipped" && !out.has(r.flow)) out.set(r.flow, r);
  return out;
}

export function Diagnostics() {
  const x = useAppExtras();
  const { env } = useAppEnv();
  const { hash } = useLocation();
  // the shell's "Send or discard" opens #drafts (A1): the card in view
  useEffect(() => {
    if (hash === "#drafts") document.getElementById("drafts")?.scrollIntoView?.({ block: "start" });
  }, [hash, x?.drafts.length]);
  if (!x)
    return (
      <Card>
        <EmptyState title="Diagnostics are not available yet">The app has not finished loading from Kissflow. Reload and open this page again.</EmptyState>
      </Card>
    );
  if (env === "prod")
    return (
      <div className="space-y-6" data-testid="diagnostics" data-env="prod">
        <PageHeader eyebrow="CIQ Digital" title="Diagnostics" subtitle="For support: what CIQ Digital could read and save in this session." />
        <DraftsCard x={x} prod />
        <LoadSummaryCard x={x} />
        <details className="rounded-xl border border-line bg-surface" data-testid="diag-technical">
          <summary className="cursor-pointer px-4 py-3 text-[13.5px] font-semibold text-ink">Technical details (for support)</summary>
          <div className="space-y-6 px-4 pb-4">
            <SessionCard x={x} />
            <ReadsCard reads={x.reads} />
            <WarningsCard warnings={x.warnings} />
            <NotesCard notes={x.notes ?? []} />
            <WritesCard writeLog={x.writeLog} />
            <WebhooksCard webhooks={x.webhooks} />
          </div>
        </details>
      </div>
    );
  return (
    <div className="space-y-6" data-testid="diagnostics" data-env={env}>
      <PageHeader eyebrow="CIQ Digital" title="Diagnostics" subtitle="What Kissflow gives this app for you: your roles, how each process and form was read, the writes of this session and their hand-offs." />
      <SessionCard x={x} />
      <ReadsCard reads={x.reads} />
      <WarningsCard warnings={x.warnings} />
      <NotesCard notes={x.notes ?? []} />
      <DraftsCard x={x} />
      <WritesCard writeLog={x.writeLog} />
      <WebhooksCard webhooks={x.webhooks} />
    </div>
  );
}

function SessionCard({ x }: { x: LiveAppExtras }) {
  const { identity: id, acting } = x;
  const other = [id.caseAdmin && "Case administrator", id.integration && "Integration service", ...id.unknownRoles].filter(Boolean) as string[];
  return (
    <Card>
      <CardHeader
        title="Session"
        subtitle={x.loadedAt ? `Data read ${fmtDateTime(x.loadedAt)}` : "Not loaded yet"}
        action={x.containerOk ? <Badge tone="ok" dot>Live</Badge> : <Badge tone="bad" dot>Not saving</Badge>}
      />
      <div className="p-4">
        <KeyValue
          items={[
            { k: "Signed in as", v: `${id.name || "?"}${id.email ? ` · ${id.email}` : ""}` },
            { k: "Kissflow user", v: <Mono>{id.kfUserId}</Mono> },
            { k: "Acting as", v: <span data-testid="diag-acting" data-persona={acting.personaId}>{acting.persona.label}</span> },
            { k: "User on the screens", v: <Mono>{acting.me.id}</Mono> },
            { k: "CIQ roles held", v: id.personas.length ? id.personas.map(personaLabel).join(" · ") : "none" },
            { k: "Kissflow roles (as sent)", v: <Mono>{JSON.stringify(id.roles.map((r) => r.name))}</Mono> },
            { k: "Other roles", v: other.length ? other.join(" · ") : "none" },
            {
              k: "App",
              v: x.containerOk ? <Mono>{APP_ID}</Mono> : <span className="text-bad">This page is not running in {APP_ID}: nothing is saved.</span>,
            },
            {
              k: "Build",
              v: (
                <span data-testid="diag-build">
                  <Mono>{x.build || BUILD}</Mono>
                </span>
              ),
            },
          ]}
        />
      </div>
    </Card>
  );
}

function ReadsCard({ reads }: { reads: ReadReport[] }) {
  const served = servedBy(reads);
  return (
    <Card>
      <CardHeader title="Reads" subtitle="Each process and form, every way it was tried for your role, in order. The first successful read serves the screens; a refused one falls through to the next." />
      {reads.length === 0 ? (
        <p className="p-4 text-[13px] text-ink-3">No reads yet.</p>
      ) : (
        <Table head={["Process or form", "Read", "Result", "Rows", "Time since sent", "Detail"]} dense>
          {reads.map((r, i) => (
            <Tr key={`${r.flow}-${r.rung}-${i}`} data-testid={`diag-read-${r.flow}-${r.rung}`} data-ok={r.ok ? "1" : "0"}>
              <Td className="font-medium">{FLOW_NAME[r.flow] ?? r.flow}</Td>
              <Td>{RUNG_LABEL[r.rung] ?? r.rung}</Td>
              <Td>
                {r.rung === "skipped" ? (
                  <Badge>skipped</Badge>
                ) : r.ok ? (
                  <Badge tone="ok">{served.get(r.flow) === r ? "used" : "ok"}</Badge>
                ) : (
                  <Badge tone="bad">refused</Badge>
                )}
              </Td>
              <Td className="tabular-nums">{r.count}</Td>
              <Td className="tabular-nums">{r.ms} ms</Td>
              <Td className={r.error ? "text-bad" : "text-ink-3"}>
                {r.error ?? ""}
                {/* morning test R-1: the fields a live My items row carries */}
                {r.keys && (
                  <div className="text-ink-3" data-testid={`diag-read-keys-${r.flow}`}>
                    Row fields: <Mono>{r.keys.join(", ") || "none"}</Mono>
                  </div>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function WarningsCard({ warnings }: { warnings: string[] }) {
  return <ListCard title="Warnings" subtitle="What could not be read in full on the last load." items={warnings} testId="diag-warnings" />;
}

/** C26, production: what could not be loaded, in the shell's plain words, the cases left out and what to do. Kissflow's
 *  own warnings (flow names, error codes, item ids) are in the Warnings card of the technical details. */
function LoadSummaryCard({ x }: { x: LiveAppExtras }) {
  const some = x.warnings.length > 0;
  return (
    <Card data-testid="diag-load-summary">
      <CardHeader title="What could not be loaded" />
      <div className="space-y-1 p-4 text-[13px] text-ink-2">
        <p>{!some ? DIAG_ALL_LOADED : x.keptAt ? DIAG_KEPT(x.keptAt) : DIAG_NOT_LOADED}</p>
        {(x.dropped ?? []).map((code) => (
          <p key={code}>{CASE_NOT_LISTED(code)}</p>
        ))}
        {some && <p className="text-ink-3">{DIAG_SUPPORT}</p>}
      </div>
    </Card>
  );
}

/** The mapper's notes (load.ts LoadedView.notes): odd rows a test script or a hand-made row left, and how they read. */
function NotesCard({ notes }: { notes: string[] }) {
  return <ListCard title="Notes" subtitle="How odd rows were read on the last load (a duplicate key, an unknown value, a withdrawn item)." items={notes} testId="diag-notes" />;
}

function ListCard({ title, subtitle, items, testId }: { title: string; subtitle: string; items: string[]; testId: string }): ReactNode {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {items.length === 0 ? (
        <p className="p-4 text-[13px] text-ink-3">None.</p>
      ) : (
        <ul className="list-disc space-y-1 px-8 py-4 text-[13px] text-ink-2" data-testid={testId}>
          {items.map((w, i) => (
            <li key={`${i}-${w}`}>{w}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** A1: the user's own items that reached Kissflow but were not sent on (a failed read-back, Start gate or submit, a
 *  429, a timeout, a refusal: C29). Production shows each by its label, without the Kissflow process and item id. */
function DraftsCard({ x, prod = false }: { x: LiveAppExtras; prod?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});
  const act = async (itemId: string, fn: (id: string) => Promise<void>) => {
    setBusy(itemId);
    setConfirm(null);
    setError((e) => ({ ...e, [itemId]: "" }));
    try {
      await fn(itemId);
    } catch (e) {
      setError((m) => ({ ...m, [itemId]: prod ? plainError(e) : errorText(e) }));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card id="drafts" data-testid="diag-drafts">
      <CardHeader title={UNSENT_ITEMS} subtitle="Items that reached Kissflow but were not sent on. Send them, or discard them." />
      {x.drafts.length === 0 ? (
        <p className="p-4 text-[13px] text-ink-3">None.</p>
      ) : (
        <Table head={prod ? ["Item", ""] : ["Draft", "Process", "Item", ""]} dense>
          {x.drafts.map((d) => (
            <Tr key={d.itemId} data-testid={`diag-draft-${d.itemId}`}>
              <Td className="font-medium">
                {d.label}
                {error[d.itemId] && <div className="mt-0.5 text-[12px] font-normal text-bad">{error[d.itemId]}</div>}
              </Td>
              {!prod && <Td>{FLOW_NAME[d.flow]}</Td>}
              {!prod && (
                <Td>
                  <Mono>{d.itemId}</Mono>
                </Td>
              )}
              <Td>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => void act(d.itemId, x.sendDraft)} data-testid={`diag-draft-send-${d.itemId}`}>
                    {busy === d.itemId ? "Working…" : "Send"}
                  </Button>
                  {confirm === d.itemId ? (
                    <>
                      <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => void act(d.itemId, x.discardDraft)} data-testid={`diag-draft-discard-confirm-${d.itemId}`}>
                        Discard for good
                      </Button>
                      <Button size="sm" onClick={() => setConfirm(null)}>
                        Keep
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" disabled={busy !== null} onClick={() => setConfirm(d.itemId)} data-testid={`diag-draft-discard-${d.itemId}`}>
                      Discard
                    </Button>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

const STATUS_TONE = { sent: "ok", pending: "warn", failed: "bad" } as const;

function WritesCard({ writeLog }: { writeLog: LiveAppExtras["writeLog"] }) {
  return (
    <Card>
      <CardHeader title="Writes this session" subtitle="Every save sent to Kissflow from this page since it was opened, newest first, with its hand-offs to the supplier portal." />
      {writeLog.length === 0 ? (
        <p className="p-4 text-[13px] text-ink-3">Nothing saved yet.</p>
      ) : (
        <Table head={["When", "Action", "Result", "Hand-offs"]} dense>
          {[...writeLog].reverse().map((w, i) => (
            <Tr key={`${w.at}-${i}`} data-testid="diag-write" data-method={w.method} data-ok={w.ok ? "1" : "0"} data-note={w.note ? "1" : undefined}>
              <Td className="whitespace-nowrap tabular-nums">{fmtDateTime(w.at)}</Td>
              <Td>
                <Mono>{w.method}</Mono>
              </Td>
              <Td>
                {w.note ? <Badge tone="warn">nothing written</Badge> : <Badge tone={w.ok ? "ok" : "bad"}>{w.ok ? "saved" : "failed"}</Badge>}
                {w.message && <div className="mt-0.5 text-[12px] text-ink-2">{w.message}</div>}
                {/* the raw causes production's toast put in plain words */}
                {w.detail && <div className="mt-0.5 text-[12px] text-ink-3" data-testid="diag-write-detail">{w.detail}</div>}
              </Td>
              <Td>
                {w.handoffs.length === 0 ? (
                  <span className="text-ink-3">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {w.handoffs.map((h, k) => (
                      <Badge key={`${h.code}-${k}`} tone={STATUS_TONE[h.status]}>
                        {h.code}: {h.status}
                      </Badge>
                    ))}
                  </div>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function WebhooksCard({ webhooks }: { webhooks: Partial<Record<HandoffCode, string>> }) {
  const configured = HANDOFF_CODES.filter((c) => webhooks[c]).length;
  return (
    <Card>
      <CardHeader
        title="Hand-offs to the supplier portal"
        subtitle={`${configured} of ${HANDOFF_CODES.length} configured in the current settings. Without one, the change is saved here but not passed to the supplier portal; the Writes log shows it as pending.`}
      />
      <Table head={["Hand-off", "Code", "Webhook"]} dense>
        {HANDOFF_CODES.map((c) => (
          <Tr key={c} data-testid={`diag-hook-${c}`} data-configured={webhooks[c] ? "1" : "0"}>
            <Td>{HANDOFF_LABEL[c]}</Td>
            <Td>
              <Mono>{c}</Mono>
            </Td>
            <Td>{webhooks[c] ? <Badge tone="ok">configured · {hostOf(webhooks[c])}</Badge> : <Badge tone="warn">not configured: pending</Badge>}</Td>
          </Tr>
        ))}
      </Table>
    </Card>
  );
}
