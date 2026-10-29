# Account deletion production safety review

29 October 2026. Repository/configuration audit and synthetic tests only. No deployed configuration, production records, bucket contents or secrets were accessed or modified. Previous uncommitted implementation work is preserved.

## Operational controls

The previous implementation had **no deletion-specific intake or execution switch**. `render.yaml` starts `npm start` in `backend`, which runs `server.cjs` and installs the lifecycle poller at a 60-second interval. Due deletion jobs could advance after startup; admin resume could advance a job immediately.

Two independent server-side opt-ins now default disabled in **all** environments, including production:

```dotenv
PMR_ACCOUNT_DELETION_REQUESTS_ENABLED=false
PMR_ACCOUNT_DELETION_WORKER_ENABLED=false
```

Only the exact string `true` enables either switch. Missing, empty, misspelled, whitespace-padded or differently cased values stay disabled. These are non-secret backend settings, declared disabled in `render.yaml` and `backend/.env.example`; never prefix them with `EXPO_PUBLIC_`.

| Requests | Worker | Behavior |
| --- | --- | --- |
| false | false | Reject new deletion requests; preserve existing deletion jobs |
| false | true | Reject new requests; execute/reconcile existing jobs |
| true | false | Accept eligible requests, restrict accounts and queue cleanup at `revoke` |
| true | true | Accept eligible requests and execute cleanup |

Disabled intake returns HTTP 503 with a clear message before any restriction, receipt, job or audit write. Execution is checked **before lease acquisition** in the shared processor, covering scheduled polling, immediate processing after intake and admin resume. Paused admin resume returns `{pending: true, paused: true}` without job/profile/Auth/storage writes. Unknown lifecycle kinds fail closed.

Profile editing, verified-email synchronization, Firebase password/email SDK flows, deactivation and authorized reactivation remain available. The lifecycle poller still starts automatically to recover failed deactivation revocations. With deletion paused, it selects only `kind == deactivate`, so a backlog of deletions cannot starve deactivation recovery. This requires the additional index `accountLifecycleJobs(state ASC, kind ASC, dueAt ASC)` alongside the existing `(state, dueAt)` index.

## Audit findings

| Check | Result |
| --- | --- |
| 1. Automatic worker startup | Lifecycle polling starts with the Render backend. First scheduled poll is approximately 60 seconds later, subject to process uptime |
| 2. Pending jobs after deployment | Previously eligible automatically. Now no deletion advances with default execution disabled. Enabling execution allows due jobs on the next poll; authorized resume may advance immediately |
| 3. Safe controls | Independent intake/execution gates implemented; admin resume cannot bypass execution pause |
| 4. Pause preservation | No phase, cursor, due time, issue, lease, restriction or content changes for a paused deletion job |
| 5. Media coverage | All repository-configured bucket/path combinations below have validated ownership. Additional historical deployed locations remain unverified |
| 6. Cross-account safety | Exact UID namespace, full path schema and configured bucket/provider checks; no caller-selected prefix. Tests include foreign/similar UIDs, traversal and unknown bucket/provider rejection |
| 7. Incomplete cleanup | Remains pending with saved progress and retry/reconciliation status; unknown media and upload outcomes stop advancement |
| 8. Auth ordering | Firebase identity deletion only occurs at `identity`, after media/data phases. Pausing also blocks identity deletion; lost acknowledgement is recoverable |
| 9. Obligations | Transactional customer/workshop booking checks block active services, unknown/nonzero completed balances, unresolved reconciliation/disputes, protected closure holds and more than 200 associated bookings requiring support review |
| 10. Admin reconciliation | Existing admin claims/profile/recent-auth and job ownership checks remain; two-minute leases prevent concurrent ownership and expired leases permit recovery |
| 11. Environment requirements | Two new non-secret flags plus the new index. Existing Firebase Admin and Supabase server credentials/bucket configuration remain; no new secret/provider/dependency |
| 12. Rollback | Preserve restrictions, jobs/cursors, receipts and tombstones. Roll back only to compatible gated code or stop all worker-capable old instances first |

Cancelled bookings are allowed only without unresolved dispute/reconciliation flags; no simulated amounts are forgiven. Obligations are checked at intake, and marketplace transactions reject new work after account restriction. This review introduces no dispute workflow or payment override. Support should pause execution if later evidence requires investigation.

## Storage coverage and limits

| Configuration | Default bucket | Validated namespace | Visibility |
| --- | --- | --- | --- |
| `SUPABASE_BUCKET` | `verification` | `verification/{uid}/{documentKind}/{fileId}` | Private |
| `SUPABASE_PHOTO_BUCKET` | `vehicle-images` | `photos/{uid}/{vehicleId}/{uuid}`, `profiles/{uid}/{uuid}` | Private |
| `SUPABASE_REQUEST_BUCKET` | `request-images` | `requests/{uid}/{requestId}/{uuid}` | Private |
| `SUPABASE_POSTS_BUCKET` | `showcase-images` | `posts/{uid}/{uuid}` | Private |
| `SUPABASE_LEGACY_PHOTO_BUCKET` | `marketplace-photos` | `photos/{uid}/{vehicleId}/{uuid}` | Private |
| `SUPABASE_LEGACY_POSTS_BUCKET` | `public-posts` | `posts/{uid}/{uuid}` | Public |

