# Booking UI journey redesign

## Inspected journey before visual changes

The original repository is on `lesley`; the earlier Notifications, Messaging,
Garage and Quotations improvements are present. The working tree was clean when
this task started (baseline commit `8b2ba3f`).

- Customer: quotation comparison selects an eligible offer → existing
  PaymentChoice → existing explicit confirmation creates/resumes a booking →
  BookingDetail. Booking creation is not a separate API/screen. The Bookings tab
  lists records and opens BookingDetail by ID.
- Shop: Bookings lists incoming/history records → BookingDetail. A shop can set
  a future SAST appointment only in `pending_confirmation` using `bookingConfirm`.
- Booking states displayed by the existing screen are `pending_payment`,
  `pending_confirmation`, `confirmed` and `cancelled`.
- Service completion is a separate `serviceStatus: completed`, not a completed
  booking state. The existing `bookingComplete` operation is shop-only and applies
  to confirmed, unfinished services.
- Both roles may cancel in the existing pending/confirmed states with a required
  reason and an existing confirmation. There is no reschedule/calendar API.
- Booking details contain the accepted quotation snapshot, deposit, payment
  status/balances, existing test-payment/history controls, attached request photos
  and the existing permission-checked ConversationAction.
- PaymentChoice already contains simulated-payment behavior. This task preserves
  its handlers, deposit calculations and booking navigation; it implements no new
  payment or receipt processing.

This inspection was recorded before implementation. Verification uses mocked
APIs and local exports, with no production mutations.

## Journey after the redesign

Customer and shop routes and API operations remain the same. PaymentChoice now
uses the existing quotation-style page foundation with a choose/review/open
progress indicator and supplied vehicle/request context. Its original payment
handlers, calculations, confirmation labels and booking navigation are retained.

The Bookings tab now presents responsive, readable cards with status first,
vehicle/service context, authorised workshop/customer name, appointment details
when supplied, accepted total, payment-choice context and View booking. Opening
the list never mutates a booking or payment record.

BookingDetail now groups the journey as:

1. Backend booking status and separate service-completion progress.
2. Vehicle, service and role-appropriate counterpart details.
3. Appointment information, including explicit missing/incomplete states.
4. Accepted total/deposit, recorded payment status, paid amount and balance.
5. Full accepted quotation snapshot and supported appointment/completion actions.
6. Existing payment/history controls, attached photos, cancellation and refresh.

Related-request navigation uses the original request ID. Contextual messaging
continues through the unchanged ConversationAction and its server permissions.
Notification routes and accepted-quotation handoff are unchanged.

## Customer improvements

- Modern single-column mobile / two-column desktop booking cards, long-name
  wrapping and supplied appointment information.
- Clear confirmation versus payment status: a confirmed appointment or completed
  service does not imply paid status.
- Better empty, loading, refreshing, error and offline states; pull-to-refresh
  uses the existing refresh function and cursor pagination is preserved.
- Accepted scope, items, deposit and financial summary remain readable and retain
  the original amount helpers. Optional names, dates and turnaround data stay
  unrecorded/unspecified rather than looking confirmed.

## Shop improvements

- Authorised customer display name and vehicle context in incoming/history cards.
- Existing future SAST date/time fields, validation and a confirmation showing
  the entered appointment before the original bookingConfirm call.
- A distinct, confirmed service-completion action using the existing bookingComplete
  operation. Success appears only after backend acknowledgement, separately from
  booking and payment status.
- Cancellation keeps its original role/state guards, reason and confirmation.
- Failed reads disable stale mutation controls while Refresh remains available.
- Server-acknowledged confirmation/completion is retained if a subsequent refresh
  fails or returns an older status; later authoritative cancellation supersedes it.

## Files changed

- `src/features/marketplace/components/BookingUI.js`: booking presentation, labels,
  overview, appointments, progress, handoff context and scoped styles.
