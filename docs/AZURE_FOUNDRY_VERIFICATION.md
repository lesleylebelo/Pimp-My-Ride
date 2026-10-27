# Azure Foundry verification — 27 October 2026

Work is local in the original repository on `lesley`. No commit, push, deployment, Render setting change, remote agent creation, or billable AI request was performed.

## Initial finding and correction

There was no Foundry adapter and neither Azure dependency was installed. Both drafting and Studio used Gemini. Entering the five Azure variables in Render alone could not migrate this backend.

The corrected Express services now select Azure explicitly with `PMR_AI_PROVIDER=azure`. An Azure failure never calls Gemini. Explicit Gemini selection remains available for the existing deployment before rollout; it is not an automatic fallback.

## Ten readiness answers

1. **Actual Express integration:** implemented through the existing `createServices` → `createAIAssist`/`createAIStudio` routes and provider selectors. `/api/ai/assist` and `/api/ai/studio` retain their existing request and response contracts.
2. **Existing agent:** `AIProjectClient.getOpenAIClient({azureConfig:{allowPreview:true,agentName:'PimpPilot'}})` targets the existing agent. No model is passed in the response body and no agent/version/deployment is created. The endpoint resolves the agent by name; its active version and model binding must still be checked in the owner's Azure environment. Version 2 and `pimppilot-gpt5-mini` are owner-reported, not independently verified here.
3. **Entra server credentials:** `ClientSecretCredential` reads the five server-only Azure variables. This deterministic application credential is an appropriate alternative to the portal sample's `DefaultAzureCredential`; there is no CLI/browser/developer credential fallback. Firebase remains the customer/workshop authentication boundary. Credentials never enter frontend code or provider prompts.
4. **Customer/workshop drafting:** both roles run through Azure when selected. Existing active-account/approved-workshop checks, categories, JSON validation, factual grounding, field limits, review and Apply remain in place. Proposed work cannot be silently represented as completed work; no draft is automatically saved or published.
5. **Studio isolation:** the same agent is used with independent mode instructions and schema. Each call supplies a fresh input with `store:false`. No conversation or previous-response ID is accepted from a client or reused across requests. Studio history is validated, bounded to six turns and treated as untrusted data. The service rechecks customer and vehicle access after generation.
6. **Private photos:** device JPEG data is limited to 1 MB, checked server-side, and sent inline only after the customer's action. No public URL, provider File, or provider Conversation resource is created. Registration metadata is excluded. Responses contain the validated plan, never the input image. Screen focus/account changes discard private context and late replies. The application requests non-storage and disables SDK content recording, but cannot independently guarantee Azure service retention. Service-side support for `store:false`, abuse monitoring and tenant policies remains a live verification item. Image editing remains explicitly unavailable.
7. **Usage policy:** no generation counters, daily caps, tester allowlists or personal credits. Existing HTTP rate protection, concurrency leases and deadlines remain. SDK response retries are disabled to avoid hidden repeat generations; genuine provider limits produce safe errors.
8. **Blockers:** no local Azure credentials were available in this session. Live Entra token acquisition, RBAC propagation, agent active version/model and shared-memory/data-tool configuration, endpoint acceptance of strict JSON overrides and non-storage, output quality, latency and private-image handling have not been verified against the service. SDK 2.9.0 labels this agent-bound route preview and explicitly cautions against production use. That support/lifecycle constraint must be resolved before an unconditional production-ready declaration.
9. **Render changes:** see the exact sequence below. The existing infrastructure is retained.
10. **Readiness decision:** local implementation and intercepted-SDK verification are distinct from production verification. Do not declare production-ready or switch an old backend revision to Azure. A controlled, owner-approved service verification is still required before replacing Gemini for production traffic.

## Render sequence — instructions only, not executed

1. Prepare/deploy the corrected backend revision first, using the existing Render service, `backend` root, `npm ci`, `npm start` and Node.js 22. `backend/package.json` already specifies `22.x`; remove any dashboard runtime override that conflicts with it. Keep the currently working provider selected until the corrected revision is present.
2. Privately verify the existing `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and `AZURE_CLIENT_SECRET` values, expiry and app/RBAC assignment. Do not paste secret values into logs, chat or frontend environment variables.
3. Verify `AZURE_FOUNDRY_PROJECT_ENDPOINT=https://lebelolesley-6791-resource.services.ai.azure.com/api/projects/lebelolesley-6791` and `AZURE_FOUNDRY_AGENT_NAME=PimpPilot`. The deployment name `pimppilot-gpt5-mini` belongs in the agent's model configuration, not the agent-name variable.
4. Only on the corrected revision, select `PMR_AI_PROVIDER=azure` and `PMR_AI_ASSIST_ENABLED=true`. Keep `PMR_AI_STUDIO_ENABLED=false` for the initial drafting rollout. Missing/invalid Azure configuration or SDK loading now fails startup rather than silently reporting an Azure-ready backend.
5. After explicit approval for billable verification, test one customer draft, one approved-workshop draft, role denial, output grounding and timeout/error behaviour. Review active version/model, confirm the agent cannot retrieve shared customer memory or private data through inherited configuration, and resolve the preview support constraint. Do not treat `/health` as proof of live Azure authentication.
6. Enable `PMR_AI_STUDIO_ENABLED=true` only after an approved private-image and refinement check confirms the service accepts non-stored, isolated requests and the application's retention policy permits the provider handling. Publish the matching Studio frontend separately after the backend capability is available.

