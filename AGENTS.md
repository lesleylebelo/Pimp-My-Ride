# PimpMyRide development rule

Implement features, fixes and UI work directly in the original PimpMyRide repository on `lesley`, using its existing frontend, backend, Firebase project, Supabase storage and deployment infrastructure where applicable.

- Existing backend: `https://pimp-my-ride.onrender.com`.
- Existing Firebase project: `pimp-my-ride-a26fc`.
- Do not create separate demo projects/databases, Supabase projects, Render services, duplicate applications, alternative backends, branches or worktrees.
- Preserve existing uncommitted work. Do not commit, push, deploy or modify the live environment without explicit user authorization.
- Use mocks and local Firebase emulators for automated data-writing tests; do not perform development test writes against live production data.

This rule was explicitly requested by the project owner for this and future development tasks. A later explicit user instruction takes precedence.
