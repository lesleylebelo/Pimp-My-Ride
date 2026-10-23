# Notifications UI redesign

Implemented in the original project on `lesley` for customers and shops.

The shared Notifications screen uses a safe-area-aware, centered layout capped
at 760 points, a back button, compact notification rows, existing Ionicons,
Today / Yesterday / Earlier sections, relative timestamps and distinct read
and unread states. Descriptions remain fully readable. Unread rows use the
existing lime accent surface, a dot and an explicit text label. Both themes
use text colors verified at a minimum 4.5:1 contrast against the unread surface.

The SectionList virtualizes rows and uses the existing cursor API for automatic
scroll pagination and an explicit Load more fallback. Pull-to-refresh and the
Refresh notifications button both return to the newest page. Loading, empty,
offline, network-error and refreshing states retain truthful controls.

## Changed files

- `src/features/marketplace/components/NotificationHistory.js`: shared screen UI.
- `src/features/marketplace/utils/notificationPresentation.js`: date grouping,
  timestamps, icons and the unchanged notification destination mapping.
- `src/features/marketplace/screens/CommunicationScreens.js`: delegates to the
  shared screen and continues exporting the destination helper.
- `tests/notifications-ui.test.cjs`: focused UI and presentation coverage.
- `tests/marketplace-communications.test.cjs`: opens the tappable row instead
  of the former Open related record button.
- `tests/helpers/load-ui.cjs`: invokes SectionList render callbacks in UI tests.

## Preserved behavior

- The feed-header bell remains the sole global Notifications entry: Discover
  for customers and Find Jobs for shops. Routes remain registered internally.
- Messages controls, routes and APIs are unchanged.
- Opening a row navigates to its existing destination. It does not implicitly
  mark the notification read; the explicit Mark as read action uses the same
  `notificationRead` API. Opening the screen does not acknowledge notifications.
- No Mark all as read control is offered because no bulk-read operation exists.
- Destination validation, legacy booking targets and receipt deep links remain.
- Server ordering, timestamp ties, account isolation, focus refresh, cursor
  replacement, overlapping pages and stale-response protection remain intact.
- Unknown targets remain visible with an individual read action and do not
  invent a destination. No sender details or fallback descriptions are invented.
- Existing simulated-payment titles and descriptions remain verbatim, with an
  additional SIMULATED / TEST label only when the data supplies those flags.
- No backend, schema, permissions, production data or other feature was changed.

## Validation

Use the existing local Node 22.23.3 runtime:

```powershell
$pmrNode = (Resolve-Path '.local-checks/pmr-tools/node22/node-v22.23.3-win-x64/node.exe').Path
& $pmrNode --test tests/*.test.cjs
& $pmrNode node_modules/expo/bin/cli export --platform all --output-dir .local-checks/notifications-export
```

Focused coverage includes both roles, chronological groups and ordering,
explicit read success/failure, read-state retention, destination navigation,
duplicate taps, back navigation, missing targets, loading/empty/error/offline
states, refreshing, long descriptions, 600-item lists, accessible labels,
44-point actions, theme contrast, feed bells and unchanged Messages navigation.
The native SectionList is stubbed by the unit harness, so tests verify its
configuration and callbacks rather than native frame rate or actual scrolling.

All 390 application tests passed under Node 22.23.3, including the 24 focused
notification, communication and feed-header tests. `git diff --check` passed.
Expo exports passed for iOS and Android (Hermes bytecode) and Web under Node 22.
The local Hermes compiler required execution outside the filesystem sandbox.
Exports are local build artifacts; nothing was published or deployed.

## Remaining manual checks

- Real iOS and Android devices: safe areas, system back gestures, pull-to-refresh,
  scrolling performance and long descriptions with large accessibility fonts.
- VoiceOver / TalkBack: row announcements, focus order and the separate read action.
- Native deep links and return navigation after a related record is opened.
- Browser visual checks at narrow and desktop widths, keyboard focus and scrolling.
- Both authenticated roles with their own existing notification records, including
  offline recovery and a failed read followed by retry.

No commit, push or deployment was performed.
