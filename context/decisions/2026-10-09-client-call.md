# Client call, 9 Oct 2026: process decisions (Kissflow-internal)

Beiersdorf clarified these points on the call (Thomas, 9 Oct). Items marked "Thomas's choice" were Thomas's answers to the follow-up questions the same day; they are our working assumptions until Beiersdorf confirms them.

These decisions supersede the earlier process in `analysis/01-expected-workflow.md` and the scope-check and ending parts of the design plans.

## D-1 · The supplier opens and fills the CIQ in one step; there is no RMM scope check

- What were steps 2, 3, 5 and 6 on our process map are now one supplier step:
  - basic data and configuration questions;
  - deriving the scope;
  - filling in and uploading;
  - confirming completeness.
- The supplier opens the CIQ directly. Beiersdorf calls the configuration questions "metadata questions".
- As the supplier answers the metadata questions, the rules open or close sections live. Nothing goes to RMM to check, extend or change the scope at the start, and there is no scope release.
- **Thomas's choice:** sections open and close freely until the completeness confirmation. After it, a changed metadata answer only adds sections, so nothing a department is reviewing disappears (BRM v2 REQ-CFG-008: scope only grows).
- **Thomas's choice, origins without rules** (waste, CCU, chemical recycling):
  - the supplier gets the standard sections;
  - the case is flagged in RMM's Part 2 review;
  - RMM or a department asks the supplier for more if needed.
- Answers our questions:
  - AS-11 (RMM extends only, no send-back) is moot;
  - Thomas's earlier question about send-back at the scope check is moot;
  - AS-09 is replaced by the flag above.

## D-2 · RMM reviews in Part 2, in parallel with the departments

- The old step 4 (RMM scope check) moves next to the department review. The CIQ is assigned to RMM as well; RMM can read everything and act.
- **Thomas's choice:** RMM has its own review task and completes it like a department. The single final-release request waits until RMM and every activated department have completed.
- RMM still starts the case (step 1) and receives the final PDF.

## D-3 · The case ends the requirements-matrix way

- Confirmed ending: after the last review, the supplier gives the final release, the CIQ is frozen, the case completes automatically, and the final PDF goes to RMM (BRM PS-11, PS-12).
- The requirements-PDF ending is dropped:
  - department approve or reject (PDF PS-11);
  - the overall Beiersdorf approval and its role "to be decided" (PDF PS-12);
  - PDF PS-13 as a Beiersdorf decision step.
- Answers our questions:
  - AS-01 (which ending): confirmed, removed from the open list;
  - who the overall approver is: moot;
  - the order of the overall approval and the release: moot.
- Still open: what a Safety or Regulatory "Rejected" in RMES means for the case (AS-02, matrix ending only), and the final PDF trigger (AS-12).

## Process after the decisions (our map)

1. RMM starts the case.
2. Supplier fills in the CIQ. The metadata questions open and close sections live, then the supplier fills in, uploads and confirms completeness. This is the gate that closes Part 1.
3. System activates only the relevant reviews, and assigns the CIQ to RMM.
4. RMM reviews the whole CIQ (in parallel with step 5).
5. Departments review in parallel, with the direct query loop.
6. RMM and each department complete their review.
7. Supplier gives the final release.
8. Case completes, final PDF to RMM.

## What this changes in Kissflow (not done yet; "dev them in Kissflow as needed")

- **App `CIQ_Digital_A00`** (app session):
  - The RMM scope-check step (S2) and the scope run / section release no longer apply as an RMM gate.
  - RMM needs a lane in the parallel review block.
  - The overall approval step (S6), `Overall_Approval_Required` and the overall approver role go.
- **Portal `CIQ_Supplier_Portal_A00`** (portal session):
  - Sections must follow the supplier's metadata answers live. Today they arrive from the app's scope release (X2), so the portal↔app design (plan v3) needs a rework.
  - The live portal UI keeps the old flow until then.
- **Prototype** (`prototype/`): updated on 9 Oct.
  - **Understanding page and call view:** 4 lanes and 8 steps, no ending switch. AS-01 and AS-11 are removed; AS-02, -03, -07, -08, -09 and -12 are reworded.
  - **Supplier:** the metadata questions sit inside the questionnaire, and sections open and close live (answers in a closed section are kept). After completeness, sections are only added.
  - **RMM:** a review lane over the whole CIQ that can ask the supplier and must be completed.
  - **Removed:** the overall approver role, the approval queue and the ending toggle.
  - **Gate:** typecheck, 146 tests, both builds, portal harness 15/15.
  - **Not done:** the internal screens still show the v1 "review version" wording.

## Build requirements (Thomas, 12 Oct 2026)

- **R-1 · One common generic webhook integration, in the portal and the app.**
  - When an open point is raised or answered, a webhook e-mail tells the person who has to act that someone has written. Examples:
    - Beiersdorf raises a point → the supplier contact is told;
    - the supplier answers → the reviewer who raised it (RMM or a department) is told.
  - One reusable integration for every open-point event, not one mail per flow.
  - Suppliers never receive internal content.
- **R-2 · The final release PDF contains every open point's full back-and-forth as text.**
  - Each round shows the question, the answer and any return, with who and when, in order and with the section/field reference.
  - Attachments are left out.
  - To be implemented when the PDF is built (REQ-PROC-046, AS-12).

## Answers to the assumption list (Thomas, 12 Oct 2026)

These answers were read from the call page in Thomas's browser.

**Confirmed as written** (texts as on the call page, 12 Oct):
- AS-02 rejection: a Safety or Regulatory "Rejected" is internal. RMM decides with the department whether to cancel; otherwise release and complete.
- AS-03 changing answers: open and close until completeness, then add-only, current answers, reopen on change.
- AS-04 composition: one row per component.
- AS-05 rule principle.
- AS-06 RMM sets the target markets.
- AS-07 RMM and the concerned departments complete; Customs and Legal are read-only.
- AS-09 undefined origins: flagged in RMM's review.
- AS-10 integrations: manual in the MVP; the material number is on every case.

**Changed:**
- **AS-08 open points.** "Yes, but…":
  - Every open point still blocks completion of the review that raised it.
  - The person who raised the point must be able to close it, and to edit or modify it.
  - Each change must reach the portal through the integration (API call), so the supplier side is updated too.
  - Thomas's note, verbatim: "Yes but the one who raised the open point must have the ability to close that point, edit or modify that point and an integation and the api call must hit and data must be updated in the portal as well".
- **AS-12 final PDF.** There is no RMM click.
  - When the supplier gives the final release in the portal, a webhook endpoint is hit.
  - An external script, a Google Apps Script or an AWS Lambda, generates the PDF and attaches it to the case process in Kissflow.
  - Thomas's note, verbatim: "Not needed, we can write a google app scipt or lambda code, so when potal user says okay and gives the final relesase we can hit an webhook endpoint in kissflow and generate the doc and attcht it in our process".
  - The PDF content is unchanged, plus R-2: every open-point thread as text.
