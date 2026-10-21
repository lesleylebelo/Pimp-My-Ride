# PMR-02 — Showcase Image Lifecycle Safety Report

## A. Root cause

Showcase media was physically deleted without an atomic relationship between
Firestore reference state and the Supabase delete:

- `PostFormScreen.save()` attempted to remove every newly uploaded path after
  any save error. A timeout or lost response can happen after the post commits,
  so the client cannot know that the uploaded image is unreferenced.
- REST `updateShowcase()` calculated removed paths from an initial post
  snapshot, committed the update, and then deleted those paths. That snapshot
  can be stale, and another post can share or reattach a path before deletion.
- REST `deleteShowcase()` soft-deleted the post and then deleted its image
  paths without checking whether another post referenced them.
- The legacy `postsApi` `removeImage` operation accepted any path under the
  caller's shop prefix and deleted it without checking post references.
- `uploadPostImage()` deleted an uploaded object if its follow-up storage
  metadata check failed. The response had not exposed the path yet, but that
  cleanup still relied on cross-service state and could not be retried safely.
- The public-post branch of `backend/storage.cjs` exposed an unrestricted
  `remove(path)` storage operation to its callers.

These defects were independent of the earlier vehicle-rendering correction
(PMR-01). They were caused by source-code deletion flows, not by a Firestore
schema, index, or Supabase configuration issue.

## B. Design and safety rules

The repair uses retention rather than check-then-delete:

1. Showcase create, edit, and delete operations no longer physically delete
   media. Removing an image from a post only updates that post's image list;
   deleting a showcase remains a Firestore soft delete.
2. An uncertain client save or a later upload failure no longer triggers
   frontend cleanup. The original save/upload error remains visible to the user.
3. The legacy `removeImage` operation still authenticates the caller and checks
   the shop-owned path prefix, then returns `failed-precondition` (HTTP 409)
   without touching storage. A path outside the caller's prefix remains
   `not-found`.
4. The public-post storage adapter no longer exposes a delete method. Upload,
   inspection, and public URL behavior remain available.
5. Failed Firestore/storage operations do not run cleanup. If outcomes are
   unknown, the image remains in storage.

This closes the check/delete race by removing application-authorized
showcase-object deletion rather than attempting to serialize a reference query
with a separate storage service. It deliberately favors retention over garbage
collection. Existing public URLs, photo limits, upload validation, post
responses, and role/ownership checks are unchanged.

## C. Files changed

- `src/features/marketplace/screens/PostScreens.js` — removed destructive
  cleanup after a save error; create/edit UI and image ordering remain intact.
- `backend/posts.cjs` — removed post-update, soft-delete, upload-verification,
  and legacy-image physical deletion behavior; legacy cleanup now fails
  explicitly without modifying storage.
- `backend/storage.cjs` — removed the delete operation from the public-post
  storage adapter while preserving upload/read/public-URL operations.
- `backend/test/posts.test.cjs` — added mocked-storage regression coverage for
  image lifecycle, shared references, uncertain outcomes, concurrency,
  authorization, retries, and service failures.
- `backend/test/storage.test.cjs` — verified the public-post adapter has no
  delete operation and still supports required upload/read behavior.
- `tests/marketplace-post-image-lifecycle.test.cjs` — covered client upload
  failure and a simulated committed-save/lost-acknowledgement case.
- `docs/OPERATIONS.md` — documented the retention-only policy and deployment
  implications.
- `docs/PMR02_SHOWCASE_IMAGE_LIFECYCLE_REPORT.md` — this report.

The worktree already contained changes to `README.md` and
`docs/PHOTO_PICKER_PRELAUNCH_DEBUGGING_REPORT.md` before PMR-02. They were
preserved and not edited as part of this task.

## D. Tests and results

Focused commands:

```text
node --test backend\test\posts.test.cjs backend\test\storage.test.cjs
  22 passed, 0 failed

node --test tests\marketplace-post-image-lifecycle.test.cjs tests\marketplace-post-picker.test.cjs tests\marketplace-post-card.test.cjs
  8 passed, 0 failed
```

The focused backend coverage includes: create with photos; retaining photos on
edit; removing a photo reference; soft-deleting a post; two posts sharing a
photo; failure before Firestore commit; commit followed by lost acknowledgement;
a concurrent reattachment during update; reattachment during a cleanup attempt;
unauthorized deletion; repeated cleanup requests; Firestore and storage
unavailability; and upload verification failure.

Full-suite comparison:

| Suite | Before PMR-02 | After PMR-02 |
| --- | ---: | ---: |
| Application (`npm test`) | 228 passed, 4 failed (232 total) | 230 passed, 4 failed (234 total) |
| Backend (`npm test --prefix backend`) | 138 passed, 0 failed | 154 passed, 0 failed |

The same four pre-existing application tests fail before and after PMR-02:

- `garage appends vehicles while scrolling`
- `picker cancellation and invalid file types or sizes keep uploads unavailable`
- `guest navigation exposes email recovery without custom password-reset routes`
- `navigation refuses unverified user objects for every role and opens the sign-in stack`

No baseline assertions were weakened. `git diff --check` completed without
whitespace errors.

## E. Safety verification

| Invariant | Verification |
| --- | --- |
| A — No referenced-image deletion | Showcase request handlers contain no storage delete calls; the public-post storage adapter exposes no delete operation. |
| B — Unknown outcomes preserve media | Client tests cover partial upload failure and a lost acknowledgement after a simulated successful commit; backend tests cover failure before commit and after commit. |
| C — Concurrent operations are safe | A deterministic test pauses image inspection, concurrently attaches the old path to another post, then resumes the update; the object remains. |
| D — Shared media is protected | A test deletes one of two soft-deleted/published posts sharing the same path and verifies the other post's image remains available. |
| E — Authorisation is enforced | Existing showcase ownership checks remain; legacy deletion tests verify foreign paths are rejected and an owned path receives an explicit 409 without deletion. |
| F — Safe retries | Repeated legacy cleanup requests consistently return 409 and have no storage side effects. |
| G — Prefer retention over deletion | Upload verification, Firestore, and storage failures leave media intact; there is no automatic showcase-media garbage collection. |

## F. Remaining risks and verification limits

- This policy can retain orphaned or replaced files indefinitely and increase
  public-bucket storage use. It intentionally does not attempt to identify
  deletion candidates.
- Regression tests use in-memory Firestore/storage mocks and controlled
  interleavings. They do not prove Supabase behavior, Firebase transaction
  retries, or production network behavior; no live storage or production data
  was accessed.
- Operators with direct Supabase console/service-key access can still delete
  objects outside the application. Do not manually delete showcase objects
  based on an eventually consistent query or a stale snapshot.
- There is no migration/backfill or cleanup worker. A future garbage
  collector requires an approved asset identity/reference ledger and an
  atomic retirement/reattachment protocol, plus reconciliation of existing
  objects before deletion is enabled.

## G. Deployment considerations

No Firestore schema, index, backfill, Supabase bucket, credential, or
configuration change is required. No production deployment was performed.
Deploy the backend safeguard before or with the client change: older clients
that still call `removeImage` will receive HTTP 409 and keep the media rather
than deleting it. The client then stops making that cleanup request. Upload
paths, image limits, and public URL contracts do not change.

Recommended next task: keep retention-only behavior unless and until a
transaction-safe asset/reference lifecycle design and migration plan are
approved. Do not start Azure migration or unrelated PMR work as part of this
change.
