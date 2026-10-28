// Types for scripts/workbench-deny.mjs, so src/workbench/guards.spec.ts can import it.
export const DENY_HOSTS: RegExp;
export const DENY_CONTENT: RegExp;
export const DENY_ALLOW: { match: string; near: string }[];
export function denyHits(text: string): { kind: string; match: string; at: number; context: string }[];
