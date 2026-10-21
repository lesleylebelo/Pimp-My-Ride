> Index execution update: the six approved composites were created individually
> and are all READY. All three pre-existing indexes remain intact. All nine
> read-only query plans pass, including Discover and Find Jobs. See
> [FIRESTORE_MEDIA_INDEX_EXECUTION_20261019.json](FIRESTORE_MEDIA_INDEX_EXECUTION_20261019.json).
> Earlier missing-index statements below describe the pre-execution baseline.
> Server credentials and real-media upload approval remain separate outstanding gates.

# Completed real-media prerequisites - 19 October 2026

**Read-only remote inspection completed. No remote uploads, data/index/policy
writes, deletion, commit, push or deployment occurred.**

## Vehicle and category

Customer `aT6RWRl4AtQjtJKYIiD39eaR3x73` owns six active vehicles. Selected metadata
showed no photos, photo revision 0 and all slots 1-5 empty on every vehicle.
None carried an explicit test-only marker. The user subsequently **designated**:

- Vehicle: `78gG6bPHbGvCTOCuZAwR`, 2018 BMW M4.
- Photo slot: **1, empty**; current photo revision **0**.
- Active category: `abrEnmpBoQ2cBvEtYqjl`, **Other**, `archived: false`.

This designation selects the existing vehicle for the proposal; it does not
approve any upload or Firestore write. No new vehicle/category is necessary.
Re-read the exact vehicle immediately before an approved upload and stop if its
owner, archived state, empty slot or photo revision has changed. Do not overwrite
another photo or alter a different vehicle.

The six observed vehicle IDs were `78gG6bPHbGvCTOCuZAwR`,
`AotuM6YtWtbtTNFLJVHn`, `DWlTFjwBpxxwLVWRtEy3`, `mEH1aWiGO05BoJC6zM8E`,
`sAqvO5lNmHpqpAkZFfFK`, and `zfUa8Io7qYe0TcKXIh1o`. Only the designated first
vehicle is included in the proposed write scope. No existing media was read.

## All six feed checks diagnosed

The cause was **missing composite indexes**, not failed authentication or an
invalid query. Firestore returned HTTP 400 with a streamed JSON array containing
`FAILED_PRECONDITION` and `no matching index found.` The earlier Firebase CLI
wrapper converted that array into a generic error, obscuring the cause.

