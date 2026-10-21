# iPhone vehicle-upload connection diagnosis — 21 October 2026

## Findings and remaining uncertainty

The iPhone is running Expo Go and calling `https://pimp-my-ride.onrender.com`.
The user confirmed Safari on that same phone/network returns `{"ok":true}` from
`/health`. This rules out a persistent inability of that phone to reach the host
over HTTPS; it does not establish that Expo Go's authenticated multipart request
works. The exact native/network cause of the failed upload remains unconfirmed.
The failure was not reproduced with a real upload because uploads and production
data writes remain unapproved. Do not attribute it to Supabase or TLS without
additional evidence.

Read-only HTTPS probes from the development computer returned:

| Probe | Result |
| --- | --- |
| GET `/health` | 200, `{"ok":true}` |
| HEAD `/health` | 200 |
| OPTIONS `/api/photos/vehicles/78gG6bPHbGvCTOCuZAwR/1` | 204 |
| GET `/api/posts`, no credentials | 401, JSON authentication error |

TLS certificate verification remained enabled. Initial sandbox network checks
could not connect; the authorised network-enabled checks above succeeded.
OPTIONS is handled globally by CORS and is not proof that an upload handler is
deployed. A proposed empty unauthenticated POST was rejected by automatic
approval review because it targeted production upload functionality. It was
not executed or retried. No tokens, multipart bodies or media were sent.

The logged `stage:upload, reason:network` means fetch rejected while attempting
the multipart operation; it is not an HTTP error response. The health gate had
previously passed or reused its success for up to 60 seconds. It does not show
whether the server received the body, committed anything before disconnecting,
or whether native file-body construction failed before transmission. Do not
infer that a failed acknowledgement means nothing was saved.

## API destination and deployed version

Root `.env` sets `EXPO_PUBLIC_API_URL` to Render. No root development override or
shell override was observed. `src/shared/services/api.js` uses that variable.
`backend/.env.local` is server-only and does not alter Expo's API address.
The prepared local backend was not listening on port 3101 at inspection time;
it was not started. Its guarded launcher requires `HOST=127.0.0.1`.

This is the production host, not the newly prepared local media-test backend.
The offline local checker passes all flags, but it does not authenticate remote
credentials. The live Render deployment's commit and bucket overrides remain
unknown: `/health` exposes neither. Local `render.yaml` specifies the new private
buckets, but that file is not evidence of live deployment. No Render configuration
was changed, and the consolidated backend was not deployed.

Read-only follow-up in Render Dashboard: inspect the active deployment commit,
its source version of `backend/server.cjs`, `backend/config.cjs`, `backend/storage.cjs`
and its nonsecret media bucket variable names/values. Do not copy API keys or
service-account JSON. Correlate existing request/restart logs with the original
failure time; report request presence, status, native error code and restart
timing only. No new production upload is needed to inspect existing logs.

## Request construction and HEIC

`photoApi.js` uploads to POST
`/api/photos/vehicles/:vehicleId/:slot?version=...&requestId=...`.
It sends one FormData `file` part with native `{uri,name,type}` from a local
`file://` or `content://` URI, with the Firebase bearer token. It deliberately
leaves Content-Type unset so native fetch supplies the multipart boundary.
The picker requests a cache copy. These contracts pass mocked tests, but native
serialization and accessibility of the original selected file on this iPhone
have not been reproduced.

