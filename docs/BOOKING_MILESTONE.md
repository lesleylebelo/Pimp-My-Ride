# Quote comparison, acceptance and booking

The user approved the original booking milestone on 23 September 2026. It extends the locally
implemented garage, request and quotation workflow. Work started from the user's
`5ecef81` commit with a clean inner-repository working tree. Codex has not committed,
pushed, deployed, changed live configuration or written production test records.

## Current mock-payment extension

The original acceptance-only flow below has been extended with the
test-only payment selection described in
[MOCK_PAYMENT_SIMULATION.md](./MOCK_PAYMENT_SIMULATION.md). No real payment
provider, live credential, charge, payout, external email delivery, or card/bank
data collection is implemented.

When submitting a quotation, the shop may set a deposit as a whole percentage
from 1–99% or a fixed ZAR amount. The server validates that the calculated
integer-cent deposit is positive and less than the total. Percentage rounding is
half-up to the nearest cent. Deposit type, specified value and calculated
amount are stored on the quotation and copied immutably into the accepted
booking. Legacy quotations without deposit metadata remain no-deposit offers.

After comparison, the customer chooses `pay_now` (Pay in Full),
`pay_deposit` (only when the selected quote has a valid deposit), or
`pay_in_store`. The backend derives the amount exclusively from the selected
quotation and booking. The initial booking stores the accepted total,
`paidCents: 0`, and `balanceDueCents` equal to the total. `pay_in_store` is
explicitly confirmed and begins as unpaid (`due`); only the assigned shop can
record a simulated in-store payment. Online attempts remain pending until their
current attempt ID receives a mock `successful`, `failed`, `cancelled`, or
`pending` result. Payment success is not appointment confirmation or service
completion.

After a successful deposit, the customer may start a further simulated payment
for the server-calculated outstanding balance. The assigned shop may instead
record that remaining balance as an in-store test payment when no online attempt
is pending. Failed/cancelled online attempts can be retried only as new attempt
records. A result must reference the booking's current pending attempt; stale or
resolved attempt results are rejected. Transactional balance checks prevent
overpayment and double-counting.

Booking statuses remain separate from `paymentStatus` and `serviceStatus`.
Online payment success moves the booking to `pending_confirmation`; the shop
still sets the future appointment. `bookingComplete` separately marks service
completion. A late success after a cancelled booking leaves it cancelled and
sets `paymentReconciliationStatus: refund_review_required`; no refund is
processed by this academic simulation.
If a booking is cancelled after a simulated amount has already been paid, the
recorded amount and attempt history remain unchanged and
`paymentReconciliationStatus: refund_review_required` is set. Cancellation
blocks further settlement; the system does not issue or simulate refunds.

The mock provider and email sink are documented in
[MOCK_PAYMENT_SIMULATION.md](./MOCK_PAYMENT_SIMULATION.md). Test notifications,
outbox items, and receipts are labelled as simulated; email events are queued
only in a non-delivering `test_sink_only` store.

Quotations record both the request record revision and the material-terms
revision they price. Unchanged saves do not advance either revision. A genuine
non-material edit advances only the optimistic record revision; a material edit
advances both. Material terms include vehicle identity and displayed vehicle
details, category, request title/description, city, budget, attached photos and
the request audience/target. The preferred service date is a scheduling
preference, not a priced scope term; the shop confirms an appointment separately.
Outdated quotes cannot be accepted. A shop may submit a replacement against the
current material revision; each quotation remains a separate history record.
Withdrawal is terminal for the shop/request pair: a withdrawn quotation remains
in history and cannot be resubmitted or replaced. A shop cannot submit another
quotation for that request after withdrawal.

Legacy offers with an explicit `requestVersion` remain eligible only when it
matches the request's material revision (or, for a pre-migration request, its
record version). A legacy quote without revision metadata is treated as stale:
the backend rejects acceptance and the shop must submit a replacement. Missing
metadata is never inferred to mean “current.” No historical Firestore records
are migrated or modified to apply this policy.

## Implemented behavior

| Role | Workflow |
| --- | --- |
| Active verified owner | Open a request, compare private offers, choose Pay in Full, Pay Deposit where available, or confirmed Pay In-Store, settle an outstanding balance through the mock flow, view bookings and cancel with a reason |
| Active verified approved shop | Open a booking, set a future appointment in SAST, confirm it, record the remaining simulated in-store balance, mark service completion, view history and cancel with a reason |
| Admin | Existing account and approval controls determine eligibility; this milestone does not add access to private bookings or new admin booking tools |

