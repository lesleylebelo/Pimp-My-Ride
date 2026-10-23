# Setup and manual configuration checks

Use the inner `PimpMyRide` directory. Earlier inspections recorded branch
`lesley` and Render deploying `main`; these are historical observations. Current
Git checks could not resolve HEAD or its symbolic reference, and files appear
staged as additions. Preserve that state and review it before any Git operation;
do not infer the branch or repair metadata as part of running the app. The
tracked Render configuration uses the `backend` directory. The outer workspace
contains a pre-existing Git link without a
`.gitmodules` entry. Do not delete Git metadata or initialize a replacement repo.

## Run locally

Install dependencies separately with `npm ci` at the app root and
`npm ci --prefix backend`. Use `npm.cmd` in Windows PowerShell if its script
execution policy blocks `npm.ps1`. No dependency upgrades are required for this
work. Backend validation should use Node 22.x as specified by its manifest.

Copy `.env.example` to the ignored `.env`, then fill the Firebase web-app public
configuration and API URL. `EXPO_PUBLIC_*` values are bundled into the client;
never put Supabase secrets or Firebase Admin credentials there. Firebase Storage
configuration is no longer required. Run `npm start` for Expo, `npm run web` for
the browser, or `npm run android` / `npm run ios` with a supported device setup.
Restart Expo after changing public environment variables.

For the backend, use the names in `backend/.env.example` as server environment
variables. The server does not automatically load a `.env` file. On Node 22,
from `backend`, `node --env-file=.env server.cjs` loads an intentionally created
local file; `npm start` uses the process environment. Keep credentials out of
command-line arguments and Git. Never launch experiments or data-writing tests
with production credentials. Point browser development at the intended API;
native devices cannot reach a host machine through the device's `localhost`.
Before opening the HTTP listener, startup checks Firebase project/credential
configuration and validates the required Supabase storage URL and secret, port,
and CORS settings. Render must provide the storage settings even when only
read-only feeds are being debugged.

## Safe local checks

### Connection errors in Expo Go

Expo Go on Android/iOS uses native networking; browser CORS does not diagnose
its connection failures. Open the configured backend's `/health` URL in the
same phone's browser first. A successful computer check does not establish that
the phone can reach the service. Record whether the failure affects all backend
screens or only uploads; a native upload can also fail while reading its local
file, before it reaches the server.

Start Expo from this application directory. A terminal's existing
`EXPO_PUBLIC_API_URL` overrides `.env`; restart/reload the app after correcting
the development server's environment. A phone cannot use the computer's
`localhost` for a locally hosted API. This project's configured API uses HTTPS
on Render, independently of the LAN address used to load the Expo bundle.

Development builds now emit `[PimpMyRide connection]` warnings with only
`stage` (`health`, `request` or `upload`), backend `origin`, and `reason`
(`network` or `timeout`). Share those fields when diagnosing a failure. Tokens,
request paths/queries, bodies, filenames, local file URIs and raw errors are
excluded; production builds do not emit this diagnostic. An upload-stage
failure alone cannot distinguish an unreadable file from an interrupted
connection. Refresh saved status before manually retrying a mutation; the
client does not automatically replay it.

### Automated checks

From the app root:

```text
npm test
npm run test:backend
npm run test:security
```

The security command starts Auth and Firestore emulators for
`demo-pmr-security`. Java and the Firebase emulator binaries must be available.
Its suites reject non-loopback emulator hosts and other project IDs before
initializing clients. They clear only demo emulator data; Supabase is mocked.
Do not run the integration test directly against live services. The mock backend
suite excludes `integration.test.cjs` on purpose. No app/backend server is needed
for mock tests. Component tests use React renderer/native mocks, not a browser
or physical-device test session.

## Render verification and later deployment

Do not deploy until separately instructed. These are review steps for the owner:

1. Confirm repository, `main` branch and deployed commit in Render. Compare that
   commit to the reviewed local changes; a working health response does not prove
   they are deployed. Root directory: `backend`; build: `npm ci`; start:
   `npm start` (`node server.cjs`); Node: 22.x; health path: `/health`.
