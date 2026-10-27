# PimpPilot HTTP 400 invalid_value: preserve safe rejection evidence

## Follow-up: classifier deployment and operation-log verification

The current working tree already includes the classifier and its complete logging path. It is **not part of local HEAD** `5d12479a87b43d588aa9f4be3aa6b51ae7c0ac2e`:

- `git status --short` shows `backend/ai-azure-invalid-value.cjs` as untracked and `backend/ai-azure-diagnostics.cjs` as modified.
- `git ls-tree HEAD backend/ai-azure-invalid-value.cjs` returns no tracked entry.
- The HEAD version of `backend/ai-azure-diagnostics.cjs` has neither the classifier import nor `providerInvalidValueClassification`.

These local facts explain why a Git deployment from this HEAD would lack the classification. They do **not** establish Render's exact deployed SHA. No authenticated Render deployment metadata or SHA was supplied, and the owner prohibited live requests in this verification. No Render/production endpoint was contacted. Therefore the latest classifier's presence on the deployed backend cannot be confirmed. Obtain the existing Render deployment's commit SHA/build source from its Dashboard before claiming it includes these uncommitted files; this task performs no commit, push or deployment.

The complete local trace is:

1. `ai-azure-provider.cjs` catches the SDK error, calls `azureDiagnostic`, then invokes `onProviderDiagnostic` before mapping the public failure.
2. `ai-azure-diagnostics.cjs` creates the fixed classification and includes it in `sanitizeDiagnostic`.
3. `ai-assist.cjs` supplies the callback, re-sanitizes the diagnostic, then spreads all safe provider fields into the operation record in `finally`.
4. `services.cjs` forwards optional `aiDiagnostic` as `onDiagnostic`. `server.cjs` supplies no custom filter or logger, so `createAIAssist` uses its default `console.info('PimpPilot operation', entry)`.
5. The default console formatter includes `providerInvalidValueClassification`, including literal `unknown`. This is now tested through authenticated Express/service/provider dispatch with `param:null`, rather than only a custom telemetry sink.

**No operation-logger code fix is needed:** it already logs the allowlisted field. An unsupported message pattern produces a present `unknown` field for this HTTP 400 invalid_value case, not an omitted property. A complete supplied record without the field is inconsistent with this tested local path; an older deployment or incomplete copied record remains possible, but the live cause of omission is not proved.

The new logger regression exercises missing-param messages/details for input role, tool choice, tool array, output-token range and stream value; it also exercises fieldless enums, unfamiliar descriptions and secret-like values. Supported examples produce `input_role_developer`, `tool_choice_none`, `tools_empty_array`, `max_output_tokens_range` and `stream_false`. Unknown patterns remain `unknown`; known fields with unusable values can produce a field-specific `_unknown`. These classifications require provider evidence and do not infer the offending value from our payload. Exact provider text, supported-value lists, credentials, prompts and raw bodies remain absent from the formatted console record and frontend response. Azure request ID and local correlation ID are retained.

Current source and real SDK intercepted serialization exclude top-level `instructions`, `reasoning` and `text`, while preserving developer/user roles, `store:false`, `tools:[]`, `tool_choice:none`, token bounds and non-streaming. The current payload is also in local HEAD; no adapter change was made in this follow-up. The actual deployed payload cannot be independently verified without deployed revision evidence or a separately authorized production observation.

Follow-up changes are limited to the existing test fixture, a default-console logger regression, and this documentation; earlier uncommitted classifier work is preserved. Focused verification: **22 passed, 0 failed** ([log](../.local-checks/azure-classifier-log-verification-focused.log)). Full backend verification: **347 passed, 0 failed** ([log](../.local-checks/azure-classifier-log-verification-backend.log)). `git diff --check` passed. No additional live request, parameter removal, credential change, Studio activation, commit, push or deployment was performed.

## Confirmed evidence and unresolved cause

The owner-provided Render record is HTTP 400 / BadRequestError at `responses_request`, code `invalid_value`, safe parameter null, acquired credential, request ID `f68d8663-42b5-41d9-80f4-a36b8354e696`. The minimal saved-agent request previously returned genuine HTTP 200 assistant text. The credentials and agent availability therefore work for that minimal request; this record identifies another request rejection, not an established authentication, quota, model, timeout or general outage failure.

The exact invalid field/value is **not recoverable from this sanitized record**. `providerErrorParam:null` means either Azure supplied no parameter or the original parameter was outside the sanitizer's allowlist (for example `input[0].role`). No raw SDK exception or provider explanation for this live attempt was supplied. No particular remaining request parameter is accused or removed.

