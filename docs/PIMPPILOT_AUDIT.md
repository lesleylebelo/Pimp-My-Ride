# PimpPilot investigation and local repair — 26 October 2026

Original repository, branch `lesley`. Existing uncommitted UI, media and release
work is preserved. No live AI generation, provider credits, production writes,
counter resets, configuration changes, commits, pushes or deployments.

## A. Architecture and lifecycle

The two entry points are `OwnerMarketplaceScreens.js` request forms and
`PostScreens.js` Workshop showcase forms. Both use `AIAssistButton.js`. Customer
build publishing and Admin AI entry points are not implemented. The button checks
online/focus/disabled state, UID and at least three text characters; it does not
claim that an authenticated UID is an authorised AI tester.

`generate()` locks submission, snapshots the UID and draft, and opens a review
modal. `aiAssistApi.js` sends only kind/title/description/categoryId through
`apiRequest('ai/assist', ..., {expectedUid})`. Images, budgets, locations and
private media are not sent. Shared transport checks connectivity/configuration,
shares a bounded health probe, checks the current UID before and after token
retrieval, and makes one authenticated POST. There is no generation retry.

`backend/app.cjs` applies IP and UID rate limits, verifies the Firebase ID token
with revocation checking, and passes the verified identity to `services.aiAssist`.
The shared `actor()` in `services.cjs` reads `users/<verified UID>` and
`auth.getUser(UID)` afresh. `ai-assist.cjs` checks current role/status/operations,
the matching draft kind, size/text/category validity, provider enablement and the
designated test UID allowlist. Categories come from active Firestore categories
for requests and the existing fixed showcase categories for Workshops.

Per-process throttles run before a durable reservation. `ai-release-control.cjs`
atomically increments `aiAssistDaily/<UTC date>` and creates a random
`aiAssistAttempts/<UUID>`. Only a confirmed transaction and recorded dispatch
checkpoint permit a provider call. The callback never calls Gemini; Firestore
transaction retries therefore cannot duplicate a provider request.

`ai-provider.cjs` uses direct Gemini REST fetch, a server-only key header,
structured JSON schema and the existing prompt. A 15-second deadline aborts the
request. Envelope/candidate/parts/JSON validation is followed by length, category,
question-format and strict factual-grounding checks in `ai-assist.cjs` and
`ai-grounding.cjs`. Auth/profile access is reread after generation; changed UID,
role, restrictions or category availability discard the output. Durable finish
diagnostics must succeed before returning a suggestion.

The client validates the response again. Late, dismissed, unfocused, offline,
unmounted, account-switched or changed-draft results cannot apply automatically.
Only explicit Apply updates the local form; ordinary submit/save remains separate.

## B. Error A: exact source and triggers

Before this repair `pimpPilotErrorMessage()` mapped **every HTTP 429**, or
`api/resource-exhausted`, to the reported usage-limit sentence. That was broader
than daily allowance exhaustion. Sources include:

| Rejection | Scope and condition |
| --- | --- |
| Durable daily allowance | Five reservations already exist for today's UTC document |
| AI throttling | Same UID already pending; 3 requests/minute or 10/hour; 4 concurrent requests/process; 5,000 tracked UID entries/process |
| General API throttling | 90 ordinary API requests/minute/IP or 60/minute/verified UID; shared with other API work |

The daily cap counts **reserved attempts**, not received or applied suggestions.
Failed, malformed, grounding-rejected and timed-out provider responses all count.
Pre-dispatch diagnostic failure or ambiguous reservation acknowledgement can also
consume a slot without proof of a provider call. One visible successful generation
does not establish that only one reservation exists. This is intentional cost
containment, not a demonstrated counter initialisation bug.

Provider HTTP 429 was already converted to backend **503**, with internal reason
`provider_quota`. This checkout's provider 429 cannot directly trigger the old
Error A. Its precise upstream quota/rate/billing cause is not knowable from status
alone. No provider billing exhaustion is inferred from 429.

The repaired HTTP IP/UID limiters attach the temporary-rate classification only
on the AI endpoint. Other endpoint envelopes and all limiter values are preserved.

The global five-slot policy and all budget values remain unchanged. Tests prove
first and second successful generations work for a fresh day. The later read-only
production check confirmed today's counter at five, with four validation failures
and one successful result; see L. Attribution to a particular original HTTP 429
still requires its timestamp/response and the running deployment revision.

