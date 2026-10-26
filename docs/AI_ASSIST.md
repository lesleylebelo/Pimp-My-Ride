> Historical record ? superseded by [PimpPilot production service](PIMPPILOT_PRODUCTION.md). Tester allowlists, generation allowances and old release patches below are obsolete and must not be used for the new service. Historical evidence is retained.

> Historical implementation/release notes. The daily testing policy and current release procedure are in [AI_DAILY_TESTING.md](AI_DAILY_TESTING.md). Its Gemini-only configuration supersedes the initial one-attempt/OpenAI instructions below.

# AI Assist — Phase 1

Implemented in the original project on `lesley`, preserving the existing uncommitted
navigation changes. AI Assist is optional and **disabled by default**. No provider API
requests, charges, deployments or live Firebase/Supabase writes were made for this work.

## Forms and preview

Customer service-request creation/editing and approved-shop showcase creation/editing
now offer **Optimise with AI**, using the existing sparkle vector icon. A scrollable,
keyboard-aware modal shows loading, proposed title/description, an optional existing
category and clarification questions. Users can **Apply**, **Edit**, **Regenerate** or
**Dismiss**. Category application is explicitly opt-in.

The original form is unchanged until Apply. Apply changes only title/description and an
opted-in category. It never saves or publishes. Photos, their order and confirmed-upload
receipts, vehicles, budgets, dates, service locations and required services are retained.
The normal Save/Submit action still uses all existing validation and terms-version logic.
Customer build posts and quotation, booking or payment screens have no AI action.

Regenerate is an explicit new provider attempt based on the current original draft.
Duplicate taps are locked; changed drafts cannot receive stale suggestions. Dismiss,
account changes, blur and offline transitions discard pending preview results. Errors
leave normal editing available. Missing provider configuration shows an unavailable
message rather than simulated runtime suggestions.

## Authenticated backend

`POST /api/ai/assist` uses existing Firebase bearer authentication and active-account
checks. Owners may request `kind: request`; active approved shops may request
`kind: showcase`. Administrators, unverified/disabled/restricted accounts and account
operation locks are rejected. Access is checked again before returning suggestions.

Input accepts only `{kind, title, description, categoryId}` with an 8 KiB bound. No
vehicle/request/post IDs, photos, signed URLs, coordinates, registration, customer identities, budgets
or other form fields are accepted or sent to the provider. Request text limits remain
100/300 characters; showcase limits remain 100/2000. At least some original text is needed.

Request categories come from active existing `serviceCategories` documents (bounded to
100); showcase categories match the existing nine publishing choices. The server rejects
unsupported categories, extra keys, missing/oversized text, malformed clarification
questions and unusable provider output. Categories are rechecked before returning.

Grounding is deliberately conservative: new content words/numbers, new technical claims
and dropped source negations are rejected. A small editorial vocabulary allows neutral
rewriting; questions may ask for neutral clarification without introducing unprovided
specifications or services. This may reject otherwise harmless synonyms. It is not a
semantic proof of factual accuracy: users must review every suggestion, and live-provider
quality testing remains outstanding. The provider has no tools or database access.
The backend's release control writes only a content-free quota reservation when enabled.

Limits are three provider attempts per user/minute, ten/hour, one concurrent request per
user and four per process, in addition to existing Express limits. Failed provider attempts
count. State is bounded and held in memory per backend process; restart/multiple-instance
limits are not a shared billing quota. The controlled release additionally requires an
explicit `PMR_AI_TEST_UID` and permits just one durable global provider attempt across
all instances/restarts through an existing Firestore transaction. It fails closed if
unconfigured or storage is unavailable; failures consume the allowance without refunds.
See [Render release preparation](AI_ASSIST_RENDER_RELEASE.md) for the patch and safeguards.
Provider work is aborted after 15 seconds, including
stalled responses. Provider errors are sanitised; prompts, responses and credentials are
not logged. There is no automatic provider retry; the application does not persist
prompts or responses. Provider data handling requires separate review before activation.

## Provider interface and future configuration

`createAIProvider()` returns:

```js
{
  enabled: boolean,
  async suggest(draft, {signal}) {
    // draft: kind, title, description, current categoryId,
    // authoritative categories, field limits and allowed editorialWords
    return {title, description, categoryId: null /* or existing ID */, missingDetails: []};
  }
}
```

