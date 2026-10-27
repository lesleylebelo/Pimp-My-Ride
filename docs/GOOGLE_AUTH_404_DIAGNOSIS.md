# Google authentication 404: deployment/source mismatch

Investigation: 27 October 2026. No commit, push, deployment or Console changes.

## Confirmed request and routes

| Operation | Frontend transport | Actual Express route |
| --- | --- | --- |
| Google credential exchange | Direct `fetch` in `src/features/auth/services/googleAccounts.js` | `POST /auth/google` |
| Profile creation | `apiRequest('profile', ...)` | `POST /api/profile` |
| Google session authorization | `apiRequest('auth/google/authorize', ...)` | `POST /api/auth/google/authorize` |
| Marketplace | `apiRequest('marketplace', ...)` | `POST /api/marketplace` |

The shared client (`src/shared/services/api.js`) adds `/api/` automatically and
requires a Firebase user/token. The Google credential exchange intentionally does
not use it because no Firebase session exists at that stage. The correct exchange
URL is `https://pimp-my-ride.onrender.com/auth/google`, with method POST.

`backend/app.cjs` registers the exchange before the `/api` authentication middleware.
`backend/server.cjs` passes `createGoogleAuth({auth,db})` into `createApp`.
`backend/google-auth.cjs` implements credential verification and the Firebase
exchange. These local pieces agree; adding `/api` to the frontend would be wrong.

## Live and Git evidence

An empty, invalid JSON POST (no credentials or identity information) to the live
exchange URL returned:

```json
{"status":404,"origin":"http://localhost:8081","body":{"error":{"code":"not-found","message":"Endpoint not found."}}}
```

The malformed probe cannot create/link an account. CORS is allowing the origin;
the response is the deployed app's unmatched-route response, not an OAuth error.

Read-only `git ls-remote --heads origin lesley main` confirmed these current
GitHub branch tips, matching the corresponding local tracking refs:

- `lesley`: `9fdc10150caa9c40e4f5bc1dfec5ff991c406429` (also local HEAD).
- `main`: `8fc668cb124ebb4b27efac482c365b48d1248e9b`.

Neither tip contains the Google exchange or session-authorization routes.
The Google route/server/service/dependency changes are still uncommitted locally;
`backend/google-auth.cjs` is untracked. Consequently neither remote branch tip
contains the complete backend implementation for Render to build.

`render.yaml` specifies `rootDir: backend`, `buildCommand: npm ci`, and
`startCommand: npm start`; `backend/package.json` starts `server.cjs`. There is no
branch selection in this file. The Render dashboard's selected branch and actual
deployed commit SHA cannot be established from this repository or `/health`.
They must be checked in Render; do not infer either from the frontend request.

## Minimal correction

No frontend URL or Express route change is needed. The outstanding correction is
to include the complete existing Google backend implementation in the source
revision selected for Render, then deploy it using the owner's normal workflow.
The owner handles Git and deployments. Include the handler, app/server/service
wiring and `backend/package.json`/`package-lock.json`, not just the route line.

After the owner deploys, an empty POST to `/auth/google` should reach validation
and return 400 (invalid input) or 503 (Google is not configured), rather than the
generic 404. Authenticated `/api` routes must continue requiring Firebase tokens.
These probes alone do not prove successful OAuth; use the existing web setup
guide for end-to-end verification.

## Regression coverage

`tests/google-route-contract.test.cjs` executes the actual frontend
`exchangeGoogle()` and shared API client against the actual Express `createApp()`
using local Supertest HTTP and synthetic handlers. It verifies:

- Google exchange method, path, JSON body and pre-session behavior.
- `/api` prefixing and revoked-token-aware middleware for profile, Google
  authorization and marketplace routes.
- The observed 404 when a backend has no exchange route, with no alternate-path
  retry that could obscure a deployment mismatch.

No Google Cloud settings, Firebase providers, CORS, AI or marketplace source was
changed for this investigation.

Actual test run: **123 passed, 0 failed, 0 skipped**. This includes the three new
route-contract tests, Google service/UI/backend tests, existing email/password
accounts, Firebase isolation, session/logout, verification/recovery and backend
HTTP/security tests. Full output is in ignored
`.local-checks/google-404-test-results.txt`.

Command (repository root):

```text
node --test --test-concurrency=2 tests/google-route-contract.test.cjs tests/google-accounts.test.cjs tests/google-ui.test.cjs tests/accounts.test.cjs tests/firebase-isolation.test.cjs tests/session.test.cjs tests/verification-ui.test.cjs tests/password-recovery.test.cjs backend/test/google-auth.test.cjs backend/test/http.test.cjs backend/test/security.test.cjs
```

Only this diagnosis and `tests/google-route-contract.test.cjs` were added during
the 404 investigation. Existing uncommitted Google implementation files were
preserved without changing their routes or request paths. The live 404 remains
until the owner publishes and deploys the backend implementation.
