# Vehicle → service request → private quotation

The user approved this milestone after stabilization. It is implemented locally;
there has been no deployment, production test write, commit or push by Codex.
Work resumed on the user's `a4bed3a` commit and preserves earlier changes.

This document records the first marketplace slice. Its statements that acceptance
and bookings are future work are superseded by [BOOKING_MILESTONE.md](BOOKING_MILESTONE.md),
which documents the subsequently approved and implemented booking extension.

## What works

| Role | Implemented workflow |
| --- | --- |
| Verified active owner | Add multiple vehicles; edit with version checks; archive and restore; browse paginated active categories and eligible shops; create open or direct requests; view request history and private quotations; close a request |
| Verified active approved shop | Browse open opportunities and its direct invitations; inspect a request without customer contact details or registration; submit one private line-item quote; view its quote history; withdraw its own submitted quote |
| Admin | Existing account/shop approval and category tools supply marketplace eligibility; the new marketplace API does not grant admin access to private owner/shop records |

Owner navigation now connects Discover → Garage/My Requests and their detail
forms. The shop landing screen now loads actual jobs rather than the sample
request. Requests, Quotes and account tabs are connected. Bookings, showcase
discovery, notifications and other unfinished tabs remain labelled as future
features. The former `ShopHomeScreen` import forwards to the live jobs screen.

The Figma MCP was read successfully on 23 September 2026. Relevant context:
`132:37` Add Vehicle, `13:369` request details, `177:47` Prepare Quote, and the
page journey inventory. Fields, green/grey/white surfaces and shared Inter styles
follow that direction using existing React Native components. Prototype example
text is replaced with real fields/data. The simpler form layout covers this
milestone without presenting the prototype's unimplemented photo step as working.
No Figma writes or broad visual redesign occurred.

## Boundaries and behavior

- Vehicle fields: make, model, year, colour, registration. Registration is only
  returned to the owner. A request holds an immutable make/model/year/colour
  snapshot, so later edits cannot silently change work already quoted.
- Request fields: selected vehicle and active category, title, description up to
  300 characters, city, minimum/maximum budget, optional preferred date, and open
  versus one selected approved shop. Date validation uses the South African
  calendar day. The API does not accept a supplied owner identity or status.
- Open requests are visible to eligible shops; direct requests only to their
  chosen shop. Owner, vehicle and category eligibility are checked when browsing
  and before a quote is committed. Restricting the owner or archiving the vehicle
  or category hides affected opportunities; owner and quotation history remain.
- Requests start `open` and can become `closed`. Closing prevents further quotes
  and does not accept a quote or create a booking. Published requests cannot be
  edited/reopened in this slice; close and create a new request when necessary.
- Quotes have 1–10 line items, scope, completion estimate, optional warranty and
  1–90 days of validity. Amounts are integer cents, totals are computed on the
  server, currency is ZAR, and the maximum is R1,000,000. No floating-point price
  arithmetic or client-supplied total is trusted by the backend.
- One quote per shop/request is enforced by a deterministic document identity.
  A submitted quote can become `withdrawn`; it cannot be edited/replaced or
  resubmitted in this slice. The validity deadline is displayed as expired when
  appropriate; no scheduler changes its stored status. Customers can read offers
  together, but selection/acceptance, booking and payments are not implemented.
- Photos, portfolios, camera/GPS/maps, chat and marketplace notifications remain
  future work. Existing private verification-document upload behavior is retained.

## Code and API map

| Location | Responsibility |
| --- | --- |
| `src/features/marketplace/OwnerNavigator.js`, `ShopNavigator.js` | Role-specific nested routes beneath existing trusted root routing |
| `screens/OwnerMarketplaceScreens.js` | Garage, vehicle form, request form/list/detail and quote reading |
| `screens/ShopMarketplaceScreens.js` | Open/direct feeds, detail, quote form/history and withdrawal |
| `components/MarketplaceUI.js`, `utils/validation.js` | Shared fields, paging, quote display, decimal conversion and live validation |
| `services/marketApi.js`, `hooks/useMarketData.js` | Actor-bound API calls, bounded retry identity, focus/reconnect refresh and stale-response suppression |
| `backend/marketplace.cjs`, `marketplace-domain.cjs` | Authoritative access, transactions, redaction, validation and audit |
| `backend/app.cjs`, `services.cjs` | Existing token middleware and new authenticated endpoint wiring |
| `firestore.indexes.json` | Vehicle and open/direct request composite indexes |

