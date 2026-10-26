# Customer experience redesign

## A. Source audit and route inventory

Audit target: original repository, `lesley`. The pre-existing API-release work
was uncommitted when this task began and is preserved. This inventory comes from
OwnerNavigator, AppNavigator, the actual screen/components, frontend tests and
the existing Express endpoint handlers, not a proposed feature list.

The original Customer stack registered 18 routes. `SavedPosts` is now the 19th,
connected to the already implemented, account-scoped `posts/saved` operation.
The five primary destinations remain Discover, Garage, Requests, Bookings and
Profile. Messages and Notifications are utility destinations, not extra bottom
tabs. Desktop has a horizontal marketplace navigation bar; mobile retains tabs.

| Route | Entry points and connected screens | Nested views/actions and source behaviour |
| --- | --- | --- |
| Discover | Verified Customer entry/session restoration; primary navigation | Showcase feed; debounced search; server-supported service filters; loaded-city filter dialog; approved-workshop directory with pagination; saved-content entry; inbox/unread and notification controls |
| PostDetail | Discover, saved posts, workshop portfolio | Actual post load/retry; private showcase photo viewer with thumbnails; category, description, supplied vehicle and publication date; workshop portfolio link |
| ShopProfile | PostDetail, approved-workshop directory | Supplied workshop identity/location/verification/services when present; paginated showcases; request-service draft action for a supplied workshop ID, with eligibility validated by the existing backend on submission |
| SavedPosts | Discover, Profile | Existing saved-post API; responsive cards; unsave updates the list after API success; refresh and pagination; detail links |
| Garage | Primary navigation | Active/archive filters; private cover previews; multiple vehicle cards; vehicle-details modal; add/edit/photos/request controls; archive/restore confirmation |
| VehicleForm | Garage, request vehicle selector | Add/edit make/model/year/colour/registration; inline validation; save/cancel; optimistic version; failed draft retained |
| VehiclePhotos | Garage, vehicle details, request form | Five private photo slots; select, preview, upload, replace/remove confirmations, retry, signed-preview expiry and thumbnail/large view |
| OwnerRequests | Primary navigation | Own request feed; title, category/city, visibility, budget/status; create/detail links; cursor pagination/refresh |
| RequestForm | Requests, vehicle card/details, workshop profile, request edit | Vehicle/category/optional direct-shop selectors and pagination; attached vehicle photos/direct attachment upload; title/description; PimpPilot review/edit/apply dialog; city, mandatory services, location picker; min/max ZAR budget; preferred date; open/direct audience; inline validation; submit/edit |
| OwnerRequest | Own request list; create replaces draft; booking/chat links | Request terms/status; edit/close with confirmation; private photos; direct authorised chat or eligible-shop chooser; quotation cards/details dialog; comparison; accepted booking |
| QuoteComparison | Open request | Authoritative comparison results, eligibility, ranks and explanations only when returned; quote selection; expiry/revision safeguards; quote details; chat; continue to payment choice; existing periodic refresh |
| PaymentChoice | Selected eligible quote | Full/deposit/pay-in-store selections; exact preview amounts; mock-capability gate; simulated outcomes; confirmation dialog; lost-acknowledgement recovery; replace with BookingDetail only after API response |
| Bookings | Primary navigation; recovery | Own bookings, exact accepted total, status/appointment; responsive list and detail links; refresh/pagination |
| BookingDetail | Bookings, accepted request, payment recovery, chat, notification, receipt | Accepted scope/items/deposit/paid/outstanding; appointment/service/payment states; request/chat links; explicit mock balance/start/retry/outcome confirmations; history/receipt pagination; cancellation reason/confirmation; private request photos. Scheduling and completion actions remain Workshop-only |
| ReceiptDetail | Booking payment history, notification | Simulated/test watermark; immutable historical amount/paid/balance snapshot; compatibility notice when unavailable; related booking and refresh |
| Notifications | Header; existing targets | Date sections; unread states; supported record/conversation destination; mark-read API action; refresh/pagination; simulated indicators |
| Messages | Header, notification/conversation entry points | Account-scoped inbox, workshop/request identity, real unread counters, last-message/time; pending consent/read-only state; paginated conversation entry |
| Chat | Inbox, authorised request/quote/booking chat, notification | Ordered messages/date groups; latest scroll; keyboard-aware composer, send/retry; request/booking links; details modal; consent approve/reject/revoke; explicit mark-displayed-read; permission/offline/expired/read-only states |
| OwnerAccount | Profile tab | Supplied name/email/phone; profile-photo select/crop/preview/save/replace/remove confirmation; theme preference; saved posts; sign-out with existing auth action and failure presentation |

