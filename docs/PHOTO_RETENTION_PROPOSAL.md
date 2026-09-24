# Photo reconciliation and proposed retention

Status: **proposal; deletion is neither implemented nor authorized**.
`scripts/cleanup-photos.cjs` reads Firestore only. It has no Supabase client,
does not write attempts or metadata, rejects `--apply` before loading credentials
and never runs on a schedule. No live report or setup SQL was executed here.
The separate verification-document report remains documented in
[RETENTION_PROPOSAL.md](RETENTION_PROPOSAL.md).

## Current reference and retention contract

Garage replacement/removal detaches an asset from the current vehicle slots.
It does not delete the object or remove it from existing service requests.
Published requests keep their original attachments, including when closed or
booked. Bookings also retain those photo IDs and display their original request
gallery. There is currently no application operation that deletes a published
request or rewrites its attachment list.

| Condition | Report decision under the proposed policy |
| --- | --- |
| Any vehicle `photoIds` reference, including an archived vehicle | Preserve |
| Any service-request `photoIds` reference, including closed/booked requests | Preserve |
| Terminal `cleanupPending` attempt with no references and consistent identity | Candidate only after 24 hours from the later of creation/update timestamps and successful remaining checks |
| `uploading`, `referenced`, unknown or inconsistent attempt | Preserve, regardless of age |
| Missing/malformed/future timestamps or mismatched path/owner/vehicle/slot/provider | Preserve |
| Multiple ledgers for one immutable path or changed exact ledger reread | Preserve |
| Failed reference/metadata query or unavailable required index | Preserve and retry the report later |

The current report checks vehicle and service-request references. Booking
history depends on its original retained request; the report does not separately
query bookings. A future request-deletion feature must first extend reference
protection to every independent history record. An operator must not interpret
this report as authority to delete a request or a storage object.

An asset metadata record can be absent when storage succeeded but publication
failed. Absence alone is insufficient: reference, identity and ledger checks
still run. Candidates are observations under an **unapproved** grace period,
not legal-retention advice or deletion authorization. Current and historical
photos, ledgers, receipts and audit events remain stored until a policy and
safe deletion implementation are separately approved.

## Read-only report

From the application root:

```powershell
node scripts/cleanup-photos.cjs --help
node scripts/cleanup-photos.cjs --project PROJECT_ID --limit 100
node scripts/cleanup-photos.cjs --project PROJECT_ID --limit 100 --after ATTEMPT_HASH
```

Choose the project explicitly. Configure existing server-side Firebase
credentials privately through `GOOGLE_APPLICATION_CREDENTIALS` or
`FIREBASE_SERVICE_ACCOUNT_JSON`; do not put credential contents in commands or
reports. Inline service-account configuration must match the chosen project.
No Supabase secret is needed. Prefer a read-only Firestore identity for reports.
Production credential use is not part of the local test procedure.

An emulator report requires a loopback `FIRESTORE_EMULATOR_HOST` and a `demo-`
project ID; a `demo-` project without the emulator is rejected. Use synthetic
mock/emulator records for tests. The CLI does not create fixtures or initialize
live storage.

Reports contain counts, hashed attempt IDs, decisions, reasons, safe error codes
and an optional `nextCursor`. They exclude UIDs, vehicle/asset IDs, object paths,
filenames, raw records, raw errors, credentials and signed URLs. Pass a returned
cursor as `--after`; restart from the beginning on a later review because records
may change before the cursor. Malformed record IDs are redacted and may stop
pagination rather than exposing or accepting them as cursors.

Default pages contain 100 attempts, with a limit of 1-500 and one lookahead
record. Reference and metadata checks add reads; even a read-only report consumes
Firestore quota. Transient reads retry at most three times with 100 ms and
200 ms delays. Exit 2 indicates failed reference checks or blocked pagination;
exit 1 indicates invalid input or report failure. Both outcomes preserve data.

## Preconditions for any future deletion implementation

Paths must exactly match `photos/{ownerUid}/{vehicleId}/{UUID-v4}` and agree with
the attempt and any asset metadata. The uploader creates its attempt before
storage I/O and fences publication with the worker identity and lease. A closed
attempt cannot later publish its asset. The report re-reads the exact ledger
after reference checks; its result is still only a point-in-time observation.

Before implementing deletion, decide retention for current libraries, failed
uploads, closed requests, cancelled bookings, archived accounts and audit data.
The proposed 24-hour grace only concerns unreferenced terminal attempts.
Five active library slots and upload rate limits do not bound cumulative storage;
monitor object/database growth while retention remains unresolved.

A later implementation must acquire a durable operation-owned tombstone, repeat
all authoritative reference checks including independent booking references,
prevent every writer from attaching a
tombstoned object, and preserve ambiguous outcomes. It must handle storage
deletion and Firestore acknowledgement separately and retry idempotently from
small operator-run batches. A stale dry-run candidate cannot authorize deletion.
Approving a retention policy alone does not implement or deploy these safeguards.

All 15 photo-cleanup mock tests passed, including references, grace/identity
checks, changed ledgers, read failures, pagination, repeated reports and rejection
of apply. The full local run passed 148 frontend, 129 backend and 42 emulator
checks; see PROJECT_HANDOVER.md for commands and limits. No test required live
storage or production writes.
