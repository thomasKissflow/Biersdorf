// Call mode: the understanding page shown on its own for the client call (#/understanding/call), without the app
// shell. Nothing leads into the rest of the prototype, and the wording doesn't refer to the prototype itself.
import { createContext, useContext } from "react";

export const CallModeContext = createContext(false);
export const useCallMode = () => useContext(CallModeContext);

/** Wording for the call: the same statements, without references to the prototype. */
export function callText(s: string): string {
  return s
    .replace(/ ?\(simulated\)/g, "")
    .replace(/; the prototype does not produce the file itself\./g, ".")
    .replace(/The prototype uses illustrative values\./g, "We use illustrative values until we have yours.")
    .replace(/In this prototype/g, "In our understanding")
    .replace(/in this prototype/g, "in our understanding");
}
