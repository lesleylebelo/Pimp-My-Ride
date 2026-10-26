# Production API configuration repair — 25 October 2026

## A. Confirmed cause

`src/shared/services/api.js` produces the exact setup error in `baseURL()` when
`process.env.EXPO_PUBLIC_API_URL` resolves to an empty value. It is a plain Error,
with no error code. This happens before `/health`, token retrieval or API fetch.
The source already uses Expo's supported static dot notation. Changing it or
adding a hardcoded runtime fallback would conceal the defective release artifact.

The deployed transport contains `const r=''.replace(/\/$/,'')`. The Render URL
appears once elsewhere, in the separate local-demo configuration module. A search
for that string therefore passes while every real transport call fails.

The shared POST/REST transport feeds Customer and Workshop marketplace/Discover
and Admin services. Their error presenters propagate this message; they do not
convert network, CORS or health errors into a configuration error.

The served bundle is byte-identical to the earlier verification export generated
with dotenv disabled. That earlier verification failed to exercise compiled
configuration. The later ordinary export also retained these same bytes. The
exact sequence of cache reuse versus file selection is not observable after the
fact; the confirmed defect is that the deployed transport was compiled without
its API URL. A cache-cleared export with `.env` enabled fixes it without changing
application source.

## B. Evidence

Read-only public checks of both the production hostname and deployment
`6add4ac68f430c816f3f4a30` found HTML referencing:

`/_expo/static/js/web/AppEntry-9cfbe1ab9c6cd5bad1906338e5d5224c.js`

Both JS responses were HTTP 200, `application/javascript; charset=UTF-8`,
2,801,966 bytes; SHA-256:

`122c4bfa2f1f3b564b4c3da50b19e373d64ac8ae3a63066d4b8667ec68b6ec85`

The referenced asset exists and is JavaScript, rather than an HTML SPA fallback.
Both HTML and JS had `public,max-age=0,must-revalidate`. A fresh isolated browser
also loaded that same production asset and found zero service-worker
registrations. The bad artifact is served by the site itself; this is not merely
an old asset retained in one user's browser.

Executing only its actual Metro API factory with isolated synthetic auth/fetch
mocks reproduces the setup exception before any mocked request. No app bootstrap,
production account or production data is used in this test.

The corrected local `dist/index.html` references:

`/_expo/static/js/web/AppEntry-1ee63fb3f7b12e2340aeb1a54ee17070.js`

SHA-256: `334ef410108e6ecb89284879aacb540245e53cb51fe6aa9b38ea39297c499748`.
Executing that transport with an empty runtime `process.env` constructs:

- `GET https://pimp-my-ride.onrender.com/health` without authentication headers.
- Authenticated `POST https://pimp-my-ride.onrender.com/api/admin`.
- Authenticated `POST https://pimp-my-ride.onrender.com/api/marketplace`.
- Authenticated `GET https://pimp-my-ride.onrender.com/api/posts`.

These requests are intercepted by release-check mocks; none is sent to production.
An unauthenticated call is also rejected before any request.

Public `/health` probes with the exact Netlify and localhost:8081 Origins returned
HTTP 200, `{"ok":true}`, and the corresponding matching
`Access-Control-Allow-Origin` headers. No further Render CORS update is indicated.
This proves public health/CORS availability at probe time, not authenticated
business operations or storage readiness.

## C. Changes

- `scripts/build-web.cjs`: load the existing Expo dotenv configuration, validate
  the existing production endpoint and disabled-demo settings, export with
  Metro `--clear`, then fail the build if the produced transport does not work.
- `scripts/verify-web-export.cjs`: follow HTML's actual script references, reject
  missing/HTML assets, extract the actual shared Metro module, and execute its
  POST/REST/authentication paths using isolated mocks. A decoy URL elsewhere in
  the bundle cannot satisfy this check. Output contains only paths and hashes.
- `package.json`: `build:web` and `verify:web` scripts. No dependencies changed.
- `tests/production-api-export.test.cjs`: real installed Expo production env
  transformation, correct/missing/wrong endpoints, misleading decoy strings,
  release preflight, and missing/SPA-fallback/stale assets.
- `tests/api.test.cjs`: explicit missing-config versus network classification,
  and unauthenticated no-request checks. Existing coverage exercises health
  failures, cooldown/recovery, HTTP errors, token safety and timeouts.
- `tests/api-error-presentation.test.cjs`: Customer/Workshop error presentation
  and recovery, plus Admin configuration/connectivity/auth distinctions.
