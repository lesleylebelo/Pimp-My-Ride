# Production request reliability and growth review

Reviewed 2026-10-28, on `lesley`. Local source, mocked HTTP/UI fixtures and the
existing `demo-pmr-security` Auth/Firestore emulators only. No production data,
authenticated production requests, production load tests, deployments, settings,
commits or pushes. Transactional email gates remain unchanged and disabled by
default. No infrastructure or dependencies were added. PimpPilot runtime code
was not modified; its HTTP-policy test was adapted to the shared Express change.

## Confirmed causes

The original `backend/app.cjs` charges virtually every authenticated request to
both 90/IP/minute and 60/UID/minute. Session heartbeats are the exception. Reads,
signed-image access, messaging and sensitive mutations compete for those budgets.
The two original policies return the same message, so the supplied incident
cannot be attributed to one production limiter without response headers/logs.
Local reproductions independently demonstrate both failure modes.

`MessagesHeaderButton` and `NotificationsHeaderButton` each load **every page**
every 15 seconds. With 100 conversations and 100 notifications (20/page), badges
alone generate 40 API calls in the first minute. Message-list calls additionally
resolve permission context for every conversation: request, two participant
profiles, booking and sometimes vehicle/category/quotation documents, plus Auth
eligibility checks. A badge needs only counters, not that context or message text.

Focus changes remount/reload shared marketplace and post hooks. Their services
previously did not share read results or concurrent reads. Mutation retry IDs
prevent duplicate writes but do not deduplicate reads. Private vehicle/request
images still renew at 55 seconds after the preceding avatar/showcase fix, doubling
their initial access traffic in the same rate window. They also lacked explicit
background cancellation. REST post requests did not attach the Retry-After
metadata already supplied by JSON/XHR requests.

Showcase text search applies substring matching after fetching Firestore pages
in a loop. A rare/missing term could scan the entire matching collection in one
HTTP request, including repeated author-profile reads across scan batches.

## Journey and request inventory

The accompanying [source inventory](performance/request-inventory.json) records
all 24 screen source files, literal operations, shared hooks and timer call sites.
Read it with this dependency trace: screen files often delegate all requests to
hooks/components, and inventory literals alone are not runtime counts.

| Journey / screens | Requests and triggers | Assessment / final behavior |
| --- | --- | --- |
| Customer home/discover, workshop Find Jobs/feed | `usePostsFeed`; workshops also `useMarketData('requests')`; both header badges; one showcase image and contextual avatar per post; request cards may show up to five attachments | Initial/focus load, filter change, pull refresh and cursor pagination. Five-second page reuse and coalescing; summaries replace badge scans. No artificial request for an unchanged render. Media remain separately authorized. |
| Customer workshop directory/shop profile | `shops` pages, shop-filtered posts, shop/avatar/image access | Directory filters loaded rows locally; explicit next pages remain available. No full-directory server request per keystroke. |
| Garage / vehicle form / customer requests | `vehicles`, `requests`, photo list/view; explicit vehicle/request mutations | Existing 20-row cursors preserved. Request form loads vehicle/category/shop pages concurrently, not sequentially. Short cache shares pages across screens; categories last 60 seconds. Explicit refresh bypasses success freshness. |
| Request details / quote form / workshop quotations | `request`, `quotes`, explicit quote submit/withdraw | Detail reads are coalesced but not retained as successful cache entries. Server validates role, audience, version and quote terms on every write. |
| Quote comparison | Authoritative `request` comparison read on focus, foreground, 30-second poll and next offer expiry | Coalesced reads and failure backoff; full ranking remains authoritative. Existing recommendation scan caps at 501 offers and deduplicates shops. No new persistent recommendation cache. |
| Bookings / booking detail / receipts / payment choice | `bookings`, `booking`, `receipt`, payment capability; explicit confirmations, cancellation, simulated-payment operations | Lists cache for five seconds; details/receipt/capability only coalesce. Every mutation invalidates participating read caches, including ambiguous failures. Existing idempotency, amount checks and simulated-payment gates preserved. |
| Inbox / chat | `list` on focus and 15-second polling; `get` on focus and four-second active-chat polling; explicit open/enquire/consent/send/read | Focus/offline/AppState guards and loading lock already exist. Service coalescing prevents duplicate same-page reads. Four-second chat responsiveness retained; failures back off. Reads are not acknowledged by browsing or badges. |
| Notification history | `notifications` cursor pages and explicit `notificationRead` | Existing paginated history retained. Badge uses a distinct aggregate summary and does not mark anything read. |
| Account / profile photos / verification documents / workshop profile and location | Self photo status/view, documents/list; explicit upload/remove/profile/location changes | Existing profile-photo cache and revision isolation retained. Document and image authorization remain server-side. Six uploads/UID/minute and two simultaneous buffered uploads per process retained. |
| Login / registration / verification / password recovery / Google Sign-In | Firebase SDK calls, isolated onboarding Auth, Google exchange then authorize/profile calls | Firebase traffic is separate from Express quotas. Existing origin/native gates and revocation checks retained; Google exchange remains 12/IP/minute. Identity completion/authorization now have a separate strict 12/UID/minute budget. |
| Auth restoration / presence | Auth-state/network/foreground sync, profile Firestore snapshot, 60-second sync, 30-second session heartbeat | Existing sync lock/cache and health single flight retained. Session budget remains 12/UID/minute, separate from API work. No artificial keep-alive traffic added. |
| Administrator screens | Admin list/detail/actions; focused dashboard polls at 30 seconds | Still protected by the mutation/admin budget and existing admin claims/role checks. No cache of admin responses added. |
| PimpPilot | Existing shared authenticated transport and Express middleware | No product/provider/runtime refactor. Its existing strict mutation budget and specialized rate-limit error field remain. |

