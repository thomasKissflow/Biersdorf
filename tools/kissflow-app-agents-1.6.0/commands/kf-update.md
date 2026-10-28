---
description: Check whether a newer Kissflow App Agents plugin is published, and update to it.
---

# Update the plugin

The agents, commands and engine ship together as one version. An old copy runs last month's agent
definitions against this month's engine, which does not fail loudly — it shows up as a missing check,
a shape the builder no longer emits, or advice that contradicts the platform. Those read as the
product being wrong rather than the copy being old, which is why this is worth doing when asked.

## Steps

1. **Say what is installed and what is available.**
   ```
   node "${CLAUDE_PLUGIN_ROOT}/engine/version-check.mjs"
   ```
   Silence means you are current — say so in one line and stop. Do not go further.

2. **If a newer version exists, tell the user what changes**, briefly, from
   `${CLAUDE_PLUGIN_ROOT}/CHANGELOG.md` — the entries between their version and the published one.
   Two or three lines, in terms of what they will notice, not commit subjects.

3. **Hand them the update.** Plugin installation is Claude Code's own, not something an agent can do
   for someone, so give the exact steps and let them run them:
   ```
   claude plugin marketplace update kissflow
   claude plugin update app-agents@kissflow
   ```
   Then restart the session. Claude Code applies a plugin update on the next session, not this one —
   its own help says so — and an agent definition already read stays read.

   (`/plugin` opens the same thing interactively if they prefer clicking to typing.)

4. **If they are mid-build, say so first.** Updating between turns of a live build swaps the agent
   definitions underneath it. Finish the build, then update.

## Boundaries
- Never edit files under the installed plugin to fake an update — that leaves a copy whose version
  number lies, which is worse than being out of date.
- If the check cannot reach the service, say that plainly rather than guessing at a version.
