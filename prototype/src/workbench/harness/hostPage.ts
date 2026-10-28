// Host page of the emulated Kissflow app (WORKBENCH-DESIGN.md §11.1 hostPage.ts). Bundled by esbuild (IIFE) into the
// harness host page ONLY; it never enters dist-workbench/zip/index.html (zip-workbench.mjs refuses the marker below).
// It frames the Workbench on another origin and answers the bundled SDK's postMessage protocol: it accepts only the
// frame's messages that carry `_id` and `command`, and answers `{ _req, resp }` (kfsdk.es.js onMessage).
// Exposed for the runner: window.__kfCalls, __kfOverlaps, __kfState(), __kfFixtures, __kfChecks(opts), and
// __kfHost.{nativeSave, nativeSubmit, nativeSendBack, dropLaneValue, markClick, switchUser, params, people}.
import type { GlobalCheckOptions } from "./checks";
import type { Req } from "./commands";
import { HARNESS_MARKER, createHostEngine, type HostEngine } from "./hostEngine";
import { parseParams } from "./params";
import { FIXTURE_CONTACT_PEOPLE } from "./fixtures";
import { FIXTURE_PEOPLE, USERS } from "./users";

type W = Record<string, unknown>;
const w = window as unknown as W;
w[HARNESS_MARKER] = true;

function bar(engine: HostEngine | null, error?: string): HTMLElement {
  const el = document.createElement("div");
  el.id = "kf-host-bar";
  el.style.cssText = "font:12px/1.4 system-ui,sans-serif;padding:4px 10px;background:#1f2937;color:#e5e7eb;display:flex;gap:10px;flex-wrap:wrap;align-items:center";
  const label = document.createElement("strong");
  label.textContent = "Emulated Kissflow host (harness, fictional data)";
  el.appendChild(label);
  if (error) {
    const e = document.createElement("span");
    e.style.color = "#fca5a5";
    e.textContent = error;
    el.appendChild(e);
    return el;
  }
  for (const u of Object.values(USERS)) {
    const a = document.createElement("a");
    const q = new URLSearchParams(location.search);
    q.set("user", u.id);
    q.delete("dev");
    a.href = `?${q.toString()}${location.hash}`;
    a.textContent = u.id === engine?.me.id ? `[${u.id}]` : u.id;
    a.title = `${u.Name} · ${u.roles.join(", ")}`;
    a.style.color = u.id === engine?.me.id ? "#fde68a" : "#93c5fd";
    el.appendChild(a);
  }
  return el;
}

function boot(): void {
  const q = new URLSearchParams(location.search);
  const showBar = q.get("bar") === "1";
  const uiUrl = String(w.__WB_UI_URL__ ?? "");
  let engine: HostEngine;
  try {
    engine = createHostEngine(parseParams(q));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    w.__kfHostError = msg;
    document.body.appendChild(bar(null, msg));
    return;
  }
  const frame = document.createElement("iframe");
  frame.id = "kf-frame";
  frame.title = `app-custom-ui-${engine.params.appId}`;
  frame.style.cssText = `border:0;width:100%;height:${showBar ? "calc(100% - 26px)" : "100%"};display:block`;
  if (showBar) document.body.appendChild(bar(engine));
  document.body.appendChild(frame);

  w.__kfCalls = engine.calls;
  w.__kfOverlaps = engine.overlaps;
  w.__kfFixtures = engine.fixtures;
  w.__kfState = () => engine.snapshot();
  w.__kfChecks = (o?: GlobalCheckOptions) => engine.checks(o);
  w.__kfHost = {
    params: engine.params,
    me: { id: engine.me.id, _id: engine.me._id },
    nativeSave: (id: string, act: string, data: Record<string, unknown>) => engine.native.save(id, act, data),
    nativeSubmit: (id: string, act: string) => engine.native.submit(id, act),
    nativeSendBack: (id: string, act: string, stepName: string) => engine.native.sendBack(id, act, stepName),
    dropLaneValue: (caseId: string, fieldId: string) => engine.native.dropLaneValue(caseId, fieldId),
    markClick: (testId: string) => engine.markClick(testId),
    /** Another fictional user on the same host state: the frame reloads and handshakes again. */
    switchUser: (id: string, route = "/", o?: { dev?: boolean; flowAdmin?: string | null }) => {
      engine.switchUser(id, o);
      frame.src = `${uiUrl}${uiUrl.includes("?") ? "&" : "?"}as=${encodeURIComponent(id)}&t=${Date.now()}#${route}`;
    },
    /** Every fictional person (users and supplier contacts): the redacted Diagnostics copy must hold none. */
    people: [...FIXTURE_PEOPLE, ...FIXTURE_CONTACT_PEOPLE],
  };

  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== frame.contentWindow) return;
    const req = e.data as Req | null;
    if (!req || typeof req !== "object" || !req._id || !req.command) return;
    engine.dispatch(req, (resp) => frame.contentWindow?.postMessage({ _req: req, resp }, "*"));
  });
  frame.src = uiUrl + location.hash;
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
