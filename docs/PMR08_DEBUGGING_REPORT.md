# PMR-08 controlled debugging report

Date: 11 October 2026. Scope: security precheck and application test infrastructure only.

## Starting state and scope

The inner application repository started clean on branch `lesley`, commit
`058b3a05f40f052fb7c59be908254b01ad1213fb`. Existing outer Git-link state was
preserved. No commit, dependency installation, production source change, schema
change, migration, live configuration change, deployment or production data
operation was performed. Prior assessment documents remain historical records.

## PMR-06 security precheck

Local signature checks inspected the tracked checkout (183 tracked files) and
61 reachable commits. No matching Supabase secret-key literals, long JWT
literals or private-key headers were found. The local app `.env` contains no
server-credential assignments; no `backend/.env` exists; server credentials in
`backend/.env.example` are blank. This process has no `SUPABASE_SECRET_KEY`.
No credential values were printed, recorded here or sent to an external service.

These are limited signature/presence checks, not proof that an externally
exposed credential was revoked. They exclude unreachable history, external
messages, screenshots, deployment logs and other credential formats. Existing
OPERATIONS/HANDOVER records say rotation is unconfirmed. No local evidence
established that the exposed key remains active; active status remains unknown.

The project owner must privately verify:

1. The previously exposed key is revoked in Supabase, rather than merely creating
   a replacement. Review available credential-use/security records privately.
2. Render has the intended replacement in its server-only configuration and the
   running deployment uses that configuration. Never paste keys or credential JSON.
3. Private verification/photo bucket settings and all applicable storage policies
   deny unintended anonymous/authenticated access. Public showcase storage is a
   separate intentional scope.
4. Server credentials have not entered client public environment variables or
   shared artifacts. Escalate urgently if the old exposed key is still active.

No remote credential probe, rotation, dashboard access or live-data access was
performed. PMR-06 is unresolved and was not marked safe or closed.

## Original failures and causes

The fresh, unmodified `npm.cmd test` reproduced 221 tests: 137 passed, 84 failed,
zero skipped/cancelled/todo.

| Original failures | Root cause |
| ---: | --- |
| 81 | Shared native mock omitted `Animated`; screen-specific native mocks also replaced shared exports completely. Real PrimaryButton constructs Animated.Value. |
| 2 | Tests expect initial SignIn, while the current navigator starts guests/unverified users at Splash. The documentation and current UI do not establish an approved immediate-route change. |
| 1 | GIF rejection assertion expected older JPEG/PNG wording; the current shared validator mentions WebP as well. |

Repairing native mocks exposed additional obsolete photo selectors, saved-file
prefixes, warranty formatting and a padding-based request selector. It also made
the real Garage pagination defect visible. Updating photo selectors then exposed
the private picker MIME disagreement, previously hidden behind earlier failures.

## Files modified and rationale

All paths are relative to the application root.

| File | Change |
| --- | --- |
| `tests/helpers/load-ui.cjs` | Add deterministic Animated.Value/interpolate/timing/View exports. Merge partial native overrides into per-load defaults, preserving explicit overrides and preventing cross-load leakage. |
| `tests/ui-harness.test.cjs` (new) | Four regressions exercise the real button, press animation values, partial overrides, explicit animation overrides, load isolation and loading/accessibility semantics. |
| `tests/marketplace-photos.test.cjs` | Use current control labels scoped to existing photo-card IDs. Update filename/rejection-text assertions. Preserve upload, preview, account-change, confirmation, retry and attachment-bound checks. Keep the JPEG/PNG picker assertion unchanged and guarantee cleanup for its failure. |
| `tests/uploads.test.cjs` | Verify filenames inside the appropriate document card instead of relying on the removed Saved prefix. Preserve upload/retry/selection assertions. |
| `tests/quote-comparison.test.cjs` | Verify the separate warranty label and value within the correct quotation; retain missing-warranty fallback and acceptance assertions. |
| `tests/marketplace-owner.test.cjs` | Identify the vehicle selector by its semantic component title instead of padding. Separate Garage pagination from archive/restore so both remain independently tested; retain the failing pagination assertion with a clearer error. |
| `tests/photo-api.test.cjs` | Update GIF rejection wording only; preserve invalid-file rejection and zero-request assertions. No WebP acceptance expectation was added. |
| `tests/password-recovery.test.cjs` | Check guest screen inventory before the unchanged initial-route assertion; always unmount on failure. |
| `tests/verification-ui.test.cjs` | Check guest-only inventory for all three unverified roles, then assert the unchanged SignIn expectation for each; always unmount. |
| `docs/PMR08_DEBUGGING_REPORT.md` (new) | Record scope, security limits, changes, results, unresolved failures and next-task recommendation. |

