# Camera and gallery sources — 26 October 2026

## A. Existing architecture

Original repository, branch `lesley`. Pre-existing uncommitted Admin, Customer,
Workshop and API release work is preserved. Feeds and bottom navigation are not
redesigned by this task.

The installed Expo SDK is 57; image-picker and image-manipulator are both
57.0.20, within the existing SDK-compatible dependency ranges. No dependencies
were added or updated. Garage previously used DocumentPicker, showcase/request
attachments shared `pickPostPhotos`, and profile photos used a separate square
crop. Verification-document selection remains in DocumentPicker and is unchanged.

Existing transport remains authoritative: `photoApi` uploads private vehicle and
request assets, `postsApi` uploads showcase assets, and `profilePhotos` manages
private profile images. Their authenticated endpoints, account checks, pending
request IDs, revisions, signed previews and backend validation remain unchanged.

## B. Entry points

| Existing action | New source behavior | Confirmation retained/added |
| --- | --- | --- |
| Garage VehiclePhotos: Choose photo / Choose replacement | Camera or gallery, one photo | Local preview; original Upload/Replace confirmation |
| Request form: Upload request photo | Camera or gallery, one attachment at a time | Local preview, explicit Upload attachment, Cancel attachment; request submission remains separate |
| Workshop PostForm: Add photos | Single capture or existing multiple gallery selection | Existing previews/order/remove/review and publish/save actions |
| Customer Profile: Upload Photo / Change Photo | Single capture or gallery, square crop | Existing preview, Save Photo, Cancel Photo and confirmed removal |
| Workshop account settings: Upload Photo / Change Photo | Same shared profile component and chooser | Same versioned replacement and removal safeguards |

Both Customer account presentations use ProfilePhotoSettings, so the existing
eligible-account fallback also receives this behavior. Admin has no new control.
Selecting a source or taking a photo does not upload it. Direct request uploads
previously began immediately after selection; they now require the explicit
preview confirmation requested for this enhancement. A failed attachment upload
retains the same prepared file for manual retry, with existing idempotency.

## C. Shared implementation

`usePhotoSource` owns one themed chooser per existing image-entry component.
It resolves cancellation without an error, locks concurrent launches and discards
late picker responses on account/vehicle changes, blur, disable or unmount.
The dialog has Take photo, Choose from gallery and Cancel, icons, accessible
touch targets, hover/focus/pressed feedback and no transition animation. It is a
bottom sheet at phone widths and a bounded dialog on larger screens. Web focus
is trapped, Escape cancels and focus returns to the invoking control.

Native camera selection reads current permission and requests it only when
allowed to ask again. Permanent denial provides Open settings, without another
permission prompt. Denial and launch/unavailability errors leave Gallery usable.
No microphone permission or recording API is requested.

## D. Platform behavior

