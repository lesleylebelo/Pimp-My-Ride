# PimpMyRide stabilization handover

## Decisions and scope

Canonical application repository: this directory, remote
https://github.com/lesleylebelo/Pimp-My-Ride, working branch `lesley`.
Render deploys `main`; no push, merge, deployment or live writes authorized here.
Outer workspace Git link is pre-existing and is not restructured.

Preserve one sign-in, trusted role/claim routing, no public admin signup, automatic
verification refresh without signing out, approved-shop marketplace gating,
recovery, SecureStore sessions and local 60-second AsyncStorage cooldown. Cached
roles never authorize operations. Firebase Spark, Render free and Supabase free:
no paid scheduler, billing changes or new paid services.

Scope: [team PDF](project-context/PimpMyRide%20Team%20Project%20Scope%20and%20Plan.pdf).
The provided PDF was copied from the parent project directory; no separate exported
screenshots were supplied in docs/project-context at the start.
Figma access confirmed through MCP on 22 September 2026:
https://www.figma.com/design/ECQ15uMfVAnhrp9xihuH5l/Untitled
Prototype page 0:1; inspected page journey inventory plus design context for
132:37 (Add Vehicle), 177:47 (Prepare Quote), 197:71 (Review Application),
197:78 (Suspend Owner). No Figma writes. Existing UI is preserved.

Conflicts: PDF Firebase Storage references are superseded by Supabase/Express;
Figma separate role sign-in and 8-character hint are superseded by shared sign-in
and current 12-character validation. PDF definition of done mentions Git commits;
the user's no-commit/push instruction controls this work. PDF includes open AND
direct requests; chat and advanced notifications are optional. Payments, AI,
AR, rewards and a parts marketplace are explicitly out of scope.

## Feature status

Implemented foundation: Auth, profiles/recovery, verified email refresh, role
routing, document upload/review, admin accounts/categories/logs/presence.
Partial: selected offline landing previews, administrative recovery and operational
configuration verification. Owner/shop landing content is sample-only.
Planned: multiple vehicles/garage, open and direct requests, private quotations,
comparison/selection, bookings/status, showcases/services, completed-work reviews,
maps/GPS/camera and selected marketplace caching. Do not begin marketplace work or
a broad redesign without approval.

## Progress

Phase 1 in progress: reusable native/web confirmations and picker inline errors;
dirty account forms survive reauthentication; persisted shop review operations with
owned completion/rollback, fingerprint checks and idempotent fail-closed recovery.
New mock/UI tests pass; full regression and additional category/form tests pending.
Phases 2–4 pending. See PROJECT_AUDIT.md for baseline findings.

## External verification

User answered **Unsure** about rotation of the previously exposed Supabase secret.
Treat rotation as unconfirmed. Privately revoke/rotate the exposed key in Supabase,
update Render's SUPABASE_SECRET_KEY, and verify service operation after an approved
deployment. Never paste replacement secrets or signed URLs into chat/docs.
Firebase password/email policy, deployed rules/indexes, Supabase RLS and Render
revision/configuration are not yet verified. Health proves process availability only.

## Next task

Complete Phase 1 regression tests before Phase 2 setup/security verification.
No production writes, commits or deployments have been performed.
