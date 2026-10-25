# Local API connection and sign-in navigation

25 October 2026. Original PimpMyRide repository, branch `lesley`. All changes remain local.

## Confirmed API diagnosis

The user confirmed Expo Web was opened at `http://localhost:8081/`, whose Origin is **`http://localhost:8081`** (no trailing slash). Local `.env` sets `EXPO_PUBLIC_API_URL=https://pimp-my-ride.onrender.com`; no overriding process value was present when inspected. No Expo listener was running at inspection time.

Read-only, unauthenticated probes against the existing Render service returned:

| Request Origin | GET `/health` | `Access-Control-Allow-Origin` | OPTIONS `/api/admin` |
| --- | --- | --- | --- |
| No Origin | 200, `{"ok":true}` | Absent, expected | Not needed |
| `https://jocular-cupcake-480d95.netlify.app` | 200 | Exact matching Netlify origin | 204 with matching origin |
| `http://localhost:8081` | 200 | **Absent** | 204, **allowed-origin header absent** |
| `http://127.0.0.1:8081` | 200 | **Absent** | 204, **allowed-origin header absent** |

The service was reachable and its health body was valid. Its effective CORS policy does not allow the confirmed local Expo origin. HTTP 200/204 alone does not establish browser access: browsers reject a cross-origin response without the matching allowed-origin header. The existing `fetch` catch then accurately reports a generic `api/network-request-failed` at the `health` stage. Browsers deliberately hide whether an opaque fetch rejection came from CORS, DNS, TLS or another network failure; the warning alone cannot identify CORS. The response-header comparison above establishes the configuration issue.

Backend `corsOrigins()` treats an explicit `CORS_ORIGINS` value as a replacement for defaults. CORS middleware already runs before health and API authentication and handles OPTIONS. Changing the local backend env file cannot change Render's service environment. NetInfo connectivity does not validate server CORS. No client API URL, HTTP(S) policy or backend CORS/authentication implementation was changed.

## Required owner-controlled Render update

Append **`,http://localhost:8081`** to the existing Render **`CORS_ORIGINS`** value. Retain `https://jocular-cupcake-480d95.netlify.app` and every other existing allowed origin. Do not replace an unseen allowlist with an assumed list.

If the current value contains only the supplied Netlify origin, the resulting minimal value is:

```text
CORS_ORIGINS=https://jocular-cupcake-480d95.netlify.app,http://localhost:8081
```

`http://127.0.0.1:8081` is optional and must be appended separately if that browser URL is used. Other ports/hostnames also require their own exact origins. No paths, trailing slashes or wildcards. Keep `EXPO_PUBLIC_API_URL=https://pimp-my-ride.onrender.com`.

**No Render configuration, deployment or other remote service was changed. The local code cannot make the live backend's CORS header appear; hosted-API access from localhost remains blocked until the owner applies the environment update and the service picks it up.**

## SignIn navigation cause and fix

`src/features/auth/screens/SplashScreen.js` dispatched an unconditional `navigation.replace('SignIn')` in an effect. Root authentication transitions replace the available routes and key the navigator by user/role route. Once the authenticated stack is active, SignIn is not registered, so an old splash replacement is invalid. The stack location in the warning identifies where the action was unhandled; the splash effect was the dispatch source.

The guest stack now starts directly at the existing SignIn route. The legacy Splash route remains registered for existing route references/saved state, and its screen re-exports the same SignIn component without dispatching any navigation action. No additional route, duplicate SignIn component, manual auth-state reset or authenticated SignIn workaround was introduced.

Authenticated role routing, per-account navigator keys, Firebase session restoration/claims checks, logout, existing route names/parameters and the animated startup overlay remain unchanged. No linking configuration was changed. Admin still restores into `AdminHome` and its Overview dashboard after account validation.

## Bounded connection recovery

