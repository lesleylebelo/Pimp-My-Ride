# PimpMyRide: screenshot checklist

**Prepared:** 27 October 2026. **Application baseline:** `lesley` / `0d7b95f`. **Status:** no screenshots captured or fabricated by this documentation task. This checklist specifies 28 capture items: 25 ordinary/supplementary items and three conditional AI-result items. Some items require more than one image to show distinct screens or themes clearly.

Screenshots support implementation explanation; they do not replace test results. Use a separately authorised local/demo or reviewed hosted environment and approved accounts. Do not create production records solely to fill this checklist. Capture visible UI, not IDE secrets, environment tabs, tokens, identity documents or signed image URLs. Customer names, phone/email, vehicle registrations and audit UIDs must be redacted or synthetic.

## 1. Exact capture list

**Table S1. Screen, role, state and suggested caption**

| ID | Feature and exact screen/route | Account role | Required visible state | Suggested caption and main-report placement | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Sign In (`SignInScreen`) | Signed out | Email/password fields, recovery/create-account navigation; no password value | Figure 6.1a: Sign-in interface and supported account-recovery actions | Required |
| S02 | Verify Email (`VerifyEmail`) / registration completion | Signed out or unverified onboarding | Verification instruction/resend state, personal address hidden | Figure 6.1b: Email verification before marketplace access | Required |
| S03 | Discover (`Discover`) | Customer | Showcase/service filter controls and visible PimpPilot Studio launch card | Figure 6.2: Customer discovery and Studio entry point | Required |
| S04 | Discover Workshops view, then `ShopProfile` | Customer | Approved supplied workshop identity/services; no fabricated listings | Figure 6.3: Approved workshop discovery and profile | Required |
| S05 | Garage (`Garage`) with vehicle details open | Customer | Make/model/year, active/archive filter, supported actions; registration hidden | Figure 6.4a: Private owned vehicle management in Garage | Required |
| S06 | Vehicle Photos (`VehiclePhotos`) | Customer | Appropriate approved local photo, slot/source/replace/remove controls | Figure 6.4b: Camera/Gallery-backed private vehicle photo management | Required |
| S07 | Service Request form (`RequestForm`) | Customer | Vehicle, validated title/description, category/budget/date/audience controls before submission | Figure 6.5: Structured service-request preparation and audience choice | Required |
| S08 | Quotation comparison (`QuoteComparison`) | Customer | Actual supplied terms and explanation; honest no-winner state if applicable | Figure 6.6: Advisory comparison of current quotations | Required; data-dependent |
| S09 | Payment choice (`PaymentChoice`) | Customer | Explicit simulation label, valid offered payment choices or disabled capability explanation | Figure 6.7a: Explicit mock-payment choice before booking | Required; do not imply real charge |
| S10 | Booking detail (`BookingDetail`) | Customer or selected workshop | Appointment, service and simulated payment states shown distinctly | Figure 6.7b: Booking coordination with separate simulation accounting | Required; data-dependent |
| S11 | Profile (`OwnerAccount`) and/or Saved Posts (`SavedPosts`) | Customer | Appropriate account/theme/photo controls or real saved-post state | Appendix A: Customer profile and saved-showcase access | Supplementary; split images if both used |
| S12 | Find Jobs / workshop request detail (`ShopJobs`, `ShopRequest`) | Approved Workshop | Authorised request summary and permitted quote action | Figure 6.9a: Workshop discovery of an eligible service request | Required |
| S13 | Quotation form (`QuoteForm`) | Approved Workshop | Scope, line items, totals, deposit/validity/coverage controls before submit | Figure 6.9b: Itemised workshop quotation preparation | Required |
| S14 | My Shop showcases (`ShopPosts`) | Approved Workshop | Own showcase list and create/edit controls or truthful empty state | Figure 6.10a: Workshop showcase management | Required |
| S15 | Showcase editor (`PostForm`) | Approved Workshop | Structured vehicle/category/photo selection and review, not an auto-published AI result | Figure 6.10b: Reviewing a workshop showcase before publication | Required |
| S16 | Admin Overview (`AdminDashboard`) | Administrator | Queried metric cards and applications navigation; no hardcoded record counts | Figure 6.11: Administrative overview and application oversight | Required |
| S17 | Workshop account/application detail (`AdminAccount`) | Administrator | Verification status, document-status controls and reason/decision UI; no document opened in capture | Figure 6.12a: Controlled workshop application review | Required |
| S18 | Activity Log (`AdminAudit`) | Administrator | Redacted event/action/timestamp list and filter | Figure 6.12b: Auditable administrative activity | Required |
| S19 | Online Status (`AdminPresence`) | Administrator | Redacted bounded heartbeat/activity representation | Appendix A: Expiry-based administrative presence view | Supplementary |
| S20 | Studio landing (`PimpPilotStudio`) | Customer | Identity, workflow, Start New Concept and availability explanation | Figure 6.8a: PimpPilot Studio landing and concept workflow | Required |
| S21 | Studio workspace (`PimpPilotStudio`) | Customer | Selected owned vehicle, original photo label, interests/instructions, unavailable editing/service state | Figure 6.8b: Original-image Studio workspace with truthful availability | Required; no fake recommendations |
| S22 | PimpPilot suggestion modal in request/showcase form | Customer or approved Workshop | Genuine validated suggestion, original comparison and Apply/Dismiss | Appendix A: Reviewed AI drafting suggestion before explicit Apply | Conditional: only after authorised successful live evidence |
| S23 | Studio real proposal/refinement cards | Customer | Genuine validated response, separate observations/assumptions, selected scopes and history | Appendix A: Preliminary Studio proposals and bounded refinement | Conditional: real provider must be authorised and available |
| S24 | Studio transfer review → unsaved `RequestForm` | Customer | Selected-scope preview/confirmation, then unsaved normal form; no submission | Appendix A: Explicit Studio-to-request draft transfer | Conditional: genuine available plan required; never seed UI fake output |
| S25 | Messages / Chat (`Messages`, `Chat`) | Authorised Customer/Workshop | Redacted conversation, consent/send-availability and unread behavior | Appendix A: Context-authorised customer–workshop communication | Required; existing approved relationship only |
| S26 | Notifications (`Notifications`) | Customer/Workshop | Redacted event titles and supported navigation targets | Appendix A: Role-scoped in-app notification history | Supplementary |
| S27 | Relevant Customer/Studio screen at mobile and desktop widths, both themes | Customer | Wrapping, action reachability, original-photo containment, light/dark appearance | Appendix A: Responsive and theme-aware Customer presentation | Supplementary; document dimensions and theme per capture |
| S28 | Existing form or Studio offline/error/unavailable state | Customer/Workshop | Preserved input, disabled protected action, explicit retry explanation | Appendix A: Honest error handling without fabricated success | Required for quality evidence |

