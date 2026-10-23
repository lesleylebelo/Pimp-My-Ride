# PimpPilot structured-output compatibility

Baseline: deployed main `1a98e86d7ce301a9f6fe396d2d0b6bbd7508fdd2`. Prepared only in the original lesley checkout, without provider calls, production writes or quota changes.

## Confirmed evidence and uncertainty

The 2026-10-23 14:29:59 UTC reservation received provider HTTP 200 and finished with `output / malformed_output`, outputValidated false, both grounding subcodes null. It was the fifth daily reservation. These fields cannot establish whether the failed check was an HTTP-envelope parse, candidate/part check, answer JSON parse, or suggestion shape/length check. No historical response is available or retained. This patch does not claim to identify the precise production subrule.

Offline fixtures reproduce a real compatibility error: the prior parser rejects `thought: false` on otherwise valid text parts, and cannot separate `thought: true` summaries from final structured JSON. It also rejects string thought signatures on the retained Gemini 2.5 path, although signatures are documented for both model families. New extraction validates known text-part metadata, discards thought summaries/signatures in memory, concatenates only non-thought text parts in order and parses that text as JSON. It never returns or persists transport metadata or thought text. Unknown/non-text parts still fail closed. Signature-only parts without text remain rejected in this non-streaming flow.

Sources: [generateContent response, Candidate, FinishReason and Part reference](https://ai.google.dev/api/generate-content), [thought summaries](https://ai.google.dev/gemini-api/docs/generate-content/thinking), [thought signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures). Google documents a boolean thought marker and opaque string signatures. This is a stateless REST call; no multi-turn history is constructed.

## Output checks and new content-free diagnostics

All existing malformed-output paths are now classified with two nullable, allowlisted fields, `outputStage` and `outputRule`, persisted alongside the existing correlation ID and reason. Neither field accepts arbitrary strings. No raw response, prompt, generated text, draft, credential, provider message, field value or customer identifier is added to diagnostics. HTTP status, user-facing error text and API error response shape remain unchanged.

| Stage | Rule identifiers |
| --- | --- |
| envelope | body_too_large, envelope_json, envelope_type, prompt_blocked |
| candidate | candidates_missing, candidates_empty, candidate_count, candidate_type, candidate_blocked, finish_max_tokens, finish_continuation, finish_not_stop, content_role |
| parts | parts_missing, part_type, part_metadata, answer_text_missing |
| json | answer_json |
| suggestion | object_type, unknown_field, required_field, title_type, title_empty, title_length, description_type, description_empty, description_length, category_type, category_unsupported, questions_type, questions_count, question_type, question_empty, question_length, question_format, unexpected_validation |

Prompt safety blocks retain provider_blocked. Known candidate safety/recitation blocks now also use provider_blocked with candidate_blocked, instead of generic malformed_output. Other listed checks retain malformed_output. MAX_TOKENS and CONTINUATION are rejected without retries, continuations or token-budget changes. Exactly one candidate and role model remain required. Empty/missing candidates and missing finish reasons are rejected. A non-streaming response must finish with STOP to be used.

Backend suggestion validation still requires all four schema keys: title, description, categoryId and missingDetails. Category is semantically optional through explicit null, and questions through an empty array; missing keys, null title/description/questions and wrong types are not defaulted or repaired. String trimming, length limits, category membership, question punctuation and the original grounding validator remain enforced. No fenced-JSON stripping, JSON repair or fabricated defaults are introduced. No external JSON-schema engine is added: the existing explicit backend checks remain authoritative after JSON extraction.

## Verification and release

Node 22 deterministic tests cover valid envelopes, split text, true/false thought flags, signatures, missing/empty/multiple candidates, prompt/candidate safety blocks, truncation/continuation, bad JSON, field omissions/types/limits, nullable category, empty questions, grounding pass/rejection and allowlisted diagnostic persistence. Compatibility checks pin this baseline, compare grounding and non-AI runtime files byte-for-byte, preserve the provider request/configuration, compare the entire authentication/request/rate-limit/dispatch path and permit only the two new diagnostic fields in quota-control code. Test totals are in the final report and ignored `.local-checks/pimppilot-output-*.log` files.

Generate the seven-file backend patch with `node scripts/prepare-pimppilot-output-release.cjs`: `docs/releases/pimppilot-output-main.patch`. Apply only after review to the pinned production main, or revalidate against a newer main. No dependency, Render environment, model, provider, rules or database migration change is required. All quota counting, allowlists, fail-closed behaviour and history remain intact; existing records are not backfilled. The OpenAI adapter stays inactive with no fallback.

No live test has been performed and no evidence proves the reproduced metadata problem caused the previous attempt. Review/deploy separately; any future generation also requires separate approval and an available UTC-day allowance. Do not reset the consumed allowance. Roll back to the pinned baseline if necessary, keeping test activity paused and all counters/history untouched.
