# Smart quotation recommendations

Implemented locally on `lesley`. Recommendations are advisory, derived on each authorised
owner request read, and never persisted. The customer can inspect and select any quotation
that passes the existing acceptance rules. Recommendation eligibility does not add booking
or payment permissions. No live data, payment, media upload or deployment is required.

## Data and eligibility

The existing request, quotation, quotation-head and booking collections are reused.
Requests have optional `mandatoryServices` (up to 20 unique strings, at most 200 characters
each). The customer can enter these one per line in the existing service-request form.
Quotations have explicit `coveredServices`, `scopeConfirmed`, and `allChargesIncluded`
declarations. The shop sees the request description and requirements when preparing a quote
and can submit partial work without claiming full coverage.

An eligible recommendation must belong to the same open request, have submitted status,
unexpired validity, and a verifiable current terms version. It must be the quotation-head
offer (or the existing deterministic legacy ID if no head exists), from an active approved
shop with verified enabled Auth. The owner's vehicle and service category must remain
available. Direct requests must match the invited shop. Total must be positive integer ZAR
cents, at most R1,000,000, equal to the sum of valid positive line items. Required fees and
taxes must be included in those items, explicitly confirmed by the shop. Deposits are part
of the total, never added to it.

All exact mandatory requirements must be included in `coveredServices`, and the shop must
confirm that the full request description, vehicle and photo scope are included. The server
validates the coverage list against the current request. No keyword guessing, city matching
or broad shop-profile service text substitutes for coverage. These are auditable shop
declarations bound to the request terms version, not independent proof of workmanship.

Withdrawn, rejected, accepted, superseded, expired, stale, malformed and incomplete offers
never enter scoring. They remain in the existing quotation history. Older quotations
without coverage declarations remain inspectable and selectable under existing rules;
they cannot receive a comparative recommendation. Existing renewal/replacement rules apply.
Changing mandatory requirements or service coordinates advances the material terms version.
Older clients omitting these fields on request edits preserve them.

## Exact scoring

Let `p` be a quote's complete total and `pmin` the lowest eligible total:

| Factor | Default weight | Normalised value |
| --- | --- | --- |
| Price | 40% | `pmin / p` |
| Distance | 25% | `(dmax - d) / (dmax - dmin)`; 1 when all distances equal |
| Compatibility | 35% | 1 for full verified declarations; partial/unconfirmed quotes are excluded before scoring |

Score is `100 * weighted sum / sum of active weights`, rounded to four decimal places.
Full mandatory coverage is a strict gate, so its score is deliberately constant among
eligible offers. Price can never compensate for missing mandatory work.

If any eligible quote lacks a valid origin or destination, distance is removed for **all**
eligible quotes. The remaining weights are renormalised: price 40/75 and compatibility
35/75. Known distances can still be displayed. Missing coordinates never mean zero km.
Ties resolve by rounded score descending, total ascending, then quotation ID in ordinal
ascending order, independent of feed order, arrival time or locale.

Fewer than two eligible offers produces no winner and no ranks. Ranking includes all
submitted quotations for this request, independently of UI pagination. A bounded read of
501 submitted documents suppresses recommendations if there are more than 500; customers
can continue inspecting the normal paginated quotation list.

## Location and freshness

Only explicit `serviceRequests.serviceLocation = {latitude, longitude}` is an authoritative
origin. Destination is the shop profile's saved `shop.coordinates` with the same shape.
Coordinates must be finite numbers within latitude +/-90 and longitude +/-180; numeric
strings, missing values and out-of-range coordinates are rejected. The Haversine formula
uses mean Earth radius 6371.0088 km and reports **straight-line** distance, never road distance.
Comparison itself needs no device-location permission. Location selection is described in
[SHOP_LOCATIONS.md](SHOP_LOCATIONS.md); no geocoding or map subscriptions are introduced.

The shop account's Business Location section saves `shop.coordinates`, and the service-request
form saves `serviceLocation`. Both support current location, a map pin and manual coordinates,
with explicit confirmation. Text addresses and cities are preserved and never converted into
coordinates. Records without coordinates still show **Distance unavailable** and use the
conservative two-factor comparison. No location backfill or live-data migration was performed.

Scores recalculate on every owner request fetch, including subsequent quotation pages,
refresh and screen focus. The comparison additionally refreshes every 30 seconds while
focused and active, on app foreground, and at offer expiry. Thus remote changes can take
up to 30 seconds to appear; there is no new Firestore listener. Recommendation badges hide
while loading, offline, on errors, after the earliest eligible expiry, or on closed/booked
requests. Refresh clears selection and accumulated pages before loading fresh offers.
Existing transactional acceptance always rechecks current authoritative data.
If recommendation context cannot be fetched, the normal private quotation page remains
available with a generic temporary-unavailability message and no winner.

## Files and verification

- `backend/quote-recommendations.cjs`: pure eligibility, distance and scoring functions.
- `backend/quote-recommendation-read.cjs`: bounded owner-only authoritative context reads.
- `backend/marketplace.cjs`, `backend/marketplace-domain.cjs`: existing API integration,
  field validation, coverage and material request versioning.
- `src/features/marketplace/screens/QuoteComparisonScreen.js`: recommendation presentation,
  ranks, explanations, expiry and foreground refresh.
- `OwnerMarketplaceScreens.js`, `ShopMarketplaceScreens.js` in the same directory:
  customer requirements and shop coverage/price declarations.
- `tests/quote-recommendations.test.cjs`, `tests/quote-comparison.test.cjs`,
  `tests/marketplace-owner.test.cjs`, `tests/marketplace-shop.test.cjs`, `backend/test/marketplace.test.cjs`: focused algorithm,
  UI, privacy, head validity, account status, versioning and booking safeguards.

Run with Node 22 using the existing `npm test`, `npm run test:backend` and
`npm run test:security` commands. Security tests require the existing local demo Auth and
Firestore emulators and refuse non-loopback emulator hosts. No Firestore score fields,
indexes, access-rule changes, maps dependencies or separate test infrastructure are added.

Verified locally with Node **22.23.3**:

| Check | Result |
| --- | --- |
| Application suite (`node --test tests/*.test.cjs`) | 340 passed, 0 failed |
| Existing backend suite (`npm test --prefix backend`) | 226 passed, 0 failed |
| Existing Auth/Firestore emulator security runner | 70 passed, 0 failed across five suites |
| Expo web export (offline, dotenv loading disabled) | Passed |
| `git diff --check` | Passed |

Logs and the generated web export are under the existing ignored `.local-checks/`
directory with `recommendations-*` filenames and `quotation-recommendations-web/`.
The emulator run used only `demo-pmr-security` and loopback services. Native device
rendering was not manually exercised. Changes remain uncommitted; no push or deployment
was performed.
