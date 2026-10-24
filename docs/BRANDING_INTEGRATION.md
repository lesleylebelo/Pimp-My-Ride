# PimpMyRide PR branding integration

## Artwork and assets

The owner explicitly authorised recreation without the missing original PNG. `assets/branding/pimpmyride-logo.svg` is newly authored, scalable flat artwork approximating the supplied visual direction. It is **not pixel-identical** to the earlier approved image. No existing image is overwritten or presented as that missing original.

The mark combines a lime P (`#C4E052`), charcoal R (`#1C1C1F`), an open-ended wrench and a vehicle roofline. It represents vehicle customisation, mechanical services, maintenance and repairs. White negative space and a neutral light plate keep the charcoal R visible on both application themes. The tagline is **Connect. Customize. Drive your style.**

Created under `assets/branding/`:

| File | Purpose |
| --- | --- |
| `pimpmyride-logo.svg` | Editable vector master with accessible title/description |
| `pimpmyride-logo.png` | Transparent 1024 x 1024 in-app derivative |
| `app-icon.png` | Opaque RGB 1024 x 1024 store/iOS/fallback icon |
| `adaptive-foreground.png` | Transparent 1024 x 1024 foreground; entire mark within the centred 66/108 safe circle |
| `adaptive-monochrome.png` | Transparent 1024 x 1024 single-colour mask; vehicle negative space preserved |
| `splash-logo.png` | 1024 x 1024 mark on a light plate with transparent external padding |
| `favicon.png` | Opaque RGB 64 x 64 web icon |
| `manifest.json` | Dimensions, palette, recreation disclosure and SHA-256 derivative hashes |

`node scripts/generate-branding.cjs` deterministically renders these derivatives from the vector. Its rasterizer is a local development tool only: `npm install --prefix .local-checks/branding-tools --no-audit --no-fund @resvg/resvg-js`. It is not a client dependency. Generated PNGs are committed as normal assets when the owner later authorises a commit; rendering is not required during builds.

## Expo and startup

`app.json` references the 1024 icon globally and for iOS, adaptive foreground/monochrome layers with a white background for Android, and the web favicon. The app name, slug, version, existing identifier fields and platform/build settings are retained. The old launch background is replaced with the requested charcoal `#0B0B0D`.

The essential native package `expo-splash-screen` was installed through the existing Expo CLI for SDK 57 (`~57.0.10`); its required config-plugin dependencies are reflected in `package-lock.json`. There are no unrelated dependency upgrades. The config plugin uses the centred `splash-logo.png`, `imageWidth:200`, `resizeMode:contain` and the same charcoal background in dark mode. Prebuild config resolution succeeds without generating or replacing native projects.

Startup now uses one boot-only `StartupSplash` overlay above existing navigation. At module scope it calls the installed Expo SDK's `preventAutoHideAsync()`; after the matching 200-point image has loaded and laid out, it calls `hideAsync()`. The charcoal background, image and native config are unchanged. Native launch artwork is static; motion is rendered in React Native.

The existing logo scales subtly from 0.97 to 1 over 280ms and the tagline fades in over 220ms (80ms offset), using native-driver-supported properties. Once session restoration and NavigationContainer readiness are complete, the overlay fades out over 120ms, without waiting for the entrance animation. If readiness is already complete, no entrance delay is imposed. Reduced motion defaults to enabled until the OS preference is known; reduced-motion users receive a static transition with immediate dismissal. Live preference changes stop animation. Exit callbacks have a 180ms fallback; a 12-second safety timeout reveals existing session-loading UI if initialization stalls, without granting authentication or bypassing permissions. Native API rejections are handled. Timers, motion and accessibility listeners are cleaned up.

The retained guest `Splash` compatibility route immediately replaces itself with `SignIn`, preserving saved route names while removing the old artificial 2.2-second delay. The overlay state lives above the auth stack and is never replayed on login/logout, ordinary navigation or re-render. It observes readiness only and does not reset navigation or alter notification destinations. Authentication/session services and authorization routing remain unchanged.

## Authentication and in-app presentation

`LogoMark.js` displays the real local PR bitmap with `contain` sizing, accessible branding and a light plate; it no longer substitutes a generic vehicle vector. Existing callers continue using `size`.

Login and registration use the mark, app name and new tagline. The exact login prompt is **Sign in to your space**. The previous long service description is removed from visible authentication branding; marketplace/service values are unchanged. Form instructions, validation, consent, account creation, roles, email verification, password reset, cooldowns and navigation are retained. Login/signup/reset/verification styling uses the existing theme context; form content is constrained to a comfortable web width. Registration gains top/side safe areas. Workshop registration's display label is now **Workshop**, while the stored `shop` role and handlers remain unchanged. Role selection exposes its selected state to accessibility tools.

The existing `AuthNavHeader` retains its functional back arrow and adds the compact mark in its existing trailing space. `AuthHeader` is reused by signup. `LandingUI` adds one small logo to the existing application header; bell, Messages and bottom-tab icons/routes are retained. Private vehicle/showcase images and workshop avatar assets are unchanged.

## Complete modified/new file list

