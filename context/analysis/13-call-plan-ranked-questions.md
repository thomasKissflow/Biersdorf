# 13 - Call plan: ranked questions for call 1, call 2 and written follow-up

Prepared 2026-10-05 for call 1 (2026-10-06, about 60 minutes) with BDF's business-side consultant. Discovery only; nothing is being built.

**Internal preparation document.** It contains our positioning notes and our own proposals. The "Say it" lines, the written lists (section 5) and the artefact requests (section 6) can be shared. The rest should not be sent as it is.

**How this was built.** We started from 133 candidate questions in three lenses:
- business consultant: `10-questions-business-consultant.md`, BC-01 to BC-45
- tech / solution consultant: `11-questions-tech-consultant.md`, TQ-01 to TQ-44
- tech / platform: `12-questions-tech-platform.md`, TP-01 to TP-44

They were de-duplicated and merged into:
- **19 call-1 questions** (50 minutes)
- **23 call-2 items**
- **16 written follow-ups**
- **16 artefact requests**

Appendix A traces every one of the 133 IDs. The contradiction verification verdicts (C-, G-, K- and BR- IDs in `04-contradictions-and-gaps.md`) were applied:
- No verdict was "refuted", so no question had to be dropped for that reason.
- Where a verdict was "partially correct", the corrected wording is used (Appendix B).

