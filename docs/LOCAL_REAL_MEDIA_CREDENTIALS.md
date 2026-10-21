# Secure local backend credentials

These instructions configure only the existing projects:
Supabase `nymiyrzdpjctyembixbe`, Firebase `pimp-my-ride-a26fc`.
**Do not start the server or perform uploads until the live test scope is approved.**
The ignored `backend/.env.local` has been prepared with the nonsecret settings
below. No credential values were written by the agent. The latest offline check
passes project IDs, bucket names, Node 22, loopback binding and safety settings;
the Supabase server key and Firebase service-account credential remain missing.
Enter existing credentials privately as described below, then rerun the checker.

Read-only Storage metadata inspection on 19 October 2026 confirmed all three
media buckets are private, limited to 5,242,880 bytes and allow only
`image/jpeg`, `image/png`, `image/webp`. No bucket settings, objects or policies
were changed. This does not authenticate the local backend's credentials.

The checker now validates routing independently of a missing key and rejects
emulator variables even when empty. All three focused configuration tests pass.
Protected payment/demo source hashes match the prerequisite checkpoint, and an
offline assertion confirms mock payments reject the real Firebase project even
with the enable flag set. No server was started or upload performed.

## Files and values

From the original `PimpMyRide` directory, check that local files are ignored:

```powershell
git check-ignore -v backend/.env.local .local-checks/credentials/firebase-service-account.json
```

Both paths were verified ignored. Do not edit the root Expo `.env` to contain
server credentials. Do not run commands that print environment files/variables.
Open `backend/.env.local` in your local editor (create it if absent; never overwrite
an existing credential file). Use this nonsecret configuration:

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=3101
CORS_ORIGINS=http://localhost:8081,http://127.0.0.1:8081
FIREBASE_PROJECT_ID=pimp-my-ride-a26fc
GOOGLE_APPLICATION_CREDENTIALS=../.local-checks/credentials/firebase-service-account.json
SUPABASE_URL=https://nymiyrzdpjctyembixbe.supabase.co
SUPABASE_BUCKET=verification
SUPABASE_PHOTO_BUCKET=vehicle-images
SUPABASE_POSTS_BUCKET=showcase-images
SUPABASE_REQUEST_BUCKET=request-images
SUPABASE_LEGACY_PHOTO_BUCKET=marketplace-photos
SUPABASE_LEGACY_POSTS_BUCKET=public-posts
PMR_MOCK_PAYMENTS_ENABLED=false
SUPABASE_SECRET_KEY=
```

Fill `SUPABASE_SECRET_KEY` privately in that editor with the **existing approved
server secret key** (`sb_secret_...`) or legacy `service_role` key for this project.
A publishable/anon key is unsuitable for this server's private Storage operations.
Do not paste the value in chat, shell commands, screenshots, tracked files or Expo
variables. Do not generate new keys as part of this preparation.

Put an existing approved Firebase service-account JSON for `pimp-my-ride-a26fc`
at the ignored path above, or set `GOOGLE_APPLICATION_CREDENTIALS` to its existing
absolute path. Never copy its JSON into a report. It must be an appropriate
server account for this project's Auth verification/reads and scoped test-data
writes after approval. Reusing the assistant's Firebase CLI session is not the
same as configuring the Express server credential. Do not create service accounts,
keys or IAM bindings under this scope.

Use **one** Firebase credential source. The server prioritises
`FIREBASE_SERVICE_ACCOUNT_JSON` over `GOOGLE_APPLICATION_CREDENTIALS`; leave the
inline variable unset when using a file. Omit emulator variables completely:
setting `FIRESTORE_EMULATOR_HOST=` to an empty string is not the same as omitting
it for server startup. Do not enable `PMR_LOCAL_DEMO` or mock payments. Confirm
historical bucket overrides before changing legacy values; no old media migrates.

## Offline validation - safe before upload approval

Node 22 is required. Using the existing local runtime, run from `PimpMyRide`:

```powershell
$pmrNode = (Resolve-Path '.\.local-checks\pmr-tools\node22\node-v22.23.3-win-x64\node.exe').Path
Push-Location backend
try {
    & $pmrNode check-local-config.cjs
} finally {
    Pop-Location
}
```

Or, when Node 22 is already on PATH: `npm --prefix backend run check:local-config`.
The checker reads `backend/.env.local` with Node's environment parser. It reports
only boolean configuration checks, key type and readiness; it creates no SDK
clients, contacts no services, starts no server and writes no remote data. It
rejects wrong project IDs, public keys, wrong-project service accounts, nonlocal
binding, missing settings, emulator/demo settings and enabled mock payments.
This is a format/project check, not proof that keys are valid, unrevoked or have
working remote permissions. Those need separately scoped read-only checks once
credentials exist. Existing shell variables override env-file values, matching
Node `--env-file`; correct stale variables privately if a flag fails.

## Start only after live-test approval

Do not execute this during prerequisite preparation:

```powershell
Push-Location backend
try {
    & $pmrNode --env-file=.env.local local-server.cjs
} finally {
    Pop-Location
}
```

Equivalent with Node 22 on PATH: `npm --prefix backend run start:local`.
The new launcher runs the same offline check before importing the existing server.
The Node flag loads the ignored file (the old `npm start` alone did not load it).
`HOST=127.0.0.1` now binds the API only to loopback. The production `npm start`
command and its default `0.0.0.0` binding remain unchanged.

After approval, desktop Expo must target `http://127.0.0.1:3101` using a
nonsecret development `EXPO_PUBLIC_API_URL` override, then restart Expo. Do not
silently keep the older Render URL. Do not expose any server credential to Expo.
A physical phone cannot use desktop loopback; remote-device access is a separate
reviewed test setup. Starting a live-backed Expo app may cause session/presence
writes, so it is also excluded until test approval.
