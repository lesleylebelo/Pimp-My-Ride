# PimpPilot saved-agent `text` rejection fix

## Evidence and revision limit

Work is in the original repository on `lesley`, based on local HEAD `0d7b95f50af5729e7c07618ad1151b2e20f6f700`. The current source still sent top-level `text:{format:{type:'json_schema',name,strict:true,schema}}`. The owner-provided production record identifies HTTP 400, `responses_request`, `BadRequestError`, rejected parameter `text`, and `azure_http_400`. This establishes the targeted request incompatibility. The record does not include a Render deployed commit SHA, so the exact deployed revision was not independently verified. No Render access was performed.

The separately reported standalone HTTP 200 establishes genuine text generation from the same existing PimpPilot agent using minimal `input` and `store:false`. It does not prove all remaining adapter options or a validated drafting response. Earlier `instructions` and `reasoning` overrides remain absent.

## Exact correction

Remove only the top-level `text` override from the saved-agent Responses body. Extend the existing static developer guidance with an explicit JSON-only contract: exactly `title` and `description` as non-empty strings, `categoryId` as a supplied ID or null, and `missingDetails` as zero to five non-empty questions of at most 180 characters ending in `?`. Require the supplied title/description limits, no additional fields and no Markdown/code fences/surrounding text.

All customer facts, category choices and field limits remain in the separate user JSON message. None is interpolated into developer guidance. Existing grounding instructions are retained. The saved Foundry agent/model configuration is not edited.

The shared adapter also carries Studio's existing static schema in its own developer guidance, rather than an unsupported top-level formatting option. Studio's contract remains separate from the four-field drafting contract. Studio enablement is unchanged and must remain false in production.

Relevant payload diff:

```diff
- input: [{role:'developer', content:[{type:'input_text', text:instructions}]}, {role:'user', content}],
+ input: [{role:'developer', content:[{type:'input_text', text:outputInstructions}]}, {role:'user', content}],
  store:false, stream:false,
  tools:[], tool_choice:'none', max_output_tokens:studio?6000:4000,
- text:{format:{type:'json_schema',name:studio?'pimppilot_studio':'pimppilot_draft',strict:true,schema}},
```

No other request parameter was removed. The existing agent binding, Entra credentials/scope, zero retries, 13/28-second provider and 15/30-second service deadlines, output bounds, safe diagnostics, concurrency and no-fallback policy remain unchanged. No conversation, application generation-count quota, marketplace write or automatic Apply was added.

## Validation and remaining risk

`extractOutput` still requires completed assistant text, rejects refused/tool/incomplete/oversized output, and strictly `JSON.parse`s it. No Markdown stripping or JSON repair is performed. `validateSuggestion` still rejects missing/unknown fields, wrong types, unsupported categories, overlong/empty text and invalid question arrays; grounding rejects unsupported facts, vehicle details, changed numbers/negations and unsafe invented additions. Firebase account/role checks and post-generation access/category checks remain mandatory. Customer/Workshop preview, draft preservation and explicit Apply are unchanged.

The service will no longer be asked to enforce JSON Schema during generation. Equivalent server acceptance checks remain in place; invalid output fails closed rather than reaching Apply. The model may return malformed or unsuitable content more often, which is an availability risk requiring a controlled real drafting check. Other saved-agent options and developer/user input acceptance have not been newly live-verified; they are retained because no separate incompatibility is established. `store:false` is preserved; the previously missing/non-boolean storage acknowledgment is not silently interpreted as proof of persistence or non-persistence.

## Changed files

- `backend/ai-azure-provider.cjs`: targeted payload correction and trusted JSON-output guidance.
- `backend/test/ai-azure.test.cjs`: exact remaining-options checks; all three rejected-field regressions including actual SDK negative controls; separate trusted/untrusted input and mode checks; both-role parser/schema/category/grounding rejection cases; disabled Studio check.
- This report.

Existing untracked academic documentation under `docs/final-submission/` is preserved. No dependencies, credentials, environment files, flags, routes or frontend source changed.

## Tests

Actual results on Node.js 22.23.3:

- Focused Azure + production compatibility: **18 passed, 0 failed** ([log](../.local-checks/azure-text-focused-tests.log)).
- Full backend suite: **343 passed, 0 failed** ([log](../.local-checks/azure-text-backend-tests.log)).
- Assistant/Studio UI regressions, including draft preservation and explicit Apply: **28 passed, 0 failed** ([log](../.local-checks/azure-text-ui-tests.log)).
- `git diff --check`: passed.

SDK transport is intercepted and credentials are synthetic. Mock acceptance is not evidence of live Azure acceptance; no real Azure request or credential acquisition is performed by these tests.

## Controlled verification after explicit authorization

Another backend deployment is needed to activate this source change; none was performed. No Render variable change is required. Verify the intended deployed revision, retain `PMR_AI_PROVIDER=azure` and `PMR_AI_STUDIO_ENABLED=false`, and keep all existing privacy/tool controls.

After explicit authorization for deployment and the first billable scenario, as an eligible Customer generate **once** with a non-private synthetic request: title `Black wrap`, description `Wrap doors in black.`, and an existing appropriate category. Require HTTP success and server-validated four-field output; review it against those original facts and dismiss it without Apply or submission. On failure stop and inspect only the sanitized operation record, particularly rejected parameter/status/request ID or validation rule. Do not strip another parameter speculatively or retry automatically.

Only after Customer success and authorization for the second billable scenario, use an eligible Workshop to generate **once** for a synthetic Showcase draft with the same facts and an existing allowed Showcase category. Again require validation, review and dismiss. No photo, Studio use, Apply, publication, marketplace write, request matrix or automatic repetition is included.

No agent creation, credential change, commit, push, deployment or live Azure request occurred in this implementation.
