// Minimal Kissflow REST client (master.md §3.11). Reads credentials from Beiersdorf/.env and never prints them.
// Usage: import { client } from "./kf.mjs"; const kf = client({ readOnly: true }); await kf.get(path)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ENV_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");

export function loadEnv(path = ENV_PATH) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  for (const k of ["KF_DOMAIN", "KF_ACCOUNT_ID", "KF_ACCESS_KEY_ID", "KF_ACCESS_KEY_SECRET"]) {
    if (!env[k]) throw new Error(`.env is missing ${k}`);
  }
  if (/^https?:\/\//.test(env.KF_DOMAIN) || env.KF_DOMAIN.endsWith("/")) throw new Error("KF_DOMAIN must be a bare host");
  return env;
}

export function client({ readOnly = true, env = loadEnv() } = {}) {
  const headers = {
    "X-Access-Key-Id": env.KF_ACCESS_KEY_ID,
    "X-Access-Key-Secret": env.KF_ACCESS_KEY_SECRET,
    "Content-Type": "application/json",
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function call(method, path, body, { retries = 3 } = {}) {
    if (readOnly && method !== "GET") throw new Error(`read-only client refused ${method} ${path}`);
    for (let i = 0; ; i++) {
      const res = await fetch(`https://${env.KF_DOMAIN}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { json = text; }
      if ([423, 429, 502, 503, 504].includes(res.status) && i < retries) {
        await sleep(1200 * (i + 1) + Math.random() * 400);
        continue;
      }
      return { status: res.status, body: json };
    }
  }
  return {
    call,
    get: (path) => call("GET", path),
    acc: env.KF_ACCOUNT_ID,
    domain: env.KF_DOMAIN,
    appId: env.KF_APP_ID,
    portalId: env.KF_PORTAL_ID,
  };
}
