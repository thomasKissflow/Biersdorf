# CIQ Non-functional Vendor Screening Questionnaire (with Kissflow's submitted answers)

- **File:** `Vendor_Initial_Screening_Questionnaire_CIQ.xlsx` (title in the sheet: "Vendor Initial Screening Questionnaire – CIQ / Non functional requirements") · **Type/format:** Excel workbook, 1 sheet "Vendor Questionnaire" (A1:E34), with an Excel table `Table_1` over A4:E34; Google Sheets round-trip extension present · **Author/owner, version, date:** creator **"Pevzner, Alexander"** (BDF Technical Product Owner per [ReqDoc p.1]). Created **10 Jun 2026 09:38 UTC**. BDF sensitivity label "Intern-ohne-Richtlinien" applied 10 Jun 2026 09:37 UTC, same M365 tenant ID as the other BDF files. Zip entry timestamps of **29 Jun 2026** probably mark when the answered version was exported or submitted (inferred). No version number. Columns A–D are BDF's; **column E "Vendor response" holds Kissflow's own submitted answers** · **Language:** English
- **What it is & how to use it:** BDF's first-round **non-functional** screening of vendors: company, data and reporting, integration and architecture, security and privacy, implementation and support, commercials. It is "not a full RFP" [VQ r2]. Our answers contain **numbers and commitments** (RPO/RTO, uptime, support SLAs, deletion periods, effort) and at least one **explicit admission** (no native retention policies). Use this note to know what we have already committed to, what we admitted, and which questions we left partly unanswered, before BDF or the consultant raise them.

---

## Structure

- **Row 1:** title. **Row 2:** purpose (merged A2:D2), identical to the functional catalogue: "Please answer the questions in the 'Vendor response' column and add links or evidence where useful … intended for first vendor familiarization and is not a full RFP."
- **Row 4:** header. **A** Area · **B** Sub-area · **C** Question for vendor · **D** Guidance / expected content · **E** Vendor response.
- **Rows 5–34:** **30 questions** in 6 areas. Area numbering runs **1, 3, 4, 5, 6, 7: area "2." is missing.**
- No hidden rows or columns, no data validations, no comments, no formulas (verified).

| Area | Sub-areas (rows) | # Qs |
|---|---|---|
| 1. Vendor profile & credibility | Company profile (r5), Relevant references (r6), Relevant client scope (r7), Market validation (r8) | 4 |
| *2. (missing)* | probably "functional requirements", i.e. the separate CIA catalogue (inferred; see Cross-references) | – |
| 3. Data, reporting & analytics | Dashboards (r9), Analytics / AI (r10), Export / BI (r11), Audit trail and timestamps (r12), Data ownership (r13) | 5 |
| 4. Integration & architecture | Integration capabilities (r14), Relevant systems (r15), Authentication / SSO (r16), Architecture model (r17), Scalability (r18) | 5 |
| 5. Security, privacy & compliance | Information security (r19), Data protection / GDPR (r20), Confidentiality model (r21), Business continuity (r22), Archiving and retention (r23), Subprocessors (r24) | 6 |
| 6. Implementation, support & operations | Implementation approach (r25), Timeline (r26), Resource model (r27), Change management and training (r28), Support model (r29), Roadmap influence (r30), Proof of concept (r31) | 7 |
| 7. Commercials & contractual basics | Pricing model (r32), Cost transparency (r33), Contract flexibility (r34) | 3 |
| **Total** | | **30** |

Flag legend used below:
- **[C]** = commitment or number we will be held to.
- **[A]** = admission or limitation.
- **[G]** = part of BDF's question or guidance left unanswered.
- **[S]** = claim that needs substantiation.

All flags are inferred assessments of stated answers.

---

## Full content digest

