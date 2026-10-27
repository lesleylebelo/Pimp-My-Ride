# Customer Garage Phase 2A — 26 October 2026

## A. Audit and original issues

Work is confined to the original repository on `lesley`. The existing Garage
already had account-scoped pagination, active/archived filters, a details modal,
Add/Edit, private photos and a vehicle-preselected service-request entry.
List cards exposed registration unnecessarily, put secondary controls before the
service action, and inherited the general three-column Customer grid. The cover
was a button containing PrivatePhoto's possible retry button. Forms displayed a
full list of validation errors before interaction and had no discard protection.
The photo-management route did not identify the vehicle being edited.

The audited persistence operations are `vehicles`, `vehicleSave` and
`vehicleArchive` in the existing marketplace service. Supported editable fields
are make/model/colour (80 characters), year (1886 through next year), registration
(20 characters, existing character validation). Server-owned fields include UID,
revision, archive status and photo IDs/slots/revision. Listing uses 20-record
cursor pages; no additional maximum vehicle count was found or introduced.
There is no permanent-delete operation: removal archives and preserves history.

Vehicle ownership, eligible account checks, optimistic vehicle/photo revisions,
mutation receipts, storage validation and request eligibility remain server-side.
The existing five-slot private photo library accepts JPEG/PNG/WebP; the completed
picker converts supported HEIC/HEIF/camera selections locally. The existing 5 MB
limit, explicit upload/replace/remove confirmation, failed-selection retention,
refresh-before-retry and expiring signed previews are unchanged.

## B. Garage structure

My Garage retains branding, messages/notifications, five bottom destinations,
pull-to-refresh, scroll pagination and Active/Archived controls. A short toolbar
keeps Add vehicle easy to find. Empty active Garages also offer Add your first
vehicle. Loading, offline and failed reads remain truthful; retained list data
is account-scoped and mutations are disabled while offline. The offline state
does not claim the Garage is empty.

## C. Cards and responsive layout

Cards follow photo/neutral placeholder → make/model → supplied year/colour and
archive status → Request a service → Edit vehicle/Manage photos → confirmed
Remove/Restore. The heading opens existing details, where registration stays
private. No Firestore ID, invented specification or stock vehicle photo is shown.
The cover is no longer a press target, so a photo retry cannot activate details.

Garage-only layout measures its actual container. Phones use full-width vertical
cards; sufficiently wide containers have two columns at most. Enlarged text
returns to one column. The canvas is bounded to 1040 px including its padding,
with an 18 px gap and 16:9 cover proportions. The shared Customer grid, Discover,
bottom bar, shell insets and other screen layouts are unchanged.

## D. Add/Edit

The existing five inputs remain grouped into identity and appearance/registration.
Required labels, placeholders, registration capitalization, numeric year keyboard,
field limits, inline validation, keyboard avoidance and scroll dismissal remain.
Untouched fields no longer begin in an error state. Save shows progress and uses
the existing synchronous mutation lock. Failures retain the entered draft and
original optimistic revision; success returns only after API acknowledgement.

React Navigation's installed `usePreventRemove` guards removal of a dirty form.
Keep editing retains the draft; Discard changes resumes the original navigation
action. A pending save cannot be discarded. Successful saving releases the guard.
Account/vehicle keys still discard another account's draft; late responses cannot
navigate the replacement account. This does not introduce a persistent draft store.

## E. Photos

Garage card/details photo links now pass their existing vehicle snapshot as
display context. VehiclePhotos displays make/model and year/colour only when
that snapshot matches the route ID. Entry points without a snapshot retain the
generic heading. The gallery continues to authorize against its existing ID and
current UID; route text is not permission evidence.

PhotoGallery, the shared Camera/Gallery chooser, photo preparation, private media
transport and backend storage implementation are unchanged. Existing selection,
local preview, upload confirmation, replacement/removal, refresh/retry, permission
handling and expiry controls remain authoritative.

## F. Request handoff

Request a service still navigates to `RequestForm` with `{vehicleId, vehicle}`.
The existing form preselects that vehicle. Opening this route creates neither a
vehicle nor a request; no request, quotation or payment presentation changed.

## G. Interaction/accessibility

Controls reuse CustomerPressable/CustomerAction theme, hover, visible keyboard
focus, pressed and disabled states. Actions are at least 48 px high; filters are
at least 44 px. Long names/actions wrap. Cards themselves are noninteractive
Views; the details heading and sibling actions have independent accessible names.
Existing modals supply Escape/focus trapping/restoration and reduced-motion
behaviour. Native safe-area and bottom navigation code is unchanged.

## H. Exact files changed

- `src/features/marketplace/components/GarageUI.js`: scoped grid, card/cover/action sizing.
- `src/features/marketplace/screens/OwnerMarketplaceScreens.js`: Garage hierarchy,
  private registration presentation, empty action, Add/Edit validation/progress/discard guard only.
- `src/features/marketplace/screens/VehiclePhotosScreen.js`: matching vehicle identity.
- `tests/garage-ui.test.cjs`: layout/order/privacy/interactions/save/account/identity regressions.
- `tests/marketplace-owner.test.cjs`: updated Garage photo-route context expectation.
- `tests/helpers/load-ui.cjs`: default navigation-guard stub for UI tests.
- `docs/CUSTOMER_GARAGE_REDESIGN.md`: this audit and acceptance evidence.

