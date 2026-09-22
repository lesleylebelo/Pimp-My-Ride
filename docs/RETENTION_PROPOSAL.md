# Storage reconciliation and proposed retention

Status: **proposal; deletion is not implemented or authorized**. The local
`cleanup-storage.cjs` command only reads Firestore. It has no Supabase client,
does not delete objects, does not update tasks, and rejects `--apply` before
connecting. Nothing runs on a schedule. No live records were used in its tests.

## Proposed rules requiring an explicit decision

| Record or object | Proposed treatment |
| --- | --- |
| Object referenced by any current document metadata | Keep, including suspended or archived accounts. A separate account/document retention decision is required to remove it. |
| Unreferenced upload whose ledger is terminal `cleanupPending` | Candidate only after 24 hours from the later of `createdAt` and `updatedAt`, after successful reference and operation-state checks. |
| Legacy `storageCleanup` task without an upload ledger | Candidate only after the same 24-hour grace and successful global reference checks; retain if a matching ledger is unresolved. |
| `uploading`, `referenced`, unknown, conflicting, or malformed attempt | Keep. An old age alone never establishes that an uncertain upload failed. Reconcile its outcome first. |
| Failed reference query, unavailable database, or missing index | Keep and retry the report later. A failed read must never be interpreted as an absent reference. |
| Completed deletion ledger/tombstone (future implementation) | Proposed minimum 30-day troubleshooting retention. Keep the immutable object-path tombstone longer if any delayed worker could still attempt a commit. Final record deletion needs a separate approved policy. |
| Presence session records and audit logs | This storage command does not process them. Do not enable TTL or delete them through this tool. Their retention is a separate decision. |

The 24-hour period is a conservative **proposed** grace, not an assertion about
legal retention requirements. The project must decide how long to retain actual
identity documents, withdrawn applications, and archived accounts before a
deletion implementation is enabled. Until then these records and objects stay
intact, even when a report labels an object a candidate.

## Read-only operator report

From the application root, with the existing dependencies installed:

```powershell
node scripts/cleanup-storage.cjs --help
node scripts/cleanup-storage.cjs --project PROJECT_ID --source cleanup --limit 100
node scripts/cleanup-storage.cjs --project PROJECT_ID --source attempts --limit 100
```

Supply an explicitly selected project ID and the existing server-side Firebase
credential configuration (`GOOGLE_APPLICATION_CREDENTIALS` or
`FIREBASE_SERVICE_ACCOUNT_JSON`). Never paste credentials into command arguments,
reports, screenshots, or frontend environment variables. No Supabase secret is
needed. Use a Firestore read-only identity where practical. The explicit project
flag prevents accidentally selecting an ambient CLI project; inline credential
JSON is also checked for a matching project ID.

An emulator report requires `FIRESTORE_EMULATOR_HOST` and a `demo-` project ID.
Use mock or emulator fixtures for tests; do not create test records in live
Firebase or Supabase projects.

Reports contain counts, task IDs, reasons, sanitized error codes, and an optional
`nextCursor`. They deliberately exclude account names, UIDs, object paths, raw
documents, error messages, secrets, and signed URLs. To continue a page, pass its
`nextCursor` through `--after TASK_ID`. Run both sources. Repeat from the beginning
on a later operator run, since records may change or arrive before a saved cursor.

Each page reads at most 501 task records (default 101). Candidate checks add
document/ledger reads. Run small pages when reviewing cost and volume; Firestore
reads still consume the project's quota. Transient reads retry at most three
times with 100 ms and 200 ms delays. Permission/index errors do not retry within
the same run. Exit code 2 means a page has failed reference checks; exit code 1
means the report could not run. All failures preserve objects and tasks.

The global reference query is
`collectionGroup('documents').where('path', '==', candidatePath)`. Verify the
collection-group index for `documents.path` is available in the target project.
An unavailable index produces a preserved result, never a candidate. The current
owner/kind metadata record is checked first, but an absent direct record alone
is insufficient. The global check intentionally retains unexpected references
regardless of provider or account state.

These repeatable reports work from an operator's local machine on demand. They
do not require a paid scheduler, an always-running Render worker, or an HTTP
maintenance endpoint.

## Upload ledger contract and future deletion design

The report understands `storageUploadAttempts/{attemptId}` records containing
`path`, `uid`, `kind`, `state`, `createdAt`, and `updatedAt`. Valid states are
`uploading`, `referenced`, and terminal `cleanupPending`. It also reads legacy
`storageCleanup/{taskId}` records with `path` and `createdAt`.

Paths must exactly match
`verification/{uid}/{cipcCert|proofOfAddress|ownerId}/{UUID-v4}`. Malformed paths,
mismatched UID/kind fields, multiple attempts for one path, and changed ledger
state are retained. Future migration must reconcile older/nonconforming paths
explicitly; the report must not normalize them into deletion targets.

The uploader must create its attempt before contacting storage. Metadata commit
and the `referenced` state change belong in one Firestore transaction. That
transaction must require the attempt still be `uploading`. Once an attempt is
terminal `cleanupPending`, an old worker must never publish its metadata.
Replacing a file uses a new immutable path, then transitions the superseded
attempt into cleanup state atomically with the replacement. An uncertain commit
remains retained until authoritative reads establish its outcome.

After approval, a deletion implementation should:

1. Acquire an operation-owned terminal tombstone/lease transactionally and verify
   the grace, account/document operation state, and absence of current metadata.
   Never claim an unresolved `uploading` attempt.
2. Perform a fresh global reference check. A dry-run result is only a snapshot;
   it must never serve as a later deletion authorization.
3. Ensure every writer rejects tombstoned paths. Immutable paths and ownership
   checks must prevent a delayed transaction from publishing a deleted object.
4. Delete through the private storage adapter, treating an already-absent object
   as idempotent success. Persist bounded retry state after transient failures;
   retain the tombstone when either storage outcome or final acknowledgement is
   uncertain.
5. Record task ID, operation, outcome, attempt count, and safe error code for
   operator review. Do not log private object paths or signed links. Resume small
   batches manually on free hosting. Never blindly drain all objects or account
   archives.

None of these deletion steps are executable in the current report-only tool.
Automated tests cover preserved references, unresolved uploads, concurrent
ledger changes, failed reads, repeat reports, pagination, and refusal of apply.
