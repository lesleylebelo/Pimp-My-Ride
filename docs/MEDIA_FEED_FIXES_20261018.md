# Photo uploads, rendering and feed fixes — 18 October 2026

Implemented in the original consolidated `PimpMyRide` checkout on `lesley`.
**Ready for isolated team testing. Shared hosted testing remains conditional on
the required indexes and bucket configuration being available.** No commit,
push, merge, migration, SQL execution, publication or deployment was performed.

## Confirmed defects and corrections

| Path | Confirmed source defect | Correction |
| --- | --- | --- |
| Vehicle upload on web | Validation accepted WebP, but the upload URI allowlist excluded `data:image/webp`. | Permit WebP data URLs; preserve device-only sources, actual blob-size checks, authentication and server byte validation. |
| Showcase picker | HEIC/HEIF was rejected before JPEG conversion. Missing source size was invented as one byte; converted results could inherit an inaccurate original size. A zero selection limit can mean unlimited selection. | Validate supported source type and any supplied source size, decode locally to JPEG, measure the returned base64 bytes, validate the actual output against 5 MB, and return without launching when no slots remain. Unknown output size fails closed. |
| Vehicle HEIC selection | The document picker restricted selection to JPEG/PNG/WebP. | Add HEIC/HEIF to picker inputs and convert locally. The backend continues accepting only validated JPEG/PNG/WebP bytes. |
| Storage configuration | `photo-storage-setup.sql` allowed JPEG/PNG only while the application/server accepted WebP. | Add WebP to the private-bucket MIME list. This confirms a source configuration mismatch; the deployed bucket was not inspected. |
| Garage display | Garage provided a photo-management link but no rendering of persisted vehicle media. | Resolve saved asset IDs through the authorised photo APIs, render a preview, renew access before expiry and discard old account/focus responses. |
| Request editing | Updating a request revalidated every attached photo against the vehicle's current slots. Replacing/removing a Garage photo therefore prevented editing a request that legitimately retained it. | Allow previously persisted attachment IDs only when the request keeps the same vehicle. Recheck each asset's owner, vehicle and canonical path. New requests still cannot attach removed assets. |
| Failed publication | An upload response without a valid owned path could be filtered out and publication attempted with remaining images. | Both upload service and form require a confirmed `posts/<current uid>/…` path before publication. A failed/foreign/malformed response leaves the form unsuccessful and performs no cleanup. |
| Find Jobs ordering | Requests were paginated by random document ID, so new jobs could fall outside the first page. | Order by `createdAt DESC`, then document ID descending; paginate with the complete document snapshot. Include indexes for open, direct and owner queries. |
| Refresh after pagination | Garage/request screens retained their later-page cursor on focus and manual refresh. The accumulator retained stale/removed first-page rows. | Reset managed cursors on focus/account/reconnection and refresh, replace the first page and clear pagination request history. |
| Discover pagination retry | A failed cursor remained marked as already requested. | Release that cursor after failure so the user can retry. |
| Discover timestamp cursor | Valid Firestore timestamps can have fractional milliseconds. The cursor validator required integers; reconstructing only milliseconds can also lose ordering precision. | Preserve seconds and nanoseconds, validate their bounds, and continue accepting historical millisecond cursors. |
| Historical shop posts | Shop filtering required the later `shopId` alias, excluding older records that have `authorId`. | Filter by the canonical author ID and add the matching indexes. No data migration is needed for this case. |
| Public media display | Non-array media could crash `.filter`/`.map`; historical HTTPS strings were omitted by cards, and load failures were silent. | Guard arrays, support historical HTTPS URL strings conservatively and show image-load errors. Editing malformed or URL-only records fails explicitly while retaining all published references. Never derive a URL from an arbitrary legacy path. |
| Explicit local demo | HTTPS-only render checks rejected the demo adapter's intentional HTTP media endpoints. | A shared URL predicate permits only the configured `/__demo/media/photos` and `/__demo/media/posts` endpoints in explicit demo mode; normal mode requires HTTPS. Demo mode rejects external production media URLs. |

The historical physical-iPhone `Cannot read property 'reload' of undefined`
exception still has no captured device stack. These fixes do not establish its
exact cause. Existing deferred native manipulation and development stack
logging remain; cancellation/empty selection still returns without manipulation
or upload. The installed picker documents that modern library selection does
not require a separate broad library-permission request; DocumentPicker uses
the system provider. Permission denial/runtime registration must still be
checked on actual devices. No permission protection was removed.

## Upload, persistence and delivery contracts

