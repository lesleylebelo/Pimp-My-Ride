# Google sign-in for Android — Phase 2

Implemented locally on branch `lesley`, 27 October 2026. No commits, pushes,
deployments, EAS builds, Google Console changes or production test writes.

## Confirmed configuration and Preview readiness

The owner has confirmed:

- Firebase project `pimp-my-ride-a26fc` and its registered Android app.
- Package `com.lesleylebelo.pimpmyride`.
- EAS Preview signing SHA-1 and SHA-256 are registered.
- The Android OAuth client matches that Preview package and certificate.
- A dedicated Web OAuth client is configured; web login, linking, onboarding and Admin restrictions have been manually tested.

These setup steps do not need repeating. Retain the confirmed Preview signing
credentials. Development builds may use another key and need their own fingerprint
registration; Preview is the confirmed build target.

Remaining checks are the EAS Preview public build-time environment variables,
deployment of the Android exchange route, APK compilation and real-device tests.
Neither Console changes nor EAS builds are performed by this implementation.

Exact standalone APK build command, from `PimpMyRide/`:

```text
npx eas-cli build --platform android --profile preview
```

The Preview profile explicitly sets `developmentClient: false`, internal
distribution, Android `buildType: apk` and environment `preview`.

## Architecture inspected and library choice

- Expo installed: **57.0.20**, React Native: **0.86.3**, React: **19.2.3**.
- Android package: **`com.lesleylebelo.pimpmyride`**, unchanged.
- Firebase remains the same JS SDK, project, UID space and backend. Main native
  authentication uses the existing SecureStore persistence adapter. Temporary
  authentication still uses isolated in-memory Firebase apps.
- Preview produces standalone internal Android APKs. The development-client
  profile remains available separately; no build was started.
- Use the existing Web client ID in the EAS Preview environment and the same
  exact ID in Render's `GOOGLE_WEB_CLIENT_ID`. Do not pass an Android OAuth
  client ID as the token audience or replace the working web client during setup.
  No environment values were edited or disclosed.

