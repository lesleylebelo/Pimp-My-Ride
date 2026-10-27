# PimpMyRide: testing and evidence record

**Evidence review:** 27 October 2026. **Application baseline:** branch `lesley`, commit `0d7b95f`. This document distinguishes inspected source, historical execution logs, owner-reported live failure evidence and checks still required. No test suite, build, emulator, cloud mutation or billable AI call was executed for this documentation-only task.

## 1. Evidence interpretation

An implemented handler proves that code exists. A mocked passing test proves its controlled scenario. An emulator run checks local Firebase behavior under that configuration. A bundle export proves compilation/export and its embedded checks, not a deployed application. Live integration success needs its own dated, authorised evidence. None of these categories should silently substitute for another.

The saved runs below were read locally. They are ignored workspace files and may not be present in a cloned repository or a submitted ZIP. Preserve reviewed, redacted evidence excerpts before academic submission. Do not append raw logs indiscriminately: HTTP/body diagnostics, account identifiers and local paths require review even when most tests use synthetic data.

## 2. Test strategy and tools

Root `package.json` runs Node's test runner over `tests/*.test.cjs`. The UI harness in `tests/helpers/load-ui.cjs` transforms source with Babel, supplies React Native/Expo mocks and renders through React test renderer. It supports behavioral assertions but does not produce actual iOS/Android pixels or browser layout certification.

`backend/package.json` enumerates the default offline test files. Supertest checks Express responses; injected memory databases/providers/storage adapters exercise domain rules and failures. Integration files run separately under guarded Auth/Firestore emulators. The test framework is not Jest, Cypress or a verified Playwright end-to-end suite. No configured lint/typecheck command or code-coverage measurement is claimed.

Sources: root/backend manifests; `tests/helpers/load-ui.cjs`; `backend/test/helpers`; `scripts/test-emulators.cjs`; `scripts/assert-emulators.cjs`.

## 3. Recorded aggregate results

**Table T1. Real saved execution evidence**

| Test area | Test description | Expected result | Actual result | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| Frontend/application | Main offline component/service suite, 27 Oct | All recorded assertions pass | 618 tests, 618 pass, 0 fail | Recorded pass | `.local-checks/studio-frontend-tests.log` |
| Studio final focus | Updated existing Studio feature, 27 Oct | Final local interaction cases pass | 14 tests, 14 pass, 0 fail | Recorded pass; overlaps earlier aggregate | `.local-checks/studio-focused-tests.log` |
| Backend aggregate | Latest saved full offline backend run, 27 Oct | All enumerated backend tests pass | 341 tests, 341 pass, 0 fail | Recorded pass | `.local-checks/azure-reasoning-backend-tests.log` |
| Azure compatibility | Focused saved-agent/production compatibility, 27 Oct | Rejected overrides absent; remaining mock contracts work | 16 tests, 16 pass, 0 fail | Mock/intercepted SDK pass | `.local-checks/azure-reasoning-focused-tests.log` |
| Earlier assistant/Studio UI | Earlier correction regressions | Existing UI boundaries preserved | 19 tests, 19 pass, 0 fail | Historical overlapping evidence | `.local-checks/azure-instructions-ui-tests.log` |
| Firebase integration | Six guarded emulator suites | Local enforcement/integrity passes | 14 + 17 + 36 + 9 + 4 + 5 = 85 passing; script exit 0 | Historical emulator pass | `.local-checks/azure-emulator-tests.log` |
| Final Expo Web | Guarded production export + verifier | Bundle exported and transport checks succeed | 804 modules; `dist` exported; verifier JSON present | Recorded build pass | `.local-checks/studio-web-build.log` |
| Earlier Android/iOS | Hermes native bundle exports | Both platform exports succeed | iOS 1106 modules; Android 1104 modules; native output exported | Earlier-revision export pass | `.local-checks/azure-native-build.log` |
| Live Azure generation | Actual saved-agent service accepts request and returns valid output | Validated real success | Owner-supplied HTTP 400 failures; no later successful record supplied | Unresolved | `docs/AZURE_INSTRUCTIONS_FIX.md`, `docs/AZURE_SAVED_AGENT_COMPATIBILITY.md` |
| Browser/device acceptance | Real visual/interaction review | Usable intended rendering | Not performed anew; prior Studio task reported unavailable in-app Browser | Pending | `docs/PIMPPILOT_STUDIO_INTERFACE.md` |