2. Verify `NODE_ENV`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`,
   `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_BUCKET`,
   `SUPABASE_PHOTO_BUCKET`, `SUPABASE_REQUEST_BUCKET`, `SUPABASE_POSTS_BUCKET`,
   `SUPABASE_LEGACY_PHOTO_BUCKET`, `SUPABASE_LEGACY_POSTS_BUCKET`, and `CORS_ORIGINS`
   privately. `PORT` is provided by Render. No emulator variables may be present
   in production. Do not copy values into issues, screenshots, or this document.
3. `CORS_ORIGINS` is an exact comma-separated HTTP(S) origin list with no paths,
   credentials or wildcards. Include `http://localhost:8081` and
   `http://127.0.0.1:8081` for browser development and the actual hosted web origin
   when one is chosen. An absent production list defaults to only
   `http://localhost:8081`. An explicit list replaces the defaults; an empty
   value disables all browser origins. Changing `backend/.env.local` does not
   change the existing Render service environment.
   Native requests without an Origin remain authenticated normally.
4. `cors` is already a backend production dependency and present in its lockfile.
   CORS runs before authentication, including OPTIONS; it never grants API access.
   Proxy trust is one hop only when Render sets its environment marker.
5. After an approved release, check health and an unauthenticated OPTIONS request
   from each allowed origin. An unauthenticated POST must still fail. Use an
   isolated environment for mutation smoke tests. Health does not test Firebase,
   storage, policy correctness, or the deployed revision.

Safe probes on 22 September 2026 returned health HTTP 200 and admin preflight
HTTP 204 with the expected localhost origin. These are historical read-only
observations, not verification of the current revision or backend credentials.

## Firebase verification and rules

## Shop showcase posts

Showcase metadata is stored in Firestore `posts`. New photo binaries use the
private `showcase-images` bucket (`SUPABASE_POSTS_BUCKET`). New persisted image
references include `bucket`, `path`, content type and size, never a signed URL.
The authenticated REST API supports `GET /api/posts`,
`GET/PATCH/DELETE /api/posts/:id`, `POST /api/posts`,
`POST /api/posts/images`, and `POST /api/posts/:id/images/view`.
The last route checks the published post and image membership before returning
a transient 60-second URL. Cards, detail and edit previews renew it while focused.
Do not make the new bucket public or use Render local disk.

Untagged historical paths retain the separately configured legacy bucket
`SUPABASE_LEGACY_POSTS_BUCKET` (historical default `public-posts`). Existing
HTTPS URL-only media stays readable; editing invalid/URL-only references fails
safely. No copy, migration, deletion, old bucket creation or privacy change runs.
Confirm actual historical overrides before configuring a running server.

Firestore composite changes require a separate exact additive proposal and
approval. Do not deploy the whole index file or run legacy migration scripts
as part of bucket setup. None was applied during this review.

See [the existing-project bucket review](EXISTING_MEDIA_BUCKET_REVIEW_20261019.md)
for proposed bucket settings, approval boundaries and the pending real-upload plan.
These are local source changes, not deployed configuration.

Showcase image deletion is intentionally disabled: replacing an image, removing
a post, an upload-verification failure, or an uncertain client save outcome
must not physically remove a storage object. The legacy `removeImage` API
operation returns `failed-precondition`. This retention-first policy can leave
unreferenced objects in new private or historical public media buckets; do not delete them manually or run a
cleanup job until a concurrency-safe asset reference/retirement design has
been approved and deployed. No Firestore schema, index, or backfill change is
part of this retention safeguard.

The user confirmed the Firebase-hosted password-reset handler on 23 September
2026. See [the flow decision](AUTH_FLOW_DECISION.md). Delivered reset emails,
authorized domains, template contents and actual server password policy remain
unverified by this implementation session. Privately inspect Authentication >
Settings > Password policy for enforcement and the intended 12-128 character
policy; include any extra requirements in client validation if configured.

In Firestore Console, compare published rules with `firestore.rules` and index
status with `firestore.indexes.json`. The latter now includes a collection-group
`documents.path` index for reconciliation. An emulator passing does not establish
that production indexes exist or that the Console rules match these files.