## 2. Capture procedure

1. Record the demonstrated commit, date, platform/runtime/browser, viewport/device and intended environment. Confirm that the app corresponds to the documented feature revision.
2. Navigate through normal registered controls with an authorised role. Do not bypass permissions or alter flags to manufacture a screenshot.
3. Use approved synthetic/local media and redact identifiers. Do not include the browser address bar if it exposes a signed private URL.
4. Capture one coherent state per image. Use a second image for a modal, distinct screen or material scroll region rather than compressing illegible details into a collage.
5. Name captures consistently, for example `S03_discover_customer_web.png`. Names are proposed artifacts; this task did not create image files or a screenshot directory.
6. Review contrast, cropping, readable text and simulation/availability labels. Keep an unmodified original capture securely if redaction was applied; the academic image must be safe to share.
7. Insert the final selected images at the report's numbered placeholders. Use Word captions/subcaptions for multi-image figures and update the list of figures.

## 3. Conditional AI evidence policy

S22–S24 must remain marked not captured while live generation is unverified/unavailable. An honest unavailable state at S21/S28 is valid evidence of implemented failure handling. Automated-test fixture plans may be described in test evidence but must not be presented as genuine live AI screenshots. An original vehicle photo is not an edited AI result; keep the **Not available yet** label visible.

If approved generation later succeeds, add only the minimum required safe capture and an evidence note: deployed revision, date, mode, success/validation outcome and current status. Never include credentials, raw provider diagnostics, private identity documents or unapproved personal photographs.

## 4. Final review

Use this checklist together with the manual and testing record. A screenshot proves a visible state at a moment in time; it does not establish all backend permissions, financial settlement, retention policy or general reliability. The report is ready for academic review with placeholders, but the group must complete the required safe captures, student metadata and document pagination before final submission.
