# Updates the client workbook and TEST-GUIDE-PROD to the app's FE clean-up texts (ciq-digital/FE-CLEANUP-APP-TEXT-CHANGES.md
# section 5). Apply it ONLY in the same push as the cleaned-up app UI: until that UI is live, the old texts are the true
# ones. Dry run by default (shows every change and checks each anchor occurs exactly once); --apply writes both files,
# after copying them to backups/.
import shutil, sys
import openpyxl

KB = "/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/kissflow-build/"
APPLY = "--apply" in sys.argv

WORKBOOK = {  # sheet "Test cases": cell → [(old, new)]
    # G13 (TC-12) unchanged since 22 Oct: I-2 starts the reviews at the confirmation, as the text already says
    "G24": [("with when each is normally added and its lead department.",
             "with when each is normally added and its lead department. A warning at the top says that adding a section is not available in this version."),
            ("- Step 3: the warning “Adding a section to the scope is not available in this version yet.” A7 is not added and the supplier gets no task.",
             "- Step 3: the same warning “Adding a section to the scope is not available in this version yet.” appears as a message; the window stays open (Cancel closes it). A7 is not added and the supplier gets no task.")],
    # 26 Oct: the configuration editor is live (app ciq-app-ui-780f6539bc): no banner any more; TC-45 tests the changes
    "G45": [("- The banner reads “Configuration changes are not live in this version. The configuration shown is the one cases use.”",
             "- There is no banner saying the configuration is read-only: the Business administrator can change it (TC-45).")],
}
GUIDE = [
    ("(it is in the dev top bar only; a link appears only in the \"… could not be read in full\" banner)",
     "(it is in the dev top bar only; a \"Details\" link appears only in the \"Some data could not be loaded…\" line and in the \"unsent items\" banner)"),
    ("If an app message says \"Diagnostics lists it\", look in Run history instead.",
     "If an app message says \"The supplier portal could not be updated just now…\", look in Run history."),
    ("(§0 step 5; without it, the message after each save ends \"Beiersdorf's system will pass this on.\": the hand-off stays pending, and only its CIQ Audit Event row records that)",
     "(§0 step 5; without it no hand-off runs: the save's message looks normal, and only its CIQ Audit Event row records \"pending\")"),
]

ok = True
wb = openpyxl.load_workbook(KB + "CIQ-UAT-test-cases.xlsx")
ws = wb["Test cases"]
for cell, pairs in WORKBOOK.items():
    v = ws[cell].value or ""
    for old, new in pairs:
        n = v.count(old)
        print(f"workbook {cell}: {'OK ' if n == 1 else 'MISS'} {old[:70]}…")
        ok &= n == 1
        v = v.replace(old, new)
    ws[cell].value = v

# 26 Oct: TC-45, the live configuration editor (a new row after TC-44, styled like it; the summary counts row 46 too)
from copy import copy
TC45 = ["TC-45", "Administration – configuration", "Business administrator; Raw Material Manager (RMM) to check",
  "Change the configuration: draft, publish, and which cases use it",
  "A Business administrator user holding only that role, and an RMM user. At least one running case on the current version. Agree with the team before publishing in production: new cases then use the new version.",
  "1. As the Business administrator, open Rules. The seed brings a prepared draft (RS-2026.2 + v2): use it, or click “Discard draft” and then “Create new version” and enter a note.\n2. Change one rule (for example its wording) and save it.\n3. Open Questionnaire and change one question's help text in a section; save.\n4. Open Section owners and change the co-reviewer of one section; open Reminders and change one reminder's days.\n5. Back in Rules, click “Check & publish”, enter a change note and click “Publish …”.\n6. As RMM, click “New case” and look at the questionnaire version offered.\n7. Open the running case from “Before you start” and compare Overview > Case facts.\n8. Optional: as the Business administrator click “Create new version”, then “Discard draft”.",
  "- Step 1: the draft bar shows the draft and its version numbers; the published version stays as it is.\n- Steps 2–3: each change is saved (a short message); the draft marks what changed.\n- Step 4: the owner and the reminder are saved at once.\n- Step 5: the version list shows the new version as published, with its date and change note.\n- Step 6: New case uses the new version.\n- Step 7: the running case still shows the versions it started with; it is not changed.\n- Step 8: the draft is gone; the published version is unchanged.\n- If Kissflow refuses a save: “Not saved: Kissflow refused to save the configuration for your role…” (the role needs create and edit on CIQ Config Version).",
  "REQ-CFG-001, REQ-CFG-003, REQ-CFG-006", "Medium"]
if ws.cell(46, 1).value in (None, ""):
    for c in range(1, 14):
        src, dst = ws.cell(45, c), ws.cell(46, c)
        dst._style = copy(src._style)
        dst.value = TC45[c - 1] if c <= len(TC45) else None
    if ws.row_dimensions[45].height: ws.row_dimensions[46].height = ws.row_dimensions[45].height
    for dv in ws.data_validations.dataValidation:
        dv.sqref = openpyxl.worksheet.cell_range.MultiCellRange(str(dv.sqref).replace("$45", "$46").replace("45", "46"))
    sm = wb["Summary"]
    for row in sm.iter_rows():
        for c in row:
            if isinstance(c.value, str) and c.value.startswith("=") and "$45" in c.value: c.value = c.value.replace("$45", "$46")
    print("workbook: TC-45 added as row 46; summary ranges to row 46")
else:
    print("workbook: row 46 holds", ws.cell(46, 1).value, "- TC-45 not added"); ok = False
guide = open(KB + "TEST-GUIDE-PROD.md").read()
for old, new in GUIDE:
    n = guide.count(old)
    print(f"guide: {'OK ' if n == 1 else 'MISS'} {old[:70]}…")
    ok &= n == 1
    guide = guide.replace(old, new)
if not ok:
    sys.exit("an anchor did not match exactly once: nothing written")
if APPLY:
    shutil.copy(KB + "CIQ-UAT-test-cases.xlsx", KB + "night-2026-10-21/backups/CIQ-UAT-test-cases.before-app-fe-cleanup.xlsx")
    shutil.copy(KB + "TEST-GUIDE-PROD.md", KB + "night-2026-10-21/backups/TEST-GUIDE-PROD.before-app-fe-cleanup.md")
    wb.save(KB + "CIQ-UAT-test-cases.xlsx")
    open(KB + "TEST-GUIDE-PROD.md", "w").write(guide)
    print("applied (backups in night-2026-10-21/backups/)")
else:
    print("dry run: every anchor matches; run with --apply in the push that carries the cleaned-up app UI")
