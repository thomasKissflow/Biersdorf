---
description: Open the AI Builder chat — a browser chat that turns a spoken requirement into a running, previewable app UI (intake questions → quick or comprehensive build → live preview beside the conversation).
argument-hint: "[--port 4310] [\"the requirement to start with\"]"
---

**AI Builder chat.** The same builder as this terminal, wearing a product face: the user types what they
need, answers two or three questions, picks _Quick build_ or _Comprehensive_, and watches the generated UI
appear in a preview pane next to the conversation. Every follow-up ("add the approver role", "make it
calmer", "the queue should show aging") rebuilds in place.

## Do

1. Start the server (it is zero-dependency; nothing to install):
   ```bash
   node plugins/app-agents/chat/server.mjs --port ${PORT:-4310} --open
   ```
   Run it in the background if the session should stay usable, and print the URL.
2. If the user gave a requirement as an argument, hand it over as a deep link instead of typing it for
   them: `http://127.0.0.1:<port>/?new=<url-encoded requirement>`.
3. Tell them what to expect, in two lines: intake questions first, then the depth choice; the preview
   pane is live and every message edits the app in place.

## Notes

- Each chat owns a run directory `runs/<slug>/` and writes exactly the artifacts the terminal pipeline
  writes (`prototype/experience-spec.json`, `prototype/parts/*`, `prototype/index.html`), so a chat-built
  app can be continued with `/author-*` commands and vice versa — the **Prototypes on disk** list in the
  Sessions drawer adopts anything already built.
- The conductor's contract lives in `plugins/app-agents/chat/CONDUCTOR.md`; the marker protocol
  (`<<KF:phase …>>`, `<<KF:ask …>>`, `<<KF:plan …>>`, `<<KF:preview …>>`) is what drives the phase pills,
  the question cards and the preview swap.
- It binds to `127.0.0.1` only: the conductor runs with permissions bypassed so it can drive the engine
  scripts without prompting, so the socket must not be exposed. Do not add `--host 0.0.0.0`.
- Prototype scope only — the chat conductor will not call Kissflow, publish, or apply. Use
  `/author-generate` for that.