### 1. Vendor profile & credibility
| Row | Sub-area | BDF question / guidance (condensed) | Kissflow's answer (summary) | Flags |
|---|---|---|---|---|
| r5 | Company profile | HQ, business units, ownership, employees, years in business; focus on maturity and delivery stability. | Kissflow (formerly **OrangeScape**), **founded 2003**, flagship product **2012**. **HQ Wilmington, Delaware, USA**; main development centre **Chennai, India**; field operations in **US, Dubai, UK, Philippines**. **Privately held**, founded and led by CEO **Suresh Sambandam**. **~300 employees**. Serves **1000+ customers in 160 countries**. | [C] facts on record. **No EU or German presence named** (relevant for a German client) [A] |
| r6 | Relevant references | 2–3 references (innovation, supplier collaboration, workflow, low-code) with industry, scope, region, user base, and whether a reference call is possible. | Names European FMCG and retail customers **Danone, Lorenz Snacks, REWE Group**. References: **Valantic** (Europe, IT services: email-based IT and finance processes digitised, **direct SAP integration**); **Puma Energy** (global downstream retail: **40+ processes** incl. vendor agreements, AP, CAPEX across **1,900 retail sites**); **Large Energy Enterprise (USA)**: citizen-development framework for **10,000+ users**, **450+ processes**. Reference calls "**upon your formal request**". | [C] reference calls offered. [G] user base given only for the US energy reference. None is a cosmetics, chemicals or regulatory-compliance or raw-material qualification case (inferred) |
| r7 | Relevant client scope | Similar scale, confidentiality and supplier/partner interaction? What was comparable and **what was different**. | Global enterprises: FMCG and consumer goods **Danone, Reckitt, Pepsi**. Enterprise clients use dedicated **Supplier Portals / external portals** for vendor onboarding, document sharing and invoice management. Confidentiality via **AES-256, RBAC, SOC 2 / ISO 27001**. Process mappings "differ slightly" but the low-code environment "seamlessly adapts". | [G] "what was different" not really answered. [S] supplier-portal use cases (onboarding, invoices) are not technical questionnaire or review loops |
| r8 | Market validation | Analyst reports, partner programmes, marketplaces, awards; names, years, links. | **Forrester Wave™ Low-Code Platforms for Citizen Developers, Q1 2024: "Strong Performer"**; **IDC IQ23** (no-code application development); **G2 2024 Market Leader** (link to the G2 reviews page); **Gartner Peer Insights 4.5/5, "Customers' Choice"** (the link given is `…/reviews/vendor/write/kissflow`, a *write-a-review* URL); **Google Cloud** technology alliance; SI partners **Accenture, KPMG, TCS, Wipro**. | [S] recognitions date from **2023–2024**. The Gartner link is the wrong type of page (inferred) |

### 3. Data, reporting & analytics
| Row | Sub-area | BDF question / guidance (condensed) | Kissflow's answer (summary) | Flags |
|---|---|---|---|---|
| r9 | Dashboards | Standard dashboards and reports for platform usage, supplier activity, **briefings**, questionnaires, project status; list out-of-the-box reports. | Out-of-the-box reporting and analytics module; **metrics reports created automatically per workflow (step-based and user-based)**; new reports via **no-code** (KPI, category, SLA based). | [G] no concrete list of standard reports or examples. Relates to BRM REQ-CTL-006 |
| r10 | Analytics / AI | Analytics, clustering, semantic search, NLP, AI evaluation, trend identification; **differentiate standard / roadmap / partner / custom**. | **AI assistance in each module, governed by admins**; analytics, **contextual search**, **Smart OCR**; "we can integrate with **NLP engines**". | [G] standard/roadmap/partner/custom split not given. Clustering, semantic search and trend detection not addressed. Relevant to BRM REQ-PROC-024 (AI document review, MVP partial scope) [S] |
| r11 | Export / BI | Export or BI integration (e.g. **Power BI**): formats, APIs, refresh, data-model access. | **Snowflake add-on** pushes all data to Power BI; otherwise **flat-file exchange via SFTP**, **real-time REST APIs**. | [A] Power BI path needs the **Snowflake add-on** (possible extra cost, inferred). [G] refresh options and data-model access not described |
| r12 | Audit trail and timestamps | How are submissions, documents, messages and changes timestamped and audit-trailed? (For documentation, **prior-art evidence**, traceability.) | Every activity at platform and workflow level is maintained **by default**; logs are "**unalterable even by platform admins**"; audit trails at **request and process level**, time-stamped and user-stamped. | [C] **immutability even against admins**. Will be tested against BRM REQ-CTL-009 ("who assessed what, when and on which **source version**") and REQ-PROC-034 (reviewed evidence version) |
| r13 | Data ownership | Who owns the data; retrieval and deletion at contract end; export, deletion, retention, portability. | **Beiersdorf retains full IP ownership and control**. At termination, export of a complete copy in **machine-readable JSON + attachments as ZIP**. Data retained during use; after cancellation **permanently erased from production within 30 days** and **purged from backups within 90 days**. | [C] **JSON + ZIP export; 30-day / 90-day deletion** |

