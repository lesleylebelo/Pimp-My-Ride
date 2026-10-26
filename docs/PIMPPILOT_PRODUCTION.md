# PimpPilot permanent production service — 26 October 2026

Implemented locally in the original repository on `lesley`, under the owner's
explicit replacement of the earlier experimental policy. No commit, push, merge,
deployment, remote configuration change, production data write, quota reset,
provider billing change or live AI generation was performed by this task.
Existing unrelated uncommitted UI, camera/gallery and release work is preserved.

## A. Previous architecture and restrictions

Customer request forms and Workshop showcase forms share `AIAssistButton`,
`aiAssistApi`, the authenticated shared API transport and `POST /api/ai/assist`.
Express verifies Firebase tokens with revocation checking; the shared server
actor rereads the verified UID's Auth user and Firestore profile. The real Gemini
REST adapter validates structured responses and the client presents suggestions
for explicit Apply. Normal form save/submit is a separate operation.

The previous service additionally required a manually listed tester UID, three
AI attempts/minute and ten/hour/UID/process, and five durable reservations/day
globally across everyone. It updated `aiAssistDaily` and `aiAssistAttempts` before
dispatch, requiring durable diagnostic writes even after successful output.
Failures, timeouts and uncertain acknowledgements consumed reservations.

The preceding audit found five production reservations with one successful
suggestion and four grounding rejections. That is historical evidence, not a
policy retained by this overhaul. This task does not attribute every past 403 to
the same cause or claim that every rejected response was safe.

## B. Restrictions removed and historical preservation

The active generation service has **no generation-count allowance**:

- No global daily cap, first-use cap, personal generation allowance, trial,
  credits, subscription, paid unlock, weekly/monthly quota or reset window.
- No tester UID allowlist, including singular/plural environment-variable gates.
- No AI-specific minute/hour generation counters or tracked historical UID counts.
- No Firestore reservation, counter read/write, required diagnostic checkpoint,
  quota refund or quota reset in the generation path.

`ai-release-control.cjs` is retired. It exports historical collection paths only;
it has no authorisation/reservation function and is not imported by the active
service. Existing historical documents remain untouched. Their client access
rules remain denied, including administrator clients. No collection/rule/index
migration is needed. Only synthetic emulator fixtures were seeded/removed during
tests; no production history was reset, deleted or rewritten.

Old release runbooks and the preceding audit now carry a superseded banner.
The four experimental patch generators fail immediately with a pointer here,
preventing their old baseline patches from being mistaken for this release.
The old patches remain historical artifacts and must not be applied to deploy
the permanent service.

## C. Permanent eligibility

| Account | Supported operation |
| --- | --- |
| Authenticated, email-verified, active Customer (`owner`) | Create/edit Service Request draft assistance |
| Authenticated, email-verified, active, approved Workshop (`shop`) | Create/edit Showcase draft assistance |
| Admin, unsupported role or mismatched draft kind | Denied; no Admin generation interface added |
| Unverified, disabled, suspended/archived, missing/invalid profile, or Workshop pending/rejected | Denied |
| Pending status/review/provisioning operation | Denied |
| Invalid/revoked/expired token or token predating Auth creation/revocation boundary | Denied; session renewal required |

The existing legacy active-status policy accepts an unset accountStatus; it was
not changed. Required profile/onboarding/navigation checks also remain. There is
no promise that an unverified or otherwise incomplete registration is eligible.

Identity is taken only from the verified token. The AI request cannot supply an
owner UID, role, account status or another user's record ID. The server reads no
other user's request, vehicle or private media to generate suggestions. Successful
output is withheld if fresh account checks detect a changed UID, role, approval
or restrictions. Account switching clears previews; normal ownership checks on
actual request/showcase saving remain unchanged.

No UID registration is necessary for an otherwise eligible Customer or Workshop.
AI still requires working provider configuration and the operational enablement
switch, which is a service kill switch rather than tester/trial access.

