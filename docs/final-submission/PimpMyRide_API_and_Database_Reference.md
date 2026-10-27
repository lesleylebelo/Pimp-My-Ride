# PimpMyRide: API and database reference

**Baseline:** `lesley` / `0d7b95f`, inspected 27 October 2026. This is a source-based reference, not a production API certification. Paths below are relative to the configured backend origin. Primary authority: `backend/app.cjs` and the service modules named in each section. No production data was queried.

## 1. Protocol, authentication and validation

All `/api` routes pass Firebase Bearer-token verification using `verifyIdToken(token, true)`. The profile-completion service intentionally permits authenticated onboarding before email verification; ordinary domain services additionally require a current eligible profile and Auth user. CORS is an exact-origin browser policy, not authorisation. Most JSON responses use `{data: ...}`. Errors use `{error: {code, message, fields?, retryWithNewRequest?}}`.

Ordinary JSON bodies are limited to 32 KB; Studio uses a 1600 KB parser allowance for its bounded inline image/history. Multipart endpoints accept one `file` part, no ordinary form fields and at most 5 MiB. General API protection is 90 requests/IP/minute and 60 requests/UID/minute; session traffic uses separate 600/IP and 12/UID budgets. Uploads allow six/UID/minute with two simultaneous upload slots per server instance. These process-local controls are not distributed quotas. Sources: `backend/app.cjs`, `backend/services.cjs`.

**Table A1. Error meanings**

| HTTP | Typical code | Meaning |
| --- | --- | --- |
| 400 | `invalid-argument`, `validation_error` | Invalid input or unsupported fields |
| 401 | `unauthenticated`, `unauthorized` | Missing, expired or rejected authentication |
| 403 | `permission-denied`, `forbidden` | Role, account or relationship disallows action |
| 404 | `not-found`, `not_found` | Absent or deliberately undisclosed resource |
| 409 | `already-exists`, `failed-precondition` | Replay conflict, stale revision or invalid lifecycle |
| 429 | `resource-exhausted` | Rate or concurrency protection |
| 503 | `unavailable` | Integration or service unavailable |
| 500 | `internal` | Sanitised unexpected server failure |

REST posts use the underscore variants for selected codes. The client prefixes error codes with `api/`. A failed health check or an HTTP 200 health response does not establish database, storage or AI capability.

## 2. HTTP route catalogue

**Table A2. Registered routes and access**

