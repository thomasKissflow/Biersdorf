# Native notifications: set-up guide (both containers)

**Kissflow-internal.** Written 22 Oct for Thomas to set up by hand. It covers only Kissflow's own notifications (Notification settings). The CIQ e-mails that a hand-off sends through "Mail Integration - Thomas" are built over the API, not here (§6).

**Sources** (read, not changed): the flow drafts of 20–21 Oct (`night-2026-10-21/snapshot/`, `night-2026-10-21/backups/`, `night-2026-10-20/live/`), the hand-off specs and scripts, plan v6, and the custom screens' routers and mail texts in `prototype/src`. Step names, field names and deadlines below are copied from those drafts. If you changed a flow in the builder after 21 Oct, the UI wins.

**Tags:**
- **[check in the UI]**: something I could not see from the files. The guide gives a fallback each time.
- **Pxx / Axx**: the notifications to keep or add (portal / app). The tests in §5 use the same numbers.

## 0. The short version

| Container | Keep or add | Everything else |
|---|---|---|
| Portal | **P-1** CIQP Request, "Item assigned to a user", only at "Supplier: fill in the CIQ" · **P-2** the same event, only at "Supplier: give the final release" · **P-3 / P-4** CIQP Request deadline alerts · **P-5** CIQP Query, "Item assigned to a user" · **P-6 / P-7** CIQP Query deadline alerts | OFF |
| App | **A-1** CIQ Review, "Item assigned to a user" (department reviews) · **A-2** the same event for the RMM review (optional split) · **A-3** CIQ Case, "Item completed its workflow" → Owner RMM | OFF |

**Read this before P-2.** The request reaches "Supplier: give the final release" only when a supplier contact **opens the portal**: the supplier's own screen moves it there when it loads (`portal/data/liveActions.ts`, `moveAtReleaseSteps`). The release request itself (I-5, release.requested) is a field update, and no native event fires on it. So P-2 arrives after the first contact has already opened the request. It still reaches the other contacts, and it starts the 3-day deadline. The mail that actually announces the release request has to be a webhook mail (W-8 in §6). Once W-8 is live, switch P-2 off and keep P-3 and P-4.

## 1. Where