### 4. Integration & architecture
| Row | Sub-area | BDF question / guidance (condensed) | Kissflow's answer (summary) | Flags |
|---|---|---|---|---|
| r14 | Integration capabilities | Standard options: REST, webhooks, SSO, **SCIM**, ETL connectors, middleware, file import/export. | **Ready-made connectors, REST APIs, middleware, webhooks, file-based, SSO, OAuth, external data connectors (MS SQL & MySQL)**; **synchronous, asynchronous, scheduled and event-based** triggers. | [G] **SCIM** (user provisioning) and **ETL** not addressed |
| r15 | Relevant systems | Integrated with **CLM, SAP MDG, SAP Ariba, Microsoft 365/Teams/Outlook, Power BI, ServiceNow, enterprise search**? Standard connector vs custom; examples. | **Standard out-of-the-box connectors: Microsoft 365/Teams, Power BI, SAP S/4HANA.** **SAP Ariba and MDG via REST APIs and middleware**, "similar integrations" deployed for **Valantic**. | [G] CLM, ServiceNow, enterprise search, Outlook not addressed. **Teamcenter and B-Flow are not mentioned** (not asked here, but Must Have in the CIA, #1, #12, #15, #18, #32) [A] |
| r16 | Authentication / SSO | SAML/**OIDC** SSO, **MFA**, **Azure AD / Entra ID**, **user provisioning**, **domain-based access rules**. | Options: **Enterprise SSO (Okta, OneLogin) via SAML**; **Google Apps authentication**; **Microsoft Office 365 authentication**; **Kissflow authentication**. | [G] OIDC, MFA (mentioned in r19 instead), Entra ID by name, provisioning and domain rules not addressed. **Supplier (external user) authentication** model not described. Inconsistent with CIA #20 ("Azure AD, Okta, OneLogin via SAML v2") |
| r17 | Architecture model | SaaS / private cloud / on-prem / hybrid; **hosting region**, tenant model, **data residency**, infrastructure provider. | **Fully cloud SaaS; no on-premise hosting.** **Multi-tenant SaaS hosted primarily on Google Cloud Platform (GCP).** **Private cloud ("private clusters")** available for an **additional managed-service fee**. | [A] **no on-prem**. [A] private cloud costs extra. [G] hosting region and data residency not stated here (see r20). Inconsistent with r19/r20/r24, which say **AWS and GCP** |
| r18 | Scalability | Volumes for users, suppliers, documents, questionnaires, messages; indicative limits, benchmarks, typical customer sizes. | "Multi-layered architecture"; supports "**thousands of concurrent users**" and "**millions of transactions, documents and datapoints**". | [S] no limits, benchmarks or customer sizes given [G] |

### 5. Security, privacy & compliance
| Row | Sub-area | BDF question / guidance (condensed) | Kissflow's answer (summary) | Flags |
|---|---|---|---|---|
| r19 | Information security | Certifications and controls: ISO 27001, SOC 2, pen tests, vulnerability management, encryption, backups, access control. | **ISO/IEC 27001** certified; **SOC 1, SOC 2 and SOC 3** attestations. Continuous vulnerability management; **annual third-party penetration tests**. **AES-256 at rest**, **HTTPS with TLS 1.2+** in transit. **Automated daily backups** stored across **AWS and GCP**; **DR procedures tested annually**. **RBAC, MFA**, unique credentials, least privilege. | [C] certifications, annual pen test, daily backups, annual DR test. BDF may request the reports (inferred) |
| r20 | Data protection / GDPR | DPA, subprocessors, **data residency**, deletion, access logs, privacy by design. | **Full GDPR compliance**; **DPA with the latest Standard Contractual Clauses**. Hosted on **AWS and GCP**, "**offering European data centers upon request for Enterprise customers**"; transparent subprocessor list. Deletion from production **within 30 days** of termination. AES-256, RBAC, application and infrastructure audit logs. | [C] DPA + SCCs. [A] **EU data residency is "upon request" and only "for Enterprise customers"**, not the default. Supplier contact data (names, e-mails, recorded with every confirmation per BRM REQ-PROC-014/-015/-042) is personal data (inferred) |
| r21 | Confidentiality model | How unauthorised access to confidential briefings, documents, supplier submissions and communication is prevented: permission model, **role inheritance, document-level controls, admin safeguards**. | Login via **SSO or username/password**; **RBAC and data isolation** so users only see what their permissions allow; data isolated in databases, **AES-256-CBC** at rest, **TLS 1.2+** in transit. | [G] role inheritance, **document-level controls** and **admin safeguards** not addressed. This is central to the MVP (supplier/internal separation, RMES hidden, section-level rights: BRM REQ-CFG-004, REQ-CTL-002, REQ-PROC-020, -021, -040) |
| r22 | Business continuity | Standard BC/DR, **RTO, RPO**; are they contractually available? | BC/DR framework; commitments are "**contractually available** and formalized within our standard **Service Level Agreements and Information Security exhibits**". **RPO: 24 hours** (daily backups). **RTO: 48 hours** "to restore essential IT and facility services, depending on the disaster's nature". | [C] **RPO 24 h / RTO 48 h, contractual**. [A] up to one day of supplier and reviewer input could be lost in a disaster; up to two days of outage (inferred reading) |
| r23 | Archiving and retention | **Audit-proof archiving** and **configurable retention rules**? Legal hold, export, deletion. | Comprehensive audit trails and complete process histories, **"However, it does not natively manage configurable records retention policies or regulatory retention schedules."** Organisations needing retention management, **legal holds** or compliant archival "**can integrate Kissflow with enterprise content management or records management systems**". | **[A] key admission: no native retention policies, retention schedules or legal hold.** A plausible mitigation is BDF's own DMS **B-Flow** (ReqDoc PS-13 files the final package there), but B-Flow integration is out of scope for 2026 (inferred link) |
| r24 | Subprocessors | Key subprocessors (hosting, support, analytics, **email**, **file storage**) and how they are managed. | **AWS and GCP** (infrastructure and storage), **Snowflake** (analytics), **Intercom** (customer support). Subprocessors sign DPAs with substantially similar terms; must implement security measures, notify incidents, process and delete only on instruction, and obtain authorisation before adding subprocessors or changing processing locations. | [G] **e-mail delivery subprocessor** not named (CIQ relies heavily on e-mail notifications to external suppliers, inferred) |

### 6. Implementation, support & operations
| Row | Sub-area | BDF question / guidance (condensed) | Kissflow's answer (summary) | Flags |
|---|---|---|---|---|
| r25 | Implementation approach | Typical approach for a **first MVP** and later rollout: phases, workshops, configuration, testing, training, go-live, hypercare. | Structured, expert-led approach. Phases: **Requirements & Design** (design-validation workshops, gaps, future state) → **Configuration** (platform configuration, customisations, integrations per signed-off design) → **Testing & Training** (**SIT and UAT**, role-based training) → **Go-Live & Hypercare** (structured cutover, **3-month hypercare**). | [C] **3-month hypercare** |
| r26 | Timeline | **Realistic timeline for an MVP** covering questionnaire setup, status tracking, basic reporting; assumptions, dependencies, critical path. | "Depends on the MVP scope, success metrics and integrations." Kissflow "can automate in **1/5th of the time** that other tools take"; "**activities of months can be done within a few weeks**". "We would discuss the details and suggest MVP timeline." | [A] **no timeline, assumptions or critical path given** [G]. [S] the "1/5th of the time" claim is now testable in the MVP bake-off |
| r27 | Resource model | Roles and effort needed from the vendor and from BDF (vendor team, customer SMEs, IT/security, procurement/legal, estimated effort). | **Kissflow:** dedicated team of **Project Manager, Solution Architect, Business Analyst**. **BDF:** business SMEs ("such as end-users and **finance teams**"), IT/security for integrations, procurement/legal for requirement validation. "Typically Beiersdorf's business SMEs would be required to spend a **20-25% weekly time allocation** for the **4-week configuration phase**." | [C] **4-week configuration phase; SMEs 20–25 % of their week**. "Finance teams" looks like a template carry-over for a CIQ project (inferred) |
| r28 | Change management and training | Training, documentation, adoption support for admins and business users: train-the-trainer, guides, videos, sandbox, support channels. | Tailored role-based instruction incl. **Train-the-Trainer**; self-paced **Kissflow Academy**, user guides, video tutorials; **fully isolated sandbox environment and process simulator**; **24/5** in-app chat, e-mail, phone, community forum. | [C] TTT, sandbox. Relates to CIA #34, where BDF asked the **vendor** to provide supplier guides and videos. The sandbox is relevant to BRM REQ-CFG-001 ("in the test environment … publishes") |
| r29 | Support model | Support model and SLAs after go-live: hours, **languages**, channels, escalation, response and resolution times, customer success. | **24/5** via in-app chat, e-mail, phone, community. **Median chat response 5–30 minutes**. **Critical defects: 4-hour initial response, 4-hour workaround, permanent resolution within 48 hours.** Support **included** in the subscription. For global deployments, **regional partners** give on-ground support where language is a challenge. | [C] **critical-defect SLA 4 h / 4 h / 48 h**; support included. [A] **24/5, not 24/7**. [G] **German-language support** not committed; escalation path not described. (Typo ".or global deployments".) |
| r30 | Roadmap influence | Can customers influence the roadmap? Governance, user groups, **release cadence**, transparency. | Product team keeps a centralised, priority-based list from customer feedback, analyst reports and market analysis; customers add to the **community wishlist** or tell the **Account Manager (SPOC)**; other enhancement requests "can be taken up additionally" and evaluated. | [G] release cadence, user groups and roadmap transparency not addressed. Release cadence matters for BDF's "runs for years without bugs" expectation (inferred) |
| r31 | Proof of concept | Demo environment, sandbox, pilot or PoC? Scope, timeline, effort, cost, what BDF can test. | "We do provide this however we need to discuss the **scope and expected outcome** before presenting our approach." | Now superseded by the MVP bake-off (inferred). [G] cost and effort not stated |

### 7. Commercials & contractual basics
| Row | Sub-area | BDF question / guidance (condensed) | Kissflow's answer (summary) | Flags |
|---|---|---|---|---|
| r32 | Pricing model | SaaS subscription, per user, **per supplier**, per module, usage-based, implementation, integration and support cost. | **Annual SaaS subscriptions.** Primary model: **per-user-per-month, tiered by actual usage ("Regular", "Lite")**. "We do **not charge per module, per supplier, or for API integration usage**"; **unlimited apps, workflows and integrations within fair-use limits**. **Basic support included**; **implementation is an additional cost**. | [C] no per-supplier, per-module or API fees. [A] per-user pricing raises the question of how **external supplier contacts** are licensed (Lite? free portal users?). Unclear and commercially material (inferred) |
| r33 | Cost transparency | **Indicative cost structure** for MVP and full rollout: licence, implementation, integrations, support, training, optional modules. | Licences tiered by usage frequency (Regular, Lite), **no separate module fees**. Implementation and integrations via **Professional Services**: **Fixed Bid** or **Monthly Engagement** (flexible hours with a dedicated **Solution Architect and Developer**). Standard support included. Training scoped as a custom plan in the PS engagement. | [G] **no figures given**. Possible extra items mentioned elsewhere: Snowflake add-on (r11), private cloud fee (r17) |
| r34 | Contract flexibility | Standard terms, termination options, **SLA credits**, **annual price increase rules**. | **12-month term**, **auto-renews unless 60-day written notice** before term end. **"We confidently guarantee a 99% platform uptime."** Billed **in advance**; "price adjustments are subject to prior discussion". | [C] **99 % uptime guarantee**. That allows about 87.6 h of downtime per year, or about 7.2 h per 30-day month (computed). [G] **SLA credits not specified**; no price-increase cap; termination for convenience not addressed |

---

## Consolidated view

### Commitments on record (numbers BDF can quote back)
| Topic | Commitment | Row |
|---|---|---|
| Recovery | **RPO 24 h**, **RTO 48 h**, "contractually available" in standard SLA and InfoSec exhibits | r22 |
| Availability | **99 % uptime** guaranteed | r34 |
| Support | **24/5**; median chat response **5–30 min**; critical defect **4 h response / 4 h workaround / 48 h permanent fix**; support included | r29 |
| Hypercare | **3 months** after go-live | r25 |
| Effort | **4-week configuration phase**; BDF SMEs **20–25 %** weekly; Kissflow PM + SA + BA | r27 |
| Speed | "**1/5th of the time** other tools take"; "months … within a few weeks" | r26 |
| Exit | Full export **JSON + ZIP**; deletion from production **≤ 30 days**, from backups **≤ 90 days** | r13, r20 |
| Audit | Logs **unalterable even by platform admins** | r12 |
| Security | ISO/IEC 27001; SOC 1/2/3; annual third-party pen test; daily backups (AWS + GCP); annual DR test; AES-256 at rest, TLS 1.2+ | r19, r21 |
| Privacy | DPA with SCCs; subprocessor list; EU data centres on request (Enterprise) | r20, r24 |
| Commercial | Per user per month (Regular/Lite); **no per-supplier, per-module or API fees**; unlimited apps and workflows within fair use; implementation extra (fixed bid or monthly); 12-month auto-renew, 60-day notice; billed in advance | r32–r34 |
| References | Reference calls on formal request | r6 |
| Enablement | Train-the-trainer, Kissflow Academy, isolated sandbox + process simulator | r28 |

### Admissions and limitations
1. **No native configurable retention policies, retention schedules or legal hold**; needs an ECM or records-management integration [r23]. This weighs heavily against BDF's expectation of an app that "runs for years" with audit-relevant supplier evidence (inferred).
2. **No on-premise**; private cloud only for an extra fee [r17].
3. **EU data residency is not the default**: "upon request for Enterprise customers" [r20].
4. **RPO 24 h / RTO 48 h** are modest for a system of record (inferred) [r22].
5. **24/5 support** with no committed German-language support [r29].
6. Power BI integration goes through a **Snowflake add-on** [r11].
7. **No MVP timeline, figures or benchmarks** were provided [r18, r26, r33].

### Questions only partly answered (BDF may come back to these)
- **r6:** user base per reference.
- **r7:** what was different from BDF's context.
- **r9:** list of out-of-the-box reports.
- **r10:** split between standard, roadmap, partner and custom AI.
- **r11:** refresh options and data-model access.
- **r14:** SCIM and ETL.
- **r15:** CLM, ServiceNow, enterprise search, Outlook.
- **r16:** OIDC, MFA, Entra ID, provisioning, domain rules, external-user authentication.
- **r17:** region and data residency.
- **r18:** limits and benchmarks.
- **r21:** role inheritance, document-level controls, admin safeguards.
- **r24:** e-mail and file-storage subprocessors.
- **r26:** timeline, assumptions, critical path.
- **r29:** languages and escalation.
- **r30:** release cadence and user groups.
- **r31:** PoC cost and effort.
- **r33:** any figures.
- **r34:** SLA credits, price-increase rule, termination options.

---

## Notable details, gaps & internal inconsistencies

1. **Area "2." is missing** from the numbering (1, 3, 4, 5, 6, 7). The functional catalogue has the same layout and purpose text and the title "Vendor Initial Screening Questionnaire – CIQ / **Functional** requirements", and was created 17 minutes later on the same day (10 Jun 2026 09:55 vs 09:38 UTC). Area 2 was very likely split out into that file (inferred) [CIA r1, r2].
2. **Template reuse by BDF.** The guidance text mentions "**briefings**" [r9, r21], "**prior-art evidence**" [r12], "**innovation**" [r6] and "**CLM**" [r15]. None of these fit the CIQ process, so the questionnaire was probably adapted from another BDF vendor screening, e.g. an innovation or briefing platform (inferred). Some questions are generic rather than CIQ-specific.
3. **Hosting statements differ.** "hosted **primarily on GCP**" [r17] vs "securely hosted on **AWS and GCP**" [r20] and "AWS and GCP for cloud infrastructure and storage" [r24]. Backups are "across AWS and GCP data centers" [r19].
4. **SSO statements differ** between the VQ (Okta, OneLogin via SAML; Google; Microsoft O365; Kissflow auth) [r16] and the CIA ("SAML v2 … Azure AD, Okta, or OneLogin") [CIA #20]. MFA appears in r19, not in r16.
5. **Timeline vs effort.** r26 declines to give a timeline but claims "1/5th of the time"; r27 implies a **4-week configuration phase**. BDF may read the 4 weeks as our MVP build estimate (inferred).
6. **Per-user pricing vs "not per supplier"** [r32]: whether supplier contacts count as (Lite) users is not stated. With many suppliers and several contacts each [BRM REQ-CTL-001], this is commercially material (inferred).
7. **Wording and typos in our answers:** "securely serves" with no subject [r5]; "conectors" [r14]; "availibility" [r27]; ".or global deployments" [r29]. The Gartner link is a "write a review" URL [r8].
8. **Generic answers.** Several answers read as standard boilerplate rather than CIQ-specific (e.g. "finance teams" as SMEs [r27]; supplier portals for "invoice management" [r7]) (inferred).
9. **Retention admission vs audit claims.** No native retention management [r23] contrasts with "complete, immutable audit trail" in the CIA [CIA #9, #11] and "unalterable even by platform admins" [r12]. The two are compatible (audit ≠ retention), but BDF may probe how long CIQ data and evidence are kept and whether **frozen CIQ versions** [BRM REQ-PROC-043] and **immutable PDFs** [BRM REQ-PROC-046] stay intact for years.

---

## Cross-references to other documents

- **Functional catalogue (CIA):** probably the missing area 2. Overlaps:
  - SSO: r16 ↔ CIA #20.
  - Integrations: r14/r15 ↔ CIA #1, #12, #15, #18, #32, #33.
  - Dashboards: r9 ↔ CIA #21–#23.
  - Audit: r12 ↔ CIA #9.
  - Guidance content: r28 ↔ CIA #34.
  - See note 03.
- **BRM (MVP acceptance):**
  - Audit trail: r12 ↔ REQ-CTL-009, REQ-PROC-007, -031, -034.
  - AI: r10 ↔ REQ-PROC-024 (MVP partial scope).
  - Structured, analysable data for BI: r11 ↔ REQ-PROC-006.
  - Confidentiality: r21 ↔ REQ-CFG-004, REQ-CTL-002, REQ-PROC-020, -021, -040.
  - Personal data of supplier contacts recorded with confirmations: r20 ↔ REQ-PROC-014, -015, -042.
  - Long-term integrity of frozen data: r23 ↔ REQ-PROC-043, REQ-PROC-046, REQ-CTL-009.
  - Business admin publishing from a test environment: r28 sandbox ↔ REQ-CFG-001.
  - Dashboards: r9 ↔ REQ-CTL-006.
- **ReqDoc:**
  - 2026 project goal "Select and validate a suitable low-code/no-code solution; design and build an MVP": r26/r27/r31 ↔ [ReqDoc p.2 §1.1].
  - Integrations out of scope for 2026, OP-13: r15 ↔ [ReqDoc p.2 §1.1].
  - Final package filed in **B-Flow** at PS-13 (a possible retention and archival answer): r23 ↔ [ReqDoc p.5 §3.3.3].
  - Cancelled process reactivation within an assumed 1 year: r23 ↔ [ReqDoc p.5 §3.3.3].
  - AI output must stay reviewable and must not replace the accountable reviewer: r10 ↔ [ReqDoc p.5 §3.2.3].
  - Immutable versioned RMES record and notification logging: r12 ↔ REQ-RMES-016/-019 [ReqDoc p.14].
- **KB (origin uncertain):**
  - Integrations / B-Flow filing in the MVP: OP-13 ↔ r15/r23.
  - Due dates, reminders, escalation not defined: NEW-16 ↔ CIA #16 / VQ r9.
- **IDs and terms referenced but not defined:** "Regular" and "Lite" user tiers [r32, r33]; "SLA … and Information Security exhibits" (not shared) [r22]; the subprocessor list (not shared) [r20]; the DPA (not shared) [r20].