## I. Verification

- Focused Garage regression suite: **15/15 passed**,
  `.local-checks/garage-phase2a-garage-final.log`.
- Full frontend: **592/592 passed**, no skips/cancellations/failures, using
  `node --test --test-concurrency=2 tests/*.test.cjs`;
  `.local-checks/garage-phase2a-frontend.log`. Includes existing Customer,
  Workshop/Admin, auth/account switching, camera/gallery and release regressions.
- Relevant backend vehicle/photo/cleanup security tests: **154/154 passed**,
  `.local-checks/garage-phase2a-security.log`. No backend source changed, so the
  broader backend unit suite was not rerun.
- Real Auth/Firestore vehicle/photo integration suites: **45/45 passed** using
  `node --test --test-concurrency=1 backend/test/marketplace-integration.test.cjs backend/test/photos-integration.test.cjs`
  inside the existing synthetic emulator project. Log:
  `.local-checks/garage-phase2a-browser.log`. This covers owner-scoped pagination,
  idempotent creation, concurrent edits, archive eligibility, authenticated uploads,
  request privacy and private-media access. Emulators and the QA browser were stopped.
- Android and iOS production exports passed with the installed Expo CLI,
  `export --platform android --platform ios --clear --max-workers 2` and the
  existing dotenv configuration. Both Hermes bundles are in
  `.local-checks/garage-phase2a-native-export`; log:
  `.local-checks/garage-phase2a-native-export.log`. The first attempt encountered
  sandbox denial of the installed Hermes compiler; the same export succeeded
  outside that process restriction.
- Guarded `npm run build:web` and separate `npm run verify:web` passed against
  the same `dist`. Logs: `.local-checks/garage-phase2a-production-web.log` and
  `.local-checks/garage-phase2a-verify-web.log`. The actual compiled transport
  passed health/auth/Admin/marketplace/posts checks using isolated fetch mocks;
  these checks send no requests to production.

The verified Web entry is
`/_expo/static/js/web/AppEntry-6b17ab5cfef481d74e435b82a87706f7.js`, SHA-256
`b6939f5c18da78dacbe39bb817f7cbe0b46c816b2b616f1a965c285816d6733a`.
It supersedes prior local build hashes; the existing release scripts are unchanged.
Do not deploy the ignored development-only browser export as a production artifact.

An isolated headless Edge browser passed the existing local demo application's
Garage acceptance flow with **zero runtime errors**. The in-app Browser was
unavailable. Firebase Auth/Firestore emulators and synthetic records/files were
used exclusively. The browser exercised sign-in, details privacy, real Add/Edit
transactions, Keep editing/Discard changes, existing request vehicle preselection,
gallery preview/confirmed upload, camera-input preview/confirmed replacement,
signed preview, photo removal, archive cancellation/removal/restoration and sign-out.
Replacement was verified by the authoritative photo revision, rather than a
filename: the existing development media adapter deliberately uploads a fixed
synthetic PNG. This is not evidence of physical camera access or production media
storage. Real transport/private-media contracts are also covered by unit/emulator
tests; the shared demo adapter was not changed.

Actual layout measurements at a 1000 px viewport height:

| Width | Columns | Card width | Bottom bar top | Final action bottom after scrolling |
| --- | --- | --- | --- | --- |
| 390 | 1 | 358 | 930 | 900.5 |
| 768 | 2 | 351 | 930 | 828.3 |
| 1440 | 2 | 487 | 930 | 900.8 |

There was no page horizontal overflow or overlap between the final action and
the visible bottom navigation. Pointer hover, keyboard focus and pressed feedback
passed. Garage, details, Add/Edit presentation and photo management were captured
and visually inspected at all three widths in dark mode. Both-theme token/contrast
and enlarged-text layout checks passed in the automated suite; these screenshots
do not establish every state in light mode. The emulator credential banner is
existing development tooling, not a new product interface.

Ignored local evidence:

- `.local-checks/garage-phase2a-browser-results.json`
- `.local-checks/garage-phase2a-browser.log`
- `.local-checks/garage-phase2a-{garage,details,add-vehicle,photos}-{390,768,1440}.png`

`git diff --check` passed. Local readiness does not imply a deployed change.

## J. Remaining device checks

Physical iOS/Android devices are not available. Before release, review both
themes with enlarged text, system keyboard/safe areas, native swipe/back and
discard behaviour, VoiceOver/TalkBack, photo permission denial/settings recovery,
real Camera/Gallery, picker cancellation, upload loss/retry and signed-preview
expiry on authorised fixtures. Browser file injection cannot establish physical
camera acceptance. Native export success establishes bundle compatibility only.

## K. Release assessment

Nothing is committed, pushed or deployed. No live data, environment, infrastructure,
API contract, navigation bar, Discover, Workshop/Admin, PimpPilot, shared chooser,
payment or quotation implementation is changed. Work stops at Garage for review.
Implementation, automated tests, browser acceptance and all three platform exports
pass locally on `lesley`. The Garage is ready for review; physical acceptance
remains outstanding before a release decision. No further Customer UI work was started.