Authentication remains in the root conditional stack: animated StartupSplash,
SignIn/Splash alias, SignUp, VerifyEmail, ForgotPassword, Legal, restoring state,
and Account for restricted/incomplete/verification states. Customer styling does
not change those routes or authentication state. An approved restored owner
still opens Discover; switching accounts remounts the root by UID and role.

Every screen retains its existing loading, failure, retry, offline, disabled,
pending, empty and permission-state gates. Operations with no authorised data do
not render invented successful content. Photo upload/AI/location/confirmation
subflows remain attached to the actual originating form.

### Confirmed gaps and deliberately unsupported capabilities

- Current REST showcase feed/detail/image endpoints explicitly restrict posts
  to Workshop authors. Legacy Customer build form/MyPosts components and legacy
  POST build handlers exist, but the Customer stack did not register them and
  the current image/detail path cannot complete that journey. Discover's prior
  “customer builds” and proximity claims were inaccurate. This redesign labels
  the real showcase experience accurately and does not enable a broken build
  publishing path or change backend/media contracts.
- The prior generic SavedPosts component incorrectly called marketplace
  `posts`; the implemented saved operation belongs to the posts service. The
  Customer route uses `usePostsFeed({view:'saved'})`, which reaches that service.
- Saved workshops as a separate entity, reviews/ratings, opening hours, proximity
  sorting, discounts, customer quote-decline, general contact-detail editing,
  chat attachments, password changes from Profile and notification preferences
  are not implemented. No replacement UI is fabricated. Password reset remains
  in the existing unauthenticated flow.
- Workshop profiles expose only supplied fields. Public discovery omits private
  registration/contact/media. Request registration privacy, audience permissions
  and signed private-photo access remain enforced by existing contracts.

## B–E. Design system, coverage and interactions

`src/features/customer/components/CustomerUI.js` centralises the Customer frame,
page, cards, grid, action, chip, field wrapper, state panel and modal behaviour.
It uses existing theme palettes, standard spacing, the official LogoMark and
native controls. Neutral surfaces and 8/12 px corners replace large pill
controls; lime identifies selected controls and deliberate primary actions.

Desktop has a bounded 1200 px canvas and horizontal navigation. Mobile retains
five bottom tabs and safe-area edges; tablet and desktop grids adapt to available
width. Large text reduces grid columns and uses mobile navigation. Forms remain
keyboard-aware, content scrolls, long text wraps, and photo carousels alone use
intentional horizontal scrolling.

CustomerPressable supplies pointer hover, keyboard focus, pressed and disabled
states with no scaling, shimmer or layout motion. Actions remain available on
touch. Showcase open targets and bookmark targets are siblings, so a bookmark
cannot trigger detail navigation. Information-only cards remain Views. Existing
shared components select Customer presentation by the authenticated owner role;
Workshop and Admin retain their original branches.

Customer modals retain native Modal semantics; on Web they focus a control,
trap Tab/Shift+Tab, support Escape and restore the invoking focus. Existing
confirmation locks and payment/media API confirmation remain authoritative.

Screen coverage is the full route table above. Shared quote/booking and message
components retain their specialised data presentation and authorisation while
adopting the Customer shell/actions. Profile keeps existing photo mutation
logic and presents real contact fields, rather than inventing an editor.

Copy is shorter and factual: “Explore workshops and their work”, “Requests”,
“Try again”, “View workshop”, “Choose a payment option”, and compact Garage
action text with vehicle-specific accessible labels. Critical request privacy,
communication consent, cancellation, simulated-payment and remaining-balance
conditions remain explicit.

## F. Changed-file map

Paths below are relative to the repository root. These are the Customer-task
changes; the earlier API repair files are listed separately afterwards.

