# Integration skeletons for Thomas (22 Oct)

**Kissflow-internal.** This sheet covers your part, in the dev builder: create each integration, or add the new steps, with only the **trigger/action, the process and the connection**. Leave every field mapping and script empty. I fill those over the API, read everything back and test it. Then we both review it in the builder before it goes ON.

Name each step **exactly** as written here: my tooling finds the steps by name. Keep everything **OFF** until I say it's tested.

**Connections:**
- Kissflow Process steps: **"Kissflow Process - Thomas Access Keys"**. In prod, the service account's equivalent.
- User details: **"User Details - Thomas Access Keys"**.
- Run JavaScript and Email need no connection.

## Phase 1 (needed first)

### 1. NEW in the app (`CIQ_Digital_A00`): "CIQ Review completed – final release when all done"

**What it does:** when a review completes, it reads all the case's reviews live. If the latest round of every department is Completed, it requests the final release from the supplier and moves their request to "give the final release". Otherwise it stops with "No release yet (by design)". A reopened RMM round is simply the newest round, so no other integration is needed.

| # | Step name | Connector → trigger/action | Process |
|---|---|---|---|
| T | (trigger) | Kissflow Process → **When an item completes its workflow** | CIQ Review |
| 1 | `EB find reviews` | Kissflow Process → Search an item | CIQ Review |
| 2 | `EB find case` | Kissflow Process → Search an item | CIQ Case |
| 3 | `EB pick` | Run JavaScript | — |
| 4 | `EB find request` | Kissflow Process → Search an item | CIQP Request (portal process) |
| 5 | `EB release check` | Run JavaScript | — |
| 6 | `EB ask final release` | Kissflow Process → Update an item | CIQP Request |
| 7 | `EB record on case` | Kissflow Process → Update an item | CIQ Case |
| 8 | `EB history row` | Kissflow Dataform → Create and submit an item | CIQ Audit Event |
| 9 | `EB move request` | Kissflow Process → Approve an item | CIQP Request |

**[check in the UI]** whether an app integration can choose the portal process CIQP Request in steps 4, 6 and 9. Your example did the reverse, from the portal to CIQ Case, so it should work. If it can't, tell me: E-B then moves to the portal container.

### 2. (dropped) The "clear the RMM done mark" integration is no longer needed.

### 3. CHANGE in the app: "CIQ Review reopened to supplier request" (I-6)

Add **one step at the end**, after its current last step (the update of the request):

| # | Step name | Connector → action | Process |
|---|---|---|---|
| +1 | `I6 move request back` | Kissflow Process → Approve an item | CIQP Request |

**What it does:** with Release_Flag "Reopened", approving "give the final release" sends the request back to "keep the CIQ up to date" through the existing go-to.

## Phase 2 (after phase 1 is tested)

### 4. CHANGE in the portal (`CIQ_Supplier_Portal_A00`): "CIQP Completeness confirmed to case" (I-2)

Insert these steps **before the last step** (the Approve of the case), so the reviews exist even if the Approve fails:

| # | Step name | Connector → action | Process |
|---|---|---|---|
| a | `I2 find reviews` | Kissflow Process → Search an item | CIQ Review |
| b | `I2 plan reviews` | Run JavaScript | — |
| c | `I2 create reviews` | Kissflow Process → Create and submit items in bulk | CIQ Review |
| d | `I2 plan history rows` | Run JavaScript | — |
| e | `I2 create history rows` | Kissflow Dataform → create items in bulk, if offered; otherwise "Create and submit an item" | CIQ Audit Event |

**[check in the UI]** whether the Dataform connector offers a bulk create. If it doesn't, use the single create and tell me; I'll change the plan.

### 5. CHANGE in the portal: "CIQP Request changed to case" (request.changed)

Add at the end: the "data changed" mail to the RMM and the reviewers. The screen can't know the reviewers' e-mails, so this one goes from the integration.

| # | Step name | Connector → action | Process |
|---|---|---|---|
| +1 | `RC mail plan` | Run JavaScript | — |
| +2 | `RC reviewer contacts` | User details → Get user data | — |
| +3 | `RC mail text` | Run JavaScript | — |
| +4 | `RC send mail` | Email → Send an email (the same step as in "Mail Integration - Thomas") | — |

## New fields (I create them over the API, unless you prefer the builder)

- `Review_Depts` (text): on CIQP Request (Details section) and CIQ Case.
- `Raised_By_Email` (text): on CIQ Open Point (Details section, writable at Start) and CIQP Query.

## When you're done

Tell me which numbers are done. I then fill in the mappings and scripts, read them back and test each one in dev. ZZT items only, and test mails only to you.
