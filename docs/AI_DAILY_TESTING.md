> Historical record ? superseded by [PimpPilot production service](PIMPPILOT_PRODUCTION.md). Tester allowlists, generation allowances and old release patches below are obsolete and must not be used for the new service. Historical evidence is retained.

# Controlled Gemini daily testing

Prepared 2026-10-23 in the original lesley checkout. No commits, pushes,
deployments, Render changes, production database writes or Gemini calls.

## Policy and storage

Hard maximum: five reserved provider attempts globally per UTC day, shared by all
explicitly authorised test UIDs. A Firestore transaction reads
aiAssistDaily/YYYY-MM-DD, increments its attempts count and creates
aiAssistAttempts/<random UUID> atomically. Different processes and restarts share
these documents. Daily documents are never reset, deleted or refunded. UTC
midnight selects a new document; no scheduler, expiry, reset endpoint or migration
is used. A reservation crossing UTC midnight before dispatch fails without a
refund; it cannot spend yesterday's slot on a new-day call. Firestore transaction conflict handling retries only the transaction
callback, which contains no provider calls. There are no application/provider
retries. Existing per-process minute/hour and concurrency limits remain.

The production code never accesses the historical document
aiAssistControl/initial-provider-test-v1. Its existing data remains untouched.
No customer/vehicle/marketplace documents are written by AI Assist.

Storage errors, malformed counters and ambiguous transaction acknowledgements
block provider dispatch. If an ambiguous transaction committed, its slot remains
consumed and the attempt remains unknown. No fallback to in-memory budgeting.
Dispatch initiation must be durably recorded before the HTTP call. Response
receipt/status must be recorded before parsing/validation can succeed. Final
storage failures never return a suggestion. Storage failures emit only a warning
with random correlation ID and fixed storage stage/reason codes; no raw exception.

## Attempt record

Each record has exactly these initial fields:

- version: 1; correlationId: random UUID; day: UTC YYYY-MM-DD.
- reservedAt: timestamp; dispatchInitiatedAt: timestamp or null.
- responseReceivedAt: timestamp or null; providerHttpStatus: integer or null.
- outputValidated: boolean (false means no persisted validation success).
- failureStage and reasonCode: fixed allowlisted codes or null.
- state: unknown, failed or successful; finishedAt: timestamp or null.

