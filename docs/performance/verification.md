# Local verification: 2026-10-28

No deployment, production data access, production load test, credentials review,
infrastructure change, commit or push. Commands ran from the original repository.
Raw local console logs are ignored by Git; the compact
[machine-readable summaries](verification-results.json) exclude environment dumps,
request data and emulator diagnostic stacks.

| Check | Result |
| --- | --- |
| `node --test --test-concurrency=2 tests/*.test.cjs` | **664 passed, 0 failed**. Includes Google auth, bookings, quotations, messaging, profile photos, upload retry contracts, email-disable boundaries and the original five new coordinator tests. |
| Final targeted frontend suite: API, coordinator, marketplace data, messaging, photo API, XHR uploads, request photos, media-feed regressions | **82 passed, 0 failed**. Run after the final explicit-read allowlist and pagination-refresh adjustments; includes two additional tests for delegated mutations and REST retry/log privacy. |
| `npm.cmd test --prefix backend` | **383 passed, 1 failed** out of 384. The failure is the historical compatibility guard described below. Includes the new sparse-search test and seven policy tests. |
| Final policy rerun after null-prototype route-map hardening | **7 passed, 0 failed**. Covers case variants, prototype property names, malformed JSON, 100 requests from 20 concurrent users, strict quotas and metrics privacy. |
| `npm.cmd run test:security` | **87 passed, 0 failed** across rules, auth/backend, marketplace, photos, showcase, profile-photo and new request-summary integration files. Uses the existing `demo-pmr-security` Auth/Firestore emulators. |
| Final emulator rerun: `node --test --test-concurrency=1 backend/test/showcase-integration.test.cjs backend/test/request-performance-integration.test.cjs` | **5 passed, 0 failed**, after the search-work cap and final shared middleware changes. |
| Final targeted transport/coordinator/policy/search suite | **64 passed, 0 failed** (subsequent focused suites above also cover later boundary adjustments). |
| `npm.cmd run build:web` | **Passed**, including production web-export verification with mocked authenticated transport. Final bundle SHA-256: `9611e00240d6f6b2ee2ada11d57543045c87f6e575b92cf2b9bb43c98a27f111`. |
| `node scripts/measure-request-performance.cjs` | **Passed** assertions for old/new header request counts, mixed journey and shared-IP behavior. See [measurements](local-measurements.json). |
| `git diff --check` | **Passed**. |

The complete final focused frontend command was:

```powershell
node --test --test-concurrency=2 tests/api.test.cjs tests/request-performance.test.cjs tests/marketplace-data.test.cjs tests/messaging.test.cjs tests/photo-api.test.cjs tests/customer-photo-transport.test.cjs tests/request-photos.test.cjs tests/media-feed-regressions.test.cjs
```

The full frontend suite ran before the last two tests were added and before the
final read-allowlist/paginated-refresh adjustments. Those exact affected paths
were subsequently tested in the 82-test run; a 666-test full-suite pass is **not**
claimed. No device-level production journey or real hosted latency was measured.

Firebase CLI initially could not access its normal local config under the
sandbox. The successful emulator runs used a temporary workspace-local
`XDG_CONFIG_HOME` and the existing cached emulator binary. No CLI login or new
Firebase project was created. That temporary configuration was removed afterward.

## Outstanding historical compatibility guard

`backend/test/ai-production-compatibility.test.cjs` compares the current indexes
to commit `1a98e86d7ce301a9f6fe396d2d0b6bbd7508fdd2`, after filtering email
indexes. That comparison already fails on committed HEAD
`781b0c5dd15df8c9a72f540d592a82b36c8e3389`. The previous profile-photo report
also records this failure. This change adds three more intentional summary
indexes; it does not remove or alter pre-existing index definitions.

The guard was left unchanged. Before release, it needs a narrow reviewed update
for the current index contract and authorized transport-log redaction. Its old
transport comparison permits Retry-After wrappers but predates removing raw
response bodies/URLs from logs. A separate read-only comparison confirms that,
after normalizing **only** retry wrappers and log redaction, authenticated
transport code still matches its pinned baseline. See
[compatibility evidence](compatibility-evidence.json). This is not a claim that
the full backend suite is green, nor permission to broadly replace the guard.

## Deployment assessment

The implementation is ready for code review and a separately authorized release
preparation, with the historical guard outstanding. It is not an unconditional
production-readiness sign-off.

The future release order is: review the guard, create the three declared
Firestore indexes and wait for readiness, deploy the compatible backend, then
deploy the frontend. Existing frontend clients can still use the backend. The
new frontend requires summary operations, so rollback must keep that API contract
or coordinate a frontend rollback. Transactional email sending stays disabled.

Remaining operating limits: process-local rate stores and upload concurrency,
60 media accesses/UID/minute, no cross-tab/device cache, short UI freshness windows,
aggregate index costs at larger histories, private-URL expiry placeholders and
Render Free cold starts/restarts. Capacity and production latency require later
authorized observation; local mocks cannot establish a supported user count.