## D. Generation and validation reliability

The provider remains a real Gemini REST request, once per intended operation.
It receives only the supported text fields, authoritative category choices,
field limits and safe vocabulary guidance. No images, private media, payment
data or automatic tools are added. Draft/category text remains untrusted input.

Prompt and validator now agree on a broader general clarification vocabulary:
the server supplies `questionWords` alongside `editorialWords`. The two-question
template restriction is removed. Questions about timeframe, deadlines, budget,
reference photos, desired outcomes and other general clarification can use normal
neutral phrasing, while new technical services/specifications or presupposed
conditions remain rejected. Empty questions remain valid.

Safe grammatical framing such as “looking for help” and bounded equivalents such
as fix/repair and matt/matte are accepted. Existing spelling/action inflections
remain supported. Supplied facts must still be retained. Numeric values,
currencies, negation, completion status and sensitive clause associations remain
protected; invented parts/services/prices/vehicles/warranties remain rejected.
The grammar/meaning checks are deterministic and conservative, not a claim of
perfect semantic understanding. Arbitrary new technical paraphrases are not
automatically trusted. Actual provider acceptance/quality still needs the
approved smoke test in M; mocked success is not proof of live model compliance.

Provider schema and successful API response contracts remain:
title, description, a supported category/null, and at most five follow-up
questions. Unknown fields, missing required fields, invalid types/categories,
out-of-bounds strings, unfinished/blocked candidates and unsafe content fail.
Titles are at most 100 characters, request descriptions 300, showcase descriptions
2,000, and questions 180. The provider output-token bound remains 1,800, and the
response envelope character bound remains 65,536. No token limit was increased.

A narrow local formatting repair accepts **one entire `json` code fence** around
otherwise valid JSON. Trailing prose, substring extraction, truncated JSON and
unsafe content are still rejected. The repaired object passes exactly the same
structural and grounding validation. No second provider request, fabricated
suggestion, source-text substitution on failure or dummy success is used.

## E. Concurrency, deduplication and lifecycle

The only AI-specific process state is a map of work **currently in flight**:

- At most four active generation operations per backend process.
- At most one independent active operation per UID/process.
- A matching optional request ID and identical draft fingerprint for that UID
  await the same in-flight promise and cause one provider dispatch.
- Reusing that in-flight ID with a different draft returns a conflict.
- Another UID cannot access that promise or result. Its own request is separate.
- Entries are removed on completion, validation failure or timeout. A settled
  request never consumes future permission to generate, even on the same day.

The new client supplies a fresh opaque request ID per explicit generation.
Older clients omitting it remain supported with the normal in-flight busy guard.
This is **process-local in-flight deduplication**, not durable exactly-once
delivery, completed-response replay or a distributed lock. After settlement,
another explicit request is a new generation. Multiple backend instances would
each have four slots; this task changes no instance/scaling settings. There is
no automatic client/provider retry, nor a claim that timeout abort guarantees
the provider did no billable work.

The existing general Express protections remain unchanged: 90 ordinary API
requests/minute/IP and 60/minute/UID, separate session-heartbeat budgets, token
verification, CORS, JSON/payload limits and normal endpoint security. These are
short-lived API flood protections shared with other operations, not AI credits
or daily generation allowances. Ten immediate generations per eligible user
pass the HTTP regressions. A sufficiently large burst or accumulated API traffic
can still receive a temporary busy response; the endpoint is not unprotected.

Provider work retains the 15-second deadline and AbortController. Client transport
health/cold-start and API deadlines remain separate existing bounds. No health
polling/retry loop has been added. Request input is at most 8 KiB, with bounded
categories and output. There is no explicit input-token budget; bounded input,
fixed guidance, output bounds and provider-side controls still matter for cost.

