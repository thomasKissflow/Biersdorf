# Builds off the serving instance

**Problem.** A build is a `claude -p` child process owned by the Cloud Run *service* instance, with its
working tree on that instance's in-memory filesystem. Rolling out a new revision kills every build in
flight, and there is no window where that is acceptable — someone is always using it. Storage fixes
(GCS sync, Filestore) preserve the *artifacts*; none of them keep the *process* alive.

**Second problem, discovered while designing the first.** An app's chat is shared: every member of an
app talks in one conversation and reads the whole history. Event fan-out currently lives in one
process's memory (`s.clients`, `s.events`), which only works because `--max-instances 1` forces every
viewer onto the same instance. With several members and more than one replica, two people watching the
same chat see different conversations. The durable event log below is therefore a **correctness**
requirement, not a durability nicety.

---

## Target architecture (GCP)

```
Browser
  │  HTTPS + SSE
  ▼
Cloud Run — control plane (stateless, N replicas, deploy anytime)
  │  auth · app registry · versions · event fan-out · preview reverse-proxy
  ├──────────── Cloud SQL ──────────── metadata · event log · turn queue
  ├──────────── GCS ────────────────── content-addressed artifacts
  ├──────────── Secret Manager ─────── per-app Kissflow creds, Anthropic key
  │
  │  Direct VPC egress → pod IP (VPC-native cluster: pods are routable)
  ▼
GKE — one Pod per SESSION (not per turn, not per user), gVisor, PVC workspace
       agent process · preview port · idle self-termination
```

| Plane | Primitive | Why |
|---|---|---|
| Control plane | Cloud Run | Genuinely right for stateless HTTP — it just has to stop holding session state |
| Execution | GKE, one Pod per session | Lifecycle independent of any deploy; horizontal by default |
| Isolation | GKE Sandbox (gVisor) | The agent writes and runs code. Today every tenant shares one container, one uid, one filesystem, one egress path |
| Workspace | PVC per session | Holds `runs/<slug>` **and** `~/.claude` — without the transcript, `--resume` names something that died with the container |
| Egress | NetworkPolicy per pod | Anthropic + Kissflow + registries + GCS. Enforceable only because sandboxes are per-tenant |
| Identity | Workload Identity, per-app SA | Each sandbox reads only its own app's secrets, writes only its own GCS prefix |
| Event log | Cloud SQL, append-only + LISTEN/NOTIFY | Already running `kf-pg`. Pub/Sub only if fan-out outgrows it |
| Artifacts | GCS, content-addressed | Written *as produced*, so an interrupted build still yields what it made |
| Preview | Cloud Run proxies to the pod IP | Zero lag, no file sync, no upload debounce |

**Pod per session with a generous idle timeout** is the property that makes this good rather than
merely correct. A member working through five turns keeps a warm pod: every turn after the first is
instant. Only a session cold after a long gap pays pod-schedule + PVC-mount, ~10–30 s. The pod
self-terminates when idle; the PVC is retained for pennies.

Deploying the control plane doesn't touch pods. Deploying a new builder image doesn't either — a new
image applies to the next pod created.

### Rejected: Cloud Run Jobs per turn

Considered and dropped. Job executions survive a service rollout, which solves the deploy problem, but
they are per-turn and stateless: they cold-start **every** turn, and need working-tree and transcript
sync to fake the continuity a per-session pod has for free. They also do nothing for tenant isolation
or preview lag. Per-session pods win on all three.

---

## The pieces

### 1. One session core, two event sinks — *done*

`session-core.mjs` owns everything that mutates a session or resolves a path in its run directory:
marker handling, transcript appends, turn bookkeeping, version snapshots. It reaches for no ambient
`emit`; callers inject `{emit, persist, onPreview}`. The in-process host passes SSE fan-out and local
disk; a session pod passes an event-log append. **One copy of the marker semantics, two hosts.**
`driver.mjs` is reused unchanged — it already speaks events and knows nothing about transport.

### 2. Shared chat: authorship and membership — *done*

- Every user message records `author` — a shared transcript rendered unattributed reads as though one
  person said all of it.
- The per-turn `SESSION` block names the speaker, because "what I asked for earlier" is ambiguous when
  several people share a conversation.