Document kinds are restricted to the existing `cipcCert`, `proofOfAddress` and `ownerId`. Configuration validates distinct bucket names. Untagged vehicle/showcase references route only through the configured legacy adapter. Unknown bucket/provider/path references remain pending for operator reconciliation.

The privileged server storage client lists only the exact validated UID namespace, validates each returned object's full path and removes at most 20 objects. A later empty scan is required before advancing. Stored document/upload/photo references and showcase image references are validated before metadata removal. No client UID or Supabase user metadata authorizes removal. Storage operations use the [listing](https://supabase.com/docs/reference/javascript/storage-from-list) and [removal](https://supabase.com/docs/reference/javascript/storage-from-remove) APIs, not SQL deletion of storage rows. Current API documentation was checked; the changelog markdown fetch was unsupported by the browsing tool. No storage SDK/API changes were necessary.

**Activation blocker:** code coverage is not a production inventory. No separate legacy verification, request or profile bucket is configured. If those locations ever changed, or orphaned resources exist outside known namespaces, an authorized operator must inventory/reconcile them before enabling deletion. A known unknown reference stops cleanup; an entirely unreferenced object in an unknown bucket cannot be discovered. Backups, downloaded copies and public CDN/browser caches also require separate retention treatment. Universal erasure is not guaranteed.

## Pause, enable and rollback

1. Initially keep **both flags false on every instance**. Deploy rules/indexes first and wait for index readiness. Confirm bucket inventory/permissions, operational retention policy and support ownership before activation.
2. To stop intake while draining reviewed jobs, set requests `false`, worker `true`. This does **not** pause destructive work.
3. To pause deletion, set worker `false` (normally both flags false), then restart/redeploy every backend process with those values. Environment configuration is not a central hot kill switch: an already-running phase may finish. Drain/stop old instances before treating the pause as effective. Previously removed content is not restored.
4. Preserve jobs/cursors and restricted profiles. Do not reset phases, delete ledgers, manually clear leases or reactivate deleting users. Interrupted leases expire after two minutes; ordinary authorized resume can then recover them.
5. After reconciliation, enable worker `true` with requests `false` to drain the reviewed backlog. Jobs can resume at any saved phase, including `identity`; inspect backlog state before enabling. Enable intake separately afterwards.
6. An older ungated binary ignores these flags. Roll back to a compatible gated version, or stop all older worker-capable instances while retaining server access restrictions and durable lifecycle state. Keep rules/indexes compatible. Rollback cannot recreate deleted Auth identities/media or undo completed phases.

Queue-only mode (requests true, worker false) restricts marketplace access immediately, but defers Firebase token revocation until the saved `revoke` phase can execute. It is not the recommended initial rollout mode.

Existing server configuration remains: `FIREBASE_PROJECT_ID`, Firebase Admin credentials through `FIREBASE_SERVICE_ACCOUNT_JSON` or the existing application-credential path, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and the bucket settings above. No new secrets are required. Actual deployed values/permissions were not inspected. Index readiness, storage inventory/permissions, retention acceptance and worker uptime/monitoring remain release acceptance items.

## Verification and changes

- Gate/account/security unit run: 30 passed, 0 failed (`.local-checks/account-deletion-safety-unit.log`).
- Expanded storage run: 10 passed, 0 failed (`.local-checks/account-deletion-safety-storage.log`), covering every configured current/legacy scope. Nine storage cases overlap the first run: **31 distinct unit/security tests verified** across both runs.
- Focused Firebase Auth/Firestore emulator run: **11 passed, 0 failed** (`.local-checks/account-deletion-safety-emulators.log`), using synthetic `demo-pmr-security` records and mocked storage only.
- Syntax checks and `git diff --check` passed. Frontend code is unchanged in this audit; prior production web/Android exports were not rerun for these server-only gates.

Tests cover default/exact opt-in parsing; no intake side effects; paused progress preservation at revoke/settle/media/data/identity; unaffected profile/email operations and both-role deactivation/reactivation; deactivation retry behind a deletion backlog; scheduled/admin pause and resume; obligations; cross-account isolation; unknown media/in-flight holds; storage failures; Auth-last/lost-ack recovery; concurrent closure and worker leases.

Files changed for this review: `backend/account-management.cjs`, `backend/services.cjs`, `backend/.env.example`, `render.yaml`, `firestore.indexes.json`, `backend/test/account-management.test.cjs`, `backend/test/account-management-integration.test.cjs`, `backend/test/storage.test.cjs`, this report and the cross-reference in `BOOKING_ACCOUNT_MANAGEMENT.md`.

Ready for production review **with permanent deletion disabled**. Enabling deletion remains blocked on the operator acceptance items above. No commit, push, deployment or production-data mutation was performed.