Only `get users/{ownUid}` is intentionally allowed directly during onboarding,
unverified status, suspension and archive so the app can display its own state.
This limited profile read does **not** perform backend-style token revocation
checks: an otherwise valid older ID token may continue to read that own profile
until expiration. It contains contact/account state, so keep private documents
and administrative information elsewhere. Profile writes/listing, document
metadata, categories, presence and logs require the backend; deny-by-default
rules protect all other collections. Backend authorization rechecks revoked
tokens, enabled/verified Auth users, profile status, and administrator claims.
No cached role authorizes a backend request.

Release the new backend document-list endpoint before the client that consumes
it. Review the client/backend together, then publish rules/indexes through a
separately approved release. Historical clients that read metadata/categories
directly will be denied by the new rules. Marketplace catalogue access now uses
the owner-authorized `categories` operation on `/api/marketplace`; clients still
cannot read categories directly. For the new marketplace release, publish its
vehicle/request indexes first and wait for readiness, then backend and client.
See MARKETPLACE_MILESTONE.md for the complete scope and prerequisite test data.
The shop request feed now uses aggregate `quotationCount` values and a batched
shop-quotation lookup. Publish the `quotations` composite index in
`firestore.indexes.json`, wait for readiness, then run
`npm run backfill:quotation-counts -- PROJECT_ID` with trusted Admin credentials
before releasing the updated marketplace backend/client. The migration counts
all non-withdrawn quotations; future submissions and withdrawals update the
request count transactionally. Request/profile reads remain backend-only and
Firestore client rules must not be loosened to expose customer fields.
The booking extension in BOOKING_MILESTONE.md needs its backend operations before
the corresponding client release. Bookings retain deny-by-default direct access
and use standard participant-field indexes; no new secret, composite index,
migration or production seeding is required by that extension.
The photo extension in PHOTO_MILESTONE.md requires its separate private bucket
and backend endpoints before the client release. Direct access to photo assets
and upload-attempt collections stays denied. Photo reference queries use
standard single-field indexes; retain those indexes rather than adding direct
client access as a workaround.

## Supabase and private file handling

Rotation of the previously exposed Supabase secret is **unconfirmed** (user:
Unsure). Privately revoke/rotate it and replace Render's `SUPABASE_SECRET_KEY`.
Do not paste either key. Confirm the replacement works through an authorized
deployment procedure; this session did not change secrets or service settings.

In the Supabase dashboard verify `verification` is private, permits only PDF,
JPEG and PNG, and has the 5 MiB size limit. Inspect all applicable policies on
`storage.objects`, including policies for other buckets that may accidentally
match this one. The server-only upload path should not require `anon` or
`authenticated` clients to list/read/insert/update/delete these objects. A private
bucket flag alone does not prove safe policies. `backend/storage-setup.sql`
contains mutations as well as a policy query; do not run the whole file as a
read-only check. No authenticated dashboard policy inspection occurred here.

The API verifies the private flag, role/status, file size, MIME and header
signature. These checks are not document parsing or malware scanning. Names are
metadata; immutable storage paths use server-generated UUIDs. Admin viewing
requires recent authentication and produces a 60-second signed bearer URL; do
not log, cache or share it. Verification documents and vehicle/request photos
are implemented as separate private storage scopes. Portfolios, chat attachments,
avatars and job-progress photos remain unimplemented.

For vehicles, configure server-only `SUPABASE_PHOTO_BUCKET=vehicle-images`;
for direct request attachments use `SUPABASE_REQUEST_BUCKET=request-images`.
Keep `SUPABASE_BUCKET=verification` for documents. Untagged legacy vehicle
references use `SUPABASE_LEGACY_PHOTO_BUCKET` (historical `marketplace-photos`);
confirm previous overrides before activating the new configuration. The photo
bucket name is also declared as a nonsecret default in `render.yaml`; this local
change has not configured or deployed a running service. The photo
bucket must be private, accept only `image/jpeg`, `image/png` and `image/webp`, and have a
5 MiB (5,242,880-byte) file limit. `backend/photo-storage-setup.sql` contains a
create-missing-only proposal for all three private media buckets, followed by
metadata and policy queries. It has not been executed; run setup
only under separate environment/release authorization. Inspect all matching
`storage.objects` policies, including broad policies for other buckets. No
anonymous or authenticated client storage policy is required by this server-only
flow. The API's private-flag check cannot establish deployed policy safety.