UI locks survive Dismiss, blur, offline and background transitions until the
existing request settles. Those events discard late previews, never auto-generate
or auto-apply. Foreground/focus/rerenders do not send requests. Unknown initial
AppState does not permanently disable the feature. After settlement an explicit
generation/regeneration works. Only explicit Apply changes local draft fields;
normal save/publish is still separate. Dismiss cannot undo a provider request
already dispatched. No cancellation refund/accounting exists because there is no
application generation allowance.

Telemetry is one best-effort, content-free operation event: random correlation
ID, duration, provider status and fixed failure/validation subcodes. No prompt,
output, UID, token, key or fingerprint is logged. Logging failure cannot reject
a valid result. There is no persistent usage counter, telemetry-based cut-off or
historical-state dependency.

## F. Error handling

Existing safe `error.fields.aiReason` metadata distinguishes:

| Condition | Presentation |
| --- | --- |
| Provider 429, active concurrency or general request throttling | Temporarily busy; try again shortly |
| Provider unavailable/unexpected failure | Temporarily unavailable; try again |
| Client network/offline failure | Check connection and try again |
| Provider connection failure or timeout | Provider connection/timing failure; explicit retry available |
| Invalid/ungrounded output | Could not prepare a reliable suggestion; retry or continue editing |
| Actual account restriction | Current account status/access cannot authorise the operation |
| Expired/revoked authentication | Sign in again |
| Missing/invalid provider configuration, key/model access | Service unavailable; no secret/internal detail displayed |
| Provider 402 | Provider billing review requires owner action |
| Request ID conflict | Another draft is being processed; wait for it to finish |

Account/category infrastructure lookup failures are sanitised service errors,
not fabricated ineligibility. Provider 401/403 never become customer account
403s. Provider 429 never becomes a personal generation allowance. Its exact
project quota/rate/spend cause cannot be inferred from status alone. Unknown
failures remain honestly unknown service failures; the app does not invent a
billing, eligibility or precise quota diagnosis.

Old backend `daily_allowance`/`tester_required` responses are tolerated during
rollout as service-unavailable, with no displayed credits, personal allowance,
tester requirement or reset time. This compatibility handling does not bypass
an old backend; backend-first deployment remains required. All failures preserve
the original draft. Raw unexpected provider messages and infrastructure exception
text are not displayed.
The new client also sends `requestId`, which the old strict draft-input schema
does not accept. Therefore the new frontend must not be deployed before the new
backend. The new backend accepts both old four-field requests and new requests
with the optional identifier, permitting a backend-first transition.

## G. Real provider and configuration

Production `server.cjs` uses `createServices`, whose default AI provider is the
real `createAIProvider()` Gemini REST adapter. It has no demo generation mode,
canned response path, OpenAI fallback, default model discovery or automatic retry.
Injected provider implementations exist for tests, not as a production setting.

| Variable | Requirement |
| --- | --- |
| `PMR_AI_ASSIST_ENABLED` | `true` for normal operation; explicit emergency service switch |
| `PMR_AI_PROVIDER` | `gemini` |
| `PMR_AI_MODEL` | Explicit supported `gemini-3.5-flash-lite` or legacy `gemini-2.5-flash-lite`; retain the owner's approved model |
| `GEMINI_API_KEY` | Existing valid server-only key with access to the chosen project/model; never public |
| `PMR_AI_TEST_UIDS`, `PMR_AI_TEST_UID` | Obsolete; ignored regardless of presence, absence, emptiness or malformed contents |

`.env.example` remains disabled with an empty key for safe configuration; it no
longer requests tester UIDs. There is no generation-limit variable, hidden default
quota or automatic tester-mode restoration. Existing Firebase, private storage,
CORS, mock-payment and infrastructure configuration is unchanged.

The adapter sends exactly one direct request to the selected allowlisted
`generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`
endpoint using the server-only `x-goog-api-key` header. Schema, media restrictions,
thought metadata handling, key sanitisation and no-fallback constraints remain.
Tests intercept this actual adapter and verify the URL, headers, schema and one
dispatch, including successful and failing responses.

