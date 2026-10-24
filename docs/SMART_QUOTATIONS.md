# Smart quotation comparison

## Diagnosis and repaired journey

All work uses the original application on `lesley`, the existing Express `/api/marketplace` endpoint, Firebase Authentication/Firestore project `pimp-my-ride-a26fc`, and the existing Render service. There is no additional backend, collection, project, provider or dependency.

The reproducible code defects were:

1. Ordinary quotations default to unconfirmed full scope/all charges. The old algorithm correctly refused to rank them, but returned no explanatory state; the screen displayed no smart-analysis result. They now remain comparable with their stated terms and an explicit insufficient-information explanation. The coverage gate is preserved.
2. Equal scores produced a supposed winner using quotation ID. Ties now share a rank and have **no overall recommended winner**; ID ordering is only a stable display order.
3. Comparison cards used the normal history page, while rankings were computed across current offers. Superseded/withdrawn history could fill the first page and bury ranked offers. The comparison view now pages only verified current offers and places ranked offers first.
4. Accumulated first-page entries were merged rather than replaced on some refreshed reads. Withdrawn/replaced offers could remain visible; local selection checks did not use authoritative availability assessments. First-page replacement, request association checks and authoritative comparable flags now remove those cards. Refreshing from later pages resets the cursor before issuing a fresh request.

The journey remains: customer request -> **Compare quotes** -> real backend comparison -> full details/explicit selection -> existing **PaymentChoice** -> confirmed mock payment/booking. Comparison never accepts, books or pays automatically.

## Authoritative backend contract

The existing owner `request` read accepts optional `comparison:true`. The normal request read still supplies paginated quotation history. Shops cannot request the comparison view; unrelated customers cannot read the request. Comparison uses existing revoked-token-aware authentication, owner checks, quotation heads and live account/vehicle/category availability.

The read considers only the same open request's submitted, unexpired quotations matching the current material terms revision, current head (or verifiable legacy ID), approved active verified shop, valid ZAR integer-cent line-item total, valid stored deposit terms and direct-invitation association. Expired, withdrawn, superseded, stale, unavailable or malformed offers are excluded from comparison pages. No price or deposit is rewritten.

Comparisons return 20 offers per page using existing `quotes`/`quotesCursor` fields, plus a complete `recommendations` assessment. Scored candidates come first, with deterministic ordering; remaining comparable offers use ordinal quotation ID. A cursor that no longer belongs to the current list requires refresh. A bounded read of at most 501 submitted documents suppresses comparison when more than 500 exist; normal quotation history remains available. Nothing is inferred from a truncated result.

Each assessment distinguishes `comparable` (current available terms) from `eligible` (full scope/all-charge declarations sufficient for scoring). Partially confirmed offers remain inspectable/selectable through existing acceptance rules but cannot win on a low price. Owner request reads return explicit empty/single/insufficient/tied/recommended states. Context read failures suppress selection in the comparison view and provide a retry message; ordinary request history remains available.

## Explainable deterministic analysis

The existing model is retained:

| Factor | Weight | Value |
| --- | --- | --- |
| Verified price | 40% | Lowest eligible total / this total |
| Straight-line distance | 25% | `(maximum - distance) / (maximum - minimum)`; 1 if all equal |
| Shop-confirmed full coverage | 35% | 1, after all required coverage gates pass |

Scores are normalised over active weights and rounded to four decimal places. If any scored offer lacks valid service-request/shop coordinates, distance is excluded for **every** scored offer. Missing coordinates never mean zero distance. No geocoding, device-location permission or AI request is needed for comparison.

Equal top scores produce no winner. Fewer than two fully confirmed offers also produce no winner. The explanation describes the scoring criteria rather than claiming independently proven quality or universally best value. Customers may choose any valid comparable offer.

Price/deposit/turnaround highlights and scope/warranty trade-offs come from actual quoted fields. Fixed and percentage deposits use the validated stored amount, never an extra charge. Remaining-after-deposit is total minus that amount. Missing legacy deposit information stays unknown; an explicit no-deposit offer has zero upfront deposit. Turnaround and warranty are displayed as stated, without fabricated quality scores. Different scope descriptions prompt review of inclusions; matching coverage claims do not establish identical work. Missing optional information displays **Not specified**.

## Frontend freshness and usability

