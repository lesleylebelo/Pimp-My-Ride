# Customer–shop messaging and open-request permissions

Implemented in the original project on `lesley`. This checkout previously had notification
history but no chat implementation. Messaging now uses the existing Firebase Auth,
Express API, Firestore database, navigation stacks and notification collection. There is
no external messaging provider and no change to quotation, location, booking or payment
workflows. No live data writes or deployments are part of this implementation.

## Permission policy

All decisions are enforced on the Express backend for initiation and every new message.
The client does not supply sender identity or another customer's UID.

| Relationship | Initiate/send | Existing history |
| --- | --- | --- |
| Approved shop can merely view an open request | No; may submit a communication enquiry | Only its own previously created thread |
| Enquiry pending | No messages until the customer approves | Participants can inspect enquiry/status |
| Current authorised quotation | Yes, while request and quotation remain valid | Retained after expiry/withdrawal |
| Current direct invitation | Only the invited shop, while the request remains open | Retained when invitation ends |
| Customer explicitly initiates or approves communication | Yes, for the owned request and eligible shop | Retained |
| Enquiry rejected or communication revoked | No; explicit denial overrides quotation, invitation and booking access | Retained for authorised participants |
| Valid matching booking | Continues authorisation after quotation expiry, unless explicitly denied | Retained after cancellation; new sends stop |
| Other customer, unrelated shop, administrator | No access to this thread | No access |

The request owner can initiate with an eligible approved shop on an owned open request.
Direct requests remain restricted to the invited shop. A matching valid booking also allows
its participants to start a thread. The shop must be active, approved and Auth-enabled;
both accounts must be active, email verified and enabled for sending. Account-operation
locks are respected. Revoked tokens are checked by the existing authentication layer.

Quotation-based access checks the current quotation head (or verified legacy deterministic
ID), participant/request binding, submitted status, terms version and `validUntil` on every
send. Withdrawn, superseded, expired and obsolete offers grant no access. Explicit customer
approval is a separate relationship, bound to the current request terms version: quote expiry
does not remove an otherwise valid approval, while a material request change requires renewed
approval or another current relationship. A direct invitation is valid only for the current
invited shop on an open request. Booking access checks request/booking ownership, accepted
quote binding and non-cancelled status.

An active customer can read historical messages after the shop becomes unavailable, but
cannot send. A shop whose own approval/account access is revoked cannot read through the
API until eligible again. History is retained; no messages are deleted on revocation.

## Conversations, messages and unread counts

The canonical conversation ID is SHA-256 of request ID, authoritative owner UID and shop UID.
Transactional creation prevents duplicate threads, including simultaneous initiation and
enquiries. An enquiry creates only a pending request record; it never grants chat permission.
Rejected/revoked threads cannot be repeatedly re-enquired by the shop. The customer can
deliberately approve again. Conversation ownership is immutable.

Data lives in `conversations/{id}` and `conversations/{id}/messages/{sequence}`. Each message
has a sender derived from verified authentication, a server timestamp and a transactional
sequence. Sequence-based document IDs make pagination stable even when timestamps tie.
Pages contain at most 20 messages/conversations. Only private participant context, request
title and vehicle make/model/year/colour are shown; chat endpoints expose no quotation prices,
other shops' quotations, registration numbers or profile credentials.

Writes require idempotency keys and use the existing mutation-receipt mechanism. Retries
produce one message, one unread increment and one recipient notification. Text is trimmed,
limited to 2,000 characters and rejects unsupported control characters. Enquiries are limited
to 300 characters. A transactional limit of ten messages per participant per conversation
per minute supplements existing authenticated Express/IP limits. The server never interprets
message text as a quotation edit, booking action or payment instruction.

Each conversation persists incoming-message counters and recipient read watermarks. Unread
count is their difference. **Mark displayed messages read** is an explicit recipient action
after viewing the chat; opening an inbox/notification, loading an older page, background
polling or sending a message never automatically marks incoming messages read. The read
watermark is based on incoming messages returned to the viewer. Concurrent messages arriving
after that observation remain unread. Notification read state remains independent of chat
unread state, using the existing notification-history controls.

## Screens and updates

Both existing navigation stacks register **Messages** and **Chat**. Entry points are available
from marketplace pages, account/profile, request details, quotation comparison and active
booking details. Owners can choose approved shops from their own request; shops can open
an authorised chat or request customer approval from an open request. The customer sees
approve, reject and revoke controls in the private chat. History shows context, sender/receiver
bubbles, SAST timestamps, unread counts, pagination and links to the request/booking.

Live updates use an authenticated secure equivalent to direct Firestore listeners:

