# RAW DUMP: CIQ Business process requirements MVP_ v2.0.pdf

Source: `Refrences_Shared_By_Client/CIQ Business process requirements MVP_ v2.0.pdf` — pypdf text extraction per page (layout may be lossy; diagrams need visual check).

Metadata: {'/Author': 'Pevzner, Alexander ext. /BSS HAM', '/CreationDate': "D:20260916094935+00'00'", '/ModDate': "D:20260916094935+00'00'", '/Producer': 'Microsoft: Print To PDF', '/Title': 'Microsoft Word - CIQ_Requirements_Document_v1_Two_Phase_Process'}

## Page 1  (embedded images: 0)

BDF CIQ Digitalization - Requirements Document v1.4 
Page 1 
CIQ Digitalization 
Requirements document - business flow, configuration logic and CIQ structure 
Field Entry 
Document type Requirements specification (business level) 
Version 2 
Status Business process (MVP phase) 
Date 16 September 2026 
Owner Alexander Pevzner (Technical Product Owner) 
1 Purpose and context 
Beiersdorf uses the Cosmetic Ingredient Questionnaire (CIQ) to collect all quality, safety and regulatory 
information on purchased raw materials. In its 2026 edition the questionnaire consists of eight main chapters 
and 14 annexes and is exchanged as a document between Beiersdorf and the supplier. 
The process is largely manual today. Raw Material Management (RMM) acts as the intermediary and manages 
the flow of information between the Beiersdorf departments and the supplier. Every question, every reminder 
and every document passes through this single point. 
The aim of the CIQ project is to digitalise this process on a configurable low-code/no-code platform. In future 
the CIQ will no longer be a static questionnaire that always contains the full set of possible questions, 
regardless of the specific raw material: its scope will be derived dynamically from the information the supplier 
provides, so that suppliers only need to complete the sections that are actually relevant to their raw material. 
The end-to-end CIQ process is governed by a clear two-part structure. Part 1 collects the required data and 
supporting documents from the supplier through the CIQ questionnaire. The supplier enters the requested 
information, uploads the relevant evidence and, once this collection is complete, gives Supplier Approval. 
Supplier Approval confirms that the supplier has submitted the data and documents for Beiersdorf review; it 
does not constitute a Beiersdorf technical or business approval of the raw material. 
Part 2 begins only after Supplier Approval. The responsible Beiersdorf departments then perform the technical 
review of the submitted information. Questions, clarifications and requests for additional documents are 
exchanged directly between the responsible department and the supplier. The results of the technical review 
are documented in the internal questionnaire (e.g. RMES). Results may also be documented in other 
Beiersdorf systems; those additional system-specific documentation activities are outside the core process 
described in this document. 
This two-part structure is the organising principle for the process overview, detailed process description, task 
and status model, review requirements and approval gates in this document. 
This document describes the process and the business requirements along the two-part process flow and 
serves as the entry point to the project. Part 1 covers supplier data and document collection up to Supplier 
Approval. Part 2 covers the subsequent technical review by Beiersdorf departments, the clarification loops and 
the documentation of review results. Detailed requirements are maintained separately in the CIQ requirements 
matrix.

## Page 2  (embedded images: 0)

BDF CIQ Digitalization - Requirements Document v1.4 
Page 2 
1.1 Scope 
Aspect Description 
In scope (project goal 2026) Select and validate a suitable low-code/no-code solution; design and build an MVP for the 
CIQ process 
In scope (business) End-to-end process from case creation to the approved final document, including 
collaboration with the supplier (IRMA process) 
In scope (business) Automatic configuration of the questionnaire through a business-maintained configuration 
table 
In scope (business) Requests for additional documents during the process, based on a business decision 
In scope (business) Task and status transparency for all parties through a dashboard 
Out of scope (2026) Integration with Teamcenter, B-Flow, SAP MDG and other relevant systems - the scope per 
target system is still open (OP-13) 
Delimitation This document specifies requirements, not the solution architecture of a particular vendor 
2 Process overview aligned with the target process flow 
The target process is structured in two consecutive and clearly separated parts. Supplier Approval is the formal 
transition gate from Part 1 to Part 2: 
1. Part 1 — Collect supplier data and documents: RMM starts the CIQ case; the supplier enters the 
required metadata; the system configures the case-specific CIQ scope; the supplier completes the 
configured CIQ, uploads the required documents and gives Supplier Approval to confirm submission for 
Beiersdorf review. 
2. Part 2 — Perform technical review and document results: after Supplier Approval, the applicable 
Beiersdorf review subprocesses are activated dynamically and executed in parallel. The responsible 
departments review the submitted information, conduct question-and-answer and additional-document 
loops with the supplier where required, and document their review results. RMES is the internal review 
record where RMES applies; documentation in other Beiersdorf systems is outside the core process 
described here. 
The process diagram is authoritative for the structure and sequence in this document. Existing verified 
business statements remain applicable. Items not decided in the process discussion are identified explicitly as 
open decisions and are not resolved by assumption. 
2.1 Process-step overview 
ID Process step Responsible role Trigger Result 
PS-01 Start CIQ RMM Business decision to initiate 
an IRMA CIQ case CIQ case started 
PS-02 Enter metadata Supplier CIQ case made available to 
the supplier 
Required metadata and 
structural data entered 
PS-03 Configure CIQ System, using the 
configuration rules Required metadata submitted 
Case-specific CIQ scope 
and required documents 
determined 
PS-04 Complete CIQ and 
upload documents Supplier Configured CIQ released to 
the supplier 
Required structured answers 
and evidence entered

