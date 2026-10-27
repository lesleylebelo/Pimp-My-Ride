# PimpPilot Studio customer interface

Implemented in the original application on `lesley`. No commit, push or deployment.

## Existing implementation audit

- `OwnerNavigator.js` already registered one customer-only `PimpPilotStudio` stack route. Garage already provided a vehicle-specific launch action. The five customer destinations remain Discover, Garage, Requests, Bookings and Profile.
- `PimpPilotStudioScreen.js` already supported optional Gallery photos, JPEG conversion, a 1 MB image limit, plan/refinement requests, six prior turns, selection, departure protection and account/focus isolation. Its presentation was a single form without landing, in-screen vehicle choice, interests, conversation recap or a distinct concept preview.
- `pimpPilotStudio.js` already called `/api/ai/studio` with the expected account identity and built selected-work drafts under the existing 300-character description limit.
- `RequestFormScreen` already accepts a Studio draft only for its current account, preserves existing request edits and requires normal explicit submission. That transfer mechanism is reused unchanged.
- The API takes only `vehicleId`, `message`, `history` and optional JPEG `image`. There is no category enum. Interests use the supported visual styling, mechanical improvements, repairs and maintenance domains as message text; no API fields were added.
- Plans contain `objective`, `observations`, `assumptions`, `modifications` (title, scope, parts, tradeOffs), `considerations` and `questions`. Image editing is unavailable. The frontend checks rendering prerequisites before accepting a response.
- Studio availability is controlled by the backend provider flag. There is no availability-probe endpoint. No generation happens on mount, vehicle selection, photo selection or interest selection. An explicit action is required; backend `api/unavailable` / HTTP 503 produces the unavailable state. Local inputs remain intact.
- The old error handler checked unprefixed error codes although the API client uses `api/…`. The screen now handles those codes correctly.
- Shared CustomerPage/MarketplaceUI provides safe areas, a scrolling layout, keyboard handling, theme tokens and existing action/card/input components. Private Garage images retain the existing signed-access component.

## Design and navigation

The design uses theme surfaces, lime accents, generous rounded cards, a stylised car icon from the existing icon system, numbered workflow steps and clear typographic hierarchy. No external imagery, packages or generated recommendations were introduced.

1. **Discover → Open PimpPilot Studio:** landing identity, workflow and availability explanation.
2. **Start New Concept:** authenticated active Garage selection, private images where available, paging, loading/error/retry/empty states. Known foreign and archived entries are excluded; backend ownership remains authoritative.
3. **Vehicle → workspace:** summary, original-photo preview, Gallery and native Camera controls, interest chips and optional instructions. Garage's existing action opens this same workspace directly.
4. **Prepare plan → review:** actual API output, distinct observations/assumptions, proposed-work selection, considerations and workshop questions. Empty plans invite refinement. A recap displays the last six conversation turns.
5. **Refine plan:** sends bounded prior context and the latest direction; failed attempts retain input and any previous plan. Selection resets when a new plan or photo replaces the previous one.
6. **Transfer selected work:** preview and confirmation open the existing unsaved RequestForm. Nothing is submitted, published, booked, charged or sent to a workshop by Studio.

Back navigation uses the existing customer shell. Unsaved work prompts in an accessible modal. Choosing another vehicle preserves the current workspace until a replacement is selected, with a Keep current vehicle action. Leaving/focus loss and account changes discard private session context.

## Changed files

- `src/features/customer/screens/CustomerDiscoverScreen.js`: visible Studio launch card.
- `src/features/customer/components/CustomerUI.js`: maps the Studio route to Discover navigation without adding a tab.
- `src/features/marketplace/screens/PimpPilotStudioScreen.js`: extends the existing route and lifecycle.
- `src/features/marketplace/components/StudioUI.js`: landing, headings, workflow, Garage selector, interests and original-image preview boundary.
- `src/features/marketplace/services/pimpPilotStudio.js`: response rendering guard; existing transport and transfer remain intact.
- `tests/pimppilot-studio.test.cjs`: extended fixture-based behavioral coverage.
- This document: audit, design, validation and manual review guidance.

