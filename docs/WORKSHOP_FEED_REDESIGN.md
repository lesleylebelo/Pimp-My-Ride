# Workshop social feed and primary navigation

## A. Existing structure

Original repository, branch `lesley`. Existing uncommitted Customer, Admin and
API release work is preserved. Customer component files were not edited.

`ShopNavigator` retains its native stack and all routes: ShopJobs, ShopRequests,
ShopRequest, QuoteForm, ShopQuotes, Bookings, BookingDetail, ReceiptDetail,
Notifications, Messages, Chat, ShopAccount, ShopPosts, PostForm, PostDetail and
ShopProfile. Primary destinations remain Find Jobs / ShopJobs, Requests /
ShopRequests, Quotes / ShopQuotes, Bookings / Bookings and My Shop / ShopPosts.

Find Jobs merges the authorised request feed and workshop posts by timestamp.
It retains loaded-record search, source preference, category/location/budget/
not-quoted filters, cursor loading, retry and refresh operations. Direct requests
use the existing `requests` operation with `feed:'direct'`. My Shop has its own
`mine` showcase feed and management callbacks. Workshop profiles also expose a
showcase list. Existing shells already put Shop tabs at the bottom; this change
unifies their width, interaction states and safe-area behavior.

## B. Files changed for this task

| File | Change |
| --- | --- |
| `src/features/marketplace/components/WorkshopFeedCards.js` | New shared Workshop feed column, service-request and showcase presentations |
| `src/features/marketplace/components/ShopBottomNavigation.js` | Existing Shop tabs, centered and bounded, with selected/hover/focus/pressed states |
| `src/features/marketplace/screens/ShopMarketplaceScreens.js` | Mixed/direct feeds opt into social cards, feed layout and theme-aware filter controls; refresh and existing New showcase entry |
| `src/features/marketplace/components/PostCard.js` | Shop-only opt-in feed presentation; existing bookmark and management operations retained |
| `src/features/marketplace/components/RequestPhotos.js` | Opt-in feed media sizing; existing access/expiry/retry/preview implementation retained |
| `src/features/marketplace/screens/PostScreens.js` | Workshop own/portfolio lists become single-column; Customer branches, detail galleries and publishing forms retain their behavior |
| `src/features/marketplace/components/MarketplaceUI.js` | Passes the optional Shop feed-layout flag through the existing shell |
| `src/shared/components/landing/LandingUI.js` | Shop-only feed canvas and bottom navigation integration; original header and default non-Shop branches retained |
| `src/features/marketplace/components/QuotationUI.js`, `ShowcaseUI.js` | Replace only the Shop navigation strip with the shared bottom component |
| `src/shared/components/landing/FeedControls.js` | Optional interaction component for source filters; original storage and default rendering retained |
| `src/shared/components/ConfirmationButton.js` | Optional feed presentation for existing showcase delete confirmation; default behavior and confirmation locks retained |
| `tests/workshop-feed.test.cjs` | New layout, ordering, privacy, interaction, management and search regressions |
| `tests/marketplace-shop.test.cjs` | Update presentation-copy expectations; existing permission/business assertions retained |
| This report | Audit, implementation coverage, verification and release assessment |

## C. Service-request cards

One post per row at every breakpoint, full available phone width and at most
680 px on larger screens, with 24 px between posts. Identity uses only the
server-supplied customer display name and request-avatar metadata. An unavailable
identity remains Customer with a neutral avatar, not a link to a fabricated
customer profile. The order is identity/time/location, Service request/category,
heading, description, vehicle, budget, authorised photos and contextual footer.

Descriptions and headings wrap fully. Vehicle text is limited to year/make/model;
registration, email, phone and raw owner identifiers are not displayed. Missing
vehicle/media fields have factual fallbacks. Status uses supplied state. Quote
counts appear only when supplied; known zero retains “No quotes yet.” The footer
retains View request/View your quote and routes to ShopRequest. Quote creation
still starts from the existing request-detail eligibility checks; there is no
new submission action on the feed.

## D. Showcase cards

Workshop identity and supplied location/time/verification precede category,
full title, description, vehicle and the first image. Images use 4:3 sizing and
12 px corners with existing loading/error/retry handling. The original detail
gallery remains available. Known workshop snapshots can open ShopProfile.
Save is an independent bottom-right control, using the unchanged PostCard save
handler and the previously repaired posts transport. Own portfolio posts retain
Edit post and confirmed Delete post with the original callbacks/API operations.

The Workshop presentation is opt-in. Customer Discover, its post presentation,
its bottom navigation, and Customer portfolio/saved layouts were not changed.

## E–F. Navigation and interactions

The five existing Shop destinations use a persistent strip outside each shell's
ScrollView. Controls are centered within a maximum of 640 px, keep their existing
route mapping, and have icons, labels, neutral inactive colors and lime selection.
The bar reserves its own intrinsic height and supports text scaling. LandingShell
passes its existing bottom safe inset; the other shells retain their enclosing
SafeAreaView bottom edge. No top tabs or second navigator were introduced.