The installed Expo picker is imported before interaction. On Web, the source
button calls the picker synchronously, before any import, permission query or
await. This follows the [Expo ImagePicker user-activation requirement](https://docs.expo.dev/versions/latest/sdk/imagepicker/).
Its installed Web implementation uses an image-only file input and a capture
hint for camera selection. Browsers can open a camera or a file chooser; the
dialog explains that behavior instead of promising a desktop live camera UI.
There is no live preview or automatic gallery fallback. An insecure context
gets an explicit HTTPS/localhost message; Gallery remains an explicit option.

Gallery keeps multiple selection for showcases; other contexts select one.
Camera always requests a single image. User cancellation leaves existing saved
images and selected drafts intact. Browser versions that fail to report file
picker cancellation can still close the waiting chooser with Cancel.

## E. Validation, privacy and ownership

Camera files use the same existing JPEG preparation as showcase/request assets:
maximum 1600 px width, existing compression, and final positive size validation
at no more than 5 MB. Missing filename/MIME metadata does not require a guessed
upload MIME: the image processor decodes the source and emits a validated JPEG
file with a fallback filename. Explicit unsupported MIME types and oversized
source files are rejected. A failed decode or unreadable processed size is an
error, not a successful selection.

Profile photos retain their centered square crop. Garage gallery JPEG/PNG/WebP
files keep their original validated representation; HEIC and captures use the
existing preparation utility. Limits remain five private Garage slots, five
request attachments, ten showcase images and one profile image.

Selecting the same processed showcase URI twice now keeps one pending image;
URI-based preview keys and pending upload entries must remain unique. A focused
regression exercises that repeated-URI case. The installed Web picker returns
distinct object URLs for separate selections, which remain separate previews.
Existing publication acknowledgement/retry safeguards stay.

Private attachments are not copied to public showcases. Upload services still
check expected UID, ownership, version and byte content. Profile replacement
does not remove the saved image first. Account-scoped selections and late
responses cannot populate a new account. No backend, Firebase rules, Supabase
resources/policies, storage URL contracts or payment behavior changed.

## F. Exact changed-file map for this task

| File | Purpose |
| --- | --- |
| `src/shared/services/photoSource.js` | Installed Expo source launch, native permission handling, web synchronous launch and recovery messages |
| `src/shared/components/PhotoSourceChooser.js` | Shared source dialog/hook, lifecycle cancellation and web focus behavior |
| `src/features/marketplace/components/PhotoGallery.js` | Garage source choice and capture preparation; original confirmation/upload logic retained |
| `src/features/marketplace/components/RequestPhotoUploads.js` | Source choice, local preview and explicit attachment upload; pending-file retry retained |
| `src/features/marketplace/services/postsApi.js` | Optional source selection injected into existing photo preparation; upload transport unchanged |
| `src/features/marketplace/screens/PostScreens.js` | Showcase source chooser, late-selection guards and unique pending image URIs |
| `src/features/auth/components/ProfilePhotoSettings.js` | Shared Customer/Workshop source choice; existing crop and versioned save/removal retained |
| `app.json` | Camera permission/description; microphone remains disabled; existing plugins and identifiers retained |
| `tests/photo-source.test.cjs` | Chooser, permissions, synchronous web launch, cancellation, metadata, limits and native configuration |
| `tests/marketplace-photos.test.cjs` | Existing gallery regressions routed through chooser plus captured vehicle preview/upload |
| `tests/profile-photos-ui.test.cjs` | Gallery through chooser and both roles' capture/replacement safeguards |
| `tests/private-showcase-and-request-uploads.test.cjs` | Explicit preview confirmation, cancellation, count limit, retry and stale-account acknowledgement |
| `tests/marketplace-post-image-lifecycle.test.cjs` | Duplicate processed URI and single-upload regression |
| This report | Architecture, evidence, device acceptance and build implications |

## G. Tests and exports

- Full frontend suite: **579/579 passed**, no failures, skips or cancellations.
  Command: `node --test --test-concurrency=2 tests/*.test.cjs`. Log:
  `.local-checks/camera-frontend-tests.log`. This includes the focused chooser,
  permission, capture, metadata, size/count, replacement and retry regressions,
  plus existing role/navigation, Gallery and production API configuration tests.
  Browser review found an Escape focus-restoration defect in the new chooser;
  the invoking control is now captured before opening and focused after modal
  teardown. The final suite includes that regression.
- Backend media-security unit tests: **65/65 passed**. Command:
  `node --test --test-concurrency=2 backend/test/photos.test.cjs backend/test/posts.test.cjs backend/test/profile-photos.test.cjs`.
  Log: `.local-checks/camera-media-security-tests.log`. Existing byte validation,
  ownership, private attachments, signed access and profile replacement gates
  remain covered without changes to the backend implementation.
- Backend Auth/Firestore emulator media integration tests: **14/14 passed**.
  Command inside the existing managed emulator environment:
  `node --test --test-concurrency=1 backend/test/photos-integration.test.cjs backend/test/profile-photos-integration.test.cjs`.
  Log: `.local-checks/camera-media-integration-tests.log`. These exercise actual
  emulator persistence, private request/vehicle access, cross-account denial and
  profile replacement/retained-media behavior, using in-memory test storage.
- Android and iOS production exports passed together:
  `export --platform android --platform ios --clear --max-workers 2`, with the
  existing dotenv configuration. Both Hermes bundles were emitted to
  `.local-checks/camera-native-export`. Log:
  `.local-checks/camera-native-export.log`. These are export checks, not EAS
  binary builds or physical-camera acceptance.
- Guarded `npm run build:web` passed with the unchanged release scripts, existing
  dotenv configuration, disabled demo mode and a cleared Metro cache. The actual
  compiled API transport passed its mocked health/Admin/marketplace/posts paths
  using `https://pimp-my-ride.onrender.com`. No verification request went live.
  Log: `.local-checks/camera-production-web.log`.
- Standalone `npm run verify:web` passed against that same `dist`, with the same
  entry filename/hash and expected API origin. Log:
  `.local-checks/camera-verify-web.log`.
- `git diff --check` passed.

An isolated headless Edge browser passed the final acceptance run at **390, 768
and 1440 px**, with **zero runtime exceptions or console errors**. It verified
Customer profile capture/preview/save, Garage capture and confirmed upload,
private request attachment preview and explicit upload, Workshop sign-in,
showcase capture plus Gallery selection without publishing, and Workshop profile
capture/preview/save. Keyboard checks covered initial focus, Tab/Shift+Tab
trapping, Escape dismissal and return to the invoking action. Screenshots were
reviewed at phone and desktop widths; the dialog stayed within the viewport.

The in-app Browser was unavailable, so this used an isolated headless Edge
fallback. Final browser evidence is ignored by Git:

- `.local-checks/camera-source-browser-results.json`
- `.local-checks/camera-static-browser.log`
- `.local-checks/camera-source-chooser-{390,768,1440}.png`

The existing local demo intentionally accepts only its original PNG and lacks a
profile bucket. An ignored harness-only storage double accepted that exact
synthetic swatch and its two expected browser-generated JPEG conversions, with
the existing authenticated endpoints, signed URL namespace and expiry checks.
No production or demo storage implementation was changed. Real backend media
contracts were tested independently in the 65 unit and 14 emulator tests above.
An exported development-only build avoided emulator startup contention with the
development bundler; it lives in `.local-checks/camera-demo-export` and must not
be used as a release artifact. The final managed emulator run stopped normally.

The browser used real picker file inputs with synthetic files and checked the
image-only capture hint. This does **not** test physical camera hardware. The
localhost page was a secure context; live HTTPS/mobile-browser acceptance is
still manual. The red screenshot banner is Firebase emulator tooling.
Automated writes used only mocks/local emulators and synthetic accounts/media.

Native config introspection passed: iOS camera description is set; Android
CAMERA is enabled; RECORD_AUDIO is blocked and the iOS microphone description
is absent. The original Android package, EAS project and plugins remain.

## H. Physical-device acceptance still required

No physical camera acceptance is claimed. Test an actual Android device, iPhone
Safari, an iPhone installed web app, and native iOS when a suitable build exists:

1. Choose Camera only on demand, grant permission, capture and review a photo.
   Verify gallery still works, including multi-select for showcases.
2. Cancel the chooser and camera; existing photos, drafts and profile replacements
   must remain. Reject permission, then permanently deny it and verify Settings
   recovery where supported. Test unavailable capture and browser restrictions.
3. Exercise Garage upload/replacement, private request preview/upload, showcase
   save/retry and both profile replacements. Save only after confirmation.
   Restart/reload to verify persistence and authorised signed previews.
4. Check five/ten-photo limits, HEIC conversion, large/invalid files, offline
   recovery, interrupted uploads and account switching during preparation.
5. Check enlarged text, safe areas, VoiceOver/TalkBack, keyboard focus and mobile
   browser viewport changes. Test the real HTTPS deployment after a separately
   authorised release; localhost secure-context checks do not establish that.

## I. Android and iOS build implications

Existing native binaries were built with camera permission disabled. Regenerate
Android development/preview/release APK or AAB builds that will use this feature,
and iOS development/TestFlight/App Store binaries, through the existing build
configuration. An OTA JavaScript update cannot add native permission entries.
Expo Go uses its own manifest/permissions and is not evidence that an older
standalone binary has the new configuration. Web does not require a native
binary rebuild; browser/device capture capabilities still vary.

## J. Release assessment

This is local work on `lesley`. No commit, push, merge, build submission,
deployment or remote infrastructure change was performed. No production data
was written. Existing guarded API build/verifier scripts and EAS/Netlify setup
are retained. Physical-device and HTTPS acceptance remain before release.

The verified local production entry is
`/_expo/static/js/web/AppEntry-d109a09ac587a5f90837a65827779a30.js`, SHA-256
`f25264dabdd9e2b37422a2d305b6fda2ac5d976f2bff5b67e503b563ba58caa0`.
This supersedes earlier local Customer/Workshop/API-only exports; their historical
reports are unchanged. Future edits can change the filename/hash. Use the guarded
build and standalone verifier for any separately authorised release; the demo
development export is not a release artifact.
