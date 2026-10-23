# Quotations UI journey redesign

Implemented in the original PimpMyRide repository on `lesley`. Existing
uncommitted Notifications, Messaging and Garage changes are preserved.

## Actual journey before and after

| Role | Existing journey | Redesigned journey |
| --- | --- | --- |
| Shop | Find Jobs / direct Requests → ShopRequest → QuoteForm → immediate submission → ShopQuotes | Same routes, with styled request context → grouped quotation fields → explicit review dialog → confirmed submission → quotation status/history |
| Customer | Notification or My Requests → OwnerRequest → QuoteComparison → select quotation → PaymentChoice → existing confirmation → BookingDetail | Same routes and decision contract, with richer cards, quotation detail dialogs, comparison steps, a responsive offer grid and clearer terms |

The implementation has no in-place edit operation for a current submitted offer
and no customer decline operation. Expired offers can be renewed; outdated
offers can be replaced with a separate historical quotation. Withdrawal is final.
The redesign does not invent Edit, Decline or resubmission permissions.

Acceptance remains in the existing PaymentChoice flow. This task adds no checkout,
payment collection or direct acceptance call. PaymentChoice and booking screens
were not modified. Selecting a quotation still performs no mutation.

## Shop improvements

- Clear request/vehicle context, current request eligibility, scoped page styling,
  safe areas, existing role navigation and a keyboard-aware form layout.
- Grouped scope, item pricing, turnaround, warranty, validity and existing deposit
  fields. Required indicators and range/format helper text preserve input labels
  used for accessibility and validation.
- A Build quotation → Review offer → Submitted progress indicator.
- Review shows the actual request reference/revision, supplied workshop name when
  available, line amounts, total, deposit, working days, warranty, validity days,
  scope coverage, included mandatory services and fee/tax confirmation.
- Back to edit preserves the draft. Review never submits. Final submission retains
  the original payload, financial calculations and synchronous duplicate-send lock.
- A changed request revision closes review; a different request snapshot must be
  reviewed again before submission. Network errors disable review and preserve
  draft fields. Success appears only after the existing API resolves successfully.
- My quotations gains responsive cards, readable status/terms, detail dialogs and
  existing request/booking/confirmed withdrawal actions.

## Customer improvements

- Private quotation cards on the request screen show workshop identity, a prominent
  stored ZAR total, deposit, turnaround, warranty, validity and supplied timestamps.
- View details opens full scope, existing items and request/vehicle context without
  introducing a route or fetching a different quotation.
- Comparison keeps the existing selection contract, current-request checks,
  expiry handling, pagination and polling. Offers form a single mobile column or
  two desktop columns, with consistent metric groups and progress guidance.
- Existing server recommendations/rankings, explanations, distance limitations and
  free selection remain intact. No ratings, rankings or prices are invented.
- Closed, booked, withdrawn, expired, superseded and unverifiable-term cases retain
  their existing restrictions. Existing booking links remain available.
- Owner request quotation history now resets when the account or request changes.

## Files changed for this task

- `src/features/marketplace/components/QuotationUI.js`: scoped page, card, details,
  action, section, empty-state and progression components.
- `src/features/marketplace/screens/ShopMarketplaceScreens.js`: quotation-facing
  request details, preparation/review and My quotations; discovery feeds unchanged.
- `src/features/marketplace/screens/QuoteComparisonScreen.js`: presentation only;
  comparison, recommendation, refresh and selection rules retained.
- `src/features/marketplace/screens/OwnerMarketplaceScreens.js`: quotation-facing
  OwnerRequest screen only, plus necessary imports; Garage and forms preserved.
- `tests/marketplace-shop.test.cjs`: existing submission checks now traverse review;
  additional review/back-to-edit/stale-snapshot/error checks.
- `tests/quote-comparison.test.cjs`: finds the new scroll container.
- `tests/quotations-ui.test.cjs`: focused card/detail/role/theme/layout coverage.
- `tests/helpers/load-ui.cjs`: adds a keyboard-dismiss stub.
- `docs/QUOTATIONS_UI_REDESIGN.md`.

## Preserved behavior and safeguards

No Express APIs, Firestore schemas, service hooks, stored quotation values,
financial/deposit calculations, permissions or lifecycle rules were changed.
No production writes were used for verification.

- Request association and terms-version eligibility, private quotation visibility
  and existing customer/shop roles.
- Exact scope, item cents, deposit values, turnaround and validity payloads.
- Historical renewal/replacement semantics, accepted/withdrawn restrictions and
  confirmed withdrawal with duplicate-request protection.
- Existing comparison polling/expiry timers, page merging, authoritative
  recommendation data, selection invalidation and freely choosing eligible offers.
- Existing quotation notification destinations and contextual ConversationAction
  behavior, including customer initiation and enquiry restrictions.
- Existing acceptance/payment-choice/booking confirmation and recovery behavior.
- Existing Firebase/Supabase integrations and previous UI improvements.

## Verification

Node 22.23.3, using the existing ignored local runtime:

```powershell
$pmrNode = (Resolve-Path '.local-checks/pmr-tools/node22/node-v22.23.3-win-x64/node.exe').Path
& $pmrNode --test tests/*.test.cjs
& $pmrNode node_modules/expo/bin/cli export --platform all --output-dir .local-checks/quotations-export
```

Focused tests cover fields/validation, exact cents and ZAR presentation, deposit
terms, review without writes, back-to-edit, stale reviews, duplicate submission,
failure retention, renewal/replacement, current-offer restrictions, confirmed
withdrawal, customer comparison/selection, statuses, detail context, optional
data, role navigation, keyboard configuration, safe areas and theme contrast.
The unchanged notification, messaging, payment-choice and booking suites cover
their existing integration paths. A decline action cannot be tested as a user
operation because no such operation exists; historical declined states are
rendered read-only.

Final application result: **424/424 tests passed under Node 22.23.3**, including
all previous UI suites. The focused quotation/shop/comparison run passed 44/44.
`git diff --check` passed.
Expo exports passed for **iOS, Android and Web** in
`.local-checks/quotations-export`, including native Hermes bytecode. The installed
Hermes compiler required execution outside the filesystem sandbox. These are
local artifacts; no publication or deployment occurred.

## Outstanding browser/device checks

- iOS/Android keyboard avoidance, keyboard dismissal before review, safe areas,
  scrolling long item lists, large fonts and native back gestures.
- VoiceOver/TalkBack announcements and modal focus for review/detail dialogs.
- Real browser narrow/desktop layouts, keyboard navigation, focus trapping/return
  and long scope/warranty wrapping.
- Actual scroll smoothness and pagination with a large quotation history.
- Live submission/acceptance checks only with separately authorised disposable
  test records. No production quotation, payment or booking writes were performed.

UI tests use native component stubs; Expo exports verify bundling. Neither is a
physical-device or browser visual review.

No commits, pushes, deployments, branches, worktrees or new projects were created.
