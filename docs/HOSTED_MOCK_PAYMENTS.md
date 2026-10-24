# Mock payments in the original PimpMyRide application

## Deployment target

This integration uses the original `lesley` repository, existing Expo client, Express backend at `https://pimp-my-ride.onrender.com`, Firebase project **`pimp-my-ride-a26fc`**, current Firestore database and current Supabase storage. No additional service, project, database, application, branch or worktree is required. The original `render.yaml` is preserved.

The previous separate-environment design is removed: `render.demo.yaml`, `backend/hosted-demo-config.cjs`, its synthetic credential helper and its tests were removed/replaced. There is no `pmr-demo-*` project restriction, separate service-account requirement, separate Supabase requirement or Firestore activation marker.

## One configuration change

On the **existing** Render service, set this server-only environment variable:

```text
PMR_MOCK_PAYMENTS_ENABLED=true
```

Missing or `false` disables payment mutations. Other values fail startup validation. Do not prefix this flag with `EXPO_PUBLIC_`. Keep `NODE_ENV=production`, `FIREBASE_PROJECT_ID=pimp-my-ride-a26fc`, existing Firebase server credentials, Supabase URL/key/buckets, CORS, AI and all other current configuration. No new credentials are needed. Do not set emulator hosts on Render.

If variables from the rejected proposal were added, remove `PMR_HOSTED_DEMO`, `PMR_MOCK_PAYMENTS_MODE`, `PMR_DEMO_FIREBASE_PROJECT_ID` and `PMR_DEMO_SUPABASE_PROJECT_REF`. They no longer control runtime behavior. Do not replace existing credentials or import another environment. No environment changes have been made during development.

Startup validates the flag, Firebase project aliases and actual SDK database project. Existing server credential checks still apply; an explicit credential file used with enabled simulation must identify the configured project. Payment mutations repeat configuration validation at runtime and inside the transaction. Only the existing mock provider is accepted. Normal non-payment features stay available when simulation is disabled.

## Existing end-to-end flow

The authenticated `POST /api/marketplace` operation `paymentSimulation` returns `{enabled:true,simulated:true,mode:"mock"}` when enabled on the hosted backend. UI waits for this response and fails closed on unavailable/malformed capability data. There are no hardcoded successful client responses.

1. Accept an eligible current quotation using `quoteAccept`: full, fixed-ZAR deposit, percentage deposit or pay at workshop. The server copies authoritative accepted terms into the existing request-scoped booking.
2. Full/deposit choices create a pending simulated attempt. The customer explicitly selects and confirms success or failure; `paymentMockResult` checks the exact booking, attempt, amount and currency. Only success reduces the balance.
3. `paymentRetry` creates a fresh attempt after failure/cancellation. `paymentStart` opens an attempt for the server-calculated balance. Each attempt needs its own confirmation. Idempotency receipts and transactions prevent duplicate application and overpayment.
4. Pay at workshop creates an unpaid/due booking. Only its selected shop can explicitly record a simulated cash/card/EFT result through `paymentRecordInStore`; choosing this option alone never marks it paid.
5. Customer and shop read persisted booking amounts, current attempt and paginated history through the existing API and polling/refresh. Reopening the app reconstructs state from Firestore. Appointment confirmation, service completion and payment are separate states. Existing booking/receipt notification links are retained.

The existing production Firestore collections remain `bookings/{id}`, `bookings/{id}/paymentAttempts/{id}`, `paymentReceipts/{id}` and account-scoped `mutationReceipts`. No database migration, new namespace, collection, rule change or index is required. Direct clients cannot write these collections; existing Firebase Auth, approved-shop/ownership checks and server transactions remain authoritative.

## Simulation-only accounting boundary

New bookings carry `simulated:true`, `testTransaction:true`, `paymentProvider:"mock"` and `paymentAccountingMode:"simulated"`. On these tagged bookings, existing `paidCents`, `balanceDueCents` and `paymentStatus` explicitly describe **simulation accounting**, never received revenue. Attempts and receipts carry simulation/test flags; receipts use `TEST-*` references and `SIMULATED_PAYMENT_RECEIPT`. Existing email events remain in the test sink; no email is sent by this feature.

Successful simulation writes `simulatedPaymentVerifiedAt`; it never writes or replaces `paymentVerifiedAt`. Simulated cancellation reconciliation is labelled `simulated_reconciliation_required`, not a real refund obligation. All attempts must also identify the mock provider, matching booking and currency before modification. No real gateway, banking/card fields, real settlement or real financial receipt is introduced.

Historical bookings already tagged with all three existing simulation fields remain compatible even if the new accounting-mode field is absent. **Unmarked or explicitly real historical bookings remain readable and retain their normal recorded-payment labels, but cannot be converted or paid through the simulation actions.** This is deliberate protection of existing evidence, not a migration prerequisite for new quotation-to-booking journeys. No historical data is automatically relabelled or deleted.

