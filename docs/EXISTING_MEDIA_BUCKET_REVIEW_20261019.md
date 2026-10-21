> Current status: the user reports all three private media buckets have been created
> and independently verified in the existing Supabase project; verification is unchanged.
> Bucket creation is complete externally. The report below records the earlier source
> review; current test prerequisites and approval scope are in
> [REAL_MEDIA_INTEGRATION_READINESS_20261019.md](REAL_MEDIA_INTEGRATION_READINESS_20261019.md).

# Existing-project private media review � 19 October 2026

Local changes in the original consolidated PimpMyRide checkout on `lesley`.
**No commit, push, deployment, remote bucket/index/policy change, upload, migration,
customer-data operation, payment or email was performed.** No project was created.

## Compatibility and configuration

Existing Supabase project: `nymiyrzdpjctyembixbe`.
Existing Firebase project: `pimp-my-ride-a26fc`.
These identifiers came from the user. The user reports `verification` is private;
its live metadata and the proposed buckets' existence/policies have not been
independently inspected. Server Supabase credentials are not available locally.

| Bucket | Privacy | Local application behavior |
| --- | --- | --- |
| `verification` | Private, unchanged | Existing registration documents and routes; no MIME, policy or object changes. |
| `vehicle-images` | Private | New Garage photos, `photos/<owner UID>/<vehicle ID>/<UUID>`. |
| `showcase-images` | Private | New showcase photos, `posts/<shop UID>/<UUID>`; authenticated previews. |
| `request-images` | Private | New direct request attachments, `requests/<owner UID>/<vehicle ID>/<UUID>`; no Garage slot replacement. |

