# Trusted administrator provisioning and account recovery

These scripts make Auth and Firestore changes when deliberately run with Application
Default Credentials. They were tested with injected mocks only during this work;
neither was run against the production project. Restrict the credentials using IAM.
An `OPERATOR_LABEL` is an audit annotation, not proof of the caller's identity; use
platform/IAM audit records to identify the actual credential principal. Do not put
tokens, credentials, personal document details, or passwords in a reason.

## Provision or repair an administrator

Use an existing, enabled Auth user with a verified email. Resolve any suspension,
archive, or outstanding review/status operation first. The client cannot provision
administrators, and the ordinary admin account controls remain protected.

```text
node scripts/provision-admin.cjs PROJECT_ID EXISTING_AUTH_UID UNIQUE_OPERATION_ID OPERATOR_LABEL "Approved reason"
```

The script first records an `adminProvision` operation and restricts the target
profile. It preserves profile details and unrelated custom claims, sets the admin
claim, revokes earlier sessions, and activates the profile only when the final
transaction succeeds. Start/completion/failure events record the operator label,
reason and operation ID. Existing profile creation dates are preserved.

After a failure, inspect `adminOperations/UNIQUE_OPERATION_ID` and the target
profile. A pending/failed operation retains its provisioning lock and suspended
profile. Retry the **same command with the same ID, label and reason** after fixing
the provider/configuration failure. Reusing that ID for different input is denied;
repeating a completed operation causes no further grants. A lost completion
acknowledgement is checked before declaring failure. Do not clear the profile lock
or create another operation to bypass it. The newly provisioned administrator must
sign in again after token revocation.

## Reconcile a failed account status change

```text
node scripts/reconcile-admin-operation.cjs PROJECT_ID OPERATION_ID OPERATOR_LABEL "Recovery reason" --worker-quiesced
```

First stop new account operations and terminate the original API worker; confirm
that it has stopped before running reconciliation. Keep these operations unavailable
until reconciliation finishes. `--worker-quiesced` records the operator's explicit
acknowledgement of that precondition; the script cannot independently verify process
state on Render. The flag does not itself stop the API or make any hosting changes.

Use the existing `accountStatus` operation ID shown in the operation record. Wait
at least two minutes after its creation as an additional guard. Elapsed time alone
does not prove that the old worker stopped: a delayed Auth write could otherwise
resume after recovery and conflict with a newer status decision. Firestore locks
cannot fence or compare-and-swap Firebase Auth writes. The script accepts pending/failed status
operations only and verifies their target, requested status, timestamp and profile
lock before touching Auth. Administrator profiles and admin custom claims are
protected. Shop review recovery uses the separate admin review recovery flow.

The intended status and its original reason remain unchanged. The separate
reconciliation reason and operator label are recorded on the operation and in
audit logs. Auth status and token revocation precede a transaction that rechecks
ownership and finalizes the profile. Failures retain its restriction and lock;
retry after investigation. Completed operations are idempotent.

Firestore and Firebase Auth do not share a transaction. A process interruption
can leave an Auth change applied with the profile still restricted. The durable
operation supports recovery; it does not roll Auth back automatically. Do not run
competing external scripts that change the same account. Run retries serially.
Only sanitized provider error codes are retained, and the command does not print
provider responses or credential values. A Firestore outage can prevent a failure
audit write; the earlier pending operation/lock then remains the recovery record.

## Legacy Firebase Storage and Functions

Current application uploads use the Express API and private Supabase Storage.
`firebase.json` configures Firestore plus Auth/Firestore emulators, with no Storage
or Functions deployment target. There is no tracked Functions implementation.
`storage.rules` remains an older Firebase Storage verification-document ruleset,
and the client no longer requires Firebase Storage configuration. There is an obsolete
Firebase Storage mock in `tests/accounts.test.cjs` and a demo-only bucket name in
the emulator integration configuration. None initializes a Storage client.

No legacy rule file or live bucket was deleted or disabled during this work.
Before retiring the old rules/configuration, inspect the intended project's deployed
Storage rules, buckets, stored objects and any older clients that may still use
them. Repository inspection cannot establish that a previously deployed service
has no active users. Document migration/retention before a separately authorized
live retirement. Do not deploy `storage.rules` as part of the current Supabase flow.
