# Find Jobs request attachments

Implemented in the original project on `lesley`.

## Root cause

Request publication already saves ordered immutable `photoIds` and safe `photos`
metadata. The Express `requests` operation already includes both fields in authorised
shop feed responses, including subsequent pages. Find Jobs rendered only request text;
its cards had no attachment/image component. Showcase cards already render their images.
No upload, storage configuration or request-persistence defect was found in this path.

## Correction

`RequestPhotos` is now included in Find Jobs service-request cards and invited direct
request cards. It renders up to the existing five-photo limit in saved `photoIds` order.
Each ID uses the existing `viewPhoto('request', requestId, photoId, uid)` API mechanism.
Tapping a thumbnail opens a larger preview without another signing request.

Signed URLs remain only in focused account-local component state. The component renews
them before expiry, clears them on account/focus/offline changes, ignores stale responses,
and does not re-request them merely because a feed object is refreshed or another page
is appended. Failures show a generic placeholder with explicit retry, without a retry
loop. Persisted metadata URLs are never rendered. Existing photoIds-only records work;
records without usable IDs show an unavailable placeholder rather than guessing paths.

There are no changes to feed sorting, filters, cursors or the showcase renderer.

## Privacy and retention

The component never lists Garage photos or calls the vehicle-preview endpoint. Existing
Express checks require an eligible authenticated shop, authorised request audience/status,
and membership of the exact photo ID in that request's attachments before signing.
Unattached Garage IDs, another shop's direct invitations and closed unbooked requests
remain inaccessible. Existing booking access and PMR-02 retention remain unchanged.
The tests also verify that an attached image survives removal from the current Garage.

## Files changed for this correction

- `src/features/marketplace/components/RequestPhotos.js`: ordered previews, renewal,
  placeholders, account cleanup and enlarged preview.
- `src/features/marketplace/screens/ShopMarketplaceScreens.js`: card integration.
- `tests/marketplace-shop.test.cjs`: actual Find Jobs images, preview, refresh and pagination.
- `tests/request-photos.test.cjs`: renewal, failures, stale responses and ID-only handling.
- `backend/test/marketplace.test.cjs`: feed attachments across real query pagination logic.
- `backend/test/photos.test.cjs`: attached-only and direct-request authorisation regressions.
- `backend/test/photos-integration.test.cjs`: emulator-backed HTTP feed and private previews.
- This document.

No production data, bucket privacy/policies, backend source, Firestore rules/indexes,
mock-payment safeguards or upload transport were changed by this correction. Earlier
uncommitted upload corrections were preserved. No commits, pushes or deployments occurred.
The updated Expo client is needed to show the photos; this correction requires no new
backend, schema, bucket or index deployment. Physical-device preview testing remains
outside the automated local checks.

## Verification

Node **22.23.3**: **363 application tests**, **241 backend tests**, and **13 Firebase
Auth/Firestore emulator tests** passed with zero failures. The emulator run includes
9 photo tests and 4 existing showcase tests, with synthetic storage adapters only.
The new card regression first reproduced zero images for two saved attachments;
it now verifies two ordered images, enlarged preview, refresh and pagination. Additional
checks cover renewal, placeholders, stale responses, attached-only access, direct-request
denial and retention after Garage removal. `git diff --check` passed.
Logs are in the existing ignored `.local-checks/request-photo-*` files.
