// Types for scripts/gen-workbench-schema.mjs, so src/workbench/schema/generator.spec.ts can import it.
export class SchemaGuardError extends Error {}
export const DEFAULT_SPEC: string;
export const OUT: string;
export const READBACK: string;
export const ROLE_ALIGN: string;
export function buildSchema(spec: unknown, meta?: { sha256?: string; revision?: number | null; readback?: unknown; roleAlignment?: unknown }): Record<string, unknown> & {
  APP_ID: string;
  STEPS: Record<string, { flow: string; irId: string; name: string; kind: string; perms: Record<string, string>; gates: string[]; serverActivityId: string | null; fieldAssigned?: string }>;
  SWITCHES: Record<string, { reject: boolean; sendBack: boolean }>;
  CR_DEPT_FIELDS: Record<string, Record<string, string>>;
  LANE_FIELDS: Record<string, string[]>;
  ADMIN_WRITE_ALLOW: Record<string, { flow: string; fields: Record<string, string[]> }>;
  ROLES: Record<string, { name: string; legacyName: string | null; persona: string | null; technical: boolean; serverId: string | null }>;
  GRANTS: Record<string, Record<string, { cell: string; capability: string }>>;
  CHILD_TABLES: Record<string, { serverModelId: string | null }>;
};
export function renderTs(schema: unknown): string;
export function readSpec(specPath?: string): { spec: any; sha256: string; revision: number | null };
export function generate(o?: { specPath?: string; readbackPath?: string; rolesPath?: string }): string;
