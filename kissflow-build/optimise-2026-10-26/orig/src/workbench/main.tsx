import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WorkbenchApp } from "./WorkbenchApp";
import "./fonts.css";
import "@/styles.css";
import "./workbench.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WorkbenchApp />
  </StrictMode>,
);
