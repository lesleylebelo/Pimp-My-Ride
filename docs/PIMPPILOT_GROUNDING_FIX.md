> Historical record ? superseded by [PimpPilot production service](PIMPPILOT_PRODUCTION.md). Tester allowlists, generation allowances and old release patches below are obsolete and must not be used for the new service. Historical evidence is retained.

# PimpPilot grounding correction

Production baseline: `9fa8c2731d5a4be81eeb53f43a6f781229b6d775` (main, Render revision supplied by the owner). Prepared only in the original `lesley` checkout. No provider request, production write, reset or deployment is part of this work.

## Evidence and scope

Production diagnostics supplied by the owner show HTTP 200, `validation / grounding_rejected`, `outputValidated: false`, final state `failed`. They establish provider response receipt and a counted failed reservation. They do not identify the rejected text or old subrule. Four of five daily attempts were already consumed before this work.

Offline reproduction against the old validator identifies false rejections from its closed vocabulary: harmless possessive/pronoun additions (`my`, `me`), sourced verb inflections (`wrap` to `wrapped` in a request), and neutral questions about missing budget or vehicle details. These are reproducible causes, not proof of which wording production returned.

Every old grounding rejection path was: title/description containing a non-source, non-editorial word; a new numeric literal in title/description; any pound/dollar/euro/percent symbol when the source contained none of those symbols; omission of a source `no`, `not`, `never` or `without` anywhere in the combined title/description; a clarification word outside the source/editorial words plus `scope`, `timing`, `condition`, `preferences`, `constraints`; or a clarification numeric literal absent from the source. Category membership and malformed shape were separately rejected as malformed output. Set membership alone also allowed numeric fact bindings or negation scope to move between clauses. New fixtures cover these gaps.

## Validation policy

`backend/ai-grounding.cjs` uses a closed grammatical vocabulary, finite inflection families only for actions present in the draft, and finite spelling equivalences. It permits grammar, punctuation, ordinary sentence restructuring and non-presupposing questions about general missing information. It never admits arbitrary new automotive facts or services.

Numbers, currency symbols and negators must remain unchanged in their original field. Sensitive, technical, dated, numeric, negated, status-bearing or multiple-action text additionally retains its ordered clause signature. Completion/state assertions cannot be introduced through action inflections or connecting verbs. Original description facts must remain; original title facts must remain across the suggestion. Categories still require membership in the supplied category set. Existing shape/length/question-format validation stays in place.

Conservative limitations: arbitrary synonyms are not allowed; complex valid rewrites of sensitive clauses can still be rejected. Clause signatures are a defensive lexical approximation, not semantic proof. General questions are allowed by validation, but the unchanged provider prompt can remain more restrictive. Live output quality is untested. This patch cannot reconstruct historic rejected content or subcodes.

## Content-free diagnostics

Existing correlation ID, timestamps, dispatch/response/status, stage, reason, output validation and final state remain intact. Two nullable, explicitly allowlisted fields are added to new/finalised attempt records:

- `rejectedField`: `title`, `description`, `missingDetails`, `categoryId`.
- `validationRule`: `negation_changed`, `number_changed`, `currency_changed`, `work_status_changed`, `new_content_term`, `sensitive_structure_changed`, `source_fact_omitted`, `question_numeric_reference`, `question_assumption`, `question_unprovided_term`, `category_unsupported`.

Grounding rules retain reason `grounding_rejected`; unsupported categories retain `malformed_output`. No raw tokens, text, credentials, UID, prompt or output is added to diagnostics or API errors. No extra diagnostic fields are returned to clients. Historical records are not migrated or changed. Pending/crashed attempts retain the existing unknown-state behaviour.

## Verification

Use Node 22.23.3. Deterministic backend fixtures and mocked-provider/emulator integration tests cover harmless rewrites, neutral questions, fabricated specifications, missing/reversed negations, swapped numeric/technical associations, new required services, malformed output and safe diagnostic persistence. Compatibility tests compare runtime files with the pinned production baseline and verify that authentication, request checks, rate limits, timeouts, provider configuration, daily reservation logic, rules and UI are unchanged except the documented diagnostic fields.

Commands: `npm test --prefix backend` (277 passed), `npm test` (384 passed), and isolated `firebase emulators:exec --only auth,firestore --project demo-pmr-security` running `node --test backend/test/ai-release-integration.test.cjs` (3 passed). The emulator uses synthetic data and mocked Gemini responses only. The final multiple-action binding guard was followed by another full backend run (277 passed); application code and emulator integration paths were unchanged. Logs are in ignored `.local-checks/pimppilot-grounding-*.log` files.

## Minimal production review and rollout

Generate `docs/releases/pimppilot-grounding-main.patch` with `node scripts/prepare-pimppilot-grounding-release.cjs`. It contains only eight backend runtime/test/package files and no unrelated lesley changes. Review against the pinned main revision; if main moves, recheck compatibility before applying. The patch is checked with a temporary Git index, leaving the actual index and checkout unchanged.

No Render setting change is required. Preserve `PMR_AI_*`, model `gemini-3.5-flash-lite`, Gemini key, test UID allowlist, global five-attempt daily quota and all other settings. Gemini remains the only authorised test provider; the inactive OpenAI adapter and no-paid-fallback restrictions are unchanged. No dependencies, database migrations or rules changes are needed.

After separate release approval, apply only this patch to the reviewed production main, run the same checks, and deploy through the normal process. Do not generate content to validate deployment without separate approval. The remaining daily slot has not been used by this work. For rollback, restore the prior backend revision and keep testing paused; retain every existing quota/attempt/history record. Never refund or reset attempts as part of rollback.