| Method | Path | Purpose and principal input | Access/enforcement source |
| --- | --- | --- | --- |
| GET | `/health` | Returns `{ok:true}` | Public liveness; `backend/app.cjs` |
| POST | `/api/profile` | Initial profile fields; alternatively `op:shopLocationSave` | Authenticated registrant for initial owner/shop profile; location uses active approved shop checks; `services.cjs`, `shop-location.cjs` |
| POST | `/api/session` | `session`, `state:heartbeat/offline` | Eligible authenticated actor; `presence.cjs` |
| POST | `/api/admin` | `op` and operation fields | Current admin claims/profile; mutation reauthentication; `services.cjs` |
| POST | `/api/marketplace` | `op` and operation fields | Active customer or approved workshop, plus ownership/lifecycle; `marketplace.cjs` |
| POST | `/api/messaging` | `op` and contextual message fields | Participant and current communication authority; `messaging.cjs` |
| POST | `/api/ai/assist` | `kind`, `title`, `description`, `categoryId`, optional `requestId` | Active customer/request or approved shop/showcase; `ai-assist.cjs` |
| POST | `/api/ai/studio` | `vehicleId`, `message`, optional `history`, `image` | Active customer owning non-archived vehicle; `ai-studio.cjs` |
| POST | `/api/documents/list` | Empty JSON object | Own workshop document status; `documents.cjs` |
| POST | `/api/documents/:kind` | Multipart file; kind is `cipcCert`, `proofOfAddress`, `ownerId` | Verified pending shop; document content checks; `documents.cjs`, `files.cjs` |
| POST | `/api/photos` | `op`, `target`, `id`, related fields | Owner or authorised request/booking relationship; `photos.cjs` |
| POST | `/api/photos/vehicles/:vehicleId/:slot` | Multipart file; query `version`, `requestId` | Own vehicle; slots 1–5; `photos.cjs` |
| POST | `/api/photos/requests/:vehicleId` | Multipart file; query `version`, `requestId` | Own vehicle/request-photo preparation; `photos.cjs` |
| POST | `/api/profile/photos` | `op:status/view/remove`; contextual fields | Self or authorised contextual viewer; `profile-photos.cjs` |
| POST | `/api/profile/photos/upload` | Multipart file; query `version`, `requestId` | Current eligible profile owner; `profile-photos.cjs` |
| GET | `/api/posts` | `service`, `q`, `cursor`, `page`, `limit`, `shop_id` query | Active customer/shop; authorised published showcase representation; `posts.cjs` |
| GET | `/api/posts/:id` | Path ID | Permitted published post; `posts.cjs` |
| POST | `/api/posts` | REST showcase fields, or compatibility operation body containing `op` | REST creation requires approved shop; operation branch varies; `posts.cjs` |
| PATCH | `/api/posts/:id` | Permitted showcase edits | Own approved workshop showcase; `posts.cjs` |
| DELETE | `/api/posts/:id` | Path ID | Own approved workshop showcase; `posts.cjs` |
| POST | `/api/posts/images` | Multipart file | Authorised post-image upload; `posts.cjs` |
| POST | `/api/posts/:id/images/view` | `path` of image member | Rechecks post visibility and membership; transient signed access; `posts.cjs` |

## 3. Marketplace operation reference

These names are values of `op` on `/api/marketplace`; they are not separate HTTP routes. The precise allowed-key map is at the start of `backend/marketplace.cjs`. A changing operation accepts a stable `requestId`; the server fingerprints its payload and records a transaction receipt. Older callers without a key receive a generated one, so client-supplied stable keys provide stronger lost-acknowledgement replay protection.

**Table A3. Marketplace operations**

| Operation(s) | Essential input | Result/constraint |
| --- | --- | --- |
| `paymentSimulation` | No extra fields | Read capability; `{enabled,simulated,mode}` |
| `vehicles` | Optional `cursor`, `archived` | Own paginated vehicles |
| `vehicleSave` | Make/model/year/colour/registration; `id`,`version` for edit | Validated owned vehicle, incremented version |
| `vehicleArchive` | `id`, `version`, `archived` | Soft archive/restore; history retained |
| `categories`, `shops` | Optional `cursor` | Active categories or eligible approved shops |
| `requestCreate` | `vehicleId`, title/description, category/city, budgets in cents, preferred date, visibility; optional shop/photos/services/location | Validated active owned vehicle and category; returns ID |
| `requestUpdate` | `id`,`version` plus editable request terms | Open owned request; material terms version changes protect quotations |
| `requests` | Optional `feed`,`cursor` | Role-scoped request list |
| `request` | `id`, optional `quotesCursor`,`comparison` | Authorised detail; owner comparison option; paginated quotations |
| `requestClose` | `id` | Own open request becomes closed |
| `quoteSubmit` | `serviceRequestId`,`termsVersion`, scope/items, completion/warranty/validity, deposit declarations, optional coverage declarations | Approved shop; offer against current request revision |
| `quotes` | Optional cursor | Own shop offers |
| `quoteWithdraw` | `id` | Own submitted offer; withdrawn offer cannot be resubmitted |
| `quoteAccept` | Quote `id`, `paymentMethod:pay_now/pay_deposit/pay_in_store` | Owner; mock gate; atomic request/offer/booking transition |
| `bookings` | Optional cursor | Own customer/shop bookings |
| `booking` | `id`, optional `paymentCursor` | Participant detail, attempts and recorded test email events |
| `paymentMockResult` | Booking ID, exact attempt ID, expected booking/amount/currency, outcome | Explicit simulated success/failure only |
| `paymentRetry`, `paymentStart` | Booking `id` | Fresh simulated attempt after appropriate state; server computes amount |
| `paymentRecordInStore` | Booking `id`, method | Selected shop records simulated cash/card/EFT; no real payment processing |
| `bookingConfirm` | `id`,`appointmentDate`,`appointmentTime` | Selected shop; future South African appointment |
| `bookingComplete` | `id` | Selected shop; confirmed not-yet-completed service |
| `bookingCancel` | `id`,`reason` | Authorised participant and allowed lifecycle; recorded reason |
| `notifications`, `notificationRead` | Cursor or notification ID | Own recipient history/read state |
| `receipt` | Receipt `id` | Authorised booking participant; simulation-labelled record |

