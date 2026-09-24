# PimpMyRide implementation handover

## Decisions and scope

The application remains in this inner `PimpMyRide` directory. Earlier inspections
recorded remote https://github.com/lesleylebelo/Pimp-My-Ride, branch `lesley`,
and Render deploying `main`; these are historical configuration observations.
During the photo continuation, both `git rev-parse --verify HEAD` and
`git symbolic-ref HEAD` failed, with the index showing files staged as additions.
No current branch or commit is therefore asserted. Codex has not repaired Git
metadata or changed the index. Preserve this state for the user's review before
any later Git operation. The outer workspace Git link is pre-existing and is
not restructured. No push, merge, deployment or live writes are authorized here.

Preserve one sign-in, trusted role/claim routing, no public admin signup, automatic
verification refresh without signing out, approved-shop marketplace gating,
recovery, SecureStore sessions and local 60-second AsyncStorage cooldown. Cached
roles never authorize operations. Firebase Spark, Render free and Supabase free:
no paid scheduler, billing changes or new paid services.

Scope: [team PDF](project-context/PimpMyRide%20Team%20Project%20Scope%20and%20Plan.pdf).
The provided PDF was copied from the parent project directory; no separate exported
screenshots were supplied in docs/project-context at the start.
Figma access confirmed through MCP on 22 September 2026:
https://www.figma.com/design/ECQ15uMfVAnhrp9xihuH5l/Untitled
Prototype page 0:1; inspected page journey inventory plus design context for
132:37 (Add Vehicle), 177:47 (Prepare Quote), 197:71 (Review Application),
197:78 (Suspend Owner). No Figma writes. Existing UI is preserved.
For the booking milestone on 23 September, context and screenshots were also
read for 28:31 (Compare & Select), 132:39 (Confirm Booking), 145:45 (Booking
Details), and 177:52/177:53 (shop bookings). The approved flow has the shop set
an appointment after acceptance; prototype dates, ratings and photos are not
presented as real data. Browser visual verification remains outstanding.

Conflicts: PDF Firebase Storage references are superseded by Supabase/Express;
Figma separate role sign-in and 8-character hint are superseded by shared sign-in
and current 12-character validation. PDF definition of done mentions Git commits;
the user's no-commit/push instruction controls this work. PDF includes open AND
direct requests; chat and advanced notifications are optional. Payments, AI,
AR, rewards and a parts marketplace are explicitly out of scope.

## Architecture and folders

React Native 0.86.3, React 19.2.3, Expo 57 and React Navigation implement the
JavaScript client. Firebase Auth identifies users; Firestore stores profiles,
categories, marketplace records/bookings, operations, receipts, audit and presence. Express 5/Firebase Admin on
Render authorize privileged operations. Separate private Supabase buckets hold
verification documents and vehicle/request photos. SecureStore holds native Auth persistence; AsyncStorage contains a
small account-scoped landing cache and the local login cooldown.

| Location | Responsibility |
| --- | --- |
| `App.js`, `src/navigation/` | Providers, presence tracker and role-based navigation |
| `src/features/auth/` | Shared sign-in, registration, verification, hosted password recovery, document/account UI |
| `src/features/admin/` | Dashboard, accounts/reviews, categories, audit, presence and reauthentication |
| `src/features/customer/`, `src/features/shop/` | Owner showcase prototype and compatibility entry for live shop jobs |
| `src/features/marketplace/` | Garage/requests, private photo library/attachments, shop feeds/private quotes, comparison/acceptance, booking list/detail, role navigation and shared API/UI |
| `src/features/activity/` | Session lifecycle and heartbeat client |
| `src/shared/` | UI, validation-related components, Firebase/API/network, secure persistence and offline cache |
| `backend/` | HTTP security, domain validation, reviews, uploads, receipts, presence and read-only cleanup logic |
| `scripts/` | Guarded emulator runner and trusted operator tooling |
| `tests/`, `backend/test/` | Component/unit, HTTP mock, security-rule and emulator integration tests |
| `docs/`, `assets/`, `vendor/` | Handover/design scope, bundled assets and existing dependency patch |

Endpoints: `GET /health`; authenticated `POST /api/profile`, `/api/session`, `/api/marketplace`,
`/api/documents/list`, `/api/documents/:kind`, `/api/photos`,
`/api/photos/vehicles/:vehicleId/:slot`, `/api/admin`. Admin operations:
dashboard, accounts/account, audit, presence, categories, categorySave,
categoryArchive, editAccount, document, review, reviewRecover and status.
The backend validates current Auth/profile permissions; client routes are not
the security boundary. Marketplace operations implement vehicles, category/shop
selection, open/direct requests, private quotations, quote acceptance and bookings;
see MARKETPLACE_MILESTONE.md and BOOKING_MILESTONE.md. PHOTO_MILESTONE.md extends
that journey with optional immutable request attachments and booking galleries.

