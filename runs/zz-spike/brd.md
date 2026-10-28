# Requirement for run `zz-spike`: test (spike) flows for CIQ Digital

These are throwaway test flows for CIQ Digital (app `CIQ_Digital_A00`). Thomas approved them on 2026-10-07.
- Every name starts with "CIQ ZZ Spike".
- They prove Kissflow behaviours before the real app is generated (see `kissflow-build/ciq-digital/SPIKES.md`).
- This is a test harness, not a business app. Keep it minimal and exactly as specified.

## Flows

### 1. Process "CIQ ZZ Spike Case"

Steps, in order:
1. Start "Create spike case" (role CIQ ZZ Spike Role A).
2. Step "Spike prepare" (Role A).
3. **PARALLEL block** with 6 branches, "Spike review – A" … "Spike review – F":
   - each branch is owned by CIQ ZZ Spike Role A or B (alternating);
   - each is conditional on its own Select flag, Flag_A … Flag_F = "Yes" (list "CIQ ZZ Spike Yes No");
   - each branch edits ONLY its own lane fields: Lane_A_Confirm (Mandatory), Lane_A_By, Lane_A_At, Lane_A_Note, and the same for B–F.
4. After the join, step "Spike hold check" (Role A), conditional on the formula Text field Hold_Flag = "Yes":
   - Hold_Flag = IF(ISBLANK(Open_Count),"Yes",IF(Open_Count=0,"No","Yes"));
   - Open_Count is a cross-flow SUM aggregate of "CIQ ZZ Spike Register".Open_Lines over the registers whose Reference Register_Case = this case.
5. Step "Spike gated step" (Role A), where the formula field Gate = IF(IF(ISBLANK(Open_Count),0,Open_Count)=0,"OK","") is Mandatory.
6. Step "Spike not-equal step" (Role B), conditional on Spike_Decision != "Rejected" (Select; list "CIQ ZZ Spike Decision": Approved, Rejected).
7. End.

The case also has a child table "Spike Case Notes" (Note_Text, Note_By), editable only at "Spike prepare".

### 2. Process "CIQ ZZ Spike Point"

Steps, in order:
1. Start "Raise spike point" (Role A).
2. "Spike waiting" (Role A), conditional on To_Supplier = "Yes" (a Select).
3. "Spike review" (Role B).
4. End.

Scalar fields:
- Round_No (Number)
- Question_Text (Textarea)
- Awaiting_Response (Text)
- Response_Text (Textarea, Editable at "Spike waiting")
- Due_Date (Date)

Child table "Spike Rounds" (Round_No, Question, Response, Outcome), editable only at "Spike review".

### 3. Form "CIQ ZZ Spike Register"
- Register_Key (Text, required).
- Register_Case (Reference → CIQ ZZ Spike Case).
- Child table "Spike Lines" (Line_Text, Line_Open Number).
- Header aggregate Open_Lines = SUM of Spike Lines.Line_Open.

### 4. Form "CIQ ZZ Spike Log"
- Fields: Log_Key, Log_Source, Log_Event, Log_Item_Id, Log_At (DateTime), Log_Payload (Textarea).
- Target for the integration tests.

## Roles and grants
- Roles: CIQ ZZ Spike Role A and CIQ ZZ Spike Role B. They have no members; Thomas adds the people.
- Grants: Role A and Role B are Editable on all four flows.

## Out of scope
- No pages, no nav, no UI.
- No automations in the IR. The test integrations are created separately.
