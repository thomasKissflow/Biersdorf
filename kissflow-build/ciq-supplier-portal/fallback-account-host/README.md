# Portal hand-offs: fallback "post to the account's own host" (prepared 22 Oct, not deployed)

Kissflow-internal. This folder holds a fallback that is ready to use but has not been deployed. Use it only if Thomas's 5-minute check fails. That check is a supplier save at the portal's own address, and it fails when no "CIQP Request changed to case" run appears in Run history.

Nothing outside this folder changed:
- The deployed portal component (`ciq-portal-ui-8e21c189b9`) is as it was.
- The source under `prototype/` is as it was: all work ran in a copy, and the hashes below prove it.
- No request went to Kissflow, and nothing was deployed or uploaded.

If the check passes, delete this folder.

## Contents

| File | What it is |
|---|---|
| `ciq-portal-ui-a5e3fcc55b.zip` | The portal custom UI built with the fix (574,363 bytes; zip sha256 `86616a23a60f16631c06f1f0a7a5a9f01f7933b1ecc61407a5247d2ea65f215b`). It holds `index.html` (html sha256 prefix `a5e3fcc55b`) and `manifest.json`. Diagnostics shows the build stamp `2026-10-22T04:53:52.025Z`. |
| `patch.diff` | A unified diff of every source change: 10 files, paths `a/prototype/…` and `b/prototype/…`. It contains no webhook token. It applies cleanly to the current `prototype/` with `patch -p1` run from the project root, which was checked on copies of the original files. |
| `harness-report.json` | The full portal harness run on this bundle: 33 of 33 scenarios passed, 367 checks. |
| `harness-diagnostics-hosts.png` | The Diagnostics page in the emulated sandbox, framed by an emulated portal domain. It shows hosts only. |
| `prototype-before.sha256`, `prototype-after.sha256` | sha256 of every `prototype/` file (without `node_modules/`) before and after this work. They are identical. |

## The problem

The deployed portal sends its four hand-offs (request.changed, I-2, I-4, I-7) to the page it runs in. It builds `https://<parent host>/integration/2/<account>/webhook/<token>`, where the parent host is `location.ancestorOrigins[0]`, or else the referrer.

A supplier opens the portal on the portal's own domain, so that is where the posts go. Two things are unknown:
- Every hand-off ever observed went to the account domain. Kissflow minted all four webhook URLs on `dev-beiersdorf.kissflow.eu`.
- Nobody knows whether the portal domain accepts webhooks at all.

The POST is no-cors and fire-and-forget, so a refusal on the portal domain would go unnoticed. The supplier's save works, but Beiersdorf's case never updates.

## The fix

The portal posts only to the account's own host, chosen by the environment:
- On the dev account `AcDOSunMEpSA` (`envOf` in `@/shell/env`), it uses the host of `DEV_WEBHOOKS`, `dev-beiersdorf.kissflow.eu`. Each URL is then exactly the stored one.
- On any other account (production), it uses `beiersdorf.kissflow.eu`. That is the host the admin console's "Roles & grants" (Manage) link already opened. The account id comes from the handshake, and the tokens are the same.
- The page around the UI no longer matters.
- The transport is unchanged: a no-cors `text/plain` fetch, with `kf.api` and the relative path only when that fetch throws.

| File | Change |
|---|---|
| `src/portal/kf/portal.ts` | Adds a new `ACCOUNT_HOST` map (`dev` is taken from `DEV_WEBHOOKS`, `prod` is written once) and `handoffHost(accountId)`. `webhooksFor(accountId)` drops its host parameter. It always returns `https://<ACCOUNT_HOST>/integration/2/<accountId>/webhook/<token>`, with no relative path, and `NO_WEBHOOKS` for an account that is not an id. `parentHost` stays, for display only. The `dev` call is marked `/* @__PURE__ */` (see the note on the app build below). Comments are rewritten. |
| `src/portal/admin/AdminShell.tsx` | `MANAGE_URL` reads its hosts from `ACCOUNT_HOST`. The URLs are the same as before. |
| `src/portal/data/liveActions.ts` | Calls `webhooksFor(client.accountId)` and no longer passes the parent host. |
| `src/portal/data/client.ts` | Comments only. `postWebhook` is unchanged, and `parentHost` is now for display only. |
| `src/portal/pages/Diagnostics.tsx` | The Session card shows two new rows: "Kissflow page around this UI" (the parent host) and "Hand-offs (webhooks) go to" (the hand-off host). It shows hosts only, never a token. |
| `scripts/zip-portal.mjs` | The build now fails if any `/integration/2/` URL in the bundle uses a host other than the two in `ACCOUNT_HOST`. It reads them from `portal.ts`, the same way the harness reads `DEV_WEBHOOKS`. It also fails on http, a missing host (a relative path, or a host taken from the page), or a second runtime-host template. It prints the hosts it allows. |
| `src/portal/kf/portal.test.ts`, `src/portal/data/client.test.ts`, `src/portal/data/liveActions.test.ts` | New tests and changed tests: see "Tests" below. |
| `scripts/harness-portal.mjs` | Changes to the harness: see "Tests" below. |