The existing responsive quotation cards, full-details modal, safe areas, themes and accessible actions are retained. Zero, single and insufficient comparisons explain their limits; tied offers are labelled. Customers can inspect scope, itemised total, deposit, remaining amount, turnaround, warranty and actual terms. Mobile/desktop layouts retain automatic scrolling pagination plus an explicit **Load more quotations** fallback.

The comparison refreshes on focus, foreground, every 30 seconds while active, at offer expiry and manually. Selection and stale page history reset appropriately. Reopening fetches persisted authoritative records and does not restore an old selection. Busy, offline, error, unavailable and expired states suppress stale recommendations/actions. Final acceptance still rechecks ownership, current revision, lifecycle and authoritative amounts transactionally.

No mock-payment accounting, mutation idempotency, booking lifecycle, notifications, messaging, private storage, Firebase rules/indexes, AI configuration or deployment configuration changes are required. Local automated tests use only synthetic mocks and loopback emulators.

## Changed files and deployment

- `backend/quote-recommendations.cjs`: comparable/scorable distinction, tie handling, grounded explanations and deposit/turnaround/scope facts.
- `backend/quote-recommendation-read.cjs`: current comparison candidates from existing context reads, with ranked-first stable ordering.
- `backend/marketplace.cjs`: optional owner comparison view and filtered pagination on the existing request read.
- `src/features/marketplace/screens/QuoteComparisonScreen.js`: fresh pages, comparison states, trade-offs, eligibility and pagination controls.
- `tests/quote-recommendations.test.cjs`, `tests/quote-comparison.test.cjs`, `backend/test/marketplace.test.cjs`, `backend/test/marketplace-integration.test.cjs`: focused regressions and existing payment handoff.
- `backend/test/ai-production-compatibility.test.cjs`: permits only these authorised comparison modules in the pre-existing AI boundary check; AI runtime/dependency checks remain unchanged.
- This guide.

Deployment requires review and approval, then the matching backend revision on the **existing** Render service and the matching original Expo client release. Existing Firebase/Supabase/environment settings remain in place. No new feature flag, provider, credential, rule/index deployment or data migration is required. No commits, pushes, deployments, live configuration changes or production test writes were performed.

Hosted functionality remains unverified until those matching revisions are deployed and smoke-tested. Remaining device checks: two authorised workshops quoting a customer's request; default/partial/full confirmations; ties and scope trade-offs; refresh/foreground/expiry; long scope and accessibility font sizes; scrolling/details on iOS/Android/Web; and explicit selection through the existing simulated payment/booking journey.

## Verification record

Node **22.23.3** was used for all checks:

| Check | Final result | Local log |
| --- | --- | --- |
| Focused algorithm, request integration and comparison UI | 142 passed, 0 failed | `.local-checks/smart-comparison-focused-final.log` |
| Full offline backend suite | 298 passed, 0 failed | `.local-checks/smart-comparison-backend-final.log` |
| Complete application suite | 467 passed, 0 failed | `.local-checks/smart-comparison-app.log` |
| Full existing emulator verification | 81 passed, 0 failed: gateway 2, rules 13, backend integration 17, marketplace 36, photos 9, showcases 4 | `.local-checks/smart-comparison-emulators-verified.log` |
| Targeted authenticated comparison-to-checkout emulator case, before the full rerun | 1 passed, 0 failed | Same emulator log; counted separately from the full 81 |
| Expo export: iOS, Android and Web | All passed, including native Hermes bundles | `.local-checks/smart-comparison-export.log` |
| `git diff --check` | Passed | `.local-checks/smart-comparison-diff-warnings.log` contains only line-ending notices |

The final emulator runner first exercised the new case by name, then ran `scripts/verify-local-demo.cjs` in the same loopback Auth/Firestore session. Its quotation fixtures follow existing request-revision rules; withdrawn quotations remain final and accepted terms stay immutable. The emulator command exited successfully and shut down all emulators. Export artifacts are in `.local-checks/smart-comparison-export`.

The acceptance/payment/booking-handler section of `backend/marketplace.cjs` was compared with the starting revision and is unchanged. Payment UI, simulation gate/provider, server/configuration, storage transport, Firebase client, rules/indexes and original `render.yaml` have no changes in this task. These checks do not verify hosted deployment or physical-device behavior.
