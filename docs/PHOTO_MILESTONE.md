# Vehicle and service-request photos

The user approved this milestone after the quote comparison and booking work.
It adds private vehicle photo libraries and optional attachments to the existing
request/quotation/booking journey. Repository implementation does not establish
that the storage bucket, policies or deployed backend have been configured.
Earlier milestone documents describe photos as future work at their delivery
date; this document records the subsequent implementation.
Codex has not committed, pushed, deployed, executed setup SQL, changed live data
or changed service settings during this work.

## Implemented behavior

| Role | Workflow |
| --- | --- |
| Active verified owner | Open Photos from a garage vehicle, choose a local JPEG/PNG, confirm upload/replacement/removal, inspect saved status and open a temporary preview |
| Active verified owner | Select zero to five saved photos when publishing an open or direct request; view those attachments on request and booking details |
| Active verified approved shop | View attachments for an eligible open request or its own direct request; the selected shop retains access through booking history |
| Admin | Existing account restrictions still apply; no new private-photo management or viewing privilege is granted |

There are five numbered library slots per vehicle, with one file per upload and
a maximum of 5 MiB (5,242,880 bytes) per file. JPEG and PNG are accepted; HEIC,
SVG, WebP, remote image addresses and automatic format conversion are not part
of this implementation. The server checks MIME against image signatures,
structural headers/endings, a maximum of 12,000 pixels per side and 40 million
pixels overall. The prototype's allowance of up to ten request photos is
deliberately reduced to five for this free-tier implementation. Existing shared
components and confirmation patterns are retained.

An archived vehicle remains readable by its owner but must be restored before
its library can change. Uploads are explicit confirmation actions. Replacing or
removing a photo changes only the current garage slot: published requests keep
their original attachment. Publishing snapshots selected asset IDs and safe
metadata inside the same transaction as the request; stale, foreign, duplicate
or excessive selections are rejected. Photos are optional, so older vehicles
and requests work without migration or fabricated image data.

Booking acceptance retains the request's photo IDs. Booking details display the
original request gallery rather than a mutable garage image. A closed request
does not keep granting competing shops photo access: only its selected booking
shop retains that history. Cancelled bookings retain their original history.
Published request attachments cannot be edited or deleted in this slice.

## API and records

All endpoints use the existing authenticated API middleware and current trusted
profile checks. Tokens are checked for revocation; current Auth verification,
enabled state and role/status determine access. Cached roles cannot authorize
uploads or viewing.

| Endpoint / operation | Input | Result |
| --- | --- | --- |
| `POST /api/photos`, `list` | `target: vehicle or request`, `id` | Safe photo metadata, current library `version` where applicable, `canManage` |
| `POST /api/photos`, `view` | Same target plus `photoId` | Signed `url` and `expiresAt` |
| `POST /api/photos`, `remove` | Owner vehicle target, `slot`, `version`, mutation `requestId` | Confirmed removal and new library version |
| `POST /api/photos/vehicles/:vehicleId/:slot` | Query `version` and retry `requestId`; multipart field `file` only | Saved asset ID, slot and new library version |
| `POST /api/marketplace`, `requestCreate` | Existing request fields plus optional `photoIds` | Existing request creation result |

`requestId` on a photo mutation is a retry key, not a service-request identifier.
The API rejects client-supplied ownership, storage paths, provider fields and
other unexpected fields. Authorization runs before accepting the multipart
body. Uploads share the existing six/account/minute budget and two processing
slots with verification documents. Disconnection during storage/database work
does not release a slot until that work settles; an interrupted parser releases
its slot without starting a late upload service operation. Limits remain local
to one backend process and reset on restart.

| Location / record | Purpose |
| --- | --- |
| `screens/VehiclePhotosScreen.js`, `OwnerNavigator.js` | Garage photo route |
| `components/PhotoGallery.js`, `services/photoApi.js`, `utils/photos.js` | Selection, validation, previews, confirmations, versioned mutations and account-bound retry identity |
| Owner/shop request screens and `screens/BookingScreens.js` | Attachment selection and authorized request/history galleries |
| `backend/photos.cjs`, `photo-domain.cjs` | Access checks, file validation, immutable upload attempts and transactional publication |
| `backend/storage.cjs`, `server.cjs`, `app.cjs` | Separate private photo storage scope and authenticated HTTP wiring |
| `vehicles` | `photoSlots`, `photoIds` and a separate `photoRevision` for library conflicts |
| `serviceRequests`, `bookings` | Immutable attachment references; requests also retain safe metadata |
| `marketplacePhotos` | Server-only asset ownership, immutable path, metadata and upload-attempt identity |
| `storagePhotosUploadAttempts` | Actor/key fingerprint, owned upload lease, terminal outcome and retained cleanup state |

Firestore clients cannot directly read or write the new photo collections,
including clients with an admin role. Metadata responses expose names, type,
size and timestamps, rather than a raw path field or credentials. A signed
storage URL necessarily contains an object address and bearer credential; treat
the complete URL as private, including in logs and screenshots.

## Upload consistency and retries

