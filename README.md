# PimpMyRide

A mobile marketplace connecting vehicle owners with **verified vehicle customization shops**.

Customers can manage multiple vehicles, post open or direct service requests, compare private quotations, and choose a simulated payment method before creating a booking. Approved shops can quote, confirm booking appointments, record simulated in-store payments, and withdraw unaccepted offers. Both participants can view bookings and cancel with a reason.

Owners can upload private vehicle photos and attach saved photos when publishing
requests. Eligible shops can view those attachments, and the selected shop keeps
access through booking history. Photos require a connection and separately
configured private storage.

## Project Status

**Currently under development**

This consolidated candidate is for local development only. Production quotation
acceptance is blocked by the unchanged local mock-payment gate. See
[consolidation safety and promotion](docs/CONSOLIDATED_DEVELOPMENT.md) before
moving files to the original checkout. No production rollout is approved.

This repository contains the ongoing development of the PimpMyRide mobile application.

## Setup and current handover

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

See [the booking milestone](docs/BOOKING_MILESTONE.md) for quote acceptance,
appointment confirmation, cancellation, transaction safeguards and current limits.

See [academic mock payment simulation](docs/MOCK_PAYMENT_SIMULATION.md) for the
test-only payment-provider interface, simulated status flow, receipts and email
test sink. This feature does not process real payments or send email.

See [the photo milestone](docs/PHOTO_MILESTONE.md) for the private photo library,
immutable request attachments, storage setup and verification limits.

## Remaining planned features

* Richer marketplace discovery
* Shop services and portfolios
* Job progress and completion
* Camera capture and job-progress photos
* Ratings and reviews
* Location and map functionality