## C. Error B: exact source and triggers

The same presenter mapped **every HTTP 403**, or `api/permission-denied`, to the
reported account-unavailable sentence. Distinct sources include shared account
validation, unsupported role, unapproved Workshop, account-operation lock, wrong
draft kind, an unlisted test UID and access changing during generation.

The allowlist is independent of Customer/Workshop eligibility: an approved,
verified and active Workshop can still be intentionally excluded from testing.
`PMR_AI_TEST_UIDS` takes precedence whenever present, including an empty value;
the legacy singular setting is consulted only when the plural variable is absent.
Missing/invalid configuration produces 503, not an account 403.

Provider 401/403 become an internal provider-access failure and backend 503.
Missing configuration also returns 503. Neither directly produces Error B in this
checkout. There is no evidence justifying bypassing the test allowlist or account
rules. Which rule rejected the affected live account remains unconfirmed.

## D. Eligibility and session boundaries

| State | Existing authoritative result |
| --- | --- |
| Active verified Customer (`owner`), listed UID | Request drafts allowed |
| Active verified approved Workshop (`shop`), listed UID | Showcase drafts allowed |
| Pending/rejected Workshop, Admin, unsupported draft kind | Denied |
| Suspended/archived, missing/invalid profile, disabled Auth user | Denied |
| Unverified Auth user or unverified token | Denied |
| Token older than Auth creation/revocation boundary | Sign in again; HTTP authentication also checks revocation |
| Status/review/provisioning operation pending | Denied |
| Otherwise eligible UID absent from tester list | Denied before reservation |

Owner/shop roles come from the server-read profile, not client-submitted fields
or a client-cached role. Admin custom claims do not grant AI eligibility.
`AuthContext` refreshes Auth/token/server profile, subscribes to profile changes
and partitions offline caches by UID. Offline AI is disabled. The root navigator
remounts for account/role destinations. Those mechanisms are unchanged. Tests
also discard an old in-flight result after switching accounts and reject role/UID
changes during server generation.

## E. Usage accounting and resets

Five daily slots are **global across all listed UIDs, roles and both AI features**,
not five per person. Documents persist across sessions, restarts and backend
instances. UTC midnight selects a different document; it never clears yesterday's
record. In South Africa this boundary is 02:00 SAST. No rolling-day reset,
scheduler, refund or successful-output-only quota exists. A new counter begins
with its first reservation at 1; malformed existing counters fail closed.

Minute/hour limits use elapsed milliseconds from the UID's process-local windows,
not local calendar time. They reset on their window boundaries and on process
restart; the durable global cap does not. Failed reservations still use the local
throttle budget. Four concurrent slots are process-local, not fleet-wide.

Same-process concurrent requests for the same UID are rejected before another
daily reservation. Separate instances or subsequent explicit regenerations are
distinct requests; there is no durable idempotency key or response replay. The
global transaction still caps reservations at five across instances.

Dismiss is a preview cancellation, not provider cancellation. An already
dispatched request may finish and count even though its output is discarded.
Timeout abort does not prove that Google did no work. Consequently no automatic
refund or retry has been added. Emulator activity uses only `demo-pmr-security`
with guarded local hosts and cannot change production counters. Separately
running a credentialled backend against the real project would share real
counters; no such generation was run here.

The historical `aiAssistControl/initial-provider-test-v1` is never read, written
or reused by current daily-control code. Older release runbooks describe its
one-attempt policy. If an older backend is deployed, its revision and control
implementation must be established before attributing the live incident to
today's daily policy. The historical record must not be reset as a workaround.

## F. Provider and configuration

The current adapter is Gemini-only. Explicitly accepted models are
`gemini-3.5-flash-lite` and legacy `gemini-2.5-flash-lite`. `.env.example` selects
3.5 with AI disabled; the actual server environment selects the effective model.
There is no default provider/model, automatic model discovery, SDK retry,
provider fallback or OpenAI invocation.

