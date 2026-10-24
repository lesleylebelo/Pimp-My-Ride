# Profile picture management

Implemented in the original PimpMyRide application on `lesley`, using existing Firebase Auth/Firestore, Express and private Supabase storage. No remote configuration or production data was changed during development.

## User experience

Both customer and workshop Account/Profile Settings now support Upload Photo, Change Photo and confirmed Remove Photo. The existing Expo image picker offers square editing on native devices; the image manipulator also applies a centred square crop for web, prepares JPEG bytes, normalizes the selected image and validates the resulting size. Users preview the circular image before choosing Save Photo, or cancel without uploading. Selection/upload errors, loading, supported transport progress and success are visible. A failed ambiguous upload retains the selected photo for a safe retry. Terminally closed attempts require refresh/reselection. Account changes and loss of screen focus invalidate pending previews.

A shared `ProfileAvatar` renders saved images in settings, workshop identities, showcase author rows, conversation inbox rows and authorized chat headers, with vector fallbacks. There are no extra navigation entry points. Private images are cleared on blur, background, offline state, identity/permission changes and failed image loads. Successful focused previews renew before expiry; failures do not start automatic retry loops. Cached URLs and pending operations are account-scoped, bounded and memory-only, with in-flight deduplication and revision-aware cache keys. No signed URL is written to Firestore, offline profile cache, posts or messages.

## API and data

All routes pass through existing revoked-token-aware Firebase authentication and API rate limits:

- `POST /api/profile/photos` with `{op:'status'}`: own `photoId` and `version` only.
- `{op:'view',context:'self'}`: own private preview, with no account ID accepted.
- `{op:'view',context:'shop',id:shopId}`: approved active workshop image for an eligible marketplace account.
- `{op:'view',context:'post',id:postId}`: current active author image of an existing published post.
- `{op:'view',context:'conversation',id:conversationId}`: current other participant image, using the existing messaging authorization function. Mere request browsing or an unapproved enquiry does not grant access. Rejection/revocation denies new previews. Existing send rules are unchanged.
- `{op:'remove',version,requestId}`: transactional own-photo removal with a mutation receipt.
- `POST /api/profile/photos/upload?version=...&requestId=...`: one multipart `file`, max 5 MiB, authenticated and authorized before parsing. Shares the existing six uploads/minute and two concurrent buffered uploads limits.

`users/{uid}.profilePhoto = {id: uploadReceiptId}` is the only authoritative active reference. `profilePhotoRevision` provides optimistic concurrency and defaults to zero for existing accounts. `profilePhotoUploads/{receiptId}` stores immutable server-generated object identity, bucket, owner, fingerprint, worker lease, metadata and durable outcome. The collection is private under existing default-deny Firestore rules. Client profile writes remain denied; no rules/index/schema migration is needed. New fields are created only when a user actually saves/removes a photo.

Own image management does not grant marketplace approval: active verified customers and workshops may manage their own image, including workshops still awaiting approval; public workshop/post/conversation previews retain marketplace and communication restrictions. Suspension, disabled/unverified Auth accounts, review/status/provisioning locks and ownership are rechecked before publication.

## Storage and lifecycle

