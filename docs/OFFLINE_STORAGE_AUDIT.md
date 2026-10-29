# PimpMyRide final offline storage and session isolation audit

Updated 29 October 2026, branch `lesley`. This replaces the initial audit's uncorrected findings with the final behavior. Scope remains limited offline account previews, not an offline-first marketplace.

## Release assessment

**Conditionally ready for release within the limited offline-preview scope.** The corrected paths have no known remaining automated-test blocker, and the web build/export verification passes. Native release sign-off still requires physical Android/iOS restart, airplane-mode, Keychain/Keystore and OS file-cache checks. This assessment covers offline/session corrections, not a full application security certification.

## Corrected behavior

| Initial finding | Correction and verification |
| --- | --- |
| A remained visible while B was validated | The auth observer immediately clears published user/profile and enters verification/loading state. AppNavigator unmounts the protected tree while initializing. This also runs during a locked account action. B enters only after current auth/profile/eligibility validation or its permitted verified offline preview. Delayed A → B and locked-action tests verify the transition. |
| Late responses could affect a later identity | Sync checks generation and exact Firebase user-object identity after auth/token/profile awaits and before publication. Late responses cannot re-save an old preview. A test releases B's delayed profile after C is validated and confirms C remains unchanged. |
| Memory cleanup was mostly lazy | A process-local registry proactively clears coordinated API reads, bookmark state, profile-photo cache/in-flight lookups and API/media retry maps on auth changes, ordinary logout and closeLocalSession. Tests clear real coordinator/bookmark/profile-media modules together and reject late reads/bookmark acknowledgements, even with unchanged Firebase identity. |
| Old previews survived replacement | The observer deletes only the previous observed UID's preview. Initial cold restoration preserves its own valid preview. Tests preserve another UID's preview and device preferences. No storage enumeration or bulk clear is used. |
| Failed preview deletion had no recovery | Per-UID operations are serialized. Removal makes two bounded attempts; persistent failure attempts to overwrite the same key with a non-readable cleanup marker containing only cleanup intent and UID. Memory intent denies reads and retries at later auth sync/foreground activity. Reading invalid/expired/cleanup entries also retries deletion. Tests cover transient failure, persistent failure, restart markers, complete AsyncStorage outage and delayed-save/delete ordering. |
| Failed ordinary logout could restore protected access | Logout removes the protected profile and clears registered memory immediately. Preview deletion runs even if sign-out fails. The same remaining Firebase identity stays restricted with retry guidance, including after disconnecting. |
| Post detail did not refresh on reconnect/refocus | Its effect now depends on connection/focus as well as post ID, UID and explicit retry. Offline/unfocused reads are skipped and late effects ignored. Valid prior content is retained with stale labeling during refresh. Feed/navigation state is not reset. Tests cover loaded/cold-offline reconnect, focus, late results and stable renders. |
| Refresh must retain throttling | Detail still uses postsApi/read coordination, preserving coalescing and error/429 cooldowns even for forced refresh. A real transport/coordinator test confirms reconnect, refocus and manual retry send no extra HTTP request before Retry-After. No retry timer or mutation replay was added. |
| Offline wording overstated persistence | Customer improvements remain. Workshop showcase/quotation wrappers now label potentially outdated information. Landing timestamps explicitly belong to the account preview. Post detail labels retained content offline, during refresh and after refresh failure. Presentation tests cover these states. |

Sources: [AuthContext](../src/features/auth/context/AuthContext.js), [session registry](../src/shared/services/sessionCaches.js), [profile cache](../src/shared/offline/profileCache.js), [read coordinator](../src/shared/services/readCoordinator.js), [account lifecycle](../src/features/auth/services/accountManagement.js), [post detail](../src/features/marketplace/screens/PostScreens.js).

## 1. Screens supporting offline reads

