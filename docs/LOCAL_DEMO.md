# Safe synthetic local demo

Use the isolated `feature/mock-payments` worktree, the disposable `integration/consolidated-local` candidate, or the original `lesley` checkout only after separately approved promotion. No production configuration, real customers, real media, SMTP or payment provider is used. This mode is disabled by default and throws in a production build. Restart Expo when changing hosts; never publish a demo bundle.

Prerequisites: prepared Node **22.23.3**, existing root/backend dependencies, Firebase CLI dependency, Java 21+ (local Java 25 is available), cached Firestore emulator, trusted private Wi-Fi. No package or cloud installation is needed. Use a compatible Expo/native runtime; physical-device acceptance is still required.

## Architecture and isolation

- Backend Admin SDK: `demo-pmr-security`, Auth `127.0.0.1:9099`, Firestore `127.0.0.1:8080`.
- Client: Auth proxy `HOST:19099`, Firestore proxy `HOST:18080`, Express `http://HOST:3000`.
- Gateway binds only the explicit loopback/private interface and accepts only listed source IPs. Emulator ports remain loopback-only. No tunnels, public DNS, router forwarding or public firewall exposure.
- Auth uses an HTTP proxy; Firestore uses transparent TCP forwarding so both HTTP/WebChannel and HTTP/2 SDK transports work. These gateways do not add Firebase authorisation; emulator rules still apply.
- Production entry point refuses the demo flag. Dedicated entry point rejects Supabase/Google credentials, non-demo projects, non-loopback backend emulator settings, disabled mock payments and missing fixture-storage opt-in.
- The unchanged server mock gate remains authoritative. Client cannot enable it.
- Normal and isolated client Auth use separate demo apps/memory persistence; emulator routing precedes operations. Readiness must succeed before auth listeners attach. Emulator outages never trigger production fallback.
- Storage is in memory. Only a known synthetic PNG is accepted, paths remain scoped, private links expire, public-post storage has no remove operation. Restarting the backend clears media; no Supabase connection exists.
- **All demo uploads substitute the synthetic PNG before sending. Selected personal files are not uploaded.** This validates connectivity/contracts, not image quality or photo-picker behavior.

## Start: three terminals in this worktree

Use the same target options in all terminals. Default is host machine / iOS Simulator:

If Windows blocks this unsigned local helper, open a process-only session with `powershell -NoProfile -ExecutionPolicy Bypass`, then run the commands below there. This does not change the machine or user execution policy. Do not bypass an organisation-enforced policy.

```powershell
. ./scripts/local-demo-env.ps1 -Target host
node --version
```

Android Emulator uses `-Target android` (client host `10.0.2.2`; backend remains on loopback).

Physical phone: find the computer's trusted private Wi-Fi IPv4 and the phone's IPv4. Example values below must be replaced with actual addresses:

```powershell
. ./scripts/local-demo-env.ps1 -Target device -ComputerIP 192.168.1.10 -DeviceIP 192.168.1.20
```

Allow only the selected trusted private network/device through the OS firewall for TCP 3000, 18080, 19099 and Expo's development port 8081. Do not open 8080/9099 externally. No firewall changes are automated. Device IP changes require updating the allowlist and restarting. All allowed emulator clients can administer disposable emulator data: never use an untrusted LAN.

Terminal 1, after environment setup:

```powershell
node node_modules/firebase-tools/lib/bin/firebase.js emulators:start --only auth,firestore --project demo-pmr-security --config firebase.demo.json
```

Terminal 2, after identical environment setup:

```powershell
node backend/local-demo.cjs --seed
```

Startup refuses unavailable emulators. `--seed` creates only fixed synthetic `demo-owner@example.invalid` and `demo-shop@example.invalid` emulator accounts plus a test category. Fresh account passwords are randomly generated and printed locally at creation; do not reuse them elsewhere or put them in source. The shop is verified/approved, and both email addresses are verified. Existing accounts/records are preserved; keep the initial console credentials while those emulators run. No real email is sent. Without `--seed`, existing emulator users can be reused.

Terminal 3, after identical environment setup:

```powershell
node node_modules/expo/bin/cli start --offline --port 8081
```

Expo's offline option already selects LAN hosting; do not combine `--offline` with `--lan`. The helper sets `EXPO_NO_DOTENV=1` so an existing production `.env` is not loaded. Do not use `npm start` for the backend demo. Do not start a physical-device session automatically. On a phone scan only the private LAN Expo session after manually approving firewall access. For host web testing, use Expo's web option in the running terminal.

Keep Metro on port 8081 (the explicit web CORS allowlist). If that port is occupied, inspect your own existing development session rather than accepting an arbitrary alternate port. Device mode advertises the explicitly supplied computer IP for Metro as well as the API.

## Manual customer/shop journey

Use separate app sessions/devices (or sign out and switch accounts). Customer: add a synthetic vehicle, create a request in Body kit/Johannesburg, optionally attach synthetic uploaded photos. Shop: open request, quote with none/percentage/fixed deposit. Customer: compare and accept current terms, choose eligible payment method, simulate success/failure. Shop: confirm appointment only when eligible. Customer/shop: inspect booking, settle remaining balance, complete or cancel; inspect simulated receipts, notifications and local test-email outbox. No real payment or email occurs. Verify appointment confirmation survives balance settlement and cancellation blocks further payment.

Create/replace/remove a synthetic showcase and verify the earlier objects stay readable until the demo backend ends. Legacy cleanup should return 409. Do not delete real data; this environment cannot access it.

## Local verification (separate from manual demo data)

Stop manual emulator/backend sessions first: emulator regression tests clear the synthetic database/users. Then in a configured terminal:

```powershell
node --test backend/test/local-demo.test.cjs tests/local-demo.test.cjs
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only auth,firestore --project demo-pmr-security --config firebase.demo.json "node scripts/verify-local-demo.cjs"
```

The matrix uses actual local Auth/Firestore emulators and existing booking, payment, receipt, notification, rules and photo tests. It is not proof that remote composite indexes exist. Never change the project argument or run these tests with cloud credentials.

## Troubleshooting and shutdown

- Startup rejects credentials: open a clean terminal; do not copy production secrets. No secrets should be present even if the local emulator hosts are set.
- Readiness fails: check emulator terminal, exact project and ports; no hosted backend fallback exists.
- Device 403: correct explicit device IP/allowlist; never widen to all interfaces or public ranges.
- Device cannot connect: confirm same Wi-Fi, no client isolation, targeted firewall rule and computer IP. `localhost` on a phone means the phone. Keep server emulator hosts on loopback.
- Production build with demo variables: fail closed intentionally. Clear demo settings and use the normal release process outside this task.
- Missing synthetic object after backend restart: expected memory-storage loss. Restart the disposable emulators too for a fresh consistent session; avoid importing old snapshots that reference missing media.
- Credentials lost for already-seeded users: restart only disposable emulator sessions for fresh users. No production password reset is involved.
- Clean shutdown: Ctrl+C Expo, then demo backend (closes HTTP/proxy sockets and Admin clients), then emulator CLI. Close demo terminals to discard environment variables. No export/import, migration, deletion script or cloud cleanup is required.

Remaining manual checks: actual Android/iOS/device networking, native fixture caching/upload, compatible Expo runtime and complete two-role UI journey. Unit and emulator tests do not establish these physical-device results.
