# PimpPilot Azure HTTP 503 diagnosis

Work completed locally on `lesley`. No commit, push, deployment, Render change, Azure credential acquisition, or billable AI call was performed. Request options, grounding, access controls, generation policy, and Studio enablement were not changed.

## Confirmed evidence and limit

The two owner-supplied live failures were 631 ms and 368 ms, with `reasonCode: provider_http`, `providerHttpStatus: null`, and no output-validation failure. These are provider-operation failures before suggestion validation. They are not evidence of a quota or timeout problem.

The original mapper selected `provider_http` only when the top-level SDK exception carried an integer `status`/`statusCode` outside its explicitly classified statuses. However, the adapter called `onResponse(200)` only after success. On exceptions it created a new safe `AIFailure` without carrying the SDK status, headers, code, parameter or request ID into server telemetry. This conclusively explains the missing status. It does **not** identify the exact Azure rejection or justify changing a request option.

The original initializer converted SDK/client initialization failures to `configuration`. Standard wrapped credential failures generally classified as authentication/network errors. The observed classification therefore points toward the HTTP-error path, but the original live exception is unavailable; an exact status, rejected parameter or Azure failure cause cannot be reconstructed from these two records.

**The single most useful missing diagnostic is one complete sanitised `PimpPilot operation` failure record from the corrected revision.** It now carries the upstream HTTP status, operation stage, SDK error type, allowlisted code/parameter, Azure request ID, credential-observation state and stable subcode. No underlying HTTP failure is claimed resolved until that evidence identifies the cause and a controlled verification succeeds.

## Trace checked

- Versions remain pinned: `@azure/ai-projects` 2.9.0, `@azure/identity` 4.14.0; installed transitive `openai` is 7.45.0. Backend runtime remains Node.js 22.
- The existing selector routes explicit `PMR_AI_PROVIDER=azure` to this adapter. No Azure failure dispatches to Gemini.
- `server.cjs` checks the five Azure variable names and loads SDK modules before listening when Azure is enabled. This is not a live credential/RBAC probe.
- `ClientSecretCredential` receives the server-only tenant/client/secret. No Firebase caller supplies an Azure identity or endpoint.
- The installed SDK's `getOpenAIClient({azureConfig:{allowPreview:true,agentName:'PimpPilot'}})` requests `https://ai.azure.com/.default` and constructs the project's `/agents/PimpPilot/endpoint/protocols/openai/responses` route with `api-version=v1`.
- No model deployment is substituted for the agent name. The adapter creates no agent, version, conversation or deployment.
- SDK transport errors expose `status`, `headers`, `requestID`, `code`, `param` and potentially a wrapped `cause`. Credential callback failures can be wrapped in `OpenAIError.cause`. Both forms now have bounded, sanitised extraction.
- Existing SDK retry settings remain zero; the 13-second provider and 15-second Assistant service deadlines remain unchanged.

No live token audience acceptance or RBAC denial has been established. There is no evidence supporting another role assignment or changing credentials.

## Minimal corrective change

1. Added a closed-allowlist diagnostic extractor. It reads statuses from SDK errors, response wrappers and a bounded cause chain; it reads only recognised codes/parameters and constrained server request-ID formats. Unknown strings become `null`. It never logs SDK messages, stacks, prompts, raw bodies, tokens, URLs or arbitrary headers.
2. The provider now reports safe HTTP status on errors as well as success. Nested/string statuses are classified correctly instead of being lost as generic network failures.
3. Added per-operation stage observations around SDK initialization, serialization, token acquisition, Responses dispatch and output extraction. `AsyncLocalStorage` isolates observations while preserving the existing cached SDK client. A weak set attributes a shared failed token refresh to every waiting operation without sharing customer context or retaining exceptions strongly.
4. Forwarded only the sanitised diagnostic fields into the existing server-side operation record. Telemetry remains best effort and cannot cause generation failures. No diagnostic fields enter the frontend error response.

Credential state `not_observed` is intentionally inconclusive: a cached/shared token path or test double might not invoke this operation's credential observer. It is not an authentication success/failure assertion. `acquired` establishes that the credential returned a token, not that the Responses endpoint accepted its audience or permissions.

## Reading the new record

