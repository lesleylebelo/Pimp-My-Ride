# PimpMyRide: user and technical manual

**Application:** Automotive customisation marketplace. **Module:** DSW02B1, University of Johannesburg. **Reviewed:** 27 October 2026, branch `lesley`, commit `0d7b95f`.

This guide describes implemented controls. Cloud availability and a matching deployed revision are prerequisites for actual use. PimpPilot Azure success is not verified; Studio image editing is unavailable. All payment functions described here are simulations. The guide contains no passwords, real user records, secret values or private media links. [API/database details](PimpMyRide_API_and_Database_Reference.md) and [verification limits](PimpMyRide_Testing_and_Evidence.md) are provided separately.

## 1. Before using the application

Use a stable connection for sign-in, administrative actions and marketplace changes. Select the correct Customer or Workshop role during registration. Administrators are provisioned through the trusted operator process, not self-registration. A workshop's verified email is necessary but does not replace administrator approval.

Do not interpret an unavailable service as an empty successful result. After a connection failure during a changing operation, refresh and inspect the saved state before trying again. Stable request identifiers and backend receipts protect supported retries, but arbitrary repeated taps are not a substitute for checking the result.

## 2. Customer guide

### 2.1 Create an account, verify email and sign in

1. Open **Create account** and select Customer.
2. Enter your name, email, South African phone number, password and confirmation. Read the terms/privacy notice and accept if appropriate.
3. Submit the form. Follow the email-verification link sent by Firebase.
4. Return to Sign In and use your verified account. Unverified credentials do not enter the persisted marketplace session.
5. If the verification email was not received, use the verification/resend journey. If a profile was not saved, follow the incomplete-signup message; do not repeatedly register a new identity.

Use Forgot Password for Firebase password recovery. Never include your password in a support screenshot. Source: `src/features/auth/services/accounts.js` and authentication screens.

### 2.2 Navigate the Customer experience

The five main destinations are **Discover**, **Garage**, **Requests**, **Bookings** and **Profile**. Header actions lead to notifications and messages. Detail screens provide back navigation. Studio is launched within this navigation rather than occupying another bottom tab.

### 2.3 Discover workshops and their work

Open Discover to switch between showcases and workshops. Search supplied workshop/service/showcase text, select a service category and use the available loaded-location filter. Open a showcase to inspect its details or open an approved workshop profile. Save a post with the bookmark action and use **Saved posts** to return to it.

A showcase is an example of supplied work, not a quotation for your own vehicle. Missing images, no results and unavailable data are shown explicitly. Loaded-page filters may not search every possible record. Sources: `CustomerDiscoverScreen.js`, `CustomerSavedScreen.js`, `PostCard.js`.

### 2.4 Add, edit and archive a vehicle

1. Open Garage and choose **Add vehicle**.
2. Enter make, model, year, colour and registration. Correct the displayed validation errors before saving.
3. Open the saved vehicle for details, edit, photos, a service request or its Studio action.
4. Use the photo screen to choose a supported Camera/Gallery source. Inspect the chosen image, then use the normal upload control.
5. Confirm removal only when intended. Removal archives the vehicle; historical requests/bookings remain. Use the archived filter and restore action to return it to the active Garage.

Only your owned vehicles are returned by the Garage API. Image access is private. Photo slots are limited to five; general uploads accept validated JPEG/PNG/WebP up to 5 MiB. A selected file may be prepared/compressed before upload. Sources: `OwnerMarketplaceScreens.js`, `VehiclePhotosScreen.js`, `backend/photo-domain.cjs`.

### 2.5 Create and manage a service request

1. Start a request from an active Garage vehicle or the existing Requests workflow.
2. Enter a concise title and description. Limits are 100 and 300 characters respectively.
3. Choose an active service category, city, minimum/maximum budget and an optional valid preferred date. Enter amounts as the form requests; the backend stores integer ZAR cents.
4. Choose an open audience or a direct invitation to an eligible workshop. An open request must not retain a hidden workshop target.
5. Add/select supported request photographs and any available service/location requirements.
6. Review all details and explicitly submit. Opening a form, receiving AI text or transferring a Studio draft does not submit it.

