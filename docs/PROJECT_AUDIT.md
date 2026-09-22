# Baseline audit — 22 September 2026

This records the conversation audit before stabilization. It is a code assessment,
not evidence of deployed configuration. See PROJECT_HANDOVER.md for current status.

## Architecture and scope

Expo/React Native JavaScript and React Navigation; Firebase Authentication and
Firestore; Express/Firebase Admin on Render; private Supabase verification files;
SecureStore native sessions; AsyncStorage minimal landing cache and login cooldown.
Owner/shop marketplace screens are prototypes. Authentication, onboarding, shop
documents, role gating, admin account/category management, audit and presence exist.
Endpoints: GET /health and POST /api/profile, /api/session, /api/admin,
/api/documents/:kind. Marketplace CRUD/quotations/bookings do not exist.

## Findings

No critical defect was confirmed. Live security configuration remains unverified.

| ID | Priority | Evidence at baseline | Impact / recommendation |
| --- | --- | --- | --- |
| H1 | High | AdminScreens.js ConfirmButton uses Alert.alert; installed React Native Web Alert is empty | Browser confirmations never submit. Use reusable modal; render picker errors inline. |
| H2 | High | backend/services.cjs review lock/rollback | Interrupted review locks persist; pre-transaction previous status is stale. Persist owned operations and explicit recovery. |
| M1 | Medium | Outer Git link lacks .gitmodules; render.yaml ignored/untracked | Canonical inner repository must be documented; fix ignores without deleting Git metadata. |
| M2 | Medium | services.cjs upload cleanup catches and storageCleanup writes | Orphan retention; no cleanup consumer. Add dry-run reconciliation, reference checks and retries. |
| M3 | Medium | accounts.js uploadDocuments; AccountScreen.js | All three files required; no saved per-file status. Add individual upload/retry. |
| M4 | Medium risk | backend/storage-setup.sql | Private flag does not establish safe RLS. Verify deployed policies; do not infer they are permissive. |
| M5 | Medium | firestore.rules | Direct reads lack revocation timestamp checks. Define intentional onboarding reads and protect sensitive metadata. |
| M6 | Medium | ResetPasswordScreen expects oobCode; navigator has no linking | Custom reset screens unreachable. Inspect hosted email configuration before deciding flow. |
| M7 | Medium | Generated category and admin operation IDs | Lost response/manual retry may duplicate mutations. Add actor/operation-scoped idempotency. |
| M8 | Medium risk | validators.js password policy is client-side | Firebase password policy must be checked independently. |
| M9 | Medium | backend/app.cjs hardcoded CORS origins | Only localhost/127.0.0.1 port 8081 works. Configure allowlist and test preflight/errors/native. |
| M10 | Medium | session records expiresAt; IP limit shared with heartbeats | No retention automation; shared networks can be blocked. Bound session storage and separate heartbeat rate limits. |
| L1 | Low | backend/files.cjs | Signature checks do not parse documents or scan malware. State limits. |
| L2 | Low | AdminScreens.js and list queries | Page-local search; capped categories; dirty forms reset on refocus. |
| L3 | Low | provisioning/reconciliation, obsolete storage rules, absent setup docs | Audit operational actions, document recovery, retire obsolete references cautiously. |

## Verified baseline controls

Backend verifies revoked Firebase tokens, current enabled/verified Auth user and
active profile. Admin access requires profile role plus current and token claims.
Sensitive actions require authentication within 15 minutes. Clients cannot write
profiles, logs, presence, categories or document metadata directly. Public profile
creation accepts only owner/shop. Suspension/archive revoke sessions and restrict
access. Offline cache excludes admin and expires after 24 hours; it cannot grant
backend permissions. Login cooldown persists locally but is bypassable by clearing
storage, another client/device, clock changes or direct Firebase requests.

## Baseline tests and limits

43 frontend tests and 6 backend mock tests passed. 73 tracked JS/CJS files parsed;
relative imports resolved. Local CORS and rate-limit probes passed; review failure
and web Alert defects reproduced. Emulator binaries were absent, so rules and
integration suites were read but not run. No real service writes or deployment.
No signature-matched private keys/tokens found in tracked files or 27 scanned
commits; that limited scan is not exhaustive secret detection. Existing assets and
most config were already tracked despite matching ignore rules.
