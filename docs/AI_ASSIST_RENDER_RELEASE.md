> Historical implementation/release notes. The daily testing policy and current release procedure are in [AI_DAILY_TESTING.md](AI_DAILY_TESTING.md). Its Gemini-only configuration supersedes the initial one-attempt/OpenAI instructions below.

# Gemini AI Assist: controlled Render release preparation

Prepared on 2026-10-22 in the original `lesley` checkout. No commits, pushes,
merges, deployments, Render configuration changes, Gemini calls or live database
writes were performed. Unrelated uncommitted work remains in place.

## Verified production baseline

- GitHub `refs/heads/main`, verified with read-only `git ls-remote`:
  **`10e3c0fc089aba7cdf1420c5441220b0b6956b44`**.
- Local `main` is older: `da5ee42d05a84f0f4f3c70b47ff135306b5d4704`.
  Neither branch was checked out or modified.
- Existing Render URL: `https://pimp-my-ride.onrender.com`.
  Read-only `GET /health` returned HTTP 200 and `{"ok":true}` with a Render
  routing header. No revision was returned. This proves responsiveness only.
- The owner confirmed service **Pimp-My-Ride**, production branch **main**, deployed
  commit **10e3c0f**, status **Live / Successful**, trigger **Auto-Deploy** from
  Render. Git uniquely resolves this abbreviation to the full verified SHA above.
  This is owner-supplied Events evidence, not an independent dashboard/API inspection.
- Anonymous GitHub deployment/status/check-run metadata returned 404; the health
  response itself contains no revision. Neither was used to infer deployment identity.
- `render.yaml` specifies root `backend`, build `npm ci`, start `npm start`,
  Node server entry point and `/health`. Running dashboard overrides are unverified.

The verified main backend matches this checkout apart from AI additions. It already
contains the mock-payment gate in `marketplace.cjs`, applied to `quoteAccept`,
`paymentMockResult`, `paymentRetry`, `paymentStart` and `paymentRecordInStore`.
The gate is NOT introduced by this release. If the running deployment predates it
or has different payment behavior, deploying current main could change production.
The owner's deployed revision matches this baseline, so the AI patch adds no such
payment change. Do not remove the gate or enable mock payments.

## Independently reviewable patch

Artifact: [gemini-ai-assist-main.patch](releases/gemini-ai-assist-main.patch),
based ONLY on the verified SHA above. It was applied successfully to a separate
temporary Git index; the actual index, branch and working files were untouched.
This is a textual patch, not another project, branch or worktree.

Runtime files:

- `backend/ai-provider.cjs`: Gemini and preserved OpenAI adapters; no fallback.
- `backend/ai-assist.cjs`: existing validation, roles, categories, limits, deadline.
- `backend/ai-release-control.cjs`: test UID and durable one-attempt ceiling.
- `backend/services.cjs`: import, instantiate and expose AI through existing actor.
- `backend/app.cjs`: add authenticated `POST /api/ai/assist` only.

Supporting files included:

- `backend/.env.example`: disabled configuration with no credentials.
- `backend/package.json`: add test files to the test command only.
- `backend/test/ai-assist.test.cjs`.
- `backend/test/ai-release-control.test.cjs`.
- `backend/test/ai-production-compatibility.test.cjs`.
- `backend/test/ai-release-integration.test.cjs` (explicit emulator command).

No new packages or lockfile changes. Existing dependencies are
`domain.cjs`, `marketplace-domain.cjs`, `errors.cjs`, Firebase Admin transactions,
the current authentication actor, and active `serviceCategories`. They all exist
in verified main. No Firestore rules, indexes, Supabase configuration, media,
marketplace, quotation, booking, payment, messaging or server-startup files are
included. The generator `scripts/prepare-ai-release.cjs` and this document are
local review aids, not runtime dependencies. Regenerate after any source edit.

Do not deploy the whole `lesley` diff. If Render's running backend differs from
this baseline, first rebase the PATCH CONCEPT onto that reviewed backend and rerun
compatibility tests; this patch is not certified against an unknown older revision.

## Existing client contract

The client sends `POST /api/ai/assist`, Firebase Bearer authentication, JSON
`{kind,title,description,categoryId}`. `kind` is `request` for customers and
`showcase` for approved shops. Success is `{data:{title,description,category,
missingDetails}}`; category is null or an existing `{id,name}`. Existing Express
error envelopes are preserved. No new client build is needed for this contract.

Verified main has NO AI route, so it does not support this contract yet. The running
Render's owner-confirmed deployed revision also has no AI route; a health check
alone could not have established this.
The patch supplies the route without changing existing route behavior. With AI
disabled, an eligible authenticated draft returns the existing optional-feature
503. Unauthenticated requests remain 401. An enabled but non-designated account is
403; an exhausted initial allowance is 429. All leave the form unchanged.

## Render environment (server only)

| Variable | Initial deployment value |
| --- | --- |
| `PMR_AI_ASSIST_ENABLED` | `false` |
| `PMR_AI_PROVIDER` | `gemini` |
| `PMR_AI_MODEL` | `gemini-2.5-flash-lite` |
| `GEMINI_API_KEY` | Secret from the existing Free-tier AI Studio project, entered privately in Render |
| `PMR_AI_TEST_UID` | `aT6RWRl4AtQjtJKYIiD39eaR3x73` (owner-designated existing test account) |

