# Quote comparison, acceptance and booking

The user approved this milestone on 23 September 2026. It extends the locally
implemented garage, request and quotation workflow. Work started from the user's
`5ecef81` commit with a clean inner-repository working tree. Codex has not committed,
pushed, deployed, changed live configuration or written production test records.

## Implemented behavior

| Role | Workflow |
| --- | --- |
| Active verified owner | Open a request, compare private offers, select an available quotation, confirm acceptance, view bookings and cancel with a reason |
| Active verified approved shop | Open a booking from an accepted quotation or Bookings tab, set a future appointment in SAST, confirm it, view history and cancel with a reason |
| Admin | Existing account and approval controls determine eligibility; this milestone does not add access to private bookings or new admin booking tools |

Comparison presents scope, individual amounts, total, completion estimate,
warranty and validity. Offers are paginated at 20; selection belongs to the
current page and clears on refresh, paging, account/request changes or offline
state. Expired and withdrawn offers cannot be selected. The backend checks the
current offer and eligibility regardless of what the screen previously showed.

Acceptance creates a booking in `pending_confirmation`, changes the selected
quote to `accepted` and the request to `booked`. The booking identifier is the
service-request identifier, so competing acceptances cannot create two bookings
for one request. The selected shop confirms by entering `YYYY-MM-DD` and a
24-hour `HH:mm` appointment in SAST (UTC+02:00). The server stores both the typed
date/time and an absolute Firestore timestamp. The appointment must be strictly
in the future when written. There is no device-timezone conversion of the input.

Either eligible participant can cancel a pending or confirmed booking with a
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
| `quoteAccept` | `id` (quotation), `requestId` (retry key) | `{id}` (booking) |
| `bookings` | optional `cursor` | `{items,cursor}` |
| `booking` | `id` (booking) | `{booking}` |
| `bookingConfirm` | `id`, `appointmentDate`, `appointmentTime`, `requestId` | `{id}` |
| `bookingCancel` | `id`, `reason`, `requestId` | `{id}` |

The `bookings` collection stores participant/request/quotation identifiers and
snapshots of the accepted scope, line items, total, currency, warranty, completion
estimate, shop name, request title, city, category and vehicle summary. Later
vehicle/category edits or archival do not alter these terms or stop confirmation
of an existing booking. No registration, contact details, document paths or
signed URLs are copied into the booking snapshot. Shop responses omit owner and
vehicle identifiers. Competing shops cannot read booking details or see the
selected quotation/booking identifiers through request detail.

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

- `src/features/marketplace/screens/QuoteComparisonScreen.js`: comparison,
  selection and acceptance confirmation.
- `screens/BookingScreens.js`, `utils/bookingValidation.js`: shared participant
  booking list/detail, appointment validation and cancellation.
- `OwnerNavigator.js`, `ShopNavigator.js`, `components/MarketplaceUI.js`,
  `services/marketApi.js`: routes, active booking tabs and mutation retry keys.
- Existing owner request and shop quote screens link into the new journey.
- `backend/marketplace.cjs`, `booking-domain.cjs`: authorization, validation,
  transactional transitions, participant paging and redaction.

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