## Feature status

“Tested” below means local mocks/components/emulators, not a production or device
certification. Static Figma screens do not establish implementation.

| Role | Feature | Status and evidence |
| --- | --- | --- |
| All | Shared sign-in, trusted routing, verification refresh, logout, session persistence | Implemented; role/session/cooldown/secure-persistence tests |
| Owner/shop | Registration, consent, incomplete-profile recovery | Implemented; validation/API tests and atomic profile creation emulator test |
| All | Password recovery | Implemented through Firebase-hosted handler, user-confirmed configuration; request UI tested, delivered emails unverified |
| Shop | Three verification documents, saved status, individual upload/replacement/retry | Implemented; actual component callbacks, upload service and emulator metadata checks |
| Shop | Pending/rejected/reviewing/approved and suspended/archive gates | Implemented; role tests and backend/rules authorization tests |
| Admin | Account list/detail/edit and suspend/restore/archive | Implemented; recent-auth, protected-role, pagination, idempotency and recovery tests; no general account creation or permanent-delete UI |
| Admin | Application review, temporary document viewing, interrupted-review recovery | Implemented; ownership, metadata change, lost acknowledgement and recovery tests |
| Admin | Categories, audit logs, presence | Implemented; cursor pages, page-local search and activity tests; presence is approximate and capped |
| Operator | Admin provisioning and account-operation reconciliation | Implemented CLI; injected mock tests only, no live execution |
| Owner/shop | Offline landing preview | Limited implementation; 24-hour non-sensitive cache tested, admin never restored offline |
| Owner | Multiple vehicles, versioned edits, archive/restore, open/direct requests and private quote reading | Implemented locally; component, backend and emulator HTTP workflow tests |
| Approved shop | Open/direct request feeds, line-item quotes, own quote history and withdrawal | Implemented locally; audience isolation, duplicate prevention and state-transition tests |
| Owner | Quotation comparison/selection and acceptance | Implemented locally; component flow, deadline/retry checks and simultaneous-acceptance emulator tests |
| Owner/shop | Booking history/details, shop appointment confirmation and participant cancellation | Implemented locally; participant isolation, SAST validation, retained terms and transaction conflict tests; no rescheduling or capacity calendar |
| Owner | Private vehicle photos, replacement/removal and optional request attachments | Implemented locally; five JPEG/PNG slots at 5 MiB each, versioned publication and immutable request references; final checks below |
| Approved shop | Authorized request photos and selected-shop booking photo history | Implemented locally; current audience/status checks and temporary signed previews; no general vehicle-library access |
| Owner/shop | Job progress/completion, progress photos, portfolio, maps and reviews | Planned; owner showcase discovery remains a prototype |
| All | Chat and advanced notifications | Optional scope, not implemented |

All mutations, document access, fresh profiles, admin actions and verification
checks require connectivity. Offline previews cannot upload or authorize work.
Account switching isolates cache and selections; logout clears the landing cache.
Documents, photo metadata and signed links are not stored in AsyncStorage.
Native file-picker/image caches can retain bytes after logout; original photo
EXIF/GPS is not stripped. Previously issued photo URLs remain usable until their
60-second expiry. A revoked token may
still read its own limited profile until ID-token expiry under the intentional
direct-read exception documented in OPERATIONS.md.

## Stabilization results — 23 September 2026

Local work for all four phases is implemented. External configuration checks,
real browser/device testing, an approved release and retention approval remain.
The historical stabilization continuation resumed on `b180472`, which included
earlier work committed outside Codex's actions. That hash is not a claim about
the current Git state described above. Codex made no commits. The baseline
audit remains unchanged in PROJECT_AUDIT.md.

