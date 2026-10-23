# Customer Garage UI redesign

Implemented in the original PimpMyRide project on `lesley`. The uncommitted
Notifications and Messaging improvements remain intact.

## UI changes

- My Garage uses large private vehicle covers, honest vector placeholders,
  active/archived filters, a prominent Add vehicle action and a responsive
  one- or two-column card layout. Existing customer bottom destinations remain.
- A vehicle details dialog presents the selected vehicle's existing make,
  model, year, colour, registration and archive status, with Edit vehicle,
  Manage photos, Create service request and Back to Garage actions.
- No vehicle-detail API exists. The dialog uses the already-loaded vehicle
  record and closes before navigating to an existing screen.
- Add/edit forms group identity and registration fields, mark required labels,
  provide field errors and a validation summary, preserve private-registration
  guidance, and offer consistent Save and Cancel actions in a keyboard-aware layout.
- The Garage photo route opts into a dedicated gallery presentation. Saved
  photos have tappable thumbnail controls; opening one displays its signed
  thumbnail and a larger contain-mode preview. Other thumbnails use vector
  placeholders until opened. No extra preview URLs are minted automatically.
- Selected upload files show a local image preview. The existing confirmation
  is still required before any upload, replacement or removal.
- Garage screens support both themes, safe areas, wrapping labels, comfortable
  action sizes, pull-to-refresh, and loading/error/empty/offline states.
- Confirmation dialogs accept an optional Garage palette for theme consistency
  and readable action text. Their default rendering and mutation logic remain unchanged.

## Files changed for this task

- `src/features/marketplace/screens/OwnerMarketplaceScreens.js`: only Garage
  and vehicle-form UI, plus their necessary imports.
- `src/features/marketplace/screens/VehiclePhotosScreen.js`
- `src/features/marketplace/components/GarageUI.js`
- `src/features/marketplace/components/PhotoGallery.js`: opt-in Garage presentation.
- `src/features/marketplace/components/PrivatePhoto.js`: optional image sizing/label props.
- `src/shared/components/ConfirmationButton.js`: optional palette, used by Garage.
- `tests/garage-ui.test.cjs`
- `tests/marketplace-owner.test.cjs`: pagination checks locate the new scroll container.
- `tests/marketplace-photos.test.cjs`: opt-in gallery checks.
- `tests/helpers/load-ui.cjs`: window-dimension and RefreshControl stubs.
- `docs/GARAGE_UI_REDESIGN.md`

## Preserved functionality

No backend API, database schema, upload transport, storage integration or service
hook changes. No production writes or deletion operations were run.

- Authentication, vehicle ownership, multiple vehicles and account isolation.
- Existing vehicle cursor pagination and refresh behavior.
- Original vehicle form payloads, validation limits, optimistic revision numbers,
  duplicate-submit protection, failed-draft retention and account/vehicle draft reset.
- Confirmed archive/restore with the displayed revision. Removal retains request,
  quotation and booking history; no permanent-delete action was introduced.
- Garage-to-request navigation passes the existing vehicle ID and vehicle record.
- Private photo access uses the same list/sign APIs, account/focus guards,
  in-memory URLs, expiry and stale-response protection.
- Photo slots, ordering, limits, file validation, upload receipts, confirmation
  requirements, revision checks, uncertain-outcome recovery and safe deletion.
- Published requests retain their attached photo copies when vehicle photos change.
- Other PhotoGallery consumers retain their default presentation, including
  service-request photo selection and attachments.
- Notifications, Messaging, feeds, quotations, bookings and PimpPilot source
  remain as they were at the beginning of this task.

## Validation

The existing local Node 22.23.3 runtime was used:

```powershell
$pmrNode = (Resolve-Path '.local-checks/pmr-tools/node22/node-v22.23.3-win-x64/node.exe').Path
& $pmrNode --test tests/*.test.cjs
& $pmrNode node_modules/expo/bin/cli export --platform all --output-dir .local-checks/garage-export
```

Focused coverage includes multiple vehicles, desktop/mobile card configuration,
private cover props, details/edit/photos/request navigation, existing tabs,
account isolation, archive confirmation, form validation and cancellation,
optimistic revisions, offline saves, keyboard configuration, light/dark contrast,
thumbnail ordering, on-demand signing, expiry, blur cleanup and local selected previews.

UI tests stub native layout. They verify configuration and callbacks rather than
real native scrolling or keyboard motion. Expo exports verify bundling, not a
physical-device or browser visual review.

Final Node 22 application results: **414/414 tests passed**. This includes the
new Garage UI and gallery coverage, existing photo safety tests, and the prior
Notifications and Messaging tests. `git diff --check` passed.
Expo exports passed for **iOS, Android and Web**, with native Hermes bytecode,
in `.local-checks/garage-export`. The installed Hermes compiler required execution
outside the filesystem sandbox. Nothing was published or deployed.

## Outstanding manual checks

- iOS and Android safe areas, keyboard avoidance, multiline field labels, large
  fonts, back gestures and VoiceOver/TalkBack announcements.
- Scroll performance and pagination with a large real Garage, including filter
  changes and pull-to-refresh.
- Native and Expo Web private-image loading, thumbnail selection, image fit,
  preview expiry, focus changes and local device photo previews.
- Narrow and desktop browser appearance, keyboard navigation, dialog focus
  trapping/return and real large-font layouts.
- Live upload/replace/remove and archive/restore checks only with separately
  authorised disposable test records; no production mutation checks were performed.

No commits, pushes, deployments, branches, worktrees or new projects were created.
