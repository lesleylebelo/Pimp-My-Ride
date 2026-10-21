# Phase 3: simulated receipts, test outbox and notifications

Implemented only in `feature/mock-payments`. No external payment/email provider,
deployment or cloud-data migration is part of this change. Independent review
and physical-device acceptance remain required before integration.

## Receipt model and historical policy

Successful online payments and authorised in-store test recordings atomically
create `paymentReceipts/{paymentAttemptId}` alongside their accounting update.
`tx.create`, the existing mutation retry receipt, and payment-attempt validation
prevent overwrites or duplicate financial receipts. No receipt is issued for
pending, failed or cancelled payment outcomes. Cancellation retains issued
receipts and the existing reconciliation policy.

Schema version 2 stores `receiptReference` (`TEST-{attemptId}`), `bookingId`,
`paymentAttemptId`, `quoteId`, customer/shop ID and display-name snapshots,
service title, quotation scope and line items, `issuedAt` (server commit time),
`method`, individual `amountCents`, `currency: ZAR`, accepted `totalCents`,
`paidCentsAfter`, `balanceDueCentsAfter`, simulation flags and the notice
**SIMULATED / TEST — NOT REAL PAYMENT**. Financial values come from the accepted
booking and validated payment attempt, never client-supplied receipt amounts.
Customer display names use the existing contact-stripping projection. Receipts
contain participant identifiers, without copying profile email, phone or address.

The after-payment snapshots are captured in the payment transaction. A deposit
receipt keeps its original outstanding balance even after settlement, service
completion or cancellation. Existing payment choices are unchanged: the normal
multi-payment journey is deposit followed by the remaining balance; arbitrary
additional instalment choices have not been introduced.

Legacy receipts with no schema version retain their known individual amount,
references and issuance timestamp. Missing total, method, cumulative paid and
historical balance are returned as `null` with
`historicalSnapshotUnavailable: true` and an explicit compatibility explanation.
Their identities fall back to booking participant IDs and generic names.
Neither backend nor UI reconstructs financial history from today's booking.
Malformed versioned snapshots fail closed. No historical backfill is performed.

`marketplace` operation `receipt`, input `{id: paymentAttemptId}`, loads the
receipt's booking and permits only its current authenticated owner or selected
shop. Active-role and revoked-token checks remain in the common backend path.
The response projects receipt fields rather than returning arbitrary stored
metadata. There is no receipt editing API. Firestore's existing default-deny
rules prohibit direct client reads and create/update/delete, including admins.
Privileged administrative database access remains outside this application
immutability guarantee.

Both navigators register `ReceiptDetail`. Booking payment history exposes
**View simulated receipt** only for issued receipts. The screen fetches by ID,
shows the simulation notice, identities, accepted service terms, SAST issuance
time, method, individual amount and historical accounting snapshots. It links
back to the booking and handles loading, offline and retrieval failures. Account
or receipt changes remount the screen to discard stale state.

## Test email outbox

`emailOutbox` is a database test sink. There is no worker, SMTP configuration,
provider integration, email address resolution or external transport. Each
record has `recipientUid`, booking/event references, `[SIMULATED / TEST]`
subject, body, `transport: test_outbox`, `deliveryStatus: test_sink_only`, and
`deliveryDescription: Recorded in test outbox. No email sent.`

Records are created for booking creation, successful online/in-store payments,
appointment confirmation, booking cancellation and service completion, for
each relevant participant. Successful payment bodies include the authoritative
individual amount; appointment bodies include the confirmed SAST date/time.
Booking-created messages explicitly say appointment confirmation is pending.
All bodies include the simulation notice. Failed/pending/cancelled payment
attempts produce in-app updates rather than success-confirmation emails.

The existing booking detail response filters outbox records by the authenticated
participant and displays them as recorded, with no email sent. Records share
the business transaction: failed transaction attempts do not commit messages,
and stable-key mutation replays do not execute message creation again. No
delivery is claimed. No test-recipient email addresses or production credentials
are added. A future external sandbox transport requires separate approval and
a server-controlled recipient-address allowlist before it can send anything.

## Notifications and permissions

Notifications are written by the backend in the transaction that commits the
related state change. Open requests remain discoverable through the existing
job feed; there is no mass fan-out or disclosure to every shop.

| Event | Recipients | Target |
| --- | --- | --- |
| New directly addressed request | Selected approved shop | Request |
| Initial quotation / renewed or replaced quotation | Request owner | Request's quotation comparison |
| Quotation accepted | Owner and selected shop | Booking |
| Booking created | Owner and selected shop | Booking |
| Online payment successful | Owner and selected shop | Issued receipt |
| Online payment failed/cancelled/still pending | Owner and selected shop | Booking/payment detail |
| In-store test payment received/recorded | Owner and selected shop | Issued receipt |
| Appointment confirmed, booking cancelled, service completed | Owner and selected shop | Booking |

