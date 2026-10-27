# Azure saved-agent instructions fix

## Confirmed root cause

The owner-provided live record identifies HTTP 400 / BadRequestError at responses_request, rejected parameter instructions, credential state acquired, request ID e3d3198bf9e8eadec13a7bb5cae7a997, duration 4054 ms. The adapter supplied static task guidance as top-level instructions in responses.create. This saved-agent endpoint rejected that override. This is not a universal claim that direct-model Responses APIs prohibit instructions.

The installed @azure/ai-projects 2.9.0 SDK preserves the owner-provided getOpenAIClient({azureConfig:{allowPreview:true,agentName:'PimpPilot'}}) binding. Its request forwarding/types do not guarantee service acceptance of every direct-model parameter.

## Exact correction

Removed only top-level instructions. The existing static mode guidance is now in input[0], with role developer and input_text content. Original customer JSON and any authorised Studio photo remain in input[1], with role user. Customer content is never interpolated into developer guidance. The backend chooses the mode.

No saved-agent instructions or model configuration are edited. Backend role/ownership checks, strict JSON validation, factual grounding and category/field limits remain authoritative. Review/Apply and draft preservation are unchanged. The input message does not turn user content into system authority.

All other request options remain unchanged: store:false, stream:false, tools:[], tool_choice:'none', strict JSON schema, reasoning effort, token limits, deadlines and zero retries. No Gemini fallback, quotas, agent creation or Studio activation was introduced.

The installed SDK accepts developer input messages. Microsoft's input-message documentation also describes developer content in the input array:
https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/structured-inputs

Live acceptance by this particular saved-agent configuration still requires an approved post-deployment generation. No other parameter was removed speculatively.

## Files changed

- backend/ai-azure-provider.cjs: payload correction.
- backend/test/ai-azure.test.cjs: rejected-field regression, actual SDK serialization, trusted/untrusted separation, unchanged other options and mode isolation.
- This report. The pre-existing AZURE_FOUNDRY_503_DIAGNOSIS.md was preserved.

## Verification

- Focused Azure and compatibility checks: 16 passed, 0 failed.
- Full backend suite on Node.js 22.23.3: 341 passed, 0 failed.
- Assistant/Studio UI regressions: 19 passed, 0 failed, including draft preservation and explicit Apply.
- git diff --check: passed.

The intercepted SDK transport rejects any serialized top-level instructions with HTTP 400 and succeeds for the corrected request. Tests retain the existing PimpPilot agent name and Entra bearer authentication, both drafting roles, valid/rejected output, grounding, errors, privacy and no-fallback checks. No real Azure credentials or billable calls were used.

Evidence: ../.local-checks/azure-instructions-focused-tests.log, ../.local-checks/azure-instructions-backend-tests.log, ../.local-checks/azure-instructions-ui-tests.log.

## Deployment

Deploy the corrected backend revision to the existing Render service. No Azure variable, dependency, role, endpoint or infrastructure change is required. Keep PMR_AI_PROVIDER=azure and PMR_AI_STUDIO_ENABLED=false.

After explicit approval for one billable verification, generate one non-private synthetic customer draft with an existing category. Review and dismiss; do not Apply or submit. If another field is rejected, inspect the existing sanitised parameter/status/request-ID telemetry before making another correction.

No commit, push, deployment or live AI call was performed.