- `src/features/marketplace/screens/BookingScreens.js`: list/detail presentation,
  appointment/completion confirmations and acknowledgement display protection.
- `src/features/marketplace/screens/PaymentChoiceScreen.js`: presentation and
  existing confirmation palette only; handlers/calculations remain unchanged.
- `src/features/marketplace/components/QuotationUI.js`: optional active-tab and
  refresh-control props, used by bookings. Prior default behavior is preserved.
- `tests/bookings-ui.test.cjs`: 12 focused UI checks.
- `tests/marketplace-bookings.test.cjs`: tests traverse the new confirmations and
  locate the new scroll container.
- `tests/mock-payment-choice.test.cjs`: presentation harness supplies existing tab
  metadata; payment contract expectations are unchanged.
- `docs/BOOKINGS_UI_REDESIGN.md`.

## Payment boundary and safeguards

The original payment-action handlers in BookingScreens, confirm/recover handlers
in PaymentChoice, deposit/amount-now/remaining calculations and booking paid/balance
helpers were compared with a pre-edit local baseline and matched exactly after
line-ending normalization. No new payment operations or receipt generation were
implemented. Existing test-payment controls and issued-receipt links remain for
compatibility; this task did not exercise them against production services.

No backend, Firestore schema, service API, storage transport, auth integration,
notification or messaging source was modified. Previous Garage, Quotations,
Messaging and Notifications presentation remains intact. No new booking state,
calendar picker, rescheduling action, provider or dependency was introduced.

Existing confirmation/cancellation/completion payloads, locks, account/booking
draft reset, stale-response suppression, photo access, test-history pagination,
booking permissions and financial values are preserved. Completion success text
now describes service completion rather than incorrectly calling it a payment.

## Verification

Use the existing local Node 22.23.3 runtime:

```powershell
$pmrNode = (Resolve-Path '.local-checks/pmr-tools/node22/node-v22.23.3-win-x64/node.exe').Path
& $pmrNode --test --test-concurrency=2 tests/*.test.cjs
& $pmrNode node_modules/expo/bin/cli export --platform all --max-workers 2 --output-dir .local-checks/bookings-export-final
```

The initial existing booking/payment-choice/comparison run passed 35/35 tests;
the new focused booking UI run passed 12/12. Coverage includes both roles,
supported statuses, exact ZAR/deposit presentation, confirmed-but-unpaid service,
appointment review/cancel/confirm, completion failure/acknowledgement, stale
refresh, request/chat context, missing dates, responsive cards, existing tabs,
loading/empty/error/offline/refresh states, theme contrast and keyboard/safe areas.
The complete suite additionally checks notification deep links, messaging rules,
quotation selection, payment-choice handoff and booking recovery.

Final application result: **436/436 tests passed under Node 22.23.3** with two
test workers. `git diff --check` passed. The first combined test/export attempt
was stopped because it slowed substantially under concurrent load; tests were
then completed with bounded concurrency before running exports separately.
Final Expo exports passed for **iOS, Android and Web** in
`.local-checks/bookings-export-final`, including native Hermes bytecode. The
installed Hermes compiler required execution outside the filesystem sandbox.
These are local artifacts only; nothing was published or deployed.

## Outstanding browser and physical-device checks

- Actual iOS/Android keyboard avoidance, SAST input behavior, confirmation dialogs,
  back gestures, safe areas and larger accessibility fonts.
- VoiceOver/TalkBack focus, status announcements and confirmation focus return.
- Browser layouts at narrow/desktop widths, keyboard-only navigation, dialog focus
  and long workshop/customer names.
- Real scroll smoothness and pagination with many booking/history records.
- Live scheduling/cancellation/completion only with separately authorised disposable
  test accounts. No production mutations were used for verification.

Native UI tests use stubs and exports verify bundling. They do not constitute a
physical-device or browser visual review. No commits, pushes, deployments,
branches, worktrees or new projects were created.