The extra test UID is mandatory. Missing UID fails closed even if AI is enabled.
Only after separate approval set the enabled flag to `true` for the one attempt.
Preserve all existing Render variables. Do not alter `PMR_MOCK_PAYMENTS_ENABLED`,
Firebase/Supabase credentials, emulator settings, billing, provider or model.
OpenAI is never called with the explicit Gemini selection; do not add its key.
Do not use `EXPO_PUBLIC_*` for any provider credential. Render's `npm start` consumes
its environment; the ignored local `.env.local` is neither deployed nor required.
The local key file remains ignored and untracked; it was not changed or printed.

## Durable global ceiling

The initial release allows **ONE provider attempt total**, not one per user,
instance, deployment or day. A Firestore transaction creates
`aiAssistControl/initial-provider-test-v1` with `{version:1,attempts:1}` BEFORE
fetching Gemini. Every instance uses that same document. Existing quota records
deny further attempts; malformed records, unavailable storage or uncertain commits
fail closed. Provider errors, timeouts, crashes and invalid suggestions consume
the attempt. There is no refund, automatic retry, reset, expiry or environment
variable to raise the ceiling. Changing UID/model or restarting cannot reset it.
Do not delete the record or rotate its ID to repeat a failed test.

Only the future authorised test creates this small metadata record. No customer,
request, photo, quotation, booking or payment document is changed by AI. No UID,
prompt, key or response is stored in the counter. Existing Firestore rules deny
direct-client access to this unmatched collection; Admin SDK transactions use the
existing backend identity. No migration, rule change or composite index is needed.
Existing per-user/process limits remain supplementary.

Gemini also applies model/project-specific RPM, input TPM and daily quotas; they
are shared by keys belonging to that project. Check actual available Free-tier
limits/model access in AI Studio before activation; do not assume a historical
published allowance or configure paid billing. The one-attempt application ceiling
does not control other applications using the Google project. Input is bounded
by existing draft/category limits and output by 1,800 tokens. See Google's
[rate-limit documentation](https://ai.google.dev/gemini-api/docs/rate-limits).

## Deployment and rollback procedure — not executed

1. Retain the owner-confirmed deployed SHA/status/branch above as the rollback
   baseline; recheck it immediately before any future release. Capture the Render
   deployment ID and actual root/build/start overrides. Confirm the designated UID's
   account eligibility plus Free tier, selected model access and quota in AI Studio.
2. Review only the patch's file list and source. After separate approval, land only
   the AI patch onto the approved production baseline, rerun all backend and
   compatibility checks and record the resulting release SHA. Do not merge lesley.
   Auto-Deploy is confirmed enabled: review/pause it before any future main push
   when a separate deployment approval is required. No push
   is authorised by this document.
3. Configure the table above privately with AI disabled. Deploy only the reviewed
   SHA to the EXISTING Render service after approval. Confirm deployed SHA and
   health; verify normal authentication and existing non-AI read-only workflows.
   Check the optional AI 503 using the eligible account. Do not publish test data,
   accept quotations or run payment actions as a release probe.
4. Separately authorise activation and the single test, including the quota metadata
   write. Enable the flag, wait for Render's environment rollout, and use the
   designated account's existing AI UI once with non-sensitive synthetic text and
   an existing category. Review then Dismiss; do not save or publish. Do not press
   Regenerate or retry. Other accounts must be rejected before quota/provider work.
5. Disable the flag and complete the Render environment rollout immediately after
   the attempt. Record only status/timing and a content-free outcome, never the
   key, auth token, draft or raw provider response. A consumed allowance stays
   consumed across deployments. Expanding testing needs another reviewed design.
6. If the production test or unrelated functionality fails, first set the flag to
   `false` and roll out that configuration. An already in-flight call may still
   finish within its 15-second deadline. If needed, restore the recorded known-good
   Render deployment while keeping AI disabled. Account for automatic deployment
   settings so they do not immediately redeploy the failed revision. Do not change
   payment settings, roll back business data or delete/reset the quota record.
   This feature has no business-record migration to reverse.

## Readiness

Node **22.23.3** verification:

- **263 backend tests passed**, including authenticated customer/shop Gemini
  contract, designated-account HTTP enforcement, fail-closed storage, exhausted
  allowance, provider failure/deadline consumption and production compatibility.
- **76 emulator tests passed**: 12 rules, 17 Auth/backend, 32 marketplace/messaging,
  9 private photos, 4 showcase and 2 new durable-quota/rules regressions. The real
  transaction test produced exactly one reservation from twelve concurrent
  instances and retained denial after constructing another instance.
- Production compatibility asserts all other backend modules, dependency lock,
  Firestore rules and Render definition are unchanged from the confirmed SHA;
  stripping only AI wiring reproduces the original app/services source exactly.
- Patch applies cleanly to the confirmed SHA in an isolated temporary index;
  real index/branch/working files are unchanged by the patch check.
- Local Gemini key absent from all **295 non-ignored repository files**, including
  the patch; no credentials were emitted. No new client bundles were generated.
- `git diff --check` passed. A repeated backend run hit the previously observed
  photo-upload HTTP test `ECONNRESET`; the subsequent complete run passed without
  source changes. Emulator data was synthetic `demo-pmr-security` only; emulator
  processes shut down after tests. Logs are ignored `.local-checks/gemini-release-*`.

The patch is independently reviewable and compatible with the owner-confirmed live
main revision. It is ready for code/release review; no deployment or activation is
authorised. Remaining preflight checks are actual Render build/start overrides and
rollback deployment ID, test-account eligibility and AI Studio Free-tier model access/
quota. A disabled deployment can be considered after review; activation must remain
separate and requires those account/quota checks. No provider call can occur with
the deployment's required `PMR_AI_ASSIST_ENABLED=false` setting.