Open requests support checked editing and closing. Material changes can invalidate earlier quotations; request an updated offer where the app indicates stale terms. Source: Request screens in `OwnerMarketplaceScreens.js`, `backend/marketplace.cjs`.

### 2.6 Review and compare quotations

Open a request and choose its quotation/comparison action. Inspect scope, line items, total, deposit, expected completion, warranty and expiry. Advisory comparison only ranks sufficiently confirmed current offers. Missing information, ties or too few eligible offers can mean that no winner is recommended. Distance is straight-line based on supplied coordinates, not a road journey estimate.

You may choose a valid comparable offer after reviewing its terms; a recommendation does not accept it for you. Expired, withdrawn, superseded or stale offers cannot be accepted merely because an old card is still visible. Refresh when instructed. Source: `QuoteComparisonScreen.js`, backend quotation comparison modules.

### 2.7 Booking and payment simulation

1. Select a current quotation and review the payment-choice screen.
2. If the backend enables simulation, choose full, offered deposit, or pay in store.
3. Confirm the intended action. Full/deposit options create a pending simulated attempt; explicitly confirm the simulated outcome to change accounting state.
4. A failed attempt needs an explicit retry. A deposit leaves the server-calculated remaining balance.
5. Pay in store begins as due. It does not establish payment receipt; only the selected workshop's permitted simulation control can record an in-store outcome.
6. Open Bookings to inspect accepted terms, appointment state, service state and simulation history/receipts. Use cancellation only when its permitted action is available and supply a reason.

No real money is charged. Simulation-labelled receipt/accounting fields are not proof of bank transfer, merchant settlement or a tax invoice. If simulation capability is disabled or unreadable, acceptance/payment controls fail closed. Sources: `PaymentChoiceScreen.js`, `BookingScreens.js`, `useMockPayments.js`, `backend/mock-payment-gate.cjs`.

### 2.8 Notifications and private messages

Open notifications to review your own history and follow supported request/quotation/booking/receipt/conversation links. Messages require a permitted customer/workshop relationship: an invitation, valid quote, approval or booking can authorise communication. A shop enquiry alone does not grant consent. Customers may approve, reject or revoke supported communication requests. Revoked/rejected communication cannot be bypassed by the existence of another relationship.

Old messages may remain readable to participants while new sending is unavailable. In-app notifications are not evidence that a push notification or external email was delivered. Sources: `MessagingScreens.js`, `backend/messaging.cjs`, `CommunicationScreens.js`.

### 2.9 Use PimpPilot drafting when available

Enter a meaningful request title or description, then open the PimpPilot assistance action. If the provider is available, review original versus suggested text, inspect clarification questions, edit if needed and opt into a suggested category only when appropriate. Use **Apply** to update the local form, or dismiss to preserve the original. You must still review and submit the normal request form.

Errors/unavailable states do not imply a suggestion was generated. Current live Azure success is not certified. Avoid submitting sensitive information unnecessarily. Source: `AIAssistButton.js`, `aiAssistApi.js`.

### 2.10 Access PimpPilot Studio

1. On Discover choose **Open PimpPilot Studio**, then **Start New Concept** and an active Garage vehicle. Alternatively, use the existing vehicle-specific Garage Studio action.
2. Review vehicle details. Choose another vehicle if required; **Keep current vehicle** cancels the selection change.
3. Optionally choose a Gallery photo or native Camera photo. Replace/remove it before analysis. The concept preview always labels your original photograph; it is not an edited result.
4. Select supported interests, enter optional instructions or combine both. The complete sent message, including interests, must fit within 1,500 characters.
5. Press **Prepare plan** explicitly. An unavailable backend preserves your local vehicle/photo/ideas and offers manual retry; it does not create sample recommendations.
6. When a genuine validated response is available, inspect objective, observations, assumptions, proposed work, components/trade-offs and workshop questions. Refine through the supported conversation field. At most six prior turns are carried forward.
7. Select only the modifications you want. Review the description preview and confirm transfer only if it fits the existing request limit.
8. The existing Service Request form opens **unsaved**. Complete/review it and submit separately only when intended.