## Exact preparation for the existing Render service

1. Review the diff and validation results on `lesley`. Commit and push to the existing service's configured deployment branch only when authorized. No commit, push or deployment is performed by this task.
2. In the existing Render service, add only `PMR_MOCK_PAYMENTS_ENABLED=true`; preserve its existing Firebase/Supabase/AI/media/CORS settings. Remove obsolete proposal variables if present. Keep the existing repository, backend root directory, `npm ci` build and `npm start` command. Use the existing Node 22 runtime.
3. Deploy the approved revision to that existing service. Check startup logs and `/health`. No activation document or database seeding is required for the patch.
4. Release/rebuild the existing Expo client with its current matching Firebase configuration and `EXPO_PUBLIC_API_URL=https://pimp-my-ride.onrender.com`. This client revision is needed for the new `mode:"mock"` capability response. Public environment settings do not need to change when already correct. Keep local-demo/emulator routing disabled in the hosted client.
5. After approval, manually verify using authorized test accounts and clearly identified simulated service requests/bookings: full, fixed/percentage deposit, failure/retry, balance, unpaid pay-at-workshop and explicit shop recording. Verify both participant views, ownership denial, duplicate submission and another eligible booking. Reopen the app and restart the backend to verify hosted persistence. All development test writes were confined to local emulators/mocks.
6. Verify notification navigation, account switching, interrupted connectivity, confirmation focus/keyboard behavior and accessible font sizes on web/iOS/Android devices. Automated exports do not replace physical-device checks.

Rollback: set `PMR_MOCK_PAYMENTS_ENABLED=false` and restart/redeploy the **same** service. Simulation controls disable after capability refresh; normal marketplace reads, appointment/service actions, media, AI and messaging remain available. Keep simulated history and never relabel it as real money or delete paid records. No credentials, project or storage routing change is needed.

The feature is **not live** until the existing service/client revisions are deployed and the hosted checks above pass. There is no remaining separate-infrastructure prerequisite.

## Changed files and verification

Runtime: `backend/mock-payment-gate.cjs`, `backend/server.cjs`, `backend/marketplace.cjs`, `src/features/marketplace/hooks/useMockPayments.js`, `components/MockPaymentNotice.js`, `components/BookingUI.js`, `screens/BookingScreens.js`. Existing checkout confirmation and idempotent API transport are retained. Tests/configuration: `backend/package.json`, `backend/test/mock-payment-configuration.test.cjs`, `helpers/mock-payments.cjs`, `marketplace.test.cjs`, `marketplace-integration.test.cjs`, `ai-production-compatibility.test.cjs`, `tests/mock-payment-capability.test.cjs`, `marketplace-bookings.test.cjs`, `bookings-ui.test.cjs`, `tests/rules/access.test.cjs`. Documentation: this guide, `SAFE_MOCK_PAYMENTS.md`, `AGENTS.md`.

Verification uses Node 22.23.3, synthetic mocks and local Firebase Auth/Firestore emulators only. The existing-project emulator compatibility case adapts SDK project identity/configuration while all actual traffic remains on loopback `demo-pmr-security`; it does not prove live cloud credential/connectivity or deployment.

Final verification results:

- Full offline backend suite: **296 passed, 0 failed** (`.local-checks/original-payments-backend.log`).
- Complete application suite: **458 passed, 0 failed** (`.local-checks/original-payments-app.log`).
- Complete Firebase emulator verification: **80 passed, 0 failed** across local gateway (2), access rules (13), backend integration (17), marketplace (35), private photos (9) and showcases (4). Command: `firebase emulators:exec --only auth,firestore --project demo-pmr-security --config firebase.demo.json "node scripts/verify-local-demo.cjs"`. Log: `.local-checks/original-payments-emulators-final.log`. An initial run exposed an obsolete assertion for the intentionally renamed simulated reconciliation status; the corrected full rerun passed and shut down the emulators.
- Expo export: **iOS, Android and Web passed**, including native Hermes bundles. Command: `expo export --platform all --max-workers 2 --output-dir .local-checks/original-payments-export`. Log: `.local-checks/original-payments-export.log`.
- `git diff --check` passed. The original `render.yaml`, Firebase client initialization, storage transport/configuration and AI runtime files are unchanged by this task. Existing uncommitted UI work is preserved.

No production writes, real provider calls, live configuration updates, commits, pushes or deployments were performed. Remaining checks are the approved existing-service/client deployment and hosted browser/physical-device smoke tests listed above. Unmarked historical settlement records intentionally remain protected from simulation updates.
