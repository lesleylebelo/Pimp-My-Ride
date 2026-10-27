# PimpPilot saved-agent request compatibility

## Confirmed cause and correction

The owner supplied a live HTTP 400 / BadRequestError at `responses_request`, rejected parameter `reasoning`, credential state `acquired`, request ID `49a9f5a4d67b6b39b5f5e803490f9603`. The adapter sent `reasoning:{effort:'minimal'}` to the saved-agent endpoint. That override is rejected in this configuration. Removed it; underlying model reasoning and saved-agent configuration are unchanged. The earlier live rejection of top-level `instructions` remains fixed.

This is a confirmed request compatibility defect, not evidence of a quota, timeout, credential, or RBAC problem. A token was acquired; the record does not independently prove every permission the identity holds. The raw Azure error body was not supplied or logged, so no more specific service restriction is claimed.

## Generated example and installed SDK

The owner supplied the actual portal-generated example:

```js
const openAIClient = projectClient.getOpenAIClient({
  azureConfig: {allowPreview: true, agentName: 'PimpPilot'}
});
const conversation = await openAIClient.conversations.create({
  items: [{type: 'message', role: 'user', content: 'Hi PimpPilot'}]
});
const response = await openAIClient.responses.create({conversation: conversation.id});
```

The binding matches our adapter. The example illustrates a persisted conversation; it is not a whitelist of accepted optional fields. We retain stateless input and do not create a conversation. Microsoft's [runtime documentation](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/runtime-components) describes durable conversations and non-stored responses. Its JavaScript non-storage example uses the project-level `agent_reference` route, so it does not establish acceptance of every option on this dedicated agent endpoint. Non-storage is also not a claim of zero retention across all Azure operational systems or policies.

Inspected installed `@azure/ai-projects` 2.9.0, `@azure/identity` 4.14.0 and transitive `openai` 7.45.0. `AIProjectClient.getOpenAIClient` binds the existing name, requests `https://ai.azure.com/.default`, and builds `/agents/PimpPilot/endpoint/protocols/openai/responses?api-version=v1`. The OpenAI Responses transport forwards the request body, including unsupported overrides; it is not a saved-agent compatibility validator. No dependency, route, version, credential, or role change is needed for this correction.

## Complete parameter audit

Before this correction the body contained exactly `input`, `store`, `stream`, `tools`, `tool_choice`, `max_output_tokens`, `reasoning`, and `text`. Top-level `instructions` had already been removed. No other optional body fields are injected by our adapter; intercepted installed-SDK serialization checks the exact body.

