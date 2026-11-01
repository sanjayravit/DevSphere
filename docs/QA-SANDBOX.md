# Mandatory QA sandbox (opt-in, not yet live-certified)

Static syntax/JSON/path/credential checks are still performed and labelled static.
They no longer grant execution authority: no runner means **inconclusive** in all
modes, including approval. The existing Decision Engine remains authoritative.

## Interface and trust boundary

`server/services/qa/executionService.js` accepts a SandboxProvider with
`execute(job, {signal})` and `cleanup(jobId)`. Production uses the HTTPS provider;
unit tests inject deterministic providers and are **not** sandbox certification.
Jobs contain only a bounded immutable text snapshot with proposed changes,
allowlisted command IDs/argv, a content digest, limits and a random job ID.
Repository credentials, environment variables and host paths are never forwarded.
Evidence is bound to that digest. Raw output is discarded, even when redacted
output might appear safe; persisted evidence contains exit codes, timings and
bounded byte-count summaries. Artifact references are currently empty.

`QA_EXECUTION_ENABLED=true`, `QA_RUNNER_URL=https://<private-runner>`, and
`QA_RUNNER_TOKEN` enable the server-side adapter. `QA_COMMANDS=install,build,test`
is the default; operators may choose a subset or `json` for JSON-only projects.
A subset certifies ONLY those commands, not omitted tests. The policy rejects JSON-only commands for JS/TS snapshots and rejects install-only validation. No request body or AI output can select commands.
Currently supported: bounded UTF-8 repositories, root npm manifest, optional
lockfile/offline cache, JavaScript/TypeScript and JSON changes. Binary assets,
submodules, symlinks, large repositories and non-supported changes are inconclusive.
Secret paths are excluded; credential-bearing ordinary files block snapshotting.

## Dedicated runner installation

Do not install the runner on the Express host. Provision an isolated staging VM
with rootless Docker, gVisor `runsc`, TLS reverse proxy and inbound allowlist/mTLS.
Give its service account **no** GitHub, Firebase, OpenAI, Vercel or tenant secrets.
The only shared secret is its unique runner API token, not passed to containers.
Build `sandbox/Dockerfile` using `--build-arg NODE_IMAGE=<reviewed Node 22 digest>`.
An operator must provision the target lockfile's npm cache in `/opt/npm-cache`
in a trusted build. Do not copy `.npmrc` or any credentials into the image.
Scan/sign the image; configure `QA_SANDBOX_IMAGE=<image>@sha256:<digest>` and
`QA_RUNNER_TOKEN=<32+ random characters>`, then `node sandbox/runner.mjs` on the
runner host. TLS proxy the internal port 8081; never expose the plaintext port.

The service verifies rootless Docker and always requests `runsc`; unavailable
runtime/image means unavailable QA. Every container has no network, host mounts,
Docker socket or elevated capabilities. Read-only image, UID 65532, one CPU,
512 MiB RAM/no swap, 64 processes, 256 MiB total tmpfs, 60-second runner deadline
(70-second API budget including snapshot/response/cleanup grace) and
bounded discarded output are fixed server-side. One active job per runner;
extra requests fail closed. No arbitrary command/flag or shell entry point is
accepted by the API; npm scripts run ONLY inside the sandbox without credentials.
Install is offline and ignores lifecycle scripts. Build/test may execute package
scripts in that sandbox. Missing cache/scripts are not test success.

## Certification and recovery (operator required)

Before enabling: run a staging repository with success/failing tests, bad TS,
offline cache miss, an infinite loop, memory allocation, fork bomb, disk fill,
network probe and attempted `/proc`/host-secret access. Assert exit/evidence states,
resource bounds, no secret access and no surviving containers after cancellation,
timeout, client disconnect and runner restart. These hostile live probes have NOT
been run in this checkout. Docker/gVisor is not available here.

Configure an independent runner watchdog to remove only labelled/name-prefixed
`devsphere-qa-<UUID>` containers older than the maximum lease after crashes; audit
before removal. API cleanup failure makes evidence inconclusive, never successful.
Disable QA execution and isolate the host on failed cleanup. No host fallback.
Schema addition: `qa.execution` and labelled static checks; no destructive migration.
Old static-only approvals/deployment claims are rejected by the new `sandbox-v1` evidence gate; regenerate rather than rewriting historical approvals.

Resource evidence reports observed disk/process error signatures or an unknown
resource termination (exit 137 alone is not proof of OOM). The worker never
claims measured peak CPU/RAM from an exit code. Failed build/test exits remain
failed; resource termination, missing offline cache, cancellation and timeout
remain inconclusive. `commandsComplete=false` explicitly marks unavailable
completion evidence; it does not mean no command could have started.