## Page 3  (embedded images: 0)

BDF CIQ Digitalization - Requirements Document v1.4 
Page 3 
ID Process step Responsible role Trigger Result 
PS-05 
Supplier Approval and 
submission to 
Beiersdorf 
Supplier 
Configured CIQ data and 
required supporting 
documents are complete and 
formal mandatory checks are 
passed 
Supplier confirms 
submission; Part 1 
completed; submitted 
version fixed for internal 
review; Part 2 triggered 
PS-06 Activate applicable 
review subprocesses System Supplier Approval recorded 
Applicable Beiersdorf 
technical-review 
subprocesses activated 
dynamically; Part 2 started 
PS-07 Perform technical 
review in subprocess 
Responsible Beiersdorf 
department Review task assigned 
Technical findings and 
preliminary review result 
documented 
PS-08 
Clarification and 
additional-document 
loop, if required 
Responsible Beiersdorf 
department and supplier 
Reviewer identifies an open 
question, inconsistency or 
missing document 
Supplier response or 
additional document 
reviewed; loop repeated until 
no further query is required 
PS-09 Document technical-
review results 
Responsible Beiersdorf 
department No further query is required 
Review result documented 
in RMES where applicable; 
other system-specific 
documentation is outside the 
core process 
PS-10 
Decide whether 
subprocess review is 
complete 
Responsible Beiersdorf 
department Review results documented Subprocess ready for 
approval or rejection 
PS-11 Approve or reject 
subprocess 
Authorised Beiersdorf 
role Subprocess review complete Final subprocess result 
recorded 
PS-12 Overall CIQ approval Responsible role to be 
decided 
Required subprocess results 
available 
Overall approval or rejection 
recorded 
PS-13 
Generate final 
documents, file records 
and provide status 
feedback 
System / responsible 
role according to the 
final operating model 
Overall CIQ decision 
recorded 
Final package generated 
and filed; status reported; 
case closed 
3 Detailed process description 
Tasks, status transparency, notifications and the dashboard apply throughout the process. Every action that a 
person has to perform is represented as an assigned task and is visible to the authorised role. Internal review 
comments and assessments are not visible to supplier users. 
3.1 Part 1 — Collect supplier data and documents 
3.1.1 Start CIQ (PS-01) 
The process starts with a business decision by RMM to initiate an IRMA CIQ case. The trigger is currently 
outside the target system.  
3.1.2 Enter metadata (PS-02) 
The supplier first enters the required metadata and structural data for the raw material, including the 
configuration answers needed to determine the applicable CIQ scope. This phase is deliberately limited to the 
information needed for configuration. Missing mandatory entries block submission of the metadata.

## Page 4  (embedded images: 0)

