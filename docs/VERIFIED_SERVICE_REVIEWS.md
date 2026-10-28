# Verified service reviews and quotation comparison

Implementation and local verification: 29 October 2026, South African Standard Time.
This document is prepared for incorporation into
`PimpMyRide_Complete_Academic_Documentation(1).docx`. The master Word report is unchanged.

## Existing architecture and integration decisions

- `backend/marketplace.cjs` owns bookings, authorized workshop completion,
  quotation eligibility, notifications and unread counts. Completion sets
  `serviceStatus: completed` and `serviceCompletedAt`, independently of payments.
  Customers cannot invoke that workshop action. Booking writes already require
  the API; a client cannot forge completion through Firestore.
- `backend/reviews.cjs` is the existing workshop **application approval** service.
  It is unrelated to customer service reviews and remains unchanged. No existing
  service-review collection or rating calculation was found.
- `createServices.actor` checks live Firebase identity, verified email, account
  status and token validity. Admin access also requires the stored role and
  trusted Firebase admin claims. These checks are reused.
- The existing Workshop Profile is `ShopProfileScreen` / `ShopPortfolio` in
  `PostScreens.js`. Discover, portfolio and workshop showcase cards reuse the
  public workshop snapshots supplied by the posts API.
- Notifications already use `notifications`, `recipientUid`, `readAt`, cursor
  history and a validated navigation target. Reviews reuse those records and
  screens. Review notices are ordinary in-app activity, without simulated-payment
  labels, email or external push delivery.
- Smart comparison already deduplicates current quotation heads, validates request
  terms/revisions, expiry, shop/account/vehicle/category availability, totals,
  coverage and all-charge confirmations. Its 500-quotation bound and deterministic
  tie rules remain. Previous weights were price 40%, coverage 35%, distance 25%.
- Existing read coordinators provide account-scoped caching, coalescing and
  cooldowns. The reviews client uses the same coordinator and global invalidation.

## User journeys and business rules

### Customer

Open Booking Details after the workshop marks the service completed. An eligible
customer sees **Rate & Review Workshop**, selects one of five yellow stars, then
enters a written review. Text stays disabled until a rating is selected. Cancel
closes the form without sending anything; drafts survive cancellation and failures
within that mounted booking screen.

The server requires an integer rating of 1–5 and trimmed, normalized text of
20–2,000 characters. Empty, punctuation-only, low-diversity repeated text, control
characters, links, email addresses and recognizable phone numbers are rejected.
This is basic spam/privacy protection, not a claim of comprehensive automated
abuse or personal-information detection.

Submission requires a live, verified, enabled, active customer; no pending
account/provisioning action; an owned booking; a distinct workshop from that
booking; `status: confirmed`; `serviceStatus: completed`; a recorded completion
timestamp; and no cancellation/invalidation marker. The workshop must currently
be verified, approved, active and enabled, with no pending account/approval action.
The client cannot choose the review's customer, workshop or completion state.
The API independently checks all conditions, including inside the write transaction.
Payment status and actual payment transactions are not eligibility requirements.
Historical bookings without recorded completion evidence do not gain eligibility
through a guessed migration.

One completed booking supports one review. Another completed booking for the same
workshop can support another review. Rapid taps are locked synchronously; identical
network retries return the existing result without duplicating anything. A changed
payload for an already-reviewed booking is rejected. On success, the action becomes
**View Your Review** with the acknowledged rating/text and a success message.

Reviews are immutable to customers and workshops. Corrections and disputes go
through an authorized administrator. Existing legitimately submitted reviews are
historical feedback: later account suspension or cancellation does not silently
erase negative feedback. An invalidated original service can be investigated and
explicitly moderated with a recorded reason. Suspended/unavailable workshops have
no accessible public review page or eligible quotation recommendation.

### Workshop and public profile

The workshop receives one unread in-app notice with a generic **Verified customer**
identity and the star rating. Its existing booking navigation target opens Booking
Details, which now displays the customer review read-only. The workshop cannot
submit, edit, hide or delete the review.

Workshop profiles show five-star visuals, actual average/count, available service
category, review text and submission date in `Africa/Johannesburg`. Unrated
workshops show **Not yet rated**, without a misleading zero-star reputation.
History is loaded in pages of 20 with loading, error/retry, refresh and empty states.
Its deterministic document-ID ordering is stable across deleted cursor records;
it is not a newest-first timeline. Public APIs return only visible reviews and
privacy-safe fields. No customer UID, booking reference, contact details or vehicle
information is projected. Review IDs are SHA-256 hashes, not raw booking IDs.

