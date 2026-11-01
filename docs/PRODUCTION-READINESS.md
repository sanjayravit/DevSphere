# DevSphere V2 readiness handoff — 2026-11-01

**Status: staging-review candidate, NOT production-certified.** No application
live provider workflow, sandbox isolation probe, merge or production deployment
is asserted as successful. The four phases extend the merged architecture.

## Branch, baseline and commit sequence

- Repository default branch verified via GitHub: `main`.
- Starting checkout/default HEAD: `596ac19e0478f7987b0e60905aee26c88a26aa83`.
- Arena fixes this session to `arena/4b8a5a3d-devsphere`; no alternate branch was
  created or switched to. This is the documented deviation from the requested
  `feat/devsphere-v2-production-readiness` branch name.
- Phase 1: `25b3ddc` — modular mandatory sandbox QA and deterministic tests.
- Phase 2: `9a8d9a5` — actual commit-bound GitHub CI/history/refresh/dashboard.
- Phase 3: `0544ccc` — gated live verification suite and staging procedures.
- Phase 4: readiness/security/observability/UX/performance changes in the next
  commit. Final exact HEAD, PR URL and remote CI evidence belong in the PR body
  and handoff (a commit cannot embed its own hash).

## Actual local evidence

All four required commands were run after each phase. Final checks were repeated
after installing all four lockfile paths exactly as CI does, with install scripts
disabled. External provider transports/storage are mocked unless stated below.

| Point | Server tests | Client tests | Server syntax / client build |
| --- | ---: | ---: | --- |
| Baseline | 130 passed | 48 passed | Passed; large main-chunk warning |
| Phase 1 | 143 passed | 48 passed | Passed; warning unchanged |
| Phase 2 | 158 passed | 48 passed | Passed; warning unchanged |
| Phase 3 | 161 passed | 48 passed | Passed; warning unchanged |
| Phase 4 | 173 passed | 53 passed / 14 files | 84 ES modules checked; build passed without chunk warning |

Commands: `npm run check:server`, `npm run test:server`,
`npm test --prefix client -- --run`, `npm run build`.
Additional checks: `git diff --check`; `npm run check:client-secrets` scanned 52
browser artifacts with no supported credential-pattern/configured-secret hits;
`npm run verify:preflight` confirmed live suite disabled without staging config;
`npm run readiness:preflight` intentionally returned nonzero for missing release
configuration. A configuration preflight is not provider verification.

### Measured bundle change (Vite output, decimal kB)

| Artifact | Before raw / gzip | After raw / gzip |
| --- | ---: | ---: |
| Main `index-*.js` | 966.39 / 298.13 | 376.37 / 117.62 |
| V2 workspace route | 21.20 / 6.62 | 25.79 / 8.01 |
| Dashboard route | 359.12 / 104.55 | 359.27 / 104.61 |
| New lazy authenticated layout | included in main | 24.96 / 7.49 |

Main chunk reduction: **61.1% raw, 60.5% gzip**. Removed unused browser Firestore
initialization/import (no client data access uses it), and lazily loaded the
existing authenticated layout/workspace provider. Existing auth behavior remains.
No new decorative dependencies, chunk-warning threshold increase or unsafe
dependency override was introduced. All output JS chunks are now below 500 kB.
This is build-size evidence, not a measured browser/network latency benchmark.

### Dependency advisories remain visible

`npm audit --json` and audits for client/server/socket-server were run. Root and
server each report **6 moderate, 0 high, 0 critical**; client and socket launcher
report 0. These are overlapping trees, not twelve distinct vulnerabilities.
Affected transitive packages: gaxios, gcp-metadata, glob, google-gax, minimatch,
rimraf. Direct advisory roots include:

- https://github.com/advisories/GHSA-3g3m-2fjr-6pw4 (glob cancellation/traversal)
- https://github.com/advisories/GHSA-g3hv-75wg-m249 (minimatch amplification DoS)

Audit exits nonzero for root/server. They are NOT called “passed” or hidden with
force fixes/overrides/downgrades. Resolve through a separately reviewed compatible
upstream upgrade and full regression/staging testing; track acceptance explicitly.

## Live versus mocked evidence

