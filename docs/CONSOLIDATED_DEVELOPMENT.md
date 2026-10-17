# Consolidated local development candidate

This candidate starts with the original `lesley` working files, retains shared
PMR-02 safeguards, and integrates the feature work for PMR-03, mock payments,
deposits, booking settlement, simulated receipts, test-email outbox,
notifications and synthetic local-demo infrastructure.

It is not a production release. `quoteAccept` requires the unchanged
`assertMockPaymentsEnabled` gate. Normal production configuration cannot pass
that gate, including Pay In-Store acceptance. Do not deploy this backend as a
replacement for an existing production quotation/booking workflow. Supporting
production acceptance needs a separately approved design and verification;
never relax the gate or enable production mock payments to bypass it.

Local demo remains opt-in. Follow LOCAL_DEMO.md using only demo-pmr-security,
loopback emulators, memory fixture storage and synthetic accounts. No SMTP or
real payment provider is added. The normal backend entry point rejects demo
mode; the dedicated demo entry point rejects production credentials.

Recovery snapshots and evidence are stored outside this candidate in the
containing integration directory. Original README bytes, including pre-existing
conflict-marker text, are retained there and in a local recovery ref. The
candidate README uses the current feature documentation without those markers.

Promotion is a separate operation requiring approval. Recheck all source hashes
and branches against the saved inventories, take another checkpoint if anything
changed, then apply only the reviewed candidate file manifest to PimpMyRide.
Do not copy .git, dependency/tool junctions, environment files, credentials,
logs or emulator data. Keep all recovery refs, archives and the offline bundle.
Verify the promoted files against candidate hashes, run tests again, and inspect
Git status before resuming development. On failure restore only the affected
files from the original recovery snapshot using an explicit manifest; preserve
any work created after promotion first. No reset, clean or production rollback
is part of this procedure.

Physical-device acceptance remains outstanding. Emulator success does not prove
production indexes exist. Existing operations/migration documentation is
historical context, not approval to execute migrations or storage cleanup.
