// The SDK surface of the internal app UI (CIQ_Digital_A00): the portal's typed facade (@/portal/kf/sdk, which also runs
// the handshake: the host never injects window.kf) plus the process task actions and Dataform calls the portal does not
// declare. Every shape below is the SDK's own: node_modules/@kissflow/lowcode-client-sdk/dist/index.d.ts (option types
// l.242-300, Process l.1031-1240, Dataform l.813-865) and kfsdk.es.js 1.0.49 (Dataform l.807-925, Process l.1045-1330).
// Nothing here is called by the client yet (DESIGN §3.2 needs none of them); they are typed so a later writer does not
// guess them.
import type { Kf, KfDataform, KfProcess } from "@/portal/kf/sdk";

export { connectKf, envelopeOf, errorText, inFrame, kfDateTime, rowsOf, totalOf } from "@/portal/kf/sdk";
export type { Connection, Kf, KfData, KfDataform, KfPage, KfProcess, KfRole, KfUser } from "@/portal/kf/sdk";

/** A user reference as the SDK's reassign takes it (index.d.ts example: `reassignTo: { _id: "user_789" }`). */
export interface KfUserRef {
  _id: string;
  Name?: string;
  [k: string]: unknown;
}

/**
 * A process of the app. On top of the portal's KfProcess (whose `withdrawItem` already matches: kfsdk sends only
 * instanceId and comment, l.1204-1213, and ignores an activityInstanceId):
 */
export interface AppKfProcess extends KfProcess {
  /** kfsdk l.1189-1203: instanceId, activityInstanceId and a non-empty comment are all required. */
  rejectItem?(opts: { instanceId: string; activityInstanceId: string; comment: string }): Promise<unknown>;
  /** kfsdk l.1214-1230: back to an earlier step `stepId` (an activity id); comment required. */
  sendbackItem?(opts: { instanceId: string; activityInstanceId: string; stepId: string; comment: string }): Promise<unknown>;
  /** kfsdk l.1231-1249: reassignType defaults to "approver", reassignedFrom to []. */
  reassignItem?(opts: {
    instanceId: string;
    activityInstanceId: string;
    reassignTo: KfUserRef;
    comment: string;
    reassignType?: "initiator" | "approver" | "admin";
    reassignedFrom?: KfUserRef[];
  }): Promise<unknown>;
  /** kfsdk l.1250-1265: people the task may be reassigned to (paged, optional search). */
  getReassignees?(opts: { instanceId: string; activityInstanceId: string; pageNumber?: number; pageSize?: number; query?: string }): Promise<unknown>;
  /** kfsdk l.1266-1278: restarts a rejected or withdrawn instance. */
  restartItem?(opts: { instanceId: string; activityInstanceId: string }): Promise<unknown>;
  /** kfsdk l.1319-1327: the item's progress/timeline (shape not typed by the SDK: `Promise<any>`). */
  getProgress?(opts: { instanceId: string }): Promise<unknown>;
  /** kfsdk l.1293-1299: field definitions of one step in the My tasks view. */
  getMyTaskFields?(opts: { activityId: string }): Promise<unknown>;
}

/** A Dataform of the app. The portal's KfDataform already has getItem({itemId}) (kfsdk l.822-832). */
export interface AppKfDataform extends KfDataform {
  /** kfsdk l.876-881: discards the user's open draft of this form. It takes NO item id: one draft per user per form. */
  discardItem?(opts?: { viewId?: string }): Promise<unknown>;
  /** kfsdk l.893-898: field definitions of the form. */
  getFields?(opts?: { viewId?: string }): Promise<unknown>;
}

/** A role as getRoles answers it (index.d.ts l.178 rolesObject). */
export interface KfRoleObject {
  _id: string;
  Name: string;
}

export interface AppKfApp extends Omit<Kf["app"], "getProcess" | "getDataform"> {
  getProcess(id: string): AppKfProcess;
  getDataform(id: string): AppKfDataform;
  // getRoles comes from the portal facade (index.d.ts l.1294-1310, kfsdk GET_ROLES; Development accounts only).
  /** index.d.ts l.1311-1330, kfsdk SWITCH_ROLE: a REAL role change (the user leaves their current role(s) and joins this
   *  one); no page reload. Development accounts only. */
  switchRole?(args: { roleId?: string; roleName?: string }): Promise<unknown>;
}

/** The handle as the app UI types it. Structurally a Kf (every addition is optional), so either converts freely. */
export interface AppKf extends Omit<Kf, "app"> {
  app: AppKfApp;
}

export const asAppKf = (kf: Kf): AppKf => kf;