| Phase | What changed and key files | Verification | Remaining/deployment | Suggested commit message |
| --- | --- | --- | --- | --- |
| 1 | `ConfirmationButton.js`, `DocumentPickerField.js`, `AdminScreens.js`, `backend/reviews.cjs`: cross-platform confirm/cancel/errors, synchronous submit locks, dirty forms, persisted owned review operations and fail-closed recovery | Four confirmation tests exercise UI-to-request callbacks; twelve review tests cover rollback, interruption, metadata changes, repeat recovery, terminal failures and lost acknowledgement | Browser/native interaction smoke tests; release backend and client together | `fix: make admin confirmations and shop reviews recoverable` |
| 2 | `.gitignore`, manifests, `render.yaml`, `backend/config.cjs`, `app.cjs`, emulator guards and security tests: canonical repo, tracked deployment files, configured CORS and independent 899/901-second recency cases | HTTP/CORS/native/preflight/role tests; isolated Auth/Firestore rules and integration suite | Node 22 target not installed locally; Console rules/policies/revision checks; no deployment performed | `chore: make security checks and deployment setup reproducible` |
| 3 | `VerificationDocuments.js`, `accounts.js`, `backend/documents.cjs`, `mutations.cjs`, `cleanup.cjs`, `presence.cjs`, `adminApi.js`: per-file status, immutable upload attempts, retained uncertain files, dry-run reconciliation, scoped receipts and bounded presence | Eight upload UI/service tests, six upload-failure tests, ten cleanup tests, client/backend retry tests; emulator concurrent category retry and 205-category pagination | Deletion deliberately unimplemented pending retention decision; receipts grow; client retry IDs are memory-only; rate counters reset per process | `fix: harden uploads and admin mutation retries` |
| 4 | Navigation/recovery UI, admin validation/pagination, rules, `scripts/trusted-admin-operations.cjs`, runbooks: hosted reset chosen after user confirmation, explicit direct-read exception, audited provisioning/recovery | Hosted recovery, eight admin validation tests, ten operator tests and rules tests | Delivered email behavior and password policy unverified; historical deployed Storage/Functions usage needs Console review | `refactor: complete hosted recovery and administrative safeguards` |

Review recovery never restores an old approval without checks. Retrying a completed
operation returns its recorded result; changed payload reuse is refused. Upload
failure never authorizes deletion when its metadata outcome is uncertain. Status
operations restrict the profile before crossing services; operator reconciliation
requires stopping the original worker because Firestore cannot fence an external
Firebase Auth write. See OPERATOR_RECOVERY.md for exact recovery preconditions.
An explicit server-confirmed failed/recovered review retires its client request
key so a later confirmation can start a fresh review. Timeouts, pending operations
and password-confirmation errors retain the key; there is no automatic mutation
retry. This fixes the otherwise stuck same-input review after recovery.

## Audit disposition

| Finding | Current status |
| --- | --- |
| H1, H2 | Fixed locally; confirmation and review regressions pass |
| M1 | Inner repository is canonical; ignores corrected; deployment manifests tracked; outer link intentionally preserved |
| M2 | Upload ledger and repeatable read-only cleanup report implemented; irreversible deletion awaits an approved retention policy |
| M3 | Individual uploads and server-recorded status implemented and tested |
| M4 | Live Supabase policies still unverified; private flag and adapter tests cannot prove deployed RLS |
| M5 | Sensitive metadata/catalogue direct reads denied; own-profile onboarding exception explicitly retained and documented |
| M6 | Hosted reset confirmed by user; unused custom routes/screens removed; no claim of delivered-email testing |
| M7 | Backend receipts/operation identity and client retries implemented; restart/account-switch/50-entry eviction limits documented |
| M8 | Firebase server password policy still unverified; UI policy alone is insufficient |
| M9 | Environment allowlist implemented; local CORS tests and historical live preflight passed |
| M10 | One bounded presence aggregate per account and separate heartbeat budgets; historical sessions/audit retention still pending |
| L1 | Header/MIME checks documented as limited validation, not malware scanning |
| L2 | Live validation, previous/next/first cursors, honest page-local search and draft preservation tested; server-wide search remains future work |
| L3 | Audited operator recovery and setup docs implemented; unused client Storage configuration removed; historical rule artifact labelled, live retirement unverified |

No critical vulnerability was confirmed by the baseline inspection. The exposed
Supabase credential remains an unresolved operational priority until privately
rotated; uncertainty about its status is not evidence that it is safe.

## Tests actually run

The completed booking check on 23 September recorded 119 frontend, 88 backend
and 35 emulator checks. These are historical totals. Photo-milestone checks on
24 September supersede those counts where a final result is recorded below:

| Check | Result |
| --- | --- |
| `npm.cmd test` | 148 passed, 0 failed |
| `npm.cmd run test:backend` | 129 passed, 0 failed |
| `npm.cmd run test:security` | 42 passed: 6 rules, 17 foundation, 12 marketplace and 7 photo integration checks; runner exited 0 |
| JavaScript/CJS parsing | 130 files parsed; 306 relative imports resolved |
| App/backend manifest and lockfile declarations | Matched; no dependency upgrade or audit fix performed |
| Expo web export | Passed, 668 modules; ignored output `.local-checks/web` |
| `git diff --check` and documentation whitespace | Passed; CRLF notices only. Current Git HEAD is unresolved as noted above |