All operations use authenticated `POST /api/marketplace` with JSON `{op,...}`.
Read operations: `vehicles`, `categories`, `shops`, `requests`, `request`,
`quotes`. Mutation operations: `vehicleSave`, `vehicleArchive`, `requestCreate`,
`requestClose`, `quoteSubmit`, `quoteWithdraw`. Mutation `requestId` is a retry
key; quote submissions name the target request with `serviceRequestId`.

Vehicle/category/shop/feed/quote-history responses have `{items,cursor}` and
return at most 20 items. Owner detail uses `{id,quotesCursor}` and returns
`{request,quotes,quotesCursor}` with up to 20 quotes. Shop detail returns only
that shop's quote. Filters can produce an empty eligible page with a next cursor;
the UI keeps Next available. Search and distance ranking are not implemented.

## Data and security

| Collection | Record and protection |
| --- | --- |
| `vehicles` | `ownerId`, private registration, version, archive state and timestamps; owner-only API |
| `serviceRequests` | Trusted owner/vehicle/category IDs, snapshot, target/audience and status; audience checked on every read/write |
| `quotations` | Deterministic request/shop identity, computed amount, terms, validity/status; owner or author only |
| `mutationReceipts`, `auditLogs` | Transactional receipt and action record with server actor/timestamps; clients cannot write directly |

Firestore denies direct client reads/writes to all three new collections,
including administrators. The rule suite tests this explicitly. Admin SDK access
is permitted only after the existing API verifies the token with revocation
checks, current enabled/verified Auth account, and active trusted profile.
Marketplace transactions recheck mutable profile/approval and related resource
state before writes. Unknown client fields, other owners' vehicles, stale vehicle
versions, unauthorised direct targets, duplicate quotes and closed requests fail.
Identity and operation keys are bound to the authenticated actor.

Vehicle edits/archive, request/quote creation and state transitions write their
receipt and audit in the same Firestore transaction. Retrying the same key/data
returns the recorded result; conflicting data is rejected. A preferred-date
deadline is checked only when creating, so a committed request can still be
retrieved by retry after that date passes. This is request retry safety, not an
unlimited offline queue: the client retains at most 50 unresolved keys in memory.
Restart, account switching or eviction loses that client retry identity. Refresh
existing records before repeating an uncertain action after those events.

Marketplace records, registration numbers and drafts are not added to AsyncStorage.
Calls require a connection; focus/reconnection reads current server data. Offline,
account/vehicle changes and late responses cannot display another account's data
or silently save its prior draft. Existing limited landing-cache behavior remains.

## Verification

Mock/component tests exercise actual form callbacks, required/length/date/money
validation, pagination, confirmation/cancel, duplicate tap locks, failed drafts,
account changes, reconnect, delayed responses and private quote presentation.
Backend tests cover role/ownership/audience checks, redaction, transaction retry,
snapshot consistency, version checks, resource restrictions and state transitions.

The isolated Auth/Firestore emulator suite runs the actual HTTP endpoint with
emulator-issued tokens: register vehicle → publish request → browse as approved
shop → submit quote → view as owner → withdraw → close. Additional tests prove
direct request and competing-quote isolation, denied roles, revocation, concurrent
duplicate submissions and version conflicts, and paging. Supabase is mocked;
no production project or real identity document is used.

Final totals/build results are in PROJECT_HANDOVER.md. Tests run on the available
Node 24.14.0; the Render target remains Node 22.x. A web export proves bundling,
not device/browser interaction or production configuration. No delivered-email
or live Firebase/Supabase security-policy verification is claimed.

## Setup and release steps

Use OPERATIONS.md for existing configuration and commands. No package dependency
or billing upgrade is needed. The API needs the existing Firebase server identity;
this milestone introduces no additional secret or storage bucket.

After separately authorized review/release, publish the listed Firestore indexes
and wait until they are ready, release the backend with `/api/marketplace`, then
the client. Existing deny-by-default rules already block these collections; keep
that policy. Emulator success does not prove production indexes are deployed.
Do not add client read/write exceptions to bypass backend checks.

There is no production seeding step. In a separately authorized test environment,
use a verified owner, an approved enabled shop and an active service category;
the existing admin tools manage category/approval. Empty lists in a fresh
environment are expected. No fabricated production vehicles or requests are
created automatically. Revalidate on Node 22 and smoke-test actual web/native
interactions before a release.

Suggested commit message: `feat: connect vehicle requests to private shop quotations`.
The subsequent approved comparison/selection and booking slice is documented in
BOOKING_MILESTONE.md. Request photos and richer discovery remain future work.
