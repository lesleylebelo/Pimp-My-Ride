# Private iPhone-to-local-backend preparation ? 21 October 2026

## Retired setup

The user ended local iPhone testing on 21 October 2026. This document is retained
as historical evidence. Its addresses, commands and approvals are no longer an
active development setup. Normal Expo development uses the Render API and the
ordinary app navigator. The gateway command-line entry is disabled; local upload
approval has been retired. See `NORMAL_DEVELOPMENT_RESTORED_20261021.md`.

## Historical verified state

The physical iPhone loaded the read-only Expo screen using the private API below.
The user-provided screenshot confirms **isolated customer metadata read passed**,
**photos 0**, **revision 0**, and **isolated session closed**. The password input
was cleared; no password or token was supplied in chat or recorded by the agent.
The approved Auth check requested no Firestore writes. The earlier project-loading
timeouts are no longer the active blocker; their exact network cause was not proven.

The existing Firebase test customer is authorized to read the designated BMW
through the corrected local backend. This verifies the private device connection
and the authenticated metadata path, not real Supabase uploads or image rendering.
The Supabase server credential separately passed read-only bucket metadata checks.
The gateway still blocks uploads, previews/signing and all other data mutations.
**The first controlled vehicle upload requires separate approval.**

| Service | Binding / address |
| --- | --- |
| Express, internal only | `127.0.0.1:3101` |
| Read-only device API | `http://192.168.137.1:3102` |
| Metro, internal only | `[::1]:8083` |
| Private Metro TCP bridge | `192.168.137.1:8081` |
| Expo Go project | `exp://192.168.137.1:8081` |
| Allowed iPhone | `192.168.137.237` |

`192.168.137.1` is the active Microsoft Wi-Fi Direct Virtual Adapter/hotspot
interface. The original shared Wi-Fi uplink remains `172.16.2.84` and is not a
listener for these services. Both gateway listeners accept only the specified
iPhone and laptop addresses; forwarding headers cannot change that decision.
The iPhone's earlier shared-network IP `172.16.2.138` is not allowed.

