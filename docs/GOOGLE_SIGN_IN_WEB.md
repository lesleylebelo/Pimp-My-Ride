# Google sign-in: web Phase 1

Implemented locally on 27 October 2026. No deployment or Console changes were made.

## Authentication and account safety

The web button opens Google's official Google Identity Services (GIS) credential
button. The browser generates a cryptographic nonce. The backend verifies the
Google signature, issuer, exact Web client audience, nonce, expiry, issuance age
(10 minutes maximum), subject and verified-email claim using google-auth-library.
It then issues a **Firebase custom token**, not an application session cookie.
See [Google verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
and [Firebase custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens).

This deliberately replaces the audit's proposed direct Google/Firebase credential
exchange: direct Firebase Google sign-in can implicitly link by email in some
cases. This implementation never calls `signInWithPopup`, `signInWithCredential`
or the Google `signInWithIdp` endpoint.

- Existing Google identity: resolve by Google `sub` and Firebase provider UID.
- Matching email with an unlinked password account: require explicit confirmation
  and a Firebase password ID token for that exact UID, verified with revocation
  checking and a maximum authentication age of five minutes. Passwords go only to
  Firebase's existing client sign-in API, never to this backend.
- The Admin SDK `providerToLink` update contains only the proved Google provider.
  It never changes password, primary email, roles, claims or existing profiles.
- Different existing Google provider, unsupported provider, unverified password
  account or conflicting UID: stop. No automatic merge, unlink or deletion.
- New users: create a Firebase identity, keep its session in isolated memory,
  collect name, South African phone, Customer/Workshop choice, terms and workshop
  details, then call the existing `/api/profile` endpoint. Workshop approval and
  document upload requirements remain unchanged.
- Existing profiles are never overwritten. Incomplete onboarding can be retried
  using Google; accounts are never automatically deleted after an error/cancel.
- `/api/auth/google/authorize` uses the existing actor checks and validates profile
  fields. The client then uses the existing profile validation and session promotion.
  No persisted app session is created before both succeed.
- Admin Google login is intentionally blocked in this phase. Admin password login
  and password-based recent-authentication confirmation continue unchanged.
- The existing observer, persistence and logout handle the resulting Firebase
  user. GIS auto-selection is disabled; logout does not log out the person's
  Google browser account or revoke consent. Google consent revocation does not
  by itself revoke an already-issued Firebase session.

New backend-only Firestore metadata (default deny under existing rules):

- `googleAuthIdentities/{sha256(subject)}` reserves a random new Firebase UID so
  interrupted creation can recover safely.
- `googleAuthProviderLinks/{uid}` reserves the Google subject during linking,
  preventing concurrent different subjects from replacing the same provider.

Do not delete these reservations to resolve conflicts without investigating the
Firebase identity and its existing provider. Neither collection contains tokens
or passwords, and neither changes marketplace ownership records.

## Required Console and environment configuration

Use the existing Firebase/Google Cloud project `pimp-my-ride-a26fc`.

1. Keep Firebase Email/Password enabled and retain existing account/email policy.
   **Keep the direct Firebase Google sign-in provider disabled for this custom-token
   design.** Enabling it exposes a separate direct sign-in route with Firebase's
   implicit-linking behavior. If it is already enabled for another consumer,
   pause rollout and review that consumer before changing live settings.
2. In Google Cloud's Google Auth Platform, configure branding, audience/consent and
   a **Web application** OAuth client. Use only identity scopes; no Drive/Gmail
   access, OAuth client secret, offline Google access or Google refresh token is
   needed. Add consent test users while the app is in testing.
3. Add exact Authorized JavaScript origins, e.g. `http://localhost:8081`, the actual
   Netlify HTTPS origin and any actual custom HTTPS origin. Do not guess the live
   hostname or use wildcard preview origins. Add the matching Firebase Authorized
   Domains as applicable to the existing app and email action links.
4. GIS uses popup/callback mode. This implementation needs **no OAuth redirect URI**,
   Firebase `/__/auth/handler` proxy, deep link or native client ID. The existing
   Firebase `authDomain` stays unchanged.
5. Set the same Web client ID on both services:

   ```text
   # Expo/Netlify: public build-time configuration
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web-client-id>.apps.googleusercontent.com

   # Render: server environment
   GOOGLE_WEB_CLIENT_ID=<same-web-client-id>.apps.googleusercontent.com
   ```

   Keep existing Firebase variables and `EXPO_PUBLIC_API_URL`. Render's exact
   `CORS_ORIGINS` list must include every approved web origin. The exchange rejects
   missing/unknown Origin headers, accepts no ambient cookies, limits JSON to
   32 KB and permits 12 attempts per IP per minute. Credentials stay out of logs.
6. The existing server-only Firebase service account must be allowed to read/create
   users, link providers and mint Firebase custom tokens. With a certificate-based
   credential signing is local. IAM-based signing needs the appropriate `signBlob`
   permission. Never put a service-account key or OAuth secret in `EXPO_PUBLIC_*`.
7. If hosting adds CSP/COOP headers, allow Google's GIS script/frames/connections
   and popup requirements according to [Google setup guidance](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).
   Do not broadly disable existing security headers.

Empty client configuration leaves a clear email/password fallback. Backend
exchange failures never fall back to unsafe direct Firebase Google sign-in.
Real Google sign-in is explicitly blocked in the local synthetic demo mode.

## Exact source/configuration changes

Modified:

- `.env.example`
- `backend/.env.example`
- `backend/app.cjs`
- `backend/server.cjs`
- `backend/services.cjs`
- `backend/package.json`
- `backend/package-lock.json`
- `src/features/auth/services/accounts.js`
- `src/features/auth/utils/authErrors.js`
- `src/features/auth/screens/SignInScreen.js`
- `src/features/auth/screens/SignUpScreen.js`
- `tests/session.test.cjs`

Added:

- `backend/google-auth.cjs`
- `backend/test/google-auth.test.cjs`
- `src/features/auth/services/googleAccounts.js`
- `src/features/auth/services/googleIdentity.js`
- `src/features/auth/components/GoogleSignIn.web.js`
- `src/features/auth/components/GoogleSignIn.js` (empty native fallback)
- `tests/google-accounts.test.cjs`
- `tests/google-ui.test.cjs`
- `docs/GOOGLE_SIGN_IN_WEB.md`

No native packages, app/build configuration, ownership rules, AI, payment,
Studio or marketplace behavior was changed. Existing untracked Azure diagnosis
documentation was preserved.

## Verification and release checklist

Automated tests use signed-identity verifier mocks, Firebase mocks and the existing
transactional in-memory database. They do not authenticate real Google accounts
or write production Firebase data. Component tests use React Test Renderer.

Focused command from the repository root:

```text
node --test backend/test/google-auth.test.cjs tests/google-accounts.test.cjs tests/google-ui.test.cjs tests/accounts.test.cjs tests/firebase-isolation.test.cjs tests/session.test.cjs tests/verification-ui.test.cjs tests/password-recovery.test.cjs
```

Actual local results:

- Authentication/security regression run: **94 passed, 0 failed**. After adding
  the cancellation-during-persistence check, the account/Google service tests were
  rerun: **37 passed, 0 failed** (overlapping tests, not an additional 37 unique cases).
- Full frontend suite (`node --test --test-reporter=dot tests/*.test.cjs`): passed.
  The separately added Google UI suite also passed all **6** component tests.
- Selected backend Google/HTTP/security/documents/reliability/admin suite: passed
  all **60** tests; the final Google backend suite contains **11** passing tests,
  including concurrent provider-slot reservation.
- Production-mode Expo web export: passed. Existing web-export API wiring verifier:
  passed, with intercepted/mocked fetch requests.
- Dependency resolution (`google-auth-library@10.9.1`) and `git diff --check`: passed.

Logs are in ignored `.local-checks/google-auth-test-results.txt`,
`.local-checks/google-final-client-tests.txt` and `.local-checks/google-web-build.txt`.
The export at `.local-checks/google-web-export` uses synthetic Firebase/OAuth
configuration for compilation verification. **Do not deploy that test artifact.**
Build normally with the reviewed environment configuration for deployment.
Browser automation was unavailable (`iab` connection unavailable), so no live
browser/OAuth success is claimed. Real Google credentials, live provider linking
and production persistence have not been exercised. No production test writes
were performed.

Manual release gates (not yet verified):

- Confirm Admin provider linking and custom-token signing work with the direct
  Firebase Google provider disabled. If the environment cannot support this,
  leave Google unavailable and investigate; do not enable a direct fallback.
- Confirm matching client IDs, consent/test-user configuration, actual Netlify
  origin, CSP/COOP, and Render origin allowlist. Rebuild the frontend after changing
  any public environment variable.
- On Chrome, Firefox, Safari and a mobile web viewport: inspect the button/modal,
  close the Google popup, cancel each stage, block popups/scripts and disconnect.
- New Customer: consent, required-field validation, profile creation, reload,
  logout and return login all work. Interrupted onboarding resumes without duplicates.
- New Workshop: business fields, documents and pending/rejected restrictions remain
  enforced; Google never grants workshop approval.
- Existing password account: explicit password confirmation, same UID before/after,
  both sign-in methods still work, unchanged profile and unchanged Garage, requests,
  quotes and bookings. Include verified Gmail and third-party Google email cases.
- Unverified password account: Google linking refuses access until the original
  verification flow is completed. Password reset and verification resend still work.
- Existing Google identity: provider subject wins even if its email has changed;
  changed/conflicting identities cannot overwrite another provider or profile.
- Suspended/disabled accounts and revoked Firebase refresh tokens remain denied.
  An Admin account continues using its existing password method.

Google credential verification, provider-link behavior and actual browser/session
storage must pass these checks before claiming production readiness. Neither an
emulator nor mocked tests prove production Google/Firebase integration.
