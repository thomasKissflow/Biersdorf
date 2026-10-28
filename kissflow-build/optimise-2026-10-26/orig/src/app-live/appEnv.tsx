// The environment the shell is drawn for (env.ts) and, in the Development sandbox only, the real role switch
// (Thomas, 20 Oct): the SDK's getRoles lists every app role and the user's current ones; switchRole moves the user
// into another role for real (they leave their current role(s); Kissflow's permissions follow), with no page reload.
// AppLiveApp provides it; after a switch it rebuilds the identity from getRoles().currentRoles, so the store reloads
// as the new role.
import { createContext, useContext } from "react";
import type { DevRoles } from "@/shell/DevTopBar";
import type { AppEnv } from "./env";

export type { DevRoles };

export interface AppEnvValue {
  env: AppEnv;
  /** Only in dev, and only when the SDK offers getRoles and switchRole. */
  devRoles?: DevRoles;
}

export const AppEnvContext = createContext<AppEnvValue>({ env: "prod" });

export const useAppEnv = () => useContext(AppEnvContext);
