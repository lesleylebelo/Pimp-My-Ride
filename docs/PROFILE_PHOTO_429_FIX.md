# Profile-photo HTTP 429 reliability fix

Review date: 2026-10-28. Local changes only; no production requests, writes,
credentials, deployment settings, commits, pushes or deployments were required.

## Root cause and evidence

The confirmed source-level failure is unnecessary private-image request traffic
consuming the shared Express API budgets. This is reproducible locally; it is
not evidence that either limiter's threshold should be increased.

- `backend/app.cjs` applies 90 requests/IP/60 seconds before authentication,
  then 60 requests/UID/60 seconds to ordinary API routes, including profile
  photos. Both return the reported `Too many requests. Wait a minute.` message.
  Session heartbeats have separate budgets. Photo uploads additionally pass
  through the existing 6 uploads/UID/minute limiter; that limiter does not apply
  to `/api/profile/photos` JSON reads.
- `backend/profile-photos.cjs` issues 60-second avatar URLs. `ProfileAvatar`
  renewed them after 55 seconds. Thus 31 distinct avatar reads plus their first
  renewal attempt exceed the account's 60-request window without navigation.
- Private post images also renewed after 55 seconds. A feed with 20 distinct
  avatars, 20 private post images and its list request starts with 41 API calls.
  The early media renewals can exhaust the same account budget. The rate limit
  then temporarily affects unrelated ordinary API operations until it resets.
- Navigation/foreground forced avatar cache bypass. Missing-photo results only
  lasted 10 seconds; status calls were neither cached nor coalesced. Errors were
  not shared between remounts, and 429 did not establish a photo-wide cooldown.
- The HTTP transports already made one attempt per invocation; no automatic
  transport retry or unstable effect dependency loop was found. Successful-image
  renewal timers and repeated caller invocations account for the amplification.

The exact limiter responsible for the reported production incident cannot be
distinguished from the supplied URL/message: both IP and UID limiters emit it.
Local HTTP tests exercise both separately and verify their headers and rejection
points. No production HAR, `RateLimit-Policy` response, or server logs were
available. A policy containing `60` identifies the UID policy; `90` identifies
the IP policy (a response can contain headers for both middleware layers).
Render already enables one trusted proxy hop in `server.cjs`; it was unchanged.

## Request trace

All profile-photo JSON calls originate in
`src/features/auth/services/profilePhotos.js`:

| Operation | Caller and triggers |
| --- | --- |
| `view` | `ProfileAvatar`: initial eligible mount; UID, context, ID or revision change; focus/foreground or connectivity return; successful photo mutation notification; successful URL expiry. Blur, background, disabled and offline states cancel renewal and discard the displayed URL. Ordinary renders with the same effect key do not fetch. |
| `status` | `ProfilePhotoSettings`: initial focused mount, focus/connectivity return, account remount, and explicit **Refresh Photo** after a failed load. Its callback depends on UID; loading/error state does not retrigger its effect. |
| `remove` | Explicit confirmed removal in `ProfilePhotoSettings`. |
| upload (separate `/api/profile/photos/upload` URL) | Explicit **Save Photo**, using the existing authenticated multipart transport. |

Avatar contexts and consumers:

- `self`: profile settings and the current workshop's `WorkshopIdentity`.
- `shop` / `post`: `PostCard`, `CustomerFeedPostPresentation`,
  `CustomerPostPresentation`, `WorkshopShowcaseCard` in `WorkshopFeedCards`,
  workshop identity, quotation cards and customer booking cards.
- `request`: workshop customer/request cards in `WorkshopFeedCards`,
  `ShopMarketplaceScreens` and workshop booking cards.
- `conversation`: conversation rows in `MessagingScreens` and headers in
  `MessagingUI`. Message polling can update rows, but a stable avatar key does
  not itself fetch on each poll.

Feed refresh/pagination creates or updates these avatar consumers; it does not
directly call the profile-photo endpoint. Unchanged avatars now reuse valid
cached results. Successful upload/removal invalidates photo reads and notifies
avatars. Only a successful save refreshes profile metadata; failed photo loads
stay within the avatar fallback or settings error and do not refresh auth/profile.

## Corrections