**Note on the app build.** The app UI imports portal modules (`data/fixtures`, `data/map`) that import `portal.ts`. Without the `/* @__PURE__ */` mark, the call in `ACCOUNT_HOST.dev` keeps `DEV_WEBHOOKS` in the app bundle, and `npm run build:applive` fails its `DENY_HOSTS` check. That was seen and then fixed here. With the mark, the app bundle has no Kissflow host, and its build passes.

## Tests

Every run was offline:
- All commands ran under macOS `sandbox-exec`, which denies outbound network except localhost.
- vitest also had a `fetch` guard as a setup file. It recorded 0 fetch attempts.
- The harness answers every browser request itself (Playwright routing), and Chromium resolved no host name (`--host-resolver-rules`).

The work ran in a copy of `prototype/` in the session scratchpad.

| Command (in `prototype/`) | Before (deployed code) | With the fix |
|---|---|---|
| `npm run typecheck` (`tsc -b`) | — | 0 errors |
| `npx vitest run src/portal` | 9 files, 168 tests passed | 9 files, **169 tests passed** |
| `npm test` (`vitest run`, all of `src/**/*.test.*`) | 61 files, 1071 tests passed | 61 files, **1072 tests passed** |
| `npm run build:portal` | — | `ciq-portal-ui-a5e3fcc55b.zip`. Hand-off hosts: `dev-beiersdorf.kissflow.eu`, `beiersdorf.kissflow.eu` |
| `node scripts/harness-portal.mjs` (on the built bundle) | 33 of 33 scenarios, 357 checks (old harness) | **33 of 33 scenarios, 367 checks** |
| `npm run build:applive` (the app's `DENY_HOSTS` guard) | — | passes, with 0 Kissflow hosts in the app bundle |

The unit tests check the following:
- **Dev account:** the URLs are exactly `DEV_WEBHOOKS`. The four stored URLs share one host and the `AcDOSunMEpSA` path, and `ACCOUNT_HOST.dev` is that host.
- **Production accounts:** any other account gets `ACCOUNT_HOST.prod`, its own account id in the path and the same tokens. It never gets the dev host or the dev account.
- **No relative path:** every URL is https on the account's host.
- **No account:** a missing account, or one that is not an id, gives `NO_WEBHOOKS`.
- **Parent page:** the parent page does not decide where a post goes. The client tests cover four parents: a portal-domain parent, a non-Kissflow https parent, a 127.0.0.1 parent and the sandbox's own page. The liveActions tests cover no parent, a portal-domain parent and the sandbox's own page. In each case the POST goes to the account's host, by fetch, without `kf.api`.

The harness changes are these:
- **Astray check:** a hand-off now counts as astray when its host is not `ACCOUNT_HOST[env]`.
- **`handoffs-dev`:** all four hand-offs go by fetch to the sandbox's host, each exactly the stored URL of its kind (compared by sha256). The same save is then repeated framed by the sandbox's own page, an emulated portal domain and a page off Kissflow. Each gives the same stored URL, with one POST per save.
- **`handoffs-prod`:** `AcHARNESS` is in the path, on production's host, from 127.0.0.1, an emulated production Kissflow page, the portal domain and a page off Kissflow. Nothing goes to the dev host or account, and there is one POST per save.
- **`diagnostics`:** the page shows both hosts and no hook URL.

Two negative controls show that the checks catch the old behaviour:
- **Harness on the deployed code's bundle:** the new harness, run on the deployed code's bundle (the same code as `8e21c189b9`), fails `handoffs-dev`, `handoffs-prod` and `diagnostics`. It reports the deployed code posting to the emulated portal domain (`ciq-portal-harness.kissflow.eu`), not the account host.
- **Zip guard on the deployed code's bundle:** the new zip guard refuses the deployed code's bundle, because the parent-host template has no host of its own.

## What Thomas does, only if the 5-minute check fails

1. **OK the production host in the bundle.** `beiersdorf.kissflow.eu` is written once, in `src/portal/kf/portal.ts` as `ACCOUNT_HOST.prod`.
   - This goes against the 21 Oct rule "never written for production".
   - It is the host the Manage link already used, and the mapping the 21 Oct A2 plan used.
   - Without this OK, do not deploy.
2. **Apply the patch to the source**, so that the next portal build keeps the fix. Run `patch -p1 < kissflow-build/ciq-supplier-portal/fallback-account-host/patch.diff` from the project root. This is Thomas's call, or the portal session's after his OK.
3. **Deploy `ciq-portal-ui-a5e3fcc55b.zip` to the portal's custom UI component in dev.** Do it by hand, or by running `node kissflow-build/ciq-supplier-portal/deploy-portal-ui.mjs <zip>` himself.
4. **Re-run the 5-minute check** at the portal's own address:
   - **Diagnostics first (as Admin):**
     - "Kissflow page around this UI" should show the portal domain.
     - "Hand-offs (webhooks) go to" should show `dev-beiersdorf.kissflow.eu`.
     - "Build" should show `2026-10-22T04:53:52.025Z`.
   - **The save:** as Supplier, change one answer on ZZT-NT-G2-FILLED. A "CIQP Request changed to case" run must appear in Run history.
   - **Optional:** in DevTools → Network, filter on "webhook". The POST's host must be `dev-beiersdorf.kissflow.eu`.
5. **Push** to production.
6. **Prod token check (Trigger → Output):** compare the host part as well as the token.
   - The host must be `beiersdorf.kissflow.eu`, the production host written in the bundle.
   - The path must carry production's own account id.
   - If either differs, stop before testing. The backup is a rebuild with the right host, or the admin-only settings-row option (b2).
   - After the first supplier save in production, confirm that the run appears in production's Run history.

## Remaining risks and notes

- **Other accounts:** an account other than dev or production would post to the production host. Kissflow refuses it there, because the path carries the wrong account. This risk is accepted.
- **Still fire-and-forget:** the page still cannot read a webhook's status. Only Run history, or DevTools, shows it.
- **The app:** it needs no change, because its parent page is already the account domain.
  - The comment in `src/app-live/write/handoff.ts` ("The portal builds its URLs the same way") becomes outdated once this fallback is applied. That file belongs to the app session and was not touched.
- **Docs to update if adopted:** the host comparison in the prod token check in `kissflow-build/TEST-GUIDE-PROD.md`, and the portal bundle name in the PROD-READY notes.
- **Prototype dist folders:** the zip in `prototype/dist-portal/` (`7b4cdd7ec1`) is still the deployed code. This zip is in this folder only.

## Restore check (prototype byte-identical)

The prototype was never written. The copy was made with an APFS clone (`cp -Rc`) into the session scratchpad, and every edit, build, test and harness run happened there. The copy also included `kissflow-build/config-seed`, which `src/app-live` tests read.

Before and after the work (04:38Z and 04:58Z on 22 Oct), sha256 was taken of every file under `prototype/` (790 files, without `node_modules/`) and of `prototype/node_modules/.vite` (31 files). Both sets are identical:
- The two manifests are in this folder, `prototype-before.sha256` and `prototype-after.sha256`.
- Each manifest's own sha256 is `392116508036fb5c9f1cbbb57a80cfcae4b86ba79009e39fc10f5f0ee92e6d7e`.

These are the files the patch touches:

| File | sha256 (before = after) |
|---|---|
| `src/portal/kf/portal.ts` | `d9c8b1d4e1469eebedf4471c4859ee4fb1d8b7d73ede438ced958ed9200272d1` |
| `src/portal/kf/portal.test.ts` | `bca39f85dfe6b9c84f21a5982b5a934d16dc49bd4370c5b7f7035c37befc5006` |
| `src/portal/data/client.ts` | `d44051c8600ce08efcd9ae582bd07d3d7106e7e857a89cc81dd6252c30fe6f27` |
| `src/portal/data/client.test.ts` | `da558650a01252bc9bc9b31aad222344ef71d34699dc7ec74ef3bc8dd6e43740` |
| `src/portal/data/liveActions.ts` | `c108a07add5bc75be042c8e1aebd1041cb9eae2ca0059d15f67eeb0d24277623` |
| `src/portal/data/liveActions.test.ts` | `64ebb9890a1179d5b92b33b9d90ae9b29134ed07c8b21211b3a55720d7158d36` |
| `src/portal/pages/Diagnostics.tsx` | `8c857a93019270a2ba6f5fe892c5379fe11b99dcec4447249682dbe3f86523c4` |
| `src/portal/admin/AdminShell.tsx` | `65e87e3f5b860216aeb92202628ee52037713013b6e8af4d107e6b01fee471c2` |
| `scripts/zip-portal.mjs` | `fbf8edb4a0805e6eeacf961a564605f035431c8820d4299a94891fb2a35c6d2d` |
| `scripts/harness-portal.mjs` | `7a235a008b8fd6cda817495e8449770e55aa6f7bd6674fece9682d7928608336` |
| `tsconfig.tsbuildinfo` | `d48dead09898e4a40ef08909bdd1982562c6806d5a06ecf9a95f0ff89aa83bff` |
| `dist-portal/ciq-portal-ui-7b4cdd7ec1.zip` and the rest of `dist-portal/` | unchanged (part of the 790-file set) |