BDF CIQ Digitalization - Requirements Document v1.4 
Page 4 
3.1.3 Configure CIQ (PS-03) 
The system evaluates the submitted metadata against the controlled configuration rules and derives which CIQ 
chapters, annexes and evidence documents are mandatory, optional or not applicable for the concrete case. 
The configuration logic and its open business decisions are described in chapter 5. The supplier is not 
expected to complete sections that are not applicable to the case. 
3.1.4 Complete CIQ and upload documents (PS-04) 
The supplier completes the released sections and uploads evidence at the relevant question or section. 
Answers are captured as structured data, not solely as attachments. Mandatory fields and mandatory evidence 
are validated. Where the controlled rule requires a justification for a not-applicable response, submission is 
blocked until that justification is provided.  
There are a number of suppliers who upload their own documents instead of completing the CIQ questionnaire. 
A separate process will be specified and implemented for these suppliers. 
3.1.5 Submit CIQ to Beiersdorf (PS-05) 
Supplier Approval is the supplier’s formal confirmation that the configured CIQ data and required supporting 
documents have been submitted to Beiersdorf. It completes Part 1 and triggers Part 2. Supplier Approval 
confirms submission and responsibility for the provided information; it is not a Beiersdorf technical review result 
or approval of the raw material. On Supplier Approval, the submitted supplier data and document versions are 
fixed for that review cycle. A later resubmission creates a new review version and does not silently overwrite 
the version previously assessed. 
3.2 Part 2 — Perform technical review and document results 
3.2.1 Activate applicable review subprocesses (PS-06) 
Following Supplier Approval, Part 2 begins and the system activates the Beiersdorf review subprocesses 
applicable to the case. Activation is dynamic and is based on the case scope and controlled assignment rules. 
Activated subprocesses may run in parallel. The synchronisation point waits only for subprocesses activated for 
the concrete case. 
3.2.2 Common pattern for every activated review subprocess (PS-07 to PS-11) 
Each responsible department reviews the data and evidence assigned to its subprocess and documents the 
review result. If the reviewer identifies a missing, inconsistent or implausible item, the reviewer raises a 
contextual query or requests an additional document. The supplier answers the query or uploads the requested 
document. The responsible department then reviews that response or document again. This loop repeats until 
the department determines that no further query is required. 
Queries and document requests remain linked to the affected question, document, criterion or finding. The 
supplier receives each request as a task. The requesting department retains responsibility while waiting for the 
supplier and decides whether the response is accepted or rejected. Open blocking requests prevent completion 
of the affected subprocess. 
When no further query is required, the department documents the results, confirms whether the review is 
complete and records approval or rejection through an authorised Beiersdorf role. Person, timestamp, result 
and required rationale are audit-trailed. 
 
3.2.3 RMES / Regulatory & Safety subprocess 
Safety and Regulatory perform their respective technical reviews as part of the Beiersdorf review phase. Their 
assessments draw partly on structured data captured in the CIQ and also include the review of supporting 
documents provided by the supplier. The Raw Material Evaluation Sheet (RMES) is the internal document in

## Page 5  (embedded images: 0)

BDF CIQ Digitalization - Requirements Document v1.4 
Page 5 
which Safety and Regulatory record the scope, evidence, findings, conclusions and decisions resulting from 
these reviews. RMES is therefore not a separate review process and not a supplier questionnaire; it is the 
structured internal documentation instrument for the work performed by the two departments and is not visible 
to the supplier. The RMES-related part of the review will also be digitalised. The target is to reuse relevant CIQ 
data directly in RMES and to automate manual data transfers from CIQ to RMES as far as technically and 
functionally feasible, while preserving source traceability, versioning and reviewer accountability. In addition, 
AI-supported document review is a desired capability to assist Safety and Regulatory in analysing supplier-
provided evidence and identifying relevant information, inconsistencies or missing content. Any AI-generated 
output must remain reviewable and must not replace the accountable assessment and decision by the 
authorised Beiersdorf reviewer. Technical review results may additionally be documented in other Beiersdorf 
systems, but those system-specific documentation activities are outside the core CIQ process described in this 
document.  
3.2.4 QM subprocess 
QM reviews the sections assigned to QM under the approved responsibility model. The detailed subprocess 
boundary, entry criteria, decision model and ownership are open and require business confirmation. 
3.2.5 RMM subprocess 
In the current state, RMM documents the results of the technical review in Teamcenter. The target-state 
process and system split between the digital CIQ solution and Teamcenter is still open and must be developed 
jointly. This section therefore does not prescribe a target solution. 
3.2.6 Sustainability subprocess 
Sustainability reviews the sections assigned to Sustainability under the approved responsibility model. The 
findings from the review are documented in a separate questionnaire. Further details and requirements will 
follow here. 
3.3 Synchronisation, overall decision and closure 
3.3.2 Overall CIQ approval (PS-12) 
The final approval gate must use the final subprocess results and all blocking open items. The effect of a 
rejected subprocess on the overall CIQ case also remains open and must be decided before the approval 
workflow is configured. Sustainability department documents its review steps and results in a separate 
questionnaire. 
3.3.3 Final document, filing, status feedback and end (PS-13) 
After the overall CIQ decision, the system generates the defined final document package, versions it in an 
unchangeable form, files it against the case in the designated Beiersdorf repository (B-Flow) and provides the 
required status feedback to the preceding system. The exact target systems and integration scope remain 
subject to the open integration decisions. The case is then closed in the dashboards with its final status. 
A process can be cancelled if the associated raw material is no longer relevant for the project. A cancelled 
process can be reactivated within a defined period (assumption: 1 year, to be confirmed). 
3.4 Overall process requirements 
Requirements across all phases and subprocesses: 
• role-based access and separation of supplier and internal content; 
• named task ownership, due dates, reminders and escalation; 
• section-level and overall status transparency;

