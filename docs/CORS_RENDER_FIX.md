# Expo Web CORS repair

The live Render `/health` response was checked with `Origin: http://localhost:8081`:
HTTP 200, `Vary: Origin`, but no `Access-Control-Allow-Origin`. The middleware is
already before health, authentication, routes and error handlers. The production
configuration previously defaulted to an empty allowlist when `CORS_ORIGINS` was
unset. An empty or nonmatching Render override produces the same symptom; the
actual service environment was not accessible. Local `.env.local` values do not
configure Render.

The patch defaults production to `http://localhost:8081`. Development retains
`http://localhost:8081,http://127.0.0.1:8081`. An explicit comma-separated
`CORS_ORIGINS` replaces these defaults, and an empty value disables browser access.
Entries must be exact HTTP(S) origins, without paths, trailing slashes or wildcards.
For example, a future allowlist could be
`http://localhost:8081,https://web.example` (replace the example with the real site).
No cookie credentials or wildcard grants are enabled. Unknown origins receive no
CORS permission; CORS does not prevent clients from sending requests and never
replaces Firebase authentication or service role checks.

The existing global middleware handles OPTIONS before Firebase authentication,
allows Authorization and Content-Type, and covers GET, POST, PATCH and DELETE.
Allowed-origin errors retain CORS headers. Native clients without Origin continue
through the same authentication and permissions. No API server or proxy was added.

## Minimal deployment after separate approval

Remote `main` was fetched and verified as
`d242da9e808c971f989db1fa49a6778e270e618b` during this repair. The four patched
production/test/doc files have identical baseline contents on that revision and `lesley`.
`docs/patches/cors-render-main.patch` contains only configuration, regression tests,
and the relevant operations documentation. It also updates the existing AI
compatibility test to permit the tested CORS function change while preserving
byte comparisons for all other configuration. It contains no unrelated branch work.

1. Review that patch. In a clean checkout of current `main`, run
   `git apply --check <path-to-cors-render-main.patch>`, then apply it. If main has
   moved, inspect the diff and resolve only the CORS changes. Do not merge `lesley`.
2. With Node 22, run `npm ci --prefix backend` and `npm run test:backend`.
   Review and commit/push only after separate approval. No commit, push or
   deployment was performed while preparing this repair.
3. In the existing Render service, explicitly set
   `CORS_ORIGINS=http://localhost:8081` (append only approved deployed web origins).
   An existing empty or nonmatching override must be corrected even with the patch.
   Keep the existing Firebase credentials, role policies and storage configuration.
4. Deploy only the approved minimal commit from `main` to the existing service:
   root `backend`, build `npm ci`, start `npm start`, runtime Node 22,
   health path `/health`. Saving Render environment changes may trigger deployment;
   perform that step only with deployment approval.
5. Check `/health` with the allowed Origin and require
   `Access-Control-Allow-Origin: http://localhost:8081`. OPTIONS `/api/marketplace`
   with requested method POST and requested headers authorization,content-type
   must return 204 with the origin, method and headers allowed. A POST without a
   token must remain 401 with CORS headers. An unknown Origin must receive no
   allow-origin header. Verify an authenticated read in Expo Web and native clients.

Tests use mocked Firebase verification and the existing service fixtures; they do
not prove live account access or device behavior. The public Render response will
remain unchanged until an approved environment update/deployment.

## Validation

- Node v22.23.3: application suite 381/381 passed, including authentication and
  marketplace tests. Expo Web export succeeded to `.local-checks/cors-web-export`.
- Backend suite: 264/265 passed. The multipart photo HTTP test at
  `backend/test/http.test.cjs:62` fails with `read ECONNRESET`. A standalone run
  also failed, as did a run with the unchanged `origin/main` config loaded via a
  test-only preload. The Express app and HTTP tests already match main; this
  failure is reproducible without the CORS patch. Upload code was not changed.
- CORS regression cases passed: production localhost health, authenticated
  requests, preflight for existing route methods and both required headers,
  missing/invalid bearer tokens, permission denial, malformed JSON, missing
  routes, disallowed origins, no-Origin native requests, configurable deployed
  origins and empty/wildcard allowlist validation.
- The existing compatibility guard was updated only to allow the intentional
  `corsOrigins` change; all other configuration and backend comparisons remain.
- `git apply --check --cached docs/patches/cors-render-main.patch` succeeded
  against index files verified identical to current main. `git diff --check`
  passed. No commits, pushes, deployments or live authenticated mutations.
