# First controlled local Resend email test

Status: preparation only. No real send is authorised for this implementation session. Render email delivery remains disabled; no production queue is queried or drained.

The owner designated one Resend account mailbox in chat. Enter that exact address at the hidden runtime prompt; it is not stored in this document or source. The helper checks its SHA-256 fingerprint and then verifies that both jobs belong to a synthetic, enabled Firebase Auth customer with that exact verified email. It never rewrites recipients. The synthetic workshop has a separate non-deliverable `example.test` address and receives no email jobs.

Resend permits `onboarding@resend.dev` only for the email associated with the Resend account. A verified domain is not required for this restricted test. A successful Resend onboarding message establishes mailbox access, not successful application delivery. See [Resend's documented restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain), checked 2026-10-28. Do not use `delivered@resend.dev` in place of the designated mailbox: that simulates a provider event rather than proving inbox receipt.

## What the helper exercises

`backend/email-test.cjs` invokes the existing `createServices().marketplace` service with identities verified from local Auth-emulator sign-ins. It creates only synthetic accounts, approved workshop profile, category, vehicle, service request, quotation, booking and payment records. Existing operations create a ZAR 1,000 quote, ZAR 250 simulated deposit, ZAR 750 balance and a confirmed appointment seven days ahead at 10:00 SAST. The payment result and booking confirmation are each replayed with the same request ID.

This creates exactly two customer jobs, using the unchanged normal job-ID function:

- `booking_confirmed` using the actual synthetic booking ID.
- `mock_payment_receipt` using the actual synthetic payment-attempt ID, with receipt reference `TEST-{attemptId}` and the exact saved receipt snapshot.

It verifies account/recipient identity, simulated accounting, immutable receipt content, both templates' disclaimer, expected job count, and the production dispatch query. `rehearse` runs competing dispatchers against local Firestore with a mock provider, expects two mock sends with no duplicates, then uses mock delivery evidence. These mock statuses do not prove Resend or inbox delivery. The helper covers the service boundary; it does not start the full Express app or test the HTTP Firebase middleware. Existing backend HTTP/security tests cover that separately.

The first live test sends **one selected email**, not both. Both templates are prepared, verified and rehearsed; select `booking` or `receipt` when you later approve the one real attempt. The unselected job remains queued. Testing the second template live requires a separately reviewed test/approval; the helper does not automatically grant it.

## Files and configuration

New test-only files:

- `backend/email-test.cjs`: isolated preparation, checks, mocked rehearsal, one-attempt sender and read-only provider reconciliation.
- `backend/email-test.ps1`: hidden mailbox/key prompts and temporary child-process environment.
- `firebase.email-test.json`: dedicated local ports; references the existing rules/indexes.
- `backend/test/email-test-workflow.test.cjs`: isolation, mailbox restriction, index-manifest and exclusive-attempt-lock tests.
- This runbook, linked from `docs/TRANSACTIONAL_EMAIL.md`.

No application sender configuration, templates, job IDs, retry/backoff rules, production endpoint or Render environment changes are needed. The helper passes `onboarding@resend.dev` only to its local dispatcher instance. `PMR_TRANSACTIONAL_EMAIL_ENABLED` remains false. It does not require a production dispatch bearer token or service-account file.

Each helper invocation prompts for the mailbox without echoing it. Only the future `send-once` and `refresh-status` actions prompt for the API key. The PowerShell wrapper clears inherited Firebase credential variables for its child, supplies only local emulator settings and restores its own previous process environment in `finally`. The key is passed through process memory, never CLI arguments, a committed `.env`, a request URL or logs. Do not paste it into chat. There is no automatic `.env` loading.

Use a key belonging to the same Resend account as the designated mailbox. Sending permission is required for the live attempt; email-read permission is also required for `refresh-status`. If your key is send-only, inspect delivery in the Resend dashboard instead; acceptance must not be reported as delivery.

Local artifacts are under already-ignored `.local-checks/`:

- `email-e2e-manifest.json`: synthetic booking/attempt/job IDs and rehearsal/prepared mode; no mailbox or key.
- `email-first-live-attempt.lock`: job ID, attempt timestamp and a review warning; no mailbox or key. It is created exclusively **before** any live send request. It deliberately survives failure and emulator reset. No cleanup action automatically removes it.

## Exact local commands: no real send

Run from the original `PimpMyRide` directory. Use two local terminals. Do not run these against an existing development emulator containing other work. The helper rejects nonempty emulator datasets at preparation time. No ports may be forwarded or exposed externally.

Terminal A, start only the isolated local emulators (do not start `backend/server.cjs`):

```powershell
$env:XDG_CONFIG_HOME=Join-Path $env:TEMP 'pmr-email-e2e-cli'
$env:CI='true'
$env:FIREBASE_CLI_DISABLE_USAGE='true'
node .\node_modules\firebase-tools\lib\bin\firebase.js emulators:start --only auth,firestore --project demo-pmr-security --config firebase.email-test.json
```

This is an emulator-only `demo-` project identifier, not a provisioned Firebase project. Wait for both emulators to be ready: Firestore `127.0.0.1:8187`, Auth `127.0.0.1:9197`. Use no import or export flags. No production credentials/login are needed. The temporary CLI config avoids writing the user's normal global Firebase configuration. Do not use CLI debug mode or paste full CLI debug logs: third-party debug output can include environment variables.

Terminal B, run the no-send regression checks:

```powershell
node --test .\backend\test\email-test-workflow.test.cjs .\backend\test\transactional-email.test.cjs
```

Then run the mocked end-to-end rehearsal. At the hidden prompt, enter the exact mailbox designated in chat:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\email-test.ps1 -Action rehearse
```

Expected: `REHEARSAL ONLY: 2 mock sends; 0 Resend requests`, two job summaries with `delivered` and provider IDs starting `mock-`. No Resend key is requested or read. No production API or database connection is made.

Stop Terminal A with Ctrl+C. Restart it with the same command and no imports/exports: this discards rehearsal accounts and data. Do not attempt to send mock-accepted jobs. Prepare a new synthetic scenario for the future live test:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\email-test.ps1 -Action prepare
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\email-test.ps1 -Action verify
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\email-test.ps1 -Action status
```

Expected: exactly two jobs, `queued`, `attempts: 0`, `providerId: null`. `verify` and `status` do not invoke Resend. They also check that the Auth mailbox still matches. Preserve the running emulators until the later test, or restart empty and prepare again; do not persist mailbox data in an export. Preparing again never removes a live-attempt lock.

## Future live command: do not run yet

Only after the owner explicitly authorises the actual send, in the same local emulator setup:

```powershell
# FUTURE APPROVED ACTION ONLY: select one email, not both.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\email-test.ps1 -Action send-once -Kind booking
```

To select the simulated deposit receipt instead, use `-Kind receipt`; do not execute both commands. The wrapper requires the exact interactive approval text `SEND ONE BOOKING EMAIL` or `SEND ONE RECEIPT EMAIL`, then requests the API key through a hidden prompt. It never treats a missing approval as consent.

The tool revalidates the scenario and mailbox, requires a prepared (not rehearsal), queued, never-attempted job, creates its exclusive local lock, and calls the unchanged dispatcher's `processJob` exactly once for the selected job. It does not call `dispatch`, start a timer, call the Render endpoint or run a retry loop. The normal retry rules may leave a failed/unknown attempt queued, but this helper will not repeat it: the lock persists and attempts must be zero for eligibility. Stop and reconcile instead of rerunning after an error. A process crash after lock creation can consume the one-attempt allowance without sending; review it manually.

## Expected real evidence

1. `status` shows selected job `accepted` with the Resend provider ID, and the other job remains queued. This proves only API acceptance. `failed`, `queued` or `processing` means acceptance may be absent or unknown; do not automatically repeat.
2. Find the same provider ID in the Resend dashboard. Confirm the intended recipient privately, sender `onboarding@resend.dev`, expected subject and a delivered event. A bounce/failure must be recorded accurately.
3. After at least one minute, optionally reconcile once using a read-capable key:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\email-test.ps1 -Action refresh-status
   ```

   This only processes already-accepted real jobs, supplies a send-prohibited provider wrapper and makes GET status requests when due. It cannot send the other queued job. Existing dispatcher polling limits/timing remain intact. If not due or not yet delivered, it stays accepted. This command runs once and exits; further checks are manual, never a send retry.

4. Inspect the actual designated inbox/spam folder. Confirm booking reference, synthetic workshop, date/time for a booking confirmation; or exact `TEST-` reference, ZAR 250 simulated amount and ZAR 750 outstanding balance for the receipt. Confirm `SIMULATED PAYMENT — NO REAL MONEY WAS CHARGED`, mobile rendering and plain text. Dashboard delivery evidence and actual inbox arrival are separate checks. The synthetic booking/receipt remain available in local Firestore regardless of mail outcome.

If provider acceptance is unknown, use the retained job ID/idempotency key and dashboard evidence. Do not clear payloads, reset attempts, remove the lock or regenerate a scenario to evade the one-attempt rule. A 403 can mean the key belongs to a different account or the mailbox does not match Resend's account email. Fixing configuration does not authorise another send.

## Index verification and its limit

`verifyIndexes` checks the actual `firestore.indexes.json` for the `transactionalEmailJobs` collection index `(status ASC, dueAt ASC)` and the `payload`/`snapshot` index exemptions. The emulator configuration references that same file; the rehearsal executes the exact production query and transactional lease/acceptance/reconciliation code against local Firestore.

Firestore's emulator does not enforce composite-index availability. This verifies the manifest and local query behaviour, not a deployed index. Production index readiness remains a future release check; do not deploy an index or contact the production database for this test.

## Cleanup and remaining prerequisites

- Stop the isolated emulators with Ctrl+C and no export; their in-memory Auth/Firestore data disappears. Close the operator terminal after checking evidence. The wrapper removes/restores its process variables automatically, including on failure.
- If a live test was attempted, keep the manifest and attempt lock for review. Retain only job/provider IDs and outcome as evidence; do not retain keys, mailbox screenshots or exported profile data in Git. Do not delete the attempt lock as routine cleanup.
- If no live test was attempted, the generated manifest may be removed after stopping emulators: `Remove-Item -LiteralPath .\.local-checks\email-e2e-manifest.json`. No recursive deletion, production cleanup endpoint or real booking change is needed.
- Clear Terminal A's temporary CLI settings if reusing it: `Remove-Item Env:XDG_CONFIG_HOME,Env:CI,Env:FIREBASE_CLI_DISABLE_USAGE -ErrorAction SilentlyContinue` (or close that terminal). The temporary CLI config contains no supplied Resend key.
- A subsequent separately authorised send after an uncertain outcome requires manual provider review and a deliberate reviewed test procedure; this helper supplies no automatic reset command.

Remaining prerequisites for a real attempt: enter the designated mailbox privately; have the matching Resend account API key and appropriate access; start clean local emulators; complete no-send verification; explicitly authorise exactly one live attempt. A verified custom domain and Render scheduler are not required for this local restricted test. They remain necessary considerations for wider delivery. Nothing here activates production email delivery.

## Preparation validation

Preparation checks completed on 2026-10-28:

| Check | Actual result |
| --- | --- |
| `node --test backend/test/email-test-workflow.test.cjs backend/test/transactional-email.test.cjs backend/test/marketplace.test.cjs` | 131 passed, 0 failed |
| Local Auth + Firestore `rehearse` | Passed: real emulator sign-in/token verification and service workflows; 2 jobs, exactly 2 mock sends, 0 Resend requests; replay/concurrency preserved idempotency; mock status reconciliation completed |
| Fresh-emulator `prepare`, `verify`, `status` | Passed: both jobs queued, attempts 0, provider IDs null; designated Auth mailbox and saved accounting/receipt verified |
| Index file + exact dispatcher query | Passed locally; deployed composite-index readiness cannot be established by the emulator |
| PowerShell wrapper AST parsing and Node syntax | Passed |
| Artifact ignore / source privacy checks | Manifest and attempt lock ignored by Git; no raw designated mailbox or API key in the new source/docs; live-attempt lock absent because no live send was attempted |
| `git diff --check` | Passed; existing Windows line-ending advisories only |

Local Node was v24.19.0; the declared backend runtime remains Node 22.x. Firebase CLI v15.30.1 and the cached Firestore emulator v1.22.0 were used. The CLI took roughly a minute to start and emitted a harmless missing VS Code notification endpoint message; wait for both emulators' ready banner. The SDK may emit a metadata lookup warning in this environment. No production data, service-account file or Resend key was used. The initial config location under `backend` was corrected to the project root because Firebase CLI disallows rules paths outside its config project directory.

The preparation emulators are stopped without export after verification. Their synthetic accounts/records are discarded. Re-run the documented clean preparation before the later approved live attempt. No real delivery evidence exists yet; the Resend key, manual send authorisation and actual mailbox/delivery checks remain pending.