Do not sum overlapping suites into a unique-test total. The 618 run contained the then-current 12 Studio tests; the later focused run added two more cases. A new total of 620 was not observed in a full rerun and must not be reported as an executed result. The native exports predate the final Studio interface revision; they do not certify that screen on native devices.

Existing `AZURE_FOUNDRY_VERIFICATION.md` reports Node 22.23.3 for its verification work, and `AZURE_SAVED_AGENT_COMPATIBILITY.md` records the later backend results under the same runtime. These historical statements are not a newly measured documentation-session runtime. Earlier 336-backend/611-frontend counts belong to an earlier revision and do not contradict later added tests.

## 4. Focused behavior-to-test matrix

**Table T2. Scope and practical limits**

| Area | Principal source/test evidence | Verified behavior under controlled conditions | Remaining check |
| --- | --- | --- | --- |
| Signup/sign-in | `tests/auth.test.cjs`, `accounts.test.cjs`, `firebase-isolation.test.cjs` | Isolated account checks, unverified-session exclusion, profile/account recovery | Actual verification/recovery email delivery with approved identity |
| Admin | `tests/admin-api.test.cjs`, `admin-dashboard.test.cjs`; backend review/security tests | Claim/profile restrictions, reasons, recent identity, review/status recovery | Redacted live UI walkthrough; operator permissions |
| Garage/request | `tests/garage-ui.test.cjs`, `marketplace-owner.test.cjs`; backend marketplace tests | Owned vehicles, archive/history, validated requests and versions | Native picker/keyboard and hosted records |
| Quotations | `tests/quote-comparison.test.cjs`, `quote-recommendations.test.cjs`; `backend/test/marketplace.test.cjs` | Current terms, tie/insufficient states, explicit acceptance | Approved multi-shop hosted walkthrough |
| Payment simulation | Mock capability/UI tests; backend mock configuration/marketplace tests | Explicit simulated outcomes, server amounts, idempotency, no overpayment | No real settlement expected; keep labels visible |
| Photos/showcases | Photo/upload/post lifecycle UI and backend tests | Signature/size checks, membership, stable references, safe retries | Real permission dialogs, actual compressed image appearance and bucket policies |
| Messaging | `tests/messaging.test.cjs`, `messaging-ui.test.cjs`; backend marketplace/integration coverage | Contextual authority, consent precedence, sequence/read state | Real-role consent/foreground polling review |
| PimpPilot drafting | `tests/ai-assist.test.cjs`; backend assist/grounding/Azure suites | Explicit Apply, stale-draft rejection, bounded/grounded output, safe errors | Successful live Foundry request and output quality |
| Studio | `tests/pimppilot-studio.test.cjs`; `backend/test/ai-studio.test.cjs` | Selection, six-turn history, unavailable retention, photo failures, modal departure, unsaved transfer | Real private-image provider handling, current native/Web visual review |
| Export transport | `tests/production-api-export.test.cjs`, `scripts/verify-web-export.cjs` | Exported transport targets correct configured API using intercepted fetch | Actual deployed hosting, authorised domains and CORS |

The Studio focused tests use recommendations only as automated fixtures. There is no runtime fake recommendation or fabricated successful AI response. Tests assert that draft transfer is confirmed, account-bound and unsaved; the normal form must still be submitted by the customer.

## 5. Emulator evidence details

The existing runner `scripts/test-emulators.cjs` first asserts local test configuration, then invokes rules access, backend account integration, marketplace integration, photos integration, showcase integration and profile-photo integration. The saved 85-pass evidence covers these six suites. Test guards use the synthetic `demo-pmr-security` project and loopback emulators; Supabase I/O is mocked. Expected permission denials and transaction contention may appear in a passing log.

This evidence does not prove deployed Firestore rules/indexes, current cloud policy, production account state or real Supabase operations. Do not run the integration files directly with production credentials. Emulator suites can clear disposable test data and should not share a live interactive demonstration session.

## 6. Azure evidence and known corrections

The inspected chronology records a live HTTP 400 rejection of top-level `instructions`, followed by a separate live HTTP 400 rejection of `reasoning`. The corresponding documents attribute those records to owner-provided service diagnostics, not this documentation reviewer. The latest provider source places backend-owned guidance in a developer input message and omits the reasoning override. It preserves the existing agent binding, strict schema, `store:false`, no tools, deadlines and zero retries.