Citation codes follow `00-glossary.md`: [ReqDoc p.x §y], [BRM REQ-...], [FLM rN] / [FLM changelog rN] / [Feldkatalog rN], [KB ...], [CIA #n], [VQ rN], [IKW p.n].

**Relation to the Knowledge Baseline (KB).** The KB already lists 22 open points and many '?' cells, and all its answer columns are empty [KB 'Open Points' cols G-H; KB 'Config Rules' col J empty for all 29 rules]. Where we overlap, we cite the KB ID and move the decision forward with options or a recommended default rather than re-asking it (Appendix C).

---

## 0. How to run the call

**Ground rules**
1. **We propose, they confirm.** Every question carries our default. If the consultant cannot answer, ask: *"May we build to this default and mark it 'pending Beiersdorf' until the department confirms?"* Then move on.
2. **Each "Say it" is at most 60 words (about 25 seconds aloud).** It is written so the consultant can relay it to German business owners without internal IDs.
3. **Business first.** Order: big picture and evaluation, then how the business will run, then the decisions that block the build, then three light technical questions.
4. **Capture every answer as a dated decision with an owner.** We send the recap and the decision log within 24 hours (W16).
5. If the consultant says "I'll ask the department", note who and by when, and agree it goes into the written list.

**Time plan (60 minutes)**

| Clock | Block | Questions | Minutes |
|---|---|---|---|
| 0:00-0:02 | Intro and purpose (section 1) | none | 2 |
| 0:02-0:13 | A. Big picture and evaluation | Q1-Q4 | 11 |
| 0:13-0:22 | B. How the business will run | Q5-Q8 | 9 |
| 0:22-0:44 | C. Decisions that block the build | Q9-Q15 | 22 |
| 0:44-0:50 | D. Light technical | Q16-Q18 | 6 |
| 0:50-0:52 | E. Test logistics | Q19 | 2 |
| 0:52-0:55 | Close: artefact requests and next steps (section 3) | none | 3 |
| 0:55-1:00 | Buffer | none | 5 |
| | **Questions total** | **19** | **50** |

**Must-ask (if everything else slips):** Q1, Q2, Q3, Q4, Q6, Q9, Q10, Q11, Q12, Q13, Q14, plus the dates in Q19.

**Cut order if running late** (each moves to the stated place, nothing is lost):
1. Q8 → e-mail
2. Q17 → e-mail to the consultant, for BDF IT
3. Q16 → call 2
4. Q7 → call 2
5. Q15 → call 2
6. Q18 → e-mail, for BDF IT
7. Q5 → call 2

**Internal: what not to say**
- Do not mention or compare with the competitor.
- Do not repeat the "4-week configuration phase" [VQ r27]. Our own estimate is longer [07 §1, §10].
- Do not repeat that audit logs are "unalterable even by platform admins" [VQ r12]. Admin delete routes exist [07 §1, §8.2].
- Do not present integrations as ready. Our screening said we "fully support" automated initiation and archiving and "seamlessly integrate" with B-Flow [CIA #1, #12, #15]. Position them as manual in 2026 plus a designed interface (Q16).
- Our screening answer promised "multi-stage final approval workflows" [CIA #14]. Q9 is where that gets tested, so offer the switchable overall decision.
- Use BDF's words: "case", "department", "completeness confirmation", "final release". Never call the supplier's PS-05 step an "approval" (BRM numbering, see glossary).

---

## 1. Opening (2 minutes, no question)

> "Thank you for the time. We have read all the documents you shared: the requirements PDF, the requirements matrix with its acceptance criteria, the new field matrix, the knowledge baseline and the screening catalogues. Where they leave a decision open, we will not just ask. We will offer a default and ask you to confirm or correct it. Anything you cannot answer today goes into a short written list for the departments. Our aim is an MVP that already behaves like the solution you would run for years."

---

## 2. Call-1 agenda (19 questions, 50 minutes)

Numbering is the running order. Priority is shown in the "Must" column.

| # | Block | Topic | Min | Must | Merged from |
|---|---|---|---|---|---|
| Q1 | A | Big picture and what success looks like | 3 | yes | BC-37, TQ-42, BC-13 (part) |
| Q2 | A | How the two MVPs will be compared | 3 | yes | BC-09, TQ-03, TP-01, BC-13 |
| Q3 | A | What content will be tested | 3 | yes | BC-10, TQ-02, TP-02 |
| Q4 | A | Which document wins, and the process diagram | 2 | yes | BC-11, TQ-01, TQ-04 (diagram) |
| Q5 | B | RMM's future role | 2 | | BC-19 |
| Q6 | B | Which departments must finish, which are only informed | 3 | yes | BC-18, TQ-30, TP-26 |
| Q7 | B | Suppliers who send their own documents | 2 | | BC-29 |
| Q8 | B | Volumes and languages | 2 | | BC-36, TP-31, TQ-44, TP-41, BC-35 (part) |
| Q9 | C | How a case ends: decision in the tool or not | 4 | yes | BC-01, TQ-06 |
| Q10 | C | When the answer is "no" | 4 | yes | BC-02, BC-03, BC-07, TQ-07, TQ-28 |
| Q11 | C | Supplier changes after submission; scope growing during review | 3 | yes | BC-04, TQ-24, TQ-26 (core) |
| Q12 | C | Composition table and multiple origins | 3 | yes | TQ-11, TQ-19 |
| Q13 | C | Only the relevant sections: one rule principle | 3 | yes | BC-30, TQ-12, TQ-13, TQ-14, BC-20 / TQ-17 (markets) |
| Q14 | C | Owner and sign-off of the rule table | 3 | yes | BC-25, TP-13, TQ-18 |
| Q15 | C | Who "the supplier" is; confidential composition | 2 | | TP-10, TQ-21 |
| Q16 | D | Integrations in the MVP and their scoring weight | 2 | | BC-14, TQ-05, TP-06 |
| Q17 | D | Does the MVP carry forward; EU hosting | 2 | | TP-05, TP-33 |
| Q18 | D | Logins for suppliers and Beiersdorf staff | 2 | | TP-09, TP-07, TP-24 |
| Q19 | E | Testers, sample materials, dates, checkpoints | 2 | dates | BC-12, BC-15, TP-03, TP-04 |

---

### Block A. Big picture and evaluation (11 minutes)

#### Q1 · Big picture and what success looks like · 3 min · must-ask

**Say it (about 22 s):** "Let me play back the goal: suppliers fill in only what is relevant to their material, departments ask suppliers directly instead of through RMM, and everyone sees the status without chasing. Is that right? And today, how long does a CIQ take end to end, where is the time lost, and what improvement would count as success?"

**Why it matters**
- It confirms the business case and shows we lead with outcomes rather than features.
- The documents state goals but give no baseline and no target. No shared file contains a single volume or lead-time figure.
- KPIs need phase timestamps, and a record of whose turn it is, captured from day one. They cannot be reconstructed later.
- Separating supplier waiting time from Beiersdorf waiting time is the basis for fair escalation.

**We propose (they confirm)**
- Measure from day one:
  - end-to-end lead time
  - time with the supplier vs with Beiersdorf, per step
  - query rounds per case
  - share of submissions complete the first time
  - overdue tasks per department
- A management view for the process owner and a bottleneck view for RMM.
- An example target to discuss: a third less lead time. This is our assumption, not a BDF figure.

**Follow-up prompt:** "What disappointed you in earlier tools or attempts?" Past disappointments are hidden evaluation criteria.

**Evidence**
- [ReqDoc p.1 §1]: the questionnaire is static, and "every question, every reminder and every document passes through this single point" (RMM). Suppliers should "only need to complete the sections that are actually relevant".
- [ReqDoc p.2 §1.1] "Task and status transparency for all parties through a dashboard"
- [ReqDoc p.14 REQ-RMES-018]: states "waiting for supplier" and "overdue"
- [CIA #23]: Status Control Dashboard, "Critical or open process steps should be quickly identifiable"
- No volume or lead-time figure in any BDF file [G-19]

**KB overlap:** none.

#### Q2 · How the two MVPs will be compared · 3 min · must-ask

**Say it (about 20 s):** "How will you compare the two MVPs? Will your key users work through the acceptance criteria in the requirements matrix hands-on, role by role, or will each vendor demo them? Which criteria weigh most, who makes the final decision, and what would make your testers say 'this one is clearly better'?"

**Why it matters**
- No shared file contains test scenarios, scoring, testers or a timeline [G-20].
- The matrix acceptance criteria read like test scripts: 51 requirements, 48 marked "MVP" and 3 "MVP partial scope" [K-34].
- Hands-on testing means every role's screens must work without coaching, especially business self-service and the supplier portal. A demo shifts the effort to flow and storytelling.
- The weighting tells us where to invest depth.

**We propose (they confirm)**
- A scorecard both vendors can see, for example:
  - fit to the matrix acceptance criteria 35 %
  - supplier experience 20 %
  - business self-service of questionnaire and rules without IT 20 %
  - transparency and dashboards 10 %
  - non-functional and commercial 15 %
- We hand over a test guide that maps every requirement ID to a click path and a seeded test case (W16).
- Assumed decision board: Technical Product Owner, department leads, Procurement.

**Evidence**
- [ReqDoc p.2 §1.1] "Select and validate a suitable low-code/no-code solution; design and build an MVP"
- [BRM col F]: acceptance criteria on all 51 rows. [BRM col H]: 48 MVP, 3 MVP partial scope.
- [BRM REQ-CFG-001] acceptance: "in the test environment ... publishes it without an IT ticket"
- [CIA r2] / [VQ r2]: the screening "is not a full RFP"
- [VQ r31]: proof of concept, "what can be tested by Beiersdorf"

**KB overlap:** none (the KB has no evaluation tab).

#### Q3 · What content will be tested · 3 min · must-ask

**Say it (about 22 s):** "Is the field matrix, version 0.6, the content you will test: case start, metadata and Annexes 1, 2 and 4? Your acceptance tests also mention a component table, a batch certificate, a micro-test waiver and a Turkey REACH section. We'd build the field matrix in full plus light versions of those. Does that match your test?"

**Why it matters**
- The field matrix defines 39 fields in five blocks and marks Annex 3 "outside test scope", which suggests a test slice [G-03].
- Yet the matrix acceptance tests use content the field matrix does not define:
  - "K2.1, component 3, field CAS number"
  - a K2.2 batch certificate
  - the K5.1 micro-test waiver
  - a Turkey REACH section
  - A3 and the palm question hidden for minerals
- If our build scope and BDF's test scope differ, we either fail tests or overbuild.

**We propose (they confirm)**
- MVP content = the field-matrix v0.6 slice in full, plus light sections for:
  - the K2.1 component table
  - the K2.2 batch upload
  - the K5.1 waiver with justification
  - A3, to prove it is hidden for minerals
- Turkey REACH is left for BDF's business admin to add live, as the self-service test.
- Other chapters as placeholders, to show the engine scales.
- We confirm the list in writing, and BDF fills the KB "In MVP? (Y/N)" column to freeze it.

**Evidence**
- [FLM r2-r55]
- [FLM r41] "Annex 3 (GMO), if GMO – outside test scope"
- [BRM REQ-CFG-001] Turkey REACH; [BRM REQ-PROC-009] A3 and palm hidden for "mineral"
- [BRM REQ-PROC-011] K2.2 batch certificate; [BRM REQ-PROC-012] SF-12 / K5.1 waiver
- [BRM REQ-PROC-029] "K2.1, component 3, field CAS number"
- [KB 'Sections' col L] "In MVP? (Y/N)" empty for all rows [G-08]

**KB overlap:** NEW-05 (MVP scope), NEW-01 (question inventory), 'Sections' col L. We propose a concrete slice instead of re-asking.

#### Q4 · Which document wins, and the process diagram · 2 min · must-ask

**Say it (about 20 s):** "Where the requirements PDF, the requirements matrix and the field matrix disagree, which one should we follow? We'd take process steps and acceptance tests from the matrix, fields from the field matrix, and the internal evaluation sheet from the PDF. And could you share the process diagram the PDF calls authoritative?"

**Why it matters**
- The three documents disagree on:
  - how the process ends (their step numbers PS-11 and PS-12 mean different things)
  - single vs multiple origin
  - the component table
  - production sites
  - section owners
- If we pick differently from the testers, a correct build still loses points.
- The diagram is the stated tie-breaker, but the PDF contains no images [G-01].

**We propose (they confirm)**
- Process and acceptance: the requirements matrix (the PDF itself defers detail to it).
- Fields: field matrix v0.6 over the old German field catalogue. It is the newest file, last modified 2 Oct 2026, and "aligned with business departments".
- Internal evaluation sheet (RMES): PDF chapter 7, which the matrix does not contain.
- Knowledge Baseline: input only, not a Beiersdorf statement.
- We keep a visible log of every conflict and the side we took (W16).

**Evidence**
- [ReqDoc p.1 §1] "Detailed requirements are maintained separately in the CIQ requirements matrix"
- [ReqDoc p.2 §2] "The process diagram is authoritative for the structure and sequence in this document". The PDF dump shows 0 embedded images on every page.
- [FLM changelog r25] "aligned with business departments"; FLM modified 2026-10-02 [BR-01]
- [KB 'Read Me' r21] "proposed by the build team"
- [BRM rows 2-52] contain no REQ-RMES IDs [C-24]

**KB overlap:** none.

---

### Block B. How the business will run (9 minutes)

#### Q5 · RMM's future role · 2 min

**Say it (about 21 s):** "Today every question, reminder and document passes through RMM. We see RMM's future role as case owner: it starts the case, sets Beiersdorf facts such as target markets, watches bottlenecks, handles escalations and closes or cancels, but no longer relays questions. Is that the intended role, and what should RMM explicitly stop doing?"

**Why it matters**
- Removing RMM as the single relay is the core of the business case.
- RMM's future tasks decide its workload, its dashboards and how the team is prepared for the change.
- The field matrix puts RMM in the "Approval" column of every process-start and metadata field.
- The RMM target split with Teamcenter is still open.
- RMM leads K2.3 in one PDF table but is absent from the other [K-17].

**We propose (they confirm)**
- RMM is case owner and monitor. It:
  - creates the case and names the supplier contact
  - owns Beiersdorf-side facts such as target markets
  - receives escalations
  - cancels or closes cases
  - files the final package
- It no longer relays questions.
- A formal check of submissions and an RMM content review (K1, K2.3) exist but are switched off by default.

**Evidence**
- [ReqDoc p.1 §1]: RMM is the single point today
- [ReqDoc p.5 §3.2.5]: the target split between the digital CIQ solution and Teamcenter "is still open"
- [FLM r2-r35 col M]: "Approval" = RMM
- [ReqDoc p.6 §4.1] K2.3 "RMM (lead)" vs [ReqDoc p.9 §4.3] K2.3 under Regulatory only
- [BRM REQ-PROC-001, -045, -049]
- [ReqDoc p.14 REQ-RMES-018]

**KB overlap:** NEW-13 (RMM subprocess).

#### Q6 · Which departments must finish, which are only informed · 3 min · must-ask

**Say it (about 21 s):** "Which departments must actively finish a review before a case can close, and which only need to read or be informed? We'd propose Regulatory, Safety, QM, Microbiology and Sustainability must finish; Customs and Legal are informed and can read. Where a review is recorded outside the tool, someone marks it done with a reference."

**Why it matters**
- The case waits for every activated review. The departments differ:
  - Legal is "read only".
  - Customs owns K7 but has no review step and is missing from the matrix role list.
  - Sustainability documents its review "in a separate questionnaire". Whether that sits inside or outside the tool is not stated [G-10].
  - RMM documents in Teamcenter.
  - Microbiology is a separate role in the matrix but shares a row with QM in the PDF summary.
- A department wrongly set as blocking means cases never close. One wrongly left out means a section nobody reviews.

**We propose (they confirm)**
- Each department is configured as blocking reviewer, non-blocking reviewer or informed only.
- MVP blocking: Regulatory, Safety, QM, Microbiology and Sustainability. Microbiology has its own task but can be merged into QM by configuration.
- Customs (K7) and Legal (K8): informed, with read access and a notification when the review starts.
- RMM: case owner, with an optional review track switched off.
- Reviews recorded outside the tool close with a "completed in external system" step and a reference number.
- New departments can be added without a rebuild.

**Evidence**
- [ReqDoc p.4 §3.2.1]: subprocesses "activated dynamically ... in parallel"; synchronisation waits for the activated ones
- [ReqDoc p.5 §3.2.4-§3.2.6]: QM boundary open; RMM split open; Sustainability's "separate questionnaire"
- [ReqDoc p.8 K7, K8] "Read only for Legal"
- [ReqDoc p.9 §4.3]: Customs "easily overlooked today"; "QM / Microbiology"
- [BRM REQ-CFG-004]: role list without Customs or Legal
- [BRM REQ-PROC-017]: "exactly those departments affected according to the section assignment receive a task"

**KB overlap:** NEW-11 (Customs and Legal), NEW-13 (QM, RMM and Sustainability subprocesses), NEW-05. We propose a blocking / informed split.

#### Q7 · Suppliers who send their own documents · 2 min

**Say it (about 20 s):** "Some suppliers send their own documents instead of filling in the CIQ. Roughly what share is that, and must the MVP handle them? We'd keep the structured questionnaire as the standard and, as a fallback, let a supplier attach its own pack per section, with RMM deciding whether to accept it."

**Why it matters**
- If many suppliers refuse the portal, adoption fails and RMM ends up re-typing data.
- Copying CIQ data into the internal evaluation sheet works only with structured answers.
- The PDF announces a separate process but does not say when.

**We propose (they confirm)**
- As stated: structured questionnaire as standard, own pack per section as fallback, RMM decides.
- A dedicated own-document case type comes later.
- Help texts point to the matching question in the industry (IKW) template, to cut supplier effort. IKW is an industry reference, not BDF's.

**Evidence**
- [ReqDoc p.4 §3.1.4] "There are a number of suppliers who upload their own documents instead of completing the CIQ questionnaire. A separate process will be specified and implemented"
- [BRM REQ-PROC-022]: pre-fill from structured data
- [IKW p.2]: helpful where "the suppliers' own documentation does not adequately cover the needs"

**KB overlap:** NEW-12 ("In MVP or not?"). We ask for the share and propose an MVP fallback.

#### Q8 · Volumes and languages · 2 min

**Say it (about 21 s):** "Roughly how many CIQ cases do you start per year, with how many supplier companies, and how many reviewers per department? And do suppliers need the portal in any language other than English? Until we hear otherwise, we size for up to 500 new cases a year and test performance at three times that."

**Why it matters**
- No shared document gives any volume.
- Volumes drive:
  - licensing (per user per month, with Regular and Lite users)
  - dashboard design and performance tests
  - RMM workload
  - whether reviews go to named people or to queues
- Target markets include China, the USA, Canada, the UK and Turkey. If other languages may follow, labels must be kept separate from stored answer codes from the start.

**We propose (they confirm)**
- Sizing assumption (ours, not BDF's): up to 500 new cases a year, 300 open at once, 1,000 supplier users and 100 BDF users. Performance test at three times the confirmed figures.
- English for suppliers, e-mails and the PDF; German interface optional for BDF users; English binding for declarations.
- Labels stored apart from codes so languages can be added later.

**Evidence**
- No BDF volume figure in any file; BDF asked us about volumes without giving targets [VQ r18]
- [VQ r32]: per user per month
- [ReqDoc p.11 §5.3 SF-11]: markets "China, USA, Canada, UK, Turkey and others"
- [FLM changelog r9]: "fully translated into English"
- [ReqDoc p.6 K2.1] "any number of components"

**KB overlap:** none.

---

### Block C. Decisions that block the build (22 minutes)

#### Q9 · How a case ends: decision in the tool or not · 4 min · must-ask

**Say it (about 22 s):** "At the end, does Beiersdorf formally approve or reject the raw material in this tool, or does the case simply close after the supplier's final release, with the material decision taken elsewhere, for example in Teamcenter? We'd build the matrix ending plus an optional overall decision you can switch on. Who would own that decision?"

**Why it matters**
- The PDF ends with department approve/reject (its PS-11) and an overall approval by a role "to be decided" (its PS-12). It has no supplier release or confirmation step after the completeness confirmation, although the supplier does take part in the clarification loop (PS-08) [C-01].
- The matrix ends with department completion, the supplier's final release (its PS-11) and automatic completion (its PS-12). It states that none of the confirmations is a Beiersdorf raw-material approval.
- The matrix has no department or case rejection. "Rejection" appears only as an audit-trail event [K-35].
- This decides decision rights, the state model, the final PDF, every dashboard and the status later sent back to Teamcenter.
- It is the most visible step in a side-by-side test.

**We propose (they confirm)** one configurable sequence:
1. Each department completes. Safety and Regulatory record Approved or Rejected, with a mandatory reason for a rejection.
2. An optional overall Beiersdorf decision follows, by default owned by the RMM case owner. Switching it off gives the pure matrix model.
3. The supplier is asked for the final release only after a positive decision.
4. The case is frozen, completes automatically, and an immutable PDF is produced.

Both source models become configuration, not a rebuild. If the overall step is on, we need the name of the approver role.

**Evidence**
- [ReqDoc p.3 §2.1]: PS-11 "Approve or reject subprocess"; PS-12 "Overall CIQ approval", "Responsible role to be decided"
- [ReqDoc p.14 REQ-RMES-013, -014]
- [BRM REQ-PROC-015] "none of the confirmations is presented as a Beiersdorf raw material approval"
- [BRM REQ-PROC-038, -042, -045]
- [BRM REQ-CTL-009]: "rejection" as an audit event
- [CIA #11, #14]: Must Have

**KB overlap:** NEW-03 (overall approver; the KB uses the PDF's numbering). We ask which model, not only who.

#### Q10 · When the answer is "no" · 4 min · must-ask

**Say it (about 23 s):** "How should a 'no' work? If a supplier truly cannot provide a document and the department won't accept that, we'd close the point as 'not accepted' so the case doesn't hang. If a department then rejects, the others finish, the overall decision follows and the supplier gets a neutral message. Or should everything stop at once?"

**Why it matters**
- The PDF says the effect of a rejected subprocess "remains open and must be decided before the approval workflow is configured".
- In the matrix:
  - "closed" means "reviewed and accepted"
  - every open point blocks
  - the loop may repeat "any number of times"
  - blocking vs non-blocking "is not envisaged"
- So a document that will never come keeps the case open forever, or a department "accepts" just to close it, which puts a false positive into the record.
- A fast, clear "no" also protects the supplier relationship better than a slow silence.

**We propose (they confirm)**
- **Open points** end as one of:
  - accepted
  - closed – not accepted: unblocks completion but records a negative result that feeds the department outcome
  - withdrawn: sent by mistake; needs a reason and is audited
- After a set number of rounds or days, the point escalates to the department lead and RMM, who choose: accept with a documented deviation, reject, or cancel.
- **Department rejection**, default option B: the other departments finish, or close early as "not needed due to rejection", and then the overall decision is taken.
- Option C, remediation by the supplier as a new review version in the same case, only if the decision maker allows it.
- The supplier gets a neutral outcome message written by RMM. The internal rationale stays hidden.
- **MVP:** every open point blocks, as in the matrix. A non-blocking flag for findings exists but is switched off.

**Evidence**
- [ReqDoc p.5 §3.3.2]: effect "remains open"
- [ReqDoc p.14 REQ-RMES-013]: Approved/Rejected with a mandatory reason
- [ReqDoc p.4 §3.1.5]: "A later resubmission creates a new review version"
- [BRM REQ-PROC-032]: "justified non-delivery"
- [BRM REQ-PROC-034, -035]
- [BRM REQ-PROC-036] "A distinction between blocking and non-blocking open points is not envisaged"
- [ReqDoc p.13 REQ-RMES-009]: blocking / non-blocking findings
- [BRM REQ-PROC-040]: no internal content to the supplier

**KB overlap:** NEW-04 (effect of a rejected subprocess). We bring options and a default. The end states of open points are not in the KB.

#### Q11 · Supplier changes after submission; scope growing during review · 3 min · must-ask

**Say it (about 22 s):** "Once the supplier has submitted, may it still change answers on its own while departments review, or only what a department asks about? We'd lock the questionnaire except items under an open query, plus a change request with a reason. If a change adds sections, they become extra supplier tasks. Everything locks at the final release."

**Why it matters**
- Both documents expect changes while the process runs:
  - the PDF derives the scope again when a configuration answer changes, and reopens a review when evidence changes
  - the matrix keeps metadata changeable "up to the last process step permitted by the business"
- Neither says who may change what, through which mechanism, or until when [C-04].
- Free edits mean reviewers assess a moving target and the audit trail breaks. No edits mean honest errors cannot be fixed.
- This is a business policy on who owns the data, and it is expensive to change after go-live.

**We propose (they confirm)**
- After the completeness confirmation the questionnaire is read-only for the supplier, except:
  - (a) items under an open query, request or additional part
  - (b) a supplier change request with a reason that unlocks named sections
- Each change reaches the affected reviewers as a difference and triggers the scope check. A completed review that is affected reopens or gets a "no impact" confirmation.
- New sections stay inside the review phase as extra supplier tasks, and newly affected departments join. There is no restart of the supplier phase.
- Cut-off: the supplier's final release.
- History per answer and per document, plus frozen snapshots at the completeness confirmation and at the final release (details in C2-03).

**Evidence**
- [ReqDoc p.4 §3.1.5] "fixed for that review cycle"
- [ReqDoc p.10 §5.2] "If the supplier later changes a configuration answer, the scope is derived again"
- [ReqDoc p.13 REQ-RMES-012]: reopen, or confirm no impact
- [BRM REQ-PROC-007] "up to the last process step permitted by the business"
- [BRM REQ-PROC-016, -031, -043]
- [BRM REQ-CFG-008]
- [BRM REQ-ADR-002] "throughout the entire process"

**KB overlap:** NEW-14 (scope change after data entry). BRM REQ-CFG-009 answers data retention; edit rights are still open.

#### Q12 · Composition table and multiple origins · 3 min · must-ask

**Say it (about 22 s):** "Can one raw material mix components of different origins, say a vegetable oil with a petrochemical additive? We'd capture the composition as a table, one row per component with INCI, CAS, function, concentration range and origin, and give the material the annexes of all its origins. The new field matrix has single fields. Which is right?"

**Why it matters**
- The PDF asks for the composition "per component" and the origin "per component". The REACH annex works "per substance".
- Two matrix acceptance tests need per-component records.
- Field matrix v0.6 uses single fields and a one-choice origin button. Its own review note says the CIQ allows several answers, and the old catalogue had a component table with multi-select [C-07, C-08].
- The field matrix is ambiguous between "per material" and "per component" [K-10].
- Changing this after go-live means migrating every case and every rule.

**We propose (they confirm)**
- A repeatable component table (at least one row) with stable row IDs, and concentration as a min-max range.
- Origin is a multi-select per row. The material's origins are the union of its components, and the scope is the union of everything they trigger.
- No concentration threshold unless BDF sets one (configurable, default 0).
- Per-component records for the Annex 1 table, Annex 2 and the REACH annexes.
- A plausibility warning, not a block, when the concentrations do not add up.

**Evidence**
- [ReqDoc p.6 K2.1] "Table with any number of components"; [ReqDoc p.6 K2.3] "Origin type per component"
- [ReqDoc p.8 A10] "Per substance, not per raw material"
- [BRM REQ-CFG-002]: repeatable tables; [BRM REQ-PROC-006]: "analysed per component"; [BRM REQ-PROC-029]
- [FLM r10-r16]: single fields and a radio button
- [FLM changelog r35]: the CIQ allows several answers
- [Feldkatalog r24]: component table; [Feldkatalog r31-r38]: multi-select
- [IKW p.4]

**KB overlap:** SF-01 ("single or multi-select? per component?"), Q-006 to Q-012, 'Sections' K2.1 ("Must total 100%?").

#### Q13 · Only the relevant sections: one rule principle · 3 min · must-ask

**Say it (about 21 s):** "Your goal is that suppliers see only relevant sections. We'd follow one principle: origin switches on origin annexes, target markets switch on market annexes, specific questions switch on annexes like mineral oil, EU REACH always applies, and the stricter rule wins. RMM would set the target markets. Can we build to that principle?"

**Example to use if asked:** "Today's drafts would give a material sold only in the EU the UK and Turkey REACH annexes. And a mineral oil a supplier classes as 'mineral' would never see the mineral-oil annex with its limits."

**Why it matters**
- The draft origin table and the per-annex triggers conflict for A1, A2, A3, A7, A10 and A11/A12 [C-06, K-13].
- **Over-asking** frustrates suppliers and pushes them towards the own-document route:
  - UK and Turkey REACH for five origins regardless of market
  - pesticide and palm questions for minerals
  - Annex 2 shown for every origin
- **Under-asking** is a compliance gap. The field matrix ties the mineral-oil annex (A4) only to "petrochemical" and has no separate mineral-oil question, so a binding limit check can silently drop out [K-08].
- The field matrix has no target-market field, and a supplier may not know Beiersdorf's markets [K-37].
- No shared rule ever produces "optional", and combination or exclusion rules are missing.

**We propose (they confirm)**
- Rules are atomic and order-independent. The final class is the strictest: mandatory > optional > not applicable.
- Explicit exclusions (for example the micro-test waiver) win only for their own target and need a justification.
- Every result stores the rules that fired.
- **Origin** switches on A1, A2, A4, A6, A9 and BSE/TSE evidence.
- **Specific questions** switch on substance annexes:
  - A3 from the GMO / fermentation question
  - A5 and A7/A8 from their own questions
  - A4/A9 when the mineral-oil question is "yes" or any component is petrochemical
- **Target markets** switch on A11-A13, and A10 always applies.
- RMM sets the target markets at case start; the supplier sees them read-only.
- A test KPI: average sections per case.
- The six conflicting annexes go in writing (W1).

**Evidence**
- [ReqDoc p.1 §1] "only need to complete the sections that are actually relevant"
- [ReqDoc p.8-9 §4.2]: A10 "Always"; A11 / A12 from UK / Turkey markets
- [ReqDoc p.10-11 §5.3]: SF-07, SF-11
- [ReqDoc p.11 §5.4] "a structural illustration, not a complete or business-approved rule set"
- [BRM REQ-CFG-003, REQ-PROC-009, REQ-PROC-010]
- [FLM r16-r26]: A11 / A12 for five origins
- [FLM r23]: mineral examples "talc, mica"; [FLM r53-r54]: A4 only on "Petrochemical"
- [FLM r45, r48]: pesticide and palm questions shown for mineral
- [FLM changelog r129]: Annex 2 "currently shown for all origins"
- [KB 'Config Rules' R-xx]: combination rules missing
- [KB 'Config Questions' r12]: "target markets are a Beiersdorf fact"

**KB overlap:** NEW-07, OP-02, OP-03, R-00, R-10, R-12 to R-15, R-110, R-111, R-xx, SF-07, SF-11. We bring one principle instead of re-asking each rule.

#### Q14 · Owner and sign-off of the rule table · 3 min · must-ask

**Say it (about 22 s):** "The rule table that decides which sections a supplier gets is not binding yet. Who owns it, who signs it off, and by when? Meanwhile we'd seed a draft from your PDF as one spreadsheet, one row per rule, for each department to mark up, and send waste, CCU and recycled origins to a manual RMM check."

**Why it matters**
- The table is the core of the app, and in the KB's words it "Blocks the scope engine - core of the app" [KB 'Open Points' r2]. It does not exist in binding form (OP-19).
- Without one owner, every department pulls the questionnaire its own way and the build has no stable target.
- A structured format removes interpretation errors and becomes the reference for testing every scope result.

**We propose (they confirm)**
- A named business owner, the process owner, signs off. Each department confirms its own rows.
- Format: the KB "Config Rules" layout, extended with:
  - an outcome column (mandatory / optional / not applicable)
  - lead and reviewing departments
  - evidence
  - a status, such as "pending BDF"
- We import it, and every publish creates a new rule-set version that is logged on each case.
- Undefined origins (waste, CCU, chemical recycling, any "other") set "manual scope confirmation required". EU REACH (A10) still applies.

**Evidence**
- [ReqDoc p.10 §5.3] "The list is a draft and has to be completed and confirmed by the business departments (OP-19)"
- [ReqDoc p.12] "The binding configuration table has to be collected with the business departments"
- [ReqDoc p.11-12 §5.4]: waste, CCU and recycling "To be defined"
- [FLM r24-r30] "no annexes"
- [BRM REQ-CFG-003]; [BRM REQ-PROC-009]: rule-set version logged
- [KB 'Config Rules' col J]: empty for all 29 rules

**KB overlap:** OP-19, NEW-07, R-16, R-17, R-18, R-xx. We ask for an owner and a date, and offer a seeded draft and a format.

#### Q15 · Who "the supplier" is; confidential composition · 2 min

**Say it (about 20 s):** "Who exactly is 'the supplier' in the tool: the distributor, the manufacturer or the whole group? And must a manufacturer be able to give its composition to Beiersdorf without the distributor seeing it? We'd grant access per case to named, invited contacts only, with an optional manufacturer contact for the composition part."

**Why it matters**
- "The supplier sees only its own cases" needs a defined organisation boundary.
- Supplier and manufacturer are separate fields, and supplier-side task assignment is the supplier's own business.
- The composition is a trade secret. Without a confidential channel, manufacturers fall back to sending their own documents.
- A leak between suppliers would disqualify the tool. Supplier isolation is our biggest delivery risk [07 §1].

**We propose (they confirm)**
- Isolation per supplier organisation (keyed by DUNS) plus explicit membership per case.
- One person may belong to several organisations but sees only the cases they are invited to.
- An optional manufacturer contact per case, with exclusive access to the composition (K2.1, K2.2) and uploads "visible to Beiersdorf only".
- No group-level visibility in the MVP.

**Evidence**
- [BRM REQ-CTL-001]: assignment "exclusively on the supplier's side"
- [BRM REQ-CTL-006]: the supplier sees only its own cases
- [BRM REQ-PROC-004]
- [FLM r3]: FLD-GEN-002 supplier; [FLM r8]: FLD-GEN-004 manufacturer
- [IKW p.3]: "Supplier (address), if not identical with manufacturer"
- [CIA #6, #26, #28]
- [ReqDoc p.4 §3.1.4]

**KB overlap:** BD-02, BD-06, NEW-12 (related).

---

### Block D. Light technical (6 minutes)

#### Q16 · Integrations in the MVP and their scoring weight · 2 min

**Say it (about 22 s):** "Links to Teamcenter, B-Flow and SAP are out of scope for 2026, yet your functional catalogue marks several as Must Have. Should the MVP show anything there, even simulated, and will it be scored? Our default: manual in the MVP, with the Teamcenter or material number stored on every case so a later link is clean."

**Why it matters**
- Evaluators may test the Must Have items. Our screening answers said we "fully support" automated initiation and archiving and "seamlessly integrate" with B-Flow [CIA #1, #12, #15] [C-16].
- A mock costs build time that could go into the core flow. Skipping it may cost points if integration readiness is scored.
- The keys a later integration needs must exist from day one, or every case has to be migrated.

**We propose (they confirm)**
- Manual in the MVP:
  - RMM creates cases
  - the final PDF is stored in the case and e-mailed to RMM
  - RMM records the B-Flow reference by hand
- Every case stores an optional external reference (Teamcenter ID, BDF material number or IRMA reference), with a duplicate check.
- A documented interface design. A demo stub (inbound case creation, outbound status at completion) only if it is scored.

**Evidence**
- [ReqDoc p.2 §1.1]: out of scope 2026 (OP-13)
- [ReqDoc p.5 §3.3.3]: filed in B-Flow, "status feedback to the preceding system"
- [BRM REQ-PROC-001, -046]
- [CIA #1, #12, #15, #18, #32]: Must Have
- [FLM r3]: Teamcenter auto-fill "post-MVP"

**KB overlap:** OP-13, BD-04. We ask about scoring weight, not only scope.

#### Q17 · Does the MVP carry forward; EU hosting · 2 min

**Say it (about 21 s):** "If Kissflow is chosen, does the MVP become the start of the live solution, or a prototype you'd rebuild? If it carries forward, we'd set it up from day one in a dedicated EU-hosted Beiersdorf account with separate test and production. Must all data, backups and any AI processing stay in the EU?"

**Why it matters**
- If the MVP carries forward, we set up EU hosting, separate environments, single sign-on and permanent field IDs from day one. A rebuild later would cost BDF months.
- Supplier compositions are trade secrets and contact data is personal data. Committing to EU-only now removes a compliance question before IT raises it.

**We propose (they confirm)**
- A dedicated EU-hosted BDF account with test and production, carried forward after selection. Test data is purged at go-live.
- EU-only for data, files, backups and AI processing, with every subprocessor and its location listed in the DPA.

**Evidence**
- [ReqDoc p.2 §1.1]
- [BRM REQ-CFG-001]: "test environment"
- [VQ r17]: "hosted primarily on Google Cloud Platform (GCP)"
- [VQ r20]: "European data centers upon request"
- [VQ r24]: no e-mail or AI subprocessor named
- [VQ r28]: "fully isolated sandbox environment"

**KB overlap:** none.

#### Q18 · Logins for suppliers and Beiersdorf staff · 2 min

**Say it (about 20 s):** "How should people log in? For suppliers we'd propose invitations to named e-mail addresses, each with a personal login and two-step sign-in, no shared logins. Beiersdorf staff would use single sign-on, presumably Microsoft Entra ID. Is single sign-on needed already for the test? If so, IT should register the app now."

**Why it matters**
- Onboarding friction decides supplier adoption, and BDF's security bar decides the design.
- Confirmations and answers are recorded with name, role, e-mail and time. Only personal logins make them attributable.
- SSO for BDF users is a Must Have and needs IT lead time.

**We propose (they confirm)**
- Suppliers:
  - invitation-based personal accounts bound to the invited e-mail, with two-step sign-in
  - shared mailboxes only as an extra notification address
  - no supplier SSO in the MVP
- BDF staff:
  - Entra ID via SAML
  - roles maintained in the tool by the business admin in the MVP; group sync later
  - external contractors use their BDF Entra accounts
- If IT cannot register the app within about two weeks: test logins with two-step sign-in, and SSO before any pilot.

**Evidence**
- [BRM REQ-PROC-004]; [BRM REQ-CTL-001]
- [BRM REQ-PROC-014, -042]: name, role, e-mail, timestamp
- [CIA #20]: SSO for BDF users, Must Have
- [VQ r16]: BDF's guidance names "MFA, Azure AD/Entra ID, user provisioning"; [VQ r14]: SCIM
- [FLM r5]: second contact e-mail as an extra notification recipient

**KB overlap:** BD-06 (related).

---

### Block E. Test logistics (2 minutes)

#### Q19 · Testers, sample materials, dates, checkpoints · 2 min · dates are must-ask

**Say it (about 22 s):** "To close: who will test, with which sample materials, and when? We'd suggest one key user per department, Beiersdorf colleagues playing two fictitious suppliers, and four or five anonymised materials shared with both vendors. What are the delivery date, test window and decision date, and could we have a 30-minute checkpoint every two weeks?"

**Why it matters**
- Test data decides which rules, annexes and roles must be polished.
- Real supplier testers mean real personal data, invitations to outside domains, a signed DPA and a security sign-off before the start.
- Role-played suppliers still need two fictitious supplier companies with two users each, to prove parallel editing and isolation.
- Shared test data keeps the comparison fair.
- A shared answer log gives Beiersdorf one record of its decisions. The KB's owner and decision columns are empty for all 22 open points.

**We propose (they confirm)**
- **Testers:** 1-2 per internal role (RMM, Regulatory, Safety, QM, Microbiology, Sustainability, business admin; about 10-14 people). BDF staff play two fictitious suppliers with two contacts each. Real suppliers join only in a later pilot.
- **Materials:**
  - vegetable with palm (RSPO path)
  - petrochemical / mineral oil (MOAH and PAH limits)
  - animal origin (BSE/TSE)
  - a two-origin blend
  - one recycled or CCU material
- **Scenarios:**
  - happy path
  - query loop with a rejected answer
  - late extra annex
  - origin change after submission
  - department rejection
  - cancellation
- If BDF cannot share real CIQs, we build fictitious seed data and send it for a plausibility check.
- **Decision log:** the KB "Open Points" sheet, with owner and decision filled in, each answer dated.

**Evidence**
- [BRM REQ-PROC-021]: "a test with a supplier role"
- [BRM REQ-CTL-001]: acceptance with two supplier users in parallel
- [BRM REQ-CTL-006]
- [BRM REQ-CFG-003]: palm acceptance test
- [KB 'Open Points' cols G-H]
- [VQ r26]: timeline answered without dates
- [VQ r20]: DPA

**KB overlap:** 'Open Points' cols G-H, proposed as the shared decision log.

---

## 3. Close (3 minutes): artefacts and next steps

1. **Ask for the six artefacts we need first:**
   - the process diagram (D1)
   - the test plan and scorecard (D2)
   - the draft configuration table (D3)
   - the CIQ 2026 Word template (D4)
   - the RMES template (D5)
   - the limit values (D8)
2. Agree that we send within 24 hours (W16):
   - the recap
   - the decision log
   - the structured written list (section 5)
3. Agree the date for call 2, and whether department representatives (Regulatory, Safety, QM, Sustainability) can join for 20 minutes. Most call-2 items are confirmations of our defaults.
4. Agree how both vendors receive answers, so the comparison stays fair (Q19).

---

## 4. Call-2 list (ranked)

These are mostly confirmations of our defaults, ideally with department representatives. If time is short, items C2-19 to C2-23 move to writing. "Our default" is our proposal, not a BDF statement.

**C2-01 · Final outcomes and conditions** (BC-05, BC-07 conditions part, TQ-10)
- **Ask:** Which final outcomes can a case have? For example: approved; approved with conditions such as "not for China" or "third batch analysis within six months"; rejected; cancelled; closed without supplier release. Who uses that status afterwards?
- **Our default:**
  - Those five final statuses.
  - Conditions become follow-up tasks that stay open after closure.
  - Only the two approved statuses count as "usable" in reports and in later Teamcenter feedback.
  - Our draft status model (W3) goes out before the call.
- **Evidence:**
  - [BRM REQ-PROC-045]: final status in all dashboards
  - [BRM REQ-CTL-006]: overall status "derived traceably"
  - [ReqDoc p.5 §3.3.3]: status feedback to the preceding system
  - [CIA #18]
  - [FLM changelog r162]: "No RSPO certification" is a deviation to be assessed by BDF
  - [ReqDoc p.13 REQ-RMES-009]; [ReqDoc p.14 REQ-RMES-018]
- **KB:** NEW-03.

**C2-02 · Supplier never releases, or spots an error at release** (BC-06, TQ-08)
- **Ask:** If the supplier never gives the final release, refuses it, or spots an error at that moment, can Beiersdorf close the case without it?
- **Our default:**
  - The release task has a due date and reminders.
  - The supplier can either:
    - "request correction": reopens the affected sections as a review-phase change; the affected departments re-check, then a new release request follows
    - "decline with reason": creates an RMM task
  - After a set period RMM may close the case as "Closed without supplier release", with a mandatory reason.
  - The release screen lists every change since the completeness confirmation.
- **Evidence:** [BRM REQ-PROC-042, -043]; [BRM REQ-PROC-045] "without a release from PS-11 no automatic completion takes place", manual completion only "in exceptional cases" [C-38, BR-12].

**C2-03 · Versioning and reopening completed reviews** (TQ-25, TP-19, TQ-27)
- **Ask:**
  - When a supplier corrects one field or uploads a new certificate, is that a new version of the whole questionnaire or only of that answer?
  - When data a department has already reviewed changes, should that review reopen automatically, with a one-click "no impact" option?
- **Our default:**
  - Snapshots at the completeness confirmation and at the final release.
  - History per answer and per document, each change tagged with the query behind it.
  - A new case-level version only on a scope change or an explicit full resubmission.
  - One RMES record per case version with history per criterion.
  - Affected reviews are flagged and either reopen or get "no impact" plus a comment.
  - A configurable list of fields with no review impact (for example the contact e-mail).
  - This applies to all departments.
- **Evidence:**
  - [ReqDoc p.4 §3.1.5]; [ReqDoc p.5-6 §3.4]
  - [ReqDoc p.13 REQ-RMES-001, -005, -011, -012]
  - [ReqDoc p.14 REQ-RMES-016] "retain every RMES version"
  - [BRM REQ-PROC-021] "exactly one RMES data record ... with CIQ version" [BR-05]
  - [BRM REQ-PROC-016, -031, -034]; [BRM REQ-CTL-010]
- **KB:** NEW-14 (related).

**C2-04 · Late scope changes and running cases** (TQ-26 details, TP-16, BC-27, TQ-35)
- **Ask:**
  - If a section is added late, a regulation changes, or a rule proves wrong, do running cases stay on their original questionnaire and rules?
  - Who decides to move selected cases to a new version?
  - Until when may sections be added?
- **Our default:**
  - Cases are pinned to their start version, and late sections come from that version.
  - An admin can push an extra section in bulk, or move selected cases to the new version after seeing the difference. Either action needs a reason and is audited.
  - A "safety-relevant correction" flag lists the affected running cases.
  - Cut-off is the final release. A pending release request is withdrawn with a neutral message if new sections are activated.
  - The process owner decides, together with the affected department.
- **Evidence:**
  - [BRM REQ-CFG-001]: running cases keep their template version
  - [BRM REQ-CFG-003, -008]
  - [BRM REQ-ADR-002] "throughout the entire process"
  - [BRM REQ-PROC-040, -043]
  - [ReqDoc p.6 K4.3] "subject to change"
  - [ReqDoc p.13 REQ-RMES-008]; [ReqDoc p.14 REQ-RMES-016]

**C2-05 · Shared sections and one source for review tasks** (BC-22, TQ-32, TQ-29)
- **Ask:**
  - For shared sections (K2.2 by-products and contaminants, California Prop 65, EUDR), does the lead decide alone or must both departments sign off? Who settles a disagreement?
  - May review tasks come from one section-ownership table, rather than the "reviewing department" column of the origin table or the "Approval" column of the field matrix?
- **Our default:**
  - The lead sets the section result. The co-reviewer's queries block only the co-reviewer's own completion.
  - A per-section setting decides whether the co-reviewer must finish first.
  - A disagreement goes to the overall decision (Q9), and both views are kept internally.
  - The ownership table is seeded from PDF §4.1/§4.2 and its "(lead)" markers. The conflicts go in writing (W2).
- **Evidence:**
  - [ReqDoc p.9 §4.3] "Requires a rule on whether both roles approve or one takes the lead (OP-18)"
  - [BRM REQ-CFG-006]: lead and co-reviewing departments
  - [BRM REQ-CTL-003]: exactly one responsible
  - [BRM REQ-PROC-017, -034]
  - [ReqDoc p.11 §5.4]
  - [FLM col M] [C-10, C-11, C-37]
- **KB:** OP-18, NEW-09.

**C2-06 · Scope check before release** (BC-21, TQ-15)
- **Ask:** After the system builds the questionnaire, does anyone at Beiersdorf check it before the supplier sees it? May that person only add sections, or also remove ones the rules made mandatory?
- **Our default:**
  - Release is automatic.
  - An RMM check happens only for flagged cases (undefined origins, contradictory answers, rule conflicts), with a two-working-day target.
  - Any authorised department may extend the scope with a justification. Only the lead department may reduce it, with a justification shown in the audit trail and the PDF.
  - Manual overrides survive a re-derivation.
- **Evidence:**
  - [ReqDoc p.10 §5.2] "The department sees the derived scope and can extend or reduce it during the IRMA process ... Only then is the full questionnaire released"
  - [ReqDoc p.2 §2.1]: PS-03 actor "System"
  - [BRM REQ-CFG-007]: extend with justification, no reduction
  - [BRM REQ-ADR-002]
  - [ReqDoc p.13 REQ-RMES-004] [C-17, C-18]

**C2-07 · Who answers which setup questions; what may be justified away** (BC-20, TQ-17 rest, TQ-31)
- **Ask:**
  - Who answers the micro-testing waiver and EUDR scope: the supplier, or Beiersdorf?
  - When a supplier writes a justification instead of providing a mandatory item, must the department accept it like a query?
  - If a market is added after closure, is that a new case?
- **Our default:**
  - "No micro testing" needs a justification and creates an acceptance task for Microbiology.
  - The supplier answers EUDR scope, and Sustainability confirms it.
  - A per-field setting, "justification allowed": on for evidence uploads, off for identity and configuration fields.
  - Each justification creates an open point for the owning department.
  - A market added after the freeze → a linked follow-up case, pre-filled, with only the new market sections.
- **Evidence:**
  - [ReqDoc p.11 §5.3 SF-12]: the waiver deactivates the micro and challenge tests; the total microbial count stays mandatory
  - [KB 'Config Questions' r10, r12]
  - [BRM REQ-PROC-012]; [ReqDoc p.4 §3.1.4]; [ReqDoc p.13 REQ-RMES-001]
  - [Feldkatalog comment C46] "Hier bitte prüfen, ob die Begründung notwendig ist"
  - [BRM REQ-PROC-043] [C-19, C-31, K-37]
- **KB:** SF-09, SF-11, SF-12, NEW-08, R-120, Q-034.

**C2-08 · Configuration governance after go-live** (BC-26, TP-14, TP-15, TQ-36)
- **Ask:**
  - After go-live, who changes questions, rules and limits, and how often?
  - Must a second person approve a change before it goes live?
  - Does the business admin move changes from test to live, or does IT?
- **Our default:**
  - A small central business-admin team (2-3 people) under the process owner. Departments propose changes.
  - One "configuration release" bundles template, rules, ownership and limits, and goes through: draft → automatic check against reference cases → second-person approval → publish with a note and a reason.
  - Publishing is blocked if a rule points at a missing section or a section has no owner.
  - Test holds synthetic data only and e-mails an allow-list only.
- **Evidence:**
  - [BRM REQ-CFG-001] "without an IT ticket"
  - [BRM REQ-CFG-003, -006]
  - [ReqDoc p.13 REQ-RMES-002, -008]
  - [CIA #4]; [VQ r28]: sandbox
  - [FLM changelog r94, r108, r130-r141, r182]: IDs renumbered

**C2-09 · RMES, pre-fill and AI depth in the MVP** (BC-16, TQ-39, TP-35, TP-36)
- **Ask:** The internal evaluation sheet, copying CIQ data into it, and AI document review are "partial scope". What must the MVP show for each? Are there limits on using AI with supplier documents?
- **Our default:**
  - RMES:
    - one RMES per case version, with history
    - a small configurable set of criteria per Part A-D
    - applicability through the same rule engine
    - findings with a blocking flag, and query-from-finding
    - separate Safety and Regulatory outcomes
    - invisible to suppliers
    - simple PDF export
  - Pre-fill a small agreed set (INCI, CAS, concentration, origin, MOAH) with a source reference.
  - AI showcase: flag differences between an uploaded document and the supplier's answers (for example the MOAH value). Suggestions are marked and sourced, and the reviewer confirms or discards them.
  - AI limits: EU processing, no training on BDF data, every suggestion and decision logged, internal only.
- **Evidence:**
  - [BRM REQ-PROC-021, -022, -024] "MVP partial scope"; [BRM Legend r5]
  - [ReqDoc p.12 §7] "unless the MVP decision explicitly records a deferral"
  - [ReqDoc p.13 REQ-RMES-002]: Parts A-D
  - [ReqDoc p.5 §3.2.3]: AI "must not replace the accountable assessment"
  - [ReqDoc p.14 REQ-RMES-015]
  - [VQ r10, r24] [C-24, BR-20]
- **KB:** NEW-05.

**C2-10 · Limit values: owner, versions, supplier visibility** (TQ-38, BC-28 ownership part)
- **Ask:** Who owns Beiersdorf's limit values (heavy metals, PAH, MOAH, microbes)? How often do they change, and may suppliers see them while filling in?
- **Our default:**
  - A versioned limit table: substance, limit, unit, method, valid from / to, source.
  - Maintained by Safety (Microbiology for microbial limits), under the same approval as rule changes.
  - Each evaluation stores the limit version it used.
  - On an exceedance the supplier sees only "justification required", unless BDF allows the limits to be shown.
  - The values themselves are requested in writing (D8, W4).
- **Evidence:**
  - [ReqDoc p.6 K2.2] "Limits checked against the Beiersdorf values in Annex 14"
  - [ReqDoc p.9 A14]: moved into the main document
  - [ReqDoc p.8 A9]: "binding Beiersdorf limits and a reference method"
  - [ReqDoc p.13 REQ-RMES-008]
  - [Feldkatalog r27-r29]: As, Cd, Cr only [C-22, G-09]
- **KB:** NEW-06, Q-016, Q-110, D-12.

**C2-11 · Supplier confirmations** (BC-32, TQ-09, TP-12, TP-29)
- **Ask:** Who at the supplier may give the completeness confirmation and the final release? Is a logged click with name, role, e-mail and time enough, or is an electronic signature needed?
- **Our default:**
  - Only contacts flagged "authorised to confirm" by the supplier's main contact.
  - Click-to-confirm, with a versioned declaration text stored with each confirmation and printed in the PDF.
  - A signed upload only where a regulation demands it (the UK REACH declaration in A11).
  - No qualified e-signature in the MVP.
- **Evidence:**
  - [BRM REQ-PROC-014, -015, -042]
  - [ReqDoc p.4 §3.1.5] "confirms submission and responsibility"
  - [ReqDoc p.8 A11] "Contains a signed declaration by the supplier"
  - [Feldkatalog r15] "Digital signature"
  - [CIA #5] [BR-21]
- **KB:** BD-06, Q-114, D-19.

**C2-12 · Supplier user administration** (BC-33, TP-11)
- **Ask:** Who manages supplier users when a contact leaves or a colleague joins: the supplier's main contact, or RMM?
- **Our default:**
  - RMM names the main contact when it creates the case.
  - The main contact invites and removes colleagues from the supplier's own e-mail domain, and can invite the manufacturer for named sections.
  - RMM sees all supplier users per case and can replace the main contact. Open tasks move to the successor.
  - Access ends a set period after closure (for example 90 days).
- **Evidence:**
  - [BRM REQ-CTL-001]: assignment "exclusively on the supplier's side"
  - [BRM REQ-PROC-001]: case created with the supplier contact
  - [FLM r4]: contact e-mail "pre-filled automatically from supplier master data"
  - [BRM REQ-CTL-003]
  - [CIA #26, #27] [C-25]
- **KB:** BD-06.

**C2-13 · What suppliers see during the review** (BC-34, TQ-40)
- **Ask:** While Beiersdorf reviews, should the supplier see only simple states, or progress per department? Besides comments and findings, is anything else strictly internal, such as reviewer names, internal due dates or cancellation reasons?
- **Our default:**
  - Supplier states: action required / under review / waiting for your release / completed / cancelled.
  - A neutral outcome message written by RMM.
  - Findings reach the supplier only as separately worded queries, with a "what the supplier will see" preview.
  - BDF attachments are internal by default, with an audited "share" action.
  - A supplier-role test per channel: screens, e-mails, PDF, search.
- **Evidence:**
  - [BRM REQ-PROC-040]: one release notification without internal content
  - [BRM REQ-CTL-002, -006]; [BRM REQ-PROC-020, -030]
  - [ReqDoc p.3 §3]; [ReqDoc p.14 REQ-RMES-015] [BR-09]

**C2-14 · Departments talking to suppliers directly** (BC-39, BC-40, BC-31)
- **Ask:**
  - Should RMM see or bundle questions before they go out?
  - How do we stop two departments asking the same thing?
  - May Beiersdorf staff ever correct a supplier answer themselves?
  - Who answers when a supplier has a question?
- **Our default:**
  - Direct contact with no approval gate; RMM sees everything.
  - A reviewer sees open queries on the same item and can join one. One supplier answer can close several queries.
  - Beiersdorf never edits supplier data; corrections go back as queries.
  - An "Ask Beiersdorf" action per section, routed to RMM before submission and to the owning department during review. Answers are stored at the section.
- **Evidence:**
  - [ReqDoc p.1 §1]
  - [BRM REQ-PROC-019]: internal roles edit only their own area
  - [BRM REQ-PROC-020, -029, -030, -033, -042]
  - [CIA #10] "Q&A ping pong"
  - [ReqDoc p.14 REQ-RMES-015]

**C2-15 · Review routing, deputies and delegation** (BC-24, TQ-34, TP-25)
- **Ask:**
  - Does a review go to a department queue, or to a named reviewer per case?
  - Who grants a deputy or a delegation? May Regulatory act for Safety?
  - Must the approver differ from the reviewer?
- **Our default:**
  - A department queue. The reviewer who claims a task becomes its named owner, and the team lead can reassign (audited).
  - "Unassigned" is visible to RMM, with an escalation after a set number of days.
  - A delegation record (grantor, delegate, scope, validity, reason), granted by the department lead.
  - Cross-department delegation covers completion only, never the Approved / Rejected decision.
  - Four-eyes is off by default.
- **Evidence:**
  - [BRM REQ-CTL-003, REQ-PROC-034]
  - [BRM REQ-PROC-039]: "only possible via an auditable delegation"
  - [ReqDoc p.13 REQ-RMES-011]; [ReqDoc p.14 REQ-RMES-013, -018]
  - [CIA #3] [BR-08]

**C2-16 · Deadlines, reminders, escalation, notifications** (BC-38, TQ-43, BC-35 digest part, TP-42)
- **Ask:** What deadlines and reminders apply today? Who is alerted when a supplier does not react? Does the supplier see a query's due date?
- **Our default:**
  - Supplier tasks:
    - 10 working days
    - a reminder 2 days before and 1 day after
    - escalation to the RMM owner, then to Procurement after 5 more days
  - Reviewer tasks: 5 days, escalating to the department lead. The department's clock pauses while the supplier has the point.
  - Each query has two dates: a due date the supplier sees and a hidden internal target.
  - Escalation after 3 rounds or 30 days.
  - A bounced or unopened invitation after 5 days creates an RMM task.
  - Immediate e-mail for new tasks; a daily digest for everything else.
  - Sent from a BDF address if IT sets up the domain.
  - After 90 days without activity RMM gets a "continue or cancel" task.
- **Evidence:**
  - [ReqDoc p.5-6 §3.4]; [ReqDoc p.12 §6.2]
  - [ReqDoc p.14 REQ-RMES-019] "Due-date reminders and escalation recipients must be configurable"
  - [BRM REQ-ADR-001] "internal due date (remains flexible)"
  - [BRM REQ-PROC-030]: the supplier sees the due date
  - [BRM REQ-PROC-035, -040]; [BRM REQ-CTL-010] [C-36]
- **KB:** NEW-16.

**C2-17 · Final document** (TQ-41, TP-30, BC-08)
- **Ask:** Beyond the matrix list, what must the final CIQ document contain? Is there an internal and a supplier version? Is the evidence attached, or only listed?
- **Our default:**
  - Two variants.
  - **Internal**:
    - released data, including the composition per component
    - the scope, with the rules that fired and their versions
    - overrides
    - the three confirmations, with the version of their declaration text
    - department outcomes
    - accepted justifications
    - non-blocking findings
    - the document register
  - **Supplier**: its own data, the confirmations, and the outcome message.
  - PDF/A with a hash in the audit trail, plus an optional ZIP of the evidence for filing.
  - E-mailed as a link. Regenerating creates v2 and keeps v1.
- **Evidence:**
  - [BRM REQ-PROC-046] "The content of the PDF still has to be confirmed by the business"
  - [BRM REQ-PROC-015, -038]
  - [ReqDoc p.5 §3.3.3]
  - [ReqDoc p.14 REQ-RMES-017, -020]
  - [CIA #5, #7, #14] [G-12]
- **KB:** OP-13.

**C2-18 · Case identity, sites, supplier master** (BC-42, TQ-20, TP-37)
- **Ask:**
  - Is a case one raw material from one supplier at one production site, so that a second site means a new case?
  - In the MVP, where do supplier names, DUNS and contacts come from?
  - Should GMP and ISO certificates be kept once per supplier?
  - What do IRMA and RMT stand for?
- **Our default:**
  - Case = material × supplier × site, with a duplicate warning (DUNS + trade name + site). A second site is a new case, pre-filled.
  - An in-app supplier master keyed by DUNS, loaded once from an anonymised extract. RMM can add suppliers (audited).
  - SAP MDG stays the golden source, with a later one-way sync.
  - A supplier / site document library with expiry dates, which can be switched on later.
  - Site approval stays outside the MVP unless BDF says otherwise.
- **Evidence:**
  - [BRM REQ-PROC-001, -006]
  - [FLM changelog r25] "Only one production site"
  - [ReqDoc p.10 §5.3 SF-02]
  - [CIA #24, #28-#31]: site approval is Must Have in #31
  - [ReqDoc p.7 K6.12]: reuse "(OP-17)"
  - [FLM r3, r4, r7-r9]
  - [KB 'Config Questions' r17]
  - [CIA #1] "IRMA, RMT"
  - [VQ r15] [C-14, BR-10, G-17]
- **KB:** OP-17, SF-02, BD-01, BD-04.

**C2-19 · Documents** (TP-27, TP-28, TP-34)
- **Ask:**
  - Should one document that answers several questions, such as the safety data sheet, be uploaded once and linked?
  - Which file types and sizes are allowed, and should password-protected PDFs be refused?
  - Does BDF IT require virus scanning on upload?
- **Our default:**
  - A per-case document register: upload once, link many times.
  - Each version records the system version, the printed revision, and the issue and expiry dates.
  - Allowed types: PDF (preferred), XLSX, DOCX, JPG, PNG. About 50 MB per file, to be confirmed.
  - Password-protected PDFs are refused. Originals are stored unchanged.
  - Files are scanned on upload, and flagged files are quarantined.
- **Evidence:**
  - [BRM REQ-PROC-011, -029, -034]
  - [ReqDoc p.14 REQ-RMES-017]
  - [Feldkatalog r47]: the SDS also appears at K6.1
  - [FLM r46] "PDF"
  - [BRM REQ-CFG-004] "(only PDF documents from supplier)"
  - [VQ r19] [BR-14]
- **KB:** D-01, OP-17.

**C2-20 · Re-qualification and changes after closure** (BC-43)
- **Ask:** Does Beiersdorf reconfirm CIQs regularly, for example every two years as the industry template suggests? How does a supplier report a change after closure?
- **Our default:**
  - Closed cases are never reopened. Each carries a "reconfirm by" date that reminds RMM.
  - Re-qualification is a new, linked, pre-filled case, with a field-by-field comparison.
  - "Report a change" on a closed case creates an RMM task.
  - MVP: the data model is ready and the link is shown.
- **Evidence:**
  - [IKW p.2] "e.g. in two year intervals" (an industry reference, not BDF)
  - [BRM REQ-PROC-043]
  - [ReqDoc p.4 §3.1.5] [BR-15]

**C2-21 · Cancellation and reactivation** (BC-44)
- **Ask:** Who may cancel, for which reasons? Can a cancelled case be brought back within a year, and does it continue where it stopped?
- **Our default:**
  - Only RMM cancels, with reason codes. The supplier gets a neutral notice.
  - RMM may reactivate within 365 days (configurable). The case resumes at its last step on its original rules, with expired documents flagged.
  - After that window, the case is copied into a new one.
- **Evidence:**
  - [ReqDoc p.5 §3.3.3] "assumption: 1 year, to be confirmed"
  - [BRM REQ-PROC-049]: cancellation, no reactivation
  - [BRM REQ-PROC-045] [C-23]
- **KB:** NEW-15.

**C2-22 · Retention, archive and audit** (BC-45, TP-20, TP-21)
- **Ask:**
  - How long must records be kept, and is B-Flow the official archive?
  - Who audits these records, and in what form?
  - Must document views be logged?
- **Our default:**
  - The tool keeps the working record and the full audit trail.
  - The final package is filed in B-Flow: by hand in 2026, automatically later. The B-Flow reference is recorded on the case.
  - No deletion in 2026. A purge happens only through an audited admin procedure, after filing is confirmed.
  - Retention follows BDF's records policy and is applied in B-Flow.
  - A read-only auditor role and a per-case audit dossier (PDF + CSV).
  - Views are logged only if required.
- **Evidence:**
  - [ReqDoc p.5 §3.3.3] "unchangeable form"
  - [ReqDoc p.2 §1.1]
  - [BRM REQ-CTL-009]; [ReqDoc p.14 REQ-RMES-016]
  - [VQ r23]: no native retention policies
  - [CIA #12, #15] [BR-16, C-30]
- **KB:** OP-13.

**C2-23 · Department adoption** (BC-41)
- **Ask:** How will departments start: a key user each, a pilot group? Which side tools should stop, such as Sustainability's separate questionnaire or documenting reviews in Teamcenter?
- **Our default:**
  - One key user per department, trained through train-the-trainer.
  - Sustainability's questionnaire becomes an internal section later.
  - Teamcenter documentation stays until the integration exists.
- **Evidence:**
  - [ReqDoc p.5 §3.2.5, §3.2.6, §3.3.2]
  - [VQ r25, r28]
- **KB:** NEW-13.

---

## 5. Written follow-up (send within two working days of call 1)

These are structured, field-level or rule-level lists that departments answer more reliably on paper than on a call. Each one carries our proposal so BDF can mark it up rather than start from a blank page.

**W1 · Rule-level proposal and seeded configuration table v0.1** (TQ-12 details, TQ-13, TQ-14, TQ-16, TQ-18; format from BC-25 / TP-13)

We send:
- The table, one row per rule, with:
  - condition
  - target section or evidence
  - class: mandatory / optional / not applicable
  - lead and reviewing departments
  - status, for example "pending BDF"
- The six conflicting annexes (A1, A2, A3, A7, A10, A11/A12), each with our proposal. A7 for minerals is unresolved: the field matrix carried it over unchanged, while the old catalogue lists only A10-A12 for minerals [K-12].
- **Mineral-oil trigger:**
  - a separate yes/no question vs "petrochemical" vs both
  - is "polymer" an origin or a property of the material?
  - contradictory answers are blocked until resolved
- **Configuration questions up front:**
  - the palm question asked when any component is vegetable
  - the fermentation question moved out of Annex 2 into the first step
  - RSPO certificate upload when palm = yes
  - "No RSPO certification" allowed with a justification, raising an open point for Sustainability
- **Undefined origins:** waste, CCU and chemical recycling, plus whether "microorganism / biotech" and "other" are needed.
- **Rule logic:** precedence and exclusion semantics.

Evidence:
- [ReqDoc p.8-12 §4.2, §5.3, §5.4]
- [BRM REQ-CFG-003, REQ-PROC-009, -010]
- [FLM r16-r30, r41, r45-r55]
- [FLM changelog r123, r129, r162, r172]
- [Feldkatalog r33, r49]
- [IKW p.4] [C-06, C-09, C-20, BR-03, BR-19]

KB: NEW-02, NEW-07, OP-02, OP-03, R-xx, SF-03, SF-06, SF-07, SF-08, D-08.

**W2 · Section-ownership conflicts** (BC-23, TQ-29 details)
- A list of the sections where PDF §4.1/§4.2, the §4.3 summary and the field matrix "Approval" column disagree. Twelve sections have several departments: K1, K2.3, K4.2, K4.3, K5.2, K6.5, K6.6, K6.9, A1, A2, A6 and A8 [C-32]. Examples:
  - A2: Safety (lead) vs Regulatory vs RMM
  - A1: Sustainability and Safety vs Regulatory
  - K5.3: Safety vs QM / Microbiology
  - K2.3: RMM lead vs Regulatory only
- We ask what the field matrix "Approval" column means: a field-level reviewer, or an approval step?
- Departments mark lead, co-reviewer or informed.

Evidence: [ReqDoc p.6-9 §4.1-§4.3]; [FLM col M]; [BRM REQ-CFG-006] "follows exactly this configuration" [C-10, C-11, K-17]. KB: OP-18, NEW-09, 'Sections' r5.

**W3 · Draft status model**
Proposed by: TQ-10. Statuses for the case, the department review, the section and the query, with roll-up rules, final statuses and supplier-facing labels.

Evidence: [BRM REQ-CTL-006, REQ-PROC-034, -045]; [ReqDoc p.14 REQ-RMES-018] [C-26].

**W4 · Quantitative fields and limit values** (TQ-37, BC-28)
- The MOAH unit: mg/kg or %, a factor of 10,000.
- One canonical unit per field.
- Each value carries: the value, a qualifier (=, <, not detected), the limit of quantification (LOQ) and the method.
- Two batches: the maximum counts. No rounding before comparison. An LOQ above the limit = "inconclusive".
- An exceedance creates a finding for Safety and asks the supplier for a justification.
- "Confirmed" is computed by the system, not ticked by the supplier.
- Please send the current limit list.

Evidence: [FLM r53]; [FLM changelog r174] "Clarify unit."; [Feldkatalog r27-r29]; [ReqDoc p.6 K2.2]; [ReqDoc p.13 REQ-RMES-008, -009]; [IKW p.7] [BR-13]. KB: Q-102, Q-015, D-05, D-12, NEW-06.

**W5 · Behaviour when an answer change removes data** (TQ-22)
Proposal:
- The removed data is kept in history but left out of the submission, the PDF, RMES and reports.
- Open queries on it close as "out of scope". During the review phase this happens only after the department confirms.
- Restored answers come back as "to be confirmed", and a restore during review counts as a change.

The two matrix rows behind this carry an unexplained light-orange fill, not the legend's yellow "open question" colour [C-40].

Evidence: [BRM REQ-CFG-008, -009, REQ-PROC-036]; [ReqDoc p.10 §5.2]; [FLM r45-r51]. KB: NEW-14.

**W6 · Document register and supplier-level documents** (TQ-23)
- Attributes:
  - immutable ID and versions
  - type
  - original title and revision
  - issue and expiry dates
- One document can be referenced from several questions. A replacement triggers the impact check.
- GMP and ISO certificates are captured per case in the MVP but stored in a supplier-level register, so reuse can be switched on later.
- A warning if a document has expired at submission.

Evidence: [BRM REQ-PROC-011, -029]; [ReqDoc p.7 K6.12]; [ReqDoc p.14 REQ-RMES-017]; [KB D-01, D-18, Q-072] [BR-14]. KB: OP-17.

**W7 · Stable references for queries** (TQ-33, TP-22)
- Queries and assessments follow the component, not its row position.
- Deleting a row with an open point is blocked.
- A queried document shows "newer version available" when the supplier uploads a new one.

Evidence: [BRM REQ-PROC-029, -033]; [ReqDoc p.13 REQ-RMES-005, -010, -011].

**W8 · Field keys and validations** (TP-18, TP-17)
- Field-matrix IDs become permanent keys, and a retired ID is never reused.
- We list which checks business admins configure (mandatory, show-when, option lists, ranges, units, a library of cross-checks) and which are built in (CAS, EC, DUNS and e-mail formats; min ≤ max).

Evidence: [FLM changelog r94, r108, r130-r141, r182]; [FLM r7, r11, r15, r35]; [BRM REQ-CFG-001, -002] [BR-22].

**W9 · Sizing assumptions** (TP-32, TQ-44, TP-31)
- Worst case per case: about 40-50 components, 30-50 documents with versions, and 20 queries.
- The same section edited at once shows a visible "being edited by" lock.
- Please confirm the largest composition you see.

Evidence: [ReqDoc p.6 K2.1]; [BRM REQ-CFG-002, REQ-CTL-001]; [IKW p.7-9].

**W10 · IT onboarding pack** (TP-08, TP-42 sender part)
- We send:
  - our ISO 27001 and SOC 2 reports
  - our DPA with SCCs
  - our subprocessor list, including e-mail and AI providers and their locations
  - the domains to allow-list
  - the sender-domain setup for notifications
- We ask for BDF's security-review steps and lead time.

Evidence: [VQ r19, r20, r24, r31].

**W11 · Integration design note** (TP-38, TP-39, TP-40)
- The external reference key on each case: Teamcenter ID, material number or IRMA reference.
- Status milestones back to Teamcenter: started, submitted, review complete, completed, cancelled.
- B-Flow-ready file names plus a metadata sheet. The display title stays separate from the original file name.
- No migration of old CIQs in the MVP.
- We ask: B-Flow naming rules and tags, and which number Teamcenter will send.

Evidence: [CIA #1, #12, #15, #18]; [ReqDoc p.5 §3.3.3]; [ReqDoc p.14 REQ-RMES-017]; [FLM r3]; [KB 'Config Questions' r17]. KB: BD-04, OP-13.

**W12 · Supplier guidance and tester training** (BC-17)
- One-page supplier quick start, a three-minute video, help texts, an FAQ, and a train-the-trainer session for testers.

Evidence: [CIA #34] "User guide / explainer video to be provided by the vendor", Must Have; [VQ r28]; [BRM REQ-CFG-001] [C-30].

**W13 · Data protection for supplier contacts** (TP-23)
- Identities in audit records and final PDFs are kept for the retention period, with restricted access.
- Contact master data and inactive accounts are anonymised a set period after closure.

Evidence: [BRM REQ-PROC-014, -015, -042, -046]; [BRM REQ-CTL-009]; [VQ r20].

**W14 · Reporting and BI** (TP-44)
- MVP: in-app dashboards plus Excel export. Power BI later, through a scheduled feed.
- We ask: the top 2-3 cross-case reports, and the target data platform.

Evidence: [VQ r9, r11]; [BRM REQ-PROC-006]; [CIA #21-#23].

**W15 · Accessibility and devices** (TP-43)
- WCAG 2.1 AA for the supplier portal.
- Desktop first, with tablet support. Phones for viewing and simple tasks only.

Evidence: not covered in any BDF document (ReqDoc, BRM, FLM, CIA and VQ checked).

**W16 · Recap, decision log and test traceability** (BC-15, TQ-03 and TQ-01 / BC-11 proposals)
- The call-1 recap, with every answer recorded as a dated decision with an owner, in the KB "Open Points" layout.
- Our log of document conflicts and the side we took.
- A traceability matrix mapping each of the 51 matrix acceptance criteria to a click path and a seeded test case.

Evidence: [KB 'Open Points' cols G-H]; [BRM col F].

---

## 6. Documents and artefacts to request

| # | Artefact | Why we need it | Evidence | Ask on |
|---|---|---|---|---|
| D1 | The authoritative process diagram | The stated tie-breaker for structure and sequence. The PDF contains no images | [ReqDoc p.2 §2]; ReqDoc dump "embedded images: 0" [G-01] | Call 1 (Q4) |
| D2 | The MVP test plan: scenarios, scorecard / weighting, tester list, timeline | Without it we optimise blind | [ReqDoc p.2 §1.1]; no such content in any file [G-20] | Call 1 (Q2, Q19) |
| D3 | Current draft of the binding configuration table, and its owner | The core of the scope engine; the draft is "a structural illustration" only | [ReqDoc p.10 §5.3, p.11-12 §5.4] (OP-19) [G-04] | Call 1 (Q14) |
| D4 | The CIQ 2026 questionnaire (Word template, 8 chapters and 14 annexes) | The question inventory for chapters beyond the field matrix | [ReqDoc p.1 §1]; [FLM changelog r2] "CIQ 2026 Word template" [G-02] | Call 1 (close) |
| D5 | The RMES template, Parts A-D, its criteria, and the agreed CIQ→RMES mapping set | The largest internal feature; its depth drives effort | [ReqDoc p.12 §7; p.13 REQ-RMES-002]; [BRM REQ-PROC-022] "the mapping set is agreed with the business" [G-07] | Call 1 (close) |
| D6 | The full open-points list OP-01 to OP-19, and the matrix "Open points" sheet | Only OP-02, -03, -13, -17, -18 and -19 appear in the files. The matrix legend points to a sheet that was not shared | [BRM Legend r7]; grep of all dumps [G-06, C-40] | Written |
| D7 | Requirements catalogue v3.1 with the IDs the field matrix cites but the matrix lacks (e.g. REQ-PROC-104, -106; REQ-CFG-102, -103, -105; REQ-CTL-012; REQ-ADR-003) | To trace field rules back to requirements | [Feldkatalog r1 col L] "Ref. v3.1 (REQ-ID)"; [FLM r3, r5]; [Feldkatalog r24, r27, r49] [G-05] | Written |
| D8 | BDF limit values: the former Annex 14 (heavy metals, residues, specific impurities, CMR), Annex 9 PAH limits and reference method, the MOAH value and unit, microbial limits | Limit checks must be reproducible. Only As, Cd and Cr exist in the files | [ReqDoc p.6 K2.2, p.8 A9]; [Feldkatalog r25-r29]; [FLM changelog r174] [G-09] | Call 1 (close) |
| D9 | The final-PDF content definition, an example final CIQ document, and the supplier confirmation wording | "The content of the PDF still has to be confirmed by the business" | [BRM REQ-PROC-046, -015]; [CIA #5] [G-12] | Written |
| D10 | Sustainability's separate review questionnaire | Its review must fit the department-completion model | [ReqDoc p.5 §3.2.6, §3.3.2] [G-10] | Written |
| D11 | 3-5 anonymised real CIQs with their documents, one per origin type | A fair, realistic test basis for both vendors | proposal (TP-04); [BRM REQ-CFG-003, REQ-PROC-009] acceptance | Call 1 (Q19) |
| D12 | Full text of the truncated [Review] notes in the field-matrix change log (r35, r123, r126, r132, r162) | They are cut at 200 characters and hold open decisions | [FLM changelog r35, r123, r126, r132, r162] [C-42] | Written |
| D13 | BDF templates referenced in the annexes: the UK REACH signed declaration (A11), the BDF REACH questionnaire (A10), the list of "statements" required in K1, accepted sustainability certificates | Needed for the uploads and declarations | [ReqDoc p.6 K1; p.8 A11]; [Feldkatalog r49]; [KB D-04, D-07, D-19] [G-13, G-14] | Written |
| D14 | An anonymised supplier master extract (name, DUNS, contacts) from SAP MDG or Teamcenter | Seed data; master data that auto-fills fields | [FLM r4, r7-r9] "auto-fill from master data"; [VQ r15] | Written |
| D15 | IT prerequisites: SSO app-registration route (Entra ID), security review checklist, DPA template, BDF AI policy, B-Flow naming convention | These sit on the critical path to the test start | [CIA #20]; [VQ r14, r16, r20]; [CIA #12] | Written |
| D16 | Any baseline figures: case volumes, lead times, supplier counts | The business case and the KPI baseline | none in any file [G-19] | Call 1 (Q1, Q8) |

---

## Appendix A. Disposition of all 133 candidates

"Q" = call-1 question, "C2" = call-2 item, "W" = written follow-up, "D" = artefact request. No candidate was dropped outright. All are merged somewhere, and corrected wording was applied where a verdict required it (Appendix B).

### Business-consultant lens (BC)

| ID | Disposition | Note |
|---|---|---|
| BC-01 | Q9 | Merged with TQ-06; the "no rejection" claim corrected per K-35 |
| BC-02 | Q10 | Merged with TQ-07; "the matrix has no rejection path at all" corrected to "no department or case rejection" (K-35, BR-02) |
| BC-03 | Q10 | Merged with TQ-28 ("closed – not accepted") |
| BC-04 | Q11 | Merged with TQ-24, TQ-26; reframed per C-04 (both documents allow in-process changes; the mechanism and cut-off are open) |
| BC-05 | C2-01 | With TQ-10; the status model goes as W3 |
| BC-06 | C2-02 | With TQ-08 |
| BC-07 | Q10 (MVP default) + C2-01 | The non-blocking flag is stated as the MVP default in Q10; conditions follow up in C2-01 |
| BC-08 | C2-17 + D9 | The sample document and confirmation wording are requested as D9 |
| BC-09 | Q2 | Merged with TQ-03, TP-01 |
| BC-10 | Q3 | Merged with TQ-02, TP-02 |
| BC-11 | Q4 | Merged with TQ-01 |
| BC-12 | Q19 | Merged with BC-15, TP-03, TP-04 |
| BC-13 | Q2 + Q1 follow-up prompt | "Clearly better" in Q2; "past disappointments" as a Q1 prompt |
| BC-14 | Q16 | Merged with TQ-05, TP-06; "fully" wording limited to CIA #1, #12, #15 (C-16) |
| BC-15 | Q19 + W16 | Checkpoint in Q19; decision log in W16 |
| BC-16 | C2-09 | With TQ-39, TP-35, TP-36 |
| BC-17 | W12 | |
| BC-18 | Q6 | Merged with TQ-30, TP-26; Sustainability wording per G-10 |
| BC-19 | Q5 | |
| BC-20 | Q13 (markets) + C2-07 (EUDR, micro waiver) | |
| BC-21 | C2-06 | With TQ-15 |
| BC-22 | C2-05 | With TQ-32, TQ-29 |
| BC-23 | W2 | |
| BC-24 | C2-15 | With TQ-34, TP-25 |
| BC-25 | Q14 | Merged with TP-13, TQ-18 |
| BC-26 | C2-08 | With TP-14, TP-15, TQ-36 |
| BC-27 | C2-04 | With TP-16, TQ-35, TQ-26 details |
| BC-28 | C2-10 (owner) + W4 (values) + D8 | |
| BC-29 | Q7 | |
| BC-30 | Q13 | Merged with TQ-12, TQ-13, TQ-14 |
| BC-31 | C2-14 | With BC-39, BC-40 |
| BC-32 | C2-11 | With TQ-09, TP-12, TP-29 |
| BC-33 | C2-12 | With TP-11; FLM r4 citation corrected per C-25 |
| BC-34 | C2-13 | With TQ-40 |
| BC-35 | Q8 (languages) + C2-16 (daily digest) | |
| BC-36 | Q8 | Merged with TP-31, TQ-44, TP-41 |
| BC-37 | Q1 | Merged with TQ-42 |
| BC-38 | C2-16 | With TQ-43, TP-42 |
| BC-39 | C2-14 | |
| BC-40 | C2-14 | |
| BC-41 | C2-23 | |
| BC-42 | C2-18 | With TQ-20, TP-37 |
| BC-43 | C2-20 | |
| BC-44 | C2-21 | |
| BC-45 | C2-22 | With TP-20, TP-21 |

### Tech-consultant lens (TQ)

| ID | Disposition | Note |
|---|---|---|
| TQ-01 | Q4 | |
| TQ-02 | Q3 | |
| TQ-03 | Q2 + W16 | Traceability matrix offered in W16 |
| TQ-04 | Q4 (diagram) + D1, D4, D5, D6, D7, D12 | The truncated-note list drops r23 (resolved, C-42) |
| TQ-05 | Q16 | |
| TQ-06 | Q9 | |
| TQ-07 | Q10 | |
| TQ-08 | C2-02 | |
| TQ-09 | C2-11 | |
| TQ-10 | W3 + C2-01 | |
| TQ-11 | Q12 | The FLM is described as ambiguous between per material and per component (K-10) |
| TQ-12 | Q13 (principle) + W1 (details) | |
| TQ-13 | Q13 + W1 (six annexes) | A7 for minerals marked unresolved (K-12) |
| TQ-14 | Q13 (example) + W1 | |
| TQ-15 | C2-06 | "during" attributed to ReqDoc §5.2, not BRM (C-18) |
| TQ-16 | W1 | |
| TQ-17 | Q13 (RMM sets markets) + C2-07 (market added after closure) | Owner of SF-11 is open (K-37) |
| TQ-18 | Q14 + W1 | |
| TQ-19 | Q12 | |
| TQ-20 | C2-18 | |
| TQ-21 | Q15 | |
| TQ-22 | W5 | Highlight described as light orange, not the legend's yellow (C-40) |
| TQ-23 | W6 | |
| TQ-24 | Q11 | |
| TQ-25 | C2-03 | RMES-016 cited at p.14; "one RMES per version" sourced to BRM REQ-PROC-021 (BR-05) |
| TQ-26 | Q11 (core) + C2-04 (details) | |
| TQ-27 | C2-03 | |
| TQ-28 | Q10 | |
| TQ-29 | C2-05 + W2 | |
| TQ-30 | Q6 | |
| TQ-31 | C2-07 | |
| TQ-32 | C2-05 | |
| TQ-33 | W7 | |
| TQ-34 | C2-15 | |
| TQ-35 | C2-04 | |
| TQ-36 | C2-08 | |
| TQ-37 | W4 | |
| TQ-38 | C2-10 | |
| TQ-39 | C2-09 | |
| TQ-40 | C2-13 | |
| TQ-41 | C2-17 | |
| TQ-42 | Q1 | |
| TQ-43 | C2-16 | |
| TQ-44 | Q8 + W9 | "Brazil" removed as a target market (BR-18) |

### Tech / platform lens (TP)

| ID | Disposition | Note |
|---|---|---|
| TP-01 | Q2 | |
| TP-02 | Q3 | |
| TP-03 | Q19 | |
| TP-04 | Q19 + D11 | |
| TP-05 | Q17 | Merged with TP-33 |
| TP-06 | Q16 | |
| TP-07 | Q18 | |
| TP-08 | W10 | |
| TP-09 | Q18 | MFA cited to VQ r16 guidance (r19 does not mention MFA) |
| TP-10 | Q15 | |
| TP-11 | C2-12 | |
| TP-12 | Q18 (shared mailboxes) + C2-11 (who may confirm) | |
| TP-13 | Q14 | |
| TP-14 | C2-08 | |
| TP-15 | C2-08 | |
| TP-16 | C2-04 | |
| TP-17 | W8 | |
| TP-18 | W8 | |
| TP-19 | C2-03 | |
| TP-20 | C2-22 | |
| TP-21 | C2-22 | |
| TP-22 | W7 | |
| TP-23 | W13 | |
| TP-24 | Q18 | |
| TP-25 | C2-15 | |
| TP-26 | Q6 | |
| TP-27 | C2-19 | |
| TP-28 | C2-19 | |
| TP-29 | C2-11 | |
| TP-30 | C2-17 | |
| TP-31 | Q8 + W9 | |
| TP-32 | W9 | |
| TP-33 | Q17 | |
| TP-34 | C2-19 | |
| TP-35 | C2-09 | |
| TP-36 | C2-09 | |
| TP-37 | C2-18 + D14 | |
| TP-38 | W11 | |
| TP-39 | W11 + D15 | |
| TP-40 | W11 | |
| TP-41 | Q8 | Portuguese and Brazil dropped from the wording (BR-18) |
| TP-42 | C2-16 (bounce) + W10 (sender domain) | |
| TP-43 | W15 | |
| TP-44 | W14 | |

---

## Appendix B. Corrections applied from the verification verdicts

| Verdict | What was wrong in a candidate or source claim | How this plan words it |
|---|---|---|
| C-01 (partially correct) | "No supplier step after PS-05" in the PDF is false: PS-08 involves the supplier | The PDF has no supplier **release or confirmation** step after PS-05 (Q9) |
| K-35, BR-02 (partially correct / nuance) | "The matrix has no rejection at all" | No **department or case** rejection. "Rejection" remains an audit event in REQ-CTL-009, and answers can be rejected inside the query loop (Q9, Q10) |
| C-04 (partially correct) | "In the PDF, changes arrive only as a resubmission" | Both documents allow in-process changes (ReqDoc §5.2, REQ-RMES-012; BRM REQ-PROC-007). What is open is the mechanism and the cut-off (Q11) |
| C-16 (partially correct) | "Fully supports" attributed to all integration answers | Only CIA #1, #12 and #15 say "fully supports" / "seamlessly integrates" (Q16, section 0) |
| C-18 (partially correct) | "during" quoted from BRM REQ-CFG-007 | "during the IRMA process" is ReqDoc §5.2. BRM's anytime wording is REQ-ADR-002, "throughout the entire process" (C2-06) |
| C-25 (partially correct) | "FLM r4-r5: contact e-mail set by RMM" | FLM r4 says "pre-filled automatically from supplier master data". RMM naming the contact comes from BRM REQ-PROC-001 (C2-12) |
| C-42 (partially correct) | r23 counted as a truncated open note | r23's truncation is in the old-value column and resolved. D12 lists r35, r123, r126, r132 and r162 only |
| G-10 (partially correct) | "Sustainability records its review outside the tool" | Only "documented in a separate questionnaire". Inside or outside is asked, not stated (Q6) |
| K-10 (partially correct) | FLM stated as "origin per raw material" | The FLM is ambiguous between per material and per component (Q12) |
| K-12 (partially correct) | A7 for minerals "answered" | Unresolved: the FLM carried it over unchanged and the old catalogue lists A10-A12 only (W1) |
| K-17 (partially correct) | K2.3 owner "answered (RMM leads)" | Conflicting: §4.1 RMM lead vs §4.3 Regulatory only (Q5, W2) |
| K-37 (partially correct) | SF-11 owner "answered" | Open: no document addresses who answers target markets (Q13) |
| BR-05 (partially correct) | REQ-RMES-016 cited on p.13 as "one RMES per version" | RMES-016 is p.14 and says "retain every RMES version"; "exactly one RMES data record ... with CIQ version" is BRM REQ-PROC-021 (C2-03) |
| BR-18 (partially correct) | Brazil listed as a target market | Brazil concerns genetic heritage (SF-10, K6.16.1), not markets. Markets are China, USA, Canada, UK, Turkey and others (Q8) |
| K-34 (partially correct) | "All 51 are MVP" | 48 MVP + 3 MVP partial scope (Q2) |
| G-05, G-21, C-44 (partially correct) | Citation-range details | Not relied on in this plan |
| (VQ r19) | TP-09 cites MFA to VQ r19 | MFA is in BDF's guidance for VQ r16 (Q18) |

---

## Appendix C. KB overlap map (where each KB item is moved forward)

| KB ID | Topic | Addressed in | How we move it forward |
|---|---|---|---|
| NEW-01 | CIQ question inventory | Q3, D4 | Concrete test slice; request the Word template |
| NEW-02 | Metadata at PS-02 | W1 | All configuration questions in the first step |
| NEW-03 | Overall approver | Q9, C2-01 | Two end models, switchable; default owner RMM |
| NEW-04 | Effect of a rejected subprocess | Q10 | Options A / B / C with default B |
| NEW-05 | MVP scope | Q3, Q6, C2-09 | Proposed slice and RMES depth |
| NEW-06 | Annex 14 limits | C2-10, W4, D8 | Versioned limit table owned by Safety |
| NEW-07 | Origin table vs triggers | Q13, Q14, W1 | One rule principle plus a seeded table |
| NEW-08, NEW-09 | K5 waiver / K5.3 owner | C2-07, W2 | Waiver accepted by Microbiology; owner list |
| NEW-11 | Customs and Legal | Q6 | Informed, read-only |
| NEW-12 | Own-document suppliers | Q7, Q15 | Share plus an MVP fallback |
| NEW-13 | QM, RMM, Sustainability subprocesses | Q5, Q6, C2-23 | Blocking / informed split; RMM as case owner |
| NEW-14 | Scope change after data entry | Q11, C2-03, W5 | Edit rights, cut-off, removed-data behaviour |
| NEW-15 | Cancellation / reactivation | C2-21 | Who, why, resume point, 365 days |
| NEW-16 | Due dates, reminders, escalation | C2-16 | Concrete defaults |
| OP-02, OP-03 | A4 parts; A2 trigger | Q13, W1 | Rule principle; mineral-oil trigger |
| OP-13 | Integrations / filing | Q16, C2-17, C2-22, W11 | Manual plus external key; scoring weight |
| OP-17 | Reuse of GMP / ISO | C2-18, W6 | Supplier-level register, switchable |
| OP-18 | Shared sections | C2-05, W2 | Lead decides; escalation rule |
| OP-19 | Binding configuration table | Q14, W1, D3 | Owner and date; seeded draft and format |
| SF-01 | Origin single / multi, per component | Q12 | Component table, multi-select per row |
| SF-02 | Additional sites | C2-18 | Case = material × supplier × site |
| SF-03, SF-06, SF-07, SF-08 | Polymer / GMO / mineral oil / palm questions | Q13, W1 | Explicit questions in the first step |
| SF-09, SF-11, SF-12 | EUDR / target markets / micro waiver | Q13, C2-07 | Owner per question |
| BD-01, BD-02, BD-04, BD-06 | Supplier, manufacturer, material number, contacts | Q15, Q16, C2-11, C2-12, C2-18 | Organisation boundary, external key, contact admin |
| R-00 … R-120, R-xx | Config rules | Q13, Q14, W1 | Precedence, exclusions, seeded table |
| Q-006 … Q-012, Q-102, Q-114 | Composition fields, MOAH, A11 declaration | Q12, W4, C2-11 | Component table, units, click vs signed upload |
| D-01, D-08, D-12, D-18, D-19 | Evidence documents | W1, W4, W6, C2-11, C2-19 | Register attributes and templates |
| 'Sections' col L, 'Open Points' cols G-H | In-MVP flag; owner / decision | Q3, Q19, W16 | BDF fills them as the shared decision log |