Safe local file inspection found ignored `backend/.env.local` has AI enabled,
Gemini selected, legacy 2.5 selected and a non-empty key, but **no configured test
UID**. Its value was not displayed or tested. If that local configuration is
loaded without an additional session-provided allowlist, current release control
fails closed as configuration-unavailable before generation. It does not explain
a production account's 403. Frontend `.env`
selects the existing Render origin. No environment file has been changed.

Enablement requires `PMR_AI_ASSIST_ENABLED=true`, explicit Gemini selection,
supported model and a non-empty key. Key presence proves neither validity nor
project/model entitlement. No model-list or live generation call was made.
Historical owner observations in the 23 October model runbook are not fresh
evidence of the current Render key, model or billing state.

The input JSON is at most 8 KiB; draft title at most 100 characters, request
description 300 and showcase description 2,000. At most 100 supplied categories
with names up to 100 characters are included in the prompt. There is **no
explicit input-token ceiling**: these are byte/character/category bounds, plus
fixed instructions and editorial vocabulary. Output remains at most 1,800 tokens;
response parsing accepts at most 65,536 characters. No limits were increased.

Google's [rate-limit documentation](https://ai.google.dev/gemini-api/docs/rate-limits)
describes provider project-level request/token limits and a Pacific-midnight
provider daily reset. This is separate from PimpMyRide's UTC daily reservation
window. The application does not display its own UTC reset for a provider limit.