Performed: real local HTTP, Socket.IO, native Git and SDK parsing exercised by
unit tests; GitHub repository/default-branch/action-ref reads for this development
PR; local configuration-only staging preflight. Remote PR CI is recorded in the
PR/handoff after push and must match the exact proposed head.

**Not performed:** application OpenAI calls; hosted Firebase or emulator durable
integration; disposable target-repository branch/commit/PR workflow; hosted Redis
or socket workflow; Vercel previews/production; rootless Docker/gVisor execution.
No Docker binary/runner is installed here. No staging resource configuration was
provided. This sandbox allows egress to GitHub/npm/PyPI, not OpenAI/Firebase/Vercel
or arbitrary socket hosts. GitHub tooling access to this development repo does
not authorize the suite to mutate a disposable test repo or certify application
credentials. See [staging verification](STAGING-VERIFICATION.md) for executable
procedures, negative-case matrix and narrowly scoped cleanup instructions.

## Security/authorization audit and behavior changes

| Surface | Enforcement / remaining limitation |
| --- | --- |
| Run | JWT auth, operator allowlist, bounded input/mode/request ID, durable owner lease, configurable new-run quota, single-use owner/request-ID deduplication |
| History/detail/check reads | JWT auth, validated IDs/limits, owner-filtered Firestore reads; history omits heavy evidence fields |
| Approve/reject | Owner/operator, immutable envelope hash, transactional single-use claim; approval additionally requires both run/proposal sandbox evidence and Decision Engine re-evaluation |
| Check refresh | Owner/operator, transaction cooldown + generation binding + per-user/provider budget; invalidates old success before reads; expired observations served stale |
| Cancel | Owner/operator, active-run transaction, cooperative abort/poll; accepted remote writes cannot be undone and dead workers require reconciliation |
| Deploy | Owner/operator, transactional claim, mandatory sandbox QA, independent merge/default/SHA/check gates, default-off production flag; known pending IDs are only polled |
| Webhooks | Constant-time exact-body signatures, repository/project mapping, signed-body hash replay dedupe, bounded output, process-local rate limit; never executes agents |
| Paths/secrets | Original path/credential checks retained; full QA snapshots are bounded/immutable and exclude secret paths; runner receives no host env/token; logs are discarded |
| Provider mutations | No automatic POST/PUT retry; redirects rejected; partial evidence retained; malformed/ambiguous outcomes require operator reconciliation |
| CORS/session | Exact HTTPS production allowlists; >=32-byte production JWT secret, HS256 five-hour expiry, operator IDs required; token entropy/IAM/HTTPS ingress still require operator review |

JWTs still use localStorage and lack per-token central revocation. Rotate shared
secrets to revoke all sessions; do not claim full session-hardening certification.
HTTP rate limits outside durable V2 quota/claim paths are process-local: deploy
shared ingress abuse controls. Quotas are per user/provider, not account-wide
provider spend caps. Provider budgets/circuit breakers must also be set upstream.

Available token usage, exact-model configured cost estimates, per-attempt provider
latency/status/retry ordinal and failures are bounded and recorded without URLs,
headers or bodies. Costs default to null. SDK retry ordinals are stored only when
supplied, never guessed. Provider metrics are best effort; failed telemetry must
not turn an already accepted write into a safe-retry claim.

## Data/config migrations (review BEFORE deployment)

Additive run fields: `qa.execution` (sandbox-v1), labelled static checks, `ci`,
repository/base metadata, refresh generation/cooldown/fingerprint,
`providerMetrics`, `durationMs`, `executionStartedAt`, cancellation flags and
recovery/candidate-PR evidence. Existing source/proposal data and auth models stay.

New collections: `devsphereRunRequests` and `devsphereProviderQuotas`. Both use
hashed document keys, remain Admin-only, and need no query index. Existing
`devsphereRuns`, `devsphereRunLocks` and `projects/*/events` remain authoritative.
`firestore.rules` already denies all client paths; `firebase.json` still selects
those rules/indexes with no implicit project. Two new index exemptions cover
`devsphereRuns.ci` and `.providerMetrics`. **Nothing was applied to Firebase.**
Old static-only approvals/deploy claims now fail the sandbox-v1 evidence gate;
regenerate them. Do NOT edit stored approval envelopes/hashes to “upgrade” them.

Operator commands (examples are instructions, not executed deployment evidence):

