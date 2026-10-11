# PMR-01 debugging report

Date: 11 October 2026. Scope: fix the showcase-card vehicle rendering crash.

## Root cause

The showcase API's `publicPost` serializer in `backend/posts.cjs` returns
`vehicle` as an object with `make`, `model` and `year` properties. The
`PostCard` component inserted `post.vehicle` directly as a React Native `Text`
child. When the API supplied its normal object value, React Native attempted to
render an object and raised “Objects are not valid as a React child”.

The cause was confirmed in the current checkout: `PostCard` rendered the raw
value and the showcase API test fixture creates and returns a vehicle object.
No API or database contract change was required.

## Files modified for PMR-01

| File | Change |
| --- | --- |
| `src/features/marketplace/components/PostCard.js` | Format object vehicles as year, make and model text; preserve historical strings and omit unusable values. Existing card styling, actions and interactions are unchanged. |
| `tests/marketplace-post-card.test.cjs` | Add three regression tests that render the actual `PostCard` component, covering the API-shaped object, a historical string, partial values, and null, undefined, empty and malformed values. |
| `backend/test/posts.test.cjs` | Assert the existing showcase API continues to return the expected `{make, model, year}` vehicle shape. |
| `docs/PMR01_DEBUGGING_REPORT.md` | Record the diagnosis, change, test evidence, remaining failures and limitations. |

The existing uncommitted PMR-08 test-infrastructure changes and
`docs/PMR08_DEBUGGING_REPORT.md` were preserved. No commit was created.

## Implementation

`PostCard` now converts a legacy string vehicle to trimmed text or formats a
non-array object from finite numeric/string year, make and model parts, in that
order. Unsupported values and blank fields are ignored. If no displayable part
remains, the vehicle text row is omitted. This covers null, undefined, empty,
array, primitive and malformed-field inputs without placing an object inside
`Text`.

The API response shape, styling, card actions and interactions remain
unchanged.

## Regression tests added

- The actual `PostCard` renders `{make: "Toyota", model: "Corolla", year: 2020}`
  as `2020 Toyota Corolla`.
- Historical string values remain readable.
- Partial object values are formatted, and absent, null, empty, array, primitive
  and malformed values omit the vehicle text row without a render error.
- The existing showcase REST test now verifies its response continues to use
  the object vehicle shape.

## Before-and-after test results

| Run | Passed | Failed | Total |
| --- | ---: | ---: | ---: |
| PMR-08 complete application baseline | 222 | 4 | 226 |
| PMR-01 focused `tests/marketplace-post-card.test.cjs` | 3 | 0 | 3 |
| Focused `backend/test/posts.test.cjs` | 2 | 0 | 2 |
| Complete application after PMR-01: `npm.cmd test` | 225 | 4 | 229 |

The full application run adds three passing regression tests and retains the
same four failures recorded at the PMR-08 baseline. They are unchanged,
out-of-scope issues:

1. Garage pagination does not append vehicles while scrolling (PMR-10).
2. The private photo picker test disagrees with its current WebP type list
   (PMR-14).
3. Guest navigation expects `SignIn`, while the current initial route is
   `Splash`.
4. Unverified-user navigation also expects `SignIn` rather than `Splash`.

The application suite reported zero skipped, cancelled or todo tests. The two
focused runs passed. The `react-test-renderer` deprecation notice is emitted by
the existing test tooling; it did not affect results.

## Verification limitations

Validation used local Node-based test doubles and the repository's local test
suite. No emulator/device, browser, native build, live backend, Firebase,
Supabase or production data was accessed. Therefore these results verify the
rendering path and API fixture shape, not a deployed service or native-device
render. The backend test uses its existing fixture rather than live Firestore.

## Recommended next task

Stop after PMR-01 and wait for approval. PMR-02 should be handled as a separate
authorized task; none of the remaining failures above were changed here.