There are no prompts, generated text, test UIDs, vehicle/customer details, API keys
or auth tokens. No raw provider response or error text is logged or persisted.
Only HTTP 400 error bodies are inspected transiently (8 KiB classification limit)
for allowlisted invalid/expired-key reason codes. Raw text/metadata are never retained.
Status classification uses 401/403 for
provider_auth, 404 for model_unavailable, 429 for provider_quota, and other HTTP
failures for provider_http. A 403 can mean key restrictions or project access,
not exclusively an incorrect key. Unrecognised provider errors remain generic.
The HTTP 400 key classification follows the official
[Gemini error reference](https://ai.google.dev/gemini-api/docs/generate-content/api-errors).
Other reasons include provider_network, provider_timeout, malformed_output,
provider_blocked, grounding_rejected, account_changed, category_changed,
quota_storage and diagnostic_storage.

An unfinished record always starts unknown. Only completed output, grounding,
fresh account and category checks permit successful. Success means backend
completion, not proof the phone received or applied the response. A lost final
write acknowledgement may leave either the previous unknown state or committed
backend completion; no retry or refund is attempted. Dispatch initiation is
intent, not proof Google received a call. A recorded response is stronger evidence.
Crashes before a checkpoint cannot reconstruct unrecorded facts. No background
process upgrades unknown records to successful.

Existing Firestore rules deny client reads/writes to all three AI collections,
including administrator clients; emulator tests verify this. The server uses the
existing Admin SDK identity. No new rules, indexes, packages or lockfiles needed.

## Configuration for a later approved Render rollout

Preserve all existing Render settings. Set privately on the existing backend:

| Setting | Value |
| --- | --- |
| PMR_AI_ASSIST_ENABLED | false during deployment/preflight; true only for authorised testing |
| PMR_AI_PROVIDER | gemini (explicitly required) |
| PMR_AI_MODEL | gemini-2.5-flash-lite (only authorised model) |
| GEMINI_API_KEY | Existing server-only Gemini credential; never include in reports/client builds |
| PMR_AI_TEST_UIDS | Comma-separated, explicitly approved Firebase UIDs; at most 50 |

No OpenAI credential is used, and there is no provider/model fallback. If the
plural allowlist variable is absent, the existing PMR_AI_TEST_UID remains a
compatible single-account restriction. A present empty/invalid plural variable
fails closed rather than falling back. The enabled flag remains false by default.
The ignored backend/.env.local was not edited and is not loaded by Render start.
Authentication, active roles, approved-shop status and operation locks still apply.
Output limits and the 15-second provider deadline remain. General customers/shops
outside the allowlist receive 403 before quota work. Expected structured AI
403/429/503 responses no longer produce severe client console errors. Other
routes and unexpected errors retain existing logging. Client logging improvement
requires shipping the changed application code; it is not delivered by Render.

## Production patch and compatibility

Read-only git ls-remote verified main as
2fce64406d8a0d052b9ace7a9415755ce215b0ff on 2026-10-23. This is the current remote
main baseline, not independent proof of the running Render revision.

Generate with Node 22: node scripts/prepare-ai-release.cjs.
Artifact: releases/gemini-daily-testing-main.patch. It contains only the four AI
runtime modules, disabled environment example, their tests/helper, and the narrow
shared-client logging change with its test. It excludes unrelated lesley changes,
marketplace code, CORS configuration, server startup, dependencies, rules and
indexes. The old gemini-ai-assist-main.patch is historical and must not be used
for this rollout. Compatibility tests compare protected source directly with the
current baseline, including existing CORS behavior. Patch application is checked
using a temporary index only; the real index, branch and worktree are preserved.

Before deployment: confirm Render's running SHA/root/build/start and rollback
revision; recheck main has not moved; review this exact patch; verify designated
accounts and existing Google project/model access/quota without generating content.
No paid billing activation is part of this release. Normal Firestore metadata
operations still use the existing project's database billing/limits.

After separate release approval, apply only this patch to the reviewed production
baseline and run its checks. Deploy with AI disabled. After separate test approval,
enable and use synthetic text from designated accounts. Each press consumes a
slot, including failures and explicit Regenerate. Inspect/Dismiss without saving
or publishing. Disable after the testing window. Do not grant wider accounts access
or change payment/media settings as part of this rollout.

Rollback: set the flag false and complete its rollout first; a call already in
flight may still finish. Restore the captured previous Render revision if needed,
keeping AI disabled and accounting for Auto-Deploy. Leave daily counters, attempt
records and historical allowance untouched. The previous one-attempt code will
still reject its consumed allowance if re-enabled. A later daily-code redeployment
continues using the same daily records. No business-data rollback is required.

## Validation

Use Node 22.23.3. Focused tests cover global five/day, sixth-before-dispatch,
concurrency, UTC rollover, failure/timeout consumption, ambiguous commits,
fail-closed diagnostics storage, history preservation, provider error classes,
content-free metadata, disabled/unauthorised access, original draft preservation,
no saving/publishing and expected-error console handling. All provider HTTP is
mocked. Emulator suites require loopback hosts and demo-pmr-security and cannot
use production data. Full results are recorded in the final report; ignored logs
are .local-checks/gemini-daily-*.log.


## Completed checks and changed files

Node 22.23.3: 267/267 backend tests, 382/382 application tests, 76/76 emulator
tests (12 rules, 17 Auth/backend, 32 marketplace/messaging, 9 photos, 4 showcase,
2 AI quota/rules). The initial backend run encountered the existing photo-upload
ECONNRESET; the complete rerun passed without a photo-related source change.
The final quota/provider edits were covered by the last complete backend run.
Emulators shut down after successful completion. Patch application/reproduction
using the isolated index and git diff --check passed. Existing local secret values
were absent from the reviewed source/patch; no values were printed.

Reproduce under Node 22 from the project root:

~~~powershell
npm.cmd test --prefix backend
npm.cmd test
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only auth,firestore --project demo-pmr-security --config firebase.demo.json "node scripts/test-emulators.cjs"
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only auth,firestore --project demo-pmr-security --config firebase.demo.json "node --test backend/test/ai-release-integration.test.cjs"
node scripts/prepare-ai-release.cjs
~~~

Use an isolated writable XDG_CONFIG_HOME for Firebase CLI if the normal config
store is restricted, and FIREBASE_EMULATORS_PATH=.emulators for the existing jar.
Neither command loads backend/.env.local. Do not substitute a live Firebase
project or remove the emulator assertions.

Runtime/config files:
- backend/ai-release-control.cjs
- backend/ai-provider.cjs
- backend/ai-assist.cjs
- backend/ai-errors.cjs (new)
- backend/.env.example
- src/shared/services/api.js

Tests:
- backend/test/ai-release-control.test.cjs
- backend/test/ai-assist.test.cjs
- backend/test/ai-release-integration.test.cjs
- backend/test/ai-production-compatibility.test.cjs
- backend/test/helpers/ai-store.cjs (new)
- tests/api.test.cjs

Release aids:
- scripts/prepare-ai-release.cjs
- docs/AI_DAILY_TESTING.md (this runbook, new)
- docs/AI_ASSIST.md and docs/AI_ASSIST_RENDER_RELEASE.md (supersession notices)
- docs/releases/gemini-daily-testing-main.patch (new)

Remaining predeployment checks: owner confirmation of running Render revision and
rollback deployment, current approved test UIDs, provider project/model access and
available quota. This implementation cannot recover the original unrecorded 503
cause or establish live provider quality/credential validity without separate
authorisation. Release/activation and any live test remain unperformed.