## Page 6  (embedded images: 0)

BDF CIQ Digitalization - Requirements Document v1.4 
Page 6 
• versioning of submitted answers and documents; 
• traceability from review result to source answer or document version; 
• audit trail for submission, review, query, response, approval, rejection and reopening; 
4 CIQ structure and assignment to the business departments 
The overview below records all chapters and annexes of the CIQ 2026 with their business meaning and the 
responsible department. It is the basis for the review and approval logic and for the assignment of tasks and 
dashboard items. 
4.1 Main chapters (draft, review) 
ID Chapter Business meaning Department Particularity 
K1 Mandatory documents 
Checklist of all required 
evidence documents 
(SDS, CoA, 
specification, 
statements) 
QM (lead), Regulatory, 
RMM, Safety 
Frames all other chapters: 
the scope of this list follows 
from the configuration table 
and is therefore specific to 
each case. 
K2.1 Components and 
additives 
Full composition per 
component: INCI, CAS, 
EC, function, additive, 
origin, concentration 
Regulatory 
Data basis for almost all 
subsequent reviews. Table 
with any number of 
components. 
K2.2 Byproducts and 
contaminations 
Byproducts and 
contaminations, 
evidence from at least 
two batches 
Safety (lead), QM 
Limits checked against the 
Beiersdorf values in Annex 
14; deviations require a 
justification. 
K2.3 Source or type of 
starting materials 
Origin type per 
component 
RMM (lead), Safety, 
Sustainability, Regulatory 
Central configuration 
question SF-01. Drives 
most of the mandatory 
annexes. 
K3 Storage conditions and 
handling 
Storage conditions, 
shelf life, temperature 
effects 
QM 
Operationally relevant for 
goods receipt, warehousing 
and handling in production 
 
K4.1 Toxicity data 
Toxicological endpoints 
with study protocol and 
annex status 
Safety Assessment authority sits 
exclusively with Safety. 
K4.2 Environmental Biodegradability, Safety, Regulatory 
Environmental  
K4.3 Synthetic polymer 
microparticles 
REACH polymer 
definition and SPM 
restriction scope 
Safety (lead), Regulatory 
Regulatory area subject to 
change; Annex 6 goes into 
more detail. 
K5.1 Microbiological test Microbiological test of 
the raw material Microbiology May be waived, but a 
justification is required. 
K5.2 Total microbial count 
Total aerobic count, 
yeast and moulds, 
specific microorganisms 
Microbiology, Safety (to be 
informed) 
Mandatory in the CIQ; the 
challenge test sits between 
5.2 and 5.3 without its own 
chapter number.

## Page 7  (embedded images: 0)

BDF CIQ Digitalization - Requirements Document v1.4 
Page 7 
ID Chapter Business meaning Department Particularity 
K5.3 Antimicrobial treatment 
Type and maximum 
dose of the antimicrobial 
treatment 
Safety Irradiation, heat and 
ethylene oxide treatment. 
K6.1 EU REACH 
Registration status, 
Annex XIV and XVII, 
SVHC 
Regulatory Detailed in Annex 10. 
K6.2 UK REACH 
Registration status UK 
including only 
representative 
Regulatory Detailed in Annex 11; also 
relevant for indirect imports. 
K6.3 Turkey REACH 
(KKDIK) 
Registration status 
Turkey Regulatory Detailed in Annex 12. 
K6.4 Chemical inventory 
listings 
Listing in national 
chemical inventories Regulatory Detailed in Annex 13. 
K6.5 Regulation 1223/2009 
Annexes III-VI 
Cosmetics regulation 
annexes Regulatory, Safety Core provision for cosmetic 
usability. 
K6.6 Ingredients Art. 19(g) / 
Annex III 
Ingredients relevant for 
labelling Regulatory, Safety Basis for later product 
labelling. 
K6.7 Animal testing (Art. 
11(2)(e)) Animal testing status Regulatory 
Evidence required; high 
reputational relevance.and 
legal requirement 
K6.8 Halal status Halal and kosher 
information Regulatory Market-specific. 
K6.9 Nanomaterials 
Nanomaterial status 
including justification 
and evidence 
Safety (lead), Regulatory A negative answer also 
requires a justification. 
K6.10 Listing in pharmacopeia Pharmacopeia 
monograph QM Workshop note: QA. 
K6.11 Listing as food additive Food grade status Safety Workshop note: Safety. 
K6.12 GMP compliance and 
ISO certification 
GMP standards and ISO 
certificates of the 
manufacturer 
QM 
Related to the supplier, not 
to the raw material - reuse 
across cases to be 
examined (OP-17). 
K6.13 China IECIC / NMPA Listing in the China 
inventory, NMPA code Regulatory Workshop note: Regulatory. 
K6.14 California Proposition 
65 
Prop 65 listing including 
contaminations Regulatory and Safety jointly 
Workshop note: Regulatory 
/ Safety - shared 
responsibility. 
K6.15 Canada Hot List Listing on the Canada 
Hot List Regulatory Workshop note: Regulatory. 
K6.16 Biodiversity laws 
Access and benefit 
sharing under national 
biodiversity law 
Regulatory Framing chapter; the case 
distinctions sit in 6.16.1. 
K6.16.1 Brazilian Biodiversity 
Law 
SisGen registration and 
exemptions Regulatory 
Extensive case distinctions 
with several exemptions; 
trigger SF-10.