Each new object uses `photos/{ownerUid}/{vehicleId}/{server UUID}` in the separate
private photo bucket. A durable attempt is created before storage I/O. Uploads
never overwrite an existing path. The publication transaction rechecks the
owner, vehicle, library revision and the worker's live lease, then commits the
asset, slot, attempt result and audit together. Replacements mark the prior
attempt for retention review in that same transaction.

The two-minute lease is a publication fence, not a background scheduler. An
expired or closed worker cannot publish metadata. Storage and Firestore are
separate services: failure can leave a retained object without a published
asset. Unknown outcomes do not authorize deletion. A later authoritative receipt
can recover a successful result even after that photo was replaced or removed,
without uploading or publishing it again.

The client retains at most 50 unresolved retry intents in memory. Retrying the
same selected file preserves the original key and photo revision across a
metadata refresh, so a lost success response is not mistaken for a new upload.
Only a server-confirmed terminal failure permits a fresh key for a later manual
attempt. A stale-revision refusal records that terminal outcome, allowing a
later explicit retry with freshly loaded state. Restart, account switching,
selecting a different file URI or eviction can lose that identity. Refresh and
inspect saved status before repeating an
uncertain action after those events. There is no automatic mutation retry or
offline upload queue.

## Privacy, retention and scope limits

- Viewing rechecks current access immediately before minting a URL valid for
  60 seconds. A holder can reuse that URL until expiry; logout or suspension
  cannot immediately revoke an already issued link or erase a downloaded image.
- Photo metadata, selections and links are not added to AsyncStorage. Offline
  and blurred galleries clear displayed server metadata/previews; reconnect
  refreshes from the backend. Account/vehicle changes isolate component state.
- Native file selection uses `copyToCacheDirectory`. Selected bytes may remain
  in the app's cache after state clears or logout, and image loaders/platforms
  may cache downloaded bytes. No secure device-file erasure is implemented.
- Original bytes are retained. Validation is not full image decoding,
  sanitization or malware scanning; EXIF/GPS information may remain in a photo.
  Filenames are visible metadata. Do not assume a vehicle photo is anonymous.
- Five current slots do not cap retained storage. Replacements, removed files,
  failed uploads, request history, metadata, receipts and audits accumulate.
  Monitor free-tier capacity and decide retention before enabling deletion.
- Camera capture, progress/work-completion photos, portfolios, avatars, image
  editing/compression, public galleries and deletion automation remain future
  work. No paid scheduler, new paid service or dependency upgrade is introduced.

[PHOTO_RETENTION_PROPOSAL.md](PHOTO_RETENTION_PROPOSAL.md) describes the read-only
operator report. It cannot delete files and rejects `--apply` before connecting.
Garage removal is detachment, not a promise to erase the stored object.

## Setup and review

After separate environment/release authorization, configure the server-only
`SUPABASE_PHOTO_BUCKET` (default `marketplace-photos`) alongside the existing
`SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Keep `SUPABASE_BUCKET=verification` for
identity documents. Never put either server secret into an `EXPO_PUBLIC_*` value.
`render.yaml` now declares the same nonsecret photo-bucket default; editing that
manifest has not configured or deployed a running service.

`backend/photo-storage-setup.sql` creates/updates the private bucket with a
5 MiB limit and JPEG/PNG MIME allowlist. It contains mutations and must not be
run as a read-only audit. The trailing policy query can be inspected separately.
No SQL or live bucket/policy change was executed here. Check every applicable
`storage.objects` policy, including broad policies for other buckets: a private
flag alone does not prove that anonymous/authenticated clients are denied.

Verify the existing Firestore marketplace indexes and default-deny rules, then
release backend photo support before its client, only under an approved release.
The photo/reference lookups use standard single-field indexes; no client rule
exception or production seed/migration is required. Validate bucket permissions,
upload/view failures and the complete journey with synthetic data in an isolated
environment. Supabase secret rotation remains unconfirmed and must be resolved
privately before release. See [OPERATIONS.md](OPERATIONS.md).

## Verification

Final local checks passed: 148 frontend tests, 129 backend tests and 42 emulator
checks (6 rules, 17 foundation, 12 marketplace and 7 photo integration checks).
The Expo web export passed with 668 modules; 130 JavaScript/CJS files parsed and
306 relative imports resolved. App/backend manifest declarations match their
lockfiles. See PROJECT_HANDOVER.md for commands and environment limitations.
Test coverage includes file validation, audience and
role gates, immutable attachment preservation, revision conflicts, receipt
recovery, expired/interrupted workers, cleanup reference checks, client retry
identity and account changes. HTTP regressions exercise actual local disconnects;
Auth/Firestore integration uses only guarded local emulators and mocked storage.
No production fixtures or real identity documents are used.

Observed local Node is 24.19.0; the backend target remains 22.x and has not been
validated here. The in-app browser connection reported `Browser is not available:
iab`; browser/device interaction and visual fidelity remain unverified. A web
export verifies bundling, not those behaviors or deployed policy correctness.

Suggested commit: `feat: add private vehicle and request photos`.
The proposed next feature milestone is job progress, completion and customer
reviews; it requires a separate instruction. Existing booking rescheduling and
capacity limits remain unchanged.