## Validation

- `npm.cmd test`: **618 / 618 passed** during the main regression run, including Customer and Workshop presentation/navigation coverage and the then-current 12 Studio tests.
- Final `node --test tests/pimppilot-studio.test.cjs`: **14 / 14 passed**, including the subsequent departure-modal and vehicle-switch checks. The main suite was not repeated after these focused changes.
- `node --test backend/test/ai-studio.test.cjs`: **6 / 6 passed**, using mocked providers/data; ownership, authentication, JPEG/history validation and no-write behavior remain intact.
- `npm.cmd run build:web`: **passed**, including the final production Expo Web export (804 modules) and the repository's export verification after all frontend changes.
- `git diff --check`: passed.
- No lint or typecheck script is configured in package.json. No native binary build or real-device review was performed.

Test fixtures remain inside automated tests; no runtime fake recommendations or successful AI simulations were added. Build verification uses the repository's existing verification script; no deployment was performed.

## Limitations

- With Studio disabled, preparing a plan produces an honest unavailable state. UI work does not enable the provider. Live AI success requires the separately maintained backend to be available.
- Edited images are explicitly **Not available yet**. `StudioConceptPreview` is the future integration boundary; it currently accepts only the original selected photo.
- Garage images display using existing private access, but are not silently downloaded or sent for AI analysis. Customers explicitly select a local photo for analysis.
- Sessions are memory-only, not persisted drafts. Departure clears local Studio content.
- Native permission prompts, Camera/Gallery interaction and rendered responsive layout still need device/browser review. The in-app Browser connection was unavailable in this execution session.

## Manual mobile / Web review

1. Run `npm.cmd run web` or the existing Expo native workflow. Sign in with an existing test customer. Do not create production test records.
2. On Discover, open Studio, read the landing and start a concept. Confirm the five bottom destinations remain available. Back should return safely.
3. Choose an active Garage vehicle; inspect make/model/year and any private photo. Check paging, empty Garage and retry behavior. An archived vehicle must not be selectable. Repeat with another customer account to verify isolation.
4. From Garage, use the existing vehicle-specific Studio action. Confirm it opens the same route with that vehicle selected. Choose another vehicle, cancel with Keep current vehicle, then actually switch and confirm prior concept content clears.
5. Pick a Gallery photo; inspect the original preview, replace and remove it. On native, test camera permission grant and denial. Test cancellation and a photo too large after conversion.
6. Toggle interests; send with instructions, with only interests and with blank input. Empty input must disable analysis. Overlong combined input must show validation without an API request.
7. While offline, edit local ideas and confirm analysis remains disabled. Reconnect, press Prepare plan once, and confirm loading prevents repeat calls.
8. With the existing disabled backend, confirm unavailable copy, preserved instructions/photo, explicit retry and no generated recommendations. Do not enable a live flag for testing.
9. Real plan rendering, empty/malformed responses, errors, refinement, selection and transfer are covered by automated test fixtures. When a separately authorised working backend is available, review the real result; select/deselect work, inspect the 300-character draft constraint and confirm transfer opens an unsaved request. Stop before submission during a production review.
10. Exercise back navigation with content: Stay retains the session; Leave clears it. Sign out/switch accounts during a pending request and confirm no late private result appears.
11. Review at 320/390 px mobile, tablet and desktop widths, in both themes and with increased text size. Check wrapping, scroll reachability, image containment, keyboard avoidance, focus indicators, labels and touch targets. No horizontal overflow should occur.
12. Revisit Discover showcases/workshop filters, Garage, Requests, Bookings and Profile. Smoke-check Workshop and Admin navigation with existing accounts; their routes were not changed.
