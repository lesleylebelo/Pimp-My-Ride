# Showcase feed HTTP 500 investigation

Date: 11 October 2026. Scope: investigate the HTTP 500 shown on Customer
Discover and Shop Find Jobs. No production service or data was accessed.

## Outcome

The shared failing API path is identified, but its deployed root cause is **not
established** from the screenshots and local checkout alone. No production
stack trace, backend request log, Firebase index status, or deployed data was
available. A source-code repair would therefore be speculative. No production
code, configuration, index declaration, or data was changed.

## Request trace

Both screens use `usePostsFeed`, which calls `postsApi('feed', ...)`. That calls
the authenticated REST client with:

| Screen | Request |
| --- | --- |
| Customer → Discover | `GET /api/posts?service=<selected service>&q=<normalized search>&limit=20` |
| Shop → Find Jobs | `GET /api/posts?service=All&q=&limit=20` |

Optional `cursor` is included for later pages. Undefined query values are
omitted. The request includes `Authorization: Bearer <Firebase ID token>`.
Backend middleware verifies the token and `postsList` then allows active,
verified owner and shop profiles. The client source filter is local and is not
sent to the API.

The Express route is `GET /api/posts`, dispatched to `services.postsList`, then
`createPosts().postsList`. Both screens use this same endpoint and operation;
Shop Find Jobs also loads service requests separately, which is not the
showcase-post request.

## Backend and index inspection

`postsList` reads and authorizes the caller, queries `posts` where
`status == published` and `authorRole == shop`, optionally filters by category,
then orders by `createdAt desc` and document ID descending. It reads each
returned shop's user profile for the public response and maps vehicle values
through the existing `postVehicle` mapper.

The checked-in `firestore.indexes.json` includes composites for:

- status + authorRole + createdAt + document ID (unfiltered feed);
- status + authorRole + category + createdAt + document ID (service filter);
- those filtered query forms with `shopId` (shop-specific feed).

This establishes only that the repository declares these indexes. The
operations guide says indexes must be deployed and ready. Their production
status cannot be confirmed from this workspace. A missing composite index is
therefore neither proven nor ruled out.

The Express error middleware returns a generic response for unexpected
exceptions, but logs `method`, route path, HTTP status, error code, message and
stack for internal errors. It intentionally does not log request bodies.
Authentication/permission `ApiError`s normally map to 401/403 rather than 500;
that does not identify the cause of this particular response.

## Evidence and limitations

- The screenshots show only the client-facing generic HTTP 500 message. They
  contain no endpoint diagnostics or backend exception.
- Local source confirms the two screens converge on the same feed endpoint.
- Focused client Discover/Shop screens passed 19/19 tests. Those tests use
  mocked data and do not contact the deployed API.
- Focused local showcase API tests passed 2/2. They use an in-memory Firestore
  fixture and exercise authenticated REST feed/create/list behavior, empty
  feed output and the API response shape. They do not validate remote indexes,
  live records, or deployment configuration.
- The existing local API test sends an object vehicle and verifies its
  serialized shape. PMR-01's client rendering fix is separate from this GET
  failure; no evidence connects that UI fix to the server's HTTP 500.
- No deployed request was replayed: no authenticated device token was used and
  no live endpoint or customer data was accessed.
- The exact underlying operation/exception, whether this affects all accounts
  or only records/accounts, and whether the cause is deployed code, index
  state, configuration, or stored data remain unknown.

## Test results

| Run | Passed | Failed | Total |
| --- | ---: | ---: | ---: |
| Focused client Discover and Shop feed tests | 19 | 0 | 19 |
| Focused local backend showcase REST tests | 2 | 0 | 2 |
| Complete application suite | 225 | 4 | 229 |
| Complete backend suite | 137 | 1 | 138 |

The four application failures are the same known baseline failures documented
in `PMR08_DEBUGGING_REPORT.md`: Garage pagination, private photo/WebP picker
expectation, and two guest initial-route expectations. The backend's one
failure is the previously recorded intermittent photo-route HTTP
`ECONNRESET`; it is outside the showcase feed.

No failure reproducing the deployed feed 500 was established locally. No
regression test purporting to reproduce that unknown failure was added.

## Exact logs needed to establish the root cause

Please provide the following **redacted** records for each occurrence, one from
Customer Discover and one from Shop Find Jobs. The screenshots appear to show
about 20:34–20:35 local time on 11 October 2026; if that date/time is not
accurate, use the actual device time and timezone.

1. From the deployed API service runtime logs, the complete matching entry
   beginning:

   ```text
   API operation failed: method=GET path=/api/posts status=500 error.code=... error.message=...
   error.stack=...
   ```

   Include the stack continuation lines and timestamp. Redact any access tokens,
   secrets, signed URLs, email addresses, customer names, and private document
   contents. This logger normally excludes request bodies and query strings.
2. If there is no such runtime error entry, provide the deployed API access log
   entry for the same timestamp showing method, route path and status, plus any
   nearby startup/restart/crash log. Include the deployment/revision identifier
   and service region, but no environment variable values.
3. From the iPhone/Expo console, provide only the corresponding
   `[PimpMyRide API request failed]` entry with `status`, `requestUrl` reduced to
   the path (remove its query string), and `responseBody`. Remove tokens and
   personal data. This can confirm that both observed responses came from this
   route and show the server's error envelope; do not send a full console dump.
4. If the deployed exception mentions a Firestore index, check Firebase Console
   index status for the `posts` collection and the relevant composite query.
   Report only whether the index is ready/missing/building; do not send project
   credentials or customer data. No index deployment should be made as part of
   this investigation without approval.

## Local versus deployed status and next steps

The isolated local REST path passes; that does not resolve or verify the
physical-device/deployed failure. The deployed cause remains pending the
redacted evidence above. No code, deployment configuration, index, credential,
or Firestore data change is authorized or recommended until that exception is
identified.

After correlating the runtime entry with the exact request, determine whether
the exception is an index failure, a malformed/missing post or shop profile
field, an auth/profile lookup failure, or another backend/runtime error. If
the evidence requires a production index/configuration/data change, request
approval before doing it.
