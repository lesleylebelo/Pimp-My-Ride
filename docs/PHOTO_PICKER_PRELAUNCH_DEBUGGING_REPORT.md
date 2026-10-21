# Showcase photo picker pre-launch investigation

Date: 11 October 2026. Scope: investigate the error reported immediately after
tapping Add photos in Shop → My Posts → New Showcase.

## Findings

The current checkout does not contain the iPhone exception stack. The supplied
error text is `Cannot read property 'reload' of undefined`; the screenshot/log
does not identify which module accessed that property. The exception is caught
in `PostFormScreen.selectPhotos` and was previously reduced to its message for
the form, so the JavaScript/native stack was not emitted by this handler.

The press handler first returns if busy/offline, then invokes
`pickPostPhotos(remainingLimit)`. Before it calls
`ImagePicker.launchImageLibraryAsync`, that helper dynamically imported both
`expo-image-picker` and `expo-image-manipulator` concurrently. There is no
separate permission request in this path. Image manipulation is only needed
after the picker returns assets; its native module initialization was therefore
unnecessary before the system picker launched.

The checked-in Expo SDK is 57. Installed `expo`, `expo-image-picker`, and
`expo-image-manipulator` are all version 57.0.20. Expo's local
`bundledNativeModules.json` recommends `~57.0.16` for both picker and
manipulator; installed 57.0.20 satisfies these semver ranges. The picker's
native module config declares an Apple `ImagePickerModule`, and its iOS source
requires `ExponentImagePicker`. The manipulator imports
`ExpoImageManipulator` when its module initializes.

These local package files establish that both native modules are defined by the
installed packages and versions are SDK-compatible. They cannot establish
whether the currently running Expo Go/custom native app has those modules
registered. That depends on the installed iPhone Expo runtime or native build.

No `reload` property access was found in the picker/manipulator JS sources or
the Expo module initialization code inspected. Thus the exact cause of the
reported `reload` TypeError remains unconfirmed without the runtime stack. The
error is not evidence of PMR-01 or the showcase feed issue.

## Controlled change

`pickPostPhotos` now imports and initializes only ImagePicker before launching
the photo library. It imports ImageManipulator only after the picker returns at
least one asset; cancellation and empty asset results return without loading
it. Compression, output shape, picker options, limits, validation, and upload
contracts remain the same.

The existing form catch now logs the caught error object (including its stack)
to the development console, while retaining the existing user-facing message.
This provides the missing trace on a subsequent iPhone reproduction without
logging picker details in production.

This eliminates unnecessary native module initialization before launch and
enables stack capture. It does **not** prove that eager ImageManipulator
initialization caused the reported `reload` TypeError. Do not call the physical
device issue resolved until it is retested and the stack is reviewed.

## Files changed

| File | Change |
| --- | --- |
| `src/features/marketplace/services/postsApi.js` | Defer ImageManipulator dynamic import until after a non-empty ImagePicker result; allow test loader overrides to verify import ordering. |
| `src/features/marketplace/screens/PostScreens.js` | Log the caught photo-picker exception object in development so its stack is captured; keep inline error display unchanged. |
| `tests/marketplace-post-picker.test.cjs` | Add focused import-order, cancel/empty-result, photo transformation contract, and stack logging regression tests. |
| `docs/PHOTO_PICKER_PRELAUNCH_DEBUGGING_REPORT.md` | Document evidence, limits, change and retest requirements. |

No dependency was installed or upgraded. No authentication, showcase form,
styling, photo-count rule, validation rule, backend, storage contract, or
production setting was changed.

## Tests

`node --test --test-reporter=tap tests/marketplace-post-picker.test.cjs` passed
3/3:

- ImagePicker imports and launches before ImageManipulator import/manipulation.
- Cancellation and an empty result do not initialize ImageManipulator.
- The showcase form logs the full caught error object/stack in development and
  still displays the error message.

The combined focused run with marketplace photo/card regressions reported
19 passed and one failure. The one failure is the pre-existing PMR-14
JPEG/PNG-only picker expectation; the actual accepted types include WebP. It is
unrelated to this task and was not changed.

| Suite | Before | After |
| --- | ---: | ---: |
| Complete application (`npm.cmd test`) | PMR-08 baseline: 225 passed, 4 failed / 229 | 228 passed, 4 failed / 232 |
| Complete backend (`npm.cmd run test:backend`) | PMR-08 baseline: 137 passed, 1 failed / 138 | 138 passed, 0 failed / 138 |

The four app failures remain the same PMR-08 baseline issues (Garage
pagination, PMR-14 WebP expectation and two initial guest-route expectations).
The backend HTTP `ECONNRESET` did not reproduce in this run. No existing test
was weakened and no failing baseline assertion was changed for this task.

## Device verification and required stack

The change still requires verification on the physical iPhone. Reopen the
project with Expo, tap Add photos, and if the exception persists copy only the
development-console entry:

```text
[PimpMyRide showcase photo picker failed]
TypeError: Cannot read property 'reload' of undefined
    at ...
```

Include the complete stack continuation, Expo Go version (or state if using a
custom development build), and the app's reported SDK/runtime version. Do not
include ID tokens, environment values, photo URIs, personal names, or unrelated
console output. If running a custom development build rather than Expo Go,
also report whether it was rebuilt after the installed native modules were
added. The stack is necessary to identify which runtime module owns the
undefined `reload` value and whether this is an Expo Go/build mismatch.

Until that device check, it is unverified whether the pre-launch import
reordering removes the user's observed error or whether the runtime lacks a
native module.

## Follow-up verification — 14 October 2026

The current checkout still contains the deferred import and development stack
logging described above. No change to picker code, dependencies or app
configuration was made during this follow-up.

The installed package check was repeated: Expo is 57.0.20, while the SDK's
bundled-module mapping recommends `~57.0.16` for ImagePicker and ImageManipulator;
both installed versions are 57.0.20 and satisfy that semver range.

Focused test reruns:

- `tests/marketplace-post-picker.test.cjs`: 3 passed, 0 failed.
- `tests/marketplace-photos.test.cjs` plus
  `tests/marketplace-post-card.test.cjs`: 19 passed, 1 failed. The single
  failure remains the documented PMR-14 expectation that excludes WebP; it is
  not a picker-launch regression.

The installed iOS module source registers `ExponentImagePicker` and calls
`PHPickerViewController` for this multiple-selection flow. The app config does
not list an explicit `expo-image-picker` config plugin. The package documents
that plugin as automatically applied by EAS Build and otherwise used to
configure Info.plist permission descriptions; the current flow does not
explicitly request photo-library permissions before launching PHPicker. This
checkout therefore does not prove that a custom iOS binary has the module
registered, or what Info.plist was built into the iPhone app. Expo Go likewise
must be a runtime compatible with the app's SDK and contain the module.

These facts identify checks for a custom/native build, not a confirmed defect
in the current source or proof that a missing permission description caused
the reported `reload` error. No configuration edit is justified without the
device/build details and complete exception stack. The status remains
**partially addressed; physical-device verification and exact root-cause
identification are still pending**.
