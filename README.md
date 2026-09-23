# PimpMyRide

A mobile marketplace connecting vehicle owners with **verified vehicle customization shops**.

The intended marketplace lets customers manage multiple vehicles, post service requests, compare quotations from verified shops, and book appointments. That marketplace workflow is planned, not yet implemented.

The current code implements authentication, role routing, business onboarding, private verification documents, and administration. Owner and shop landing content is primarily a prototype.

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

## Planned Core Features

* Customer accounts and profiles
* Multiple vehicles per customer account
* Vehicle Garage
* Service requests with vehicle images
* Marketplace feed
* Verified customization shops
* Shop services and portfolios
* Quotation submission and comparison
* Workshop bookings
* Ratings and reviews
* Location and map functionality




