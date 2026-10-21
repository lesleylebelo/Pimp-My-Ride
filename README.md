## Project Status

**Currently under development**

This consolidated candidate is for local development only. Production quotation
acceptance is blocked by the unchanged local mock-payment gate. See
[consolidation safety and promotion](docs/CONSOLIDATED_DEVELOPMENT.md) before
moving files to the original checkout. No production rollout is approved.

This repository contains the ongoing development of the PimpMyRide mobile application.

## Setup and current handover

Smart quotation recommendations, scoring rules, distance handling and limitations are
documented in [docs/SMART_QUOTATIONS.md](docs/SMART_QUOTATIONS.md).

For the dedicated **synthetic team-testing branch**, follow
[docs/TEAM_TESTING.md](docs/TEAM_TESTING.md). That procedure needs no production
credentials or `.env` file. Do not use the general production configuration
below for team testing, and do not deploy the consolidated backend.

Use Node 22 for the Express backend. Install the app and backend separately with
`npm ci` and `npm ci --prefix backend`. Copy `.env.example` to `.env`, set the
public Firebase configuration/API URL, then run `npm start` or `npm run web`.
Backend environment configuration and safe emulator checks are documented in
[docs/OPERATIONS.md](docs/OPERATIONS.md).

Read [docs/PROJECT_HANDOVER.md](docs/PROJECT_HANDOVER.md) for implemented features,
stabilization results, test limits and the next proposed milestone. The
[baseline audit](docs/PROJECT_AUDIT.md) is preserved separately.

See [the marketplace milestone](docs/MARKETPLACE_MILESTONE.md) for implemented
behavior, limits, isolated tests and release prerequisites. No deployment is
implied by repository implementation.

See
