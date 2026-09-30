# Password recovery and email configuration

## Chosen flow: Firebase-hosted password reset

The user confirmed that Firebase's hosted password-reset handler is configured.
This is user-confirmed configuration, not a tool-verified console setting or a
delivered-email test. The app now deliberately uses that hosted flow.

## Email verification and authentication boundary

Signup creates the Auth account and saves its full profile using a separate
Firebase app with `inMemoryPersistence`. It requests a verification email, then
signs out and deletes that temporary Firebase app. The main app's Auth instance
stays signed out throughout. Firebase still issues a temporary credential for
profile creation and sending the email; this is not a persisted app session.
Closing the app at any point does not restore that temporary credential.

Successful signup opens the guest-only `VerifyEmail` screen. An email-send
failure after profile creation opens the same screen with a truthful retry
message. Passwords are cleared and are never placed in navigation parameters or
storage. Resending requires the email and password again and uses the same
isolated Auth flow; it never signs the main app in.

Password login checks credentials, `emailVerified`, the server profile, account
status, role and administrator claims in the isolated client. Only after those
checks pass does `updateCurrentUser` copy the verified user to the main persistent
Auth instance. Shop approval and role routing remain separate restrictions.
Restored unverified sessions from older app versions are cleared before profile
reads, even offline. Cleanup failures leave the app in the guest state. The
navigator independently refuses authenticated routes for unverified users.

The local Firestore rules also require verified email, trusted administrator
claims, an active administrator profile and no pending status/provisioning
operation before post moderation. This closes a direct-SDK path that UI gating
alone could not protect. The rule change is not deployed by this work.

The current Firebase-hosted `sendEmailVerification` action verifies the email
address; it does not authenticate a user after the app has signed them out.
Automatic sign-in on clicking that link is not provided by this flow. Do not
retain a signup password in app storage as a workaround. To add automatic
post-verification sign-in, first choose and configure a supported mechanism:
for example, an email-link sign-in flow that authenticates only after the user
opens the link, or a reviewed custom email-action handler with a secure,
single-use credential exchange and registered web/native app links. This
requires Firebase console/template and authorized-domain configuration plus
end-to-end testing on the actual web and native return paths. Until that work is
configured, the user must sign in after verifying. The user has requested
automatic sign-in; the HTTPS callback origin/path and native link configuration
are still outstanding, so this part of the requested flow is not implemented.

Email-link sign-in is not a drop-in replacement for this password signup: Firebase
removes an existing unverified password when an email sign-in link is redeemed.
Preserving the chosen password therefore requires a deliberate account/link
design, not storing the password and replaying it after verification. Expo Go
also does not provide a stable application-owned HTTPS return link. Test a
configured development build for native app-link behavior before deployment.

`ForgotPasswordScreen` calls Firebase `sendPasswordResetEmail` with the Auth
instance and trimmed email only, without `ActionCodeSettings` or a custom action
URL. Firebase's configured email template supplies the hosted reset link. The
recipient opens that link in their browser, chooses a new password there, then
returns to the app's shared sign-in. The app's Back to Sign In action resets the
guest stack to that shared screen.

The unreachable `ResetPasswordScreen` and `ResetSuccessScreen` and their navigator
entries were removed. No custom reset handler, incoming-link route, native URL
scheme, or return URL is introduced. The team scope PDF requires Forgot Password;
it does not require an in-app action handler. No Firebase templates, accounts,
passwords, or deployment settings were changed by this local implementation.

## Request behavior and limits

- Email is validated live and again on submission. A synchronous lock prevents
  duplicate requests before the loading state renders.
- Success, unknown-account and disabled-account responses display the same
  conditional confirmation; the app does not disclose account existence.
- The confirmation explains the browser step and return to shared sign-in.
  It reports an email request, never a completed password change or guaranteed
  delivery. A confirmed address cannot be resubmitted until the field changes.
- Offline requests stop before the Auth call. Network and rate-limit errors are
  shown with retry guidance. Firebase still controls email delivery, request
  limits, action-code validity and reset completion.

This UI behavior alone does not prove that project-level email enumeration
protection is enabled. Verify that setting separately. The local 60-second login
cooldown is unchanged: it persists in AsyncStorage on this client, can be bypassed
by clearing storage or using another client, and is not global brute-force
protection.

## Remaining end-to-end verification

Using a separately authorized test environment and fictional accounts:

1. Receive a password-reset email, inspect only its expected hosted origin/path,
   open the link and complete the reset. Never record action codes, tokens, real
   addresses or full signed links in logs or documentation.
2. Confirm the old password fails and the new password signs in through the shared
   screen and trusted role routing. Check expired and reused links on the hosted
   handler and delivery/spam behavior.
3. Confirm returning manually to the app works on web and native devices. No
   automatic app deep-link return is promised by the current flow.
4. Check email verification independently: signup and resend remain signed out,
   restarting while unverified exposes only guest screens, unverified password
   login is blocked, and a verified password login reaches the permitted role
   screen. A future custom handler must account for every Firebase email action
   mode before any template change.

No live Auth requests were made by the new tests. Delivered email, hosted reset
completion and device/browser interaction remain unverified.

## Password-policy check

Registration currently enforces 12-128 characters in the app. That does not prove
the project's server-side Firebase password policy, which also governs the hosted
reset form. In Authentication settings, verify minimum and maximum length,
additional character requirements, and enforcement mode. Exercise registration
and hosted reset with an isolated test project; do not create or alter production
users for this check. Align UI guidance with the verified policy if it differs.

References:
[Firebase password authentication and policy](https://firebase.google.com/docs/auth/web/password-auth),
[Firebase email action handlers](https://firebase.google.com/docs/auth/custom-email-handler),
[Firebase email-link authentication and credential replacement](https://firebase.google.com/docs/auth/web/email-link-auth),
[Expo link configuration](https://docs.expo.dev/linking/overview/).

## Local regression checks

The email-verification regression suite uses mocked Firebase, network, storage
and navigation dependencies; it does not send real emails or write live data:

```sh
node --test tests/accounts.test.cjs tests/api.test.cjs tests/firebase-isolation.test.cjs tests/verification-ui.test.cjs tests/session.test.cjs tests/auth.test.cjs tests/password-recovery.test.cjs tests/landing.test.cjs tests/cooldown.test.cjs
```

It covers isolated memory-only Auth and cleanup, signup/profile rollback, mail
failure, secure resend, verified-session promotion, old unverified session
removal while offline, guest-only navigation and password clearing. Restarting
without a verified session now opens Sign in. These tests do not establish
delivered-email behavior or Expo Go/device support for an automatic return link.

Run `npm run test:rules` for the Firestore emulator checks. On 2026-09-30 all 11
rule tests passed against `demo-pmr-security`, including unverified/restricted
administrator denial and verified active administrator access. The focused Auth
suite passed all 102 checks. The last full app suite passed 195 of 215 checks;
20 marketplace tests fail while importing the separate in-progress feed's native
image dependencies into the Node test harness. Those failures are not covered up
by the focused Auth result. No production test writes or deployments occurred.

Run `node --test tests/password-recovery.test.cjs tests/landing.test.cjs` from the
application root. Tests exercise actual recovery callbacks with mocked Auth and
network operations: email validation and trimming, the default hosted-email call,
duplicate taps, conditional confirmation, offline/network/rate-limit retry,
editing after confirmation, clean sign-in navigation and the guest route list.
Existing landing tests verify role and verification routing. These are local
component/unit checks, not delivered-email or device tests.