| Screen/data | Cold offline restoration | Previously open before disconnecting |
| --- | --- | --- |
| Customer/approved workshop landing | Verified restored Firebase identity plus its valid UID preview permits the limited interface for up to 24 hours. | Same preview policy; live eligibility is rechecked online. |
| Account/profile | Role, approved workshop name/status, available Firebase-auth email. Full personal profile is not in the preview. | Existing component/form values may remain; server actions require connectivity. |
| Discover/saved posts/workshop portfolios | No durable posts, saved-post list or directory. | Post feed rows clear/hide. Route identity or accumulated directory rows can remain in RAM. |
| Garage/customer request lists/workshop jobs/direct requests/quotations | No durable vehicles, requests or quotes. | Some accumulated rows remain in RAM with actions blocked and offline guidance. |
| Post detail | Waits for connectivity; reconnect/refocus loads it. | Prior body may remain in RAM, labeled potentially outdated, then refreshed on reconnect/refocus. |
| Request details/quote comparison | No durable details. | useMarketData clears active data offline; separate form/list/route state may remain. |
| Bookings/details/receipts/messages/notifications | No supported offline record reads. | Presentation hides records or hooks clear them. Notification memory may remain internally but is hidden offline. |
| Private photos/documents/reviews | No supported persistent offline access. | Fetching/display is disabled or cleared; OS caching is outside this feature. |
| Administrator | No offline landing authorization. | Offline detection removes administrator protected profile; fresh claims remain required. |

Marketplace RAM rows and account previews never provide server authorization. Offline devices cannot immediately discover remote suspension; last-known eligible previews remain bounded to 24 hours.

## 2–3. Persisted preferences, drafts and restart behavior

| Store/key | Contents and retention |
| --- | --- |
| AsyncStorage theme-mode:v1 | Device-wide light/dark preference; preserved across restart/logout. |
| AsyncStorage feed-source:shop | All/customers/shops device preference; preserved across workshop accounts. |
| AsyncStorage @pmr/login-cooldown/v2 | Attempt count/deadline; device-wide throttling metadata. Legacy v1 migrates. No credentials. |
| AsyncStorage @pmr/landing/v1/&lt;uid&gt; | Schema/UID/time/role; approved shop name/status. UID-scoped and valid for 24 hours. Targeted lifecycle cleanup and invalid/expired cleanup on read. A cleanup marker may temporarily occupy this key after deletion failure. |
| Expo SecureStore | Native Firebase auth adapter manifest/session chunks with WHEN_UNLOCKED_THIS_DEVICE_ONLY. Matching legacy plaintext auth entries are removed. Temporary signup/credential-check clients use memory-only auth. |
| Browser Firebase auth | Web getAuth persistence; separate from the native SecureStore guarantee. |
| React state/refs and API/media caches | Business rows, drafts, picked-file references and manual retry identities. Memory only, cleared by session cleanup or protected screen unmount. |

No durable local drafts exist for signup/profile/vehicle/request/quotation/showcase/chat/payment-choice forms or PimpPilot plans. Failed submission may preserve a mounted form; reopening/process death loses it. Existing discard guards protect navigation only. PimpPilot and PimpPilot Studio source was not changed.

Module recreation/remount tests simulate restart recovery with shared storage mocks. Physical native storage survival and Keychain/Keystore integration have not been verified on device.

## 4–5. Account isolation and sensitive information

UID-specific keys, embedded UID/schema/age validation, exact Firebase user identity, generation guards and expected-UID transport/service checks isolate data. Replacement hides protected presentation before validation and proactively clears memory. No successful cross-account server mutation was demonstrated or enabled.

No current application writes of passwords, access/refresh tokens, full profiles, messages, bookings, receipts, private media URLs or drafts to AsyncStorage were found or added. UID/role/time/workshop-name metadata is plaintext, not anonymous/encrypted. Cleanup never calls AsyncStorage.clear() or deletes another UID's entry. Fresh online validation can create a new eligible current-account preview.

## 6. Offline presentation

Customer, landing-shell, workshop showcase and quotation notices describe displayed information as potentially outdated. Saved time refers specifically to the account preview, not business-record freshness. Post detail identifies retained content offline, during refresh and after failure. No wording claims durable marketplace caching.

## 7. Connectivity and mutations

All three shared transports require connectivity before tokens/network work. Quote acceptance, bookings, payments, uploads, profile changes and account lifecycle actions do not enter an offline queue. Unknown NetInfo reachability may attempt a request; transport failures remain bounded/visible. NetInfo does not prove backend health.

No automatic booking/payment replay was added. Existing manual idempotency/reconciliation remains in memory and server receipts remain authoritative. Account-deletion password, typed-confirmation, final-confirmation and server safety gates were not changed.

## 8. Firestore and reconnect refresh

