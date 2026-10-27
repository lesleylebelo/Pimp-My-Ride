# PimpMyRide final-submission documentation

**University of Johannesburg · Diploma in Business Information Technology · DSW02B1**  
**Submission:** 29 October 2026 · **Presentation:** 2 November 2026  
**Evidence cut-off:** 27 October 2026 · **Application baseline:** `lesley`, commit `0d7b95f`

This package documents the existing application, not a proposed replacement. Only documentation was created. Source/configuration inspection, read-only Git checks, existing saved logs and official technical references informed the package. No application changes, environment edits, new tests/builds, production records, live AI calls, commits, pushes or deployments were performed.

## Document index and recommended reading order

| Order | Document | Contents |
| --- | --- | --- |
| 1 | [Final Project Report](PimpMyRide_Final_Project_Report.md) | Preliminary pages, all 12 requested academic chapters, references and six appendices; six embedded conceptual/process diagrams and 12 numbered screenshot figure placeholders |
| 2 | [User and Technical Manual](PimpMyRide_User_and_Technical_Manual.md) | Customer, Workshop and Admin guides; maintainer setup, configuration names, testing/build commands and troubleshooting |
| 3 | [System Diagrams](PimpMyRide_System_Diagrams.md) | Eight explained Mermaid models: architecture, actors, marketplace activity, authentication, AI, data relationships, private media and Studio transfer |
| 4 | [API and Database Reference](PimpMyRide_API_and_Database_Reference.md) | Registered HTTP routes, operation families, validation, Firestore collections and storage mappings |
| 5 | [Testing and Evidence](PimpMyRide_Testing_and_Evidence.md) | Inspected saved execution results, scope/limits, defect register and remaining acceptance checks |
| 6 | [Screenshot Checklist](PimpMyRide_Screenshot_Checklist.md) | 28 capture items with roles, screen/state, captions and conditional AI requirements |
| 7 | [Documentation Evidence Index](PimpMyRide_Documentation_Evidence_Index.md) | 35 implementation/source mappings, confidence levels, external-reference verification and unresolved evidence |

Each document includes its own scope/status explanation and can be read independently. Short source filenames in report tables resolve through the full paths in the Evidence Index. No secret configuration values or actual customer record examples are included.

## Findings that must remain accurate in the presentation

- Firebase Authentication and Cloud Firestore provide identity/application data; Supabase is the media store, not the marketplace database.
- Payments, attempts, receipts and payment-email events are explicitly simulated/test records. They do not establish real settlement or delivered payment email.
- Quotation ranking is deterministic advisory scoring, separate from PimpPilot.
- PimpPilot drafting and Studio code/UI are implemented and automated/mock-tested. Two recorded live Azure HTTP 400 incompatibilities were corrected locally; a later successful live generation was not supplied. Agent/model binding and retention/isolation need owner-side verification.
- Studio displays the original selected photo. AI image editing is **Not available yet**. Disabled/unavailable states must not be described as generated recommendations.
- Render/Netlify are existing configuration targets. Static configuration and export logs do not prove the currently deployed revision.

## Recorded verification, not newly rerun

Inspected local summaries show 618 passing frontend tests, 341 backend tests, 14 final focused Studio tests, 16 focused Azure/compatibility tests and 85 emulator checks. Runs overlap; do not add them into a unique-test total. The final Web build/export verifier passed. Earlier Android/iOS exports predate the final Studio UI and do not constitute physical-device acceptance. See the testing document for exact log paths and qualifications.

## Required completion before submission

Students must supply group/member/student-number/lecturer details, review acknowledgements and permitted-assistance attribution, review/sign the originality declaration, capture approved/redacted screenshots and confirm whether any live-deployment/AI claims have new evidence. Conditional AI-result captures remain pending when service availability has not been established. Do not manufacture results to complete the report.

The package is ready for **final academic review**, with these explicitly identified completion items. It is not yet a signed, paginated, screenshot-complete PDF/Word submission.

## Word/PDF export

Use consistent heading styles and an institutional template. Render Mermaid blocks as SVG/high-resolution images; Markdown source alone will appear as code in many Word/PDF converters. Generate page-numbered contents, figure/table lists and captions in the final editor. Recheck wide reference/requirement tables for split rows, landscape layout or sensible page breaks. Replace placeholders, verify cross-references and links, and review the final PDF for clipping, orphaned headings, fonts and redaction. No DOCX/PDF or fabricated screen images were generated by this task.