Compared the options in [Expo's Google authentication guide](https://docs.expo.dev/guides/google-authentication/):

| Option | Android API / nonce | Decision |
| --- | --- | --- |
| `react-native-nitro-google-signin` | Credential Manager; explicit custom nonce | Selected, MIT license, no library license fee |
| `@react-native-google-signin/google-signin` Original | Legacy Android Google Sign-In; does not supply the required configurable Android nonce through this API | Not selected |
| React Native Google Sign-In Universal | Credential Manager and configurable nonce; licensed offering | Not needed for this phase |

Installed and pinned **Nitro Google Sign-In 2.3.0**, **Nitro Modules 0.37.1**.
The installed package declares React Native >=0.76, Expo >=49, and Nitro Modules
>=0.36. The project meets those peer requirements. Expo's bundled module ranges
were used for `expo-crypto` (`~57.0.2`, installed 57.0.4) and `expo-dev-client`
(`~57.0.18`, installed 57.0.20).

This establishes declared compatibility and JS/configuration integration, not a
successful native C++/Kotlin compilation. The vendor's compatibility file lists
RN 0.86 for the 2.0 family but does not separately list 2.3. Native APK compilation
and device verification remain release gates.

Sources: [Nitro library](https://github.com/react-native-nitro-google-sign-in/google-signin),
[Original API](https://react-native-google-signin.github.io/docs/original),
[Universal nonce feature](https://react-native-google-signin.github.io/docs/security).

## Nonce and backend security design

The Android adapter generates 32 cryptographically random bytes using Expo Crypto,
then computes their SHA-256 hex digest. It passes that digest as the SDK's explicit
`nonce`. The installed Android source calls `setNonce(resolveNonce())` and returns
the configured value unchanged. The adapter sends the **same digest** with the
Google ID token to the backend. It does not derive a trusted nonce from an
unverified JWT or accept an access token instead of an ID token.

The SDK is configured with the existing **Web** client ID and requests a Google
ID token for that audience. No alternate audience/issuer or relaxed nonce rules
were added. The existing backend still verifies Google's signature, exact audience,
issuer, issuance time, expiry, verified email and signed nonce, then uses the
same provider-subject lookup, password proof, UID reservations and Firebase custom
token issuance. Android and web resolve the same Google `sub` to the same Firebase UID.

Android has no browser `Origin` header. It therefore uses a new explicit route:

```text
POST https://pimp-my-ride.onrender.com/auth/google/android
Content-Type: application/json
Body: { credential: <Google ID token>, nonce: <configured digest>, proofToken?: <Firebase password ID token> }
```

The native route rejects **every** supplied browser Origin, including allowlisted
web origins. The existing web `/auth/google` origin gate and CORS settings remain
unchanged. Both routes share the same 12-attempt/minute/IP budget, 32 KB JSON bound
and Google exchange handler. Native requests carry an explicit Google credential;
they do not authenticate through ambient cookies. This is not device attestation:
the backend trusts the verified Google identity, never a client platform flag.

All authenticated `/api` routes retain Firebase ID-token verification and revocation
checking. The existing `/api/profile` and `/api/auth/google/authorize` paths, roles,
approval checks and Firestore ownership rules remain unchanged.

## Native behavior

- Metro selects `GoogleSignIn.android.js` on Android and the existing, unchanged
  `GoogleSignIn.web.js` on web. iOS remains an empty fallback, not an implemented flow.
- Tapping the button opens Credential Manager's explicit Google account picker,
  not a silent restoration API. Automatic Google selection and offline OAuth
  access are disabled.
- The selected token enters the same `googleLogin()` coordinator as web. Password
  linking requires explicit password proof. Missing profiles collect Customer/
  Workshop choice, name, South African phone, terms and workshop business fields.
- Workshop approval/documents remain required. Admin Google login stays blocked.
  Existing profiles and marketplace records are not copied or overwritten.
- Every native picker attempt clears the Google SDK's local selected-account cache
  using `signOut()`, without revoking consent. Successful selection fails closed
  if cleanup fails. Firebase is the sole persisted app session; normal Firebase
  logout and session restoration remain unchanged.
- Cancellation aborts pending app authentication and ignores late picker results.
  Android Back can dismiss the native picker. If the app operation is cancelled
  while the native picker remains open, close that picker before starting again.
- Missing Play Services, configuration, network, unavailable native modules and
  cancellation have explicit messages. Expo Go/old APKs can still use email/password;
  tapping Google explains that a rebuilt native app is required.
- Native imports are lazy and isolated from web. App code does not copy tokens,
  nonces or passwords into route params, application preferences, logs or profile
  data. The SDK's temporary native credential cache is cleared as described above.

## Android / OAuth configuration

The package, Preview certificate and OAuth clients below are already confirmed.
Retain them in the **existing** project. These steps are a reference for future
signing/build changes; do not change the working web provider settings.

1. Create or verify Android OAuth client(s) with the exact package
   `com.lesleylebelo.pimpmyride` and the **actual SHA-1 of each installed build's
   signing certificate**. Do not guess fingerprints or assume development,
   preview and Play builds share a key.
2. Obtain fingerprints from the actual EAS signing credentials, an APK using
   `apksigner verify --print-certs <actual-apk>`, or the real keystore using
   `keytool -list -v -keystore <actual-keystore>`. For Google Play, register the
   **Play App Signing** certificate in addition to any applicable upload/debug keys.
   Never commit keystores, passwords or credential downloads.
3. Use the existing **Web application client ID**, not the Android client ID, in:

   ```text
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<existing-web-client-id>
   ```

   It must match Render's existing `GOOGLE_WEB_CLIENT_ID`. This same value must
   be present at build time in both EAS `development` and `preview` environments.
   Retain all current `EXPO_PUBLIC_FIREBASE_*` variables and `EXPO_PUBLIC_API_URL`.
   The Android OAuth client ID does not need a separate runtime environment variable.
4. **No `google-services.json` or native Firebase SDK is required** by the chosen
   explicit-client-ID integration. Firebase Auth/Firestore remain JS SDK clients.
   No OAuth secret, new Firebase account database, redirect URI or callback scheme
   is needed for Credential Manager.
5. Nitro native modules autolink. **No Google-specific Expo config plugin is needed
   for this manual Android configuration.** The library's bundled plugin mainly
   automates Google Services files and iOS URL/pod configuration; it is deliberately
   not registered with invented iOS values. `expo-dev-client` is registered in
   `app.json` for the development build. Do not switch to `webClientId: 'autoDetect'`
   without configuring the native Google Services files/plugin.
6. The owner must include the backend's `/auth/google/android` route change in the
   Render deployment before testing Android. A 404 means the new route has not
   reached that backend; do not change the working web exchange path to compensate.

## EAS development and preview builds

`eas.json` now contains:

- `development`: internal Android APK, development client enabled, environment
  `development`, same Node version as the existing profile.
- `preview`: standalone internal APK, explicitly `developmentClient: false`,
  retaining the existing environment, Node version, distribution and signing setup.

After reviewing OAuth/signing/build environment configuration, the owner can run:

```text
npx eas-cli build --platform android --profile development
npx expo start --dev-client
```

For an internal standalone test APK:

```text
npx eas-cli build --platform android --profile preview
```

These commands may use EAS quotas/billing. **No EAS build was triggered here.**
Local Android compilation is also possible with the required SDK/JDK/NDK toolchain;
it was not performed here. Installing/updating a native module requires rebuilding
the APK; Metro/OTA alone cannot add it to an old APK or Expo Go.

## Changed files

Modified:

- `app.json`, `eas.json`, `package.json`, `package-lock.json`
- `backend/app.cjs`, `backend/google-auth.cjs`, `backend/test/google-auth.test.cjs`
- `src/features/auth/components/GoogleSignIn.js` (fallback comment only)
- `src/features/auth/services/googleAccounts.js` (explicit Android exchange option)
- `src/features/auth/utils/authErrors.js`
- `tests/google-accounts.test.cjs`, `tests/google-route-contract.test.cjs`

Added:

- `src/features/auth/components/GoogleSignIn.android.js`
- `src/features/auth/services/googleIdentity.android.js`
- `tests/google-android-identity.test.cjs`
- `tests/google-android-ui.test.cjs`
- `docs/GOOGLE_SIGN_IN_ANDROID.md`

Web UI, Firebase initialization/persistence, marketplace, AI, Studio, payments,
production records and Firestore rules were not changed. Google verification rules
are unchanged; the verifier accepts a trusted client injection for cryptographic
tests only. Previously untracked diagnosis/web documentation was preserved.

## Controlled real-device checklist and release gates

Local verification completed:

- Focused authentication command: **157 passed, 0 failed, 0 skipped**. Includes
  native picker/UI, nonce/error handling, shared onboarding/linking, real signed
  Google-token verification, web UI, route contracts, email/password, isolated
  Firebase sessions, SecureStore, restoration/logout and backend HTTP/security.
- Full frontend regression suite (`node --test --test-concurrency=2 tests/*.test.cjs`):
  **651 passed, 0 failed, 0 skipped**. This includes authentication and existing
  marketplace/UI regressions; no unrelated application code was changed.
- Relevant backend regression suite: **178 passed, 0 failed, 0 skipped** across
  Google authentication, HTTP/security, documents, reliability, trusted Admin
  operations and marketplace tests. Counts overlap with the focused command.
- Expo prebuild configuration resolved successfully; Android package unchanged.
- Actual Expo Android autolinking resolved both `NitroGoogleSigninPackage` and
  `NitroModulesPackage`, without Google Services files or a Google-specific plugin.
- Android and web production JavaScript exports passed. Native Google code is
  included in the Android bundle and excluded from web. The existing web API wiring
  verifier passed using intercepted requests. These exports used `--no-bytecode`
  for portable JS bundle verification; they do not prove native compilation or
  Hermes bytecode execution.
- No APK was compiled/installed, no EAS build was triggered and no real Android
  Google sign-in was attempted. Device checks below are still required.

Ignored logs/artifacts:

- `.local-checks/google-completion-auth-tests.txt`
- `.local-checks/google-completion-backend-tests.txt`
- `.local-checks/google-completion-frontend-tests.txt`
- `.local-checks/google-android-autolinking.json`
- `.local-checks/google-android-expo-config.json`
- `.local-checks/google-android-phase2-build.txt`
- `.local-checks/google-web-phase2-build.txt`

The export directories `.local-checks/google-android-phase2-export` and
`.local-checks/google-web-phase2-export` contain **synthetic configuration** and
must not be deployed. Produce release artifacts with the reviewed real build
environment. Tests used mocked credentials/SDK calls and transactional in-memory
data; they do not establish real OAuth or native runtime success.

Use designated test users and sample data only. Do not run destructive production
tests or revoke unrelated users' sessions.

1. Verify the rebuilt APK installs and launches, its certificate SHA-1 matches
   the Android OAuth client, and its EAS environment has the existing Web client ID.
2. Verify normal email/password login before testing Google. Check Expo Go/older
   builds show the Google rebuild message without breaking email/password.
3. Select Google account A. For a new Customer, complete required fields/terms,
   confirm the existing backend creates one profile, then force-close/reopen and
   verify Firebase restores that same UID. Log out and reopen: remain signed out.
4. Sign in with account A on web and Android. Confirm identical Firebase UID and
   existing Garage/requests/quotations/bookings; do not migrate or rewrite records.
5. For a designated password account, link Google using its real password proof.
   Confirm its UID/profile/records do not change and its password still works.
6. Create a sample Workshop. Business fields and documents are required; approval
   must remain pending, and workshop operations remain denied until approved.
7. Cancel the native picker and each linking/onboarding stage, including Android
   Back. Ensure no app session appears. Test wrong password, offline connection,
   missing/outdated Play Services and wrong build fingerprint on a controlled build.
8. Log out, then choose account B. Ensure no account-A profile/cache/data is shown.
   Check cold restart for each account and the normal Firebase logout path.
9. Test designated suspended/disabled accounts, revoked Firebase sessions, provider
   conflicts and Admin accounts. Restrictions and Admin Google block must remain.
10. Recheck the manually verified web flows. The web and Android route contracts,
    nonce checks and account restrictions must all pass before release.

The signing/Console setup is owner-confirmed. Until APK compilation, build-time
environment verification, Android route deployment and these device checks pass,
Android support is implemented but **not release verified**.

## Completion verification additions

- `npm run test:google-auth` is a repeatable focused authentication test command.
- Tests now use the production OAuth2Client verification path with ephemeral RSA
  test keys and substituted public-certificate retrieval. Signed nonce-bound
  fixtures reuse one UID across web and Android. Unsigned, forged, expired,
  wrong-audience, wrong-issuer and wrong-nonce tokens fail before account access.
- The trusted `googleClient` test seam in `backend/google-auth.cjs` defaults to
  the real OAuth2Client and Google certificates in production. Request bodies
  cannot select keys, clients, audiences or verification functions.