| Container | Page (on the account's host: dev `dev-beiersdorf`, prod after the push) |
|---|---|
| App `CIQ_Digital_A00` | App builder → Notification settings: `…/appbuilder/CIQ_Digital_A00/notificationsettings/all` |
| Portal `CIQ_Supplier_Portal_A00` | App builder → Notification settings: `…/appbuilder/CIQ_Supplier_Portal_A00/notificationsettings/all` |

**Order:**
1. Do dev first.
2. Run the tests in §5.
3. After the next dev → prod push, open both pages in prod and compare. **[check in the UI]** whether notification settings travel with the push. If they don't, repeat §2–§4 in prod.

**The events of a process** (as observed live on 22 Oct). The guide refers to them by number:

| # | Event | # | Event |
|---|---|---|---|
| E1 | Item assigned to a user | E6 | Item breached its deadline |
| E2 | Item completed its workflow | E7 | Item breached its deadline (notification alert) |
| E3 | Item rejected | E8 | Item approaching its deadline (notification alert) |
| E4 | Item withdrawn by an initiator | E9 | Item breached its deadline (escalation) |
| E5 | Item reassigned to a user | E10 | Item approaching its deadline (escalation) |

**[check in the UI]** I had E7–E10 in a shortened form ("… breached (notification alert)"). Match them by the words in brackets.

**A form** has one event, "Form submitted".

**Every notification you keep:**
- **Content:** Email on, Web app & push on, Bot off.
- **Redirection:** "Custom: open a route inside your custom UI", never "System". "System" opens Kissflow's own item or task form, and a submit there skips the CIQ hand-offs.

## 2. Switch OFF

### App `CIQ_Digital_A00`

| Flow | Type | Switch off | Keep (§3) | Why |
|---|---|---|---|---|
| CIQ Case | Process | E1, E3–E10 | E2 → A-3 | Both case steps, "Waiting for supplier: CIQ" and "Beiersdorf review and final release", are held by the role CIQ Integration Service (you are its only member). E1 would mail you for every case. No deadlines are set on the case |
| CIQ Review | Process | E2–E10 | E1 → A-1 (and A-2) | Completing a review needs no mail; the review steps have no deadline |
| CIQ Open Point | Process | all (E1–E10) | — | Its steps are assigned to the raiser, who just raised the point. The supplier's answer reaches the raiser by webhook mail (W-1) |
| CIQ Change Request | Process | all | — | Not used in this version |
| CIQ Case - Thomas | Process | all (recommended) | — | Your sandbox: your call |
| CIQ ZZ Spike Case | Process | all | — | Test flow |
| CIQ ZZ Spike Point | Process | all | — | Test flow |
| CIQ Audit Event | Form | Form submitted | — | The screens write a row for every action |
| CIQ Internal Note | Form | Form submitted | — | |
| CIQ RMES Regulatory | Form | Form submitted | — | |
| CIQ RMES Safety | Form | Form submitted | — | |
| CIQ Scope Run | Form | Form submitted | — | |
| CIQ Supplier | Form | Form submitted | — | |
| CIQ Config Version | Form | Form submitted | — | |
| CIQ Section | Form | Form submitted | — | Not used |
| CIQ Case Data | Form | Form submitted | — | Not used |
| CIQ Service Request | Form | Form submitted | — | Not used |
| CIQ Mail Outbox | Form | Form submitted | — | Not used |
| CIQ ZZ Spike Log | Form | Form submitted | — | Test flow |
| CIQ ZZ Spike Register | Form | Form submitted | — | Test flow |

### Portal `CIQ_Supplier_Portal_A00`

| Flow | Type | Switch off | Keep (§3, §4) | Why |
|---|---|---|---|---|
| CIQP Request | Process | E2, E3, E4, E5, E6, E9, E10 | E1 → P-1, P-2 · E8 → P-3 · E7 → P-4 | The request never completes (it waits at "Supplier: view the released CIQ"). A cancelled request is only labelled and locked; nothing is withdrawn. There are no escalations |
| CIQP Query | Process | E2, E3, E4, E5, E6, E9, E10 | E1 → P-5 · E8 → P-6 · E7 → P-7 | E2 fires both on the supplier's own answer and when Beiersdorf closes the question. The closed question has its own webhook mail (W-4) |
| CIQP Final Release | Process | all | — | Replaced on 16 Oct by the step in CIQP Request |
| ZZZ (Not in Use) CIQP Notice | Process | all | — | |
| ZZZ (Not in Use) CIQP Completeness Confirmation | Process | all | — | |
| ZZZ (Not in Use) CIQP Change Request | Process | all | — | |
| ZZZ (Not in Use) CIQP Section | Process | all | — | |
| ZZ Spike Assignee | Process | all | — | Test flow |
| CIQP Help Article | Form | Form submitted | — | |

- **A flow that is in neither table** (created after 21 Oct): switch all its notifications off.
- **E6** (the plain "Item breached its deadline") stays off on CIQP Request and CIQP Query too. P-4 and P-7 are the overdue mails: E6 would add a second one on the due day. **[check in the UI]** if the overdue alert of test T-7 doesn't arrive, switch E6 on instead, with P-4's or P-7's text.
- **E5** (reassigned) is off, as agreed. An admin who reassigns a supplier task by hand must tell the new contact.

## 3. Keep or add

### How to fill in a notification

- **Placeholders:** the texts use field ids in double braces (`{{Case_Code}}`) and the system fields `{{_current_step}}`, `{{item_subject}}` and `{{flow_name}}`. Insert each one with the editor's field picker. **[check in the UI]** If the picker inserts another token (for example the label "Case Code"), use the picker's token.

  | Placeholder | Label in the picker | Flow |
  |---|---|---|
  | `{{Case_Code}}` | Case Code | all |
  | `{{Trade_Name}}` | Trade Name | CIQP Request, CIQ Review, CIQ Case (not CIQP Query) |
  | `{{Supplier_Due_Date}}` | Supplier Due Date | CIQP Request, CIQP Query |
  | `{{BDF_Contact_Name}}`, `{{BDF_Contact_Email}}` | BDF Contact Name, BDF Contact Email | CIQP Request (I-1 copies them from the case) |
  | `{{Kind_Label}}` | Kind Label ("Question", "Document request" or "Additional section") | CIQP Query |
  | `{{Ref_Label}}` | Ref Label (the questionnaire place the question refers to) | CIQP Query |
  | `{{Question_Text}}` | Question Text | CIQP Query |
  | `{{Round_No}}` | Round No | CIQP Query, CIQ Review |
  | `{{Supplier_Code}}`, `{{Activation_Kind}}`, `{{Activation_Reason}}` | Supplier Code, Activation Kind ("Completeness" or "Reopened"), Activation Reason | CIQ Review |
  | `{{Final_Release_At}}`, `{{Final_Release_By_Name}}`, `{{Final_Release_By_Email}}` | Final Release At, Final Release By Name, Final Release By Email | CIQ Case |

- **Kept out of supplier mails on purpose:** Supplier Justification (it can name an internal finding; the portal shows it only when it doesn't refer to a finding, a filter a mail can't apply), Responsible Department and Responsible Name, every JSON field, and `{{_current_step}}` (its values read "Supplier: …").
- **The supplier texts:** every one tells the contact to open the CIQ Supplier Portal and work there. They name "the button in this e-mail, or the address from your portal invitation" rather than a fixed link, because the portal address differs between dev and prod. If you want a direct link, add it per environment.
- **Conditions ("Trigger based on conditions"):** P-1 and P-2 need a condition on the step. The first choice is the system field `_current_step`. **[check in the UI]** whether conditions offer `_current_step`, and whether it already holds the new step when "Item assigned" fires. Each condition has a fallback on the item's own fields, which separates the steps as well:

  | Step the request enters | Completeness Confirm | Release Flag | Release At |
  |---|---|---|---|
  | Supplier: fill in the CIQ | empty | empty | empty |
  | Supplier: keep the CIQ up to date (after fill-in) | Confirmed | empty | empty |
  | Supplier: give the final release | Confirmed | Requested | empty (I-5 clears it) |
  | Supplier: keep the CIQ up to date (after a reopen) | Confirmed | Reopened | empty |
  | Supplier: view the released CIQ | Confirmed | Requested | set by the supplier's release |

- **One notification per event or several? [check in the UI]** P-1 and P-2 are two notifications on the same event (E1), and P-3 and P-4 have two text variants each. If the UI holds only one notification per event, use the **merged** versions given under P-1/P-2 and P-3/P-4.
- **Redirection:**
  - The custom screens use hash routes, and both open the case by its **case code**, not by the Kissflow item id. So a route can carry `{{Case_Code}}`, while `{{_id}}` would not work.
  - A question can't be opened directly: the portal's `?op=` link needs the open point's key, and CIQP Query holds it only with its round suffix (`Query_Key` = `<key>-R<round>`), which a placeholder can't strip. My requests lists the question under Your tasks (it is answered right there); the request page shows it under Questions for you.
  - **[check in the UI]**
    - Does the custom route accept a placeholder and a query string?
    - Does the route reach the screens? They use their own hash router, not Kissflow's app router. A mail deep link into a custom route has never been proven (test S-9).
    - What to try: `/portal/case/{{Case_Code}}` first; if the screen opens on its home page or not at all, try `#/portal/case/{{Case_Code}}`; if neither works, use the fallback route.
    - Every unknown route lands on the screen's home page, which is acceptable: the mail names the case.

### Portal: CIQP Request

#### P-1 · Item assigned to a user · "Supplier: fill in the CIQ"

| Setting | Value |
|---|---|
| Flow / event | CIQP Request / E1 Item assigned to a user |
| Condition | `_current_step` equals `Supplier: fill in the CIQ`. Fallback: `Completeness Confirm` is empty |
| Recipient | Assignee. Fallback, if the UI has no "Assignee": the user field **Assigned Contacts** (every named contact) |
| When it fires | When I-1 creates and submits the request after the RMM starts the case |
| Redirection | Custom route `/portal/case/{{Case_Code}}`. Fallback `/portal` (My requests) |

Subject:
```
Please fill in the CIQ for {{Trade_Name}} ({{Case_Code}})
```
Body:
```
Hello,

Beiersdorf asks you to fill in the Cosmetic Ingredient Questionnaire (CIQ) for {{Trade_Name}} ({{Case_Code}}).

Due date: {{Supplier_Due_Date}}

How to do it:
1. Open the CIQ Supplier Portal (the button in this e-mail, or the address from your portal invitation). The request is on My requests, under Your tasks.
2. Answer the questions. The sections that apply open as you answer. Upload each document at the question it belongs to.
3. When everything is complete, confirm completeness in the portal.

Please work only in the CIQ Supplier Portal. If a button in this e-mail opens a form instead of the portal page, close it and go to the portal: answers entered in such a form may not reach Beiersdorf.

Your Beiersdorf contact: {{BDF_Contact_Name}}, {{BDF_Contact_Email}}

This is an automatic message. Please do not reply to it.
```
Web app & push:
```
Please fill in the CIQ for {{Trade_Name}} ({{Case_Code}}) by {{Supplier_Due_Date}}.
```

#### P-2 · Item assigned to a user · "Supplier: give the final release"

Read the timing note in §0 first.

| Setting | Value |
|---|---|
| Flow / event | CIQP Request / E1 Item assigned to a user (a second notification on the same event) |
| Condition | `_current_step` equals `Supplier: give the final release`. Fallback: `Release Flag` equals `Requested` AND `Release At` is empty |
| Recipient | Assignee. Fallback: the user field **Release Contacts** |
| When it fires | When a contact's portal screen moves the request into the release step, after Beiersdorf requested the release |
| Redirection | Custom route `/portal/case/{{Case_Code}}`. Fallback `/portal` |

Subject:
```
{{Case_Code}}: please give the final release
```
Body:
```
Hello,

Beiersdorf has completed its review of the CIQ for {{Trade_Name}} ({{Case_Code}}). The questionnaire is now locked.

Please check it and give the final release in the CIQ Supplier Portal (the button in this e-mail, or the address from your portal invitation): My requests, under Your tasks. With the release, the CIQ is frozen.

If something must still change, do not give the release. Contact {{BDF_Contact_Name}} ({{BDF_Contact_Email}}) instead; Beiersdorf can then open the questionnaire again.

Please give the release only in the CIQ Supplier Portal, not in a form a button in this e-mail may open.

This is an automatic message. Please do not reply to it.
```
Web app & push:
```
{{Case_Code}}: Beiersdorf asks for your final release of the CIQ for {{Trade_Name}}.
```

#### P-1/P-2 merged (only if the UI holds one notification per event)

- **Condition:** `_current_step` equals `Supplier: fill in the CIQ` OR equals `Supplier: give the final release`.
  - Fallback: (`Completeness Confirm` is empty) OR (`Release Flag` equals `Requested` AND `Release At` is empty).
  - Without any condition, the contacts would also get this mail at "keep the CIQ up to date" and at "view the released CIQ".
- **Recipient:** Assignee.
- **Redirection:** as P-1.

Subject:
```
{{Case_Code}}: Beiersdorf needs your action on the CIQ for {{Trade_Name}}
```
Body:
```
Hello,

You have a new task on the Cosmetic Ingredient Questionnaire (CIQ) for {{Trade_Name}} ({{Case_Code}}): filling in the questionnaire, or giving the final release once Beiersdorf has completed its review.

Please open the CIQ Supplier Portal (the button in this e-mail, or the address from your portal invitation). The task and its due date are on My requests, under Your tasks.

Please work only in the CIQ Supplier Portal. If a button in this e-mail opens a form instead of the portal page, close it and go to the portal: anything entered in such a form may not reach Beiersdorf.

Your Beiersdorf contact: {{BDF_Contact_Name}}, {{BDF_Contact_Email}}

This is an automatic message. Please do not reply to it.
```
Web app & push:
```
{{Case_Code}}: you have a new task on the CIQ for {{Trade_Name}}.
```

### Portal: CIQP Query

#### P-5 · Item assigned to a user · "Supplier: respond"

| Setting | Value |
|---|---|
| Flow / event | CIQP Query / E1 Item assigned to a user |
| Condition | none: "Supplier: respond" is its only step with an assignee. (Optional: `_current_step` equals `Supplier: respond`) |
| Recipient | Assignee. Fallback: the user field **Assigned Contacts** |
| When it fires | When op.round creates and submits a query: round 1 (a new question), and every later round (Beiersdorf needs more on an answer) |
| Redirection | Custom route `/portal/case/{{Case_Code}}` (the request page; the question is under Questions for you). Fallback `/portal` (My requests; the question is under Your tasks) |

Subject:
```
{{Case_Code}}: {{Kind_Label}} from Beiersdorf
```
Body:
```
Hello,

Beiersdorf has sent you a request on the CIQ {{Case_Code}}.

Type: {{Kind_Label}}
About: {{Ref_Label}}
Round: {{Round_No}} (from round 2 on, Beiersdorf needs more information on your earlier answer)

Question:
{{Question_Text}}

Please answer by {{Supplier_Due_Date}}.

Open the CIQ Supplier Portal (the button in this e-mail, or the address from your portal invitation). The question is on My requests, under Your tasks, and on the request, under Questions for you. If a document is asked for, upload it at the question.

Please answer only in the CIQ Supplier Portal, not in a form a button in this e-mail may open: an answer given there may not reach Beiersdorf.

This is an automatic message. Please do not reply to it.
```
Web app & push:
```
{{Case_Code}}: {{Kind_Label}} from Beiersdorf on {{Ref_Label}}. Please answer by {{Supplier_Due_Date}}.
```

### App: CIQ Review

The reviews are started by the screen: the first RMM who loads the app after the supplier confirmed completeness creates them (the load-time start runs for the RMM role only, for every case in review, and only for the departments the case's scope activates, plus RMM). The RMM's "Reopen my review" creates a new RMM review round. That's when these mails go out.

#### A-1 · Item assigned to a user · the department reviews

| Setting | Value |
|---|---|
| Flow / event | CIQ Review / E1 Item assigned to a user |
| Condition | With A-2: `Review Dept` is not equal to `RMM`. Without A-2: none (all six review steps) |
| Recipient | Assignee: the members of the step's role (CIQ Regulatory Reviewer, CIQ Safety Reviewer, CIQ QM Reviewer, CIQ Microbiology Reviewer, CIQ Sustainability Reviewer; and CIQ RMM for "Review – RMM" without A-2). **[check in the UI]** If there is no "Assignee": one notification per department, condition `Review Dept` equals `REG` / `SAF` / `QM` / `MIC` / `SUS` / `RMM`, recipient the matching role |
| Redirection | Custom route `/review/{{Case_Code}}` (the review workspace). Fallback `/review` (My reviews) |

Subject:
```
{{Case_Code}}: {{_current_step}} of {{Trade_Name}}
```
Body:
```
Hello,

A CIQ review is waiting for you: {{_current_step}} of {{Trade_Name}} ({{Case_Code}}), supplier {{Supplier_Code}}.
Round {{Round_No}} ({{Activation_Kind}}). {{Activation_Reason}}

Open the CIQ app and work in My reviews. Please do not complete the review in the Kissflow task form a button in this e-mail may open: only the CIQ app's own screens record your review and pass it on.

This is an automatic message from the CIQ app.
```
Web app & push:
```
{{Case_Code}}: {{_current_step}} of {{Trade_Name}} is waiting for you.
```

#### A-2 · Item assigned to a user · the RMM review (optional split)

**Why split:**
- "Review – RMM" is assigned to the role CIQ RMM, so without the split every RMM gets every case's RMM-review mail.
- The screen also writes the case owner into the review's **Assignee User** field.
- The RMM must complete its own review before the release request goes out.

| Setting | Value |
|---|---|
| Flow / event | CIQ Review / E1 Item assigned to a user (second notification) |
| Condition | `Review Dept` equals `RMM` |
| Recipient | the user field **Assignee User** (the case's Owner RMM) |
| Redirection | Custom route `/review/{{Case_Code}}`. Fallback `/rmm` (the RMM dashboard) |

Subject:
```
{{Case_Code}}: your RMM review of {{Trade_Name}}
```
Body:
```
Hello,

Your RMM review of the whole CIQ for {{Trade_Name}} ({{Case_Code}}) is open. Round {{Round_No}} ({{Activation_Kind}}). {{Activation_Reason}}

The final release request goes to the supplier once every review of the latest round is completed, yours included.

Open the CIQ app and work in My reviews. Please do not complete the review in the Kissflow task form a button in this e-mail may open.

This is an automatic message from the CIQ app.
```
Web app & push:
```
{{Case_Code}}: your RMM review of {{Trade_Name}} is open.
```

### App: CIQ Case

#### A-3 · Item completed its workflow → Owner RMM

| Setting | Value |
|---|---|
| Flow / event | CIQ Case / E2 Item completed its workflow |
| Condition | `Case Phase` equals `Completed`. I-7 writes it just before its "Skip and complete". A cancelled case never completes in Kissflow, so this is a guard against an admin completing a case by hand |
| Recipient | the user field **Owner RMM** |
| When it fires | When I-7 completes the case after the supplier's final release. The final PDF mail (subject "{{Case_Code}}: final document ready", from the Apps Script) follows 10–20 min later: different subject, no overlap |
| Redirection | Custom route `/cases/{{Case_Code}}?tab=final-document`. Fallbacks: `/cases/{{Case_Code}}`, then `/rmm` |

Subject:
```
{{Case_Code}}: final release received
```
Body:
```
Hello,

The supplier gave the final release of {{Trade_Name}} ({{Case_Code}}) on {{Final_Release_At}} ({{Final_Release_By_Name}}, {{Final_Release_By_Email}}). The case is completed.

The final document (PDF) follows in a separate e-mail, usually within 10 to 20 minutes. It is also filed on the case.

Open the case in the CIQ app to see the final document and the history.

This is an automatic message from the CIQ app.
```
Web app & push:
```
{{Case_Code}}: the supplier gave the final release of {{Trade_Name}}. The case is completed.
```

## 4. Deadlines

### What is set (from the drafts of 21 Oct)

| Flow · step | Deadline | Alerts (set in the step's deadline) | Alert recipient |
|---|---|---|---|
| CIQP Request · Supplier: fill in the CIQ | the field Supplier Due Date | 7 days before · 1 day after | `Assigned_Contacts.get(0)`: **the first contact only** |
| CIQP Request · Supplier: give the final release | 3 days from entering the step | 1 day before · 1 day after | `Release_Contacts.get(0)`: the first contact only |
| CIQP Query · Supplier: respond | the field Supplier Due Date | 2 days before · 1 day after | `Assigned_Contacts.get(0)`: the first contact only |
| Every app step | none | — | — |

- **No escalations anywhere.** So E9 and E10 stay off.
- **The app's integration-held case steps have no deadline on purpose:** a native alert there would go to you, the CIQ Integration Service member. Beiersdorf-side reminders were planned as the daily scheduler (I-9), which is not built.
- **The release deadline starts late.** It starts only when a contact's screen moves the request into the release step (§0).
- **Only the first contact gets the alerts.** **[check in the UI]**
  - In the deadline editor: can an alert's recipient be the whole field (Assigned Contacts / Release Contacts)? On 15 Oct the builder itself produced `.get(0)`, which suggests it takes a single user.
  - In Notification settings: do E7 and E8 have their own recipient choice? If they do, pick Assignee if offered; otherwise Assigned Contacts for the fill-in variants, P-6 and P-7, and **Release Contacts** for the release variants of P-3 and P-4 (the release step is assigned to Release Contacts), so that every contact gets them.

### Keep on: E8 and E7 on both portal processes

On CIQP Request, both deadline steps share the event. If the UI allows two notifications per event, use the fill-in and release variants. Otherwise use the merged text. The conditions (P-3 and P-4 alike):
- **Fill-in variant:** the condition of P-1, AND `Case Phase Label` is not equal to `Cancelled`.
- **Release variant:** the condition of P-2, AND `Release Flag` equals `Requested` (even with `_current_step`), AND `Case Phase Label` is not equal to `Cancelled`.
- **Merged:** `Case Phase Label` is not equal to `Cancelled` AND `Release Flag` is not equal to `Reopened`.

Why: a cancelled case only labels and locks its request (case.cancelled writes `Case_Phase_Label` "Cancelled"), so the request stays at its step and its deadline keeps running. After a reopen (I-6 writes `Release_Flag` "Reopened"), the request stays at "give the final release" until a contact's screen loads and moves it back, so without the flag check the release reminder would still ask for a release that was withdrawn. **[check in the UI]** whether E7 and E8 take conditions at all.

#### P-3 · CIQP Request · E8 Item approaching its deadline (notification alert)

Fill-in variant (condition: see above). Subject:
```
Reminder: the CIQ for {{Trade_Name}} ({{Case_Code}}) is due on {{Supplier_Due_Date}}
```
Body:
```
Hello,

A friendly reminder: the Cosmetic Ingredient Questionnaire (CIQ) for {{Trade_Name}} ({{Case_Code}}) is due on {{Supplier_Due_Date}}.

Please complete it and confirm completeness in the CIQ Supplier Portal (the button in this e-mail, or the address from your portal invitation). Work only in the portal, not in a form a button in this e-mail may open.

If you need more time, please contact {{BDF_Contact_Name}} ({{BDF_Contact_Email}}).

This is an automatic message. Please do not reply to it.
```
Release variant (condition: see above). Subject:
```
Reminder: please give the final release for {{Trade_Name}} ({{Case_Code}})
```
Body:
```
Hello,

A friendly reminder: Beiersdorf is waiting for your final release of the CIQ for {{Trade_Name}} ({{Case_Code}}). It is due tomorrow.

Please check the questionnaire and give the final release in the CIQ Supplier Portal (the button in this e-mail, or the address from your portal invitation). If something must still change, contact {{BDF_Contact_Name}} ({{BDF_Contact_Email}}) instead.

This is an automatic message. Please do not reply to it.
```
Merged (one notification per event). Subject:
```
Reminder: an open task on the CIQ for {{Trade_Name}} ({{Case_Code}})
```
Body:
```
Hello,

A friendly reminder: you have an open task on the CIQ for {{Trade_Name}} ({{Case_Code}}) that is due soon. The task and its due date are on My requests, under Your tasks, in the CIQ Supplier Portal (the button in this e-mail, or the address from your portal invitation).

Please work only in the portal, not in a form a button in this e-mail may open. If you need more time, please contact {{BDF_Contact_Name}} ({{BDF_Contact_Email}}).

This is an automatic message. Please do not reply to it.
```
Web app & push (all variants):
```
Reminder: an open task on the CIQ for {{Trade_Name}} ({{Case_Code}}) is due soon.
```
Redirection: as P-1.

#### P-4 · CIQP Request · E7 Item breached its deadline (notification alert)

Fill-in variant. Subject:
```
Overdue: the CIQ for {{Trade_Name}} ({{Case_Code}}) was due on {{Supplier_Due_Date}}
```
Body:
```
Hello,

The Cosmetic Ingredient Questionnaire (CIQ) for {{Trade_Name}} ({{Case_Code}}) was due on {{Supplier_Due_Date}} and is not complete yet.

Please complete it and confirm completeness in the CIQ Supplier Portal (the button in this e-mail, or the address from your portal invitation) as soon as possible. If you need more time, please contact {{BDF_Contact_Name}} ({{BDF_Contact_Email}}).

Please work only in the portal, not in a form a button in this e-mail may open.

This is an automatic message. Please do not reply to it.
```
Release variant. Subject:
```
Overdue: your final release for {{Trade_Name}} ({{Case_Code}})
```
Body:
```
Hello,

Beiersdorf is still waiting for your final release of the CIQ for {{Trade_Name}} ({{Case_Code}}).

Please check the questionnaire and give the final release in the CIQ Supplier Portal (the button in this e-mail, or the address from your portal invitation). If something must still change, contact {{BDF_Contact_Name}} ({{BDF_Contact_Email}}) instead.

This is an automatic message. Please do not reply to it.
```
Merged. Subject:
```
Overdue: an open task on the CIQ for {{Trade_Name}} ({{Case_Code}})
```
Body:
```
Hello,

A task on the CIQ for {{Trade_Name}} ({{Case_Code}}) is overdue. The task and its due date are on My requests, under Your tasks, in the CIQ Supplier Portal (the button in this e-mail, or the address from your portal invitation).

Please complete it in the portal as soon as possible, not in a form a button in this e-mail may open. If you need more time, please contact {{BDF_Contact_Name}} ({{BDF_Contact_Email}}).

This is an automatic message. Please do not reply to it.
```
Web app & push:
```
Overdue: an open task on the CIQ for {{Trade_Name}} ({{Case_Code}}).
```
Redirection: as P-1.

#### P-6 · CIQP Query · E8 Item approaching its deadline (notification alert)

Subject:
```
Reminder: Beiersdorf's question on {{Ref_Label}} ({{Case_Code}}) is due on {{Supplier_Due_Date}}
```
Body:
```
Hello,

A friendly reminder: Beiersdorf's {{Kind_Label}} on {{Ref_Label}} (CIQ {{Case_Code}}) is due on {{Supplier_Due_Date}}.

Please answer it in the CIQ Supplier Portal (the button in this e-mail, or the address from your portal invitation): the question is on My requests, under Your tasks. Work only in the portal, not in a form a button in this e-mail may open.

This is an automatic message. Please do not reply to it.
```
Web app & push:
```
Reminder: Beiersdorf's question on {{Ref_Label}} ({{Case_Code}}) is due on {{Supplier_Due_Date}}.
```
Redirection: as P-5.

#### P-7 · CIQP Query · E7 Item breached its deadline (notification alert)

Subject:
```
Overdue: Beiersdorf's question on {{Ref_Label}} ({{Case_Code}}) was due on {{Supplier_Due_Date}}
```
Body:
```
Hello,

Beiersdorf's {{Kind_Label}} on {{Ref_Label}} (CIQ {{Case_Code}}) was due on {{Supplier_Due_Date}} and has no answer yet.

Please answer it in the CIQ Supplier Portal (the button in this e-mail, or the address from your portal invitation) as soon as possible: the question is on My requests, under Your tasks. If you cannot provide what is asked, you can say so in your answer.

This is an automatic message. Please do not reply to it.
```
Web app & push:
```
Overdue: Beiersdorf's question on {{Ref_Label}} ({{Case_Code}}).
```
Redirection: as P-5.

## 5. Tests (dev, one per notification)

**Before you start:**
- Both test runners may be writing in dev. Pause them:
  - the portal runner with `kissflow-build/night-2026-10-21/HOLD` (present now);
  - the app runner with `kissflow-build/ciq-digital/tests-2026-10-21/HOLD` (present now).
  Remove the files only when the sessions should go on.
- In dev you are the RMM, the CIQ Integration Service member and the portal contact of the dev supplier, so every mail below reaches you. Have the mailbox and the portal's bell open.
- A role switch in the dev top bar moves you out of your other roles. After any switch, put yourself back in "CIQ Integration Service" (app; without it I-2 fails) and "Portal admin" (portal).
- **Where a portal button lands depends on your portal role.** While you hold the portal Admin role, the portal opens as Admin (Admin wins over Supplier), and a `/portal/…` route shows the admin's demo preview ("This request is not available"), not your request. Check the landing of P-1 to P-7 with Supplier picked in the portal's "Role:" switch (a real switch: switch back to Portal admin afterwards).
- **[check in the UI]** In dev you are also the user who causes every event (the RMM screen, and the integrations' connection acts as you). If T-1, T-3 or T-4 brings nothing, Kissflow may skip the user who made the change: retest with a second user as the contact or reviewer.
- For each mail, record three things: it arrived, its placeholders are filled, and where its button lands (route, home page, or Kissflow form).

| Test | Notification | Do | Expect |
|---|---|---|---|
| T-1 | P-1 | App, as RMM: start a new ZZT case for the dev supplier (your portal user as contact), Supplier Due Date about 10 days ahead | Within about a minute: "Please fill in the CIQ for …", every placeholder filled, plus a portal web notification. The button opens the portal screen on the request (or on My requests); never a Kissflow form. Also checks that E1 fires on an item that an integration created and submitted |
| T-2 | P-1 condition | Portal, as Supplier: answer, then confirm completeness on T-1's request | **No** mail for "keep the CIQ up to date". The case moves to review |
| T-3 | A-1, A-2 | Through user management (not the dev role switch), add yourself to one reviewer role whose department T-1's case activates (only those departments get a review), for example CIQ Safety Reviewer. Then load the app as RMM | A-2 "your RMM review of …" to you as owner (only to you if the split works). A-1 "… Review – Safety of …" to the Safety role's members. Each button opens `/review/<case>` or My reviews. Remove the extra role afterwards |
| T-4 | P-5 | App: raise an open point to the supplier on T-1's case, supplier due date 3 days ahead | "…: Question from Beiersdorf", with the question, the reference and the due date. **No** mail to you as the raiser (CIQ Open Point is off) |
| T-5 | P-5, round 2 | Portal: answer the question. App: return it as not enough | A second P-5 mail, "Round: 2". **No** "completed" mail for the answered query |
| T-6 | P-6 | Leave T-4's or T-5's query unanswered until 2 days before its due date | "Reminder: Beiersdorf's question on …". **[check in the UI]** whether the alert is sent at once when the step starts inside the alert window |
| T-7 | P-7 | The same query, 1 day after its due date | "Overdue: Beiersdorf's question on …". If nothing arrives, see E6 in §2 |
| T-8 | P-3, P-4 | A case with Supplier Due Date 8 days ahead, left at fill-in | The 7-days-before reminder the next day; the overdue mail 1 day after the due date. Slow: let it run over the weekend on a ZZT case |
| T-9 | P-2, P-3/P-4 release variants | Run the main journey to the release request (`TEST-GUIDE-PROD.md` §1, steps up to 13): all latest-round reviews completed, the RMM loads the app. Then open the portal as Supplier | P-2 "please give the final release" right after the portal load (timing as in §0). The release reminder 2 days later if not released |
| T-10 | A-3 | Give the final release (TEST-GUIDE-PROD §1 step 14) | "…: final release received" to Owner RMM (this checks that I-7's "Skip and complete" counts as completed), and the button opens the case's Final document tab. The separate PDF mail comes 10–20 min later in prod only: in dev no PDF trigger runs (final-pdf README: don't install it in dev), so it comes only from a `runOnce` on that case |
| T-11 | everything off | During T-1 … T-10 | **No** mails for: the two CIQ Case steps (you as Integration service); CIQ Open Point; any form submit (audit rows, notes, supplier, scope run, RMES rows); CIQP Request at "keep the CIQ up to date" and "view the released CIQ"; a completed CIQP Query |
| T-12 | prod | After the push | Both prod Notification settings pages match this guide (or repeat §2–§4) |

**Clean-up:** add the ZZT cases of these tests to the clean-up list, or delete them by hand.

## 6. Not set up here: the webhook mails (built over the API)

These go through "Mail Integration - Thomas" (app container), sent by the hand-off integration that applies the change. Nothing to do in Notification settings.

| # | Event | To | Sent by |
|---|---|---|---|
| W-1 | The supplier answered a question | the raiser | query.answered (I-4) |
| W-2 | The supplier changed data after completeness | the case's Beiersdorf side (RMM owner and/or reviewers: to decide) | request.changed |
| W-3 | A question was edited | supplier contacts | op.edited |
| W-4 | A question was closed, no answer needed | supplier contacts | op.closed |
| W-5 | The release request was withdrawn (a review was reopened) | supplier contacts | review.reopened (I-6) |
| W-6 | The request was withdrawn (the case was cancelled) | supplier contacts | case.cancelled |
| W-7 | A change report after the release | RMM owner | request.changed (completed case) |
| **W-8 (proposed)** | **Beiersdorf requests the final release** | supplier contacts (Release Contacts) | release.requested (I-5) |

- **W-8 is not in the agreed list,** but no native event can announce the release request (§0). Once W-8 is live, switch P-2 off.
- **Not covered by any mail in this version:**
  - an accepted answer;
  - a reactivated case;
  - @-mentions in internal notes;
  - reviewers told of a cancellation;
  - the supplier's release receipt;
  - a review handed to a colleague (the handover is a field write, and the task stays with the role);
  - a contact named on the case later (case.contacts is not built);
  - Beiersdorf-side reminders and escalations (the I-9 scheduler is not built).

## 7. Everything marked "check in the UI"

1. **`_current_step` in conditions:** whether it is offered and holds the new step when E1 fires (P-1, P-2, the P-3/P-4 variants). Fallback: the field conditions in §3.
2. **Notifications per event:** whether one event can carry several (P-1 + P-2, A-1 + A-2, the variants). Otherwise use the merged texts, and give A-1 no condition.
3. **"Assignee" as a recipient of E1.** Fallbacks: Assigned Contacts or Release Contacts (portal), one notification per department role (CIQ Review).
4. **The deadline alerts (E7, E8):** whether they have their own recipient choice, and whether they follow the deadline's recipient (`.get(0)`, the first contact only). Also whether the deadline editor accepts the whole MultiUser field.
5. **The E7–E10 names,** which I had only in shortened form.
6. **E6 "Item breached its deadline":** whether it is a separate due-day mail. It is kept off; if T-7 gets no overdue alert, switch it on instead.
7. **Placeholder tokens:** `{{Field_Id}}` as written, or the picker's label token. Also whether `{{_current_step}}` renders the step name and how dates render.
8. **The custom route:** whether it takes `{{Case_Code}}` and `?tab=…`, and whether it reaches the screens' hash router (`/…`, then `#/…`, else the fallback route). Mail deep links (S-9) were never proven.
9. **The button:** whether the e-mail shows one for the redirection. The texts work without it.
10. **Integration-made items:** whether E1 fires on items an integration creates and submits (I-1, op.round). Tested by T-1 and T-4.
11. **"Skip and complete" (I-7):** whether it raises E2 on CIQ Case. Tested by T-10.
12. **The push:** whether notification settings travel from dev to prod. Tested by T-12.
13. **Role names** in the recipient list: CIQ Regulatory Reviewer, CIQ Safety Reviewer, CIQ QM Reviewer, CIQ Microbiology Reviewer, CIQ Sustainability Reviewer, CIQ RMM.
14. **Flows created after 21 Oct:** any flow not in §2 gets all notifications off.
15. **Conditions on E7 and E8:** whether the deadline events take conditions (the cancelled and reopened guards in §4). If not, a cancelled request and a request whose release was withdrawn keep getting their reminders.
16. **Questions of a cancelled case:** cancelling closes only the cancelling RMM's own open points. Points raised by others stay open in Kissflow, so their CIQP Query stays at "Supplier: respond" and P-6/P-7 still go out. CIQP Query has no field a condition could test for this.
17. **An edited due date:** whether the respond deadline follows a `Supplier_Due_Date` that op.edited changes on an open query.
18. **You as actor and recipient (dev):** whether Kissflow notifies the user who caused the event (§5).
19. **The portal landing:** check the buttons with the Supplier role in front, not Admin (§5).
