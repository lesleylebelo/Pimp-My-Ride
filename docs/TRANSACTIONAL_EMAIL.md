# Transactional booking and simulated payment email

For the owner's restricted first local test using `onboarding@resend.dev`, follow [First real email test](FIRST_REAL_EMAIL_TEST.md). That workflow uses only emulators, private runtime prompts and one explicitly approved future attempt; it does not enable Render delivery. A custom verified sender is still required for wider delivery.

## Source audit and authoritative records

All writes below are in `backend/marketplace.cjs`, in `createMarketplace`, through `receipt.atomic` from `backend/mutations.cjs`. That wrapper commits the mutation receipt and domain changes in one Firestore transaction and handles request replay. Existing Firebase token verification in `backend/app.cjs`, fresh account checks in `backend/services.cjs`, customer ownership, workshop ownership and approval checks remain in effect.

| Operation | Existing authoritative writes | Email addition |
| --- | --- | --- |
| `quoteAccept` | `bookings/{serviceRequestId}`, `bookings/{bookingId}/paymentAttempts/{attemptId}`, accepted quotation and request | For `pay_in_store` only, a selection acknowledgement; no payment receipt and no appointment confirmation |
| `bookingConfirm` | Booking status `confirmed`, appointment date/time, `appointmentAt`, `confirmedAt` | Customer booking confirmation containing the committed appointment and booking snapshot |
| `paymentMockResult` | Existing attempt status and booking paid/balance totals; `paymentReceipts/{attemptId}` only on success | Customer simulated receipt using the exact `C.receiptSnapshot` object written to the receipt |
| `paymentRecordInStore` | Existing simulated cash/card/EFT attempt, booking balances and receipt | Customer simulated receipt, never triggered merely by selecting pay in store |

`paymentAccounting` validates stored ZAR totals and balances. `quoteAccept` copies quotation deposit terms and `depositAmountCents`; the email code performs no payment/deposit calculations. Existing receipt references are `TEST-{attemptId}`, created by `receiptSnapshot` in `backend/marketplace-communications.cjs`. Booking IDs remain the existing service request IDs. Event time comes from the job's server timestamp, committed in the same transaction as the booking confirmation/receipt/selection. Dates are never inferred from preferred dates or drafts.

The existing `notifications` and `emailOutbox` records remain unchanged. That outbox is a simulated test sink (`test_sink_only`), not a delivery queue. The new versioned `transactionalEmailJobs` collection explicitly separates real delivery metadata from those historical test records. No historical records are backfilled. Jobs are queued for future authorized events even while transport is disabled.

Recipients come only from Firebase Admin `auth.getUser(job.recipientUid).email`, after checking verified/enabled Auth state and active owner profile in `users/{uid}`. No client email address, profile email string or scheduler body controls recipients. Account restrictions and email changes are checked again for each send attempt. A changed address after an uncertain attempt requires review instead of changing an idempotent request. Workshop copies are outside this initial customer-email scope.

## Provider decision

Use Resend's documented HTTPS API with Node 22 native `fetch`; there is no new SDK dependency or frontend import. Resend has an official Node SDK, but the two required operations (send/retrieve) are small, and native fetch fits this CommonJS backend without an SDK compatibility or lockfile change. POST `/emails` supplies plain text, responsive HTML and `Idempotency-Key`; GET `/emails/{id}` reconciles acceptance with provider delivery evidence. Network calls have a ten-second timeout. Provider error bodies are never logged or stored.

References checked on 2026-10-28:

- [Official SDKs](https://resend.com/docs/sdks)
- [Send API](https://resend.com/docs/api-reference/emails/send-email)
- [Retrieve sent email](https://resend.com/docs/api-reference/emails/retrieve-email)
- [24-hour provider idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Verified sending domains](https://resend.com/docs/dashboard/domains/introduction)
- [Render Free limitations](https://render.com/docs/free)

HTML escapes all interpolated record values; plain text preserves their literal content. Templates use a fluid 600px container, wrapping table cells and inline styles. Every template prominently says `SIMULATED PAYMENT — NO REAL MONEY WAS CHARGED`. Missing appointment facts are omitted. Booking navigation uses instructions for the existing Bookings screen, without inventing an app URL. Existing confirmation screens are unchanged and make no new delivery promises.

## Delivery states and retry safety

Each job ID is SHA-256 of `v1/{kind}/{existing event identifier}`. Booking confirmations and pay-in-store selections use booking ID; simulated receipts use actual attempt/receipt document ID. `tx.create` occurs atomically with the authoritative event. Existing mutation replay and booking/attempt transition guards prevent duplicate writes for repeated buttons, different retry keys and concurrent transitions. Email retries never invoke marketplace mutations.

States are `queued`, `processing` (90-second transactional lease), `accepted`, `delivered`, `failed`. The dispatcher claims due records using a Firestore transaction and lease token. Stale workers cannot update a newer claim. Provider payload, sender, recipient, template output and idempotency key are frozen before network I/O, allowing retries after a timeout or process death. Provider failure cannot reverse an already committed booking or simulated payment. Durable job persistence itself is part of the domain transaction: if Firestore cannot commit it, the whole mutation fails atomically and the existing request ID remains safe to retry.

Transient/unknown failures retry at 1, 2, 4, 8 and 16 minute intervals, at most six sends. HTTP 429, 5xx and concurrent-idempotency conflicts retry; other provider rejections stop. No request/error body, profile or financial data is written to operational logs. Terminal failures record a safe code. Missing/invalid/unverified/restricted recipients fail without sending.

Unknown outcomes stop 23 hours after the first send claim, before Resend's 24-hour idempotency retention expires. An expired processing lease can be reclaimed within that window; after it expires, a job fails with `requiresReview`. Never reset an uncertain failed job or clear its payload to resend blindly. An operator must first establish whether Resend accepted it and reconcile the existing job/provider ID. Exactly-once delivery across arbitrary outages is not guaranteed by a time-limited provider key.

POST acceptance records `accepted`, not `delivered`. Accepted jobs are checked after one minute, then hourly for at most twelve checks; delivery evidence records `delivered`, and bounce/failure/suppression/cancellation evidence records `failed`. An unresolved or unqueryable acceptance stays `accepted` after polling stops (`dueAt = Number.MAX_SAFE_INTEGER`); inspect it in Resend, never infer delivery. No webhook endpoint is exposed. Late provider changes after polling ends require dashboard review.

Firestore rules already deny all direct access to this collection by default, including administrators using the client SDK. Only the server service account can dispatch or inspect jobs. Jobs contain private snapshots and frozen recipient addresses; restrict console/IAM access. Review retention needs before launch. Do not delete deduplication records while events could be replayed; a future retention tool should redact payload/snapshots while preserving terminal job IDs and state.

## Hosting limitation and smallest supported setup

This implementation is **not production ready until scheduling, sender verification and monitoring are configured**. Render Free sleeps after inactivity and has an ephemeral filesystem. There is no in-process timer, persistent worker or queue file. Without scheduler requests, jobs remain queued indefinitely; API traffic does not drain them.

The smallest addition is a trusted external scheduler issuing an authenticated HTTPS POST to the existing Render service's `/internal/email/dispatch` once per minute. Store its bearer secret in the scheduler's secret store. A managed scheduler must support secret headers, cold-start retries, request deadlines of at least 90 seconds, failure alerts and your service's capacity/availability constraints. A scheduled CI workflow can be a low-volume, best-effort option but does not guarantee minute-level execution. A managed scheduler can involve billing: none was provisioned. Render Cron is another separately billed option, not part of Free.

Each invocation processes at most three due records sequentially (including status polls); overlapping requests are safe via Firestore claims. Endpoint rate limit is ten calls/minute/IP, and no Firebase customer/admin token substitutes for the dedicated secret. Caller bodies are ignored; no arbitrary-email endpoint exists. For low-volume Free hosting this is bounded and recoverable, but sustained backlog can outgrow capacity. Monitor oldest queued age, failed count, unknown outcomes, accepted jobs awaiting reconciliation and scheduler failures. Before higher volume, size dispatch capacity, provider quotas and a supported managed task/worker service. Delivery can still bounce or be delayed; no inbox guarantee is made.

## Server configuration and manual deployment

No commits, pushes, deployment, paid provisioning or live emails were performed as part of implementation. Local source changes are listed below. The owner handles deployment.

1. Review the files below and automated results. Keep `PMR_TRANSACTIONAL_EMAIL_ENABLED=false` initially.
2. In Resend, verify a domain you control and its required DNS records. Set a verified bare sender address. Keep tracking off unless explicitly needed. Ensure the server API key has permission both to send and retrieve email status; a sending-only key cannot reconcile delivery.
3. In the existing Render backend environment only, set `RESEND_API_KEY`, `PMR_EMAIL_FROM` and a random `PMR_EMAIL_DISPATCH_TOKEN` of at least 32 characters. Never place them in Expo, public environment variables, `app.json`, `.env` committed to Git, query strings or logs. See `backend/.env.example` for empty placeholders.
4. Deploy the additive Firestore index/exemptions in `firestore.indexes.json` to the existing Firebase project using your normal release process; wait until ready. No rules change is needed.
5. Deploy this backend to the existing Render service; no new service/project is required. Invalid enabled email configuration fails startup. Disabled configuration requires no provider credentials.
6. Inspect pending new jobs before enabling: transport disabled does not suppress event capture, so enabling dispatch also sends eligible queued events. Decide explicitly whether any backlog should be marked terminal without sending; never relabel the legacy `emailOutbox` as deliverable jobs.
7. Configure the trusted scheduler with HTTPS POST, an empty body, and `Authorization: Bearer <PMR_EMAIL_DISPATCH_TOKEN>`. Use its secret-header UI instead of embedding the secret in scripts or URLs. Enable delivery only after the controlled test is approved. Unauthorized or disabled calls return 403; Firestore/dispatcher infrastructure failures return sanitized 503.
8. Observe accepted/delivered/failed states, sender authentication and inbox appearance. Disable transport and pause the scheduler for rollback; booking/payment records and queued jobs remain intact. Do not delete provider IDs or retry metadata.

## One controlled end-to-end plan (not executed)

The owner has now designated one Resend account mailbox privately and authorised preparation only. Follow [First real email test](FIRST_REAL_EMAIL_TEST.md) for the current executable procedure. It uses `onboarding@resend.dev` only for that mailbox through the verified synthetic Firebase Auth account. No real send has been performed or authorised for the preparation session.

Use isolated local Auth/Firestore emulators (`demo-pmr-security`) with only synthetic customer, approved workshop, request and quotation fixtures. The emulator customer's verified email must be the designated mailbox; other owner recipients must not exist in this test dataset. The restricted testing sender requires no custom verified domain. A future separately approved live attempt uses a backend-only key; automatic tests and rehearsal mock delivery. No production records or Render settings are involved.

Prepare the synthetic ZAR 1,000 quote, ZAR 250 simulated deposit, ZAR 750 balance and confirmed appointment through the existing workflows. Rehearse both emails with a mocked provider. After later explicit approval, select exactly one job for one live attempt; do not drain the queue or automatically retry. Check API acceptance, provider delivery evidence and actual inbox/spam arrival separately. The other job stays queued. Additional full-payment, pay-in-store and failure tests remain mocked for this first live-test scope.

## Changed files

- `backend/transactional-email.cjs`: event queue, HTML/text templates, Resend adapter, claims, retries, reconciliation, protected route.
- `backend/marketplace.cjs`: atomic customer event hooks, reusing the saved receipt snapshot.
- `backend/app.cjs`, `backend/server.cjs`: optional dispatcher wiring; existing Google sign-in work preserved.
- `backend/.env.example`: server-only placeholders; transport off by default.
- `backend/package.json`: email tests included in the default suite and `test:email` command; no dependencies added.
- `firestore.indexes.json`: queue index and private snapshot/payload index exemptions only.
- `backend/test/transactional-email.test.cjs`, `backend/test/marketplace.test.cjs`: delivery and workflow regressions.
- `backend/test/mock-payment-configuration.test.cjs`: startup dependency stubs for the existing Google module and new optional dispatcher.
- `backend/test/ai-production-compatibility.test.cjs`: permits the additive email index/exemptions and test script, and recognizes the pre-existing Google dependency against its current lockfile, while retaining previous runtime/index/dependency checks; no PimpPilot implementation changed.
- `tests/transactional-email-boundary.test.cjs`: frontend transport/secret boundary.
- `tests/rules/access.test.cjs`: deny direct client read/write/delete of email jobs.
- `docs/TRANSACTIONAL_EMAIL.md`: this audit, architecture, test plan and deployment runbook.

## Automated validation

Results are recorded after the implementation checks below. Tests use only synthetic mocks and local emulators; no production writes or real provider calls are part of these runs. Local Node is v24.19.0; Render's declared runtime remains Node 22.x, and the implementation uses APIs available in Node 22. A Node 22 runtime run remains a deployment validation step.

| Check | Actual result |
| --- | --- |
| `npm.cmd run test:email --prefix backend` | 127 passed, 0 failed (focused email and marketplace workflows) |
| `npm.cmd test --prefix backend` | 374 passed, 0 failed (final full backend suite, including new email tests) |
| `npm.cmd test` | 651 passed, 0 failed (full frontend suite before the new boundary test was added) |
| `node --test tests/transactional-email-boundary.test.cjs` | 1 passed, 0 failed (also included in subsequent default frontend runs) |
| `node --test tests/rules/access.test.cjs` with local Firestore emulator | 15 passed, 0 failed, including actual Admin SDK queue writes, production query and competing dispatch claims, plus direct client permission denials |
| `git diff --check` | Passed; only existing Windows line-ending advisories |

Initial backend runs exposed an outdated startup dependency mock and a snapshot assertion that forbade the new index/test script and did not recognize an existing Google dependency. The narrowly updated harnesses passed in the final full run. Frontend output includes existing React test-renderer deprecation notices.

The normal Firebase CLI rules command first hit restricted access to the user's global CLI config. An isolated temporary `XDG_CONFIG_HOME` avoided that, but CLI startup was slow. Final rules validation used the already cached Firestore emulator JAR directly, bound to `127.0.0.1:8187` with `--project_id demo-pmr-security --single_project_mode true --single_project_mode_error true --rules firestore.rules`. The test shell set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8187` and `GCLOUD_PROJECT=demo-pmr-security`; the test's existing local-emulator guard remained enabled. All delivery-provider calls were mocks. The Admin SDK emitted a metadata lookup warning before completing; no production database was used. Composite-index enforcement and real mailbox rendering/delivery remain manual release checks.
