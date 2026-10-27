# Customer Service Requests Phase 2B — 26 October 2026

## A. Existing workflow and audit

Original repository, existing `lesley` branch. Garage Phase 2A was already
uncommitted when this task started and is preserved. This milestone covers
Customer Requests listing, details, creation/editing, existing lifecycle actions
and their existing Garage/AI/private-photo entry points only.

The audited routes remain `OwnerRequests`, `OwnerRequest` and `RequestForm` in
the existing OwnerNavigator. Garage passes `{vehicleId, vehicle}`; Workshop
profiles can pass an existing direct-workshop draft. Successful create/update
replaces the draft with `OwnerRequest`. Existing quotation, booking and chat
destinations remain connected; their implementations are unchanged.

The backend exposes `requests({feed:'mine',cursor})`, `request({id,quotesCursor})`,
`requestCreate`, revision-checked `requestUpdate` and confirmed `requestClose`.
Requests are owner-scoped and paginated newest-first in 20-record pages. The
Requests API has **no status-filter input** and the prior Customer list had no
status filters. None were invented or presented as account-wide filters.
Supported request statuses are `open`, `closed` and `booked`. Only open requests
can be edited or closed. Accepting a quotation is an existing separate workflow;
this task adds no transition, cancellation endpoint, reopening or payment flow.

Supported fields remain vehicle ID, title (100 characters), description (300),
active category, city (100), minimum/maximum ZAR budgets, optional preferred date,
open/direct audience and optional eligible workshop ID, selected private photo
IDs, up to 20 unique mandatory services (200 characters each) and optional service
coordinates. The existing cents conversion, date/location validation, mutation
receipts, optimistic version and material-term/quotation safeguards remain intact.
Server-owned identity, status and revision fields are not editable UI inputs.

Original problems: list cards omitted the vehicle, description and supplied
quotation count; the general Customer grid could make three narrow columns;
details mixed unrelated facts with management actions; forms began with a long
error summary and heavy photo controls before the service category; dirty request
drafts had no navigation-removal protection. An edit from a request snapshot did
not use the supplied vehicle snapshot for its selected-vehicle label.

## B. Requests home

My Requests has short supporting text, a compact New request action, a vertical
phone list and a bounded two-column maximum layout on wider screens. It retains
refresh, scroll pagination and the exact existing Customer frame/bottom bar.
Empty state offers New request. Errors offer refresh; an error/offline response
does not claim there are no requests. Existing safe loaded records remain
account-scoped, with offline actions disabled. The list now remounts by UID,
matching the other Customer account boundaries.

## C. Request cards

Order is title → actual status → supplied vehicle year/make/model → short
description → optional authorised private thumbnail → category/location/budget/
audience context → supplied quotation count → existing actions.

Counts render only for a nonnegative safe-integer `quotationCount`, labelled
submitted quotations. This is the server's recorded count, not a claim that each
quotation is current, unexpired or eligible. Missing counts are omitted, rather
than inferred from another client list. Missing vehicle data has an explicit
fallback; absent photos do not produce invented images. Registration, UID and
Firestore IDs are never rendered as card information.

View request opens existing details. Open requests retain Edit; an open request
with a positive supplied count also links to the existing comparison route.
Closed/booked/unknown states expose no broken Edit action. Unknown status/audience
values are labelled unavailable instead of being misrepresented as closed/open.

## D. Details

Sections separate request information/status/dates, the vehicle, requested work,
budget/timing, mandatory services and supplied-location availability, private
photos, management and workshop responses. Empty photos and quotation responses
use factual copy. Dates appear only when supplied and valid.

Edit and confirmed Close remain open-only. Booking links use only a supplied
booking ID. Existing communication consent and private quotation cards retain
their original components and behaviour; comparison, quotation acceptance,
Bookings and Payments were not redesigned. A close-success message appears only
after acknowledgement and data is refreshed. Details can retain the same
account/request's safe metadata while loading/offline; failed permission/error
responses do not continue showing its gallery or fabricate zero responses.

## E. Create/Edit

The form uses a bounded 760 px canvas and readable sections: Vehicle, Service
category, Request details/PimpPilot, Location & requirements, Budget & timing,
Audience, optional Photos and final actions. Budget fields wrap naturally on
phones and enlarged text. Required selection/field guidance, keyboard types,
keyboard avoidance/dismissal, limits and exact validation are retained.