The photo library allows five current slots per vehicle. Requests can attach
zero to five assets: selected Garage photos or new request-only uploads via
`POST /api/photos/requests/:vehicleId?version=...&requestId=...`. Direct uploads
use the same durable retry ledger and create no Garage slot changes. They may
be previewed by their owner through `target: attachment`; shops only receive
access through an attached eligible request. References remain immutable through booking
history. Garage replacement/removal preserves published attachments and stored
objects. Photo viewing rechecks current access and returns a 60-second bearer
URL. An issued URL can still be used until expiry after logout/restriction;
downloaded bytes cannot be revoked. No URL is stored in AsyncStorage. Native
picker/image caches may retain image bytes, and the original file may contain
EXIF/GPS metadata. Validation is not full decoding, metadata stripping or malware
scanning. See PHOTO_MILESTONE.md for the complete API and client limitations.

Uploads retain uncertain and superseded objects. The operator report and proposed
retention rules are in [RETENTION_PROPOSAL.md](RETENTION_PROPOSAL.md). Deletion is
not implemented. Run small read-only report pages on demand; no paid scheduler
or persistent free-tier worker is assumed. Stored documents, upload ledgers,
mutation receipts and audits continue to consume storage until retention is
approved. Global reference queries fail closed when an index/read is unavailable.

The separate photo report is documented in
[PHOTO_RETENTION_PROPOSAL.md](PHOTO_RETENTION_PROPOSAL.md):

```text
node scripts/cleanup-photos.cjs --help
node scripts/cleanup-photos.cjs --project PROJECT_ID --limit 100
```

It reads only Firestore and rejects `--apply` before credentials are loaded.
Use mock/emulator fixtures for tests; do not create live records to exercise it.
Report candidates do not authorize deletion. The report preserves vehicle and
request references; explicit booking-reference checks are required before any
future request deletion or automated storage deletion can be introduced.
Repeated replacements can grow retained storage despite the five-slot limit.

## Remaining operational limits

Rate limits are in memory per backend process and reset at restart; multiple
instances do not share counters. Heartbeats have separate 600/IP/minute and
12/account/minute budgets; other API calls use 90/IP/minute and 60/account/minute,
and uploads additionally use 6/account/minute with two concurrent upload slots.
Document and photo uploads share those slots. A client disconnect during service
processing keeps its slot occupied until the storage/database operation settles;
an aborted multipart parser releases its slot without starting service work.
This reduces ordinary shared-network interference, not distributed abuse.

Presence stores at most 20 live session deadlines in one record per account;
expired entries are pruned on later events. Old per-session records and audit
logs are retained, and presence is approximate. There is no paid TTL job.
The device's 60-second failed-login cooldown persists across app restarts but
can be bypassed by clearing storage, another client, clock changes or direct
Firebase requests. It is not a global credential-abuse control.

Admin request receipts survive backend retries. The client keeps up to 50
unresolved request identities in memory, preserving them through password
confirmation. Restart, account change or eviction loses that client identity;
refresh and inspect the outcome before repeating an uncertain mutation. Receipt
retention has not been enabled.
For reviews, an explicit server-confirmed terminal failure/recovery releases the
key for a later manual confirmation. Pending or uncertain operations retain it;
the client never automatically retries a mutation.

`firebase.json` deploys neither Functions nor Firebase Storage. No active client
uses those SDKs for operations. `storage.rules` is retained and labelled as a
historical artifact; verify live legacy bucket/function usage before removal or
policy changes. Untracked ignored legacy dependencies are not deleted. There
were no paid upgrades, commits, pushes, deployments or live test writes by Codex.

### Existing-project local real-media preparation

Use [LOCAL_REAL_MEDIA_CREDENTIALS.md](LOCAL_REAL_MEDIA_CREDENTIALS.md) for ignored
server-only configuration and the offline `check:local-config` / guarded
`start:local` commands. [MEDIA_PREREQUISITES_20261019.md](MEDIA_PREREQUISITES_20261019.md)
records the designated vehicle/category, six confirmed missing composite indexes
and separate approval boundaries. No local startup or upload approval is implied.
