// _env.mjs — test env defaults. MUST be imported before any src module: ES imports are hoisted, so a
// plain assignment at the top of a test file runs too late (driver.mjs reads KF_CHAT_CLAUDE_BIN when
// it is first evaluated). Same pattern as control-plane/test/_env.mjs.
//
// Why it exists: if the membership gate ever regresses, a test that posts a message as a NON-member
// reaches sendTurn and spawns a real `claude -p` — the run then hangs for minutes instead of failing.
// Pointing the binary at `true` means a regression fails fast and loudly, and never bills anyone.
process.env.KF_CHAT_CLAUDE_BIN = "/usr/bin/true";
process.env.KF_CHAT_MODEL = "sonnet";

// Builds land in a throwaway directory, not the real runs/. Creating a session makes a run directory,
// and without this every test run left empty ones scattered through the working tree — 49 of them
// before this line existed.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.KF_RUNS_DIR = mkdtempSync(join(tmpdir(), "kf-chat-test-"));

// Build slots. A test plants a fake conductor whose turn never ends, so every session it starts
// legitimately holds a slot for the life of the process — two slots (the production default for a
// 2-vCPU box) are gone after two tests and the rest never get to start. Tests are not modelling a
// machine's capacity, so give them room.
process.env.KF_BUILD_SLOTS = "64";
