# Customer Discover: vertical showcase feed

This follow-up changes only the Customer Discover showcase feed in the original
repository on `lesley`. It replaces the earlier Discover tile grid described in
`CUSTOMER_REDESIGN.md`; that report's test counts and bundle hash describe the
earlier implementation.

## Changes and UI decisions

Discover's posts now stack in one column at phone, tablet and desktop widths.
The column fills the available phone width and is bounded to 680 px on larger
screens, with 24 px between posts. Existing page scrolling, pull-to-refresh,
cursor loading, search, service/category chips, location filtering, Saved posts,
workshop directory and header shortcuts remain attached to their existing logic.
The five navigation tabs are unchanged.

Each feed post renders workshop avatar/name, supplied location/time and optional
verified state first, followed by category, full title, description and supplied
vehicle details. The image follows the information, at a 4:3 aspect ratio with
12 px corners. Existing dark/light theme tokens and lime focus/selected accents
are reused. Titles/descriptions wrap without the tile presentation's two-line
limit. Missing photos show the existing factual placeholder.

The footer has the existing detail action on the left and save/bookmark on the
bottom right. The save target is separate from detail navigation, shows pending
state, stays disabled while offline or saving, and changes selection only after
the existing posts API acknowledges it. Failed saves retain the prior selection
and display the actual error. Image loading/retry controls remain outside the
detail press target. Text and the explicit View showcase action open the existing
detail route, which retains the full gallery and workshop portfolio entry.

No likes, comments, sharing, ratings or other backend features were introduced.
Verification is shown only when the existing post/shop state explicitly says
approved; the absence of verification metadata does not imply approval.

## Files

- `src/features/customer/screens/CustomerDiscoverScreen.js`: replaces only the
  showcase grid with the bounded single-column stack and opts into feed posts.
  The separate Workshop directory continues to use its existing layout.
- `src/features/customer/components/CustomerFeedPostPresentation.js`: new,
  Discover-specific post layout using existing Customer controls/avatar/media.
- `src/features/marketplace/components/PostCard.js`: optional presentation prop
  selects the new layout for Customer Discover only. Save state, callbacks,
  authentication and photo normalization are retained. The shared transport
  correction is described below. Default
  Customer cards and the Workshop rendering branch retain their layouts.
- `src/features/marketplace/services/postsApi.js`: fixes the confirmed existing
  save-request mismatch described below; backend contract remains unchanged.
- `tests/customer-discover-feed.test.cjs`: responsive layout/order, bookmark
  acknowledgement/error/offline, navigation, missing media, verification and
  default-presentation regressions.
- This report.

Garage, Requests, Bookings and Profile were not changed by this follow-up.
No API contracts, backend, authentication flow, media access, infrastructure or
release scripts changed. Existing uncommitted work is preserved. No commit,
push, deployment or production data write is part of this task.

## Confirmed bookmark defect

The emulator browser check reached the real posts handler and found that the
existing client added `requestId` to saves. `backend/posts.cjs` explicitly accepts
only `op`, `id` and `saved` for this operation, so the extra field produced HTTP
400, "This request contains unsupported fields." This was an existing transport
mismatch, independent of the presentation change; mocked PostCard tests alone
did not detect it.

The minimal client fix omits generated request IDs for `save` only. This endpoint
already sets the requested boolean transactionally, so retrying the same desired
value remains idempotent. Request IDs for other post writes, account checks,
server authentication and strict field validation remain intact. No backend
contract or safeguard was relaxed. The regression exercises the actual client
transport, accepted fields, retries, and rejected stale/signed-out accounts.

## Verification

- Focused feed/transport regressions, existing showcase retry tests and posts
  backend tests: **29/29 passed** (including six new feed/transport cases). Log:
  `.local-checks/discover-social-save-tests.log`.
- Final full frontend suite after the bookmark transport fix: **553/553 passed**,
  zero failures/skips/cancellations.
  Command: `node --test --test-concurrency=2 tests/*.test.cjs`. Log:
  `.local-checks/discover-social-frontend.log`. Existing search, filtering,
  pagination, utility navigation, saved posts and role-specific coverage pass.
- Isolated headless Edge browser with existing local Auth/Firestore emulators:
  **passed at 390, 768 and 1440 px with zero runtime errors**. Checks covered
  sign-in, vertically stacked posts, text-before-image layout, bottom-right
  bookmark placement, actual acknowledged saving without navigation, post
  detail, workshop portfolio and return to Discover. Pointer hover, keyboard
  focus and absence of horizontal page overflow also passed. Final evidence:
  `.local-checks/discover-social-browser-results.json` and
  `.local-checks/discover-social-browser.log`; screenshots:
  `.local-checks/discover-social-discover-{390,768,1440}.png`.
  The in-app Browser was unavailable, so headless Edge was used. Earlier
  attempts encountered local startup/memory pressure and then exposed the
  bookmark mismatch above; the final pass succeeded after the client correction.
  All writes were synthetic emulator fixtures. The emulators and Expo test
  server were stopped after the successful pass.
- Guarded `npm run build:web` and standalone `npm run verify:web`: **passed**.
  Both verified the same exported entry asset and existing Render API origin.
  Release checks executed the compiled transport with mocks; no verification
  requests were sent to production. Logs:
  `.local-checks/discover-social-production-web.log` and
  `.local-checks/discover-social-verify-web.log`.
- `git diff --check`: **passed**; branch remains `lesley`.

Final local Web entry:
`/_expo/static/js/web/AppEntry-5d482094512c5a0e88626282385e67bb.js`.
SHA-256: `21a7dc41f9305d1dc57addb5866029167692cf64e4ba763581ce34c2784704fc`.
This is a verified local artifact, not a deployment. Future source changes can
change its filename/hash; use the guarded build/verifier again before a release.

Physical-device interaction and native screen-reader review remain manual;
browser widths do not establish physical iOS/Android acceptance. Existing posts
backend tests passed in the focused run; no backend or security rules changed.
The existing detail screen retains its gallery; no inline feed carousel was added.