```sh
firebase projects:list
# Set STAGING_PROJECT to the explicitly reviewed disposable project's real ID.
firebase firestore:indexes --project "$STAGING_PROJECT"
gcloud config get-value project
gcloud firestore databases describe --project "$STAGING_PROJECT" --database='(default)'
# Review current project IAM, existing rules/consumers, backup and index diffs first.
firebase deploy --only firestore:rules,firestore:indexes --project "$STAGING_PROJECT"
```

Abort if project identity differs from the approved change record. For production,
use a separate reviewed change with an explicit `--project` value, operator
approval and backups; never inherit a CLI's current/default project. Wait for the
userId ASC/createdAt DESC index to be READY. Admin bypasses rules: deny-all client
rules do not validate Admin IAM or API ownership.

## Retention, backups, recovery and alerts

Proposed policy requiring operator approval: retain run/proposal/request-ID audit
records 30 days (or organizational requirement), long-term redacted incident
exports 90 days, minute quotas 24 hours. Do not delete active locks, unexpired
request dedupe keys or unresolved unknown outcomes. TTL/archival is not enabled
by this code; do not treat bounded event arrays as long-term audit storage.

Enable scheduled Firestore backups/PITR under the intended project and least-
privilege storage policy. Before an authorized schema/rule rollout, an operator
may export with `gcloud firestore export gs://<approved-backup-bucket>/<UTC-id>
--project <explicit-project-id>`. Restore first to a **separate recovery project**,
verify owner filtering/indexes/approval denial and compare counts. Never import
backup data over live runs to reset execution state or re-use approvals.

Reconcile stale runs older than the five-minute lease: inspect events and provider
IDs/branches; check GitHub/Vercel independently; record the observed result under
operator change control. An expired lease is not a replay grant. For uncertain
GitHub writes inspect the isolated branch/commit/PR; for Vercel use known ID or
recorded marker. Never clear unknown states/IDs and click deploy again blindly.
For runner outages disable QA execution, quarantine the host and inspect/remove
ONLY verified `devsphere-qa-<UUID>` containers (label `devsphere.qa=true`). Install
an external watchdog for process/host death; this environment has not certified it.

Alert on unconfirmed runner cleanup, rising QA timeout/resource failures, CI
inaccessible/stale >15 minutes, provider 401/403/429/5xx spikes, metric write
failures, pending/unknown writes or stale executions >5 minutes, Firestore
transaction/index failures and socket reconnect/Redis isolation failures. Send
IDs/codes/counts only, not source, tokens or raw provider logs. Alert backend,
retention enforcement, backup schedules and multi-host socket behavior remain
operator infrastructure tasks, not verified features of this checkout.

## Release gates and reproducible rollout / rollback

- [x] Local required checks and deterministic failure tests (see counts above).
- [x] Build metrics and advisory review; no unsafe dependency changes.
- [ ] Exact final feature-head **remote** CI success, recorded on PR/handoff.
- [ ] Rootless/gVisor hostile-code isolation + timeout/cancellation/cleanup probes.
- [ ] Actual staging evidence for all five providers and denied/ambiguous cases.
- [ ] Firebase hosted project/IAM/rules/index readiness; backup/restore exercise.
- [ ] Production HTTPS/CORS/secrets/operator list, quotas, Redis sockets and alerts.
- [ ] Dependency-advisory risk decision or compatible remediation.
- [ ] Separate operator production certification and authorized rollout.

Rollout: install the four lockfiles; run local checks; build and secret-scan using
staging-only browser config; deploy API/socket/frontend to isolated staging with
production disabled; apply reviewed staging rules/indexes explicitly; configure
and certify the separate runner; run non-mutating preflight then opt-in suite;
review actual CI by SHA and archive evidence; only then request production review.
No automatic merge or production deployment is part of this workflow.

Rollback: disable new run/execution ingress and QA/production flags first; preserve
run/PR/deployment evidence and drain/cancel active workers; reconcile every unknown
write; redeploy a previously verified artifact via the hosting operator. Keep
additive fields/collections. **Do not expose the older static-only executor as a
rollback shortcut**: leave V2 mutation routes disabled on an old artifact until
its QA policy is patched. Roll back Firebase rules only from reviewed prior rules
under explicit project selection; do not delete data/indexes to make tests pass.