Comparison presents scope, individual amounts, total, completion estimate,
warranty and validity. Offers are paginated at 20; selection belongs to the
current page and clears on refresh, paging, account/request changes or offline
state. Expired and withdrawn offers cannot be selected. The backend checks the
current offer and eligibility regardless of what the screen previously showed.

Acceptance with a confirmed payment choice creates the booking, changes the selected
quote to `accepted` and the request to `booked`. The booking identifier is the
service-request identifier, so competing acceptances cannot create two bookings
for one request. Pay In-Store begins with booking `pending_confirmation` and
payment `due`; Pay in Full and Pay Deposit begin with booking `pending_payment`
and payment `pending`. A successful deposit moves the booking to
`pending_confirmation` and payment to `partially_paid`; a successful full or
balance payment sets payment to `paid`. The selected shop may confirm an
appointment after the first required online payment succeeds, even when a
balance remains. It confirms by entering `YYYY-MM-DD` and a
24-hour `HH:mm` appointment in SAST (UTC+02:00). The server stores both the typed
date/time and an absolute Firestore timestamp. The appointment must be strictly
in the future when written. There is no device-timezone conversion of the input.

Either eligible participant can cancel a pending-payment, pending-confirmation,
or confirmed booking with a
trimmed reason of 1–500 characters. Cancellation is terminal. The request remains
`booked` and its quote remains `accepted` as historical records; a new request
is required for new work. Other submitted offers remain in quotation history,
but cannot be accepted once the request is booked. Accepted offers cannot be
withdrawn. Confirmation cannot revive cancellation or change an existing
appointment. Rescheduling and customer counter-proposals are not implemented.

## API, data and authorization

All calls use the existing authenticated `POST /api/marketplace` endpoint.

| Operation | Input besides `op` | Result |
| --- | --- | --- |
| `quoteSubmit` | `serviceRequestId`, `termsVersion`, scope/items, validity terms, optional `depositType` / `depositValue`, `requestId` (retry key) | `{id}` (new quotation history record) |
| `quoteAccept` | `id` (quotation), `paymentMethod` (`pay_now` / `pay_deposit` / `pay_in_store`), `requestId` (retry key) | `{id,paymentAttemptId}` (booking and initial test attempt) |
| `bookings` | optional `cursor` | `{items,cursor}` |
| `booking` | `id` (booking), optional `paymentCursor` | `{booking,paymentAttempts,testEmailEvents}` |
| `notifications` | optional `cursor` | `{items,cursor}` (recipient only) |
| `paymentMockResult` | `id` (booking), `paymentAttemptId`, `outcome` (`successful` / `failed` / `cancelled` / `pending`) | attempt-bound simulated result |
| `paymentRetry` | `id` (booking) | new pending attempt for the previous failed/cancelled amount |
| `paymentStart` | `id` (booking) | new pending attempt for the server-calculated balance |
| `paymentRecordInStore` | `id`, `method` (`simulated_cash` / `simulated_card` / `simulated_eft`) | records the remaining amount as a simulated payment |
| `bookingConfirm` | `id`, `appointmentDate`, `appointmentTime`, `requestId` | `{id}` |
| `bookingCancel` | `id`, `reason`, `requestId` | `{id}` |
| `bookingComplete` | `id`, `requestId` | `{id,serviceStatus}` |

The `bookings` collection stores participant/request/quotation identifiers and
snapshots of the accepted scope, line items, total, currency, deposit type/value/
amount, warranty, completion
estimate, shop name, request title, city, category and vehicle summary. Later
vehicle/category edits or archival do not alter these terms or stop confirmation
of an existing booking. No registration, contact details, document paths or
signed URLs are copied into the booking snapshot. Shop responses omit owner and
vehicle identifiers. Competing shops cannot read booking details or see the
selected quotation/booking identifiers through request detail.

Payment attempts are stored under each booking, with unique attempt IDs,
simulated/test flags, individual references and server-derived amounts. The
booking's `paidCents` is cumulative and `balanceDueCents` is always the total
minus successfully simulated payments; legacy bookings without accounting
fields are read conservatively as fully paid only when their status is `paid`,
otherwise unpaid. Unknown/contradictory accounting data fails closed. Receipts
are written for each successful attempt. Email outbox
records never send externally; participant-visible events explicitly say they
were queued in the test sink only.

