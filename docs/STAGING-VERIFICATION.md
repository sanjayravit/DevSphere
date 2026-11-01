# Opt-in staging verification and audit guide

**This is a procedure and executable suite, not a production certificate.**
Unit tests intercept provider calls; passing unit tests are not live evidence.
`npm run verify:preflight` reads configuration only, performs no network calls and
prints names of missing settings, never values. It works without credentials.
`npm run verify:staging -- --provider=<openai|firebase|github|socket|vercel|all>`
requires explicit opt-in and isolated staging targets before importing providers.
No live suite is run by normal CI. Reports are private, ignored files under
`verification-reports/devsphere-verification-*/report.json`; archive selected,
redacted reports in a restricted audit store, never commit raw credentials/logs.

## Prerequisites / explicit selection

Use a fresh terminal/container with **no production environment**. Do not source
the production `.env`. Supply secrets through the runner's secret manager, not
CLI arguments, shell history or committed files. Set:

- `DEVSPHERE_INTEGRATION_ENABLED=true`
- `STAGING_CONFIRMATION=disposable-resources-only`
- `ENABLE_PRODUCTION_DEPLOYMENTS=false`
- OpenAI: `STAGING_OPENAI_API_KEY`, `STAGING_OPENAI_MODEL` (project-scoped key,
  low budget, actual Responses model access).
- GitHub: `STAGING_GITHUB_TOKEN`, `STAGING_GITHUB_REPOSITORY=owner/devsphere-verification-<suffix>`.
  The disposable repo must be initialized, with root JS/JSON fixtures, a lockfile,
  an actual CI workflow and applicable required checks. Give only that repo
  metadata/contents/PR read-write, checks/actions/status read and sufficient
  administration read for protection. No merge/admin write is needed.
- Firestore: `STAGING_FIREBASE_PROJECT_ID` containing staging/test/sandbox (or
  starting `demo-` for emulator). For hosted Firebase use
  `STAGING_GOOGLE_APPLICATION_CREDENTIALS` pointing at a protected ADC JSON file
  with least-privilege access to only that project. For emulator use
  `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, no cloud credential. Confirm the emulator
  really is running before enabling tests. The suite tests the real Admin SDK
  against the emulator, not an in-memory fake, and labels it accordingly.
- Sockets: `STAGING_SOCKET_URL=https://<staging-socket-host>`,
  `STAGING_API_URL=https://<staging-api-host>` (origin, no `/api` suffix),
  `STAGING_JWT_SECRET`, `STAGING_SOCKET_OWNER`, `STAGING_SOCKET_OTHER`. Configure
  the dedicated API/socket host with that same secret, allowlist the owner as an
  operator, point it only at the disposable repository and staging Firebase,
  and provide staging OpenAI access. The socket test starts one **manual** run,
  never an execution mode. Production IDs/keys must not exist on this host.
- Vercel: `STAGING_VERCEL_TOKEN`, `STAGING_VERCEL_PROJECT_ID`,
  `STAGING_VERCEL_PROJECT_NAME=devsphere-verification-<suffix>` and optional
  `STAGING_VERCEL_TEAM_ID`. Link ONLY the disposable repository. Check its
  Environment Variables UI: no production credentials on previews, no production
  aliases, no production deploy hooks. For standalone `--provider=vercel`, set
  `STAGING_PREVIEW_REF=devsphere-verification/<recorded-run-id>`; `all` reuses the
  branch created by the GitHub stage. The suite verifies project and repo IDs,
  omits production target, and polls the same deployment ID (max three reads).

A staging target equal to the configured application target is refused. Naming
checks are additional guardrails, not proof that a resource is disposable; an
operator must verify ownership, linked integrations and IAM before enabling.
The local environment for this development session permits outbound access to
GitHub/npm/PyPI only: OpenAI, hosted Firebase, Vercel and socket-host verification
require an operator environment with approved egress. No staging credentials or
disposable provider infrastructure were supplied to this session.

## Reproducible evidence matrix

| Provider | Executable staging checks | Deterministic unit coverage / remaining operator checks |
|---|---|---|
| OpenAI | Actual Responses intent/plan JSON-schema validation, configured model, token usage, nonexistent-model error | Unit: refusal, malformed output, 429, timeout, unavailable model/API. Operator: controlled 403 key and proxy-induced 429/timeout; do not exhaust real quotas |
| Firestore | Durable create/read, ordered history, list index, owner denial, active lease, concurrent single-use approval, duplicate denial, release | Unit: fake transaction/owner/hash/lease tests. Operator: restart process and read report IDs again, denied IAM principal, emulator rules test, hosted indexes/backup restore |
| GitHub | Identity/default branch, unique branch, Base64 create/update with blob SHA, stale-write conflict, real PR, actual head checks | Unit: 401/403/429, malformed/ambiguous POST, partial commits, stale head. Operator: least-privilege denied token; intercept response *after* accepted mutation on disposable repo, then manually reconcile; do not retry POST |
| Socket.IO | Staging authentication denial, two authenticated users, reconnect, owner-only manual-run events, corresponding persisted events, cross-owner 404, short-session disconnect | Local socket tests use real local sockets and fake providers/storage. Operator: Redis multi-host propagation and token rotation/restart; hosted proxy/CORS/WebSocket transport |
| Vercel | Linked project/repo identity, preview-only request, recorded ID reuse, actual READY/ERROR/PENDING mapping | Unit: all states, wrong project, network ambiguity, persistence failures, no duplicate creation. Operator: deliberately failing preview in disposable repo and controlled denial/timeout; pending is NOT deployment success |

`passed` on a retrieval probe means retrieval worked, not that CI passed or a
preview reached READY. Inspect nested `ci.state` / `readiness` and the report's
`notPerformed` list. Failed/unknown probes exit nonzero. A missing integration
flag is a hard refusal, not a skipped-success live test. No retry loop exists for
mutations. Reports record resource candidates before writes where possible.

## Fault injection, cleanup and audit

Run deterministic failures first: `npm run test:server` (provider, deployment,
security, persistence, socket and QA tests). Live fault injection must be via a
staging-only egress proxy/denied credential, with an operator recording expected
and actual states separately. Never configure a production service to use a
fake provider and never interpret fake output as live certification.

Review the exact report run ID, repo, PR, SHA, Firebase project/doc and Vercel ID:

1. `gh pr view <number> --repo <disposable-owner/repo> --json headRefName,headRefOid,baseRefName,state,url`
   and `gh pr checks <number> --repo <disposable-owner/repo>`.
2. After confirming its branch has that exact verification run ID, close ONLY
   that PR: `gh pr close <number> --repo <disposable-owner/repo>`. Never merge.
   Delete the isolated branch in the GitHub UI after reviewing its commits; never
   delete the default branch or use wildcard cleanup.
3. In the explicitly selected staging Firebase console, export the named
   `devsphereRuns/<runId>` and `devsphereRunLocks/<owner>` documents, then delete
   only those verification fixtures. Socket-created manual runs are also listed.
   Do not delete a collection or remove a lock held by another run.
4. In the verified staging Vercel project, inspect the recorded deployment ID,
   export sanitized status evidence, then remove ONLY that preview. Never remove
   a production alias/deployment or an unrelated preview.
5. If a write timed out, search by the exact recorded branch/metadata marker
   before cleanup or manual retry. Unknown outcomes stay unknown until resolved.

Retain operator name, UTC timestamp, checkout SHA, command, selected project IDs,
expected result, actual result and evidence links. Secret values and raw provider
payloads must not be included. A production rollout needs a separate sign-off.