| Files | Purpose |
| --- | --- |
| `src/features/customer/components/CustomerUI.js` | Role-scoped shell, measured responsive grid, actions, fields, cards, states, accessible Web modal and reduced-motion handling |
| `src/features/customer/components/CustomerPostPresentation.js` | Image-led showcase with separate open and bookmark targets |
| `src/features/customer/screens/CustomerDiscoverScreen.js` | Real showcase search/filter feed and approved-workshop directory |
| `src/features/customer/screens/CustomerSavedScreen.js` | Existing saved-post service, account reset, refresh/pagination and acknowledged unsave |
| `src/features/customer/screens/CustomerAccountScreen.js` | Real contact fields, safe profile-photo controls, theme, saved posts and logout |
| `src/features/customer/screens/OwnerHomeScreen.js` | Routes the existing Customer home entry to the new Discover presentation |
| `src/features/marketplace/OwnerNavigator.js` | Adds SavedPosts to the existing Customer stack |
| `src/features/auth/screens/AccountScreen.js`, `src/features/auth/components/ProfilePhotoSettings.js` | Customer-only Profile presentation; restriction/error fallbacks and photo mutation safety retained |
| `src/shared/components/PrimaryButton.js`, `OutlineButton.js`, `ConfirmationButton.js`, `AppTextInput.js` in the same directory | Customer action/confirmation presentation and optional readable placeholder colour; original defaults retained for other roles |
| `src/features/marketplace/components/MarketplaceUI.js`, `GarageUI.js`, `QuotationUI.js`, `ShowcaseUI.js`, `MessagingUI.js` | Shared primitives select the Customer presentation while retaining Workshop branches |
| `src/features/marketplace/components/PostCard.js`, `PhotoGallery.js`, `AIAssistButton.js` | Existing save, media and AI logic with scoped presentation and modal controls |
| `src/features/marketplace/components/MessagesHeaderButton.js`, `NotificationsHeaderButton.js`, `NotificationHistory.js` | Accessible Customer utility entry points and notification frame; existing counters/read operations retained |
| `src/features/marketplace/screens/OwnerMarketplaceScreens.js` | Garage/request grids, form/dialog actions, concise labels and direct-workshop preselection; prevents rendering an empty vehicle ID as raw text |
| `src/features/marketplace/screens/PostScreens.js` | Customer portfolio/gallery and direct-request draft entry; no unsupported verification claim |
| `src/features/marketplace/screens/MessagingScreens.js` | Scoped inbox/chat interactions and details modal |
| `src/features/marketplace/screens/PaymentChoiceScreen.js`, `CommunicationScreens.js`, `QuoteComparisonScreen.js` | Concise option/receipt/comparison text with existing eligibility, amounts and mutation gates |
| `tests/customer-ui.test.cjs` | New Customer layout, interaction, navigation, saved-service, modal, account fallback and workshop-snapshot regressions |
| `tests/marketplace-owner.test.cjs` | Direct-workshop preselection and empty-string rendering regression alongside existing ownership checks |
| `tests/marketplace-discover.test.cjs`, `feed-navigation.test.cjs`, `notifications-navigation.test.cjs`, `garage-ui.test.cjs`, `bookings-ui.test.cjs`, `quotations-ui.test.cjs`, `shop-showcase-ui.test.cjs`, `mock-payment-choice.test.cjs`, `marketplace-communications.test.cjs` in `tests/` | Adapt assertions to the Customer shell, measured grids and concise labels while retaining business/role checks |
| `docs/CUSTOMER_REDESIGN.md` | Audit, implementation coverage, evidence and release assessment |

The pre-existing API repair changes remain: `package.json`, `tests/api.test.cjs`,
`tests/api-error-presentation.test.cjs`, `tests/production-api-export.test.cjs`,
`scripts/build-web.cjs`, `scripts/verify-web-export.cjs` and
`docs/PRODUCTION_API_CONFIGURATION.md`. The Customer task does not modify the
guarded build/verifier scripts or remove their configuration checks.

The REST showcase workshop snapshot does not carry verification metadata. A
Customer may open a request draft for its supplied workshop ID without an
invented verified badge. Submission still uses the original backend eligibility
checks. Directory entries retain only the verification information actually
returned by their endpoint.

## G. Tests and export verification

- Focused final regressions: **65/65 passed**. Log:
  `.local-checks/customer-final-regressions.log`.
- Full frontend suite: **547/547 passed**, no failures, skips or cancellations.
  Command: `node --test --test-concurrency=2 tests/*.test.cjs`. Log:
  `.local-checks/customer-acceptance-frontend.log`. This includes authentication,
  session restoration, account switching, Admin/Workshop role coverage, requests,
  quotation eligibility, payment recovery, immutable receipts, messaging,
  notifications, media handling and production configuration regressions.
