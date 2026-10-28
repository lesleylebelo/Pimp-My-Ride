# Saved Posts / Bookmarks verification

## Audit and root causes

The app already had bookmark controls, `postsApi`, the authenticated posts API,
`users/{uid}/savedPosts/{postId}` persistence and Customer Saved Posts navigation.
This implementation repairs those paths rather than introducing another store.

- Feed and detail API responses did not consistently hydrate the current user's
  saved state. Individual cards also maintained isolated state.
- Rapid taps could race before React rendered a busy state. Requests and late
  responses needed protection across logout, account changes and screen changes.
- Saved pagination depended on a bookmark document snapshot; deleting the cursor
  bookmark could break continuation. Inaccessible records also needed bounded
  scanning without incorrectly declaring the collection empty.
- Saved results needed current workshop/post eligibility checks and an explicit
  public field projection. Direct Firestore reads could bypass the API projection
  and visibility checks, and direct bookmark writes bypassed API validation.
- The existing workshop Saved Posts screen needed a route and entry point.

## Resulting behavior

Authenticated active customers and approved active workshops can save published,
eligible workshop showcases. Guest, offline and customer-build controls are
disabled. Cards retain their bottom-right bookmark placement, show outlined/filled
state, disable while pending and provide inline success/error feedback.

The shared mutation coordinator coalesces duplicate requests, serializes opposite
desired states and updates UI only after a valid acknowledgement. Failed requests
retain the previous state and can be retried. Session and generation guards stop
late responses from leaking state into another account or post.

Discover, Saved Posts, workshop cards and post detail subscribe to the same
session-scoped state. Firestore remains authoritative across sessions/devices;
focus, foreground and manual refresh reconcile remote changes. This does not add
a live Firestore subscription or polling.

The existing Saved Posts screens display workshop identity, media, title,
description and available vehicle details, with original-post and workshop links.
They support removal, loading/error/retry/offline/empty states, refresh and paged
loading. Customer feed width is bounded to 680px on desktop.

## Security, persistence and pagination

- Bookmark ownership comes from verified Firebase authentication. Client-supplied
  ownership fields are rejected. Existing authorization and rate policies remain.
- Deterministic bookmark IDs and transactional existence checks prevent duplicate
  records and preserve the timestamp on repeated saves. Transactions recheck the
  current actor and target workshop/post eligibility.
- Saved/feed/detail responses exclude deleted, unpublished, suspended,
  unapproved, disabled and otherwise inaccessible workshop showcases. Public DTOs
  omit private metadata and vehicle registration. New image URL requests also
  check workshop eligibility.
- Direct client bookmark writes and direct post reads are denied by Firestore
  rules. Post reads in the audited app already use the API. Own bookmark metadata
  reads remain restricted to verified active users; existing trusted-admin
  moderation updates remain permitted.
- Saved pagination uses document-ID cursors, returns up to 20 visible items and
  scans at most 200 bookmark records per request. Continuation works after the
  cursor bookmark is removed and through inaccessible records.
- Hidden/deleted bookmarks are filtered, not automatically deleted. Unsave can
  remove stale references. Already downloaded media is not revoked by this work.
- No collection migration, new dependency or new composite index is required.
  Saved ordering uses Firestore's automatic document-ID index; existing feed
  index requirements are unchanged.

## Changed files for this feature

Backend/security:

- `backend/posts.cjs`
- `backend/test/posts.test.cjs`
- `backend/test/bookmarks-integration.test.cjs` (new)
- `firestore.rules`
- `scripts/test-emulators.cjs`
- `tests/rules/access.test.cjs`

Frontend:

- `src/features/customer/components/CustomerFeedPostPresentation.js`
- `src/features/customer/components/CustomerPostPresentation.js`
- `src/features/customer/screens/CustomerDiscoverScreen.js`
- `src/features/customer/screens/CustomerSavedScreen.js`
- `src/features/marketplace/ShopNavigator.js`
- `src/features/marketplace/components/PostCard.js`
- `src/features/marketplace/components/WorkshopFeedCards.js`
- `src/features/marketplace/hooks/usePostsFeed.js`
- `src/features/marketplace/hooks/usePostBookmark.js` (new)
- `src/features/marketplace/screens/PostScreens.js`
- `src/features/marketplace/services/postsApi.js`
- `src/features/marketplace/services/bookmarkState.js` (new)

Frontend tests/documentation:

- `tests/bookmarks.test.cjs` (new)
- `tests/customer-discover-feed.test.cjs`
- `tests/workshop-feed.test.cjs`
- `docs/SAVED_POSTS_BOOKMARKS.md` (this report)

Earlier uncommitted date/time picker and Discover header work is preserved.
Package changes in the workspace belong to that earlier picker work; bookmarks
add no dependencies.

## Verification

- Relevant frontend regression run: **80 passed, 0 failed** across bookmarks,
  Discover/customer UI, media feed, showcase/workshop UI, marketplace cards,
  navigation, request performance and marketplace data tests.
- Final focused bookmarks/showcase run: **22 passed, 0 failed** (overlaps the
  80-test run; not an additional unique-test total).
- Backend posts and request-policy tests: **36 passed, 0 failed**.
- Final local Auth/Firestore integration and access-rules run: **20 passed,
  0 failed**. Covers authenticated concurrent save/unsave,
  persistence with a fresh login/service, ownership isolation, forged UID,
  disabled/unverified identities, pagination, suspended authors and direct SDK
  access boundaries. All fixtures are synthetic local emulator data.
- Production `npm run build:web`: **passed**, including its mocked-transport
  production verifier. Final JS bundle SHA-256:
  `0fed28dffd1fba14f293dfeb4d847d9be2b6abed1058e607d1b02800a00d19d6`.
- Expo Android export/Hermes compilation: **passed** (1,163 modules). This is a
  bundle check, not a native APK or physical-device runtime test.
- Local Chrome static React Native Web renders at **320px and 1440px**, dark and
  light themes: fit without horizontal overflow; bookmark remains bottom-right;
  workshop target and vehicle details present. Mobile dark and desktop light
  screenshots were visually inspected. Interaction handlers were tested through
  the React harness separately; this was not a live authenticated browser test.
- `git diff --check` and emulator-script syntax check: **passed**.

The complete application test suites were not run. No production customer data
was read or modified, and nothing was committed, pushed or deployed.

## Release handoff

Review and release the backend first, followed by Firestore rules and frontend.
All three are part of this repair. External clients using direct Firestore post
reads/writes must use the API after the rule change; the audited app does so.
Existing feed caching, cursor guards, request cooldowns and rate limits remain.

The implementation is ready for review and local web presentation. Perform an
Android device smoke test before calling native deployment verification complete.
Production rollout remains
user-managed; no indexes or data migration need to be introduced for bookmarks.