## Page 8  (embedded images: 0)

BDF CIQ Digitalization - Requirements Document v1.4 
Page 8 
ID Chapter Business meaning Department Particularity 
K6.17 EUDR Scope and Regulatory and Sustainability 
(lead)  
K7 Customs & foreign 
trade 
HS code, country of 
origin, export control, 
CITES 
Customs / Trade Compliance 
The only section owned 
outside Regulatory, Safety, 
QM and Sustainability. 
K8, K8.1 Patent Patents and licence Legal / IP Read only for Legal. 
K8.1 Additional patent 
information 
Supplementary patent 
and licence details Legal / IP Follow-up chapter to 8; 
same owner. 
4.2 Annexes 
ID Annex Business meaning Triggered by Department Particularity 
A1 Vegetable origin Feedstock, origin, Vegetable origin Safety and 
Sustainability d traceability. 
A2 Manufacturing Manufacturing 
process, 
Vegetable origin 
and is not stated 
in the CIQ (OP-
19) 
Regulatory, Safety 
(lead) (OP-03). 
A3 GMO 
Genetically modified 
organisms, safety 
level, separation 
Fermentation or 
GMO (SF-06) QM / Microbiology Workshop notes: QM 
(micro), evidence. 
A4 Hydrocarbons 
MOAH, physico-
chemical data for 
mineral oils and 
waxes 
Mineral-oil-
based (SF-07) Safety 
Workshop notes: 
MVP, show and hide 
separately, 
either/or/both (OP-
02). 
A5 UV filters 
Approval status 
inside and outside 
the EU 
UV filter (SF-04) Regulatory Workshop note: 
dependency? 
A6 Synthetic polymers 
/ biopolymers 
Cross-linkers, 
monomers, 
molecular weight, 
residual monomer 
content 
Polymer (SF-03) Safety, Regulatory  Direct extension of 
chapter 4.3. 
A7 Colorants Colorant-specific 
information Colorant (SF-05) Regulatory Substance-class 
specific. 
A8 Preservatives Preservative-specific 
information 
Preservative 
(SF-05) Regulatory, Safety Substance-class 
specific.  
A9 
Polyaromatic 
hydrocarbons 
(PAH) 
Limits and analysis 
for PAH 
Vegetable or 
petrochemical 
origin (SF-01, 
SF-07) 
Safety 
Contains binding 
Beiersdorf limits and 
a reference method. 
A10 EU REACH 
Substance-related 
REACH registration 
data 
Always Regulatory Per substance, not 
per raw material. 
A11 UK REACH 
Substance-related 
UK REACH data 
including only 
representative 
UK market (SF-
11) Regulatory 
Contains a signed 
declaration by the 
supplier.

## Page 9  (embedded images: 0)

