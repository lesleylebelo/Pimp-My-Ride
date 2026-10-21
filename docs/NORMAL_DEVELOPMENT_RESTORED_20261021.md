# Normal development restoration — 21 October 2026

The original project remains on `lesley`, with the same HEAD. No rollback,
commit, push, deployment or remote data operation was performed.

- Expo uses `https://pimp-my-ride.onrender.com` from the existing root `.env`.
  The temporary root `.env.local` contained only device overrides; those were
  removed and the resulting empty file was removed.
- `App.js` always mounts the normal theme, authentication, presence and navigation
  tree. The device diagnostic entry is disconnected. Retired diagnostic helpers
  and regression tests remain available as history; the gateway CLI cannot start.
- The ignored backend environment and service-account file remain intact and
  untracked. The dormant backend port is restored to 3000, bound to loopback.
  The offline configuration checker passes, including the existing Firebase and
  Supabase project IDs and disabled emulator/mock-payment flags.
- The verified project-local test backend PID 19048 was stopped. No gateway,
  test backend, Metro session or emulator was listening on the inspected test
  ports after cleanup. An offline Expo export may run Metro internally only for
  bundling; it does not launch the app or expose a device server.
- Local device upload approval is retired. Recovery checkpoints, credentials,
  fixture evidence and historical documents remain preserved.

The preservation snapshot covers 125 pre-existing modified/untracked source,
test and documentation files. Only `App.js`, the gateway helper, its app-entry
regression test and the historical iPhone setup document changed relative to
that snapshot. Media integration, feed fixes, index definitions, PMR-02/PMR-03,
booking/payment safeguards, receipts, notifications and registration work were
preserved. No process/user/machine environment override was found for the
inspected device, emulator or API-routing keys.

Verification under Node 22: application 316/316; backend 214/214; corrected
app-entry/retired-screen tests 4/4; offline credentials checker passed; normal
iOS production bundle exported successfully with Hermes. Credential
files are Git-ignored and untracked. Render's deployed backend version has not
been verified by these local checks; restoring its URL does not resolve the
previously observed backend-version mismatch.

Windows denied firewall inspection (system error 5), including from the elevated
tool execution context. The exact historical candidate rule is
`PMR-DeviceReadOnly-192168137237`. Its existence/removal is **unverified**.
Administrator PowerShell must inspect that rule and confirm its original scope
before removing it: inbound TCP 3102/8081, local 192.168.137.1, remote
192.168.137.237, interface `Local Area Connection* 4`, project-local Node 22
executable. The historical `allow-private-device.ps1` records the intended rule;
do not run that creation script. No unrelated rules or normal network/hotspot
settings were changed.

Normal workflow: run `npm start` from the original project and reload Expo Go.
Do not reopen the retired device gateway URL. No local backend is needed for
this Render-backed workflow. No upload test has been performed or authorised by
this restoration.