**AI image editing: Not available yet.** Studio does not diagnose a vehicle or certify parts fitment. Session content is memory-only; leaving clears it. A departure confirmation lets you stay or leave and clear. Sources: `PimpPilotStudioScreen.js`, `StudioUI.js`, `pimpPilotStudio.js`.

### 2.11 Customer Profile and appearance

Use Profile for the existing account information, profile-photo controls, theme preference and sign-out actions. Photo access/removal follows current-account checks. Theme preference is stored locally; a light platform app configuration does not remove the application's explicit dark/light theme support. Sign out before sharing a device or switching roles.

## 3. Workshop guide

### 3.1 Registration and approval

Select Workshop during registration and complete personal/contact and business details, including business name, registration number, address, city, province and services. Verify your email, then use the Account/onboarding view to upload the required CIPC certificate, proof of address and owner identity document. Supported verification formats are PDF/JPEG/PNG, up to 5 MiB each. Upload each item through its normal control and check the recorded status after errors.

An administrator must approve the application before marketplace work becomes available. A rejected/pending/reviewing state is not approval; follow the displayed instructions rather than trying another route. Source: auth registration/account components, `backend/documents.cjs`, `backend/reviews.cjs`.

### 3.2 Profile and workshop location

Review your recorded business profile through the existing Account/My Shop links. Use supported location controls to preview and save the intended coordinates, optionally using current location with permission. Declining permission permits the available manual/map selection path. Location is selected deliberately; the application does not provide continuous background tracking. If other business details need correction and no ordinary edit control is available, use the administrator/operator correction process rather than assuming a general self-edit API exists.

### 3.3 Find requests and prepare quotations

1. Use **Find Jobs** or Requests to open a visible service request.
2. Read the vehicle snapshot, requested scope, category, budget, date and supplied images.
3. Open the quote form. Specify scope and 1–10 positive-value line items, completion estimate, warranty if offered and validity period.
4. Choose no deposit, a permitted percentage deposit or fixed-ZAR deposit. Deposit must be below the complete price.
5. Make scope/all-charge/coverage declarations only when accurate; they affect advisory comparison eligibility.
6. Review and submit once. Refresh if the request terms changed. Manage submitted offers through Quotes; withdrawal is an explicit action and cannot simply be reversed by resubmitting the same withdrawn offer.

The customer chooses the quotation. The system does not guarantee that the cheapest offer is recommended or accepted. Sources: `ShopMarketplaceScreens.js`, `backend/marketplace-domain.cjs`.

### 3.4 Manage bookings

Open an authorised booking. When eligible, confirm a future appointment in South African time. Mark service completion only for the correct confirmed booking and actual intended workflow. Appointment, completion and simulated payment are separate states. Record simulated cash/card/EFT only through the selected workshop's permitted in-store action. Review cancellation reason/state rather than assuming a cancelled booking can accept more payment.

### 3.5 Publish and maintain showcases

Use My Shop's showcase management area and choose **New showcase**. Add the title, description, service category, structured vehicle details and at least one appropriate image; current selection supports up to ten. Review image order and remove unwanted selections before saving. Only an active approved shop can publish or change its own showcase. Existing media is not silently deleted merely because an edit failed.

PimpPilot showcase assistance, where available, provides proposed wording only. Review, edit or dismiss it; Apply updates the form, and normal publishing remains a separate action. Do not describe proposed work as completed. Sources: `PostScreens.js`, `postsApi.js`, `backend/posts.cjs`.

### 3.6 Messages and enquiries

Use the request/quotation/booking conversation action when permitted. If an open request does not yet authorise chat, use the supported enquiry/consent journey. Do not assume an enquiry grants contact permission. Observe unavailable/revoked states and the message length/rate controls. The application does not provide unrestricted messaging to arbitrary customers.

