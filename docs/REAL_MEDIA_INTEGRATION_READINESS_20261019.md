> Index execution update: the six approved composites were created individually
> and are all READY. All three pre-existing indexes remain intact. All nine
> read-only query plans pass, including Discover and Find Jobs. See
> [FIRESTORE_MEDIA_INDEX_EXECUTION_20261019.json](FIRESTORE_MEDIA_INDEX_EXECUTION_20261019.json).
> Earlier missing-index statements below describe the pre-execution baseline.
> Server credentials and real-media upload approval remain separate outstanding gates.

> Latest prerequisite results: [MEDIA_PREREQUISITES_20261019.md](MEDIA_PREREQUISITES_20261019.md).
> BMW M4 `78gG6bPHbGvCTOCuZAwR`, empty slot 1, is now user-designated;
> active category `abrEnmpBoQ2cBvEtYqjl` is confirmed. All six query failures are
> confirmed missing indexes. User-reported Storage policy review is complete.
> Direct Supabase bucket/policy verification now also passed through the connected
> account: all settings match, both Storage policy counts are zero.
> Local credentials and index/upload approvals remain outstanding.

# Real-media integration readiness - 19 October 2026

**Prepared; live uploads and Firebase writes are NOT approved and have not run.**
Original consolidated PimpMyRide directory, branch `lesley`. No commit, push,
merge, deployment, storage policy change, Firebase record/index mutation, media
migration, object upload/deletion, custom token, payment or email was performed.

## Existing infrastructure status

Supabase `nymiyrzdpjctyembixbe`; Firebase `pimp-my-ride-a26fc`.
The user reports independent verification that `vehicle-images`,
`showcase-images`, and `request-images` exist, are private, have a 5,242,880-byte
limit, and accept exactly JPEG/PNG/WebP. `verification` is unchanged. Bucket
creation is complete externally; no additional bucket setup is required.
The agent has now independently confirmed the three buckets and their exact
settings through connected read-only Supabase access, with zero policies on
storage.objects and storage.buckets. No object or verification-document access
was performed. No runtime credential or upload verification is implied.

## Test accounts verified read-only

| Purpose | Firebase UID | Observed role and eligibility |
| --- | --- | --- |
| Customer | `aT6RWRl4AtQjtJKYIiD39eaR3x73` | `owner`; Auth exists, email verified, enabled; no status/provisioning operation flags. |
| Shop | `vsZYsbWkD4Urq2S5OmWEKUNs6rZ2` | `shop`, verification `approved`; Auth exists, email verified, enabled; no status/provisioning/review operation flags. |
| Admin, metadata check only | `JbUoD5CEHHgyzlxjDFFvGnTvUot2` | `admin` plus Auth `admin: true`; Auth exists, email verified, enabled. Excluded from ordinary tests. |

All three profiles omit `accountStatus`. The existing `domain.active` function
explicitly treats a missing value as active. No profile correction is needed.
Only masked profile fields and Auth eligibility flags were read. No emails,
passwords, password hashes, keys or tokens were printed or saved. These checks
establish role prerequisites; they do not replace endpoint tests using actual
customer/shop ID-token sessions. No test account was signed in or impersonated.

## Access configuration required

The frontend uses Firebase ID tokens with authenticated Express APIs. Express
uses a separate server-only Supabase secret/service-role credential. Connecting
an assistant to Supabase does not configure that backend credential. The local
process/project environment still has no Supabase server key or Firebase Admin
service-account credential. Existing hosted secret values have not been read.

Required nonsecret configuration for the reviewed backend:

```text
FIREBASE_PROJECT_ID=pimp-my-ride-a26fc
SUPABASE_URL=https://nymiyrzdpjctyembixbe.supabase.co
SUPABASE_BUCKET=verification
SUPABASE_PHOTO_BUCKET=vehicle-images
SUPABASE_POSTS_BUCKET=showcase-images
SUPABASE_REQUEST_BUCKET=request-images
```

Keep the existing server-only `SUPABASE_SECRET_KEY` and Firebase Admin credential
in secure runtime configuration, never Expo, chat, source control or test logs.
Confirm previous legacy bucket overrides before activation; untagged historical
assets still use `SUPABASE_LEGACY_PHOTO_BUCKET`/`SUPABASE_LEGACY_POSTS_BUCKET`,
not the new empty buckets. No existing media is reinterpreted or migrated.

