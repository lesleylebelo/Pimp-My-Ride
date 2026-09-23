# PimpMyRide

A mobile marketplace connecting vehicle owners with **verified vehicle customization shops**.

Customers can manage multiple vehicles, post open or direct service requests, compare private quotations and accept an offer to create a booking. Approved shops can quote, confirm booking appointments and withdraw unaccepted offers. Both participants can view bookings and cancel with a reason.

The code also implements authentication, trusted role routing, business onboarding, private verification documents, and administration. Owner showcase discovery remains a prototype; the garage, requests, and shop quotation pages use the backend.

## Project Status

**Currently under development**

This repository contains the ongoing development of the PimpMyRide mobile application.

## Setup and current handover

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

## Remaining planned features

* Vehicle/request photos
* Richer marketplace discovery
* Shop services and portfolios
* Job progress and completion
* Ratings and reviews
* Location and map functionality




