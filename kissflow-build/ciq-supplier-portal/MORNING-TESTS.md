# Portal (v3, supplier-only): tests with real supplier users

These tests need real signed-in supplier users:
- The API key can't act on any step after Start (verified 7 Oct).
- The key belongs to the portal Admin, so it can't show what a normal supplier can do.

Everything else was verified with the key (see `BUILD-LOG.md`). Beiersdorf-side tests move to the app once it's generated.

## Before you start (about 10 minutes, Thomas)

1. In **CIQ Supplier Portal**, invite three fictional supplier users. Use mailboxes you can open; never use real supplier addresses.
   - **A1** and **A2**: two contacts of supplier A.
   - **B1**: a competing supplier.
   - Add all three to the portal role **Supplier**, and give them no other role.
2. Tell Claude "users added". Claude dry-runs `seed-morning-tests.mjs`, which assigns users in the role's member order: the first two are supplier A, the third is supplier B. Claude shows you who is who, then runs `--apply`. That creates:
   - for **TEST-A-0001**: a request, the BASIC section, a query, a completeness confirmation (A1 only) and a notice, all for A1 + A2 unless stated;
   - for **TEST-B-0001**: a request for B1.
3. Use one browser profile or private window per user.

## Tests

Tests marked **(blocking)** decide parts of the design.

| # | Who | Do | Expected | Settles |
|---|---|---|---|---|
| MT-1 **(blocking)** | A1, A2 | Both open My Tasks. A1 submits "Supplier: submit basic data" on TEST-A-0001 | Both saw the task. After A1's submit it is gone for A2 | Any one of the assigned contacts can act |
| MT-2 **(blocking)** | B1 | Look for TEST-A-0001 in My Items, My Tasks and search. Open A's item URL (Thomas sends it) | Nothing of supplier A is visible; the URL is refused | Supplier A vs B isolation |
| MT-3 **(blocking)** | A1 | (a) Try to create items in CIQP Request, Section, Query, Completeness Confirmation, Final Release and Notice. (b) Create a CIQP Change Request | (a) Not possible (role Supplier = Member []). (b) Possible: it completes at once and A1 still sees it in My Items | Suppliers can't raise Beiersdorf items. Overnight, the admin key could create with any membership |
| MT-4 | A1 | At "Supplier: confirm completeness", try to edit `Declaration Text` and the header fields | Only `Supplier Confirm`, `Confirmed By Name/Email/Role/At` are editable, and they are Mandatory | Step field rules for a non-admin |
| MT-5 | A1 | Open any assigned item | `Assigned Contacts` is read-only; no picker of all portal users opens | No portal-wide user picker for suppliers |
| MT-6 **(blocking)** | A1, A2 | In the BASIC section ("Supplier: fill in section"): (a) check every Uploads column is visible; (b) add a row with a file and save without submitting; (c) A2 sees it; (d) A1 tries to **delete** the row, **replace the file** and **edit `Uploaded At`** | (a–c) work. (d) Note exactly what is possible | v2: suppliers must not delete uploads. If they can, we switch to one item per upload |
| MT-7 | A1 | In native My Tasks, try to **submit** the BASIC section with `Section Release Confirm` empty | Refused (Mandatory guard) | An accidental submit would freeze a section for good |
| MT-8 | A2, then A1 | A2 looks for the completeness confirmation; A1 confirms it | A2 doesn't have it (only A1 was assigned). A1 can submit only with all confirmation fields filled | Only contacts allowed to confirm get the task |
| MT-9 | A1 | Respond to query TEST-OP-01 (`Response Kind` = Answer, plus text) | Submit works; `Response Kind` is required | The query round |
| MT-10 | A1 | Acknowledge the notice | Submit works | The notice |
| MT-11 | A1 | Read the task e-mails from MT-1 to MT-10 | Neutral step names, no internal text | E-mail content |
| MT-12 | A1, Thomas | On each supplier step, note whether **Reject** or **Send back** is offered. Thomas: in the builder, open **ZZ Spike Assignee** and look for per-step switches (send-back, reject, e-mail). If there are any, switch one off, publish, and tell Claude | Record per step. Claude reads the draft and learns the setting's shape | A supplier must not be able to reject a Beiersdorf request; the switch shape can't be guessed |
| MT-13 | Thomas | Open the item history of the BASIC section after MT-6 | Each change shows who, when and old/new values | v2: changes traceable |
| MT-14 | Thomas | Withdraw TEST-B-0001 while B1 holds it (admin route or UI), then check B1's tasks | The task disappears and the item ends | How portal items can be closed. The real closure will come from the app (integration), tested in K-09 |

## After the tests

- **Results:** tell Claude. Claude records them in `BUILD-LOG.md` and changes the design where a blocking test failed.
- **Cleanup:** Claude deletes the test items and verifies the deletion. The supplier test users stay for the demo.