| Content | API and source | Firestore references | Supabase storage |
| --- | --- | --- | --- |
| Owner vehicle photos | `photoApi.js`, `PhotoGallery.js`; multipart `POST /api/photos/vehicles/:vehicleId/:slot?version=…&requestId=…`; JSON `POST /api/photos` list/view/remove | `vehicles.photoSlots`, `photoIds`, `photoRevision`; `marketplacePhotos` asset metadata; `storagePhotosUploadAttempts` durable retry ledger | Private `marketplace-photos` (configurable `SUPABASE_PHOTO_BUCKET`), `photos/<owner>/<vehicle>/<asset UUID>` |
| Request attachments | `requestCreate` / `requestUpdate` through `POST /api/marketplace`; `POST /api/photos` with `target: request` for delivery | `serviceRequests.photoIds` plus immutable safe metadata snapshots; references to the same owned assets, also retained by booking snapshots | Same private objects; no public URL is persisted into a request |
| Shop showcase | Multipart `POST /api/posts/images`; REST `POST/PATCH/DELETE /api/posts[/id]`, `GET /api/posts` and detail | `posts.images`: `{path,url,contentType,size}`; owned `authorId`, shop alias, category, `status: published`, server timestamps | Public `public-posts` (configurable `SUPABASE_POSTS_BUCKET`), `posts/<shop>/<object UUID>` |
| Verification documents | Existing verification APIs and document components, unchanged | Existing document metadata | Separate private `verification` bucket/scope; no broadened MIME policy |

Private media identity is the asset ID, not its expiring URL. The backend
rechecks current account, ownership or request audience before minting a
60-second signed URL. Garage previews renew with a new authorised request;
the detailed gallery clears expired previews and permits authorised viewing
again. URLs remain transient UI state, and blur/offline/account transitions
discard previews. Successful uploads persist in Firestore and survive reopening
the app; a pending local selection is not a persisted upload and may require
reselection after process termination. Failed loads show a retry/error state.

Native multipart continues using `{uri,name,type}` and lets the transport set
its boundary. Web uses a real Blob. Vehicle selection copies provider files
into cache; showcase manipulation creates a local JPEG output. Server-side
signature/header, dimensions, file-size and MIME checks remain authoritative.
HEIC is converted before transport rather than added to the backend allowlist.

## Feed behavior and protections

Discover lists published shop showcases in `posts`. Find Jobs lists open,
eligible customer `serviceRequests`; its existing source selector can also
include shop showcases as separately typed cards. Customer service requests
are not turned into public showcase posts. Direct requests remain restricted
to their selected shop and owner. Closing, archived vehicles/categories,
restricted accounts and quotation/privacy rules retain their existing checks.

Returning from successful publication refreshes focused feeds without an app
restart. Active service, source, search, shop and location filters still apply;
content that does not match them is intentionally absent. First-page refresh
replaces stale rows; later pages append/deduplicate. New jobs sort into the
first page instead of depending on a random ID.

PMR-02 retention remains in force: no showcase object deletion was added for
editing, soft removal, failed uploads, uncertain commits or retries. Existing
ownership and moderation checks remain. PMR-03 quotation consistency, booking
and payment operations and the existing mock-payment gate were not changed.
No production quotation acceptance depends on new media code. Retained
unreferenced showcase objects may continue to consume storage by design.

Supabase secrets remain server-only. Tests use injected storage adapters or the
isolated memory-fixture implementation. No real customer objects, production
credentials or live Supabase operations were used. `storage.cjs` itself is
unchanged relative to the task's starting worktree.

## Verification

All runs used the existing local **Node.js v22.23.3** binary, not the host's
default Node 24. Evidence is under `.local-checks/media-feed-20261018/`.

| Verification | Before | Final |
| --- | --- | --- |
| Full application, `node --test tests/*.test.cjs` | 273 passed, 0 failed | 283 passed, 0 failed (`app-verified.log`) |
| Backend files listed by `backend/package.json` | 204 passed, 0 failed | 208 passed, 0 failed |
| Complete backend plus additional local-demo unit suite, sequential | Not separately captured | 212 passed, 0 failed (`backend-verified.log`) |
| Focused picker, vehicle, request, owner/shop, lifecycle and upload tests during implementation | — | 97 passed, 0 failed (`focused-after.log`); later regressions also run in the final full suites |
| Showcase REST/storage and timestamp regressions | — | 19 passed, 0 failed (`posts-final.log`) |
| Firebase rules | — | 12 passed |
| Firebase backend integration | — | 17 passed |
| Firebase marketplace integration, including newest-first/tied-timestamp jobs and direct privacy | — | 28 passed |
| Firebase photo integration | — | 7 passed |
| Dedicated local-demo integration | — | 1 passed |
| Expo Web export with dotenv disabled and offline mode | — | Passed (`web-verified.log`) |

