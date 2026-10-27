# PimpPilot Studio

Customers open Studio from an active vehicle in My Garage. They can optionally choose a device photo, describe their objective, refine the returned plan, and select proposed work for a Service Request. Transfer displays the exact proposed scope and requires confirmation. The normal request form still requires category, location, budget and submission; Studio never writes marketplace records.

The existing drafting assistant's prompt, grounding checks, limits, categories and opt-in remain unchanged. Studio uses the explicitly selected backend provider (`PMR_AI_PROVIDER`), with separate backend-controlled instructions and a strict output schema. Azure selection uses the existing PimpPilot Foundry agent and never falls back to Gemini; see [Azure verification](AZURE_FOUNDRY_VERIFICATION.md). Clients cannot select a mode, provider, model, account or arbitrary media URL. The server verifies an active owner, vehicle ownership and archive state before generation and rechecks access and vehicle details afterward. Registration numbers are excluded from provider inputs. Requests have bounded context, image size, output validation, a deadline and concurrency limits.

## Local configuration

Set `PMR_AI_STUDIO_ENABLED=true` in the existing backend environment to opt in. Studio uses the existing `PMR_AI_PROVIDER` selection. Gemini uses `PMR_AI_MODEL` and `GEMINI_API_KEY`; Azure uses the five server-only Azure variables documented in the verification report. Its switch is independent of `PMR_AI_ASSIST_ENABLED`. No local secrets or live settings were changed by this implementation.

Reference-image editing is unavailable in this integration. Studio explicitly reports this, never substitutes a generic picture, and returns `imageEditingAvailable:false`. Actual image generation would require a configured reference-editing provider and a reviewed private-media retention implementation.

## Privacy and lifecycle

The device photo is resized and converted to JPEG, capped at 1 MB, and transmitted inline with the customer's plan request over the existing authenticated API. The customer sees this disclosure before generation. No new storage bucket, database document, file upload or provider Files API resource is created. Text and the current image are resent for refinements. The latest six turns are held in screen memory as untrusted context. Replacing the image resets prior planning context. Leaving the screen, losing focus or changing accounts clears the session and ignores late results. Provider-side handling remains subject to the selected provider's account terms; application memory-only handling is not a promise of zero provider retention.

Only selected proposed scopes enter the draft, with a 300-character combined limit. No recommendation is selected automatically. Budget, category, dates and attachments are never inferred or transferred. Longer plans require fewer selected items; the resulting draft remains editable in the normal form.

Provider integration references: [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding) and [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).

## Verification

Run `node --test backend/test/ai-studio.test.cjs` and the existing backend/frontend suites. All tests use injected providers and in-memory records; they do not write to production or call a real AI provider.