The provider factory uses an explicit `PMR_AI_PROVIDER` selection, without fallback.
`gemini` uses the server-only `GEMINI_API_KEY`, exactly `gemini-2.5-flash-lite` and
`POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`.
The key is sent in `x-goog-api-key`, never in the URL or prompt. `generationConfig`
sets `responseMimeType: application/json` and `responseJsonSchema` for the same
suggestion contract. Only one completed, unblocked, text-only candidate is accepted.
The existing server validates lengths, categories and grounding after parsing.
See Google's [structured output guide](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
and [GenerateContent reference](https://ai.google.dev/api/generate-content).

The preserved `openai` adapter prepares Responses API requests with strict JSON Schema,
`store: false` and bounded output. An omitted provider retains the original OpenAI
configuration semantics; a Gemini selection never calls OpenAI, even after an error.
Refused, incomplete or malformed responses fail safely.
Implementation follows the [official Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).
No provider SDK or new infrastructure is required; Node 22 supplies fetch/AbortController.
Tests inject provider objects or a fake HTTP function; there is no production mock mode.

Real AI requires a separately authorised server configuration and rollout:

```dotenv
PMR_AI_ASSIST_ENABLED=false
PMR_AI_PROVIDER=gemini
GEMINI_API_KEY=<server secret in ignored backend/.env.local only>
PMR_AI_MODEL=gemini-2.5-flash-lite
```

These settings belong only on the Express server, never in `EXPO_PUBLIC_*` or the client.
The committed example retains `PMR_AI_ASSIST_ENABLED=false` and empty credentials.
No environment was enabled during implementation. Live quality/cost checks, production
usage budgeting and a deployment remain future work requiring approval. OpenAI remains
inactive with the current Gemini selection and disabled feature flag.

## Files

- `backend/ai-provider.cjs`: disabled-default Gemini/OpenAI adapters and explicit interface.
- `backend/ai-assist.cjs`: role/content/category/grounding validation, quotas and deadline.
- `backend/services.cjs`, `backend/app.cjs`: existing authenticated service/route wiring.
- `backend/.env.example`: server-only disabled configuration example.
- `backend/package.json`, `backend/test/ai-assist.test.cjs`: backend regression suite.
- `src/features/marketplace/services/aiAssistApi.js`: text-only authenticated client call.
- `src/features/marketplace/components/AIAssistButton.js`: shared reviewed-suggestion UI.
- `OwnerMarketplaceScreens.js`, `PostScreens.js`: existing request/showcase form integration.
- `tests/ai-assist.test.cjs`, `tests/marketplace-owner.test.cjs`,
  `tests/marketplace-post-image-lifecycle.test.cjs`: preview and draft/media regressions.
- This document.

Physical iOS/Android keyboard, accessibility and small-screen visual checks remain manual.

## Local verification

Node **22.23.3**: **381 application tests** and **251 backend tests** passed with zero
failures. Android, iOS and web Expo exports passed, including native Hermes bytecode.
`git diff --check` passed. Logs and bundles are in the existing ignored
`.local-checks/ai-assist-*` paths.

Deterministic injected providers/HTTP functions test customer/shop assistance, structured
text, category and factual-grounding checks, errors/refusals/deadlines, roles, verified Auth,
limits, draft Apply/Edit/Regenerate/Dismiss and stale-account behaviour. Form integration
tests preserve saved photos/order, vehicle details, service location, budgets and required
services; they verify zero publication calls before normal Save. Read-only backend fixtures
offer no database write methods. No real AI endpoint or production datastore was used.

## Earlier Gemini local verification

The earlier local procedure below predates the controlled release's mandatory test UID
and durable quota. Current deployment/test preparation follows
[AI_ASSIST_RENDER_RELEASE.md](AI_ASSIST_RENDER_RELEASE.md), using the existing Render
backend. No further local-server test is needed for that release.

The ignored, untracked `backend/.env.local` was checked using Node 22.23.3's actual
`--env-file` loading: explicit Gemini provider/model, Gemini credential present,
OpenAI credential absent, feature disabled. Secret values were neither printed nor
copied. The file was not changed. Existing process variables override `--env-file`
values; restart the backend after any deliberate configuration change.

From the project root, using Node 22.23.3:

```powershell
npm.cmd run check:local-config --prefix backend
npm.cmd run start:local --prefix backend
```

`start:local` loads `backend/.env.local`, checks the existing configuration and binds
to `127.0.0.1`. `GET /health` returns `{ "ok": true }` independently of AI. An
authenticated AI request while disabled returns 503 without contacting a provider.
The ordinary `start` command does not load `.env.local` automatically.

For a separately approved single live test, temporarily enable only
`PMR_AI_ASSIST_ENABLED` in the ignored backend configuration, restart, and route Expo's
existing `EXPO_PUBLIC_API_URL` to this local backend using the established local-device
network procedure. A phone's loopback address points to the phone, not the computer;
the current loopback-only server needs the existing approved device-testing arrangement.
Do not send the test to Render, change binding automatically, enable mock payments,
or put the provider key in Expo. No client routing or environment flags were changed here.

Use a non-sensitive sample such as “Black wrap” / “Wrap doors in black.” with an
existing active category. Press Optimise once, inspect the preview, then Dismiss
without saving/publishing. Do not Regenerate or retry automatically. Disable the flag
and restart after that one attempt. Backend validation may reject a live response's
new synonyms; that is an unavailable suggestion, not permission to relax grounding.

Provider key validity, account quota, model availability and live suggestion quality
remain untested. Google's [model page](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite)
lists the selected model and structured-output support, but notes access restrictions
for projects without prior 2.5 use. No provider/model substitution is performed.

Gemini verification on Node **22.23.3**: all **14 focused AI tests**, **255 backend
tests** and **381 application tests** passed. The real local launcher returned
`{ "ok": true }` from `/health` and was stopped afterward; no authenticated datastore
operation or provider request was made. The offline configuration checker passed.
`git diff --check` passed. Logs and the health-only probe are ignored under
`.local-checks/gemini-*`. No frontend changes were needed for this adapter addition.