Work is in the original repository on `lesley`, based on local commit `5d12479` (`pimppilot err fix`). No deployed commit SHA is in the supplied diagnostic. No production access, live request, credential change, commit, push or deployment was performed.

## Exact diagnostic gap and installed SDK trace

The installed OpenAI 7.45.0 `core/error.js:APIError` retains the structured inner error in `.error`, copies its `code`, `param`, and `type`, and retains headers and a request ID. It builds `.message` from the provider's `.error.message`, prefixed with HTTP status. `APIError.generate` unwraps `errorResponse.error` when creating BadRequestError. SDK `cause` can wrap other failures. Azure 2.9.0's agent-bound client forwards the request and does not invent an invalid-value explanation.

Previously, `ai-azure-diagnostics.cjs` retained only safe status, selected codes/parameters, type, request ID, stage and credential state. It intentionally discarded all message text and most nested details; it read only selected `error`/`innererror` machine fields. Useful field/value context may therefore exist in `.message`, `.error.message`, `.error.details[]`, `.error.innererror`, or a bounded cause/response-data wrapper, but none was available in telemetry. Response headers support correlation and do not establish the invalid value by themselves.

The new diagnostic does **not** log these objects/messages. It inspects a bounded subset only to return fixed classifications. Raw HTTP bodies, stacks, tokens, URLs, customer data, generated content, supported-value lists and arbitrary metadata remain discarded. Provider request ID and local correlation ID retain the existing handling.

## Safe change implemented

- Added `backend/ai-azure-invalid-value.cjs`, a closed-field/category classifier. It runs only on HTTP 400 at Responses dispatch with an observed `invalid_value` code, including recognized nested error nodes.
- Examines at most 12 distinct objects drawn from the existing bounded cause chain and known `error`, `innererror`, `innerError`, up to four `details` entries per node, and `response.data.error` slots. Cycles are ignored. Messages over 2048 characters are ignored, not copied/truncated into logs.
- Recognizes exact approved request fields and constrained indexed input role/content paths. No arbitrary field path or index is emitted.
- Matches anchored provider-error grammar such as `Invalid value for 'tool_choice': 'none'. ...`, `Invalid value: 'developer'. ...` with a structured input-role parameter, or a named token-limit range error. Arbitrary substring mentions are not classified. A quoted unfamiliar value becomes an `unknown` category; numerical values become a type/sign category, never an exact value or bound.
- Conflicting field/value evidence returns `unknown`. Fieldless enum evidence remains explicitly fieldless. A recognized field with no usable value is reported with `_unknown`; no value is guessed from the actual request.
- Added `providerInvalidValueClassification` to the existing diagnostic allowlist, which `ai-assist.cjs` already re-sanitizes and forwards only into server operation telemetry. There is no frontend contract change.

Examples below are **synthetic test cases**, not new live evidence:

| Provider evidence | Safe classification |
| --- | --- |
| Explicit tool_choice field and literal none | `tool_choice_none` |
| Structured `input[0].role` parameter plus rejected developer literal | `input_role_developer` |
| Structured input content-type target/value in details | `input_content_type_input_text` |
| Rejected none literal without any field | `enum_none_field_unknown` — do not infer tool_choice |
| Explicit max_output_tokens range explanation | `max_output_tokens_range` — no bound logged |
| Explicit token-limit parameter and numeric value | `max_output_tokens_positive_integer` — not an exact number or proof of the violated bound |
| Known field but secret-like/unfamiliar value | e.g. `tool_choice_unknown` |
| Unfamiliar description, field, conflicting evidence or unavailable detail | `unknown` |

These tags describe the provider's evidence, not the appropriate workaround. The matcher deliberately recognizes a limited grammar rather than parsing arbitrary prose. An unfamiliar but informative explanation may still yield `unknown`; this is a privacy-preserving limit, not permission to print the error.

Relevant diagnostic diff:

```diff
+ const {invalidValueClassification,classifications}=require('./ai-azure-invalid-value.cjs');
+ // sanitizeDiagnostic adds a closed-allowlist providerInvalidValueClassification.
+ const classification=invalidValueClassification(chain,code,context.stage,status);
- return sanitizeDiagnostic({ /* existing safe fields */ });
+ return sanitizeDiagnostic({ /* existing safe fields */, providerInvalidValueClassification:classification });
```