Untouched fields begin neutrally; interaction or Show required fields reveals
validation. Failed saves retain the full draft and revision. The existing
synchronous mutation lock prevents duplicate submissions and progress disables
conflicting controls. React Navigation's installed `usePreventRemove` protects
changed drafts; Keep editing retains them, Discard resumes the original action.
Saving/uploading/location resolution cannot be discarded mid-operation. A saved
result releases the guard before the original replacement navigation runs.
An unuploaded local photo preview also participates in the guard, even when no
text field has changed. Submit requires uploading or explicitly cancelling that
selection, so successfully saving a request cannot silently discard its preview.

Known closed/booked/unknown edit snapshots show a read-only return path, rather
than an enabled save form. Server eligibility/version checks remain authoritative
if a request or vehicle changes after it was loaded. No draft store or automatic
publishing was introduced.

## F. Garage integration

The existing Garage handoff is unchanged. The form uses the supplied vehicle
snapshot, or matching loaded vehicle metadata, for its readable selection.
Active vehicles remain selectable through the existing paginated service.
An explicitly archived Garage preselection cannot initialise an actionable
vehicle selection. Changing vehicles clears selected photo IDs through the
original flow. Missing/archived resources are still rejected by the backend;
no ownership or eligibility workaround was added.

## G. PimpPilot and private photos

PimpPilot's actual component, provider implementation, prompts, unrestricted usage
policy, auth gates and review/Apply behaviour are unchanged. It sits with the text
fields in a neutral section. Generation does not save/publish the request; only
explicit Apply updates supported suggestion fields. Budgets, audience, photos,
vehicle, location and other terms remain intact.

PhotoGallery, the shared Camera/Gallery chooser, private-media transport and
storage policies are unchanged. RequestPhotoUploads reports only a Boolean local
preview state to the request discard guard; its picker/upload/retry behaviour is
unchanged. Its local/saved filename captions and errors now use theme colours,
with spacing between attachment controls; this fixes a dark-mode black-caption
defect found in browser review. The original five-photo/type/size
limits, local preview, explicit upload, cancellation/detachment, retry, signed
preview expiry, UID boundaries and publication snapshot semantics remain.
Optional list thumbnails use the existing authorised `PrivatePhoto` request
target, never public showcase URLs. Opening a preview does not publish media.

## H. Files changed in Phase 2B

- `src/features/customer/components/CustomerRequestUI.js`: Customer-only sections,
  grid/cards/status/selection/audience/actions and discard presentation.
- `src/features/marketplace/screens/OwnerMarketplaceScreens.js`: Requests-only
  list/detail/form wiring and draft protection; existing Garage functions preserved.
- `src/features/marketplace/components/RequestPhotoUploads.js`: optional preview-
  presence notification for draft protection and readable caption/error styling,
  without changing media transport.
- `tests/customer-requests-ui.test.cjs`: new presentation, data, state, navigation,
  draft/account, eligibility and interaction regressions.
- `tests/marketplace-owner.test.cjs`: request selector label and validation-summary
  assertions adapted; earlier Garage assertions retained.
- `tests/private-showcase-and-request-uploads.test.cjs`: local preview notification,
  failed-upload retention, cancellation and both-theme caption contrast regressions.
- `docs/CUSTOMER_REQUESTS_REDESIGN.md`: this audit and evidence.

Pre-existing Phase 2A files remain: GarageUI, VehiclePhotosScreen, Garage tests,
the UI-test helper and CUSTOMER_GARAGE_REDESIGN.md, plus its edits already present
in OwnerMarketplaceScreens/marketplace-owner tests. They were not reset, committed
or repurposed. No backend, API, navigator, Discover, quotation/card/comparison,
booking, payment, Workshop/Admin, PimpPilot or shared media transport/storage implementation changed.

## I. Verification and evidence

- Final focused regressions: **40/40 passed** using the Requests UI, existing
  owner-workflow and private attachment suites. Log:
  `.local-checks/requests-phase2b-final-focused.log`.
- Relevant backend request/photo/cleanup security suites: **154/154 passed**.
  Log: `.local-checks/requests-phase2b-security.log`. No backend source changed;
  the complete backend unit suite was not required/rerun.
- Real Auth/Firestore request/photo integration tests: **45/45 passed** using
  `node --test --test-concurrency=1 backend/test/marketplace-integration.test.cjs backend/test/photos-integration.test.cjs`
  against synthetic emulator records. Log:
  `.local-checks/requests-phase2b-emulator-integration.log`. Covers actual HTTP,
  ownership, direct audiences, revoked identities, revisions/idempotency,
  lifecycle/quotation safeguards and private attachment access/snapshots. Backend
  source remained unchanged; these tests were not repeated for the final caption styling.
- A snapshot comparison confirms that the existing Garage/VehicleForm function
  block matches the exact Phase 2A starting state, including its discard guard.