The isolated emulator matrix totals **64 passed**, with an additional **1
passed** local-demo integration test. Final emulator runner exit codes are zero
in `emulator-result-final.json` and `emulator-result-demo.json`. They use only
`demo-pmr-security`; the main matrix uses loopback ports 28080/29099 and the
demo suite uses its required 8080/9099. No production backend is started.

Before/after regression replay also uses the preserved source: five selected
frontend regressions fail against the old implementation, and three backend
regressions fail for the old shop filter, timestamp cursor and retained-request
editing. See `regressions-before.log` and `backend-regressions-before.log`.
The corresponding tests pass against the final source.

Intermediate failures are retained in evidence. One backend assertion needed
to reflect intentional newest-first ordering while preserving the exact
quotation batch membership check. A concurrent full backend run hit the
previously documented HTTP `ECONNRESET` test flake; the complete sequential run
passes without weakening its assertions. An initial extra demo integration
attempt correctly failed the exact-port isolation gate; the runner was fixed
to use its required ports, without changing application isolation.

## Exact files changed for this task

Backend/configuration:

- `backend/marketplace.cjs`
- `backend/photo-domain.cjs`
- `backend/photo-storage-setup.sql`
- `backend/posts.cjs`
- `firestore.indexes.json`

Application:

- `src/features/marketplace/components/MarketplaceUI.js`
- `src/features/marketplace/components/PhotoGallery.js`
- `src/features/marketplace/components/PostCard.js`
- `src/features/marketplace/components/PrivatePhoto.js` (new)
- `src/features/marketplace/hooks/useMarketData.js`
- `src/features/marketplace/hooks/usePostsFeed.js`
- `src/features/marketplace/screens/OwnerMarketplaceScreens.js`
- `src/features/marketplace/screens/PostScreens.js`
- `src/features/marketplace/screens/ShopMarketplaceScreens.js`
- `src/features/marketplace/services/photoApi.js`
- `src/features/marketplace/services/postsApi.js`
- `src/features/marketplace/utils/photos.js`
- `src/shared/services/mediaUrl.js` (new)

Regression tests:

- `backend/test/marketplace-integration.test.cjs`
- `backend/test/marketplace.test.cjs`
- `backend/test/photos.test.cjs`
- `backend/test/posts.test.cjs`
- `backend/test/storage.test.cjs`
- `tests/marketplace-owner.test.cjs`
- `tests/marketplace-photos.test.cjs`
- `tests/marketplace-post-picker.test.cjs`
- `tests/marketplace-post-image-lifecycle.test.cjs`
- `tests/photo-api.test.cjs`
- `tests/media-feed-regressions.test.cjs` (new)
- This report, `docs/MEDIA_FEED_FIXES_20261018.md` (new).

Ignored evidence scripts, baseline copies, logs, manifests and web exports also
exist under the task evidence directory. They are not application source.

## Preservation and remaining checks

The starting checkout had 69 modified/untracked files. Their original bytes
were copied before editing and SHA-256 recorded. All remain present; 54 remain
byte-identical, and changes to the other 15 are additive task edits recorded in
the task manifest. The three consolidation recovery refs match their saved
checkpoint commits, and all Git refs remain unchanged. See
`before-manifest.json`, `preservation-final.json`, `status-before.txt` and
`status-after.txt`. No unrelated source was overwritten; no branch was switched.

Automated rendering uses React test renderer and the web bundler. It is not
physical-device evidence. Still required before marking device acceptance:

- iOS and Android system picker permission denial, cancellation, HEIC decoding,
  large files, WebP support, native multipart and navigation/background/restart.
- Capture the complete iPhone stack if the historical `reload` error persists;
  verify the installed Expo/runtime/native module registration.
- Verify actual shared Supabase bucket privacy, MIME lists, CORS and URLs, and
  allow short-lived URL expiry/recovery on devices. No live adapter was tested.
- Make the five added Firestore composite indexes available in an approved
  shared test environment and verify they finish building. Emulators do not
  establish production index availability. No index deployment was performed.
- Apply/verify the corrected private-bucket MIME configuration only through a
  separately approved environment action. No SQL was executed.
- Records missing authoritative `createdAt` cannot participate in an ordered
  Firestore feed without a separately reviewed repair. Arbitrary legacy private
  paths are never converted into public URLs. URL-only historical public images
  remain readable, but editing still requires an owned storage path or reupload.

**READY FOR TEAM TESTING in the isolated synthetic environment.** Shared hosted
testing is conditional on the index and bucket prerequisites above. Physical
device acceptance and production validation are outstanding. Stop here; do not
publish, push or deploy without the user's approval.