Workshop showcase cards and directory API summaries use the same server-owned
rating projection. There is no aggregation query per card. Profiles fetch current
review summaries, rather than trusting potentially stale navigation parameters.

### Administration and moderation

The new **Service Reviews** admin section lists bounded pages, allows hiding and
restoring a review with a 10–500 character reason, and offers rating reconciliation.
Mutations also require the existing recent-password-confirmation window. If the
session is too old, sign in again and retry the preserved action. The existing
trusted admin authorization is unchanged.

Hide only abusive, private, fraudulent or otherwise invalid content. Disagreement
with a workshop or a low star rating alone is not a reason for removal. Hiding
subtracts exactly that review from visible totals; restoring adds it back. Original
rating/text and internal booking attribution are retained. Reasons, actor,
timestamps and before/after state are audited. Customers can still view their
hidden review and are directed to support to dispute moderation. Workshops see
only visible review content. Admin retries use the existing mutation receipts,
so replaying an old hide request cannot undo a later restoration.

There is no workshop-response feature or new in-app report/dispute ticket system
in this implementation. Those were optional; no suitable existing report workflow
was found to reuse. Administrators can investigate through the review list and
existing audit infrastructure. Workshops receive no permission to suppress feedback.

## API contracts

All operations use the existing Firebase Bearer-token middleware and Express JSON
limits. Unknown or forged fields are rejected.

`POST /api/service-reviews`, JSON body:

| Operation | Allowed fields besides `op` | Result |
| --- | --- | --- |
| `reviewSubmit` | `id` (booking ID), `rating`, `text` | `{id}` (hashed review ID), or existing identical review acknowledgement |
| `bookingReview` | `id` (booking ID) | `{review, eligible}` for the authorized participant; only the customer can be eligible |
| `workshopReviews` | `shopId`, optional `cursor` | `{items, cursor, summary: {average, count}}` for an available workshop |

`POST /api/admin` uses the existing admin service:

| Operation | Fields | Purpose |
| --- | --- | --- |
| `serviceReviews` | optional `cursor` | 20 review records for moderation, including current state/reason and shop ID |
| `serviceReviewModerate` | `id` (review ID), `status` (`hidden` or `visible`), `reason`, retry `requestId` | Atomic moderation, totals and audit |
| `serviceReviewReconcile` | `shopId`, `reason`, retry `requestId` | Aggregate consistency recovery and audit |

Read operations enter the existing read rate bucket. Writes remain in the existing
mutation bucket. There are no automatic submit retries or review polling loops.

## Firestore schema, integrity and recovery

`serviceReviews/{sha256("verified-service-review\n" + bookingId)}`:

- `bookingId`, `customerId`, `shopId`: derived from the authoritative booking/auth.
- `rating`: integer 1–5; `text`: trimmed NFC review content.
- `customerName`: generic `Verified customer`; optional `serviceCategory` snapshot.
- `status`: `visible` or `hidden`; `schemaVersion: 1`.
- Server `createdAt`, `updatedAt`.
- Following moderation: `moderationReason`, `moderatedBy`, `moderatedAt`.

`users/{shopUid}.verifiedRating` contains integer `sum`, `count`, monotonically
updated `revision`, and server `updatedAt`. The API derives the actual public
average as `sum/count`; it does not store a competing client-calculated average.
Missing totals mean unrated. Malformed totals are never scored as a valid rating;
new mutations fail closed until reconciliation where appropriate.

Review creation, workshop totals, deterministic
`notifications/service_review_{hashedReviewId}` and submission audit are in **one
Firestore transaction**. A notification storage failure rolls everything back.
Retrying safely recreates the whole operation, without a delivery gap, duplicate
review, duplicate alert or double increment. This uses the existing notification
collection and does not introduce another delivery system or email outbox.

Moderation updates the review, totals and audit in one transaction. Reconciliation
uses Firestore server `count` and `sum` aggregation queries over visible reviews,
then compares the workshop aggregate revision in a transaction before replacing
totals. A concurrent review/moderation revision change aborts reconciliation with
an explicit retry message. This avoids fetching every review or overwriting a
newer rating update. Recovery is admin-only and records its reason and audit.

Firestore rules explicitly deny direct client review reads/writes for every role,
including admins. Existing user-profile write restrictions protect rating totals.
Only the API returns public projections. No authentication settings, payment
processing, email configuration or production records were changed.

New indexes in `firestore.indexes.json`:

1. `serviceReviews`: `shopId ASC`, `status ASC`, `__name__ ASC` for public pages.
2. `serviceReviews`: `shopId ASC`, `status ASC`, `rating ASC` for aggregate recovery.

Admin pages use the automatic document-ID index. No backfill or data migration is
required for a previously unused service-review collection. The emulator verifies
query behavior but does not establish production index readiness; wait for indexes
to finish building during deployment.

## Smart Quotation Comparison

All existing eligibility filters and request/quote protections remain. Ratings are
read from each already-loaded live workshop profile, never supplied by the client
or calculated by fetching reviews for every comparison.

When all criteria can be used, weights are:

| Factor | Weight | Normalization |
| --- | --- | --- |
| Price | 35% | Lowest eligible total / this total |
| Service coverage | 30% | 1 for a fully confirmed eligible offer; incomplete coverage is not ranked |
| Verified rating | 20% | `(confidenceAdjustedRating - 1) / 4` |
| Distance | 15% | `(maximumDistance - thisDistance) / (maximumDistance - minimumDistance)`; identical distances score 1 |

For `n` visible verified reviews with actual average `r`, comparison uses
`(n*r + 5*3.5)/(n+5)`. The 3.5/5 value and five-observation strength are explicit
design priors, not a claimed observed platform average. A one-review five-star
workshop therefore has adjusted 3.75/5; greater review volume increases confidence.
Public averages and actual counts remain unchanged.

An unrated workshop remains eligible and uses the neutral 3.5/5 prior when other
eligible shops are rated. If every eligible shop is unrated, rating is excluded for
everyone. As before, if any eligible shop lacks a valid distance, distance is
excluded for everyone. Remaining weights are normalized by their sum. Missing
information never receives an invented five-star rating or zero kilometre distance.

Scores retain existing precision and deterministic ID ordering. Equal top scores
produce a tie with no recommended winner. Fewer than two eligible complete offers
also produce no winner. The comparison UI distinguishes actual average/count,
confidence-adjusted comparison rating, scope and distance, and states that customer
ratings do not certify mechanical quality or safety. Existing refresh behavior and
expiry safeguards are unchanged.

## Changed files

New application files:

- `backend/service-reviews.cjs`
- `src/features/marketplace/services/serviceReviewsApi.js`
- `src/features/marketplace/components/ServiceReviews.js`
- `src/features/admin/screens/ServiceReviewModerationScreen.js`

Modified application/configuration files:

- `backend/app.cjs`, `backend/services.cjs`, `backend/request-policy.cjs`
- `backend/marketplace.cjs`, `backend/posts.cjs`
- `backend/quote-recommendation-read.cjs`, `backend/quote-recommendations.cjs`
- `firestore.rules`, `firestore.indexes.json`, `scripts/test-emulators.cjs`
- `src/features/marketplace/screens/BookingScreens.js`
- `src/features/marketplace/screens/PostScreens.js`
- `src/features/marketplace/screens/QuoteComparisonScreen.js`
- `src/features/marketplace/utils/notificationPresentation.js`
- `src/features/marketplace/components/WorkshopFeedCards.js`
- `src/features/customer/components/CustomerFeedPostPresentation.js`
- `src/features/customer/components/CustomerPostPresentation.js`
- `src/features/admin/AdminNavigator.js`
- `src/features/admin/screens/AdminHomeScreen.js`
- `src/features/admin/services/adminApi.js`
- `src/features/admin/utils/presentation.js`

Tests/documentation:

- New `backend/test/service-reviews.test.cjs`
- New `backend/test/service-reviews-integration.test.cjs`
- New `tests/service-reviews-ui.test.cjs`
- Modified `backend/test/marketplace.test.cjs`
- Modified `tests/bookings-ui.test.cjs`, `tests/quote-comparison.test.cjs`
- Modified `tests/quote-recommendations.test.cjs`
- Modified `tests/admin-dashboard.test.cjs`, `tests/rules/access.test.cjs`
- New `docs/VERIFIED_SERVICE_REVIEWS.md` (this document)

No dependencies were added. Bookmarks, date/time picker values, PimpPilot, sign-in,
simulated payment logic and transactional email integration remain intact.

## Verification evidence

- Backend/domain/comparison regression run: **177 passed, 0 failed** across
  service reviews, marketplace, posts, request policies and quote recommendations.
- Frontend reviews/bookings/comparison/admin checks: **59 passed, 0 failed**.
  Includes mobile Android and web-width fixtures, dark/light themes, disabled
  text before rating, yellow stars and touch targets, cancellation, validation,
  failure/retry, duplicate-tap lock, submitted-review view, account change,
  public history and moderation controls/navigation.