Google's current [API error reference](https://ai.google.dev/gemini-api/docs/api-errors)
and [troubleshooting guide](https://ai.google.dev/gemini-api/docs/troubleshooting)
distinguish throttling/service errors from payment/access problems. HTTP 402 is
now classified as provider billing review. HTTP 429 remains a provider limit
whose precise rate, quota or spend cause requires owner diagnostics; it is never
described as the application's daily allowance. Raw upstream bodies are not sent
to clients or persisted. Existing bounded invalid-key machine-reason inspection
for HTTP 400 is unchanged.

## G. Relationship between the errors

They share a lossy presentation boundary, but their server conditions differ.
One denied UID can receive Error B without consuming a daily slot. Another
eligible request can receive Error A because of a shared daily cap or temporary
throttle. A provider failure can consume a reserved slot, contributing to later
daily exhaustion, but provider failure itself is not a 403 account rejection.
No evidence establishes that the two live occurrences have one cause.

## H. Confirmed defects and corrections

1. **Overbroad status mapping.** Added safe `error.fields.aiReason` metadata using
   the existing error envelope. Daily allowance, temporary busy/rate limits,
   designated tester requirement, account access/eligibility/change, draft type,
   configuration, provider limits, billing, network and timeout now have distinct
   presentation. Generic unclassified old-server 429/403 responses remain honest
   about uncertainty instead of inventing a reason.
2. **Lost distinction on 503.** Shared transport intentionally replaces 5xx text;
   the AI client now reads its existing structured response-body fields and keeps
   the safe classification through the component's second presentation pass.
   No shared transport or authentication contract was changed.
3. **Dismiss/reopen duplicate generation.** Dismiss, focus loss and offline changes
   invalidated results but also cleared the lock while the request was pending.
   They now hide/discard the preview while retaining the loading lock until
   settlement. A late result stays discarded; a subsequent explicit generation
   works after settlement. Account remount separation remains intact.
4. **Missing billing classification.** Provider 402 previously became generic
   `provider_http`; it now has a content-free `provider_billing` reason and owner
   review copy. No key/body/billing detail is exposed.

5. **Prompt/validator guidance gap.** Production diagnostics show two follow-up
   questions rejected for unsupported vocabulary. The prompt did not communicate
   the validator's closed question vocabulary. It now offers two neutral fallback
   questions tested against the unchanged validator and explicitly permits an
   empty array. Added guidance retains description facts and per-field sensitive
   details, with verbatim non-empty fallback when uncertain. This does not prove
   that a particular past response was falsely rejected, or guarantee future
   model compliance. Grounding, category, schema and safety checks remain strict.
6. **Output rejection masked as service unavailability.** Malformed or grounding-
   rejected output now reports that PimpPilot could not validate a suggestion and
   that normal manual editing remains available. No unsafe output is returned.

Daily exhaustion includes only the server-computed next UTC midnight. Network
failure asks to check connectivity; expired session asks to sign in again;
unlisted testers are directed to the owner. No remaining-credit count, reset time
for generic 429, inferred billing diagnosis or unsupported eligibility reason is
fabricated. Failed generation never applies or saves a draft.

## I. Cost exposure and recommended policy

The five-attempt cap is suitable for a tightly controlled provider test, but can
produce zero usable suggestions after five failures. It is not a practical
general-user allowance, particularly because both features and all testers share
it. Keep this cap during incident diagnosis; use mocks/emulators for repeated
testing rather than increasing exposure to diagnose failures.

Google's [current pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)
lists 3.5 Flash-Lite Standard input/output free on its Free tier, and paid rates
of $0.30/$2.50 per million input/output tokens respectively. This is public
pricing, not verification of the Render key's tier. At paid output pricing,
5 × 1,800 tokens is $0.0225/day of output alone; input and other project usage
are additional. This is not a total spending cap or a billing guarantee.
No billing, token limit, quota or provider setting has been changed.
The additional fixed prompt guidance adds a small number of input tokens per
future call. No real call was made to evaluate it, and pricing/quality should be
reviewed with the owner before an authorised release; the existing attempt and
output limits remain intact.

For a separately approved general rollout, recommend explicit validated per-UID
daily allowance plus a hard global token/attempt budget, durable shared
concurrency, bounded input-token policy, and request IDs bound to UID and draft
fingerprint. Successful-output allowances can be separate from the hard provider
attempt budget, so failed work never silently refunds financial exposure. Define
safe replay/retention/privacy before enabling retries. Start with limits fitting
the **existing** global ceiling; any aggregate increase, paid tier, model change
or automated retry needs an owner decision and cost review. None is implemented
or enabled by this audit.

## J. Files changed for this audit

| File | Change |
| --- | --- |
| `backend/app.cjs` | Classify existing IP/UID throttling only for the AI route; other responses unchanged |
| `backend/ai-errors.cjs` | Safe public classifications and provider billing diagnostic |
| `backend/ai-release-control.cjs` | Tester/daily classifications and exact UTC reset metadata; accounting unchanged |
| `backend/ai-assist.cjs` | Distinguish existing authorisation/throttle checks without changing eligibility or quotas |
| `backend/ai-provider.cjs` | HTTP 402 classification and preservation/validated-question prompt guidance |
| `src/features/marketplace/services/pimpPilotPresentation.js` | Specific messages, verified reset and conservative old-server fallback |
| `src/features/marketplace/services/aiAssistApi.js` | Preserve safe error metadata through presentation |
| `src/features/marketplace/components/AIAssistButton.js` | Retain request lock after dismiss/focus/offline changes; prior styling preserved |
| `backend/test/ai-assist.test.cjs` | Eligibility, account changes and HTTP classification coverage |
| `backend/test/ai-release-control.test.cjs` | Fresh first/second generation, reset, pending duplicates and no retry |
| `backend/test/ai-release-integration.test.cjs` | Real local Auth tokens/profiles with mocked generation |
| `backend/test/ai-production-compatibility.test.cjs` | Retain protected storage/provider/auth boundaries while allowing the audited error/lock changes |
| `tests/ai-assist.test.cjs` | Client/UX classifications, duplicate dismissal/focus/offline, recovery and account switching |
| `docs/PIMPPILOT_AUDIT.md` | This evidence and release report |

## K. Verification

Final source verification, using the existing Node 22 installation:

| Check | Result / ignored evidence |
| --- | --- |
| Focused AI/backend/client/grounding/compatibility tests | **55/55 passed**, `.local-checks/pimppilot-audit-focused.log` |
| Full backend: `npm test --prefix backend` | **321/321 passed**, `.local-checks/pimppilot-audit-backend.log` |
| Auth/Firestore emulator AI + account/security integration | **21/21 passed**, `.local-checks/pimppilot-audit-emulators.log`; emulators stopped successfully |
| Full frontend: `node --test --test-concurrency=2 tests/*.test.cjs` | **582/582 passed**, `.local-checks/pimppilot-audit-frontend.log` |
| Android + iOS production exports, `--clear --max-workers 2` | **Passed**, both Hermes bundles emitted in `.local-checks/pimppilot-audit-native-export`; log of the same name with `.log` suffix |

No tests failed, skipped or were cancelled in these final runs. Earlier focused
test iterations exposed outdated presentation expectations and two new test
fixture/source-comparison mistakes; those were corrected before the final runs.
The full suites and exports were rerun after the production-evidence-driven
prompt/message corrections, rather than relying on the earlier export.

All provider responses in automated tests are injected mocks. Emulator tests
guard loopback hosts and synthetic project identity before writing. Existing AI
security coverage includes grounding, provider sanitisation, durable transaction
conflicts/uncertain commits, private diagnostic rules, token revocation and
current-profile enforcement. New regressions cover the three production
validation subcodes using synthetic drafts, plus prompt fallback questions tested
against the unchanged validator.

Production release builds use the unchanged guarded scripts with existing dotenv
configuration. Final **`npm run build:web` and `npm run verify:web` both passed**.
Logs: `.local-checks/pimppilot-audit-production-web.log` and
`.local-checks/pimppilot-audit-verify-web.log`. The compiled shared API factory
passed its authentication/health/Admin/marketplace/posts checks with intercepted
requests; no verification request was sent to production.

Final `dist/index.html` references
`/_expo/static/js/web/AppEntry-a5930156da4829e0d7e2e34b386a6c9c.js`, SHA-256
`e4d780be2162377742c57ce2ab5562a44ff792d9dd9ce1d52f17235a0081bea3`.
Both build-time and standalone verification reported the same asset/hash and the
existing `https://pimp-my-ride.onrender.com` API origin. This supersedes the earlier
audit iteration's local output, as well as earlier task exports. It is a local
artifact, not evidence of a deployed change.

`git diff --check` passed. A targeted local scan found no configured Gemini key
value or private-key marker in the audit changes/report. Branch remains `lesley`.

## L. Production evidence and missing evidence

The public Render `/health` endpoint returned HTTP 200 and `{"ok":true}` during
this audit. This confirms responsiveness only, not AI enablement, running commit,
Firebase readiness, provider key/model access, quota availability or billing.
No available connected tool provides Render logs/configuration. A later check
found an existing local credential-file reference matching the existing Firebase
project. This permitted tightly scoped read-only Admin SDK checks of today's
global AI counter/diagnostics and the eligibility fields of the historical test
account explicitly designated in the release runbook. It did not read prompts,
outputs, names, email addresses, unrelated profiles or authentication tokens.
Unrelated storage connectors were not used. No credential was printed or used
for generation. The earlier access limitation was resolved for these specific
Firestore/Auth reads; Render settings/logs and provider billing remain unavailable.

At **2026-10-26 02:57:55 UTC**, production `aiAssistDaily/2026-10-26` contained
`{version:1, day:'2026-10-26', attempts:5}`. Its five content-free attempt records
showed the following sequence:

| Reserved at, UTC | Provider status | Outcome |
| --- | --- | --- |
| 01:38:42 | 200 | Rejected description: `new_content_term` |
| 01:39:25 | 200 | Rejected description: `source_fact_omitted` |
| 01:42:26 | 200 | Successful, output validated |
| 01:43:27 | 200 | Rejected question: `question_unprovided_term` |
| 01:43:37 | 200 | Rejected question: `question_unprovided_term` |

This is production-confirmed exhaustion of today's five-reservation budget,
with **one successful suggestion and four failed validation attempts**. It
explains why one usable generation can coexist with no remaining allowance.
All five had recorded HTTP 200 responses; these failures were not recorded as
provider quota/billing/authentication errors. The current daily control would
allow a new day at **27 October 2026 00:00 UTC / 02:00 SAST** without changing any
counter. Records contain no UID/host/prompt/output, so they cannot prove which
user or process initiated each attempt, whether a rejection was a false positive,
or whether one click caused multiple attempts. The exact original failed HTTP
request still lacks a correlated timestamp/response.
The recorded dispatch/response intervals do not overlap. These records supply
no evidence that today's five attempts resulted from the pending-dismiss defect.

At 03:08:19 UTC, the historically designated test account had an existing
Customer (`owner`) profile, verified non-disabled Auth user, and no pending
account operations. Its accountStatus was unset, which the existing `D.active`
predicate treats as active. This supports basic eligibility for that historical
account only; it does not establish the affected session's UID, token freshness,
current Render allowlist membership or the exact cause of Error B.

Sanitised ignored evidence files:
`.local-checks/pimppilot-audit-production-readonly.json` and
`.local-checks/pimppilot-audit-production-details.json`. They contain only the
safe fields described above. The probe scripts use reads only and terminate the
Admin SDK connections afterwards.

**Code-proven:** error sources, eligibility, accounting, reset, request lifecycle
and the duplicate-dismiss lock defect. **Test-reproduced:** first/second success,
daily exhaustion, failures consuming attempts, resets, access rejection and safe
error distinctions. **Production-confirmed:** public health, today's exhausted
counter and five attempt outcomes, and the historical account's limited
eligibility fields. **Unverified:** the original request-specific rejection,
deployed revision, affected session/allowlist membership, false-positive status
of the rejected text, and current provider entitlement/billing configuration.

To confirm the incident safely, the owner/operator needs:

1. Render running commit/deployment ID and configuration **presence/selection**:
   AI enabled, provider, model, key present, allowlist valid and affected UID
   membership. Do not share the key or full allowlist.
2. The failed request's UTC timestamp, HTTP status, safe error code/classification
   and whether it was generated by the current release. No prompt or token needed.
3. If the incident was on another day, read-only `aiAssistDaily/<incident UTC day>` version/day/attempts and only that
   day's `aiAssistAttempts` content-free diagnostics: timestamps, state, HTTP
   status, failure stage/reason and validation subcodes. Records deliberately
   omit UID/content and cannot prove which user initiated an old attempt. Today's
   counter and validation subcodes have already been read as described above.
4. Only the affected `users/<UID>` role/status/verification/operation fields and
   Auth verified/disabled/revocation boundary; compare UID membership privately.
5. If diagnostics show provider rejection, the corresponding AI Studio project,
   key association, model access, quota/tier/billing status and incident-time
   provider error classification. A provider 429 alone cannot identify billing.

Do not reset counters, edit profiles, publish diagnostics publicly or generate
again merely to collect evidence. Today's exhausted allowance is confirmed;
**the live account-unavailable incident remains unconfirmed**.

## M. Owner-controlled configuration

No remote configuration change is proven necessary. If the affected UID is
intentionally unlisted, only the owner can approve adding that existing eligible
UID to the existing allowlist. Do not add an entire role or bypass approval.
If using the ignored local backend configuration, an explicit designated UID is
needed after owner selection; the current file was not edited. Validate the
intended model/key project before authorising any provider use.

If the actual incident is quota exhaustion, wait for the verified UTC reset and
inspect failure diagnostics first. Do not delete/reset counters. Provider key,
model, tier, credits and billing actions remain owner-controlled. No spending or
allowance increase is proposed as an automatic fix.

## N. Release impact

Both backend and frontend contain changes. The backend adds fields to its existing
error envelope; old clients can still consume its original code/status/message.
The new frontend supports old servers, but detailed reasons/reset require the new
backend. A later approved rollout should release backend first, then the verified
frontend. No lockfile, dependency, rules/index, storage, API success payload or
database migration is required. No EAS/Netlify/Render setting has changed.

Historical narrow release patches are not regenerated by this audit and do not
include these corrections. Do not use them as this release's complete change set.
The guarded Web builder/verifier remain authoritative for an approved release.

## O. Readiness and remaining risks

Local corrective implementation is distinct from resolving the live incident.
Do not declare production PimpPilot fixed without the evidence in L. Device-level
dismiss/background/reconnect/account-switch interaction and a separately approved
synthetic live-provider smoke test remain before a production acceptance decision.
No physical iOS/Android device or new live-generation acceptance check was used.
Durable idempotency, distributed concurrency and broader quotas remain future
design decisions; current hard global limits and conservative accounting remain.

Local implementation and the requested automated/emulator/export checks are
complete. Nothing has been published. Before an authorised rollout, review the
new failure copy and dismiss/background/reconnect/account-switch behaviour on
physical iOS/Android devices. A later explicitly approved synthetic provider
smoke test should check actual prompt compliance, latency and output rejection
rates without saving/publishing a draft; it must respect the remaining budget.
Do not infer production recovery from these mocked tests or reset the exhausted
counter to run that smoke test. Error B still requires the session/allowlist
evidence in L before it can be called resolved.
