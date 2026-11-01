# PR/check intelligence

Existing GitHub service and V2 owner-scoped persistence are extended, not replaced.
`GET /api/v2/runs/:runId/checks` returns recorded evidence.
`POST /api/v2/runs/:runId/checks/refresh` requires the owning repository operator;
a Firestore transaction reserves a 60-second per-run cooldown before any GitHub
reads and invalidates previously successful evidence. Refresh is read-only at
GitHub. No endpoint approves, merges or deploys based on this result.

Evidence binds repository, PR number, expected delivered SHA, observed head,
latest observed SHA, base/default branch, timestamp and actual check/status IDs.
The service reads GitHub check runs AND commit statuses at the exact head, and
legacy protection AND applicable branch rules. Permissions failures, unsupported
workflow/deployment rules and missing definitions remain non-passing. The PR is
read again after checks; a changed head or base yields `stale`. A head different
from the delivered SHA stays stale even if its checks succeed: generate a fresh
proposal, do not transfer approval. No log contents are invented or downloaded;
only bounded titles/descriptions and safe GitHub links are stored.

States: queued, in_progress, successful, failed, cancelled, missing, inaccessible,
stale. These are observations at a timestamp, not perpetual assurances. No
visible required checks does NOT mean success. Diagnostics show actual supplied
links. Rate-limit, timeout, malformed and permission failures invalidate success.
Pagination is bounded at ten pages per source and persisted evidence at 100
records. Oversized evidence is inaccessible, not silently truncated to success.

New optional run fields: `ci`, `checkGeneration`, `checkRefreshAfter`,
`lastCheckFingerprint`, repository/base metadata and recovery evidence. No index
or client-access rules migration is required. History stays in the existing
bounded events array; changed evidence emits `devsphere:update` in the owner's
authenticated room only. Deployment re-fetches merge, repository, current default
branch, merged SHA and required checks; it never trusts dashboard evidence.