Because only trusted server Storage calls are used, no new client RLS policy is
required by this architecture. Supabase service keys bypass Storage RLS, making
the Express checks essential. See [Supabase access-control documentation](https://supabase.com/docs/guides/storage/security/access-control).
A private flag does not prove absence of permissive global/client policies.
The user has now completed the read-only policy review: no custom policies were
returned for storage.objects or storage.buckets; no policies were changed. The prepared read-only query is
`docs/REAL_MEDIA_STORAGE_READ_ONLY_PREFLIGHT_20261019.sql`; it was not executed.
It reads only bucket configuration and policy definitions, never object rows.

Use the reviewed backend locally with a loopback-only test launcher; do not
start a hosted deployment. The new `start:local` command loads ignored `.env.local`, validates configuration
offline and requires `HOST=127.0.0.1`. Production startup retains its default
`0.0.0.0` binding. See `LOCAL_REAL_MEDIA_CREDENTIALS.md`; do not start live-backed
services until test approval. Do not start explicit
local-demo mode: that uses memory fixtures and emulator identities instead of
these existing projects. For a phone test, a separately reviewed reachable
address is needed; desktop loopback does not establish device connectivity.
The hosted backend has not received these local fixes. Expo must target the
reviewed local API for this test, not silently continue using the older host.
No runtime configuration was activated during preparation.

## Source contracts rechecked

| Media | Upload endpoint | Persisted identity | Private preview |
| --- | --- | --- | --- |
| Garage | Multipart `POST /api/photos/vehicles/:vehicleId/:slot?version=...&requestId=...` | `marketplacePhotos`: provider, ownerId, vehicleId, bucket `vehicle-images`, immutable `photos/<owner>/<vehicle>/<UUID>`, content type/size and uploadAttemptId. Vehicle retains photoSlots/photoIds/photoRevision. | `POST /api/photos`, `op: view`, `target: vehicle`, exact vehicle/photo IDs. Owner-only. |
| Direct request attachment | Multipart `POST /api/photos/requests/:vehicleId?version=...&requestId=...` | Same asset collection with `purpose: request`, bucket `request-images`, `requests/<owner>/<vehicle>/<UUID>`; no Garage slot/revision update. RequestCreate stores photoIds and safe immutable metadata snapshots. | Owner-only unsubmitted `target: attachment`, `id: asset ID`; after attachment, `target: request`, `id: request ID`, governed by request audience and booking ownership. |
| Showcase | Multipart `POST /api/posts/images`, then JSON `POST /api/posts` with the confirmed path | `posts.images`: bucket `showcase-images`, `posts/<shop>/<UUID>`, size/type. No signed URL persisted. | `POST /api/posts/:id/images/view`, `{path}`; published shop-post membership and current authenticated customer/shop role checked. Caller cannot select another bucket. |

Multipart contains one `file` field; browser/native transport sets its boundary.
Server signature, dimensions, MIME and 5 MiB checks remain authoritative. New
objects use `upsert:false`. Missing/accidentally public private-media buckets
fail closed. Vehicle/request operations retain durable fingerprinted upload
leases and replay receipts; showcase publication retains its stable receipt.
A showcase binary upload itself has no retry receipt: if its acknowledgement is
uncertain, stop. Never blindly send it again or enumerate existing shop media.
A later live launcher should journal only the exact new paths generated by its
own requests so uncertain outcomes can be inspected within the approved scope.

URLs are signed for 60 seconds; backend responses include `expiresAt`. Garage
and showcase UI renew before expiry, clear stale account/offline/focus state,
and offer explicit retry on error. Detailed vehicle/request galleries clear an
expired preview and allow authorised viewing again. An unsigned private-object
URL must fail. A valid signed URL is a short-lived bearer capability and can be
used without another login until expiry; do not report that as a privacy failure.
Private signed URLs are transient, not Firestore/AsyncStorage media identity.

**Vehicle/request preview calls are not read-only in Firestore:** successful
signing creates a `photos.viewed` audit document. They were not invoked during
this preparation. The showcase preview route currently signs without that audit
write. A denied request must not mint a URL or create a successful media record.

PMR-02 remains intact: no showcase delete capability; removing a Garage reference
or abandoning a request draft does not delete storage bytes. No cleanup, copy,
move or backfill is part of this test. Production mock-payment gates are unchanged.

## Exact proposed live operations - separate approval required

The request bodies, stable retry IDs, write effects and budgets are in
[`REAL_MEDIA_TEST_PLAN_20261019.json`](REAL_MEDIA_TEST_PLAN_20261019.json).
The plan is data only, not an executable test. No approval for its writes is implied
by the earlier bucket-creation approval.

1. Confirm a designated test-only vehicle owned by the customer, an **empty**
   photo slot and its current photo revision, plus an existing active service
   category. Both identifiers are now filled in the current plan: BMW M4
   `78gG6bPHbGvCTOCuZAwR`, slot 1; category `abrEnmpBoQ2cBvEtYqjl`. Do not choose or create them
   automatically. If a new test vehicle is needed, explicitly add one vehicleSave
   operation, its receipt and audit to the approval; no admin account is needed.
2. Use existing customer/shop sessions for their normal API calls. Do not create
   accounts, mint custom tokens, alter roles, verify email, enable users or modify
   profile documents to make tests pass. Normal login/token renewal may update
   Auth session/last-sign-in metadata; no passwords or tokens go into this plan.
3. Upload **three new 92-byte synthetic PNG objects**, one per media bucket,
   using fresh server UUIDs and the exact prefix families:

   - `vehicle-images/photos/aT6RWRl4AtQjtJKYIiD39eaR3x73/<test vehicle ID>/`
   - `request-images/requests/aT6RWRl4AtQjtJKYIiD39eaR3x73/<test vehicle ID>/`
   - `showcase-images/posts/vsZYsbWkD4Urq2S5OmWEKUNs6rZ2/`

   Fixture SHA-256:
   `7791330cf1138b83d7acee0022af9ecf7607bd7e25f38451c4f02f4e4c8dda09`.
   This tests actual remote storage with synthetic bytes; it does not verify
   real-device HEIC conversion or every JPEG/WebP path. Additional objects or
   format/device uploads require an expanded scope.
4. Attach both new owner assets to **one new open service request**, labelled
   `PMR MEDIA TEST 20261019-01`; publish **one new showcase** with the same label.
   Existing account profiles stay unchanged. The vehicle upload changes only
   the approved vehicle's photo fields and timestamp; an occupied slot stops
   the test. Create at most two asset documents, two upload ledgers and two
   mutation receipts, plus the request/post documents and normal audit records.
5. Cap signing at **16 preview calls** and audit creation at **20 entries**,
   including upload/publication audits. Pause/unmount renewal components after
   each check; do not leave timers issuing unbounded requests. Preview both
   private owner media types and the showcase, renew once, and test unsigned
   denial. The shop must be denied Garage and unsubmitted-attachment access;
   the approved shop can view attached open-request photos. The admin is unused.
   A third designated unrelated test shop/owner is optional for additional
   cross-account/direct-request denial checks; no real account will be selected.
6. Confirm exact new Supabase objects and Firestore bucket/path references;
   reload Garage and retrieve the saved request and post without re-uploading.
   An invalid image rejected before reservation is the controlled failure test;
   do not change remote settings to simulate an outage. Stop on uncertain writes
   or failures rather than spending extra objects/records to work around them.
7. With feed prerequisites resolved, make one bounded first-page Discover and
   Find Jobs read. These normal queries can inspect other existing record
   metadata internally. Record and render only the new test IDs; do not issue
   previews/downloads for other images. Shared-feed metadata access and the new
   open request/publication's visibility need inclusion in the final approval.
   Do not open an unfiltered feed UI that automatically loads existing images.
8. Retain all new objects/records after testing. No storage delete, record cleanup,
   soft removal, quotation, booking, payment, policy/index change or email.

## Firestore feed preflight

A fresh authenticated metadata read still found three READY composites. Plan-only
Query Explain (`analyze:false`) confirmed basic Discover, Garage listing and the
quotation lookup are plannable. Garage and quotation lookup use built-in
single-field index intersection: no new composite is required for those queries.
No customer queries were executed by this preflight. See
[Firebase Query Explain](https://firebase.google.com/docs/firestore/query-explain).

All six other query plans are now confirmed MISSING_INDEX. The corrected
checker preserves streamed HTTP error arrays and reports FAILED_PRECONDITION: no
matching index found. All six definitions already exist locally. The exact
additive proposal is ready for index approval; nothing has been applied.
See the latest prerequisite report for each field list and result.

## Verification and remaining gate

- Fresh focused media, role, storage, retry and preview tests: **77 passed, 0 failed**.
- Previous full verification remains: app 291; backend 218; emulator 69 plus one
  local-demo integration; web export passed. Those full suites were not rerun
  during this documentation/preflight step.
- Existing-project account roles/Auth flags: **verified read-only**, three named
  test accounts only. Actual customer/shop endpoint sessions: not yet tested.
- Existing-project query plans: three plannable; six confirmed missing indexes.
- Bucket settings and zero Storage policy counts: independently verified by the
  agent using read-only Supabase access. Express runtime credentials remain absent.
- Real Supabase uploads and physical-device tests: **not run**.

Remaining gates: privately configure local server credentials, approve/create the
six missing indexes, verify they are READY, then approve the exact existing
three-object/record/audit scope. Vehicle/slot/category and reported policy review
are now resolved.
A separate approval is required for any optional new test vehicle or index changes.
Local planner error handling and secure local startup were corrected during the
latest prerequisite preparation; see the current report for files and 81 passing
focused tests.
