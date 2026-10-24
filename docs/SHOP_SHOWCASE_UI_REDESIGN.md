# Shop profile and showcase UI

## Existing journeys traced before implementation

- Discover / Find Jobs and saved posts open `PostDetail` by ID. Detail obtains the post through `postsApi('get')` and opens `ShopProfile` with the API-provided shop snapshot.
- Public shop snapshots currently expose ID, name, avatar, city and province only. No public biography, contact details, services or verification field are fetched. Do not infer verification from author role.
- `ShopProfile` loads the existing cursor-based shop feed. My Shop (`ShopPosts`) loads the current account's showcases, with existing create, edit and confirmed-delete actions.
- `ShopAccount` is the shared account screen. Existing editable business information is the business location, through `BusinessLocation`; registration identity is read-only here. Document verification and its restrictions remain in `VerificationDocuments`.
- `PostForm` selects/compresses photos, retains ordered saved references, reuses confirmed uploads after uncertain delivery, and awaits the existing create/update API before returning. There is no draft/publish-state API. PimpPilot only changes text fields.
- Private photos resolve through `ShowcasePhoto` / `viewPostPhoto`, refresh signed access while focused, and clear access offline or on account/focus changes. Removal from an editing form is local until saving; server cleanup remains authoritative.

## Verification

Focused UI tests and the full Node 22 suite cover mocked journeys without production writes. All-platform Expo exports are checked separately. Physical device image selection, accessibility scaling, keyboard transitions and live signed-image expiry remain manual checks.

Full application suite: **450/450 passed** using Node v22.23.3 with `--test --test-concurrency=2 tests/*.test.cjs`, including 14 new focused UI tests. Log: `.local-checks/shop-showcase-app-tests-final.log`.

Expo export: **iOS, Android and Web passed**, using Node 22 and `expo export --platform all --max-workers 2`. Native output includes Hermes bundles. Artifacts: `.local-checks/shop-showcase-export-final`; log: `.local-checks/shop-showcase-export-final.log`. `git diff --check` passed. Branch remains `lesley`; no commits, pushes or deployments were performed.

## Implementation

- Customer storefront: API-supplied identity and location, logo error fallback, responsive portfolio, refresh, cursor pagination, retry and empty states. A missing shop reference does not fetch or render the global feed.
- Shop workspace: registered business identity, actual verification state, existing account/settings link and showcase management. Account settings group registered services and address with the existing location editor and verification controls. No new business identity editor was invented.
- Portfolio/detail: consistent 4:3 covers, missing-image states, authenticated loading/error previews, larger contained main photo, selectable thumbnails, actual category/vehicle/date metadata and the existing workshop reference.
- Editor: required-title guidance, grouped project/vehicle/photo controls, readable move/remove actions, responsive photo previews, local review panel, cancel and keyboard-aware scrolling. Review never sends a publication request. Existing Post / Save changes actions await the existing API. The former project-status selector was omitted because REST showcase publication does not send or support that field; no status contract changed.
- Verification badges require an explicit approved status. Public API shop snapshots currently omit that field, so these snapshots do not display a verification claim.
- The shop navigator now registers the existing `ShopProfile` screen already linked by the shared detail screen. Customer routes and notification/message routes are unchanged.

### Files in this change

- `src/features/auth/screens/AccountScreen.js`
- `src/features/marketplace/ShopNavigator.js`
- `src/features/marketplace/components/PostCard.js`
- `src/features/marketplace/components/ShowcasePhoto.js`
- `src/features/marketplace/components/ShowcaseUI.js`
- `src/features/marketplace/screens/PostScreens.js`
- `tests/shop-showcase-ui.test.cjs`
- `docs/SHOP_SHOWCASE_UI_REDESIGN.md`

### Preservation checks

The photo-selection, save, remove and reorder handler block was compared with HEAD and is unchanged. `postsApi.js`, `usePostsFeed.js` and `backend/posts.cjs` are unchanged. Signed-photo access effects and account/focus/offline guards are unchanged. Bookmark and confirmed deletion requests retain their original handlers. No dependency, storage, schema, notification, messaging, garage, quotation or payment changes are part of this change. Pre-existing uncommitted booking work remains in place.

### Manual checks remaining

- iOS/Android: actual image picker permissions/cancellation, long gallery scrolling, photo orientation/cropping, keyboard transitions, safe areas and VoiceOver/TalkBack with larger fonts.
- Web: narrow/wide browser layouts, Tab/Shift-Tab focus, image containment and refresh/scroll behavior.
- Authenticated staging/device session: signed-image expiry and denied/revoked access presentation, location/document progress, upload interruption and retry. Automated tests use synthetic fixtures; no production writes were made.