Firebase JavaScript getFirestore(app) remains configured without persistent Firestore cache. Account checks use getDocFromServer; profile listeners reject cached/pending-write snapshots. Business records use HTTP APIs. Firebase documents its [JavaScript memory-cache default](https://firebase.google.com/docs/firestore/manage-data/enable-offline); AsyncStorage is [persistent and unencrypted](https://react-native-async-storage.github.io/2.0/).

Auth refreshes on identity/connection changes, foreground activation, eligible profile-listener events and a 60-second active/online interval. It reloads identity, refreshes claims and reads the server profile. Preview expiry schedules revalidation.

Marketplace/post-feed/review/notification hooks respond to focus/connectivity; post detail now does too. Messages resume existing polling. Successful list TTLs remain 5 seconds, categories 60 seconds and notification/message summaries 30 seconds. Individual post/request/booking/receipt/payment-capability reads have zero successful-result TTL. A list can reuse a still-valid RAM entry after a brief reconnect. Explicit refresh bypasses successful-result TTL but preserves error backoff and 429 deadlines. Mutation invalidation preserves cooldowns; a session boundary drops departing-session local cooldowns. Server rate limits remain authoritative.

## 9. Logout, deactivation and account changes

Logout clears protected profile/session memory immediately and attempts preview removal even after sign-out failure. Failed ordinary logout leaves the same identity restricted with retry guidance. Later sync/foreground events retry outstanding deletes, never server mutations.

Accepted deactivation/deletion still use their existing guarded lifecycle and closeLocalSession, which clears registered memory and attempts targeted preview removal in finally. Known inactive/unapproved profiles cannot create readable previews; discovered revoked/disabled identities retain existing sign-out restrictions.

Replacement removes the previous observed identity's preview/UI. Initial cold restoration preserves its own valid preview. Late responses cannot publish/re-save the previous identity. Theme/feed preferences remain untouched.

## Focused verification

The final focused regression run passed **219/219 tests**. The final presentation/storage follow-up passed **19/19**, including two subsequently added notice tests: **221 distinct passing tests across those runs**. The final source passed **npm.cmd run build:web**, including Expo web export (823 modules) and the repository's artifact/API-route verification. **git diff --check passed.** Only relevant storage/session/auth/account-management, changed media/post and rate-limit regressions were run; unrelated full application/backend suites were not run.

```powershell
node --test --test-reporter=spec --test-concurrency=2 tests/storage.test.cjs tests/session.test.cjs tests/offline-audit.test.cjs tests/session-cache-cleanup.test.cjs tests/request-performance.test.cjs tests/account-management.test.cjs tests/account-management-ui.test.cjs tests/accounts.test.cjs tests/auth.test.cjs tests/firebase-isolation.test.cjs tests/google-accounts.test.cjs tests/password-recovery.test.cjs tests/verification-ui.test.cjs tests/profile-photos-service.test.cjs tests/photo-api.test.cjs tests/showcase-retry.test.cjs tests/shop-showcase-ui.test.cjs tests/admin-api.test.cjs tests/api.test.cjs tests/media-feed-regressions.test.cjs
```

Final presentation/storage follow-up and build:

```powershell
node --test --test-reporter=spec --test-concurrency=2 tests/offline-audit.test.cjs tests/session-cache-cleanup.test.cjs
npm.cmd run build:web
git diff --check
```

Evidence: .local-checks/offline-corrections-final.log, .local-checks/offline-corrections-presentation.log, .local-checks/offline-corrections-web-final.log. Native/auth/HTTP/storage boundaries use synthetic mocks. Web verification checks artifacts/configured route references without requesting production endpoints.

The first expanded run exposed strict media mocks missing the registry import and existing storefront fixture assumptions about public reviews/native fonts. Those fixtures were corrected without changing production review behavior. The affected 34 tests passed before final verification. React test renderer still emits its existing deprecation notice.

## Remaining limitations

- Physical Android/iOS restart, airplane-mode, secure-storage and logout smoke tests remain outstanding; adapter recreation is not device integration proof.
- If AsyncStorage rejects both deletion and the marker write, reads are denied in memory and cleanup retries after recovery, but physical erasure/persistent marker creation cannot be guaranteed during that outage. Errors remain observable. A successfully written marker survives restart and is never a readable preview. Signed-out identities cannot use old previews; online validation replaces eligible previews.
- Picked verification documents still enter the OS cache directory without an explicit filesystem deletion lifecycle. This cleanup covers application memory/account previews, not OS-managed document/image bytes. File retention/erasure needs device validation or separately scoped lifecycle work.
- No persistent offline marketplace, durable drafts, offline authorization refresh, mutation queue or synchronization. These remain intentional scope limits.
- Interrupted server mutations can have ambiguous outcomes. Explicit/manual reconciliation and server receipts remain authoritative; payments/bookings are never automatically replayed.

No production data access, commit, push or deployment. Existing unrelated docs/academic-final/ work is preserved.
