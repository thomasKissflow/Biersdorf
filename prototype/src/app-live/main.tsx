// Entry of the live internal UI (app-live.html → vite.applive.config.ts). Same styles as the portal: the prototype's
// tokens and components, the IBM Plex fonts and the branded loader.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppLiveApp } from "./AppLiveApp";
import { ROOT_OPTIONS } from "./rootOptions";
import "@/portal/fonts.css";
import "@/styles.css";
import "@/portal/portal.css";

// ROOT_OPTIONS: a crash a boundary catches is logged once, by the boundary
createRoot(document.getElementById("root")!, ROOT_OPTIONS).render(
  <StrictMode>
    <AppLiveApp />
  </StrictMode>,
);