- Full final frontend suite: **606/606 passed**, no failures, skips or
  cancellations. Command: `node --test --test-concurrency=2 tests/*.test.cjs`.
  Log: `.local-checks/requests-phase2b-frontend.log`. Includes existing auth,
  restoration/account switching, Garage, Discover/navigation, Workshop/Admin,
  quotations/payment safeguards, PimpPilot, camera/gallery and release regressions.
- Android and iOS production exports passed together with the installed Expo CLI:
  `export --platform android --platform ios --clear --max-workers 2`, using the
  existing dotenv configuration. Both Hermes bundles are in
  `.local-checks/requests-phase2b-native-export`; log:
  `.local-checks/requests-phase2b-native-export.log`.
- Guarded `npm run build:web` and separate `npm run verify:web` passed against
  the same `dist`. Logs: `.local-checks/requests-phase2b-production-web.log` and
  `.local-checks/requests-phase2b-verify-web.log`. The actual compiled transport
  passed its isolated mocked health/auth/Admin/marketplace/posts requests with
  the existing Render URL; the verifier sends no production requests.

The final verified entry is
`/_expo/static/js/web/AppEntry-694f04a0c13c33ac9ed81a5303b58326.js`, SHA-256
`f5ae8f9548a7d013ac85d1c6ea4712e42ecaf536fd5cd302f421cc4565e2e2c0`.
It supersedes the prior local Garage/API artifact hashes. Release scripts are
unchanged; future builds must use the guarded command and verifier. The ignored
development-only browser export is not a production release artifact.

An isolated headless Edge pass of the existing development-only app export passed
with **zero runtime errors**. The in-app Browser was unavailable. The browser
exercised Garage vehicle preselection; request list/status/supplied counts;
private details and unchanged quotation cards; closed-request restrictions;
create validation; explicit mocked PimpPilot generation, Dismiss and Apply without
saving; direct/open audiences; Camera-input preview/cancellation; Gallery/private
attachment upload; preview discard protection; exactly one created request;
revision-safe edit; Keep editing/Discard changes; confirmed close; sign-out and
account switching to an empty second account without stale records.

Exactly **two synthetic provider calls** were made in the QA process. No Gemini
request or credit was used. Camera input was exercised with installed Web picker
capture semantics and a synthetic file, not physical hardware. The existing
development media adapter substitutes a synthetic PNG for uploads; this does not
establish production media storage or physical-camera acceptance. No demo adapter
or provider implementation was changed in application source.

Actual layout measurements, 1000 px viewport height:

| Width | Columns | Card width | Bottom bar top | Final list action bottom after scroll |
| --- | --- | --- | --- | --- |
| 390 | 1 | 358 | 930 | 901 |
| 768 | 2 | 343 | 930 | 901 |
| 1440 | 2 | 487 | 930 | 901 |

No page horizontal overflow was found. The final list action remained clear of
the persistent bottom bar. Hover, focus and pressed feedback passed. Dark-mode
home, detail, form inputs, budget and attachment views were captured and visually
inspected at all three widths. Both-theme caption contrast and enlarged-text
layout are also covered by tests. These screenshots do not establish every
nested state in both themes. The credential warning banner is existing emulator
tooling, not a new production interface.

Ignored evidence:

- `.local-checks/requests-phase2b-browser-results.json`
- `.local-checks/requests-phase2b-browser.log`
- `.local-checks/requests-phase2b-{home,detail,form,form-budget,form-attachments}-{390,768,1440}.png`

Final `git diff --check` passed. The QA browser and emulators were stopped.

## J. Remaining manual verification

Physical iOS/Android devices are unavailable. Before release, use authorised
fixtures to check native Camera/Gallery, permission denial/settings/cancellation,
keyboard and safe areas, native back/swipe and discard prompts, enlarged system
text, both themes, VoiceOver/TalkBack, reduced motion, attachment failure/retry and
signed preview expiry. Browser file injection is not physical camera acceptance.
Native exports establish bundle compatibility, not full device acceptance.
No live account or real Gemini/provider smoke test is performed by this milestone.

## K. Release-readiness assessment

Work remains local on `lesley`. No commits, pushes, merges, deployments, live
environment changes or production writes. Existing EAS/Netlify configuration and
guarded release scripts are unchanged. Implementation and all local automated,
browser and export checks above pass on `lesley`; this milestone is ready for
review. Physical-device acceptance remains before a release decision. Local
readiness does not mean the existing deployed site contains this work. Work stops
at Requests Phase 2B; no Quotations or Bookings redesign was started.