The [Responses reference](https://ai.azure.com/api-reference/responses/) describes `/openai/v1/responses`, including fields rejected here. It establishes general Responses vocabulary, not a complete accepted contract for this saved-agent route. The statuses below deliberately distinguish that evidence from live acceptance.

| Field | Evidence and compatibility status | Decision / requirement |
| --- | --- | --- |
| `instructions` | Earlier live HTTP 400 explicitly rejected it. | Absent. Saved-agent instructions are not edited. |
| `reasoning` | Latest live HTTP 400 explicitly rejects it. | Removed. Use the existing saved-agent/model reasoning behavior. |
| `input` | General Responses supports input; portal example instead supplies conversation context. Exact inline developer/user combination is SDK-serialized, not live-verified here. | Retain static backend guidance as developer input; customer JSON and any authorized Studio image remain user input. |
| `text.format` | General reference describes strict JSON schema; dedicated endpoint acceptance remains unverified. | Retain mode-specific schema, name, `strict:true`, and `type:'json_schema'` to constrain generated output. Authoritative backend shape/length/category/grounding validation is unchanged. |
| `tools:[]` | General reference supports tools; dedicated override behavior remains unverified. | Retain the empty request tool list; do not introduce tool definitions or assume this alone proves the saved agent has no configured tools. |
| `tool_choice:'none'` | General reference describes tool selection; dedicated endpoint acceptance remains unverified. | Retain explicit tool suppression. Reject tool-call output as before. Removing suppression requires establishing the agent's tool configuration and privacy implications. |
| `max_output_tokens` | General reference supports the field; dedicated endpoint acceptance remains unverified. | Retain existing 4000 drafting / 6000 Studio response budget. Backend output-size limits and deadlines remain independent. |
| `store:false` | Microsoft documents non-storage with agent responses; exact dedicated-route acceptance remains unverified. | Mandatory privacy constraint. Never retry with storage enabled or create a conversation as a workaround. |
| `stream:false` | General reference supports streaming control; installed SDK also defaults to non-streaming. Dedicated service acceptance remains unverified. | Preserve the existing explicit completed-response contract consumed by the extractor; no SSE handling is introduced. |
| `model`, `conversation`, `previous_response_id`, `agent`, `agent_reference` | Not sent. Agent binding comes from the existing client URL. | Do not substitute a deployment, persist context, or add another routing mechanism. |

No remaining option has been removed based only on its absence from the portal example. Privacy, tool suppression, strict format, and response budgets have concrete requirements; this patch does not trade those requirements for speculative acceptance. The explicit non-streaming field is preserved with the existing extractor contract. There is no new optional override, compatibility retry, alternate route, or fallback. A successful live call accepting the complete combination is still missing; local tests cannot supply it.

If `text.format` is later explicitly rejected, investigate configuring the existing agent's structured response format, or a schema supplied in trusted task guidance with equivalent authoritative backend validation. Neither alternative is activated here and neither may silently accept invalid or invented output. If `store:false` is rejected, treat the dedicated endpoint as a privacy blocker: stop this route, obtain documented retention guarantees for an alternative stateless agent route, and seek authorization before changing it. Do not enable storage. If tool controls are rejected, do not remove them without establishing safe agent configuration. No automatic parameter stripping is implemented.

## Final serialized body

```js
{
  input: [
    {role: 'developer', content: [{type: 'input_text', text: STATIC_MODE_GUIDANCE}]},
    {role: 'user', content: [{type: 'input_text', text: JSON.stringify(BOUNDED_CUSTOMER_CONTEXT)}]}
  ],
  store: false,
  stream: false,
  tools: [],
  tool_choice: 'none',
  max_output_tokens: 4000,
  text: {format: {type: 'json_schema', name: 'pimppilot_draft', strict: true, schema: DRAFT_SCHEMA}}
}
```

Studio uses its own static guidance and schema, name `pimppilot_studio`, and token budget 6000. Only the authorized Studio path can append a bounded inline `input_image` to the user content; the image is excluded from the JSON text. Live Studio remains disabled. Static developer guidance never interpolates customer content. It supplies task context without changing the saved agent, and backend checks remain authoritative regardless of message authority.

Transport options remain separate from the JSON body: abort signal, zero SDK retries, and the existing deadline. No automatic repair, storage fallback, Gemini fallback, application generation-count quota, submission, publication, or Apply is introduced. Authentication, eligibility, ownership, concurrency, grounding, draft preservation and sanitized diagnostics remain unchanged.

## Changed files and verification

- `backend/ai-azure-provider.cjs`: remove only the rejected reasoning override; explain why agent/model configuration controls reasoning.
- `backend/test/ai-azure.test.cjs`: reject both confirmed unsupported overrides; compare every remaining option and complete schemas in drafting and Studio; verify actual SDK serialization, agent binding, Entra audience/bearer authentication, and negative transport controls for both rejected fields.
- This report. Prior diagnosis reports are preserved.

All Azure tests use synthetic credentials and intercepted HTTP or fake clients. The mock accepts the remaining options to exercise our contract; this does not prove their live service acceptance. Existing tests cover Customer/Workshop access and drafting, grounding rejection, malformed/refused/tool/incomplete/oversized output, safe provider errors, no marketplace writes, no fallback and Studio isolation. No live credential acquisition or billable request is performed.

Verification on Node.js 22.23.3:

- Focused Azure and production compatibility suites: **16 passed, 0 failed** ([log](../.local-checks/azure-reasoning-focused-tests.log)).
- Full backend suite: **341 passed, 0 failed** ([log](../.local-checks/azure-reasoning-backend-tests.log)).
- `git diff --check`: passed.

## Deployment and one controlled verification

A backend deployment to the existing Render service is required to activate the correction. No Render variable, endpoint, dependency, agent configuration, role or infrastructure change is prescribed. Keep `PMR_AI_PROVIDER=azure` and `PMR_AI_STUDIO_ENABLED=false`.

After explicit owner approval for deployment and one billable attempt: deploy this revision, then use an authorized customer account with a non-private synthetic draft (title `Black wrap`, description `Wrap doors in black.`, and an existing appropriate category). Generate once, review, and dismiss. Do not Apply, submit, upload an image or retry automatically. Success must pass existing validation. On failure retrieve only the matching sanitized operation record (stage, status, safe code/parameter, request ID, credential state, subcode and local correlation ID). A further field rejection requires that evidence before any change; a storage rejection must follow the privacy-blocker handling above.

No commit, push, deployment, live settings change, agent mutation or live Azure invocation was performed. This fixes both observed request overrides as far as current evidence allows; it does not certify complete live endpoint compatibility.
