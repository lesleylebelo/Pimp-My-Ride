# Academic mock payment simulation

## Safety boundary

This feature is a local application simulation only. It has no live gateway
integration and must never be used to collect actual card/bank details, charge
real money, or pay/transfer funds to shops. The customer UI and stored payment,
notification, outbox and receipt records identify activity as simulated/test
data. The test email sink records messages as `test_sink_only`; it does not send
email to any address.

The backend uses `backend/payment-provider.cjs` as the payment-provider
interface. `createMockPaymentProvider()` is the only implementation. Keep any
future provider implementation separate, and do not add live credentials or
real-payment behavior without separate explicit approval.

## Flow and authority

When submitting a quotation, a shop may require no deposit, an integer
percentage from 1–99%, or a fixed amount in ZAR. The backend stores
`depositType`, the specified `depositValue`, and the calculated
`depositAmountCents` on each quotation. Percentage deposits use integer cents
and round half-up to the nearest cent. The result must be positive and strictly
less than the quotation total. Replacement quotations keep their own terms;
the prior quotation is never overwritten.

After comparison, the customer may choose Pay in Full, Pay Deposit (only when a
valid deposit exists), or Pay In-Store. Pay In-Store requires explicit
confirmation and leaves the full total due. Older quotations without deposit
metadata are treated as no-deposit offers; no amount is inferred. The accepted
booking snapshots the selected quotation's deposit terms so later quote edits
cannot change the booking.

The backend calculates every amount from the saved quotation and booking. The
customer cannot supply a charge amount. A new booking stores
`totalCents`, `paidCents: 0`, and `balanceDueCents: totalCents`. A full-payment
attempt is for the total; a deposit attempt is for the stored deposit amount.
After a successful deposit, an owner may start a simulated payment for the
server-calculated remaining balance, or the assigned shop may record a
simulated in-store payment for that balance. Shops cannot record a balance
while an online attempt is pending. Amounts use integer cents throughout.

Every online result must identify the current `paymentAttemptId`. Stale or
resolved attempts are rejected; a failed/cancelled attempt is retried as a new
attempt with the prior server-stored amount. Attempts are immutable history
except for their own pending-to-result transition, and each successful attempt
has its own test receipt. Atomic booking balance updates prevent duplicate
results, concurrent settlement and overpayment from incrementing `paidCents`
twice.

The backend reads the selected quotation and accepts only its validated
`totalCents` and `currency`; payment operations reject client-supplied amounts.
Quote submission records the request version. The backend rejects acceptance
when the request has changed since that quote was submitted.

Payment, appointment confirmation, booking status, and service completion are
independent:

| Event | Booking status | Payment status | Balance |
| --- | --- | --- | --- |
| Pay In-Store selected | `pending_confirmation` | `due` | full total |
| Pay in Full / Pay Deposit selected | `pending_payment` | `pending` | full total until success |
| Failed/cancelled online result | `pending_payment` | `failed` / `cancelled` | unchanged |
| Successful deposit result | `pending_confirmation` | `partially_paid` | total less deposit |
| Successful full or balance payment | `pending_payment` becomes `pending_confirmation`; confirmed appointments stay confirmed | `paid` | zero |
| Shop confirms appointment | `confirmed` | unchanged | unchanged |
| Shop records service completion | `confirmed` | unchanged | unchanged |
| Booking cancelled after payment | `cancelled` | paid amount remains recorded | unchanged |
| Ordinary result after booking cancellation | rejected; `cancelled` remains terminal | unchanged | unchanged |

Cancellation rejects all ordinary payment results, new attempts and in-store settlements. Payment attempts and their audit history are retained unchanged. Previously successful amounts remain recorded and receive `refund_review_required`; no refund or adjustment is executed. A result committed before a concurrent cancellation remains historical payment data; a result losing that transaction race is rejected.

External-provider-style late results are outside this simulator: there is no trusted callback, automatic late capture or refund mechanism. Any future provider policy needs a separately authorised reconciliation workflow; ordinary customer simulation endpoints must not implement it.

Receipts are Firestore test records labeled
`SIMULATED_PAYMENT_RECEIPT` and are created per successful simulated online or
shop-recorded in-store attempt.

## Records and delivery behavior

- Booking payment attempts live under
  `bookings/{bookingId}/paymentAttempts/{attemptId}` and include the
  server-derived amount, currency, mock provider, attempt kind, state, and
  `simulated`/`testTransaction` flags. The booking records the accepted total,
  deposit snapshot, cumulative paid cents and outstanding cents.
- Simulated receipts use `paymentReceipts/{attemptId}` and are shown as test
  receipt references in booking details.
- In-app event records use `notifications` and are readable only through the
  authenticated marketplace API for the recipient.
- Email outbox records use `emailOutbox` with `deliveryStatus: test_sink_only`.
  They are visible to the booking participant as queued-but-not-delivered test
  events. No email service is invoked.
- Audit records capture state-changing actor/operation and mark simulations.

These records are created only by the authenticated backend. Direct Firestore
client writes remain denied by the existing rules. No card number, CVV, banking
password, or provider credential is accepted or stored.

## Verification

Focused tests:

```text
node --test backend/test/marketplace.test.cjs tests/quote-comparison.test.cjs tests/mock-payment-choice.test.cjs
```