All three new media buckets need a 5,242,880-byte limit and only `image/jpeg`,
`image/png`, `image/webp`. HEIC/HEIF selection is converted before upload.
Private buckets support short-lived signed downloads; a public bucket is not
needed. See [Supabase bucket access models](https://supabase.com/docs/guides/storage/buckets/fundamentals)
and [signed URLs](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl).

Firebase Authentication authorises Express requests. The server owns the Supabase
privileged key and checks current Firebase account/profile, role, ownership and
request audience before signing; Firebase IDs do not imply Supabase Auth sessions.
No direct client Storage upload or anonymous/authenticated client policy is needed.
Review broad/global `storage.objects` policies: the private flag alone cannot
prove that a permissive existing client SELECT policy is absent. No policy is
created or changed by these source fixes.

## Defects corrected

1. The previous defaults were `marketplace-photos` and public `public-posts`.
   The previous showcase adapter explicitly rejected a private bucket and
   persisted a public URL. New defaults now match the three proposed names.
2. New assets and upload ledgers retain bucket identity alongside immutable paths.
   New private `posts.images` contain bucket/path, size and type, never a signed URL.
   Published references survive reload; expiring previews are transient UI state.
3. Cards, detail and edit previews support path-based private showcase references.
   `POST /api/posts/:id/images/view` validates the current actor, published shop
   post and exact saved image membership before issuing 60-second access. Clients
   cannot choose the bucket or sign arbitrary paths. Previews renew before expiry,
   clear on account/offline/focus changes and reject stale responses; failures
   show an explicit retry. Signed bearer links already issued remain usable until
   expiry; removing a post prevents new signing, not revocation of downloaded bytes.
4. Added direct request-photo selection/upload in the request form. Multipart
   `POST /api/photos/requests/:vehicleId?version=...&requestId=...` reuses the
   reservation, lease, fingerprint and settlement logic. It records a request-only
   asset without updating Garage slots/revision. New drafts attach confirmed IDs
   only, keep the selected file/retry intent on uncertainty and block submission
   while uploading. A failed upload does not create a successful media reference.
5. Requests can contain up to five owned assets, mixing Garage selections and
   direct uploads. An upload is tied to its owner and selected vehicle. Other
   owners cannot attach it. The owner can preview an unsubmitted attachment with
   `target: attachment`; shops cannot. Once attached, the existing request audience
   and selected-booking-shop checks govern access. Request and booking snapshots
   retain the original immutable asset IDs.

No application write replay, copy, move, delete or record backfill is introduced.
Retry identity and draft upload caches live in memory: after process termination,
refresh saved records before repeating an uncertain publication. Unattached
request assets remain retained if a draft is abandoned; an uploaded draft is not
itself a published request. Persisting abandoned drafts is outside this change.

## Existing media and PMR-02

Untagged historical vehicle references resolve through
`SUPABASE_LEGACY_PHOTO_BUCKET` (historical default `marketplace-photos`). Untagged
historical showcase paths resolve through `SUPABASE_LEGACY_POSTS_BUCKET`
(historical default `public-posts`). These defaults are not proof that those
buckets exist in this project. Confirm any previous hosted overrides before
activating the new environment. Never point a legacy setting at a newly created
empty bucket to hide missing media; access fails explicitly if the original
bucket is absent or incompatible.

New tagged references resolve only to the configured allowlisted bucket; an
arbitrary saved bucket cannot access `verification`. Updates retain the original
bucket of existing showcase images. URL-only legacy HTTPS images stay readable;
unsafe editing still fails rather than dropping references. No legacy bucket is
created, made public/private, renamed or removed. No existing image is migrated.

The showcase adapter exposes no delete operation. Removing/editing posts,
uncertain publication and failed upload verification preserve objects. Vehicle
removal/replacement retains source objects and published request attachments.
Read-only cleanup tools remain read-only. Mock-payment gates, payment operations,
verification document code, Firebase rules and ownership checks remain intact.

## Exact proposed remote operations � approval required

The machine-readable operation bodies are in
[`EXISTING_MEDIA_BUCKET_PROPOSAL_20261019.json`](EXISTING_MEDIA_BUCKET_PROPOSAL_20261019.json).
The local SQL counterpart is `backend/photo-storage-setup.sql`; it was not run.

1. Read only the proposed buckets' metadata and relevant storage policies. Do not
   enumerate or download existing customer objects or verification documents.
2. In project `nymiyrzdpjctyembixbe`, create each *missing* bucket named above with
   `public: false`, 5,242,880-byte limit and JPEG/PNG/WebP MIME list. An existing
   matching bucket is left intact. Any mismatch or unsafe broad policy stops the
   operation for a new exact proposal. No existing bucket UPDATE, DELETE, policy
   mutation, overwrite, rename or file operation is authorised by this proposal.
3. Re-read those bucket settings to verify the result. `verification` is untouched.

The JSON also records proposed server environment values. The URL is
`https://nymiyrzdpjctyembixbe.supabase.co`; media variables are
`SUPABASE_PHOTO_BUCKET=vehicle-images`,
`SUPABASE_POSTS_BUCKET=showcase-images`,
`SUPABASE_REQUEST_BUCKET=request-images`. Keep `SUPABASE_BUCKET=verification`.
Retain existing server-only credentials securely; never put them in Expo or chat.
No environment was changed remotely, and deployment/restart/activation needs
separate approval. The edited `.env.example` is a tracked placeholder template;
no actual `.env` or credentials were edited or copied into publication artifacts.

**Bucket setup approval does not approve uploads or Firebase document writes.**

## Firestore and feed implications

No new Firestore indexes are introduced by the upload/preview routes: asset,
vehicle and post lookups use exact document IDs. Discover and Find Jobs query
shapes and their existing composite definitions are unchanged in this task.
The earlier authenticated read-only index inspection found three READY indexes
in `pimp-my-ride-a26fc`; basic Discover was covered, while the prior missing-index
proposal still needs its final query review and separate approval. Do not treat
emulator success as proof that every existing-project feed query is indexed.
No Firebase rules/index deployment, composite creation/removal or migration ran.

## Controlled live test plan � not approved and not run

The user will supply existing Firebase test owner/shop UIDs after checking their
Auth records and Firestore roles. No accounts will be created or profiles changed.
Before asking for upload approval, resolve those UIDs, the designated test-only
vehicle ID and an active category ID, confirm Supabase metadata/policies and
secure server access, and present the concrete prefixes and record scope.
If a new test vehicle is needed, its creation requires a separate explicit scope
before any upload; do not use a real customer's vehicle.

Proposed budget for that later approval: **three new synthetic PNG objects**,
one each under `vehicle-images/photos/<test owner>/<test vehicle>/`,
`request-images/requests/<test owner>/<test vehicle>/`, and
`showcase-images/posts/<test shop>/`, each with a fresh UUID and `upsert:false`.
Use the prepared 92-byte, 16�16 synthetic image; SHA-256:
`7791330cf1138b83d7acee0022af9ecf7607bd7e25f38451c4f02f4e4c8dda09`.

The later scope must include the new asset/attempt records, mutation receipts,
audit entries, a new request and new showcase labelled `PMR MEDIA TEST 20261019-01`,
and changes to only the explicitly designated test vehicle's photo fields.
Open test records will appear in shared feeds; that visibility requires approval.
No existing user profile or real customer data is changed. No existing object is listed,
overwritten, moved or deleted, including test objects after the run.

Verify each exact new object's metadata and persisted bucket/path. Reload Garage,
view the new request as its owner and authorised shop, deny an unrelated actor,
confirm Discover/Find Jobs include the eligible new records, and test expiry and
renewal. Anonymous unsigned private-object access must fail. Use an invalid local
file to verify rejection before an upload; do not simulate outages by changing
remote configuration. If a write outcome is uncertain, stop and inspect only
approved new objects/records; do not exceed the object budget or delete anything.
Running the corrected backend locally against existing services still requires
secure server credentials and this separate live-write approval. The existing
hosted backend has not received these code fixes.

## Verification

Evidence: ignored `.local-checks/bucket-routing-20261019/`; Node 22.23.3.

- Focused media/ownership/retention suites: 85 passed, 0 failed.
- Additional signed-preview, upload retry and configuration checks: 20 passed.
- Full application suite: **291 passed, 0 failed**.
- Full backend unit suite including local-demo units: **218 passed, 0 failed**.
- Firebase emulator matrix: **69 passed, 0 failed**, plus **1 passed** dedicated
  local-demo integration test (70 total). Auth/Firestore loopback only; synthetic
  storage adapters, no Supabase network calls.
- Expo web export with dotenv disabled and offline mode: **passed**.
- Real Supabase upload/bucket-policy verification: **not run**.
- Existing Firebase project media workflow tests: **not run** (previous reads
  inspected index metadata and backend health only).
- Physical iOS/Android picker, rendering and background/restart tests: **not run**.

Unit tests inject storage doubles. Emulator tests use only the loopback
`demo-pmr-security` identifier and injected synthetic objects; local demo uses
memory-only fixtures. None establishes a successful real Supabase upload.

The older temporary publication candidate has not been refreshed with these
changes. This original working tree remains uncommitted and requires a fresh
reviewed publication preparation before any future commit/push.

## Exact source changes and preservation

Relative to the start of this bucket-routing task: **28 existing files updated,
5 files added**. Earlier uncommitted media/feed changes remain in the original
working tree and are not represented as new changes in this list.

- `backend/.env.example`
- `backend/app.cjs`
- `backend/config.cjs`
- `backend/demo-storage.cjs`
- `backend/photo-domain.cjs`
- `backend/photo-storage-setup.sql`
- `backend/photos.cjs`
- `backend/posts.cjs`
- `backend/server.cjs`
- `backend/services.cjs`
- `backend/storage.cjs`
- `backend/test/photos-integration.test.cjs`
- `backend/test/photos.test.cjs`
- `backend/test/posts.test.cjs`
- `backend/test/security.test.cjs`
- `backend/test/showcase-integration.test.cjs`
- `backend/test/storage.test.cjs`
- `docs/EXISTING_MEDIA_BUCKET_PROPOSAL_20261019.json` (new)
- `docs/EXISTING_MEDIA_BUCKET_REVIEW_20261019.md` (new)
- `docs/OPERATIONS.md`
- `render.yaml`
- `scripts/test-emulators.cjs`
- `src/features/marketplace/components/PostCard.js`
- `src/features/marketplace/components/RequestPhotoUploads.js` (new)
- `src/features/marketplace/components/ShowcasePhoto.js` (new)
- `src/features/marketplace/screens/OwnerMarketplaceScreens.js`
- `src/features/marketplace/screens/PostScreens.js`
- `src/features/marketplace/services/photoApi.js`
- `src/features/marketplace/services/postsApi.js`
- `src/shared/services/mediaUrl.js`
- `tests/helpers/load-ui.cjs`
- `tests/photo-api.test.cjs`
- `tests/private-showcase-and-request-uploads.test.cjs` (new)

All 225 original source/configuration/documentation files remain present. HEAD
and all local/remote-tracking/recovery refs match the starting checkpoint.
Verification document storage setup, mock-payment gate, payment provider,
marketplace payment/quotation operations, Firebase rules and index definitions
are byte-identical to the starting files. The local diff whitespace check passed.
Ignored evidence includes before copies, SHA-256 manifest and test logs; no
secret, actual .env file, runtime, dependency tree, log or backup was staged.

**Local implementation is verified; live bucket configuration and real media
acceptance remain pending approval and access. This is not a claim of live
Supabase or physical-device verification.**
