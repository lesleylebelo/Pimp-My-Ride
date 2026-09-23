# Setup and manual configuration checks

Use the inner `PimpMyRide` repository (branch `lesley`). Its tracked Render
configuration deploys the `backend` directory; the running service is reported
to deploy `main`. The outer workspace contains a pre-existing Git link without a
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

## Safe local checks

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
   `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_BUCKET`, and `CORS_ORIGINS`
   privately. `PORT` is provided by Render. No emulator variables may be present
   in production. Do not copy values into issues, screenshots, or this document.
3. `CORS_ORIGINS` is an exact comma-separated HTTP(S) origin list with no paths,
   credentials or wildcards. Include `http://localhost:8081` and
   `http://127.0.0.1:8081` for browser development and the actual hosted web origin
   when one is chosen. An absent production list allows no browser origins.
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
directly will be denied by the new rules. Marketplace catalogue access still
needs a dedicated authorized API in its future milestone.

## Supabase and document handling

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
not log, cache or share it. The only implemented media flow is shop verification
documents, not vehicle images, portfolios, chat attachments or avatars.

Uploads retain uncertain and superseded objects. The operator report and proposed
retention rules are in [RETENTION_PROPOSAL.md](RETENTION_PROPOSAL.md). Deletion is
not implemented. Run small read-only report pages on demand; no paid scheduler
or persistent free-tier worker is assumed. Stored documents, upload ledgers,
mutation receipts and audits continue to consume storage until retention is
approved. Global reference queries fail closed when an index/read is unavailable.

## Remaining operational limits

Rate limits are in memory per backend process and reset at restart; multiple
instances do not share counters. Heartbeats have separate 600/IP/minute and
12/account/minute budgets; other API calls use 90/IP/minute and 60/account/minute,
and uploads additionally use 6/account/minute with two concurrent upload slots.
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