- Session routes are gated on app membership at a single choke point. They previously had **no**
  authorization: any signed-in user who knew a session id could read an app's chat, preview and
  blueprint, and post into it; `GET /api/sessions` returned every session in the process.

### 3. Event log — *next*

```sql
CREATE TABLE chat_events (
  session_id text NOT NULL, seq bigint NOT NULL, payload jsonb NOT NULL,
  at timestamptz DEFAULT now(), PRIMARY KEY (session_id, seq)
);
```

`seq` replaces the in-memory counter, which resets to 0 on restart and silently breaks the client's
`?since=` replay. Delivery is `NOTIFY` on **one** channel (channel names are per-connection state and
sessions are unbounded) with a 1 s poll underneath for sessions that have a connected browser — a
dropped NOTIFY is invisible, and "the chat silently stopped updating mid-build" is the worst failure
this product has.

**Batch the deltas.** Assistant prose arrives as `text_delta`; one row each is ~100k rows for a long
build. Buffer text/agent deltas ~200 ms, one row per batch. Markers, phase, tool and turn-end never
batch — they are what the UI reacts to.

### 4. Shared turn queue, and who the builder answers

`busy` is a shared lock, not a local flag: two members can send at once. It belongs in the database,
and the queue has to be *visible* ("Alice's build is running — your message is queued") rather than
silently absorbed by `Conductor.queue`.

The larger question underneath it — several people talking to each other **and** to the builder, which
messages it acts on and which it merely hears — has its own document: **`DESIGN-shared-chat.md`**. The
load-bearing idea is that posting a message and invoking a build are two operations with wildly
different costs, currently fused into one route.

### 5. Session pod executor

An `inline | pod` seam selected by `KF_CHAT_EXECUTOR`, defaulting to `inline`. Local `node app.mjs`
and the test suite must never need a cluster; and if pods misbehave in production, one env var reverts.

### 6. Preview proxy, idle reaper, NetworkPolicy, Workload Identity

---

## Stages

1. ~~Session core + executor seam, shared-chat authorship, membership gate.~~ **Done.**
2. ~~**Event log in Postgres**, SSE replays from it.~~ **Done** — fixed the `seq`-reset replay bug and
   freed the control plane to run more than one replica.
3. Post / invoke split, then the shared turn queue with visible queueing — `DESIGN-shared-chat.md`.
4. Session pod executor behind the flag.
5. Preview proxy, idle reaper, NetworkPolicy, Workload Identity.

Note the ordering: 3 comes before 4 deliberately. The turn queue turns `busy` into shared state in the
database, which is precisely what an executor running outside this process needs in order to be told
what to do — doing 4 first would mean inventing that twice.

## Provisioned (2026-07-31)

The project had **no VPC at all**, so this is all new:

| Thing | Value |
|---|---|
| Network | `kf-vpc` (custom subnet mode) |
| Subnet | `kf-subnet-asia-south1` — nodes `10.10.0.0/20`, Private Google Access on |
| Secondary ranges | pods `10.20.0.0/16`, services `10.30.0.0/20` (VPC-native, so pod IPs are routable — this is what lets Cloud Run reach a session pod directly over Direct VPC egress) |
| Cluster | `kf-builders`, **GKE Autopilot**, region `asia-south1` (same region as Cloud SQL and Cloud Run) |

Chosen over Standard because Autopilot bills per pod-second rather than per node:
a 20-minute build on 2 vCPU / 4 GiB is roughly $0.03, idle sessions cost only their PVC, and there is
no $73/mo cluster fee. Against today's pinned `min=max=1` 4Gi/2cpu Cloud Run instance running whether
anyone builds or not, this is cheaper as soon as usage is bursty.

## Verify before building on it

- **gVisor on Autopilot.** If unsupported, it's a Standard cluster with a gVisor node pool (~$73/mo).
- **Cold pod-to-first-token.** The 10–30 s above is an estimate; image pull dominates and this image is
  large. Measure before designing UI cover for it.
- **Cloud Run → pod IP over Direct VPC egress.** Load-bearing for zero-lag preview. Note the project
  currently has **no VPC at all** — that is the first thing to stand up either way.
- Whether `CLAUDE_CONFIG_DIR` relocates the CLI transcript, or the pod must place the `.jsonl` under
  the default `$HOME/.claude/projects/<escaped-cwd>/`.