The emulator run used only `demo-pmr-security`, loopback Auth/Firestore and mocked
Supabase. Concurrent transaction contention retried successfully. Marketplace
coverage includes actual HTTP calls with emulator-issued owner/shop tokens,
private audiences, cents calculation, stale versions, duplicate submissions,
archived resources, closing and withdrawal. Booking tests exercise authenticated
HTTP acceptance/confirmation/cancellation and actual transaction races involving
competing offers, same-offer retries, withdrawal/closure and cancellations.
Photo coverage adds upload/attachment/booking HTTP flows, direct-audience and
revocation checks, competing photo revisions, request-publication/removal races,
receipt replay after detachment, lease expiry and malformed uploads. Mock tests
exercise retained cleanup candidates and actual local HTTP disconnects across
photo/document upload slots. Rules deny direct marketplace/booking/photo reads
and writes for owners, shops and admins. Component tests use native mocks rather than a running browser/device.
The attempted in-app browser connection reported `Browser is not available: iab`;
no browser/device interaction or visual fidelity check is claimed.
The web export disabled dotenv loading and used synthetic Firebase settings and
an `.invalid` API URL; the app was not connected to production for this check.
No production test records or real identity-document fixtures were used.

Node used for this milestone: 24.19.0; Java: 25. Backend production target remains 22.x,
which was unavailable locally. React test renderer and transitive emulator
dependencies emit deprecation warnings. These do not establish browser/device
behavior or justify an automatic dependency upgrade.

Read-only live probes on 22 September returned health 200 and localhost admin
OPTIONS 204. They establish process/CORS behavior at that time only. No private
Firebase settings, deployed rules/indexes, Supabase policies or Render revision
were verified through authenticated dashboards.

## Run, review and next task

The garage/request/quotation, comparison/acceptance/booking and user-approved
vehicle/request photo milestones are implemented locally.
[MARKETPLACE_MILESTONE.md](MARKETPLACE_MILESTONE.md) records the first slice;
[BOOKING_MILESTONE.md](BOOKING_MILESTONE.md) records the extension, state machine,
API/schema, privacy, tests and release order. That historical booking milestone
started from the user's `5ecef81` commit. [PHOTO_MILESTONE.md](PHOTO_MILESTONE.md)
records the extension with private libraries, request/booking attachments,
storage setup and limits. These are implementation records, not evidence of a
deployed revision. Codex made no commit, deployment or live data change.

See [OPERATIONS.md](OPERATIONS.md) for setup, environment variable names, safe
tests and manual Console/deployment checks; [AUTH_FLOW_DECISION.md](AUTH_FLOW_DECISION.md)
for hosted recovery; [OPERATOR_RECOVERY.md](OPERATOR_RECOVERY.md) for privileged
scripts; [RETENTION_PROPOSAL.md](RETENTION_PROPOSAL.md) for document retention;
and [PHOTO_RETENTION_PROPOSAL.md](PHOTO_RETENTION_PROPOSAL.md) for photo retention.

1. Privately rotate the exposed Supabase secret (user answered **Unsure** about
   completion) and verify server configuration without sharing its value.
2. Complete the Firebase password/template, published rules/indexes, Supabase
   private-bucket/RLS and Render revision checks in OPERATIONS.md. Validate on
   Node 22 and smoke-test web/native and delivered recovery emails in an isolated
   test environment. Do not use production accounts/documents as test fixtures.
3. Review the local changes. Any commit, merge, deployment, policy publication or
   live configuration change requires separate instruction; none was performed
   by Codex. Backend document-list support must precede its client release.
4. Decide the proposed document/photo/ledger/audit retention policies before
   implementing deletion. Current report-only reconciliation preserves all files.
   Five current photo slots do not cap accumulated retained storage. Extend
   photo cleanup with independent booking-reference checks before any future
   request deletion or storage deletion automation.
5. Review/release the implemented marketplace milestone only when separately
   instructed: deploy its Firestore indexes first, wait for readiness, then
   backend and client. Active categories and approved shops are required in the
   selected test environment; no production seed data is created by setup. Photo
   release additionally needs a separately authorized private bucket/policy
   setup and the backend photo endpoints before their client is released.
6. Proposed next milestone, awaiting instruction: job progress, completion and
   completed-work reviews. Capacity calendars, rescheduling, camera capture,
   notifications and richer discovery remain separate work. No further feature
   milestone, payments, AI, AR or wider redesign was started here.