- `src/shared/components/ProfileAvatar.js`: reuse cached reads after focus and
  foreground changes; renew at actual URL expiry instead of 55 seconds.
- `src/features/marketplace/components/ShowcasePhoto.js`: renew private feed
  images at actual expiry too, preventing the companion feed burst.
- `src/features/auth/services/profilePhotos.js`: share concurrent status and
  view reads, cache status for 10 seconds, cache missing photos for 45 seconds,
  retain successful URLs until five seconds before expiry, and share failed
  reads for five seconds. All caches remain in memory and are cleared on an
  account/session change; context and revision stay part of avatar cache keys.
  Successful mutations still invalidate the caches.
- The same service observes 429 across photo reads, removal and upload. It
  suppresses subsequent photo requests until `Retry-After` expires, defaults to
  60 seconds when absent/invalid, and never shortens a longer pending cooldown.
  Cache invalidation/manual refresh cannot bypass it. No timer retries failures;
  a later caller after the cooldown can recover. Already dispatched requests
  cannot be recalled. Other application services are not locked by this state.
- `src/shared/services/api.js`: attach `retryAt` and `retryAfterMs` to JSON and
  XHR 429 errors, including malformed response bodies. Parse both delta-seconds
  and HTTP dates. Request execution, authentication and upload behavior otherwise
  remain unchanged; no retries were added.
- `backend/app.cjs`: expose `Retry-After`, `RateLimit` and `RateLimit-Policy` to
  the cross-origin frontend. Every existing limiter, threshold and key remains
  unchanged. Express documents this browser header behavior in its
  [CORS configuration reference](https://expressjs.com/en/resources/middleware/cors/#configuration-options).
- Regression coverage: `tests/profile-photos-service.test.cjs`,
  `tests/profile-photos-ui.test.cjs`, `tests/api.test.cjs`,
  `tests/customer-photo-transport.test.cjs`,
  `tests/private-showcase-and-request-uploads.test.cjs`, and
  `backend/test/http.test.cjs`. The existing compatibility guard in
  `backend/test/ai-production-compatibility.test.cjs` permits only the exact
  Retry-After error wrappers while preserving its other transport comparisons.
  PimpPilot runtime code was not changed.

## Validation

Four newly added service regressions failed before the fix, reproducing cache
bypass, duplicate status reads, missing 429 backoff, and repeated failed reads.
All now pass. Tests use mocks/local HTTP fixtures, not production data.

- Full frontend: `node --test --test-concurrency=2 tests/*.test.cjs`:
  **659 passed, 0 failed**.
- Focused frontend/media coverage (profile service/UI, JSON transport, XHR
  transport, private showcase/request uploads): **72 passed, 0 failed**.
- Full backend: `npm.cmd test --prefix backend`: **375 passed, 1 failed**.
  The sole failure is the existing `format handling preserves grounding,
  non-AI runtime, dependencies, rules and UI` compatibility test: committed
  Firestore indexes differ from its pinned `1a98e86` baseline. A read-only
  comparison confirmed that this mismatch already exists in `HEAD` and that
  this fix does not modify `firestore.indexes.json`. It was left outside scope.
- Final focused backend rerun (HTTP, profile photos, security, reliability,
  compatibility): **57 passed, the same 1 index-baseline failure**. Separately
  verified that protected transport sections match the pinned baseline after
  removing only the explicitly allowed Retry-After wrappers.
- `npm.cmd run build:web`: **passed** for the final source, including the
  repository's production-export verification of the Render API URL and
  authenticated request construction. It uses a mocked transport, not live
  production API requests. Final bundle SHA-256:
  `03765068390a7e95837e776532b76966a6945b496472345faa2f91455256e125`.
- `git diff --check`: **passed**.

The 429 correction is ready for deployment review, with the existing backend
index-baseline test failure explicitly outstanding. The entire test suite is
therefore not fully green. No production deployment or authenticated production
session was exercised.

Legitimate heavy usage can still reach the retained shared limits. This fix
reduces unnecessary traffic and stops photo error amplification; it does not
promise that the protected backend will never return 429. Renewal at expiry can
briefly display the fallback/loading state while a replacement URL is fetched.
Deploy both backend header exposure and the frontend changes together.
