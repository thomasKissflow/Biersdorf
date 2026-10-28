import { readFileSync, writeFileSync, existsSync } from "node:fs";
const F = new URL("./integrations-state.json", import.meta.url);
export const load = () => (existsSync(F) ? JSON.parse(readFileSync(F, "utf8")) : {});
export const save = (s) => writeFileSync(F, JSON.stringify(s, null, 2));