BDF CIQ Digitalization - Requirements Document v1.4 
Page 9 
ID Annex Business meaning Triggered by Department Particularity 
A12 Turkey REACH Substance-related 
KKDIK data 
Turkey market 
(SF-11) Regulatory Same structure as 
Annexes 10 and 11. 
A13 Chemical 
inventories 
Listing status per 
country and 
inventory (Y/N/E) 
Target markets 
(SF-11) Regulatory 
Workshop notes: 
Regulatory, 
dependency? 
A14 Moved into the 
main document - - - Content is covered by 
chapter K2. 
4.3 Summary by department (draft, review) 
Department Sections owned Assessment 
Regulatory K2.1, K2.3, K6.1-K6.8, K6.13, K6.15, K6.16, K6.16.1, A2, A5, A7, A8, 
A10, A11, A12, A13 
Largest review scope. Leads 
on composition, registration 
and market authorisation. 
Safety K2.2, K4.1, K4.2, K4.3, K6.9, K6.11, A4, A6, A9 
Sole assessment authority for 
toxicology, environment and 
limits. 
QM / Microbiology K1, K3, K5.1, K5.2, K5.3, K6.10, K6.12, A3 
Leads on quality, hygiene, 
storage and manufacturer 
certification. 
Sustainability K6.17, A1 
Small in volume but with high 
external impact (EUDR, 
RSPO). 
Customs / Trade 
Compliance K7 Single section; easily 
overlooked today. 
Legal / IP K8, K8.1 Single section, read only 
Shared 
responsibility 
K6.14 (Regulatory and Safety), K6.17 (Regulatory and 
Sustainability), K2.2 (Safety and QM) 
Requires a rule on whether 
both roles approve or one 
takes the lead (OP-18). 
5 Configuration table: automatic configuration of the questionnaire 
5.1 Business principle 
The CIQ is not a form with a fixed structure. Which chapters and annexes a supplier has to complete follows 
from a small number of basic answers given at the start - above all the origin type of the components. A 
vegetable raw material triggers different mandatory annexes than a mineral-oil-based material or a polymer. 
This is precisely the decision the target system should take over, rule-based and traceable. 
Core business rule: the questionnaire is not selected, it is generated from the supplier answers (meta 
data). The configuration table is the rule set behind this generation. 
5.2 How the scope is derived 
• The supplier initially receives the basic data section with the configuration questions only. 
• Once it is submitted, the system evaluates the answers against the configuration table.

## Page 10  (embedded images: 0)

BDF CIQ Digitalization - Requirements Document v1.4 
Page 10 
• From this the system determines the mandatory sections, the optional sections, the sections that are 
not applicable and the required evidence documents. 
• The department sees the derived scope and can extend or reduce it during the IRMA process where 
necessary. 
• Only then is the full questionnaire released to the supplier.  
• If the supplier later changes a configuration answer, the scope is derived again; data already entered is 
handled according to the rules and is not discarded silently. 
5.3 Identified configuration questions (draft) 
The following configuration questions were derived from the CIQ source document. The list is a draft and has to 
be completed and confirmed by the business departments (OP-19). 
ID Configuration 
question Source in the CIQ Effect Sections triggered 
SF-01 
Origin type of the 
components 
(vegetable, animal, 
mineral, petrochemical, 
waste or side stream, 
CCU, polymer, 
chemical recycling) 
Chapter 2.3 Determines the majority of 
the mandatory annexes 
A1, A2, A3, A4, A6, A7, A9, 
A10, A11, A12 and 
BSE/TSE evidence; no 
annexes for waste / side 
stream, CCU and chemical 
recycling 
SF-02 Are there additional 
production sites? Basic data Additional site information Site data, no annex 
SF-03 
Does the raw material 
contain polymer 
components or meet 
the REACH polymer 
definition? 
Chapter 4.3 Activates polymer and SPM 
review K4.3, A6 
SF-04 Is the material a UV 
filter? Chapter 6.5 (Annex VI) Activates the UV filter 
section A5 
SF-05 
Is the material a 
colorant or a 
preservative? 
Chapter 6.5 (Annex IV 
and V) 
Activates substance-class 
annexes A7, A8 
SF-06 
Is fermentation 
involved or are GMOs 
involved? 
Annex 2 Activates the GMO section A3 
SF-07 
Is the material mineral-
oil-based or a 
hydrocarbon? 
Chapter 2.3 Activates MOAH and PAH 
review A4, A9 
SF-08 Is the feedstock palm-
based? Annex 1 Activates mandatory RSPO 
information 
A1 section 5, RSPO 
evidence 
SF-09 
Does the raw material 
fall within the scope of 
the EUDR? 
Chapter 6.17 Activates EUDR traceability K6.17 
SF-10 Is Brazilian genetic 
heritage affected? Chapter 6.16 Activates SisGen information K6.16.1

## Page 11  (embedded images: 0)