The Azure adapter's request serialization and failure mapping are unchanged. No body field, authentication behavior, tool suppression, storage option, generation limit, role check, validation, grounding, review/Apply behavior or Studio enable flag changed.

## Request compatibility review

The minimal successful request uses string `input` and `store:false`. Current drafting additionally sends the following, as verified by installed-SDK intercepted serialization tests:

| Difference | Evidence / conclusion |
| --- | --- |
| Developer and user messages; `content` arrays with `type:input_text` | Installed OpenAI declarations accept developer/user roles and input_text parts. Microsoft's [structured-input documentation](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/structured-inputs) describes system/developer message content. Neither proves this dedicated endpoint accepts the entire combination. No current enum/type mismatch is established. |
| `tools:[]` | SDK forwards an empty array, not a JSON string or object. Saved-agent tool inheritance/restrictions still need exact rejection evidence; suppression is retained. |
| `tool_choice:'none'` | Microsoft's [Responses reference](https://ai.azure.com/api-reference/responses/) explicitly lists none/auto/required. None is a valid general Responses enum, so there is no basis to switch to auto. Dedicated saved-agent restrictions remain unverified. |
| `max_output_tokens:4000` | Serialized integer with the existing bounded generation requirement. Exact dedicated-agent override acceptance/range is not established by the minimal request. No speculative removal or limit change. |
| `stream:false` | Serialized boolean. Installed SDK defaults to non-streaming when omitted. No evidence says false is invalid on this route; preserve the option. |
| Routing/configuration | Same `AIProjectClient.getOpenAIClient({azureConfig:{allowPreview:true,agentName:'PimpPilot'}})` agent binding, dedicated Responses path, SDK-selected `api-version=v1`, ClientSecretCredential and ai.azure.com token audience. No deployment name replaces the agent. Nothing supports changing endpoint, identity or roles. |

The reference documents `/openai/v1/responses`; it is not a saved-agent override whitelist. Missing fields in the minimal example do not establish incompatibility. Top-level `instructions`, `reasoning` and `text` are already absent from current source. Larger task guidance/customer JSON differs from a greeting, but that fact does not identify a rejected value. Studio stays disabled and isolated.

## Tests and changed files

Changed files:

- `backend/ai-azure-invalid-value.cjs`: new bounded classification helper.
- `backend/ai-azure-diagnostics.cjs`: invoke helper and allowlist the new safe field.
- `backend/test/ai-azure.test.cjs`: synthetic explicit-field, missing-param, nested/cyclic, numeric/shape, unknown/oversized/secret-like and conflicting-evidence cases; actual SDK error serialization; server telemetry versus frontend privacy.
- This report.

Tests use synthetic credentials and intercepted SDK HTTP errors, never real tokens or Azure requests. Tests retain Entra bearer authentication, developer/user separation, `store:false`, `tools:[]`, `tool_choice:none`, token bounds, stream behavior and one dispatch. The existing authenticated Customer/Workshop, validation/grounding, no-fallback and disabled Studio regressions remain included. Correlation/request IDs are checked through the real server telemetry path; the classification and private error material do not appear in the public 503 response.

Actual verification on Node.js 22.23.3:

- Focused Azure/production compatibility suites: **21 passed, 0 failed** ([log](../.local-checks/azure-invalid-value-focused-tests.log)).
- Full backend suite: **346 passed, 0 failed** ([log](../.local-checks/azure-invalid-value-backend-tests.log)).
- `git diff --check`: passed.

## Minimum next evidence needed

One operation's **new sanitized classification** alongside existing stage, status, code, safe parameter, request ID and correlation ID is the minimum next diagnostic. If an original exception has already been securely retained by the owner, classify it offline without displaying its message/body. The historical log alone cannot be reclassified.

Otherwise, after explicit approval for deployment and one synthetic Customer verification, deploy this diagnostic-only revision to the existing backend and capture one matching operation record. This is a diagnostic deployment, not a claim to fix the upstream request. No Render variable change, credential rotation, Studio activation, request matrix or automatic repetition is prescribed. No deployment or request was performed here.

If the result remains `unknown` or identifies a value without a field, do not remove a protection. Use the Azure request ID with Microsoft support/service diagnostics to obtain a field-specific explanation or extend the classifier for a precisely established safe error template. Do not send raw customer bodies or secrets. Only an explicit field/value finding can justify the next targeted request correction; no such finding is asserted yet.
