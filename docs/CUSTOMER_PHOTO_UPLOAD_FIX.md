# Customer photo upload correction — 22 October 2026

Work is limited to the original project on `lesley`. No production upload, data change,
bucket/policy change, payment setting change, push or deployment was performed.

## Comparison and correction

| Path | Before | After |
| --- | --- | --- |
| Showcase | `uploadPostPhoto` → `uploadRequest` → XMLHttpRequest → `/api/posts/images` | Same transport and route |
| Vehicle | `uploadVehiclePhoto` → multipart fetch → `/api/photos/vehicles/:vehicleId/:slot` | Existing XMLHttpRequest upload helper |
| Request attachment | `uploadRequestPhoto` → multipart fetch → `/api/photos/requests/:vehicleId` | Existing XMLHttpRequest upload helper |

All send one `file` FormData part with the Firebase bearer token. Native parts contain
`{uri,name,type}`; web parts contain a Blob and filename. Content-Type stays unset so the
transport generates its multipart boundary. Customer uploads retain their original
`version` and `requestId` query parameters across ambiguous outcomes and manual retries.
There is no automatic retry of a write.

The vehicle picker already copies files to its cache and converts HEIC/HEIF to JPEG.
The showcase and request pickers share ImagePicker/JPEG resizing and conversion. No
confirmed MIME, URI, operation-name or ownership mismatch was found; those contracts
are preserved. This change does not attribute the problem to an Expo package update.

The shared XHR helper now preserves HTTP status and the server's explicit
`retryWithNewRequest` flag, rejects malformed success envelopes, checks account changes,
and enforces a 60-second JavaScript deadline as well as the native XHR timeout. Without
the retry flag, a safely closed customer upload could remain stuck on its old receipt.
Without envelope validation, malformed responses could be treated as acknowledgements.
Connection diagnostics contain only origin, stage and network/timeout classification.

Focused tests fail against the former implementation and pass after correction. They
simulate the reported fetch-only failure and verify that customer uploads take the
working XHR path. They also reproduce missing retry flags and invalid acknowledgements.
They do **not** establish the cause of the original iPhone networking failure.

## Backend, buckets and saved references

Read-only inspection of the connected PimpMyRide Supabase project confirmed all three
buckets: `vehicle-images`, `request-images`, `showcase-images`. Each is private, has a
5,242,880-byte limit and permits `image/jpeg`, `image/png`, `image/webp`. Local backend
defaults and `render.yaml` match those names. Live Render environment overrides were
not available for inspection.

The local Express implementation has both customer upload routes. It authenticates
the owner, validates the owned active vehicle, retry key, revision and actual image
bytes, then stores the bucket/path privately. Vehicle uploads update their photo slots;
request uploads create separate `purpose: request` assets attached through `photoIds`.
Neither workflow persists signed preview URLs. Authorised preview operations mint
60-second URLs from the saved original bucket. PMR-02 retention/leases are unchanged.

The read-only Render `/health` check returned HTTP 200 in approximately 0.4 seconds
from this computer. This proves reachability at that moment, not sustained iPhone
connectivity or the deployed customer-route version. The supplied Expo logs show
transport rejection/deadlines, not an Express status or evidence that no write occurred.
The 90-second health and 45-second JSON deadlines remain unchanged.

Render deployment metadata and Express access/restart logs were unavailable through
the connected tools. Supabase log queries also did not expose the requested storage
log tables. Whether the original failures reached Express, their timing relative to
restarts, and the cause of intermittent health/JSON timeouts remain unverified.

No backend source change is required by this client transport correction. Whether
Render additionally needs an update depends on its deployed commit and customer-route
availability; `/health` exposes neither. No deployment was attempted.

## Separate 409

`backend/marketplace.cjs` invokes `assertMockPaymentsEnabled` for exactly `quoteAccept`,
`paymentStart`, `paymentRetry`, `paymentMockResult`, and `paymentRecordInStore`.
`PaymentChoiceScreen.confirm` calls `quoteAccept` first, so checkout on Render stops
there with the quoted 409, before booking creation or a simulated payment result.
The supplied error alone does not distinguish those five operations for an arbitrary
request. Photo endpoints never call this gate. The guard remains unchanged and closed
in production, including for checkout's pay-in-store option.

## Changed files

- `src/features/marketplace/services/photoApi.js`: customer uploads reuse XHR.
- `src/shared/services/api.js`: bounded XHR completion, acknowledgement validation,
  account guards, retry decisions and safe connection diagnostics.
- `tests/photo-api.test.cjs`: existing retry/web/account contracts use the shared uploader.
- `tests/customer-photo-transport.test.cjs`: seven focused transport/recovery regressions.
- This document.

Physical iPhone customer uploads, live signed previews, deployed commit/environment and
historical Render logs remain unverified. A production upload was deliberately not used
for verification because the task prohibits production data changes.

## Verification

Node **22.23.3**: application suite **356 passed**, backend suite **239 passed**, focused
API/customer-transport suite **39 passed**, Auth/Firestore photo emulator suite **8 passed**;
zero failures. The emulator tests cover actual multipart customer routes, ownership,
private previews, separate request media, retries and retention without live storage.
`git diff --check` passed. Logs are in the ignored `.local-checks/customer-photo-*` files.