- This report. Application UI, auth/navigation, backend, EAS and Netlify
  configuration are unchanged.

## D. Verification and limits

The focused configuration/connectivity/presentation tests pass: 37/37.
The full frontend suite passes: 533/533, including existing authentication,
conditional navigation, logout/session restoration and Admin coverage.
The production web export completed and the actual exported transport passed.
`git diff --check` passes. Backend tests were not rerun for this build-only fix:
no backend or shared application transport source changed.

An isolated headless Edge browser opened the corrected exported app on port 8097,
rendered Sign in, loaded the corrected script, and reported no runtime exceptions.
The in-app browser was unavailable. A browser fetch of the public Render health
endpoint from Netlify timed out at 30 seconds in that check; this result does not
establish a CORS failure and is distinct from the verified empty-URL defect.
Header-level HTTP probes succeeded as described above. Live authenticated role
workflows remain manual; no production accounts were used for automation.

## E. Infrastructure impact

No Render or Netlify remote configuration has been changed. No deployment was
performed. The existing production site still serves the defective artifact
until a separately authorized release uploads the corrected output.

For an existing CLI upload of `dist`, Netlify environment settings cannot repair
JavaScript already built on the local computer. The effective build environment
must contain the correct public URL. A Netlify-hosted build, if used later, must
likewise receive the existing public variables and use the guarded build command;
no such hosting change is required for the current local-build/CLI workflow.

## F. Exact PowerShell release procedure (not executed)

Use the existing Node 22 installation and the already-used Netlify CLI. The
`--no-install` command fails if the CLI is unavailable rather than installing a
new dependency. Do not run the deploy block until the release is authorized.

```powershell
Set-Location 'C:\Users\Mo\OneDrive\Documents\Business Information Technology\2026\Semester Two\DSW02B1\React Native Project\Pimp My Ride\PimpMyRide'
$env:PATH = (Join-Path (Get-Location) '.local-checks\pmr-tools\node22\node-v22.23.3-win-x64') + ';' + $env:PATH
if ((git branch --show-current) -ne 'lesley') { throw 'Expected original repository on lesley' }

# Session-only settings; keep the existing .env Firebase values.
Remove-Item Env:EXPO_NO_DOTENV -ErrorAction SilentlyContinue
Remove-Item Env:EXPO_NO_CLIENT_ENV_VARS -ErrorAction SilentlyContinue
$env:EXPO_PUBLIC_PMR_LOCAL_DEMO = 'false'
$env:EXPO_PUBLIC_API_URL = 'https://pimp-my-ride.onrender.com'
npm.cmd run build:web
if ($LASTEXITCODE -ne 0) { throw 'Build or runtime endpoint verification failed; do not deploy' }
npm.cmd run verify:web
if ($LASTEXITCODE -ne 0) { throw 'Export verification failed; do not deploy' }
```

Only after release authorization, upload that same verified `dist` to the
existing site. This does not create or link another site:

```powershell
npx.cmd --no-install netlify deploy --prod --dir .\dist --site 887d1819-c17e-4056-af4f-70f364d8d238 --no-build
if ($LASTEXITCODE -ne 0) { throw 'Netlify deploy failed' }
```

The `--no-build` flag preserves the already verified output; see the
[Netlify CLI deploy reference](https://cli.netlify.com/commands/deploy/).

Do not rebuild with a different command between verification and upload. Do not
use the older `.local-checks/connection-auth-export` output as a release artifact.

## G. Manual checks after an authorized release

1. In DevTools Network, disable cache and reload Netlify. Confirm HTML references
   the newly verified AppEntry filename, its response is JavaScript, and the
   previous `9cfbe...` file is no longer the entry asset. Re-run `verify:web` if
   building again; filenames/hashes may change with future source edits.
2. Use approved Customer and Workshop accounts separately. Open Discover and the
   relevant dashboard. Confirm Render `/health` then authenticated API requests
   appear; there must be no missing-setup error. Inspect failed requests directly
   if any remain; a browser fetch rejection alone cannot identify CORS.
3. Use an approved Admin account. Confirm Overview loads, refresh to restore the
   session, visit Accounts and another Admin section, then sign out. Confirm
   SignIn opens without an unhandled REPLACE warning. Sign into another role to
   verify account switching and absence of stale Admin data.
4. Test offline then reconnect. Confirm a connectivity message rather than a
   configuration message and recovery on refresh after the health cooldown.
   Avoid mutations, private media, payments or quotations during these checks.
