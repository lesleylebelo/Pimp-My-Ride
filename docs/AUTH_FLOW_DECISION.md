# Password recovery and email configuration

The team scope PDF lists Splash, Login, Register, and Forgot Password. It does not
mandate an in-app reset action handler, so it does not settle the hosted-versus-app
decision. The user's instruction to inspect actual Firebase settings controls.

## Verified local behavior

`ForgotPasswordScreen` calls Firebase `sendPasswordResetEmail` without
`ActionCodeSettings`. The actual Firebase project's email template therefore
determines where the received link opens. The repository does not export that
setting. There is no configured application linking, native URL scheme, hosted
action handler, or path that supplies `oobCode` to `ResetPasswordScreen`.

The reset and success screens are retained. Removing them or redirecting all
Firebase email actions without inspecting the configured template would select a
product flow using an assumption. The full incoming-link decision is **pending
external verification**, and M6 is not resolved end to end.

During this local change, the reset screen was hardened to verify its code before
showing password fields, use the email returned by Firebase (never a route-supplied
email), reject invalid/expired/reused codes, and offer a new email. Network failures
have an explicit retry. Password submission has an immediate in-memory lock so
two taps in the same render cannot issue two requests. A replaced link invalidates
old asynchronous results. Successful reset clears entered passwords and replaces
the reset route with success; no code/email is passed to that route.

Forgot-password requests also have a synchronous duplicate-submit lock and retain
the non-enumerating confirmation message. No Firebase requests were sent by the
new component tests: Firebase Auth and network operations are mocked.

## External verification needed before choosing the handler

An unauthenticated attempt to read the project's default hosted action page was
not accessible through the available web tool. A working default page would only
prove that page exists; it would not establish which URL the email template uses.
No authenticated Firebase configuration access was available for this subtask.
No email templates, passwords, accounts, or deployment settings were changed.

1. Open the intended project in Firebase Console, then Authentication > Templates.
   Inspect the password-reset email and its action URL. Record only the URL's
   origin/path and whether it is Firebase-hosted or custom; never copy query codes,
   real email addresses, or tokens into documentation.
2. Inspect email verification and email-change recovery templates as well. Firebase
   documents that a customized action URL applies to all email templates. Do not
   configure a reset-only application route as that shared handler. A custom
   handler must also support `verifyEmail` and `recoverEmail` before a switch.
3. If the existing hosted handler is intentional, confirm it using a separately
   authorized test environment. Then deliberately remove dead custom reset routes
   and document hosted reset plus return-to-sign-in behavior.
4. If the application must handle actions, choose its stable HTTPS hosting URL and
   native link behavior, implement every required action mode, and test cold-start
   and already-running links. Do not follow an arbitrary `continueUrl`. Preserve
   email verification refresh without forced logout. Change the console template
   only after the implementation and deployment are separately approved.

Firebase reference: [custom email action handlers](https://firebase.google.com/docs/auth/custom-email-handler).

## Password-policy check

The UI currently enforces 12-128 characters. That does not establish the project's
server-side Firebase password policy. In Authentication > Settings > Password
policy, verify the configured minimum, maximum, additional character requirements,
and enforcement mode against the intended rules. Validate signup and reset with
an isolated test project; do not create or alter production users for this check.
If Firebase requires more than the current UI, update its helper/validation to
match while retaining server errors.

Firebase reference: [password authentication and policy](https://firebase.google.com/docs/auth/web/password-auth).

## Local regression checks

Run `node --test tests/password-recovery.test.cjs` from the application root. Cases
exercise actual screen callbacks for missing/invalid/expired/used codes, offline
retry, trusted email display, password validation, duplicate taps, confirmation
failure, a late response from a previous link, non-enumerating email requests, and
the clean success-to-sign-in stack. This is component verification with mocks,
not proof of delivered emails, hosted configuration, or native incoming links.

The local 60-second login cooldown remains unchanged. It persists in AsyncStorage
on the current device/browser, can be bypassed by clearing that storage or using
another client, and is not global brute-force protection.