Request title limit: 100 characters; description: 300. Budgets are safe integer cents, maximum 100,000,000 per validated amount. Quotations have 1–10 positive-cent items; total is recalculated, never accepted from a client. Validity is 1–90 days; estimated completion 1–365 days. A percentage deposit is 1–99%; fixed/percentage deposits must be positive and below total. Scope is at most 2,000 characters, warranty 500. Optional service requirements are unique and at most 20. Sources: `backend/marketplace-domain.cjs`, `backend/booking-domain.cjs`.

## 4. Administrative, messaging and media operations

**Table A4. Additional operation families**

| Service | Operations | Significant constraints |
| --- | --- | --- |
| Admin | `dashboard`, `accounts`, `account`, `audit`, `presence`, `categories`, `document`, `editAccount`, `review`, `reviewRecover`, `status`, `categorySave`, `categoryArchive`, `posts`, `postRemove` | Admin claim in token and current Auth user, admin profile, active account. Operations below the read-only branch require authentication age no more than 900 seconds; self/admin-target protection where applicable; review reasons/audit records. |
| Messaging | `list`, `get`, `open`, `enquire`, `consent`, `send`, `read` | Request/shop relationship; customer rejection/revocation takes precedence. Open invitation, current quote, consent or booking may authorise sending. Enquiry alone does not approve it. Text at most 2,000 chars, 10 sends/minute per participant/conversation. |
| Photos | `list`, `view`, `remove` with `target`,`id` | View also needs `photoId`; remove requires vehicle owner, slot, version and requestId. |
| Profile photos | `status`, `view`, `remove` | View accepts authorised `context`,`id`; self view takes no foreign identifier. Removal uses version/requestId. Context authority is checked again before returning access. |
| Compatibility posts | `feed`, `mine`, `saved`, `get`, `save`, `create`, `update`, `remove`, `removeImage` | Existing operation contract retained. `save` sets desired boolean `saved`; current showcase UI primarily uses REST routes. Backend customer-build compatibility is not a routed customer publishing feature. |

Sources: `backend/services.cjs`, `backend/messaging.cjs`, `backend/photos.cjs`, `backend/profile-photos.cjs`, `backend/posts.cjs`. Admin list pages are generally 30 items; marketplace/message pages are generally 20; individual service cursors are not interchangeable.

## 5. AI contracts and availability

**Draft assistance:** `kind` is `request` for customers, `showcase` for approved workshops. Response is `{title,description,category,missingDetails}` after validation; `category` is a resolved allowed object or null. Backend provider output uses `categoryId`. Suggestions must preserve factual content/numbers/negations and satisfy the separate grounding validator. Title limit is 100; request description 300; showcase description 2,000; up to five short clarification questions. The service has a 15-second deadline and four concurrent leases per instance, at most one running operation per account. These are not daily generation quotas.