Customer presentation primitives are reused without changing Customer files.
Actual targets have subtle hover opacity, visible keyboard focus and pressed
feedback. Noninteractive request identity stays a View. Save/profile/detail/
management actions are independent. Feed controls use no scaling or shimmer;
feed filter/delete dialogs use no transition animation. Other forms and screens
retain their existing presentations, apart from the shared Shop navigation strip.
New showcase remains the existing PostForm route, placed in the feed toolbar so
the prior floating control cannot cover a final post action.

## G. Privacy and functionality

RequestPhotos still accepts only explicit, validated attachment IDs, capped at
five. It never enumerates Garage media or renders raw `photos` URLs. The first
authorised image is large; remaining attachments retain accessible previews.
Each URL comes from the unchanged `viewPhoto('request',...)` operation, whose
backend rechecks role, request audience/status and attachment membership. URL
expiry, stale-account/focus handling, image failure and retry logic remain.
Showcase media remains in ShowcasePhoto and its existing authenticated pipeline.

No backend, schema, Firebase rules, Supabase storage policy, quotation eligibility,
authentication transition, payment behavior or API contract changed. There is
one confirmed client filter correction: showcase vehicle objects previously
became `[object Object]` in search text. Search now uses supplied year/make/model
and workshop name. A dedicated regression verifies a Toyota query and a no-match
query against that same feed. No server query vocabulary was added.

## H. Verification

- Full frontend suite: **563/563 passed**, no failures, skips or cancellations.
  Command: `node --test --test-concurrency=2 tests/*.test.cjs`. Log:
  `.local-checks/workshop-feed-frontend.log`. This includes Customer/Admin role
  navigation, authentication, session restoration, existing Workshop workflows,
  bookmark transport and production API configuration checks.
- Focused feed and backend media/security regressions: **53/53 passed**.
  Command: `node --test --test-concurrency=2 tests/workshop-feed.test.cjs backend/test/posts.test.cjs backend/test/photos.test.cjs`.
  Log: `.local-checks/workshop-feed-security-focused.log`. These cover the seven
  new Workshop cases and existing post/private-photo authorization checks.
- Android and iOS production exports passed using the installed Expo CLI:
  `export --platform android --platform ios --clear --max-workers 2` with the
  existing dotenv configuration. Both Hermes bundles were emitted to
  `.local-checks/workshop-native-export`. Log:
  `.local-checks/workshop-native-export.log`.
- Guarded `npm run build:web` passed with the unchanged release scripts and
  existing Render endpoint. Log: `.local-checks/workshop-production-web.log`.
  The actual compiled API factory passed health, Admin, marketplace and posts
  request checks using isolated authentication/fetch mocks; none was sent live.
- Standalone `npm run verify:web` passed against that same `dist`, returning the
  identical entry filename/hash and expected API origin. Log:
  `.local-checks/workshop-verify-web.log`.
- `git diff --check` passed. No backend implementation or security rules changed;
  the focused backend post/private-photo authorization tests passed as above.

An isolated headless Edge browser, using the existing local demo application and
Firebase Auth/Firestore emulators, passed at **390, 768 and 1440 px**. It checked
Workshop sign-in, the mixed request/showcase feed, an authorised private request
photo, single-column card geometry, exact primary-tab order and persistent tab
position while scrolling, request detail and quotation entry, showcase detail,
workshop profile, and own-portfolio Edit/Delete entry controls. It reported
**zero runtime errors** and no horizontal page overflow. Edit/delete and save
operations are additionally exercised with mocks in the focused tests; the
browser does not publish or delete posts.

Screenshots were reviewed at phone and desktop sizes. Evidence is ignored by Git:

- `.local-checks/workshop-feed-browser-results.json`
- `.local-checks/workshop-feed-browser.log`
- `.local-checks/workshop-feed-feed-{390,768,1440}.png`
- `.local-checks/workshop-feed-portfolio-{390,768,1440}.png`

The in-app Browser was unavailable, so the isolated headless Edge fallback was
used. The red emulator warning overlapping the screenshot's bottom edge belongs
to Firebase development tooling. Media and account records are synthetic. The
managed emulator process stopped after the successful run. All automated writes
use local mocks/emulators; no production accounts or data writes were used.

## I. Remaining manual checks

Physical iOS/Android devices were not available. Review Home Indicator and
landscape safe areas, enlarged system text, keyboard behavior and screen-reader
navigation on devices. Check private-image expiry/retry and long feeds on actual
hardware. Export compatibility is not physical-device acceptance. No production
accounts or live customer media were used for automated checks.

## J. Release assessment

This is a local change on `lesley`; no commit, push, merge or deployment was
performed. Existing infrastructure and EAS/Netlify configuration remain. Production
API build/verifier scripts are unchanged. Local acceptance results do not imply
that the deployed site contains these changes. Physical-device acceptance and any
authorised live-role smoke checks remain part of a separate release decision.

The local Web artifact is
`/_expo/static/js/web/AppEntry-bb60f33a7fb5b93636ca1ed79ccb76dd.js`, SHA-256
`21d88c536316379cf84dbede374603011b01bd67e90a59bf29bb74e439e7cfa6`.
It supersedes earlier local Customer/API-only exports; their historical reports
are unchanged. Future source edits can change this filename/hash. Continue using
the guarded build and verification commands for any separately authorised release.
