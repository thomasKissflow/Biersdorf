// The React root's options for the live app (main.tsx). React 19 logs every error a boundary catches once more: its
// default onCaughtError calls console.error, in the production build too (react-dom-client.production.js
// defaultOnCaughtError). StartBoundary and PageBoundary already log the error with its component stack, so React's own
// log is left out: one console error per crash, the boundary's (FE-CLEANUP "Console", 22 Oct).
import type { RootOptions } from "react-dom/client";

export const ROOT_OPTIONS = {
  onCaughtError: () => {
    // logged by the boundary that caught it (AppLiveApp.tsx StartBoundary, PageBoundary.tsx)
  },
} satisfies RootOptions;