**Studio:** message maximum 1,500 characters; up to six `{message,plan}` history turns; optional `{mimeType:'image/jpeg',data:BASE64}` of at most 1,048,576 decoded bytes with JPEG checks. Vehicle facts are retrieved server-side and limited to make/model/year/colour. Response is `{vehicleId,plan,imageEditingAvailable:false}`. `plan` contains objective (500 chars), observations/assumptions (up to six each, 250 chars), up to six modifications (title 80, scope 120, up to five parts of 150, tradeOffs 500), considerations (six × 300) and questions (five × 200). No-image responses have no observations. Studio has a 30-second deadline and four concurrent leases per instance, with one per account. Source: `backend/ai-studio-contract.cjs`, `backend/ai-studio.cjs`.

No availability endpoint was added for Studio. Disabled/unavailable requests return an error, not a placeholder plan. The Azure adapter uses the existing PimpPilot agent and does not create provider conversations. Two owner-supplied live HTTP 400 records rejected request-level `instructions` and `reasoning`; corrections exist and are mock/SDK tested, with no successful live result in the inspected evidence.

## 6. Firestore collection and document reference

**Table A5. Business collections**

| Collection path | Representative verified fields | Relationships and handling |
| --- | --- | --- |
| `users/{uid}` | `fullName`, `email`, `phone`, `role`, account status, shop map, verification status, terms timestamps, optional photo reference/revision and operation markers | ID matches Firebase Auth UID. Roles are `owner`,`shop`,`admin`; workshop map holds business fields and optional coordinates. |
| `users/{uid}/documents/{kind}` | Provider, path, uploadAttemptId, name, size, contentType, uploadedAt | Workshop verification metadata; three supported kinds; binary in private Supabase. |
| `users/{uid}/savedPosts/{postId}` | `postId`, `createdAt` | Bookmark join document; no copied image binary. |
| `vehicles/{id}` | `ownerId`, make/model/year/colour/registration, archived, version, photo slots/revision, timestamps | Customer ownership; snapshots omit registration in shared workflows. |
| `serviceCategories/{id}` | Name, description, archived, timestamps | Administrative catalogue referenced by request categoryId. |
| `serviceRequests/{id}` | Owner/vehicle/category references and snapshots, title/description, visibility/shopId, budgets, preferredDate, city, photos, mandatoryServices, serviceLocation, status, version, termsVersion, quotationCount | Open/direct visibility and material terms revisions govern subsequent quotations. |
| `quotations/{id}` | serviceRequestId, shopId/name, request/terms versions, scope/items/totalCents/currency, deposit, completion/warranty, coverage declarations, validUntil, status | Authoritative offer history; submitted/withdrawn/superseded/accepted lifecycle. |
| `quotationHeads/{hash}` | `quoteId`, `serviceRequestId`, `shopId`, updatedAt | Current offer pointer per request/shop; deterministic hash also supports legacy offer lookup. |
| `bookings/{requestId}` | Owner/shop/request/quote/vehicle IDs, accepted terms snapshots, appointment, status, serviceStatus, paymentMethod/status, paid/balance cents, simulation markers | At most one accepted booking per request; service completion separate from payment. |
| `bookings/{id}/paymentAttempts/{attemptId}` | Provider/reference, method/kind, amountCents/currency, status, simulation flags and timestamps | Immutable identity per attempt, status transitions validated; actual money not received. |
| `paymentReceipts/{attemptId}` | Booking/attempt references and payment snapshot, issuedAt, simulation/test labels | Successful simulated accounting evidence, not tax/payment-provider certification. |
| `posts/{id}` | Author/shop IDs, authorRole/type, title/description/service category, vehicle data, image references, public shop snapshot, status/timestamps | Current shop showcases; legacy structures handled explicitly. |
| `marketplacePhotos/{id}` | Owner/vehicle IDs, purpose, bucket/path, content metadata, upload attempt reference | Shared by vehicle/request image references; viewer policy checked server-side. |
| `conversations/{hash}` | Owner/shop/request IDs, consent/version, enquiry, sequence/read/received counters, timestamps | Deterministic relationship ID; authorisation reevaluated dynamically. |
| `conversations/{id}/messages/{sequenceId}` | senderId, text, sequence, recipientOrdinal, createdAt | Ordered nested messages, participant-only API. |
| `notifications/{id}` | recipientUid, event/title/body, typed target, readAt, timestamps | In-app notifications; not proof of push delivery. |
| `emailOutbox/{id}` | Event/recipient/booking, subject/body, transport/delivery state, simulation flags | Test sink only; payment notifications do not send real email. |

