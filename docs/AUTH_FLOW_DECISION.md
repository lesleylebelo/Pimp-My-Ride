# Password recovery and email configuration

## Chosen flow: Firebase-hosted password reset

The user confirmed that Firebase's hosted password-reset handler is configured.
This is user-confirmed configuration, not a tool-verified console setting or a
delivered-email test. The app now deliberately uses that hosted flow.

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
4. Check email-verification behavior independently, preserving automatic profile
   refresh without forcing another sign-in. A future custom handler must account
   for every Firebase email action mode before any template change.

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
[Firebase email action handlers](https://firebase.google.com/docs/auth/custom-email-handler).

## Local regression checks

Run `node --test tests/password-recovery.test.cjs tests/landing.test.cjs` from the
application root. Tests exercise actual recovery callbacks with mocked Auth and
network operations: email validation and trimming, the default hosted-email call,
duplicate taps, conditional confirmation, offline/network/rate-limit retry,
editing after confirmation, clean sign-in navigation and the guest route list.
Existing landing tests verify role and verification routing. These are local
component/unit checks, not delivered-email or device tests.