BDF CIQ Digitalization - Requirements Document v1.4 
Page 11 
ID Configuration 
question Source in the CIQ Effect Sections triggered 
SF-11 
Target markets of the 
raw material (China, 
USA, Canada, UK, 
Turkey and others) 
Basic data Activates market-specific 
compliance sections 
K6.2, K6.3, K6.13, K6.14, 
K6.15, A11, A12, A13 
SF-12 Is microbiological 
testing required? Chapter 5.1 
Deactivates the 
microbiological test (5.1) and 
the challenge test with a 
justification; the total 
microbial count (5.2) stays 
mandatory 
K5.1, K5.3 
5.4 Structure of the configuration table (draft) 
The configuration table maps every valid combination of answers to the resulting scope. The example below 
illustrates the structure using the origin type. It is a structural illustration, not a complete or business-approved 
rule set. 
Origin 
type 
(SF-01) 
Annex 2 
mandatory RSPO relevant Mandatory 
annexes 
Additional mandatory 
evidence 
Reviewing 
department 
Vegeta
ble Yes No A1, A2, A3, A9, 
A10, A11, A12 
Pesticide and 
mycotoxin analysis, 
sustainability 
certificates 
Sustainability, 
Regulatory 
Vegeta
ble and 
palm-
based 
Yes Yes Additionally A1 
section 5 
RSPO certificate with 
supply chain model, 
RSPO number on the 
CoA 
Sustainability 
Animal No No A10, A11, A12 
BSE/TSE certificate, 
conformity with Annex 
II entry 419 
Regulatory, QM 
Mineral No No A1, A7, A10, 
A11, A12 
Origin and specification 
of the mineral source Regulatory, Safety 
Petroch
emical No No A1, A4, A9, A10, 
A11, A12 
MOAH value, PAH 
analysis against 
Beiersdorf limits 
Safety 
Polyme
r No No A1, A6, A10, 
A11, A12 
Residual monomer 
content, SPM scope 
statement 
Safety, Regulatory 
Waste / 
side 
stream 
No No 
None derived 
from the origin 
type 
To be defined with the 
business departments 
(OP-19) 
To be defined (OP-
19) 
Carbon 
capture 
utilisatio
n 
(CCU) 
No No 
None derived 
from the origin 
type 
To be defined with the 
business departments 
(OP-19) 
To be defined (OP-
19)

## Page 12  (embedded images: 0)

BDF CIQ Digitalization - Requirements Document v1.4 
Page 12 
Origin 
type 
(SF-01) 
Annex 2 
mandatory RSPO relevant Mandatory 
annexes 
Additional mandatory 
evidence 
Reviewing 
department 
Chemic
al 
recyclin
g of 
post-
consum
er 
plastic 
No No 
None derived 
from the origin 
type 
To be defined with the 
business departments 
(OP-19) 
To be defined (OP-
19) 
Structural illustration based on the CIQ source document. The binding configuration table has to be collected 
with the business departments. 
6 Requests for additional documents by the business departments 
6.1 Business principle 
Even when the questionnaire scope has been derived correctly, a department may need additional documents 
or information during the review - for example a further batch analysis, an updated certificate or a 
supplementary justification. Such a request is not a gap in the rule set but a deliberate business decision in an 
individual case. 
Delimitation from the configuration table: the configuration table governs the predictable scope that can be 
derived from the answers. A request covers the unpredictable individual case. The system must keep the two 
clearly distinguishable. 
6.2 Process 
• An authorised department raises a request within the running case and assigns it to the section that 
triggered it. A request may also activate an additional questionnaire section for the supplier to 
complete. 
• Every request must contain a business justification, a responsible person and a due date. 
• The supplier receives the request as a separate task with a clear reference to the place concerned, 
visible in the supplier dashboard. 
• The supplier provides the document or explains why it cannot be provided. 
• The department accepts or rejects the response; the decision is recorded. A short explanation in case 
of rejection is provided by the department.  
• Open requests prevent overall approval and are shown as blocking in the case dashboard. 
7 RMES review requirements (draft)  
This chapter translates the RMES template into business requirements for Part 2 of the digital process. RMES 
documents the internal Safety and Regulatory assessment results based on the supplier data and documents 
collected and confirmed through Supplier Approval in Part 1. It is not a supplier questionnaire. All requirements 
below are Must requirements for an end-to-end Safety and Regulatory review unless the MVP decision 
explicitly records a deferral. Documentation in other Beiersdorf systems is outside the scope of these RMES 
requirements.

## Page 13  (embedded images: 0)