- Android and iOS production exports passed together using the installed Expo
  CLI, `export --platform android --platform ios --clear --max-workers 2`, with
  the existing dotenv configuration. Output is in
  `.local-checks/customer-native-export`; log:
  `.local-checks/customer-native-export.log`. Both Hermes bundles were emitted.
- Guarded `npm run build:web` passed, exporting `dist` with the unchanged
  release scripts. The actual compiled API module passed its isolated mocked
  health/Admin/marketplace/posts request checks using the existing Render URL.
  Build log: `.local-checks/customer-production-web.log`.
- Standalone `npm run verify:web` passed against that same `dist`, returning
  the identical entry filename/hash and expected existing API origin. Log:
  `.local-checks/customer-verify-web.log`. All verification requests were
  intercepted by mocks, including authentication checks; none was sent live.
- `git diff --check` passed. Backend and security-rule suites were not rerun:
  no backend, API contracts, rules, permissions or storage implementation changed.

An isolated headless Edge session used the existing local demo application,
Firebase Auth/Firestore emulators and synthetic records only. It passed Customer
sign-in, Discover, Garage, Requests, Bookings, Profile, workshop portfolio/direct
request draft, add-vehicle/cancel, quote comparison, booking detail, Messages,
Notifications and sign-out. It reported **zero runtime errors**, verified no
unintended horizontal overflow, exercised pointer hover and keyboard focus, and
captured Discover/Garage/Profile at **390, 768 and 1440 px**. Real container
measurement fixed the desktop grid's third-column wrapping during this review.
The empty vehicle selector no longer emits a raw-text View warning.

Evidence is local and ignored by Git:

- `.local-checks/customer-redesign-browser-results.json`
- `.local-checks/customer-browser-emulator.log`
- `.local-checks/customer-redesign-discover-{390,768,1440}.png`
- `.local-checks/customer-redesign-garage-{390,768,1440}.png`
- `.local-checks/customer-redesign-profile-{390,768,1440}.png`

The screenshot media is synthetic. The emulator credential warning at the
bottom is development tooling, not a new production interface. These checks use
no production account or production data writes. The in-app Browser was
unavailable; the isolated headless Edge fallback supplied the browser evidence.

## H. Limitations and remaining device checks

Physical iOS/Android devices were not available. Expo exports establish bundle
compatibility, not device-level acceptance. Before releasing, review both theme
modes and enlarged system text on devices; check keyboard/safe-area behaviour,
native modal dismissal, reduced motion and screen-reader labels. Use authorised
test accounts and fixtures to check the native photo picker/cropper, signed-photo
expiry/retry, long chats, request attachments and mock payment recovery. Payment
and media contracts are covered by automated tests, but their complete native
interaction sequences were not exercised in the browser pass.

The browser screenshots cover the three main responsive destinations in dark
mode. Automated tests cover theme contrast, large-text layout and shared state
behaviour; screenshots are not evidence of every nested state in both themes.
Live authenticated production role workflows were not performed. Unsupported
capabilities remain documented in section A rather than represented by fake UI.

## I. Backend, Firebase, Supabase and deployment impact

No Express endpoints, Firebase rules/configuration, Supabase resources, storage
policies, payment algorithms, quotation eligibility, media URLs or authentication
state transitions changed. Local emulators were stopped after the successful
browser run. No remote infrastructure or environment-variable changes were made.
Existing EAS/Netlify configuration and the official logo/animated splash remain.
No dependencies were updated. No commit, push or deployment was performed.

## J. Release-readiness assessment

Implementation and the automated/frontend/native/browser checks above are
complete on `lesley`. The guarded Web build and standalone verifier pass. Physical-device
acceptance and any authorised live-role smoke checks remain before a release
decision. Nothing has been published by this task. Local readiness does not
establish that the existing deployed site contains these changes.

The newly built Customer entry asset is
`/_expo/static/js/web/AppEntry-e3e3b68472345e50ec70076b0c843157.js`, SHA-256
`f0d25185ad79bca6a56076a1b8c8f5706a4d42bb3c7a32855be8039f50bd5fc2`.
It supersedes the older API-repair-only local artifact recorded in
`PRODUCTION_API_CONFIGURATION.md`; that historical report is unchanged.
Use the guarded build and verify commands for any future release, since source
changes can change this filename/hash. No deploy command was run.