No test was disabled or skipped. The original combined Garage coverage remains:
its pagination assertion still fails, while confirmation/version/archive/restore
checks now execute independently. Four new harness tests plus that split explain
the increase from 221 to 226 total tests.

## Tests executed and results

Runtime: Node 24.19.0. Backend production target remains Node 22.x; validation
on that required runtime was not performed.

| Check | Passed | Failed | Total |
| --- | ---: | ---: | ---: |
| Unmodified application baseline: `npm.cmd test` | 137 | 84 | 221 |
| Focused new harness: `node --test --test-reporter=tap tests/ui-harness.test.cjs` | 4 | 0 | 4 |
| Application after native-loader correction, before assertion corrections | 205 | 20 | 225 |
| Final focused affected suites | 71 | 4 | 75 |
| Final complete application: `npm.cmd test` | 222 | 4 | 226 |
| Backend: `npm.cmd run test:backend` | 137 | 1 | 138 |
| Isolated failing backend HTTP case | 1 | 0 | 1 |

Every listed runner reported zero skipped/cancelled/todo. Intermediate focused
runs guided selector corrections; the final focused run and complete app run
agree on the same four failures.

Reproduce the final focused run from the application directory:

```text
node --test --test-reporter=tap tests/ui-harness.test.cjs tests/marketplace-photos.test.cjs tests/uploads.test.cjs tests/quote-comparison.test.cjs tests/marketplace-owner.test.cjs tests/photo-api.test.cjs tests/password-recovery.test.cjs tests/verification-ui.test.cjs
```

Isolated backend diagnostic:

```text
node --test --test-reporter=tap --test-name-pattern="photo routes validate" backend/test/http.test.cjs
```

Syntax checks passed for the loader and new harness test. `git diff --check`
passed. Git review confirmed no changes to App.js, src, backend, dependencies,
database rules, scripts or deployment configuration. Test logs were written to
the local temporary directory, not tracked project artifacts. Emulator, browser,
native-build and production-service tests were not run.

## Remaining failures and classification

| Test | Classification | Evidence and disposition |
| --- | --- | --- |
| `marketplace-owner.test.cjs`: garage appends vehicles while scrolling | Confirmed production defect, PMR-10 | Garage does not connect its cursor handlers to Page. The test still requires scrolling to load the next vehicle page. Production fix is outside this increment. |
| `marketplace-photos.test.cjs`: picker cancellation and invalid types/sizes | Confirmed cross-layer disagreement, PMR-14 | Actual picker types include WebP; the retained private-photo contract expects JPEG/PNG, matching supplied private bucket setup. Earlier cancellation/validation/selection/discard checks now run before this assertion. |
| `password-recovery.test.cjs`: guest navigation | Unresolved behaviour expectation | Actual initial route is Splash, expected SignIn. Guest-only screen inventory passes. Preserve expectation until intended landing behaviour is agreed. |
| `verification-ui.test.cjs`: unverified role navigation | Unresolved behaviour expectation | All owner/shop/admin unverified cases expose only guest screens; their initial route is Splash, expected SignIn. No authorisation behaviour was altered. |
| `backend/test/http.test.cjs:62`: photo-route validation | Intermittent backend failure, PMR-15 | Full suite encounters read ECONNRESET; isolated case passes. Cause remains unconfirmed. No backend test or implementation was changed. |

No new independent production defect was established beyond the original audit.
This increment supplied executable confirmation of PMR-10/PMR-14 and clearer
evidence for the route disagreement and PMR-15. It does not resolve other audit
findings or establish release readiness.

## Regression risks and next task

Animated timing completes synchronously in tests and is not a native animation
driver simulation. The mock is intentionally limited to the exports used by
PrimaryButton; unsupported native APIs still require explicit modelling. Changes
to real native timing, visuals and device behaviour need separate runtime checks.
Partial native overrides now retain shared defaults; focused tests verify that
explicit animation overrides remain honoured and do not leak across loads.

Before clearing the two route failures, decide whether guests should begin with
Splash then SignIn (current implementation) or directly with SignIn (retained
expectations). Do not silently change authentication/navigation behaviour or
rewrite assertions merely to achieve a green suite.

Recommended next production debugging increment: PMR-01, the reproduced
showcase-card crash, with approval and real API-shaped fixtures. PMR-10 and
PMR-14 need separate approval to clear their current test failures; PMR-02/03
data-integrity defects remain high-priority stabilisation work. PMR-06 requires
private operational verification before release.

Work stops after this report. No other issue is automatically authorised.