HTTP has now been verified for the authenticated Expo Go metadata check over this private connection. The current Expo Go
[Info.plist](https://github.com/expo/expo/blob/main/apps/expo-go/ios/Exponent/Supporting/Info.plist)
allows development HTTP and declares local-network access. Both iPhone Safari health and native Expo authenticated metadata transport passed.
No app ATS settings, TLS checks or production HTTPS requirements were weakened.
Use this connection only on the selected trusted private hotspot/network, not
the shared campus/work/guest network. No public tunnel or router forwarding was
created. No firewall rules were changed; iPhone Safari already reaches the API.

### Proposed firewall change — not applied

The current session is not a Windows administrator. The reviewed local script
`.local-checks/iphone-lan-20261021/allow-private-device.ps1` prepares exactly one
new inbound allow rule, named `PMR-DeviceReadOnly-192168137237`:

- Local address `192.168.137.1`; remote address `192.168.137.237` only.
- TCP local ports `8081` and `3102`; exact private hotspot interface
  `Local Area Connection* 4`; exact existing Node 22 executable path.
- Edge traversal blocked. All profiles are specified because the hotspot does
  not have a separate Private Windows profile; the exact interface/address/source
  restrictions prevent this rule opening the shared Wi-Fi uplink.
- Existing rules are never changed; the script stops if this named rule exists
  or the interface/address changed. No full-backend port is opened.

After explicit approval, run this script manually in Administrator PowerShell
from the `PimpMyRide` folder. Then retry iPhone Safari
`http://192.168.137.1:8081/status`, expecting `packager-status:running`, before
opening Expo Go again. This rule is proposed, not proof that firewall filtering
is the only cause. Do not disable the firewall or create a broad Node allow rule.
When testing ends, remove only this named rule after checking its identity.

## Safety verification

- Firebase project `pimp-my-ride-a26fc`; Supabase project
  `nymiyrzdpjctyembixbe`; offline checker passes every flag.
- Fresh read-only Auth and Firestore checks verified customer
  `aT6RWRl4AtQjtJKYIiD39eaR3x73` has the active owner role and shop
  `vsZYsbWkD4Urq2S5OmWEKUNs6rZ2` has the active approved shop role. Both
  are enabled, email-verified and have no admin claim. No custom tokens minted,
  sign-ins performed or user records modified by these checks.
- The designated BMW `78gG6bPHbGvCTOCuZAwR` is active, belongs to the customer,
  and still has empty slot 1 at photo revision 0.
- Using the configured backend Supabase credential, GET bucket metadata confirmed
  all three media buckets private, 5,242,880-byte limit, JPEG/PNG/WebP only.
  No objects or the verification bucket were accessed.
- Existing HTTP middleware verifies Firebase tokens with revocation checking.
  Actor checks require an enabled verified user, active Firestore role, token
  verification claims and valid authentication time. Vehicle ownership is checked
  before metadata or upload access; uploads recheck ownership/revision in their
  transaction. PMR-02 retains published attachment references and existing media.
- Quotation acceptance, including pay-in-store, and all mock payment mutations
  require the existing local-demo payment gate before mutation/receipt work.
  The real project cannot meet its `demo-pmr-security` requirement. The focused
  gate test verifies fail-closed behavior and unchanged mock database state.
- `server.cjs`, `app.cjs`, `marketplace.cjs` and `mock-payment-gate.cjs` match
  the pre-task source checkpoints. No production route or authorization was changed.

## Exposed and blocked routes

The development-only `backend/device-readonly-gateway.cjs` permits exactly:

1. GET `/health`, forwarded to local Express; successful JSON adds
   `"mode":"device-read-only"`.
2. POST `/api/photos` with exactly
   `{"op":"list","target":"vehicle","id":"78gG6bPHbGvCTOCuZAwR"}` and an
   existing Firebase bearer token. Express independently verifies the token and
   ownership. This operation reads metadata without an audit write.

Every other route/op is blocked before forwarding, including `/api/admin`,
`/api/profile`, `/api/session`, document/verification routes, marketplace
mutations, payments, quotation acceptance, every upload, photo removal and image
preview/signing. Preview signing for vehicle/request images is specifically
excluded because it creates `photos.viewed` audit records. No demo/debug routes
are exposed. The Metro bridge forwards only to the loopback development Metro;
it does not expose Express or an arbitrary proxy destination.

The upstream full backend remains on loopback. The gateway has no upload mode,
no automatic retry and no mechanism to enable writes by changing an environment
flag. All request bodies are bounded; metadata is rebuilt from fixed fields;
cookies and forwarded headers are not relayed. No tokens or request bodies are
logged by this gateway.

## Expo preparation and completed device check

Root ignored `.env.local`, separate from `backend/.env.local`, now contains:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.137.1:3102
EXPO_PUBLIC_PMR_DEVICE_READ_ONLY=true
```

Server credentials were not copied. Both env files and the credential path are
Git-ignored and untracked. The root `App.js` test switch is development-only,
requires a private LAN origin on port 3102, and mounts a diagnostic screen instead
of AuthProvider, PresenceTracker and ordinary navigation. It reuses the existing
persisted Auth session; it does not sign in, sign out or start session writes.

An additional isolated customer sign-in/read/logout path is prepared and tested,
and is **now explicitly approved and enabled**. It requires the separate
`EXPO_PUBLIC_PMR_DEVICE_TEST_SIGN_IN=true` switch and the fixed designated customer
email configured privately in the ignored Expo file. The email is not editable
on the device. Only the expected customer UID may perform the metadata read;
an admin/different UID is rejected. The password is entered only on the device,
cleared from UI state immediately, never logged or saved. The Auth client is
memory-only and closes in `finally`. No ordinary AuthProvider/presence is mounted.
The user approved existing Firebase test-account sign-in activity (which updates
Auth login metadata) while preserving the no-Firestore-write restriction.
Do not enter credentials in chat or expand this approval to another account or
operation.

Metro was restarted with the new configuration and the old cache cleared. It now
runs on `--localhost --port 8083`, with the installed Expo CLI's existing
`EXPO_PACKAGER_PROXY_URL=http://192.168.137.1:8081` support advertising the private
bridge. The inspected manifest advertises that address and bundle origin. The
iOS bundle compiles successfully and contains the private API and diagnostic
screen. No dependency or Expo runtime was upgraded.

On the iPhone:

1. Keep the trusted private hotspot connection and address `192.168.137.237`.
2. Completed: open `http://192.168.137.1:3102/health` in Safari. Expected JSON:
   `{"ok":true,"mode":"device-read-only"}`.
3. Fully reload/open `exp://192.168.137.1:8081` in Expo Go. Confirm the heading
   **Read-only device connectivity** and API `http://192.168.137.1:3102`.
4. With the existing customer session, tap **Check authenticated metadata**.
   Expected: metadata read passed, photos 0, revision 0. The existing shop session
   should be denied access to this customer's private Garage. Do not use admin.
5. Completed: the separately approved isolated customer sign-in/read/logout check
   passed with photos 0, revision 0. No ordinary app or presence was started.
   Do not upload, request previews or disable the read-only gateway. Never supply
   passwords or tokens in chat.

The Metro restart alone cannot establish that the phone reloaded the bundle;
the screen and displayed API address are the required device confirmation.

## First controlled vehicle test — not approved or enabled

The original three-image budget remains one object in each of `vehicle-images`,
`request-images` and `showcase-images`, plus the exact request/showcase records
and audit/receipt/ledger effects in `REAL_MEDIA_TEST_PLAN_20261019.json`.
This setup has not expanded or approved that scope.

After the authenticated device check passes, request explicit approval for V1
only (or the full reviewed plan if desired):

- Existing customer, BMW and empty slot 1 only. Re-read owner/active state and
  photo revision immediately before the test; stop if anything changed.
- Use the reviewed synthetic PNG, 92 bytes, SHA-256
  `7791330cf1138b83d7acee0022af9ecf7607bd7e25f38451c4f02f4e4c8dda09`.
  The ignored local fixture `.local-checks/existing-infra-20261018-01/synthetic-media.png`
  matches both the reviewed hash and byte count. Transfer only this fixture to
  the iPhone after approval; do not substitute a real customer photo or add an
  HEIC trial to the object budget silently.
- POST `/api/photos/vehicles/78gG6bPHbGvCTOCuZAwR/1?version=0&requestId=pmr_media_20261019_01_vehicle`
  with one `file` part and the existing customer session token.
- Create exactly one new immutable object under
  `vehicle-images/photos/aT6RWRl4AtQjtJKYIiD39eaR3x73/78gG6bPHbGvCTOCuZAwR/`
  with server UUID suffix, one photo asset and upload ledger, one vehicle
  photo-fields update and upload audit. Never overwrite/delete another object.
- After separate approval, enable only the reviewed test operations in a newly
  reviewed restricted device path; this gateway currently blocks the endpoint.
  Upload access must not be enabled by exposing the full backend or merely
  disabling the read-only UI flag.
- Verify persisted bucket/path and authorized display, budgeting any signed
  preview audit writes in the approval. If acknowledgement is lost, stop and
  refresh metadata; no blind retry or automatic cleanup.

## Validation and services

- Device gateway/screen and local config tests: **11 passed**.
- Backend HTTP/photo/storage tests: **42 passed** using mocks/local test HTTP.
- Focused mock-payment/quotation acceptance fail-closed test: **1 passed**.
- Offline checker: **ready=true**.
- Existing Firebase test identities/vehicle and Supabase bucket metadata:
  **real read-only checks passed**.
- iPhone Safari health: **passed, user-confirmed**.
- iPhone Expo Go project loading: **passed; diagnostic screen confirmed by screenshot**.
- iPhone authenticated metadata: **passed; isolated customer, photos 0, revision 0, session closed**.
- Real uploads, emulator integration and physical-device image rendering:
  **not run in this task**.

Running service PIDs and masked read-only evidence are in ignored
`.local-checks/iphone-lan-20261021/`. Stop only the recorded backend/gateway/Metro
processes when this test session ends, after verifying their identities. No public
tunnel, firewall changes, uploads, Firestore writes, policies, commits, pushes or
deployments were performed by this setup.
