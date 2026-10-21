# Workshop and service locations

Location management reuses the existing user profile, service request and Haversine
recommendation engine. It adds no collections, map API keys or payment providers.

## Shop owner flow

In the existing shop account/profile screen, open **Business Location**. Choose:

- **Use current location**: requests foreground permission only after this button is pressed.
- **Choose on map**: tap a point or drag the pin, then review its coordinates. Pan and zoom
  use Leaflet 1.9.4 with attributed OpenStreetMap tiles. The initial South Africa overview
  has no selected point and is never saved as a location.
- Manual latitude/longitude, followed by **Preview coordinates**, as a fallback.

Press **Confirm selected location**, review the selected coordinates, then **Save business
location**. Cancelling the picker leaves the previous selection intact. Removing a location
also requires saving before it changes the profile. Failed saves preserve the draft and
retry key. Account switches reset drafts; late device results after unmount are ignored.
**Reload saved business location** discards an unsaved draft and fetches the current profile,
including after another session has changed its coordinates.

The existing authenticated `/api/profile` route accepts `op: shopLocationSave`, coordinates,
the previously saved coordinates and a retry key. It derives the target solely from the
authenticated UID and rejects supplied target IDs. Live Auth verification, revocation,
account status, shop role and pending account-operation checks protect the write. The
transaction compares the previous coordinates to prevent lost updates. It updates only
`shop.coordinates`, preserving all saved profile text and audit history. Existing admin
text-profile edits also preserve coordinates. No direct Firestore client writes are enabled.

## Customer flow and quotation distance

The existing create/edit service-request form includes the same **Service location** picker.
Confirmation updates the local form; submitting/saving the request persists `serviceLocation`.
The customer can leave the location unset or explicitly remove it. Existing request ownership
and optimistic version checks apply. Coordinate changes and removal are material terms
changes: they advance `termsVersion` and prevent stale quotations from being recommended or
accepted. Saving identical coordinates does not itself change material terms.

The recommendation engine remains unchanged. It calculates straight-line Haversine kilometres
from `serviceLocation` to each current `shop.coordinates`. A workshop move is picked up on the
next authoritative comparison fetch (the existing active screen refreshes every 30 seconds).
It does not invalidate the request's quotation terms. Missing coordinates still mean
**Distance unavailable**, with distance excluded from all eligible candidates' scores.
Zero latitude or longitude is valid; missing values and text addresses never become zero.

## Validation, permissions and maps

Saved coordinates must be finite numeric latitude in [-90, 90] and longitude in [-180, 180].
Blank inputs, numeric strings in API writes, NaN/infinity and out-of-range values are rejected.
Coordinates are displayed to six decimals for review. Device locations can be approximate;
users should inspect the selected point before confirming it.

Only foreground permission is configured through the Expo location plugin. Opening account,
request, comparison or map screens never requests device-location access. Permission denial,
GPS errors and timeouts leave map/manual selection available. There is no background tracking,
geocoding or automatic coordinate population from saved addresses or cities.

The native map uses `react-native-webview` 13.16.1; current location uses `expo-location`
~57.0.16, matching the installed Expo SDK's bundled-module versions. Web uses an iframe.
Map selections validate message origin/source on web and validate channel/numeric coordinates
on both platforms. Map messages never directly save profile/request data. Leaflet assets use
fixed versions and integrity hashes; the document has a restricted content security policy.
Native map requests identify PimpMyRide with a stable User-Agent. Tile loading uses browser
HTTP caches, visible attribution and no background/bulk tile downloads.

Maps require online access to the Leaflet CDN and OpenStreetMap; unavailable tiles do not
prevent manual coordinate entry. Current location on web needs HTTPS or localhost and browser
permission. Native builds must incorporate the added packages and permission configuration;
a rebuild may be required. No physical-device permission/GPS interaction was manually tested.

References: [Leaflet setup](https://leafletjs.com/examples/quick-start/) and
[OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/).
The public map service provides best-effort availability, without a paid service agreement.

## Changed files

- `app.json`, `package.json`, `package-lock.json`: foreground-location configuration and
  SDK-compatible dependencies.
- `backend/shop-location.cjs`, `backend/services.cjs`: authenticated profile write and
  coordinate preservation during existing admin text edits.
- `src/shared/location/location.js`, `mapDocument.js`, `LocationMap.js`, `LocationPicker.js`:
  validation, permission action, map and reusable confirmed-selection UI.
- `src/features/auth/components/BusinessLocation.js`, `src/features/auth/screens/AccountScreen.js`:
  the shop profile section and save flow.
- `src/features/marketplace/screens/OwnerMarketplaceScreens.js`: service-location form binding.
- `tests/location-management.test.cjs`, `tests/marketplace-owner.test.cjs`,
  `backend/test/security.test.cjs`, `backend/test/marketplace.test.cjs`,
  `backend/test/marketplace-integration.test.cjs`: selection, permissions, saving, authorisation,
  versioning, recalculation and emulator integration coverage.
- `docs/SMART_QUOTATIONS.md`, `docs/SHOP_LOCATIONS.md`: updated location documentation.

Verification uses the existing Node 22 application/backend suites, Auth/Firestore demo
emulator runner and Expo web export. No live Firebase/Supabase records, real payments,
photo uploads, branches, worktrees or deployments are required.

## Verification results

Run locally with Node **22.23.3**:

| Check | Result |
| --- | --- |
| Application suite (`node --test tests/*.test.cjs`) | 340 passed, 0 failed |
| Backend suite (`npm test --prefix backend`) | 226 passed, 0 failed |
| Existing demo Auth/Firestore security runner | 70 passed, 0 failed across five suites |
| Expo Android, iOS and web export (`--platform all`) | Passed, including native Hermes bytecode |
| Native permission configuration introspection | Foreground only; no always, motion or background-location permission |
| `git diff --check` | Passed |

The emulator suite includes a new test that saves workshop coordinates through the actual
profile service, checks an approximately **111.195 km** straight-line distance for one degree
of longitude at the equator, moves the workshop to change the recommendation, and changes
the request origin to invalidate old quotations. Tests also cover role/ownership denial,
stale writes, missing coordinates, zero coordinates, permission timing/denial, pin selection,
confirmation, cancellation, account switching and recovery after a stale-save conflict.

Logs and exports are in the existing ignored `.local-checks/` directory using `location-*`
names. Emulator data was synthetic and confined to `demo-pmr-security`; test emulators were
shut down after the run. Changes remain local and uncommitted on `lesley`.