BDF CIQ Digitalization - Requirements Document v1.4 
Page 13 
7.1 Review initiation, data and assignment 
REQ-RMES-001 — Controlled start. The system must create one RMES review for the submitted CIQ version 
only after the formal entry criteria have been met. Acceptance: Given a CIQ with missing mandatory evidence, 
when submission is attempted, then no RMES review is released; given a complete submission, then the 
review is created with the CIQ version and timestamp. 
REQ-RMES-002 — Structured template. The system must represent RMES Parts A, B, C and D as 
configurable structured review criteria, not solely as an attached document. Acceptance: An authorised 
business administrator can add, deactivate, reorder and version a criterion without changing historical 
evaluations. 
REQ-RMES-003 — Role-based assignment. The system must assign Safety criteria and approval to 
authorised Safety reviewers and Regulatory criteria and approval to authorised Regulatory reviewers. 
Acceptance: A Regulatory reviewer cannot issue the Safety approval and a supplier cannot view or edit any 
RMES criterion. 
REQ-RMES-004 — Applicable scope. The system must derive applicable RMES criteria from the raw-material 
characteristics, supplied composition, target markets and configuration rules, while allowing an authorised 
reviewer to override applicability with a mandatory reason. Acceptance: Non-applicable criteria remain visible in 
the internal record with the rule or override reason. 
REQ-RMES-005 — Source traceability. Every assessment must reference the evaluated document or 
structured answer and its version. Acceptance: From a criterion, the reviewer can open the assessed source; 
from the source, the system can identify related criteria and findings. 
7.2 Evaluation, findings and clarifications 
REQ-RMES-006 — Criterion result. For every applicable criterion, the system must capture availability, 
plausibility or listed status as appropriate, reviewer comment, reviewer and timestamp. Acceptance: The 
department approval is blocked while any applicable criterion has no final result. 
REQ-RMES-007 — Mandatory rationale. The system must require a comment for a negative, implausible or 
not-applicable result and for every manual applicability override. Acceptance: Saving or completing such a 
result without a rationale is rejected with a clear validation message. 
REQ-RMES-008 — Quantitative checks. Where the current controlled BDF rule set defines substance or 
impurity limits, the system must capture reported values, units, applicable limit and evaluation result. 
Acceptance: The limit and rule-set version used for the decision remain reproducible after the rule set changes. 
REQ-RMES-009 — Finding management. The system must create findings linked to the criterion, source and 
responsible department and classify them at least as blocking or non-blocking. Acceptance: A blocking finding 
prevents the respective department approval and the overall approval. 
REQ-RMES-010 — Supplier query from finding. An authorised reviewer must be able to create a supplier 
query or additional-document request directly from a finding without duplicating context. Acceptance: The 
request contains the affected criterion, question/document reference, responsible supplier contact, due date 
and complete conversation history. 
REQ-RMES-011 — Response review. Only the department responsible for a finding may accept or reject the 
supplier response, unless formally reassigned. Acceptance: Closure records the decision, decision maker, 
timestamp and accepted evidence version; rejection returns the item to the supplier with a reason. 
REQ-RMES-012 — Reopening logic. A supplier change to data or evidence used by a completed criterion 
must flag the criterion as impacted and reopen the related review or require an explicit no-impact confirmation. 
Acceptance: Previously approved results are never silently retained after their source version changes.

## Page 14  (embedded images: 0)

BDF CIQ Digitalization - Requirements Document v1.4 
Page 14 
7.3 Decisions, output and monitoring 
REQ-RMES-013 — Separate department approvals. The system must provide independent Final Safety 
approval and Final Regulatory approval, each with Approved/Rejected, decision maker, timestamp and 
mandatory rejection reason. Acceptance: Neither role can approve on behalf of the other without an auditable 
delegation. 
REQ-RMES-014 — Approval gate. Overall case approval must be possible only when both required RMES 
approvals are Approved and no blocking finding or supplier request remains open. Acceptance: The system 
identifies every blocking item when approval is attempted. 
REQ-RMES-015 — Internal confidentiality. RMES criteria, internal comments, findings before publication and 
approval rationales must be hidden from supplier users. Acceptance: Supplier-role testing confirms that only 
explicitly issued questions, requests and permitted attachments are accessible. 
REQ-RMES-016 — Versioned evaluation record. The system must retain every RMES version, criterion 
result, source reference, finding, query, response and decision in an immutable audit trail. Acceptance: An 
auditor can reconstruct who assessed what, against which source and rule-set version, and when. 
REQ-RMES-017 — Reference register. The final internal record must list the original title and version of every 
evaluated source document and may additionally store the technical storage title. Acceptance: A title mismatch 
does not break traceability and both values remain searchable. 
REQ-RMES-018 — Dashboard transparency. Dashboards must show RMES progress separately for Safety 
and Regulatory, including unassigned, open, waiting for supplier, overdue, reopened, approved and rejected 
states. Acceptance: RMM can identify the department, criterion and blocking reason without opening each task. 
REQ-RMES-019 — Notifications and escalation. The system must notify the assigned reviewer when an 
RMES task or resubmission arrives and notify the responsible supplier contact when a query is issued. Due-
date reminders and escalation recipients must be configurable. Acceptance: Each notification event is logged 
against the case. 
REQ-RMES-020 — Export and filing. After completion, the system must generate a readable, versioned 
internal RMES evaluation record and make it available for filing with the case. Acceptance: The export contains 
Parts A-D, applicability decisions, results, comments, references, findings and approvals, while respecting the 
defined supplier/internal visibility split.