Records store `recipientUid`, event, human-readable title/body, semantic target,
creation timestamp, simulation flags and initially `readAt: null`. Frontend
targets map only to registered booking, receipt, request and quotation screens;
unknown targets and malformed IDs are ignored. Old booking notifications retain
a fallback link via their booking ID and readable event text.

`notifications` queries only `recipientUid == authenticated UID`, orders by
`createdAt DESC, document ID DESC`, and returns 20 records plus an optional
cursor. The cursor is an owned document ID, loaded and checked before applying
the document snapshot as the Firestore cursor. This retains full timestamp
precision and deterministic ordering for equal timestamps. Foreign/missing
cursors fail. Existing notifications already have server creation timestamps;
no history is deleted or rewritten.

`notificationRead` is an authenticated, stable-key mutation accepting only the
notification ID. It transactionally checks recipient ownership and active role,
then sets the server timestamp only if unread. Replays and subsequent read
requests preserve the first read timestamp. There is no public/direct client
write permission or arbitrary notification creation/update API.

Both roles reach **Notification history** from Bookings, even with no bookings.
The screen retains older loaded pages, loads more explicitly, supports refresh,
read controls, errors/retries, empty/loading/offline states, and related-record
navigation. New first-page arrivals are placed above retained history. State and
in-flight read updates are isolated across account changes. Opening a related
record and marking it read are separate explicit controls.

## Compatibility and deployment preparation

The change adds fields and API operations; older clients keep their existing
booking/payment response fields. No data migration, dependency installation,
email secrets, storage changes or Firestore rule changes are required. The
notification composite index is added to `firestore.indexes.json`. Before any
approved release, publish that index and wait for readiness, then deploy backend
before the client that calls the new operations. Emulator success does not prove
that a remote composite index exists. Nothing has been deployed by this task.

Preserved policies: server-priced quotations/deposits, exact payment-attempt
confirmation context, accounting constraints, payment/booking/service separation,
confirmed appointments after settlement, cancellation and reconciliation,
legacy bookings, terminal withdrawal and expired-offer renewal, mock-only
backend gate, and PMR-02 media retention. Rolling back the Phase 3 backend leaves
new receipts readable only when this retrieval API is restored; do not delete
them or recompute their history.

## Verification

Tests use the prepared local Node 22.23.3 runtime and existing dependencies.
Actual Firebase Auth and Firestore tests use loopback emulators and the demo
project `demo-pmr-security`. The runner rejects nonlocal emulator targets.
No production database, payment provider or email service is used.

Test logs are retained in ignored `.local-checks/phase3-*.log`. Regression tests
cover receipt snapshots across deposit and settlement, receipt permissions and
retention, unsuccessful outcomes, legacy compatibility, notification ownership,
read state, timestamp ties and pagination, semantic targets, replay-safe messages,
test-outbox contents, direct Firestore write denial, UI states and account-change
isolation. Firestore tests exercise concurrent same-key payment and read replays
against the real local emulator, in addition to the existing transaction races.

Final results with Node 22.23.3:

| Suite | Result |
| --- | --- |
| Focused feature and PMR-02/PMR-03 regressions | 163/163 passed |
| Full backend | 204/204 passed |
| Full application | 255/259 passed; four existing baseline failures |
| Actual Auth/Firestore emulator matrix | 63/63 passed |

Emulator breakdown: rules 12, backend integration 17, marketplace integration
27, photo integration 7. The CLI exited successfully and stopped its emulators.
`git diff --check` passes. No dependencies or emulator binaries were installed.
UI evidence comes from React component/navigation-handler tests, not an Expo
session or physical-device walkthrough. A customer/shop demonstration on devices
remains necessary after independent code review. Test email delivery beyond the
database sink is intentionally unavailable.

Known unrelated application baseline failures: garage vehicle-scroll append;
picker cancellation/invalid file upload state; guest password-recovery navigation;
unverified-user navigation. Do not weaken those tests as part of Phase 3.

## Phase 3 files changed

These are the files touched for Phase 3; other existing worktree modifications
belong to the earlier corrections and have been preserved.

- `backend/marketplace.cjs`
- `backend/marketplace-communications.cjs` (new)
- `backend/test/marketplace.test.cjs`
- `backend/test/marketplace-integration.test.cjs`
- `firestore.indexes.json`
- `src/features/marketplace/OwnerNavigator.js`
- `src/features/marketplace/ShopNavigator.js`
- `src/features/marketplace/components/MarketplaceUI.js`
- `src/features/marketplace/screens/BookingScreens.js`
- `src/features/marketplace/screens/CommunicationScreens.js` (new)
- `src/features/marketplace/services/marketApi.js`
- `tests/marketplace-bookings.test.cjs`
- `tests/marketplace-communications.test.cjs` (new)
- `tests/rules/access.test.cjs`
- `docs/PHASE3_COMMUNICATIONS.md` (new)

Final verdict: **PASS WITH CONDITIONS** for local Phase 3 implementation.
Conditions are independent review, physical-device/customer-shop acceptance,
and notification-index readiness before any separately approved deployment.
There is no approval or implementation of live email/payment delivery.