- Existing bookmarks, Discover and workshop-feed preservation checks:
  **22 passed, 0 failed**. Appointment picker interactions are also exercised by
  the booking UI regression run above; picker implementation was unchanged.
- Local Auth + Firestore emulator integration/security run: **21 passed, 0 failed**.
  Includes four new real Firebase service-review journey/security tests and 17
  access-rule/infrastructure checks. All users and records were synthetic local
  emulator fixtures. No production customer data was accessed.
- `npm run build:web`: **passed**, including its mocked-transport production
  verifier. Bundle `AppEntry-80d3abf38883538bca9c51da5a00cfec.js`; SHA-256
  `1a48910b110b5e970835ac493a0d0cb08340d82dc5dc3c12529b90de971ab2d9`.
- Expo Android export/Hermes compilation: **passed**; bundle
  `AppEntry-ba57251d29023e1d21fdd8a61dc713ba.hbc` (approximately 5 MB).
- Web form/history component previews: local static React Native Web renders
  with injected synthetic state at 320px and 1440px in both themes. Chrome
  screenshots and measurements are under `.local-checks/service-reviews/`.
  All eight width/theme/form-history combinations fit within their content width;
  interactive star targets measure at least 44px. Mobile dark form and desktop
  light history screenshots were visually inspected. These previews inject state
  into the actual components and do not make API requests.
- `git diff --check`: passed. Full application suites were not rerun.

The initial regression failures were outdated directory DTO/admin route-count
expectations and a button mock integration; these were corrected and affected
checks rerun. The native device runtime, signed-in browser flow and production
indexes have not been verified. Android export is a bundle check, not a Gradle APK
or physical-device test. The in-app browser was unavailable; Chrome previews do
not replace signed-in end-to-end UI/device checks.

## Screenshot checklist and release handoff

Static synthetic form/history previews are local evidence only. Capture the
following from a local emulator-backed signed-in app for the final presentation:

1. Customer completed Booking Details showing Rate & Review and an unpaid balance.
2. Review form before rating (disabled text), after four yellow stars, and a
   validation error; include 320px mobile and desktop in dark/light themes.
3. Submission success followed by View Your Review, with repeated submission absent.
4. Workshop unread review notification and its read-only Booking Details destination.
5. Workshop profile with average, actual verified count, review date/category and
   pagination; also an unrated workshop.
6. Quotation comparison showing actual average/count, adjusted confidence and
   unrated treatment without a mechanical-quality certification claim.
7. Admin hide/restore with reason and corresponding audit/totals; no workshop edit
   controls.

Release order (user-managed):

1. Review and deploy Firestore indexes/rules; wait for both new indexes to be ready.
2. Deploy the backend review API and comparison changes.
3. Deploy the frontend screens, navigation and shared controls.
4. Use synthetic local/staging data for a signed-in web/Android smoke test before
   enabling the final production presentation. Confirm notification unread counts,
   review visibility and quotation changes. Never seed production customer data
   for development testing.

Ready for code review and local presentation following the successful automated
checks/builds. Deployment readiness still requires the device smoke test and
index readiness checks. There is no new configuration secret, dependency or
production-data migration. Roll back UI/backend code if needed without deleting
reviews or resetting rating totals. Nothing was committed, pushed or deployed.

### Reproducible verification commands

Run from the repository root. Commands below operate on local code and emulator
fixtures; do not substitute production project IDs or production customer records.

```powershell
node --test --test-concurrency=2 backend/test/service-reviews.test.cjs backend/test/marketplace.test.cjs backend/test/posts.test.cjs backend/test/request-policy.test.cjs tests/quote-recommendations.test.cjs
node --test --test-concurrency=2 tests/service-reviews-ui.test.cjs tests/bookings-ui.test.cjs tests/quote-comparison.test.cjs tests/admin-api.test.cjs tests/admin-dashboard.test.cjs
node --test --test-concurrency=2 tests/bookmarks.test.cjs tests/customer-discover-feed.test.cjs tests/workshop-feed.test.cjs
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only auth,firestore --project demo-pmr-security "node --test --test-concurrency=1 backend/test/service-reviews-integration.test.cjs tests/rules/access.test.cjs"
npm.cmd run build:web
node node_modules/expo/bin/cli export --platform android --output-dir .local-checks/service-reviews/android --max-workers 2
git diff --check
```