Synthetic credentials and intercepted SDK transport establish serialization and error-handling behavior. They do not establish that the real saved-agent endpoint accepts every remaining option. Earlier provider documentation describing a reasoning override is superseded on that point. The GPT-5-mini deployment/active agent version remains owner-reported until actual authorised service evidence is supplied. No credential values, raw provider responses or private prompts are needed to update status.

## 7. Defects and limitations register

**Table T3. Source-backed defect history and outstanding work**

| ID | Finding | Evidence/status | Next evidence needed |
| --- | --- | --- | --- |
| D01 | Saved-agent instructions override rejected | Corrected locally; `AZURE_INSTRUCTIONS_FIX.md` | Successful reviewed deployment and authorised service attempt |
| D02 | Saved-agent reasoning override rejected | Corrected locally; `AZURE_SAVED_AGENT_COMPATIBILITY.md` | Same; no success inferred from mock pass |
| D03 | Ambiguous comparison/stale offer presentation | Corrections recorded in `SMART_QUOTATIONS.md` | Current hosted UI walkthrough |
| D04 | AI factual invention/grounding boundary | Validator and regressions in `ai-grounding.cjs`, `PIMPPILOT_GROUNDING_FIX.md` | Real output-quality review; general correctness still bounded |
| D05 | Studio unavailable codes previously checked without client prefix | Current screen normalises `api/`; fixture tests | Current deployed unavailable-state capture |
| D06 | Image-picker/retry/media-reference lifecycle complexity | Regressions and repair documents; preserved media boundaries | Native permission and actual media checks |
| L01 | Edited-image generation absent | Explicit UI/contract limitation | Separate implemented provider integration, tests and evidence before claiming completion |
| L02 | Payment settlement absent | Explicit mock gate/provider/test receipts | A separate real-provider project scope if later required |
| L03 | Portable Netlify configuration/deployed parity unverified | Generated absolute path and older build command | Actual reviewed hosting settings and deployed revision record |
| L04 | No load/accessibility/device certification | No such results supplied | Representative tests and reviewed captures |

## 8. Manual acceptance checklist — not executed here

Record date, commit, platform/version, account role, intended environment and outcome for each check. Use approved accounts and redacted/synthetic data. Do not create production records merely to obtain an academic screenshot.

1. Verify Customer, Workshop and Admin landings, plus pending/rejected/unverified account states.
2. Exercise Discover categories/search/directory/saved posts without invented items.
3. Inspect active/archived Garage entries, edit validation and private photos; verify account switching clears unrelated context.
4. Review open/direct request creation, current category, budget/date validation and unsaved cancellation.
5. With authorised test data, inspect current quotations, partial-information/tie behavior and explicit selection.
6. Observe the simulation label, backend capability gate, deposit/full/in-store states and independent appointment/service status.
7. Verify workshop-only quote/showcase/booking actions and owner-only request actions.
8. Check document status/admin review without exposing document content or performing unapproved real status changes.
9. Check private conversation consent, unread state and unavailable sending after revocation.
10. Review drafting Apply/Dismiss behavior; unavailable Azure is an acceptable truthful observation, not a generation success.
11. Check Studio landing, vehicle selection, original-photo preview, interests, unavailable retention, navigation confirmation and unsaved transfer boundary where actual generation is authorised/available.
12. Review Web widths 320/390 px, tablet/desktop, both themes, larger text, keyboard navigation, safe areas, screen-reader labels and native Camera/Gallery prompts.

Live Azure verification requires explicit authorisation for a billable call, an eligible account and the reviewed deployed revision. A controlled text-only draft should be reviewed and dismissed; do not automatically Apply, publish, submit or retry. Private-photo Studio verification additionally requires retention/isolation approval and should remain a separately controlled step.

## 9. Reproduction commands — instructions only

Existing scripts: `npm test`, `npm run test:backend`, `npm run test:rules`, `npm run test:security`, `npm run build:web`, `npm run verify:web`. Use `npm.cmd` if required by Windows shell policy. Backend engine is Node 22.x. Firebase emulator checks require local Java/binaries and synthetic-only configuration. Package scripts do not grant permission to deploy or change production data. See the technical manual before executing them.

## 10. Evidence package to attach before submission

Provide a reviewed extract showing command/date/revision, final pass/fail totals and exit status for the relevant runs. Include Web/native export summaries with their revision qualification. Add approved screenshots from the separate checklist, the final deployed revision if claimed, and an AI status note distinguishing failures from successful generation. Sign off the report's metadata and originality declaration only after student review. Keep private environment files, account documents, raw tokens, signed URLs and large unreviewed logs out of the academic package.