The transport continues to coalesce concurrent health checks and cache successful health for 60 seconds. A failed health result is now shared for **5 seconds**, preventing fast CORS failures from causing repeated probes as polling screens and foreground events run. The next caller after that interval may check health again; there is no automatic retry timer or mutation replay.

Repeated identical development connection warnings are limited to one per **30 seconds**. A different origin, stage or failure reason can still be logged immediately. Production diagnostics remain disabled; credentials, payloads, query strings and raw provider errors are not added to these warnings. Existing request/upload timeouts and account-change checks remain unchanged.

## Files changed by this fix

- `src/navigation/AppNavigator.js`
- `src/features/auth/screens/SplashScreen.js`
- `src/shared/services/api.js`
- `tests/api.test.cjs`
- `tests/splash.test.cjs`
- `tests/session.test.cjs`
- `tests/password-recovery.test.cjs`
- `tests/verification-ui.test.cjs`
- `backend/test/security.test.cjs`
- `backend/test/ai-production-compatibility.test.cjs`
- `docs/LOCAL_CONNECTION_AND_AUTH.md`

The uncommitted Admin redesign and `.gitignore`, `app.json`, `eas.json`, Netlify/EAS configuration remain untouched by this fix. No dependencies or backend production source files were changed. Payments, quotations and private-media implementations were not edited.

## Verification

Runtime: the repository's existing portable Node **22.23.3**.

| Check | Result |
| --- | --- |
| Focused API/auth/navigation/session/Admin tests | **117 passed** |
| Full frontend suite | **523 passed** |
| Existing backend suite, including exact-origin CORS regression | **314 passed** |
| Expo Web export | **Passed** |
| Expo Android/Hermes export | **Passed** |
| Expo iOS/Hermes export | **Passed** |
| git diff --check | **Passed** |

The focused checks cover concurrent health failures, five-second cooldown/recovery, warning suppression, timeout/body-read behavior, opaque CORS/network classification, readable HTTP failures, HTTPS/token/account-change safeguards, verified Admin restoration/logout, all role routes, unverified-user restrictions, password recovery, legacy Splash alias behavior and Admin dashboard/navigation.

One existing backend preservation test compared the entire transport file to an older production commit. It was updated to allow this task's explicit health/diagnostic changes while still comparing URL/HTTPS configuration, fetch deadlines, authenticated operations and upload handling byte-for-byte with that baseline. AI production source, configuration, dependencies and security rules remain protected and unchanged.

Automated data fixtures use mocks or local Auth/Firestore emulators for the existing demo-pmr-security configuration; no production data writes were made. The live Render diagnosis used only public health GETs and unauthenticated OPTIONS preflights.

The in-app browser connector was unavailable. A headless Edge/emulator check was attempted, but the existing Expo process on port 8081 prevented its own isolated frontend from starting. It did not complete Admin end-to-end verification. The existing dev server was identified and left untouched; test browser/emulator processes were stopped. Browser sign-in, session restoration and logout against the hosted stack therefore remain manual follow-up after the CORS update.

Local evidence is in ignored .local-checks/api-origin-probes.json and .local-checks/connection-auth-*.log. Export artifacts are in .local-checks/connection-auth-export. These are validation artifacts, not deployments.

## Manual follow-up

1. When authorised, append the exact local Origin to Render's existing CORS variable, preserving Netlify and other entries. Allow the service to load that environment value.
2. From Expo Web at `http://localhost:8081`, use browser Network tools to confirm the actual health request receives the matching `Access-Control-Allow-Origin` header and that authenticated API preflight succeeds. Opening health directly in a browser tab is insufficient to verify CORS.
3. Verify approved customer, workshop and Admin accounts through sign-in, restored session and logout. Confirm Admin restores to Overview, every Admin link works, and no unhandled REPLACE action appears.
4. Recheck the deployed Netlify flow after any separately approved environment change. CORS is not authentication; unauthenticated API requests must remain rejected.