HEIC/HEIF is accepted for selection and converted on-device to JPEG by
`preparePhoto` before upload, using `expo-image-manipulator`. The resulting MIME,
filename, actual converted byte count and 5 MiB bound are checked. JPEG, PNG and
WebP are accepted directly. Private buckets must continue to reject HEIC bytes;
no bucket MIME change is needed. Physical-device conversion remains unverified.
See [Expo ImageManipulator](https://docs.expo.dev/versions/latest/sdk/imagemanipulator/).

## Small local corrections

- `src/features/marketplace/components/PhotoGallery.js`: reserve “Checking saved
  status…” for an active read; show “Saving photo…” during mutation and “Saved
  status unavailable. Refresh photos before retrying.” after an uncertain failure.
  A failed upload retains the selection, does not report success and keeps edits
  blocked until a successful manual metadata refresh.
- `src/shared/services/api.js`: keep the existing 90-second health, 45-second
  request and 60-second upload deadlines active through response-body reading.
  Race the operation against the deadline so a native fetch/body promise that
  does not settle on abort cannot leave the caller pending forever. Do not retry
  any mutation automatically.
- `tests/api.test.cjs`: cover stalled health and response-body reads, native
  multipart boundary handling, safe timeout classification and no false success.
- `tests/marketplace-photos.test.cjs`: reproduce the misleading stale-state label
  and verify failed refreshes release the checking state while retaining edit locks.

The former label was displayed for `error || !fresh` indefinitely even when no
network read was active. That reproduced the screenshot's pending appearance.
The former fetch timeout was cleared at response headers, before `response.text()`;
the stalled-body test reproduced a separate genuine unbounded wait. Neither
finding establishes the native cause of the original network rejection.

No backend production source, environment values, authorization, PMR-02 retention,
storage privacy or payment gates were changed in this diagnosis. Six protected
payment/demo source hashes still match the prerequisite checkpoint.

## Tests and safe iPhone retest

Focused application tests cover API transport, gallery state, retry identity,
HEIC conversion, media/feed regressions and offline configuration. Backend unit
tests cover photos and private storage using mocked services. **Application:
57/57 passed; backend unit: 31/31 passed; offline configuration: ready=true.**
Firebase-emulator
integration was not completed: its safety guard rejected execution without
configured Auth/Firestore emulators. No real Firebase or Supabase tests ran.

1. Completed: on the iPhone, open the exact Render `/health` URL in Safari and
   confirm the JSON result independently of Metro.
2. To inspect the local UI changes in Expo Go, fully reload the JavaScript bundle
   from this checkout. Do this as part of the next approved live-backed app test;
   opening the signed-in app can itself send presence/session writes. On a failure,
   the modal should retain the photo and never report success; after Cancel the
   gallery must show unavailable saved status, not perpetual checking.
3. Before testing the new local media backend on the phone, approve a device
   connection scope. A narrow option is an HTTPS tunnel to the unchanged loopback
   API at `http://127.0.0.1:3101`, with existing Firebase authorization preserved.
   The tunnel and server were not started or installed here. Its exact assigned
   origin must first return `{"ok":true}` in iPhone Safari.
4. Only after that scope is approved, put the approved tunnel origin in the root
   ignored `.env.local` as `EXPO_PUBLIC_API_URL=https://<approved-api-origin>`.
   Never copy backend secrets into that file. Restart Metro with
   `npx expo start --clear` from `PimpMyRide` and fully reload Expo Go. This command
   was not executed here. Verify the app's API origin before any upload.
   An Expo/Metro tunnel does not expose the separate Express API, and
   `127.0.0.1` on the iPhone refers to the phone rather than the computer.
5. After separate approval of the existing three-image test plan, use the
   designated customer, BMW M4 and empty slot 1. Re-read slot/revision first.
   Begin with a small JPEG/PNG, then check an HEIC conversion if separately
   included in the approved object count. Never silently expand the three-object
   plan. Record whether failure is immediate or reaches the 60-second upload
   deadline. Capture only stage/origin/reason and a redacted native error code.
6. If an acknowledgement is lost, cancel the modal, manually refresh saved status
   and preserve the existing retry identifier/revision. Do not select replacement
   files or repeatedly upload to production to investigate.

The smallest safe next connectivity correction for the new media test is an
explicitly approved phone-reachable endpoint for the prepared local backend,
not a production deployment. This is a test-environment correction, not proof
that the original Expo-to-Render multipart fault is fixed.

Expo inlines EXPO_PUBLIC variables into its bundle; full reload is needed to see
updated values: [Expo environment variables](https://docs.expo.dev/guides/environment-variables/).
Native React Native requests are not governed by browser CORS:
[React Native networking](https://reactnative.dev/docs/network).