## H. Files changed in this overhaul

The preceding audit's uncommitted changes are retained and extended where needed.
The following list describes this task, not every existing working-tree change.

| Files | Purpose |
| --- | --- |
| `backend/ai-assist.cjs` | Remove allowance/allowlist/accounting path; bounded in-flight map, matching-request coalescing, fresh access and safe telemetry |
| `backend/ai-release-control.cjs` | Retire executable release/quota control; historical paths only |
| `backend/services.cjs` | Remove release-control injection; retain real provider and optional diagnostic injection |
| `backend/ai-errors.cjs` | Remove retired accounting/reset errors; sanitise account/category infrastructure classifications |
| `backend/ai-grounding.cjs` | Safe framing/equivalents and broad general clarification vocabulary without removing fact guards |
| `backend/ai-provider.cjs` | Aligned prompt and narrowly bounded JSON-fence repair; real provider unchanged |
| `backend/.env.example` | Permanent service documentation and obsolete UID configuration removed |
| `src/features/marketplace/components/AIAssistButton.js` | Background/foreground safety while retaining pending lock, account separation and explicit Apply |
| `src/features/marketplace/services/aiAssistApi.js` | Per-operation opaque request ID; remove reset metadata propagation |
| `src/features/marketplace/services/pimpPilotPresentation.js` | Production error copy without allowance/credit messaging |
| `backend/test/ai-assist.test.cjs` | HTTP repeated/unlisted access, real adapter mocks, parsing/repair, role and sanitisation coverage |
| `backend/test/ai-grounding.test.cjs` | Safe paraphrase/question acceptance with retained unsafe-content regressions |
| `backend/test/ai-release-control.test.cjs` | Replace quota expectations with unrestricted sequential usage, in-flight safety and historical retirement tests |
| `backend/test/ai-release-integration.test.cjs` | Real local Auth/Firestore access, thirty generations, unchanged historical fixture timestamps and client rule denial |
| `backend/test/ai-production-compatibility.test.cjs` | New production policy invariants; retained real provider/auth/dependency/rules protections |
| `tests/ai-assist.test.cjs` | Both roles/platforms, ten successive previews, background/unknown state, draft/error/account safety |
| `scripts/prepare-ai-release.cjs`, `scripts/prepare-pimppilot-model-release.cjs`, `scripts/prepare-pimppilot-grounding-release.cjs`, `scripts/prepare-pimppilot-output-release.cjs` | Retired experimental generators fail immediately |
| `docs/AI_ASSIST.md`, `docs/AI_DAILY_TESTING.md`, `docs/AI_ASSIST_RENDER_RELEASE.md`, `docs/PIMPPILOT_GEMINI_35_MODEL_UPDATE.md`, `docs/PIMPPILOT_GROUNDING_FIX.md`, `docs/PIMPPILOT_OUTPUT_FIX.md`, `docs/PIMPPILOT_AUDIT.md` | Superseded banners; historical evidence/body retained |
| `docs/PIMPPILOT_PRODUCTION.md` | This implementation, evidence and coordinated-release report |

`backend/app.cjs` was inspected; its general security/rate values and AI
classification from the earlier audit are unchanged by this task. No payments,
quotations, media/storage, auth transition, navigation or visual redesign changes
were made. No dependencies or release verification scripts were updated.

## I. Verification

All automated provider responses are mocks; all automated data writes use local
guarded Firebase Auth/Firestore emulators with synthetic records. No live Gemini
credits were consumed. Final verification used the existing Node 22 installation:

| Check | Final result / ignored log |
| --- | --- |
| Focused AI/backend/grounding/compatibility/client tests | **60/60 passed**, `.local-checks/pimppilot-overhaul-focused.log` |
| Full backend, `npm test --prefix backend` | **322/322 passed**, `.local-checks/pimppilot-overhaul-backend.log` |
| Full frontend, `node --test --test-concurrency=2 tests/*.test.cjs` | **586/586 passed**, `.local-checks/pimppilot-overhaul-frontend.log` |
| Local Auth/Firestore AI + account/security integration | **19/19 passed**, `.local-checks/pimppilot-overhaul-emulators.log`; emulators shut down successfully |
| Android/iOS exports, `--clear --max-workers 2` | **Passed**, `.local-checks/pimppilot-overhaul-native-export.log`; both Hermes bundles in the matching output directory |
| Guarded `npm run build:web` | **Passed**, `.local-checks/pimppilot-overhaul-production-web.log` |
| Standalone `npm run verify:web` | **Passed**, `.local-checks/pimppilot-overhaul-verify-web.log` |
| `git diff --check` | **Passed** |

All final test runs have zero failures, skips or cancellations. The AI/security
and production-compatibility regressions are included in the focused/full backend
results; obsolete quota/allowlist assertions were replaced with the new policy,
while provider/auth/schema/rules and unrelated runtime protections remain.

Specific proof includes `authenticated AI HTTP allows unlisted Customers and
approved Workshops to generate ten times each`, `first, second, sixth, tenth and
later generations never depend on allowance or tester configuration`, matching
in-flight ID coalescing/conflict isolation, failed/timeout request recovery,
content-free non-gating telemetry, real adapter URL/headers/schema and single-call
repair tests, unsafe fact/number/negation/completion tests, thirty real-emulator
authenticated requests with identical historical data/update timestamps, and
`both roles can preview ten successive generations on every platform without
automatic Apply`.

The production Web entry is
`/_expo/static/js/web/AppEntry-0fbdbeefb0b37406d17f7078bac2522d.js`, SHA-256
`2a182c6175865813269ecbb3bef49e9c134597a5636fbedd3d0f314d42d8c114`.
The guarded build and standalone verifier report the same entry/hash and existing
Render origin. The actual compiled shared API factory passed its intercepted
authentication/health/Admin/marketplace/posts requests. These verification
requests were mocks, not production writes or live provider calls. The guarded
builder/verifier source is unchanged. This is a local artifact; it does not
establish that the live Netlify site serves it.

## J. Provider limitations and cost reality

Removal of application generation allowances is explicitly owner-authorised.
There is no replacement subscription or user-credit system. Total provider usage
can grow with legitimate sequential use; concurrency/timeouts are not a daily
spending cap. The additional fixed prompt guidance also contributes input tokens.