## 4. Administrator guide

### 4.1 Access

Use an existing verified administrator identity provisioned through the trusted operator process. Both claims and profile status must permit access. Public registration cannot create an administrator. Online access is required. Use **Verify identity** to refresh authentication when a sensitive action requires it; never send a password in a report.

### 4.2 Overview, accounts and workshop applications

Open Overview for queried account, pending-application, suspended-account and active-category counts. Open Accounts or Workshop Applications, select an account and inspect its actual role/status. Unavailable metrics are not zero-valued proof. Refresh before changing a record that may have changed elsewhere.

### 4.3 Review workshop evidence

Review the supported private document links only for the application being assessed. Record a meaningful decision reason and use the available approval/rejection/pending controls. Do not capture identity document content for the academic report. Approval requires valid document records and eligible Auth state; interrupted reviews can remain restricted and may require the supported recovery path. Do not bypass operation markers manually.

### 4.4 Account status and catalogue maintenance

Use the existing edit/status controls only for permitted non-admin targets. Suspend or archive with a recorded reason; archive retains records and disables access rather than erasing personal data. Restoring an account does not automatically grant workshop approval. Maintain categories through Add/Edit and archive/restore actions. Sensitive mutations require recent authentication and confirmations.

### 4.5 Audit, presence and moderation scope

Use Activity Log for recorded event/action details and Online Status for the bounded heartbeat view. Search/filter is applied to the available data; presence is approximate activity, not a monitoring guarantee. Administrative post-removal operations exist in the backend, but this guide does not invent a separate routed moderation console. Trusted administrator provisioning and failed account-operation reconciliation remain operator responsibilities documented in `docs/OPERATOR_RECOVERY.md`.

## 5. Developer and technical maintainer guide

### 5.1 Prerequisites and repository layout

Use the original inner `PimpMyRide` repository and preserve branch/worktree guidance in `AGENTS.md`. Required runtime is Node 22.x for the backend; Git, npm and a compatible Expo development setup are needed. Firebase emulator checks also require Java and emulator binaries. Native launching requires a compatible emulator/device/runtime; the iOS simulator requires an appropriate macOS environment. No new cloud project or replacement application is necessary.

Relevant folders are `src/features`, `src/shared`, `src/navigation`, `backend`, `tests`, `scripts`, `assets` and `docs`. Root/backend package installations are separate. Current configuration and package versions are described in the report, Table 4.1.

### 5.2 Install dependencies and configure local development

Commands below are instructions, not operations executed during this documentation-only task. Run at the inner application root:

```text
npm ci
npm ci --prefix backend
```

Use `npm.cmd` on Windows when PowerShell blocks npm's `.ps1` shim. Preserve existing private `.env` files. If none exists, copy the relevant example into a local ignored file and fill approved configuration privately. Never copy the backend secret key or service-account JSON into an `EXPO_PUBLIC_*` variable. Restart Expo after changing client variables.

For read-only offline development without cloud configuration, run the existing unit/component suites. A full interactive synthetic local mode also exists; follow the current guarded code in `backend/local-demo.cjs`, `scripts/local-demo-env.ps1` and the local-demo documentation after checking its historical instructions against `AGENTS.md`. Do not create an extra branch/worktree merely because an older guide mentions one. Synthetic storage substitutes fixture images and cannot validate actual photo appearance. This report does not start or seed that mode.

### 5.3 Run Expo

```text
npm start
npm run web
npm run android
npm run ios
```

Choose the command for the intended platform; do not run all simultaneously by default. A phone's `localhost` refers to the phone, not the development computer. Use the intended reachable API origin and approved network setup. Web CORS errors and native reachability failures require different diagnosis. Source: root package scripts, `docs/OPERATIONS.md`.

### 5.4 Run and check the Express backend

The backend start script uses process environment; it does not automatically load a dotenv file. With an intentionally configured local file, from `backend`:

```text
npm run check:local-config
npm run check:ai-config
npm run start:local
```