- All eight files in the asset table above.
- `scripts/generate-branding.cjs`.
- `app.json`, `package.json`, `package-lock.json`.
- `src/shared/components/LogoMark.js`.
- `src/shared/components/StartupSplash.js` and `src/navigation/AppNavigator.js`.
- `src/shared/components/landing/LandingUI.js`.
- `src/features/auth/components/AuthHeader.js`.
- `src/features/auth/components/AuthNavHeader.js`.
- `src/features/auth/components/RoleToggle.js`.
- `src/features/auth/screens/SignInScreen.js`.
- `src/features/auth/screens/SignUpScreen.js`.
- `src/features/auth/screens/ForgotPasswordScreen.js`.
- `src/features/auth/screens/VerifyEmailScreen.js`.
- `src/features/auth/screens/SplashScreen.js`.
- `tests/branding.test.cjs`, `tests/splash.test.cjs` and `tests/helpers/load-ui.cjs` (local image/native splash/accessibility test doubles).
- `docs/BRANDING_INTEGRATION.md` (this guide).

No backend, API, Firebase configuration, Supabase transport, authentication service/context, marketplace, quotation, payment, booking, messaging, notification or production data changes are made. Existing original project/branch/infrastructure are used. No commits, pushes or deployments are performed.

## Verification and outstanding native checks

All commands use Node 22.23.3. Asset tests inspect PNG formats/dimensions, opaque RGB store icon, exact derivative hashes and pixel-by-pixel circular adaptive safe bounds. Rendering tests cover the real logo, login and both signup roles across light/dark themes; startup tests cover native/image handoff, routing, no replay, reduced motion, bounded dismissal and cleanup. The rendered store icon was visually inspected. Expo prebuild configuration resolves the installed native splash plugin and asset references.

Native launcher and splash changes require a fresh native binary; an OTA JavaScript update cannot replace launcher icons or compiled launch resources. Release builds on physical iOS/Android devices remain necessary to check cold/warm launch, mask variations, Android themed icons, OS launch transitions, signing/asset-catalog validation, large fonts, keyboard behavior and light/dark appearance. Expo Go is not a reliable preview of the configured native splash. Verify favicon cache refresh and rendered auth layouts in target browsers after release. No actual native build or physical-device check is claimed here.

Official configuration references: [Expo splash-screen plugin](https://docs.expo.dev/versions/latest/sdk/splash-screen/), [Expo app icons and splash](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/), [Expo application configuration](https://docs.expo.dev/versions/latest/config/app/). Installed SDK 57 package/config-plugin definitions were also checked locally.

Previous logo-integration verification (before the animated startup update), with Node **22.23.3**:

- Complete application suite: **471 passed, zero failures**. Log: `.local-checks/branding-app.log`.
- The suite includes four focused branding/configuration tests, both existing welcome-navigation timer tests, authentication/role-routing tests and existing marketplace, quotation, payment, booking, media, messaging and notification regressions.
- Expo prebuild configuration resolved successfully: `.local-checks/branding-expo-config.json`. No native project was generated.
- Expo exports for **iOS, Android and Web all passed**, including native Hermes bundles and the generated `favicon.ico`. Artifacts: `.local-checks/branding-export`; log: `.local-checks/branding-export.log`.
- `git diff --check` passed. Backend, authentication services/context, Firebase client, Render settings and payment/comparison screens have no changes.

All checks use local assets and synthetic test data. No login, registration, payment or other production test writes were performed. Remaining checks are fresh native builds/physical-device verification and target-browser appearance/cache checks described above.

## Animated startup update file scope

This follow-up changes only `src/shared/components/StartupSplash.js` (new), `src/navigation/AppNavigator.js`, `src/features/auth/screens/SplashScreen.js`, `src/features/auth/screens/SignInScreen.js`, `src/features/auth/components/AuthHeader.js`, `tests/splash.test.cjs`, `tests/branding.test.cjs`, `tests/helpers/load-ui.cjs` and this guide. All branding assets, app.json and dependency files retain the preceding integration unchanged.

Device checks: release-build cold/warm launches on iOS/Android, native-to-React alignment without flashes, low-end Android performance, screen-reader/reduced-motion preferences (including changes during boot), interrupted/background launches, offline restoration and notification destinations. In browsers check first load/refresh, short viewports, large fonts, keyboard focus and that boot never replays on in-app navigation.

## Animated startup verification results

- Node **22.23.3**, complete application suite: **479 passed, zero failures**, including ten startup tests, branding/authentication regressions and existing notification deep links. Log: `.local-checks/animated-splash-full.log`.
- Expo **iOS, Android and Web exports passed** for the final implementation, including native Hermes bundles. Artifacts: `.local-checks/animated-splash-export`; log: `.local-checks/animated-splash-export.log`. The initial sandbox-only Hermes permission failure was resolved by allowing execution of the existing local compiler.
- `git diff --check` passed. All existing PR artwork, icon derivatives, native splash options, dependency versions, auth service/context, Firebase and backend code were preserved during this follow-up.
- No production writes, native builds, commits, pushes or deployments were performed. Physical-device/browser visual checks listed above remain outstanding.
