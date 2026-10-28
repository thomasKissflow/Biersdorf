# Updates the client workbook and TEST-GUIDE-PROD to the app's FE clean-up texts (ciq-digital/FE-CLEANUP-APP-TEXT-CHANGES.md
# section 5). Apply it ONLY in the same push as the cleaned-up app UI: until that UI is live, the old texts are the true
# ones. Dry run by default (shows every change and checks each anchor occurs exactly once); --apply writes both files,
# after copying them to backups/.
import shutil, sys
import openpyxl

KB = "/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/kissflow-build/"
APPLY = "--apply" in sys.argv

WORKBOOK = {  # sheet "Test cases": cell → [(old, new)]
    "G13": [("“The reviews start when the supplier confirms completeness.”",
             "“The reviews start once the supplier has confirmed completeness and RMM has opened CIQ Digital.”")],
    "G24": [("with when each is normally added and its lead department.",
             "with when each is normally added and its lead department. A warning at the top says that adding a section is not available in this version."),
            ("- Step 3: the warning “Adding a section to the scope is not available in this version yet.” A7 is not added and the supplier gets no task.",
             "- Step 3: the same warning “Adding a section to the scope is not available in this version yet.” appears as a message; the window stays open (Cancel closes it). A7 is not added and the supplier gets no task.")],
    "G45": [("“Configuration changes are not live in this version. The configuration shown is the one cases use.”",
             "“In this version the configuration is read-only. Cases use the configuration shown.”")],
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