Every operation retains current token/revocation, enabled/verified Auth and trusted
profile checks. Owners can accept only their own open requests. Acceptance also
checks the quote's audience, current shop approval, both Auth accounts and active
vehicle/category inside the transaction workflow. Confirmation rechecks both
participants' current eligibility. An eligible participant can cancel even if
the counterpart is now restricted. A suspended/unverified/unapproved actor cannot
use cached state to bypass the existing marketplace gates.

Transactions write the booking transition, related request/quote state where
applicable, audit event and retry receipt atomically. Deadline checks run again
after external Auth reads, immediately before writes. Auth is a separate service:
its check cannot be made atomic with a Firestore commit. Profile restrictions
participate in Firestore transaction conflict detection; no cross-service
atomicity or exact commit-time expiry guarantee is claimed.

Retries of the same actor/operation/key/payload return the saved result, even if
a validity/appointment deadline later passes. Changed data with the same key is
rejected. Accepting the same previously selected offer with a new key also returns
its existing booking, including a cancelled booking, without reopening it or
adding another acceptance audit. A different quote cannot replace it.

The client preserves at most 50 unresolved retry identities in memory. Restart,
account switching and eviction lose those keys. Refresh before repeating an
uncertain action; confirmation/cancellation with a new key does not silently
reapply a completed transition. Reads refresh on focus/reconnection. Booking
records and drafts are not saved to AsyncStorage and require connectivity.
Successful confirmation/cancellation remains visible if its following refresh
fails; old-account mutation responses cannot update a new account's screen.

Direct Firestore client access to bookings remains denied, including admins.
Participant equality plus document-ID pagination uses the standard single-field
indexes; no new composite index or rule exception is introduced. The earlier
vehicle/request indexes remain prerequisites for the full marketplace journey.

## Code and design

- `src/features/marketplace/screens/QuoteComparisonScreen.js`,
  `PaymentChoiceScreen.js`: comparison and explicit payment-method choice.
- `screens/BookingScreens.js`, `utils/bookingValidation.js`: shared participant
  booking list/detail, appointment validation and cancellation.
- `OwnerNavigator.js`, `ShopNavigator.js`, `components/MarketplaceUI.js`,
  `services/marketApi.js`: routes, active booking tabs and mutation retry keys.
- Existing owner request and shop quote screens link into the new journey.
- `backend/marketplace.cjs`, `booking-domain.cjs`, `payment-provider.cjs`:
  authorization, quote revision checks, mock payment transitions, receipts,
  test-only notifications/email outbox and booking state transitions.

Figma MCP context and screenshots were inspected for `28:31` Compare & Select,
`132:39` Confirm Booking, `145:45` Booking Details and `177:52`/`177:53` shop
bookings. The implementation reuses the existing green/grey/white Inter-based
components. Prototype example appointments, ratings, shop logos and vehicle
photos are dynamic sample data, not evidence of real records. The approved flow
has the shop set an appointment after acceptance, replacing the prototype's
prefilled appointment. No visual redesign or Figma write was performed.

## Verification and limits

Tests cover actual component selection/confirmation/cancel callbacks, duplicate
taps, loading/error/offline states, paging, account changes, failed drafts,
late responses, retry identity and deadline boundaries. Backend tests cover
permissions, immutable snapshots, terminal states and lost acknowledgements.
Auth/Firestore emulator tests exercise authenticated HTTP acceptance through
confirmation/cancellation and real transaction contention for competing offers,
same-offer retries, withdrawal/closure, confirmation/cancellation and competing
cancellations. Rules tests include direct booking access denial.

See PROJECT_HANDOVER.md for the final commands and observed results. The browser
connection reported `Browser is not available: iab`; browser/device interaction
and visual fidelity have not been verified. Component mocks and a web bundle do
not replace that check. Node 22 and live configuration also require validation
before release. Supabase key rotation remains unconfirmed from the earlier work.

This slice does not implement capacity calendars or overlapping appointment
prevention, automatic reminders, notifications, chat, photos, payments, progress
tracking, completion or reviews. A shop's entered appointment is not proof of
resource availability. All statuses remain explicit participant actions; no paid
scheduler or background expiry worker is added.

## Review and release

Review backend and client together. After separate release authorization, verify
the existing rules/indexes, release the backend supporting these operations,
then the client. No migration or production seed step is needed: existing open
requests and submitted quotations can enter this flow when still eligible.
Use synthetic accounts/data in an isolated environment for browser/native smoke
tests, including two-session conflicts and lost-response recovery.

Suggested commit: `feat: compare quotations and manage workshop bookings`.
Next proposed milestone: vehicle/request photos, followed by job progress and
completed-work reviews. Those features have not been started here.