Supabase image bytes go directly to the returned storage URL; Express handles
authorization/signing, not every downloaded byte. Private URLs remain 60-second
bearer capabilities in memory. No public bucket conversion, lifetime extension,
service-key exposure or storage-policy change was made. The storage distinction
is documented in [Supabase's download guide](https://supabase.com/docs/guides/storage/serving/downloads).

## Implemented policies and efficiency changes

`backend/request-policy.cjs` uses explicit allowlists to classify RPC operations,
including POST reads. Unknown operations default to the strict mutation policy.
Case variants and HEAD are classified consistently with Express routing.

| Policy | Key / minute ceiling | Effect |
| --- | --- | --- |
| Authentication attempts | IP / 90 failed or in-flight attempts | Successful Firebase verification refunds the attempt, even if service authorization later denies access. Normal successful users on one NAT do not accumulate one common budget. |
| Browsing / summaries / metadata | UID / 60 | Separate from media and writes. |
| Private media access | UID / 60 | Shared by avatar, vehicle/request and showcase signing. |
| Mutations / admin / AI / unknown operations | UID / 60 | Existing sensitive aggregate ceiling preserved; malformed authenticated JSON also consumes this policy. |
| Identity completion / Google session authorization | UID / 12 | Stricter independent protection. |
| Session / presence | UID / 12 | Existing account ceiling retained. |
| Google exchange | IP / 12 | Existing ceiling retained; structured 429 response. |
| File uploads | UID / 6, plus mutation budget | Existing ceiling and authorization-before-multipart checks retained. |

This deliberately separates work by risk; it does not raise the existing
60-request ceilings. A user can perform more total legitimate work because
unrelated request classes no longer compete. Under abuse, failures can still
exhaust an IP's authentication budget and affect other users on that network;
simultaneous in-flight verification is also temporarily counted. Per-IP edge
protection and verified-account quotas serve different purposes.

The read coordinator is memory-only, bounded to 200 entries per service, keyed
by the current Firebase User object and canonical arguments. It shares in-flight
reads, caches ordinary lists for five seconds, categories for 60 seconds and
badge summaries for 30 seconds. Detail/chat/media authorization results are only
coalesced. Account replacement clears caches/backoff; old-session results are
rejected. Mutations invalidate all participating read caches; earlier in-flight
reads cannot refill those caches after invalidation. Explicit page refresh can
bypass successful freshness, but cannot bypass failure cooldowns.

Failures are shared for 5/10/20/40/60 seconds, reset after success. A 429 applies
the server retry deadline across read keys in that coordinator. No automatic
mutation replay or transport retry was added. Existing poll timers may still wake
during a cooldown, but the coordinator suppresses network dispatch. Existing
JSON/XHR plus REST errors expose `retryAt`/`retryAfterMs`; backend-generated 429s
always carry Retry-After, with a conservative 60-second fallback for service busy
conditions. CORS exposes retry and rate-policy headers.

Badges make one authenticated aggregate request each every 30 seconds. The
server derives recipient/participant identity from the authorized actor, not
request fields. Message summary sums existing received/read counters; notification
summary counts the caller's unread rows. Three explicit composite indexes are
included. Conversation writers already initialize both counters to zero; this
schema invariant must be preserved. Aggregates still scan index entries and are
not constant-cost as history grows. [Firestore documents their cost and index
requirements](https://firebase.google.com/docs/firestore/query-data/aggregation-queries).

Inbox list hydration now shares document/Auth reads within one page/request.
No cross-request caching of revocation or access eligibility was introduced.
Showcase substring search scans at most 200 post documents per request, shares
author profiles across batches and returns a continuation cursor for sparse
pages. Legacy numeric-page searches that cannot reach their offset within this
budget are rejected with instructions to use cursor pagination.

Private vehicle/request/showcase renewals stop on background/blur/offline and
renew at actual expiry. Photo and showcase services share concurrent identical
access requests. Authorization still runs for every dispatched signing request;
no signed-URL success cache was added outside the prior avatar fix. A placeholder
can briefly appear at expiry while a new signed URL is issued.

Metrics expose category/status counts, total duration and maximum duration via
`app.locals.requestMetrics()`. Structured aggregate logs emit after 60 seconds
on the next completed API request; there is no periodic idle timer. Timing covers
the complete API pipeline, not individual Firestore reads. Internal-error logs
now include only event/category/method/status/code. Frontend error console logs
include status only. Bodies, URLs/queries, exception messages/stacks, UIDs, IPs,
emails, tokens and signed URLs are excluded from these logs. Metrics reset on
restart and are not a durable monitoring backend.

## Controlled measurements

Reproduce with `node scripts/measure-request-performance.cjs`. The script loads
the original app/header source from committed `HEAD` (`781b0c5`), uses mocked
authentication/services and local ephemeral HTTP fixtures, and never starts the
production server. [Raw results](performance/local-measurements.json) identify
the full baseline commit. Badge counts execute the old/new header components;
navigation counts exercise the coordinator directly, not a complete device tour.

| Fixture | Before | After |
| --- | --- | --- |
| 100 conversations + 100 notifications; first minute of both badges | 40 API requests | 4 API requests (90% fewer) |
| Ten rapid visits across five identical page inputs within cache freshness | 50 dispatches | 5 dispatches (90% fewer) |
| 20 simultaneous identical page reads | 20 dispatches | 1 dispatch (95% fewer) |
| One user: 25 reads + 40 media + 5 mutations in a minute | 60 successes, 10 HTTP 429 | 70 successes, zero HTTP 429 |
| Two users behind one IP, 46 reads each | 90 successes, 2 HTTP 429 | 92 successes, zero HTTP 429 |
| Sparse 250-post search with one match after post 200 | Could read all 250 in one request | First request reads 200, cursor continuation reads remaining 50 and finds match |
| Twenty concurrent users on one IP, five waves (regression test) | Not measured | 100/100 successful requests |

Mock HTTP timing from this run: mixed-journey p50 14.91 -> 14.09 ms, p95
37.87 -> 50.84 ms; shared-IP p50 11.88 -> 13.28 ms, p95 42.11 -> 95.40 ms.
The tails increased under concurrent local test/build activity. These are noisy
Supertest/Express fixture timings, with no production Firebase/Storage/network
latency, and do **not** demonstrate a latency or capacity improvement. The
defensible improvements are dispatch counts, bounded query work and quota
isolation. No concurrent-user capacity promise can be made from these fixtures.

## Verification and readiness

See [verification results](performance/verification.md) for exact final commands,
counts, build hash and limitations. New coverage checks shared NATs/concurrent
accounts, read/media isolation, strict identity/auth/upload ceilings, malformed
JSON, account replacement, cache invalidation races, backoff and sparse-search
cursors. Real emulator tests verify aggregate totals across more than one page,
cross-account isolation, disabled accounts and unapproved workshops.

Before any separately authorized release: review the outstanding historical
compatibility guard, apply the three Firestore indexes and wait until ready,
release backend before frontend (the old backend has no summary operations),
then perform a small authorized customer/workshop smoke test. None of these
release actions was performed. Existing clients remain supported by the backend.
Do not roll back the backend alone while the new frontend is active.

## Growth architecture and remaining limits

1. **Current single instance:** retain Firebase Auth/Firestore and private storage.
   Observe category 429s, error rates, duration distributions, memory and Firestore
   reads/cost before changing capacity. Browser/native caches are an optimization,
   never an authorization source. Avoid caching current-account eligibility or
   sensitive booking/payment decisions. The current source still has some bounded
   per-row reads in workshop requests and payment receipt hydration; measure these
   before adding denormalization or batch APIs.

2. **Before multiple Express instances:** keep HTTP handlers stateless; Firebase
   tokens, durable mutation receipts and database transactions already externalize
   important state. Replace every process-local limiter (including Google/uploads)
   with atomic Redis-backed stores and unique policy/version prefixes. Preserve
   shared decrement/reset semantics and test NAT fairness, Redis failure and
   rolling restarts. Use fail-closed or explicitly conservative fallback behavior
   for sensitive limits, not silent unlimited traffic. Share any truly global
   concurrency constraints; the current two-upload semaphore is per process.
   The limiter library supports [external stores](https://github.com/express-rate-limit/express-rate-limit#data-stores).

3. **Cache deliberately:** begin with bounded per-instance caches for genuinely
   public/reference data. If replicas need shared caching, add short Redis TTLs,
   namespaced keys, coalescing and mutation invalidation. Private responses require
   account/context/version keys and current authorization; never globally cache
   signed URLs or use a CDN cache key that omits identity. Keep application JSON
   `Cache-Control: no-store`. CDN/static frontend assets are a separate concern.

4. **Firestore cost and queries:** retain cursor pagination and query-specific
   indexes; avoid numeric offsets, unbounded substring scans and automatic history
   traversal. For much larger histories, maintain unread-summary documents in the
   same transactions as message/read/notification writes, with reconciliation and
   migration validation before use. Consider indexed search only after bounded
   search becomes insufficient. Measure index fan-out and query plans; aggregates
   trade document transfer for index scans rather than eliminating growth cost.
   Preserve live eligibility checks even when batching document reads.

5. **Horizontal scaling and jobs:** use the platform load balancer, a verified
   proxy-hop configuration, readiness checks, graceful shutdown, request deadlines
   and per-instance resource limits. Move cleanup, reconciliation and thumbnail
   work to bounded durable jobs with idempotency, leases, retry jitter, dead-letter
   handling and metrics. Existing transactional email queues remain disabled;
   growth work does not authorize enabling their scheduler or dispatcher.

6. **Render:** Free currently sleeps after 15 idle minutes, may restart and cannot
   scale beyond one instance. These are latency/availability limits independent
   of application 429s; paid compute does not fix request amplification. Upgrade
   only when measured availability/memory/CPU needs justify it, after this work.
   A later paid deployment can use multiple load-balanced instances after shared
   limit/concurrency state is implemented. See [Free limitations](https://render.com/docs/free)
   and [scaling](https://render.com/docs/scaling). No Render settings were changed.

7. **Possible Azure move:** containerize the same Express app on a supported Node
   version; use Container Apps (or App Service), health probes, secrets management,
   managed identity for Azure-owned resources, shared managed Redis when needed,
   centralized aggregate telemetry and bounded jobs. Initially retain Firebase
   Auth, Firestore and Supabase Storage to avoid a simultaneous data/auth migration.
   Assess region-to-Firestore latency, egress, cold-start/minimum replicas and cost
   in a separate proposal. Use staged traffic/rollback and verify CORS, OAuth
   redirects, proxy keys and rate stores before cutover. Azure supports
   [HTTP/event-driven replica scaling](https://learn.microsoft.com/en-us/azure/container-apps/scale-app).

Limits remain intentional: heavy multi-image journeys can still exceed 60 media
accesses/minute; multiple devices/tabs share the same UID quota while browser
caches do not cross devices. Short cached lists can lag another user's changes
by five seconds, categories by 60 seconds, badge counts by 30 seconds. Existing
lists can retain rows/pages in UI memory while scrolling; very large feeds still
need later virtualization/eviction measurement. Free-host cold starts, storage
latency, Firestore index readiness and process-local rate state are not resolved
by the local request optimizations.
