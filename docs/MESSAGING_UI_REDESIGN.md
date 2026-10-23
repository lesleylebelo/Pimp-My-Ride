# In-app messaging UI redesign

Implemented in the original PimpMyRide project on `lesley`. The pre-existing
uncommitted Notifications redesign is preserved.

## Inbox

- Compact conversation rows with fallback Ionicons, supplied names/request
  titles, latest message or enquiry previews, activity timestamps and unread badges.
- The current API does not expose customer names or avatars. Shop inboxes use
  the supplied request title as their conversation label; workshop names are
  explicitly labeled. No customer identity or message content is fabricated.
- Existing `useMessages` ordering remains newest activity first. Conversations
  remain keyed by their unique thread IDs rather than participant names.
- FlatList virtualization, pull-to-refresh, automatic cursor pagination and
  explicit Load more / Refresh fallbacks.
- Loading, empty, offline and permission/error states with accurate controls.

## Chat

- Participant/request title, back navigation and a compact request-context link.
- Incoming bubbles align left; outgoing bubbles align right with a subtle lime
  surface. Text and timestamps meet 4.5:1 contrast in both themes.
- Consecutive calendar date groups, SAST message times, full-length message text
  and an inverted virtualized history with older-message pagination.
- Composer outside the scrolling history, inside a KeyboardAvoidingView, with
  a 48-point send-arrow control and disabled empty-message state.
- Web Enter sends; Shift+Enter inserts a newline. IME composition does not send.
  Native multiline Enter retains normal newline behavior.
- A scrollable Conversation details dialog holds vehicle/request authorisation
  context, booking navigation, existing consent controls and explicit read action.
  Errors and operation progress appear inside the dialog as well as in chat.
  Linked-record navigation closes the dialog.
- Safe areas, dark/light themes, wrapping text, accessible names, and a maximum
  content width of 800 points. Long drafts scroll inside the bounded composer.

## Files changed for this task

- `src/features/marketplace/screens/MessagingScreens.js`
- `src/features/marketplace/components/MessagingUI.js`
- `tests/messaging.test.cjs`
- `tests/messaging-ui.test.cjs`
- `tests/helpers/load-ui.cjs` (adds FlatList / platform / keyboard-layout stubs;
  preserves the existing Notifications SectionList harness)
- `docs/MESSAGING_UI_REDESIGN.md`

## Preserved behavior

No backend, schema, messaging service, polling hook or notification UI changes.
Feed-header Messages and Notifications icons and contextual Chat actions remain
unchanged. Both role stacks and conversation notification destinations remain
registered. No new messaging entry point or conversation-creation control exists.

The server remains authoritative for customer initiation, approved enquiries,
quotation/invitation/booking eligibility, rejection/revocation, expiry and rate
limits. Opening a chat does not automatically acknowledge messages. Read actions
still use the highest displayed incoming recipient ordinal. Sends still reuse
the same request ID after a failed attempt, retain the failed draft, reject
duplicate taps and suppress stale responses after route/account changes.

The original hook retains its 4-second chat polling, 15-second inbox polling,
focus/background cleanup, cursor loading, ordering and gap handling. No direct
Firestore listeners, push notifications, attachments, calls or new infrastructure.

## Validation and manual checks

Node 22.23.3 is available at the existing ignored project-local runtime:

```powershell
$pmrNode = (Resolve-Path '.local-checks/pmr-tools/node22/node-v22.23.3-win-x64/node.exe').Path
& $pmrNode --test tests/*.test.cjs
& $pmrNode node_modules/expo/bin/cli export --platform all --output-dir .local-checks/messaging-export-final
```

The 21 messaging tests cover both role inboxes, chronology, unread state, bubble
layout, date groups, long histories, refresh/pagination, platform keyboard props,
web keyboard events, failed-send idempotency, consent failures, request/booking
links, route isolation, disabled permissions/offline/background states, theme
contrast and safe areas. Existing feed and notification tests cover entry points,
registered routes and conversation notification deep links.

UI tests use native component stubs. They check list configuration and callbacks,
not actual native scroll performance or keyboard movement. Exports prove bundling,
not device behavior. The in-app browser connection was unavailable during this
session, so no browser visual-verification result is claimed.

Final application validation: **402/402 tests passed under Node 22.23.3**,
including all 21 messaging tests and the existing notification/navigation tests.
`git diff --check` passed.
Final Expo exports passed for iOS and Android (Hermes bytecode) and Web in
`.local-checks/messaging-export-final`. The installed Hermes compiler required
execution outside the filesystem sandbox. These are local artifacts only.

Remaining manual checks:

- Real iOS/Android keyboards, composer visibility, keyboard dismissal, back gestures,
  multiline input and send focus retention.
- Native scroll anchoring during older-page loading and polling, with a long history.
- VoiceOver/TalkBack, dialog announcements/focus, large fonts and device safe areas.
- Narrow and desktop Expo Web widths, keyboard-only navigation, dialog focus return,
  Enter/Shift+Enter and IME composition in a real browser.
- Both roles' authorised real histories and permission revocation/recovery, using
  approved test accounts only if live writes are separately authorised.

No production messaging writes, commits, pushes or deployments were performed.
