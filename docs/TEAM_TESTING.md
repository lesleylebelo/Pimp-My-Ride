# Independent synthetic team testing

These instructions apply after the owner approves and publishes
`test/pimpmyride-integration`. The branch is for local testing only. Do not merge
it into `main`, deploy its backend, create a Render service from its blueprint,
or enable mock payments on a hosted service. The existing backend payment gate
also blocks production quotation acceptance, including Pay In-Store.

Each developer runs their own disposable Firebase Auth/Firestore emulators,
Express server, synthetic storage and Expo session. Do not use the owner's IP,
credentials, data or running services. No production Firebase/Supabase account,
service-account file, API secret, `.env`, real media or email provider is needed.
The checked-in `.env.example`, backend example and Render blueprint describe
other environments; do not copy their production settings for this demo.

## Clean Windows setup

Use Git, PowerShell, Node **22.23.3** with npm, and Java **21 or newer**. The
owner's portable runtime and node_modules are ignored and will not be cloned.
Select your independently installed Node runtime before every terminal session;
verify `node --version` prints `v22.23.3`. The demo helper prefers the optional
local portable runtime when present and otherwise uses your terminal's PATH.

After publication, clone into a new directory:

```powershell
git clone --branch test/pimpmyride-integration --single-branch https://github.com/lesleylebelo/Pimp-My-Ride.git PimpMyRide-TeamTesting
cd PimpMyRide-TeamTesting
node --version
npm.cmd --version
java -version
npm.cmd ci
npm.cmd ci --prefix backend
```

For an existing clone with uncommitted work, use a separate clone rather than
resetting or overwriting it. Keep both lockfiles unchanged. Initial dependency
installation needs internet and disk space; the first emulator start also
downloads the public Firestore emulator binary if it is not already cached.
Firebase CLI is a project dependency: no global install, Firebase login or
cloud project is required. Installation from scratch has not been verified on
a teammate's machine; report any lockfile/install error rather than upgrading.

## Three terminals, one consistent environment

Open each terminal in this clone, select Node 22.23.3, and run the **same** helper
command in all three terminals. Start with a clean environment: the helper
rejects production/storage credentials. It sets `EXPO_NO_DOTENV=1` and synthetic
Firebase values; do not bypass those checks.

For a physical phone, connect the developer laptop and phone through a trusted
private network/hotspot. Check their current IPv4 addresses; replace these
example addresses with your own:

```powershell
. ./scripts/local-demo-env.ps1 -Target device -ComputerIP 192.168.137.1 -DeviceIP 192.168.137.2
node --version
```

For Android Emulator use `-Target android` instead. For host-only testing or an
iOS Simulator on the same Mac use `-Target host`. The supplied helper and the
validated instructions here use PowerShell; macOS/Linux need PowerShell and
Node/Java on PATH or a separately reviewed equivalent environment setup. Native
iOS builds require macOS/Xcode; Windows cannot build an iOS native runtime.

If Windows blocks the unsigned helper, the existing documented option is a
process-only `powershell -NoProfile -ExecutionPolicy Bypass` session. Do not
bypass an organisation-enforced policy or change machine policy.

Terminal 1, after helper setup:

```powershell
node node_modules/firebase-tools/lib/bin/firebase.js emulators:start --only auth,firestore --project demo-pmr-security --config firebase.demo.json
```

Wait for both emulators to report ready. They must bind only to
`127.0.0.1:9099` (Auth) and `127.0.0.1:8080` (Firestore).

Terminal 2, after identical helper setup:

```powershell
node backend/local-demo.cjs --seed
```

This creates verified synthetic `demo-owner@example.invalid` and approved shop
`demo-shop@example.invalid` accounts plus the Body kit category. Fresh randomly
generated passwords are printed only on account creation. Keep them locally;
never commit or share password logs. No real verification email is sent. These
passwords apply only to that developer's current emulators. Media is held in
memory and only synthetic fixture uploads are accepted.

Terminal 3, after identical helper setup:

```powershell
node node_modules/expo/bin/cli start --offline --port 8081
```

Do not use plain `npx expo start`, combine `--offline` with `--lan`, use public
tunnels or replace the backend command with `npm start`. The demo stays opt-in;
the server's mock-payment gate remains unchanged.

## Phone connectivity and first journey

Allow only the particular phone IP to reach TCP **3000, 18080, 19099 and 8081**
on the laptop's trusted interface through its firewall. Do not open native
emulator ports **8080/9099**, disable the firewall or expose the emulator hub.
Use your laptop IP below, not localhost and not the owner's laptop IP:

1. Check `http://LAPTOP_IP:3000/health` and
   `http://LAPTOP_IP:3000/__demo/ready` locally. Readiness must identify
   `demo-pmr-security`, memory-fixtures and mock payments enabled.
2. In phone Safari/browser check `http://LAPTOP_IP:8081/status` returns
   `packager-status:running` before opening Expo.
3. Use an Expo Go version compatible with this repository's Expo **57** native
   runtime, or an appropriately built development client. Compatibility and
   physical-device execution are not yet verified; an incompatible Expo Go is
   a blocker, not a reason to upgrade dependencies blindly.
4. Scan only the private LAN Expo session. Permit local-network access on iOS.
   Sign in with the synthetic owner and that session's generated password.
5. Open Discover. An empty showcase feed is initially expected: the seed creates
   accounts/category, not portfolios. Sign out and sign in as the synthetic shop
   to add a synthetic showcase; return as owner to verify it appears. Demo media
   substitutes a synthetic PNG and does not upload selected personal content.
6. Owner: add a fictitious vehicle and Body kit request in Johannesburg. Shop:
   find the request and quote with no deposit, percentage or fixed deposit.
   Owner: compare/accept the current quote and simulate payment. Shop: confirm
   an eligible appointment. Continue balance settlement, completion/cancellation,
   simulated receipts, test-email outbox and notifications using separate
   sessions or sign-out/account switching.

The gateway IP allowlist must match the phone's current address. Restart the
backend and Expo with updated helper values after IP changes. No cloud fallback
exists. Each emulator user can administer disposable data through emulator
endpoints; use only a trusted private network.

## Verification and shutdown

```powershell
npm.cmd test
npm.cmd test --prefix backend
node --test backend/test/local-demo.test.cjs tests/local-demo.test.cjs
```

Stop manual services before the destructive-to-demo-only emulator regression
matrix below: it clears synthetic accounts/data. Use the helper in host mode
and only the exact demo project:

```powershell
. ./scripts/local-demo-env.ps1 -Target host
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only auth,firestore --project demo-pmr-security --config firebase.demo.json "node scripts/verify-local-demo.cjs"
```

For ordinary shutdown Ctrl+C Expo, then demo backend, then emulator CLI. Close
demo terminals to discard their environment. Restarting backend clears fixture
media; for a consistent fresh session restart the disposable emulators too.
Never run production migration/cleanup scripts as part of team setup.