Google still controls project/model entitlement, request/token limits, capacity,
tier/credits/billing and pricing. Provider daily windows are independent of the
retired application UTC counter. Consult the owner's actual project in AI Studio
and Google's [rate-limit documentation](https://ai.google.dev/gemini-api/docs/rate-limits)
and [billing guidance](https://ai.google.dev/gemini-api/docs/billing).
No key/model access, current billing balance or live success-rate claim is made
from mocked tests. This task did not query provider account billing or submit a
live generation. Earlier audit HTTP 200 records are historical evidence only.

Provider 402 requires an owner billing/credit decision. A 429 needs its actual
project quota/rate details rather than an assumed payment diagnosis. Invalid
key/model access requires the owner to verify key restrictions and entitlement.
There is no automatic purchase, paid-tier activation, spending-limit increase,
model/provider switch or extra repair/retry call.

## K. Render settings and configuration impact

**Backend source must be updated.** Changing environment variables alone cannot
remove the old daily reservation code. Conversely, the new source does not
require any tester variable to be present or changed before it can work.

After the new backend revision is deployed and verified, the owner may remove
`PMR_AI_TEST_UIDS` and `PMR_AI_TEST_UID` from the existing Render service as obsolete
cleanup. Do not remove them while still running an old allowlist-gated revision.
Their continued presence on the new source does not gate access or restore quotas.
No daily-limit environment update or database counter reset is needed.

Verify the four provider settings in G privately. Preserve a working existing
enabled/model/key configuration. Never print/copy the key into public variables
or logs. No mandatory model/key/billing change is established by this overhaul.
Preserve the actual existing Netlify/localhost CORS allowlist and all Firebase,
Supabase, mock-payment and Render settings; do not replace them with blueprint
defaults. No live setting was modified here.

## L. Exact coordinated release sequence — not executed

1. **Review and authorise a coherent backend source release.** The current
   working tree contains unrelated uncommitted work. Use the reviewed complete
   backend revision and compatible modules; do not apply an old experimental
   patch or copy only `ai-assist.cjs` onto an incompatible running baseline.
   Capture the current Render revision/configuration for rollback. This task
   creates no commit, push, merge or release.
2. **Deploy backend source first** to the existing `pimpmyride-api` service at
   `https://pimp-my-ride.onrender.com`. Existing settings remain `rootDir: backend`,
   Node 22, `npm ci`, `npm start`, and `/health`. No new service/database/site.
3. **Verify configuration privately.** Confirm the four settings in G and the
   running revision. Optional obsolete UID variable cleanup follows the source
   update, not precedes it. Preserve existing secrets and CORS origins. Do not
   edit historical counter/attempt documents. An emergency switch can remain
   off during rollout and be enabled only under the owner's release approval.
4. **Check backend readiness.** GET `/health` must return `{"ok":true}`. Health
   alone does not prove provider availability or AI policy version. Confirm
   deployed source no longer imports the retired control. Inspect safe operation
   telemetry and perform the separately approved checks in M; never probe AI
   availability by an unapproved generation or by minting test accounts/tokens.
5. **Build and verify frontend** from the reviewed original checkout with the
   existing public Firebase values and Render API URL. Use the guarded commands
   below; a local bundle's environment cannot be repaired by Netlify settings
   after compilation.
6. **Only after explicit release approval**, upload that exact verified `dist`
   to the existing Netlify site. Do not create/relink a site or rebuild between
   verification and upload. Perform the approved role checks in M on the actual
   deployed entry asset. Existing EAS/native release processes remain unchanged.

PowerShell build/verify (safe local commands; repeat for any future source change):

```powershell
Set-Location 'C:\Users\Mo\OneDrive\Documents\Business Information Technology\2026\Semester Two\DSW02B1\React Native Project\Pimp My Ride\PimpMyRide'
$env:PATH = (Join-Path (Get-Location) '.local-checks\pmr-tools\node22\node-v22.23.3-win-x64') + ';' + $env:PATH
if ((git branch --show-current) -ne 'lesley') { throw 'Expected original lesley checkout' }
Remove-Item Env:EXPO_NO_DOTENV -ErrorAction SilentlyContinue
Remove-Item Env:EXPO_NO_CLIENT_ENV_VARS -ErrorAction SilentlyContinue
$env:EXPO_PUBLIC_PMR_LOCAL_DEMO = 'false'
$env:EXPO_PUBLIC_API_URL = 'https://pimp-my-ride.onrender.com'
npm.cmd run build:web
if ($LASTEXITCODE -ne 0) { throw 'Build/verifier failed; stop' }
npm.cmd run verify:web
if ($LASTEXITCODE -ne 0) { throw 'Export verifier failed; stop' }
```

Existing-site upload, **only after separate deployment authorisation**, not run:

```powershell
npx.cmd --no-install netlify deploy --prod --dir .\dist --site 887d1819-c17e-4056-af4f-70f364d8d238 --no-build
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed' }
```

For rollback, first use the existing service switch to stop provider work if
needed. Restore the captured known-good backend/frontend revisions together and
their required settings. Restoring an old revision may reintroduce its obsolete
allowlist/cap; it must not be advertised as the permanent service. No history
reset/migration is a rollback step. Do not replay AI requests automatically.
If rollback requires the old backend, restore its compatible old frontend first
while AI is disabled, and retain the captured private settings needed by that
revision. Keep AI disabled rather than serving the retired tester/cap policy as
the permanent feature; obtain an owner-approved forward fix before re-enabling.

## M. Remaining explicitly approved live checks

No production generation is authorised by this report. Minimum acceptance after
an approved release is **three explicit provider calls** with existing approved
test accounts and synthetic non-sensitive text, under separate owner approval:

1. Verified active Customer: open a supported request draft, generate once,
   inspect the genuine response, and explicitly Apply only to local form state.
   Do not submit/create a request. Check supplied facts and preview/application.
2. Explicitly regenerate once after settlement, inspect, then Dismiss. Confirm
   no silent draft overwrite, duplicate call, allowance or manual UID gate.
3. Switch to an active approved Workshop. Open a supported showcase draft,
   generate once and Dismiss. Do not save/publish or upload media. Confirm role
   separation and existing Workshop eligibility.

Inspect HTTP status and content-free diagnostic classification if any call fails;
stop rather than automatically repeating until successful. Do not enable billing,
reset counters or relax safety rules. Provider compliance/latency and actual
false-rejection rate require this live evidence; unit tests cannot establish them.
Negative eligibility and ten-generation cases are already covered by mocks and
emulators; ten paid/live calls are not required just to repeat that proof.

Physical Android/iOS checks remain for keyboard/modal dismissal, background and
foreground, focus/navigation/offline recovery, enlarged text and account switching.
Exports establish bundle compatibility, not physical-device acceptance. No live
production account was used for automated generation, and no browser/device UI
acceptance is claimed solely from React renderer tests.

## N. Readiness verdict and seven required answers

The implementation is a real-provider production service with no application
generation-count policy. Local source and automated/export verification are
distinct from deployment and provider acceptance. The existing deployed backend
does not receive these changes until a separately authorised source release.
No claim is made that the live site already operates under the new policy.

| Required question | Answer and evidence |
| --- | --- |
| Newly registered eligible Customer without allowlisting? | **Yes in the new implementation**, after required verification/profile eligibility. Authenticated emulator Customers and HTTP `other` user generate without UID settings; active source has no allowlist dependency. |
| Approved Workshop without allowlisting? | **Yes.** Real emulator approved Workshop and real-adapter HTTP mocks pass; pending/rejected Workshops remain denied. |
| Ten suggestions in one day without an application quota? | **Yes**, subject to actual provider availability and normal flood/concurrency protection. HTTP tests run ten per account; service tests go beyond ten and across dates with no history-based gate. |
| Multiple users without a tiny shared daily allowance? | **Yes.** Independent users generate repeatedly; even exhausted historical fixture documents keep identical data/update times. Four active slots are temporary resource protection, not a shared consumable allowance. |
| Remaining failures honestly attributed? | **Known tested classes are distinguished.** Provider limit/billing/access/network/timeout, invalid output, genuine account/session restrictions and service lookup errors are not called personal quota exhaustion. Unknown root causes remain generic service failures, not invented exact diagnoses. |
| Real Gemini without demos/fabricated output? | **Yes in production code.** The server's default adapter makes a real configured Gemini REST call. Actual adapter mocks assert URL/schema/headers and one dispatch; no production fallback generator exists. Live entitlement remains pending M. |
| Old five-attempt quota removed from active path? | **Yes.** No runtime import/reservation/counter/tester check remains; historical module exports paths only. Static boundary tests plus emulator unchanged-history checks protect this. |

No durable cross-instance exactly-once guarantee, infinite parallel capacity,
perfect semantic validation, external spend cap or current provider entitlement
is promised. Those are explicit service realities, not hidden application quotas.
Release acceptance remains conditional on reviewed coordinated deployment and the
separately approved provider/device checks above.
