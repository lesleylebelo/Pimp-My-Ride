# Clean Sign In and contextual self-reactivation

29 October 2026. Normal Sign In no longer mounts the account status/recovery panel. Branding, Google, email/password fields, visibility toggle, Forgot password, Sign in and Sign up remain in their existing layout/themes.

## Recovery behavior

An email/password attempt first authenticates through the existing isolated Firebase session. Active valid accounts follow the existing session-promotion flow without an additional status request.

For a verified Customer/Workshop profile marked self-deactivated with no conflicting operation, login reads its own current backend account status. Only a completed `deactivate` job produces the contextual `auth/self-deactivated` result and optional “Reactivate my account” action. The transient session is cleaned up; it is never promoted. Wrong credentials, unverified email, administrator roles/restrictions, pending operations, deleting/deleted accounts, unavailable status reads and conflicting profile operations do not offer recovery.

Selecting reactivation is explicit. It authenticates again through the existing isolated recovery helper, checks the current job kind/state and calls the existing backend reactivation operation. Backend ownership, recent-authentication and self-deactivation checks remain authoritative. There is no client UID/password in the account API payload and no automatic reactivation or automatic sign-in afterwards. Success clears the password and asks the user to sign in again.

Editing either credential clears eligibility; late results for edited credentials are discarded. An unrelated authenticated app identity suppresses the action, and the isolated helper refuses access when an app session exists, including if one appears while status is loading. Errors use the existing safe authentication-message formatter. Recovery credentials stay in component memory, never navigation parameters, persistent storage or logs.

Google sign-in implementation and normal authentication are unchanged. Contextual self-reactivation uses the existing email/password recovery path; Google-only accounts can use the existing Firebase password-reset path to establish the confirmation password, as before. Underlying authenticated account-status API/helper functionality remains. Profile closure messages now direct pending-deletion users to support rather than the removed normal-screen status panel.

## Verification

| Focused run | Result |
| --- | --- |
| Accounts, recovery services, Manage Profile UI and verification UI | 51 passed, 0 failed |
| Sign In UI, web/Android Google, branding, password reset and auth regression | 48 passed, 0 failed |
| Final accounts/recovery/session/isolation boundaries | 58 passed, 0 failed |
| Final contextual Sign In and profile UI after copy/error adjustments | 9 passed, 0 failed |

These runs overlap; the counts are not additive unique-test totals. Logs are in `.local-checks/signin-*.log`. The focused tests use mocks, not production credentials/data. Successful normal session promotion and restricted-session cleanup are covered by account/session tests; no live account login or actual email delivery was performed.

Android UI configuration at 390 px and web configurations at 320/1440 px passed. Headless Chrome inspected synthetic React Native Web renders at 320/1440 px in both themes: no horizontal overflow, exactly two inputs, both sign-in methods and no account-status panel. Preview HTML/PNG files and measurements are under `.local-checks/signin/`. The in-app browser was unavailable. Google and icon/font rendering use preview stubs; functional Google/visibility-toggle behavior has separate tests. Physical-device keyboard/autofill behavior was not exercised. No full application build was requested or rerun for this focused change.

## Files changed for this request

- `src/features/auth/screens/SignInScreen.js`
- `src/features/auth/components/AccountRecovery.js`
- `src/features/auth/components/ManageProfile.js` (closure guidance only)
- `src/features/auth/services/accounts.js`
- `src/features/auth/services/accountManagement.js`
- `src/features/auth/utils/authErrors.js`
- `tests/accounts.test.cjs`
- `tests/account-management.test.cjs`
- `tests/account-management-ui.test.cjs`
- `tests/signin-recovery-ui.test.cjs` (new)
- This document and the cross-reference in `BOOKING_ACCOUNT_MANAGEMENT.md`.

Backend code, Firebase security configuration, account-deletion gates, payments and marketplace functionality were not changed for this request. Existing uncommitted work is preserved. No commit, push, deployment or production-data mutation.