The corrected read-only checker, `scripts/check-media-query-plans.cjs`, sets
`resolveOnHTTPError:true` and classifies the actual response array. Every request
uses `explainOptions: {analyze:false}` and rejects unexpected document results.
It does not execute customer queries, create indexes or write documents. See
[Firebase Query Explain](https://firebase.google.com/docs/firestore/query-explain).
It exits 2 when indexes are missing, 1 for an unsuccessful preflight, and 0 only
when every plan is available.

| Query check | Confirmed result | Required composite fields, in order |
| --- | --- | --- |
| Discover category | Missing index | `posts`: status ASC, authorRole ASC, category ASC, createdAt DESC, __name__ DESC |
| Discover shop / My Posts | Missing index | `posts`: status ASC, authorRole ASC, authorId ASC, createdAt DESC, __name__ DESC |
| Discover category and shop | Missing index | `posts`: status ASC, authorRole ASC, category ASC, authorId ASC, createdAt DESC, __name__ DESC |
| Find Jobs open | Missing index | `serviceRequests`: visibility ASC, status ASC, createdAt DESC, __name__ DESC |
| Owner My Requests | Missing index | `serviceRequests`: ownerId ASC, createdAt DESC, __name__ DESC |
| Find Jobs direct | Missing index | `serviceRequests`: visibility ASC, shopId ASC, status ASC, createdAt DESC, __name__ DESC |

All six are collection-scope definitions and already exist in the local
`firestore.indexes.json`; no application query rewrite or further index-definition
edit is needed. Their exact additive create bodies are in
[`EXISTING_FIRESTORE_MEDIA_INDEX_PROPOSAL_20261019.json`](EXISTING_FIRESTORE_MEDIA_INDEX_PROPOSAL_20261019.json).
The proposal is now confirmed rather than awaiting diagnosis. **No indexes were
applied.** Preserve all three existing READY indexes, including the older shopId
index. No existing index needs replacement/removal; do not deploy the whole file.
After approval to create the six, wait for READY and rerun the plan checker.

Basic Discover, Garage listing and the current-shop quotation lookup all planned
successfully. Garage and quotation lookup use built-in single-field index
intersection; do not add composites solely for those two queries. The local
newest-first ordering and authorId compatibility remain intact.

## Storage and credentials

Direct inspection through the now-connected Supabase account independently
confirmed all three buckets are private, with exactly 5,242,880-byte limits and
image/jpeg, image/png and image/webp MIME lists. A read-only transaction found
zero policies for both storage.objects and storage.buckets, confirming the
user-reported review. The transaction ended with ROLLBACK. No objects or
verification documents were read and no configuration was changed. This is live
metadata/policy verification, not a successful upload or runtime-key test.

The Express adapter uses server-only `SUPABASE_SECRET_KEY`, constructs its own
Supabase client with session persistence/refresh disabled, checks that new media
buckets are private, uses immutable `upsert:false` uploads, and creates 60-second
signed URLs. It never passes Firebase customer/shop tokens to Supabase as Storage
authorisation. No public bucket or new client Storage policy is required when
using the appropriate privileged server credential. Supabase documents that
server service keys bypass RLS; Express must retain the ownership/audience checks.
See [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
The `public-posts` adapter is legacy compatibility only, not used for new private
showcases. Historical media is not moved or reinterpreted.

**Local backend credentials remain blocked/incomplete.** No `backend/.env.local`
is present, and no Supabase server key or Firebase service-account credential is
configured in the inspected local environment. Connected-account access does not
supply those credentials to Express. No credentials were created or copied.

Exact ignored-file settings, secure credential placement and commands are in
[`LOCAL_REAL_MEDIA_CREDENTIALS.md`](LOCAL_REAL_MEDIA_CREDENTIALS.md).
The new offline checker prints flags and key type only, not values, and makes no
network calls. The guarded local launch command loads the env file with Node 22
and requires `HOST=127.0.0.1`. Production startup retains its existing default.
No server or Expo session was started during preparation.

## Approval readiness

The exact three-object test plan now contains the designated vehicle, slot,
category and account identifiers:
[`REAL_MEDIA_TEST_PLAN_20261019.json`](REAL_MEDIA_TEST_PLAN_20261019.json).
The private object prefix families are:

- `vehicle-images/photos/aT6RWRl4AtQjtJKYIiD39eaR3x73/78gG6bPHbGvCTOCuZAwR/`
- `request-images/requests/aT6RWRl4AtQjtJKYIiD39eaR3x73/78gG6bPHbGvCTOCuZAwR/`
- `showcase-images/posts/vsZYsbWkD4Urq2S5OmWEKUNs6rZ2/`

Only fresh server UUID object names are allowed. The customer and approved shop
remain the ordinary actors; the admin test account is excluded. The plan includes
one new open request and showcase, upload ledgers/receipts, limited audit writes
and one update to the designated vehicle's empty photo slot. Preview audit writes
are explicitly included. No new account, vehicle or service category is required.

The plan is **ready for approval review**, but **execution is not yet ready**:

1. An authorised person must privately supply the existing local server credentials
   and pass the offline checker; remote credential capability remains untested.
2. Approve the six additive index creates separately; after they are READY, rerun
   the nine query plans. No index approval has been received.
3. Approve the exact existing three-object/Firestore/audit test scope separately.
   Vehicle designation and the earlier bucket setup approval do not authorise it.

Full Discover/Find Jobs acceptance cannot pass until the required indexes exist.
No extra remote configuration or policy change is proposed.

## Corrections and verification

Local changes in this follow-up:

- Added `scripts/check-media-query-plans.cjs` and tests that distinguish streamed
  missing-index errors from authentication failures and forbid query execution.
- Added `backend/check-local-config.cjs`, `backend/local-server.cjs`, local npm
  commands, and `HOST` selection in `backend/config.cjs` / `backend/server.cjs`.
  Offline validation rejects public Storage keys, wrong projects, missing
  credentials, emulator/demo settings and nonlocal binding. It does not establish
  cryptographic validity or live credential permissions.
- Updated the exact index/upload plans and current readiness documentation.
- Focused media/configuration/planner tests: **81 passed, 0 failed**.
- Live read-only tests: complete test-owner vehicle scan, nine active categories,
  three plannable query shapes and six confirmed missing-index query shapes.
- Direct Supabase read-only verification: all three buckets/settings match;
  storage.objects policies 0, storage.buckets policies 0.
- No new emulator matrix, physical-device test or real Supabase upload was run.

PMR-02 storage retention, ownership/audience checks, mock-payment gate, payment
provider, verification-document code and Firebase rules remain unchanged.
The existing local index definitions also remain unchanged. Source checkpoints
and evidence are ignored under `.local-checks/media-prerequisites-20261019/`.
