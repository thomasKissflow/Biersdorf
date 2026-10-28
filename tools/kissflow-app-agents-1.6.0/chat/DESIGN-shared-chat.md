# Shared chat: who is talking, and when the builder answers

An app has members, and all of them work in **one** conversation. They talk to the builder, and they
talk to each other in front of it. Two people arguing about whether approvals should be a matrix or
branch conditions is not noise to be filtered out — it is the requirement, arriving. The builder has to
hear all of it and speak only when it is being spoken to.

This document is about that judgment. The transport (durable event log, membership gating, authorship
on every message) is built; see `DESIGN-builds-off-instance.md`.

---

## 1. The mistake to undo first

`POST /api/sessions/:id/message` appends the message **and** starts a turn, in one indivisible step.
That was correct while a session was one person's private build. In a room it fuses two things with
completely different costs:

| | cost | when |
|---|---|---|
| **Post** | a row and a broadcast | always |
| **Invoke** | the build lock, a woken agent, money, mutated files, 20 minutes | sometimes |

Every question below is a question about `invoke`. Splitting them is the precondition for answering
any of it, and on its own it is a small change: `sendTurn()` becomes `postMessage()` plus a separate
`invoke()` that the router calls only when it decides to.

## 2. The decision ladder

Evaluated in order; the first match wins. Cheapest and most certain first, because the failure modes
are wildly asymmetric — see §6.

**1. Explicit address → invoke.**
`@builder`, a reply to one of the builder's own messages, or the composer's mode ("Ask the builder" vs
"Comment"). No inference, no model call, no ambiguity. Most traffic should end up here once the UI
makes it natural, and every other rule exists only for the traffic that doesn't.

**2. Idle session, sole speaker → invoke.**
Nobody else has spoken in the last ~90 s and no turn is running: you are plainly talking to it. This
rule exists to protect the single-user path, which is still the common case — a lone user must never
have to @-mention anything to get a build.

**3. Two humans in exchange → listen only.**
Two distinct authors alternating inside a short window, with no address: a side conversation. Stay
silent. Keep every word (§4).

**4. Ambiguous → offer, never act.**
One line — *"want me to build that?"* — instead of a build. This is the only rung where a model is
allowed to judge, and it is allowed to produce **only the offer**, never a turn. A cheap classifier
(Haiku-class) sees the last few messages and returns `addressed | side-conversation | unsure`; `unsure`
becomes the offer, `side-conversation` becomes silence.

Rules 1–3 are deterministic server logic: predictable, debuggable, free, and inspectable after the
fact when someone asks "why did it start building?".

## 3. Nothing decides *for* the builder what it hears

The ladder gates **acting**, never **listening**. Every message is posted, broadcast, and retained as
context regardless of which rung it lands on. There is no filtering step, and no summarisation step, in
front of the model — a side conversation that got compressed to "they discussed approvals" has lost
exactly the thing that made it worth keeping.

## 4. A turn consumes a delta, not a message

This is the mechanism that makes silence safe. When a turn does fire, it carries everything said since
the last one, attributed:

```
SINCE YOUR LAST TURN (you were not addressed — context only)
  Alice: approvals as a matrix, or branch conditions?
  Bob:   matrix. finance wants to edit thresholds without a dev.
NOW, Alice asks you:
  add the approval matrix
```

Messages carry `consumed_by` (the turn id that absorbed them). Nothing replays twice; nothing is
dropped because it arrived while the builder was quiet. A message posted *during* a running turn is
consumed by the **next** one — it was never seen by the turn already in flight, and pretending
otherwise produces a builder that appears to ignore what it was told.

## 5. Concurrency: one build, several people

One sandbox per session means one build at a time. `busy` stops being a local flag and becomes a shared
lock in the database, because the people contending for it are on different connections and possibly
different replicas.

- Bob instructs while Alice's build runs → **queued visibly, with attribution**. Today it vanishes into
  `Conductor.queue` and nobody can see that it was received, least of all Bob.
- The queue is part of the transcript, not a hidden array: "queued — Bob: also add the vendor page".

**Interrupts do not queue.** "stop", "wait", "no, wrong direction" addressed to a running build go to
the control channel (`/stop`) immediately. A message that has to wait twenty minutes to say *stop* is
not a stop.

## 6. Failure modes, and why the tie-breaks go where they go

**Barging in** — starting a build on a misread of two colleagues thinking out loud. Costs twenty
minutes, a polluted working tree, and trust. Never auto-invoke on an unaddressed message when two or
more humans have spoken recently.

**Silent drop** — deciding not to respond, invisibly. Someone waits for a reply that was never coming,
and there is nothing on screen to diagnose. **Worse than barging in**, because barging in is at least
legible. A "listening" state has to be visible whenever a message lands without invoking.

**Double invoke** — two members @mention within seconds. One turn, both messages consumed by it.

**Answering nobody in particular.** With several people present, "done — added the matrix" is
ambiguous. It should name who it is answering; the `SESSION` block already carries `speaker`, and the
delta in §4 extends it.

## 7. Shape of the change

```sql
ALTER TABLE chat_messages ADD COLUMN consumed_by text;   -- turn id, null = still context
CREATE TABLE chat_turns (
  id text PRIMARY KEY, session_id text NOT NULL, author_sub text,
  state text NOT NULL DEFAULT 'queued',   -- queued|running|done|failed
  reason text,                            -- which rung of §2 invoked it, for "why did it build?"
  created_at timestamptz DEFAULT now(), started_at timestamptz, finished_at timestamptz
);
```

`reason` is not decoration. The first question anyone asks about a system like this is "why did it
start?", and a stored rung answers it without re-deriving anything.

## 8. Stages

1. **Post / invoke split.** `sendTurn` becomes `postMessage` + `invoke`; every message posts, rung 2
   invokes. Behaviour for a single user is unchanged — that is the test.
2. **Shared turn queue.** `busy` moves to the database; queued turns are visible with attribution;
   interrupts route to the control channel.
3. **Addressing rules.** Rungs 1 and 3, plus the composer mode and `@builder` in the UI.
4. **The unsure classifier.** Rung 4, offer-only, never authorised to start a turn.

Stage 1 is worth doing alone: it is small, it is invisible to a single user, and every later stage
needs it.

## 9. To settle before building

- **Does a `@builder` mention belong in the composer or in the text?** A mode toggle is unambiguous and
  discoverable; an @-mention is familiar from Slack. Probably both, but the mode is what rule 1 keys on.
- **The idle window in rule 2** (~90 s) is a guess. It wants tuning against a real shared session,
  because too short re-introduces barging in and too long makes a lone user wait.
- **Should the builder ever join a side conversation it was not invited to** — e.g. Alice and Bob are
  factually wrong about what Kissflow supports? Tempting, and the same instinct produces an assistant
  nobody can hold a conversation in front of. Default no.
