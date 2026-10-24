# Safe mock payment journey

## Existing functionality traced

`PaymentChoiceScreen` accepts the selected quotation through `quoteAccept`. Fixed-ZAR and percentage deposits are validated and rounded once to integer cents by `marketplace-domain.cjs`; acceptance copies the authoritative quotation and request revision into one request-scoped booking. Full payment and deposit choices create a pending simulated attempt. Pay at workshop creates an unpaid booking and a due attempt, with no online result.

`BookingScreens` reads current attempts independently of paginated history. Customers resolve explicit mock outcomes, retry failed/cancelled attempts and open later balance attempts. Workshops may record the server-calculated outstanding balance as simulated cash/card/EFT when no online attempt is pending. Appointment confirmation and service completion are separate operations. Receipts are immutable test snapshots, restricted to participants. Notifications keep booking/receipt deep links; email records go only to the existing test sink. Contextual chat still uses existing enquiry/booking permissions.

This is implemented functionality, not a gateway placeholder. There is no card form, live checkout link, financial settlement, email delivery or provider integration. Real payment processing remains unsupported.

## Focused implementation (updated for the original hosted backend)

- Read-only authenticated `paymentSimulation` capability reports enabled/disabled simulation status on the configured backend; it never writes. UI fails closed while loading, on errors, and for missing/malformed capability responses.
- The mutation gate requires the single explicit `PMR_MOCK_PAYMENTS_ENABLED=true` flag and matching configured/SDK Firebase project. The original hosted `pimp-my-ride-a26fc` project is supported without emulators. The selected provider must also identify itself as simulated/mock before any payment-related operation.
- New bookings created through this already-gated path have `simulated`, `testTransaction` and `paymentProvider: 'mock'` labels. No existing records are migrated or reclassified.
- Checkout requires explicit outcome selection plus confirmation. A synchronous lock prevents same-frame duplicate acceptance. Account changes remount checkout, and late responses after unmount cannot continue simulation/navigation.
- Later customer results, balance attempts and workshop test recordings require confirmation with the amount/context. Visible demo notices distinguish mock amounts from revenue or proof of actual receipt. Disabled simulation does not disable appointment/service controls or existing-booking recovery.
- A confirmed result followed by a failed refresh is reported as confirmed with a refresh warning; the UI does not claim the simulation failed because a subsequent read failed.

## Integrity and persistence

The existing backend remains authoritative: integer-cent amounts, current lifecycle/ownership checks, quotation-head/request revision validation, accepted immutable terms, exact attempt/booking/amount/currency confirmation, account-scoped idempotency receipts and Firestore transactions. Concurrent attempts cannot double-apply a payment or overpay. Failed/cancelled/pending outcomes do not reduce the balance. Pay at workshop remains due until an explicit simulated recording. No production data or production configuration is changed.

Simulated records now persist in the original hosted Firestore when the flag is explicitly enabled. No separate infrastructure or activation marker is needed. Existing local emulator tooling is retained solely for automated tests/local development. See [HOSTED_MOCK_PAYMENTS.md](HOSTED_MOCK_PAYMENTS.md) for the current setup, accounting boundary, rollback and final verification record.

## Files in this change

- `backend/marketplace.cjs`: capability read, explicit mock-provider check, new-demo-booking labels.
- `src/features/marketplace/hooks/useMockPayments.js` and `components/MockPaymentNotice.js`: fail-closed UI availability and visible demo status.
- `src/features/marketplace/screens/PaymentChoiceScreen.js` and `BookingScreens.js`: explicit outcomes, duplicate-submit lock, confirmations, demo labels and recovery feedback.
- `backend/test/marketplace.test.cjs`, `marketplace-integration.test.cjs`, `local-demo-integration.test.cjs`: capability, provider isolation, record labelling and authenticated emulator journey.
- `backend/test/ai-production-compatibility.test.cjs`: allow the authorized marketplace edit while retaining the other AI runtime/dependency invariants.
- `backend/test/http.test.cjs`: use a small fixture for early permission rejection, avoiding a Windows socket-reset race without changing upload runtime code.
- `tests/mock-payment-choice.test.cjs`, `mock-payment-capability.test.cjs`, `marketplace-bookings.test.cjs`, `bookings-ui.test.cjs`: explicit choices, capability failures, confirmation cancellation, changed-attempt protection and regression coverage.
- `docs/SAFE_MOCK_PAYMENTS.md`: journey, isolation and verification record.

## Verification and manual checks

Run under Node 22: focused mock tests, all offline backend tests, application tests, the existing emulator verification script, and all-platform Expo exports. Test scenarios use in-memory fakes or loopback emulators only. No provider calls or production writes are required.

Historical verification of the earlier local-only implementation under Node **22.23.3** (current integration results are in the linked setup guide):

- Focused checkout/capability tests: **12/12 passed**, log `.local-checks/mock-payments-choice-final.log`.
- All 17 offline backend test files: **287/287 passed**, log `.local-checks/mock-payments-backend-final.log`.
- Complete application suite: **457/457 passed**, log `.local-checks/mock-payments-app-final.log`.
- Existing `scripts/verify-local-demo.cjs` through `firebase emulators:exec --only auth,firestore --project demo-pmr-security --config firebase.demo.json`: **77/77 passed** across local-demo (2), rules (12), backend integration (17), marketplace (33), photos (9) and showcase (4). Log `.local-checks/mock-payments-emulators-final.log`. Emulator verification exited successfully and stopped the emulators.
- Expo exports: **iOS, Android and Web passed**, using Node 22, `--platform all --max-workers 2`, with native Hermes bundles. Artifacts `.local-checks/mock-payments-export-final`; log `.local-checks/mock-payments-export-final.log`.
- `git diff --check` passed. Existing booking update/appointment/cancellation handlers and paid/balance calculations were compared with the pre-task snapshot and match. No commits, pushes, deployments, production configuration changes or production writes were performed.

Device/browser checks remaining: confirmation focus/keyboard behavior, long workshop/request text and accessibility font sizes, interrupted connectivity during acceptance/result submission, account switching during processing, and the existing host/Android/device demo connection setup. Export verification does not replace these checks.