| Evidence | Interpretation |
| --- | --- |
| `sdk_initialization` / `request_serialization` | Failure before provider dispatch; inspect SDK/configuration or local serialization. |
| `token_acquisition`, `failed` | Credential operation failed, including a shared refresh. No Responses request need have occurred. |
| `azure_client_credentials` | An allowlisted `invalid_client`/`unauthorized_client` was observed during token acquisition. |
| `azure_token_audience` | An allowlisted resource/audience error was observed; verify the exact stage before changing configuration. |
| `azure_dns`, `azure_tls`, `azure_connection` | A known network cause code was observed. |
| `responses_request`, HTTP 400/422 | The Responses call was rejected. Check the safe code/parameter and request ID; do not remove privacy/schema controls speculatively. |
| HTTP 401/403 | Authentication/authorization rejection at the recorded stage. This alone does not specify which role or credential setting should change. |
| HTTP 404 | Agent/route/model lookup failure; the safe code/request ID is needed to distinguish them. |
| HTTP 5xx | Upstream server error, not proof of a general outage. Correlate the request ID with Azure diagnostics. |
| `output_extraction`, HTTP 200 | A response arrived but failed strict output extraction. Existing suggestion/grounding validation remains authoritative. |

## Official contract review

The existing SDK method, scope, generated route and API version were inspected in the **installed** SDK and tested with intercepted transport. They were not replaced by an alternate route or an automatic retry.

Microsoft's [Responses reference](https://ai.azure.com/api-reference/responses/) describes structured `text.format`, `store`, `tool_choice`, `reasoning` and output-token controls. Its [runtime documentation](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/runtime-components) supports non-stored responses and client-carried context without a persisted conversation. The [GPT-5-mini catalog](https://ai.azure.com/catalog/models/gpt-5-mini?publisher=openai) documents minimal reasoning and text/image inputs.

These sources do not establish that this particular preview agent-bound endpoint and active agent configuration accept the complete override combination. The adapter therefore retains `store:false`, strict JSON schema, `tools:[]`, `tool_choice:'none'`, minimal reasoning and bounded output tokens. No unsupported option is asserted without Azure's rejection evidence. No privacy, grounding or role control was relaxed.

## Files changed

- `backend/ai-azure-diagnostics.cjs` — new sanitised diagnostic extractor.
- `backend/ai-azure-provider.cjs` — stage observation, status forwarding and cause-aware classification.
- `backend/ai-assist.cjs` — adds safe provider evidence to server telemetry.
- `backend/test/ai-azure.test.cjs` — fast-rejection regression, real SDK error transport, concurrent/shared credential refresh, privacy and nested-error tests.
- This report.

No changes to Azure variables, roles, endpoints, SDK versions, dependencies, provider selection, client contracts, request payload, quotas, deadlines or Studio flags.

## Final verification

Full backend suite on Node.js 22.23.3: **340 passed, 0 failed**. This includes Customer/Workshop drafting, real Azure SDK transport, grounding, no automatic fallback, unlimited application-policy sequential usage, Studio role/privacy isolation and production compatibility checks. `git diff --check` passed.

[Final backend test log](../.local-checks/azure-503-backend-tests.log).

The tests intercept SDK HTTP responses and use synthetic credentials. The synthetic HTTP 400/422/etc. cases verify diagnostics; they are not evidence of the live Azure status or cause.

## Render and one owner-approved live verification

No Render variable change is justified by current evidence. Keep `PMR_AI_PROVIDER=azure`, the existing five Azure credential/project/agent values, and `PMR_AI_STUDIO_ENABLED=false`. Do not add administrative roles. A new backend deployment is required to activate these diagnostics; it does not itself guarantee resolution of the upstream rejection.

After the owner authorises deployment and **one billable verification attempt**:

1. Deploy this corrected revision to the existing backend service; leave Studio disabled and all current safeguards in place.
2. As an authorised customer, enter a non-private synthetic draft such as title `Black wrap`, description `Wrap doors in black.`, with an existing appropriate category. Click Generate once. Do not Apply, submit or publish; do not upload a photo or retry automatically.
3. If it fails, retrieve the one matching sanitised `PimpPilot operation` record, including `providerFailureStage`, `providerCredentialState`, `providerErrorType`, `providerHttpStatus`, `providerErrorCode`, `providerErrorParam`, `providerRequestId`, `providerFailureSubcode` and the existing local `correlationId`. Share that record only, not raw Azure errors, secrets, customer text or private media.
4. Use that single diagnostic to choose the exact correction. If it succeeds, check the suggestion against the original facts and dismiss it; no marketplace record should be created.

No live verification attempt has been performed or authorised implicitly by this implementation.