The full application and backend test suites should also be run before review.
Firebase emulator integration tests require the repository's Auth and Firestore
emulators and are separate from the in-memory marketplace tests.

## Fail-closed local demo gate

All quotation acceptance (including Pay In-Store), mock results, retries, balance initiation and in-store recording require all of these server settings together:

```text
PMR_MOCK_PAYMENTS_ENABLED=true
NODE_ENV=development
FIREBASE_PROJECT_ID=demo-pmr-security
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

`NODE_ENV=test` is also supported. Both emulator addresses must be loopback hosts with valid ports. The actual Firestore client project must be `demo-pmr-security`; any Google project overrides must agree. Missing settings, production mode, real projects and remote hosts are rejected, including receipt-key retries. Tests explicitly inject a synthetic authorised configuration; application services default to the server environment. No client request can enable the gate. Do not set this flag in Render or any live deployment. This change does not set any cloud configuration or require production migrations. Reads, requests, quotation submission, appointment confirmation, cancellation and service completion keep their existing authorisation rules.

## Accounting and historical booking compatibility

Present financial fields must be safe integer cents, non-negative, within the quotation limit, and satisfy `paidCents + balanceDueCents === totalCents`. ZAR and a recognised status are required. Full payment requires `paid`; positive partial payment requires `partially_paid`; zero paid permits only unpaid/pending/failed/cancelled payment statuses. Unknown statuses, incomplete accounting pairs and malformed fields are rejected without repair.

Only when **both** accounting fields are absent does the legacy rule apply: `paid` means the full total, supported unpaid statuses (or an absent historical status) mean zero paid. A legacy partial status without amounts is rejected. No historical paid amount is inferred from an appointment or service status.

A confirmed historical booking may complete with `serviceStatus` absent only if `serviceCompletedAt` is also absent. Explicit null/unknown statuses and prior completion evidence fail closed. The selected active shop and confirmed-booking checks still apply; completion writes `completed` and its timestamp without changing payment or appointment data.

## Attempt history

Booking detail returns `currentPaymentAttempt` independently of the document-ID-paginated `paymentAttempts` and `paymentCursor`. Both queries are scoped beneath the authorised booking. The app keeps the current attempt actionable even outside the history page, accumulates history through Load more payment history, and resets the cursor/history when refreshed or when identity/booking changes. Current attempt status overrides its older history representation.

## Checkout resumption and confirmation contract

`quoteAccept` returns `existingBooking: false` only on a newly created booking, together with its initial `paymentAttemptId`, `amountCents`, `currency`, overall `paymentStatus` and individual `paymentAttemptStatus`. Any acceptance replay, including the same idempotency key after a lost acknowledgement or an older stored acceptance receipt, returns `existingBooking: true`, the durable booking `id`, and `paymentAttemptId: null`. It never exposes a newer current attempt as an initial checkout instruction. The client opens BookingDetail without submitting a simulated result. If acceptance or its result was interrupted, Check existing booking looks up the owned request and View existing booking opens an acknowledged booking.

Every `paymentMockResult` requires `paymentAttemptId`, `expectedBookingId`, `expectedAmountCents`, and `expectedCurrency` alongside its booking `id` and outcome. These fields confirm the displayed context; they never set the charge amount. Inside the transaction the server matches the context against the current attempt and immutable booking currency before deriving accounting from server records. Missing or mismatched context fails with a refresh-and-confirm error and no payment/receipt writes. Stale current-attempt IDs also fail. Existing successful-result idempotency receipts remain historical acknowledgements, never new settlements.

`paymentStart` and `paymentRetry` return overall `paymentStatus` (which remains `partially_paid` after a deposit), separate `paymentAttemptStatus: pending`, and the attempt amount/currency. Opening or retrying an attempt in BookingDetail no longer automatically resolves it: the customer reviews the loaded amount and chooses a fresh result. Existing pending attempts, even outside history pages, supply the exact confirmation context. The summary identifies the initial payment choice; individual history entries show actual online/in-store settlement methods. Shops see why in-store settlement is blocked while an online attempt is pending.

This is a deliberate simulator-client compatibility boundary: older clients omitting expected confirmation values are rejected safely and must refresh/update; no amounts are guessed for them. New clients receiving an older acceptance response without an explicit new-booking indicator resume in BookingDetail without automatically simulating payment. Other marketplace mutation replay contracts are unchanged.

## Expired quotation renewal

An authorised shop may renew its own expired submitted offer on an open request, even when the material terms revision is unchanged. Expiry must be a verifiable Firestore timestamp. The replacement is independently validated for price/deposit/validity, creates a distinct historical record, supersedes the old offer and updates the quotation head atomically. It does not change request revisions or inflate the current submitted-offer count. Concurrent renewals serialize: only the first new valid current offer commits; a duplicate retry with the same key returns that offer.

Accepted/booked offers, closed requests and withdrawn offers cannot be renewed. Withdrawal remains terminal. Explicit current request terms are still required, including for legacy expired offers; old offers cannot be accepted after renewal. Shop request/form screens expose renewal after expiry; customer comparison shows expired history as unavailable and asks for renewal. No production migration, new index or cloud configuration is required.