`PMR_AI_MODEL` and `GEMINI_API_KEY` are unused by the Azure path. They need not be deleted to prove no fallback. No sixth model-deployment environment variable is required.

## Implementation and evidence

- `backend/ai-azure-provider.cjs`: endpoint validation, Entra credentials, SDK loading, agent-bound Responses, strict JSON, tool suppression, non-storage, disabled content tracing, abort/deadline handling and sanitised failures.
- `backend/ai-provider-selection.cjs`, `backend/ai-assist.cjs`, `backend/ai-studio-provider.cjs`: actual production provider dispatch.
- `backend/ai-draft-contract.cjs`: the existing drafting prompt/schema for Azure, preserving Gemini's original implementation.
- `backend/ai-gemini-studio-provider.cjs`: the original Studio Gemini adapter, available only through explicit Gemini selection.
- `backend/ai-studio.cjs`: preserves safe provider error classifications without exposing raw SDK errors.
- `backend/server.cjs`, `backend/check-ai-config.cjs`: fail-closed startup and offline configuration/SDK checks. `npm run check:ai-config --prefix backend` acquires no token and does not call an AI service.
- `backend/package.json`, `backend/package-lock.json`: exact `@azure/ai-projects` 2.9.0 and `@azure/identity` 4.14.0. Both require Node.js 22 or newer. Existing resolved package versions/integrities are protected by compatibility tests.
- `backend/.env.example`: consistent server-only names without secret values.
- `backend/test/ai-azure.test.cjs`, `backend/test/ai-production-compatibility.test.cjs`: intercepted SDK transport and migration-specific compatibility checks.

The real installed SDK was loaded under Node.js 22.23.3. A synthetic token credential and intercepted fetch verified the actual generated `/agents/PimpPilot/endpoint/protocols/openai/responses` URL, API-version query, Entra bearer header, JSON schema and no-storage body. This verifies SDK composition and wire construction, not live Azure authentication or server behaviour.

Drafting uses minimal reasoning for the owner's GPT-5-mini binding, bounded output tokens and the original 15-second service deadline. Studio retains its 30-second service deadline. Actual service latency remains unmeasured.

## Final verification results

All final checks below passed. No production AI request was made.

| Check | Final result | Local evidence |
| --- | --- | --- |
| Azure provider and SDK transport | 8 Azure tests passed in the final backend run; earlier focused Azure/compatibility run also passed | [Backend log](../.local-checks/azure-backend-tests.log), [focused log](../.local-checks/azure-focused-tests.log) |
| Full backend, Node.js 22.23.3 | 336 passed, 0 failed | [Backend log](../.local-checks/azure-backend-tests.log) |
| Full frontend, including drafting/Studio/auth/privacy | 611 passed, 0 failed | [Frontend log](../.local-checks/azure-frontend-tests.log) |
| Firebase Auth/Firestore emulator integration | 85 passed across six suites: rules 14, accounts 17, marketplace 36, photos 9, showcases 4, profile photos 5 | [Emulator log](../.local-checks/azure-emulator-tests.log) |
| Guarded production web build | Passed, including its embedded transport verifier | [Build log](../.local-checks/azure-guarded-web-build.log) |
| Standalone web verifier | Passed separately against `dist` | [Verifier log](../.local-checks/azure-standalone-web-verifier.log) |
| Android and iOS native exports | Both Hermes bytecode exports passed | [Native log](../.local-checks/azure-native-build.log), [metadata](../.local-checks/azure-native-export/metadata.json) |
| Whitespace validation | `git diff --check` passed | Executed after all source edits |

The emulator run used only `demo-pmr-security` on local Auth/Firestore emulators. A temporary configuration used exact copies of the original rules and indexes, with the emulator UI disabled. No live Firebase data was written. The initial temporary configuration path was corrected before the successful run. Expected permission-denial/transaction-contention messages in the emulator log are exercised by passing security/race tests.

The native compiler initially encountered sandbox execution permission denial; the successful rerun used the same local Expo/Hermes export with execution allowed. Both Android and iOS `.hbc` outputs were produced. No native app was published.

The existing startup regression mock was updated to include the new offline Azure preflight. Dependency compatibility assertions now allow only the two authorised direct SDK additions and preserve every existing resolved package version, URL and integrity. No original Gemini drafting provider source, Firebase rules/indexes, Render infrastructure configuration or frontend API transport was replaced.

No local implementation/test/build blocker remains. The external production blockers in readiness item 8 remain unresolved; successful local checks do not establish service-side authentication, compatibility, isolation or retention guarantees.

## Official references

- [Microsoft Foundry JavaScript SDK source: agent-bound client](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/ai/ai-projects/src/aiProjectClient.ts). The installed 2.9.0 implementation was inspected directly; live service behaviour is not inferred from a different SDK version.
- [Microsoft Foundry quickstart](https://learn.microsoft.com/en-us/azure/foundry/quickstarts/get-started-code).
- [Microsoft GPT-5-mini model catalog](https://ai.azure.com/catalog/models/gpt-5-mini?publisher=openai): image input, text output and minimal reasoning support. This does not imply image editing.