**No new bucket or environment variable is required.** The backend uses the existing `SUPABASE_PHOTO_BUCKET` (default `vehicle-images`) with a separate strict `profiles/{uid}/{uuid}` path scope. Existing vehicle/document/request/showcase scopes reject these paths. The adapter refuses public or unavailable buckets and keeps storage credentials server-side. Uploads are immutable (`upsert:false`); signed previews expire after 60 seconds. Like other signed previews, an already-issued bearer URL may remain valid until expiry following removal or revocation. See [Supabase private delivery](https://supabase.com/docs/guides/storage/serving/downloads) and [access control](https://supabase.com/docs/guides/storage/security/access-control).

Uploads use the existing JPEG/PNG/WebP byte-signature, structural-header and dimension validation (12,000 pixels per side / 40 MP), not filename extension. HEIC is decoded on the device before transport. Storage size/MIME is inspected before a new reference is published. Transactions fence worker leases, stale revisions, concurrent replacements and retry fingerprints. Lost reservation/commit acknowledgements are reconciled from authoritative receipts. A successful superseded receipt replays its original result without reactivating that image.

Replacement publishes the new reference and marks the old receipt `cleanupPending` atomically. Removal clears the reference and marks its receipt similarly. Failed uploaded objects also remain tracked in this ledger. **No photo object is physically deleted:** the current repository's photo-retention deletion policy is unapproved/dry-run-only. This feature preserves that protection and never deletes media referenced by any record. Existing vehicle cleanup reports are not expanded to delete these objects; future retention work must reconcile this ledger and all authoritative references before deletion.

## Native configuration and release requirements

The already-installed `expo-image-picker` plugin now supplies a photo-library usage explanation and disables unused camera/microphone permissions. No new dependency was installed. The PR artwork, icon assets, animated startup, native splash options and app identifiers are preserved. Validate the plugin in a fresh native build; Expo exports do not constitute native builds.

The backend routes and frontend must both be deployed through the existing infrastructure when separately authorized. Until those changes are released, the current hosted backend will not expose the new endpoints; the UI reports errors/falls back instead of treating an upload as saved. No deployment was performed.

## Files changed for this feature

- `app.json` (image-picker plugin only).
- `backend/profile-photos.cjs` (new).
- `backend/app.cjs`, `backend/services.cjs`, `backend/server.cjs`, `backend/storage.cjs`.
- `backend/messaging.cjs` (avatar metadata and reuse of current authorization; send behavior unchanged).
- `backend/posts.cjs` (workshop avatar revision metadata only).
- `backend/package.json` (test script only; dependencies unchanged).
- `backend/test/profile-photos.test.cjs`, `backend/test/profile-photos-integration.test.cjs` (new).
- `backend/test/ai-production-compatibility.test.cjs` (recognizes this authorized, separately tested feature alongside earlier changes; AI guards unchanged).
- `scripts/test-emulators.cjs`.
- `src/features/auth/components/ProfilePhotoSettings.js`, `src/features/auth/services/profilePhotos.js` (new).
- `src/features/auth/screens/AccountScreen.js`.
- `src/shared/components/ProfileAvatar.js` (new).
- `src/features/marketplace/components/MessagingUI.js`, `PostCard.js`, `ShowcaseUI.js`.
- `src/features/marketplace/screens/MessagingScreens.js`, `PostScreens.js`.
- `tests/helpers/load-ui.cjs`, `tests/rules/access.test.cjs`.
- `tests/profile-photos-ui.test.cjs`, `tests/profile-photos-service.test.cjs` (new).
- `docs/PROFILE_PHOTOS.md` (this file).

Earlier uncommitted branding/startup work is preserved. Payment/quotation/booking logic, authentication services/context, Firebase configuration, Firestore rules/indexes and storage policies are unchanged.

## Remaining device/browser checks

Check actual library picker permission denial, cancellation, native square editing, HEIC orientation, large photos, web file selection/crop, slow-network progress/retry, back navigation or account switching during selection/upload, offline transitions, VoiceOver/TalkBack, large fonts and light/dark appearance. On physical devices confirm saved images after restarting/login and authorized participant/workshop images across screens. Local tests use synthetic bytes, mocks and guarded loopback Firebase emulators only; no production upload/login was used.

## Verification results

Verified with Node **22.23.3**:

- Complete application suite: **495 passed, zero failures** (`.local-checks/profile-full-app.log`). Includes 10 new profile-photo UI tests and 6 new transport/cache/retry tests, plus existing branding/startup, auth, garage, showcase, messaging, notification, quotation, booking, payment and PimpPilot regressions.
- Complete configured backend suite: **310 passed, zero failures** (`.local-checks/profile-full-backend.log`), including 16 focused profile-photo service/security/storage tests.
- Firebase Auth/Firestore emulator matrix: **82 passed, zero failures** across six files (`.local-checks/profile-emulator-run/emulator-result.json`). Includes direct-client reference/ledger denial, real authenticated customer/shop lifecycle, persisted authoritative references, replay after replacement, retained objects, transaction contention and disabled-session denial. Emulators shut down successfully.
- Final Expo exports: **iOS, Android and Web passed**, including native Hermes bytecode, HTML and favicon (`.local-checks/profile-photos-export.log`; output `.local-checks/profile-photos-export`).
- Expo prebuild configuration resolved successfully (`.local-checks/profile-expo-config.json`); one existing native splash plugin remains. No native projects were generated. Native photo-permission and launch UI still require actual binary checks.
- `git diff --check` passed. Original branch remains `lesley`; protected payment/quotation logic, auth services/context, Firebase configuration and Firestore rules/indexes are unchanged.

The emulator run used the repository's existing isolated loopback test pattern, with environment credentials removed and no production fallback. No production test writes, remote bucket/policy changes, commits, pushes or deployments occurred.