`start:local` invokes Node's `--env-file=.env.local` and the guarded local-server entry. That specific guard requires development mode, loopback binding, the existing project/storage identities and **no enabled demo or mock-payment mode**; a local file with simulation enabled therefore fails this check by design. Do not bypass it or silently change flags to make the command succeed. The normal server entrypoint has its own simulation-capable configuration validation; a separately approved workflow must choose the intended entrypoint and configuration explicitly.

The configuration-check scripts inspect settings; AI configuration/SDK checking is not a real token or model request. `check:local-config` reads `backend/.env.local` with process-environment precedence. `check:ai-config` uses its process environment, so invoke it through Node `--env-file` with the script path if deliberately checking a local file. An alternative for an already configured process environment is `npm start` in `backend`. Starting a server with real credentials connects real services; do not use it for unapproved data-writing tests. Sources: `backend/package.json`, `check-local-config.cjs`, `local-server.cjs`, `server.cjs`.

### 5.5 Configuration reference, names only

| Names | Purpose and boundary |
| --- | --- |
| `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID` | Public Firebase client identifiers; not backend authority |
| `EXPO_PUBLIC_API_URL` | Client API origin; production build checks the existing target |
| `NODE_ENV`, `HOST`, `PORT`, `CORS_ORIGINS` | Server runtime/listener and exact browser origins |
| `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `GOOGLE_APPLICATION_CREDENTIALS` | Admin project/credentials; private server use |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Storage endpoint and privileged server key |
| `SUPABASE_BUCKET`, `SUPABASE_PHOTO_BUCKET`, `SUPABASE_REQUEST_BUCKET`, `SUPABASE_POSTS_BUCKET`, `SUPABASE_LEGACY_PHOTO_BUCKET`, `SUPABASE_LEGACY_POSTS_BUCKET` | Scoped current/legacy media bucket identities |
| `PMR_MOCK_PAYMENTS_ENABLED` | Explicit mock-accounting capability; no real payment processing |
| `PMR_AI_ASSIST_ENABLED`, `PMR_AI_STUDIO_ENABLED`, `PMR_AI_PROVIDER` | Independent AI enabled paths and selected provider |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_FOUNDRY_PROJECT_ENDPOINT`, `AZURE_FOUNDRY_AGENT_NAME` | Existing Azure project/agent and Entra application credential |
| `GEMINI_API_KEY`, `PMR_AI_MODEL` | Explicit Gemini path only |
| `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST` | Test-only emulator endpoints; forbidden for production startup |
| `EXPO_PUBLIC_PMR_LOCAL_DEMO` and guarded local-mode settings | Synthetic-only client/server setup, never a production export |

Runtime flags are configuration, not permission to change a live environment. This task does not inspect actual environment values or prescribe enabling AI/Studio/payment flags.

### 5.6 Firebase and Supabase maintenance

Review `firebase.json`, `firestore.rules` and `firestore.indexes.json` against the intended existing project before a separately approved deployment. Core application data lives in Firestore. Supabase media access runs through server adapters using Firebase-authorised requests; no Supabase user-login system is required. Private bucket checks are enforced in code, and proposed SQL is not an automatically authorised setup step.

Store stable bucket/path metadata, never an expiring signed URL as identity. Do not migrate untagged legacy references into a new bucket by assumption. Historical `storage.rules` is not deployed by the current Firebase configuration. Report/cleanup scripts exist but may write/delete data; review them and obtain appropriate authorisation before use.

### 5.7 Test commands and interpretation

From the inner application root:

```text
npm test
npm run test:backend
npm run test:rules
npm run test:security
```

The first two run the configured offline application/backend suites. `test:rules` starts Firestore emulator checks; `test:security` starts Auth/Firestore checks on the synthetic project. Stop interactive emulator sessions first because integration suites clear their disposable data. Do not run integration files against live services. No saved pass count should be assumed to describe a new checkout; record its own command, date, commit, totals and exit status.

Focused examples, with no live provider calls:

```text
node --test tests/pimppilot-studio.test.cjs
node --test backend/test/ai-azure.test.cjs backend/test/ai-production-compatibility.test.cjs
```

No configured lint/typecheck command or code-coverage percentage is supplied. Test-renderer/native mocks do not provide visual browser/device certification. Existing test results are indexed in the testing companion rather than rerun here.

### 5.8 Web build and approved release process

```text
npm run build:web
npm run verify:web
```

The guarded build exports `dist` and verifies its API transport using mocks. It does not deploy. Render configuration uses the existing service with `backend` as root, dependency installation and `npm start`; Netlify should publish the reviewed static export from the actual base directory. The generated `.netlify/netlify.toml` contains a machine-specific path and an older direct Expo command; it is not a portable release checklist. Confirm hosted settings rather than treating it as a newly verified live configuration.

A release requires review of matching backend/client commits, private environment settings, CORS, Firebase authorised domains/indexes/rules and the final exported client. Only then should an authorised operator deploy through the existing services and record smoke-test evidence. This manual does not execute deployment commands or publish anything.

### 5.9 Troubleshooting

| Symptom | Useful check | Interpretation/action |
| --- | --- | --- |
| Sign-in rejects an existing email | Verification, missing profile, account status and role | Follow recovery text; do not bypass validation or create duplicate identities |
| All backend screens cannot connect | Reachable API `/health`, selected public origin, server startup | Health proves liveness only; restart Expo after correcting configuration |
| Web blocked while native works | Exact CORS origin and preflight | CORS is browser-specific; credentials still required |
| Phone fails with local API | Phone/computer network and API address | Device localhost is not computer localhost |
| Upload fails or outcome uncertain | File format/size, permissions, recorded status, network | Refresh before retry; do not delete an uncertain object manually |
| Private image disappears | Current authorisation and signed URL expiry | Refresh/retry through the authorised API; do not make bucket public |
| Quote no longer selectable | Expiry, head, material terms version, related account/vehicle/category | Refresh and request current terms; do not edit backend status manually |
| Mock payment controls unavailable | Backend capability response and matching reviewed runtime | No client flag can grant simulation permission |
| PimpPilot returns unavailable/503 | Safe reason/status/correlation diagnostics | Preserve draft; latest Azure HTTP 400 issues remain live-unverified |
| Azure rejects `instructions`/`reasoning` | Deployed commit versus latest saved-agent compatibility fix | Do not infer the correction is deployed; do not blindly remove more fields |
| Admin action requires identity | Age of authenticated session | Use the existing password confirmation; do not bypass claim checks |
| Review/account operation remains restricted | Pending marker and operator recovery guidance | Use audited recovery, not direct destructive edits |

### 5.10 Known limitations and handover

Successful live Azure generation, current model binding/retention and current hosted revision parity remain unverified. Studio edited images, real payment settlement and actual payment-email delivery are not completed features. Earlier native bundle exports do not prove the final Studio UI on a physical device. Complete the screenshot checklist, review responsive themes/keyboards, retain redacted verification evidence and update status only after authorised results exist.

## 6. Example assessment walkthroughs

Use approved synthetic/local records or a separately authorised demonstration environment. These are scenarios, not claims of tests performed in this task.

**Customer/Workshop marketplace:** Customer selects a synthetic owned vehicle and prepares a request; workshop inspects it and submits an itemised offer; customer compares terms and selects it explicitly; simulation-labelled payment and booking controls show the separate states; selected shop confirms an appointment. Stop before any production write when only a read-only demonstration is authorised.

**Administrator oversight:** Existing administrator opens application counts, inspects a redacted application/document-status view and shows audit/category/presence screens. A screenshot need not approve/suspend any real user.

**PimpPilot:** Show the existing drafting action and review boundary. If the provider is unavailable, demonstrate truthful preservation/error behavior. Studio can show landing, Garage selection, original photo and unavailable edited-image label independently. Do not place automated-test fixture recommendations into the live UI for presentation.