- Active chat polls every **4 seconds**, inbox every **15 seconds**.
- Updates also refresh on foreground; polling stops on blur, background and unmount.
- Account switches invalidate pending responses and reset thread/draft state.
- Errors/revocation clear loaded private feed data; offline mode disables sending.
- Sending/failure states preserve the draft and retry key. A queued edit during an in-flight
  send cannot accidentally turn a retry into a duplicate message.
- Older messages merge in chronological order. A gap after a long interruption resets the
  message page so the user can load omitted older history normally.

Thus updates have polling/network latency rather than instantaneous Firestore delivery.
There are no background notifications, push/email transport, attachments or message editing
in this text-only first version. No physical-device two-party session was manually exercised.

Each successful message creates a private existing-style in-app notification for the other
participant, never the sender. Enquiries and consent changes also notify the other party.
Notifications target `{type: 'conversation', id}` and open the authorised Chat route; the
API rechecks access even when a notification or navigation parameter contains a thread ID.

## Firebase configuration

Firestore rules are **unchanged**. Direct client conversation/message reads and writes remain
denied, including for administrators; additional emulator tests assert this. All traffic uses
`POST /api/messaging` through the existing authenticated API.

Two exact conversation-list composite indexes are prepared in `firestore.indexes.json`:

| Collection | Fields in order |
| --- | --- |
| `conversations` | `ownerId ASC`, `updatedAt DESC`, `__name__ DESC` |
| `conversations` | `shopId ASC`, `updatedAt DESC`, `__name__ DESC` |

Message pagination orders by the unique transactional `sequence`, using its default descending
single-field index and a message snapshot cursor. Notifications reuse the existing recipient/time
index. Nothing was deployed remotely. A future separately authorised rollout must provision
these two indexes before using the inbox on a remote database.

## Files changed

- `backend/messaging.cjs`: policy checks, canonical conversations, enquiries, consent,
  text messaging, transactional counters/throttling, history and notification writes.
- `backend/services.cjs`, `backend/app.cjs`: existing authentication/service and HTTP wiring.
- `firestore.indexes.json`: the two local index definitions above.
- `src/features/marketplace/services/messageApi.js`: authenticated, account-bound API and retries.
- `src/features/marketplace/hooks/useMessages.js`: active-screen updates and paginated feed.
- `src/features/marketplace/components/ConversationAction.js`: shop/customer initiation and
  pending-enquiry controls; `MarketplaceUI.js`: shared Messages entry point.
- `src/features/marketplace/screens/MessagingScreens.js`: inbox and private text chat.
- `OwnerNavigator.js`, `ShopNavigator.js` in `src/features/marketplace`: existing stack routes.
- `OwnerMarketplaceScreens.js`, `ShopMarketplaceScreens.js`, `QuoteComparisonScreen.js`,
  `BookingScreens.js`, `CommunicationScreens.js` in the marketplace screens directory:
  existing workflow entry points and notification routing.
- `src/features/auth/screens/AccountScreen.js`: profile Messages entry point.
- `tests/messaging.test.cjs`: messaging UI, retry, read/consent actions, polling and cleanup.
- `backend/test/marketplace.test.cjs`: focused policy, privacy, retry, pagination and business-rule tests.
- `backend/test/marketplace-integration.test.cjs`: actual emulator Auth/Firestore and HTTP tests.
- `tests/rules/access.test.cjs`: direct-client conversation/message denial checks.
- `docs/MESSAGING.md`, `README.md`: implementation and usage notes.

Verification uses Node **22.23.3**, existing application/backend commands and the existing
demo Auth/Firestore security runner. Logs and bundle artifacts use `messaging-*` names in
the existing ignored `.local-checks/` directory. Only synthetic emulator data is used.

## Verification results

Final checks on Node **22.23.3**:

| Check | Result |
| --- | --- |
| `npm test` | 349 passed, zero failures |
| `npm run test:backend` | 239 passed, zero failures |
| Existing demo Auth/Firestore security runner | 73 passed, zero failures (12 rules, 17 integration, 32 marketplace, 8 photos, 4 showcase) |
| Expo export for Android, iOS and web | Passed, including native Hermes bundles |
| `git diff --check` | Passed |

The emulator caught a descending document-key-only scan incompatibility during development;
message pagination now uses the numeric sequence index and real snapshot cursors. The final
emulator run confirms message ordering, older pages, concurrent sends, consent, revocation,
history preservation and booking continuation. A repeated backend run encountered an existing
photo-upload test connection reset; the subsequent full run passed without source changes.
The canonical-conversation regression also covers an enquiry arriving after a quotation
becomes authorised: it creates a real authorised thread without granting customer consent.

No commits, pushes, deployments or live data changes were performed. Device testing and
remote index provisioning remain outside this local implementation.