**Table A6. Operational collections**

| Collection | Purpose/source |
| --- | --- |
| `auditLogs` | Actor/action/target/details/timestamp; administrative and domain traceability; `services.cjs` and domain services |
| `presence` | UID, role/name, lastSeen and bounded session-expiry map; `presence.cjs`; no guaranteed continuous online truth |
| `mutationReceipts` | Actor, operation, canonical fingerprint, result and timestamp; `mutations.cjs` |
| `adminOperations` | Review/account-state coordination, pending/completed/failed/recovery states; `reviews.cjs`, `services.cjs` |
| `storageUploadAttempts`, `storageCleanup` | Verification document intent and cleanup accounting; `documents.cjs`, `cleanup.cjs` |
| `storagePhotosUploadAttempts` | Private vehicle/request upload reservations and lifecycle; `photos.cjs`, `photo-cleanup.cjs` |
| `profilePhotoUploads` | Profile image upload/reference/cleanup state; `profile-photos.cjs` |

This is a code-derived logical schema, not an exhaustive export of every historical document. Firestore is schemaless at storage level; application validation enforces the shown structure. Documents may retain compatibility fields. No live record examples are included.

## 7. Integrity, indexing and storage

Firestore transactions protect booking acceptance, versioned edits, idempotent replay and counters. External Auth/Storage operations cannot join a Firestore transaction; pending markers, upload intent ledgers, reference rechecks and operator recovery handle partial failure. They reduce inconsistency but do not make cross-service operations globally atomic.

`firestore.indexes.json` defines query support, including request, offer, conversation and media patterns. Presence of the file does not prove deployed index state. `firestore.rules` denies direct client writes to core marketplace documents by omission; own profile reads, narrowly scoped saved-post operations, eligible published-post reads and a restricted admin moderation update are explicit exceptions. Admin SDK calls bypass client rules and depend on backend enforcement.

**Table A7. Storage mapping**

| Environment name | Default logical bucket | Use |
| --- | --- | --- |
| `SUPABASE_BUCKET` | verification | Private verification PDF/JPEG/PNG, up to 5 MiB |
| `SUPABASE_PHOTO_BUCKET` | vehicle-images | Private vehicle and profile images |
| `SUPABASE_REQUEST_BUCKET` | request-images | Private request images |
| `SUPABASE_POSTS_BUCKET` | showcase-images | Private new showcase media |
| `SUPABASE_LEGACY_PHOTO_BUCKET` | marketplace-photos | Compatibility access to legacy vehicle image references |
| `SUPABASE_LEGACY_POSTS_BUCKET` | public-posts | Compatibility path for legacy public images |

These defaults are code identifiers, not claims about current remote bucket policy. The server checks private/public expectations and rejects mismatches. New references persist bucket/path and metadata, not signed URLs. Server-generated signed URLs normally last 60 seconds; possession can permit access until expiry. General photo validation permits JPEG/PNG/WebP, up to 5 MiB, 12,000 pixels per side and 40 megapixels, with five vehicle slots. Studio's inline JPEG limit is independently smaller. The REST showcase UI supports up to ten image selections. Sources: `backend/config.cjs`, `backend/storage.cjs`, `backend/photo-domain.cjs`, `backend/posts.cjs`, `src/features/marketplace/screens/PostScreens.js`.

Supabase is not used for application authentication or marketplace SQL tables. Its privileged server key must never enter Expo configuration. Proposed SQL setup files are reference material, not scripts to execute as part of reading this document. Historical `storage.rules` concerns Firebase Storage and is not deployed by the current `firebase.json`.
