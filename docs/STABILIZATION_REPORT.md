# DevSphere V2 stabilization report

**Date:** 2026-10-31 (UTC)

**Repository:** `sanjayravit/DevSphere`

**Working branch:** `arena/a75b6061-devsphere`

**Inspected/fetched default:** `main`, `0149ec9ad0d06363df89f363d261e31731b6a548` (discovered through GitHub, not assumed by application code)

**Recommendation: BLOCKED for production release.** This is a tested stabilization candidate, not live-provider or production certification.

The existing React application, Express ESM API, agents/engines and legacy product features were repaired in place. No replacement application, alternate orchestration stack, simulated production PR, fabricated AI result or skipped-as-success deployment was introduced. Production credentials/settings, hosted Firebase rules/indexes, default-branch contents and production deployments were not changed. Delivery is through the assigned branch and a review PR; **do not merge or deploy it automatically**.

## 1. Measured validation

Final local validation was executed on **2026-10-31 at 19:09 UTC**, after the OAuth browser-binding, Vercel project-binding and monitoring-unmount fixes. Environment: **Node 22.22.3 / npm 10.9.8**.

| Command | Result | Measured evidence |
| --- | --- | --- |
| `npm run check:server` | **PASS**, exit 0 | 66 ES module JavaScript files, including API/socket entry points. |
| `npm run test:server` | **PASS**, exit 0 | **130/130**, 0 failed, canceled, skipped or todo. |
| `npm test --prefix client -- --run` | **PASS**, exit 0 | **48/48**, 14 test files. |
| `npm run build` | **PASS**, exit 0 | Vite 8.3.5, 3,163 modules. Largest main chunk 966.39 KB / 298.13 KB gzip. Large-chunk warning remains. |
| `git diff --check` | **PASS**, exit 0 | No patch whitespace errors. |

Machine-readable results: [validation-results.json](validation-results.json). Full local logs were retained in `/home/user/devsphere-qa/{syntax,backend,frontend,build,diff}-final.log`; raw dependency audits are `/home/user/{root,server,client,socket}-audit-final.json`. These sandbox paths are supplementary, not a requirement to reproduce the checks.

Fresh deterministic root/client, backend and socket-launcher installs also passed. The CI workflow installs all four lockfiles, uses Node 22.22.3, read-only repository permissions and the same four required commands. **Remote Actions must be checked on the stabilization PR's exact HEAD**; a successful historical `main` run is not evidence for this patch. The final PR handoff records the actual head/check results rather than embedding a self-referential commit SHA here.

### Live delivery/check evidence (after the local run)

The real stabilization [PR #2](https://github.com/sanjayravit/DevSphere/pull/2) targets discovered default `main`. For functional source commit `2a4cc3d2e664aef48513ba65c99a8b3c752ec8bc`:

- **PASS — push CI:** [run 41233237266](https://github.com/sanjayravit/DevSphere/actions/runs/41233237266), all four installs and required checks succeeded.
- **PASS — PR CI:** [run 41233279017](https://github.com/sanjayravit/DevSphere/actions/runs/41233279017), same gates succeeded. GitHub also reported the independent **GitGuardian Security Checks** as passing.
- **PASS, limited to provider-reported Preview delivery:** the repository's **existing Vercel Git integration** automatically created deployment `7463175576`. GitHub's deployment metadata identifies **`environment: Preview`, `production_environment: false`**, with provider status `success`. [Provider deployment details](https://vercel.com/sanjayravit7-2664s-projects/dev-sphere/EuWkFMRhkzHEoUi8JzKcFFD342k4).
- This automatic non-production Preview is **not** application-driven deployment testing, a verified runtime/health/browser check, a merged-default CI deployment or production authorization. No direct Preview endpoint smoke test was performed; restricted outbound access does not include its host. All live application-provider certification blockers below remain.
- Actions reported non-failing maintenance warnings: the v4 checkout/setup actions target Node 20 and GitHub forces their action runtime to Node 24; `ubuntu-latest` is migrating to Ubuntu 26. The application toolchain actually tested remains Node 22.22.3. Review supported action pins/runner-image policy separately; these warnings were not suppressed.

The follow-up commit records this evidence **without functional changes**. Verify its exact-head checks on the PR; the final handoff records that result. No production deployment or default-branch mutation was performed.

Tests remain enabled; no `skip`/`todo`/`only` test annotations or disabled safety gates were added. An additional external ESLint `no-undef` scan passed, but it is not a new project lint gate or a claim that the existing autofixing lint script is clean.

## 2. Workflow acceptance matrix

“Local PASS” means the described path executed against actual application modules and the stated test doubles. It does **not** mean external accounts were exercised.

| Journey | Local result and evidence | Live certification |
| --- | --- | --- |
| **1 — Manual** | **PASS.** Authenticated HTTP intent → installed OpenAI SDK / mocked Responses transport → pinned repository context → intent/plan/developer → static QA → persisted suggestion/history. Asserted **zero GitHub mutations**. `server/test/workflows.test.js`. | **BLOCKED:** OpenAI/Firebase application credentials and isolated live target unavailable. |
| **2 — Approval** | **PASS.** Stores issue, suggested fix, confidence, risk, impact, complete changes and exact canonical SHA-256 envelope. No execution before approval. Owner/operator-only, transactional single-use approval rechecks the complete envelope, repository, base and QA; then isolated branch → SHA-aware commit → PR response validation. Stale/tampered/duplicate/racing approvals fail without duplicate execution. `workflows`, `persistence`, `v2-core` tests; client V2 action tests. | **BLOCKED:** actual Firestore transactions/index/IAM, real generated code and application-created GitHub PR still require authorized live verification. |
| **3 — Assisted** | **PASS.** Low risk / 95 confidence opens a PR through the mocked transport; medium/high risk asks; low / 20 suggests; high / 20 blocks. System/security classification cannot be lowered by a model label. Failed/inconclusive QA never executes. `workflows`, `providers`, `v2-core` tests. | **BLOCKED:** live model behavior and actual target CI. |
| **4 — Full Auto** | **PASS.** Low risk / 70 opens a PR, 69 suggests. Medium/high risk with 99 still asks; high / 10 blocks. System impact independently requires approval or blocks. “Auto” never means auto-merge or auto-deploy. `workflows`, `providers`, `v2-core` tests. | **BLOCKED:** same external requirements; no live unattended execution authorized. |
| **5 — Live progress, approvals, notifications, history** | **PASS locally.** Real local HTTP + Socket.IO exercise durable event emission, approval/result/failure delivery and user isolation. Connections expire with JWTs. Client tests exercise request/owner generations, exact-run deep links, timeline merging, socket-driven notifications, loading/offline/error states and cleanup. Monitoring cannot create a socket after unmount. `socket.test.js`; client Auth/Workspace/V2/Topbar/SelfHealing tests. | **BLOCKED:** real browser, Firebase Auth refresh/multi-tab, actual persistent socket host, and Redis cross-process delivery. No complete live browser HTTP → socket → approval → external PR → deployment certification. |
| **6 — Post-merge deployment** | **PASS locally.** Tests verify actual-merge/current-default/recorded-head/repository/required-CI/explicit-enable gates. One mocked Vercel creation → pending → GET-only refresh → READY; immediate READY/ERROR, mismatched project, concurrent creation, lost audit write, malformed/network/timeout failure and unknown-outcome recovery guards. Ten gate failures produce **skipped, not success**, with zero Vercel calls. `deployment.test.js` (20 tests). | **BLOCKED:** no authorized test merge or production deployment; Vercel credentials absent. A mocked `merged:true`, provider URL or READY is **not** an actual merge/deployment. |
| Existing workspaces/editor/AI/social/marketplace/repository features | **PASS for covered local regressions**, not blanket product certification. Actual HTTP/multipart parsing, native Git and bounded PDF workers run; provider/database/browser transports are mocked where described below. Missing dependencies/providers now fail honestly. | **BLOCKED** for full live-product certification. In particular Monaco lifecycle, Profile nested provider payloads and actual external compiler/provider behavior are not fully certified. |

### Policy and QA limitations

- Assisted auto-execution requires **low risk and confidence >80**; Full Auto requires **low risk and confidence >=70**. Confidence is a model estimate, not a measured probability of correctness.
- Static QA validates protected paths, nonempty text, credential-like values, JSON and JavaScript/JSX/TypeScript syntax. Unsupported source types remain inconclusive. It **does not execute the target repository's tests/build, resolve imports, type-check or prove functional correctness**. No passing runtime checks are invented.
- Manual mode remains advisory even when no execution is allowed. Failed QA blocks; inconclusive QA cannot execute, including after approval.
- Actual target CI and independent review remain essential. This candidate does not supply a secure arbitrary-code execution sandbox for generated projects.

## 3. Root causes and implemented repairs

The [changed-file inventory](CHANGED_FILES.md) lists every source/config/test/document path. The groups below explain why those files changed.

### 3.1 Runtime, dependencies and hosting

**Root causes:** mixed Firebase initializers/SDK installation assumptions, permissive or unhealthy startup signals, inconsistent ESM entry points and installation paths, obsolete dependency trees and incompatible Vite configuration loading.

**Repairs:** shared backend Firebase singleton with honest unavailable persistence; health checks actual Firestore; synchronized Node/dependency/lockfile expectations; deterministic client postinstall; socket-launcher lockfile; expanded server syntax checking; Vite ESM config with preserved React/env/SVG/alias support. Persistent servers bind `0.0.0.0`; relative browser URLs and Vite API/socket proxies support Arena previews without browser-localhost calls. Vercel preserves the existing Express app, SPA routing and raw webhook bodies. CI gates were retained, expanded to launcher installation and all PR branches, not bypassed.

**Evidence:** four install paths, 66 syntax checks, ESM adapter HTTP regression, singleton identity assertions resolved from the **backend's physical SDK installation**, build and required suites. The first fresh-install singleton test used the wrong physical SDK registry; its oracle was corrected while retaining singleton/app-count assertions. The final suite passes; the earlier failure is not hidden or counted as success.

### 3.2 Authentication and authorization

**Root causes:** token trust/expiry weaknesses, implicit account linking, OAuth browser-state gaps, unguarded legacy access, broad origin trust and client async identity races.

**Repairs:** HS256-only, expiring five-hour backend sessions with integer expiry and bounded identity; production requires a signing secret of at least 32 bytes. Firebase token verification requests revocation checks and does not return stored credentials. No silent linking of an existing account through a matching GitHub email. V2 execution requires explicit configured backend operator IDs. All affected project/workspace/legacy access paths verify membership/ownership. Production CORS permits exact configured origins, not arbitrary Vercel tenants.

The backend GitHub flow now binds a **frontend-generated, sessionStorage, single-use ten-minute nonce** to its signed HttpOnly-cookie OAuth state. `/auth/github` requires `client_state`; callbacks return that binding with the token fragment. The login page removes the fragment first, rejects uninitiated/mismatched/expired imports and validates accepted tokens through `/auth/me`. `/auth/providers` supports an explicit “GitHub via server OAuth” action while preserving Firebase popup sign-in. This closes login-CSRF where a valid attacker-owned token fragment could otherwise force an account switch.

Client Auth/Workspace generations, non-persisting external validation, token-aware storage handling, scoped errors and an account-keyed protected subtree prevent stale requests from installing another account's state. Busy buttons compose disabled state rather than accidentally reenabling submission.

**Evidence:** server security suite 15 tests; client Auth 11, Workspace 3, OAuth helper 3 and login integration 3, including rejection of an attacker-owned unrequested fragment and one-time import of an initiated match.

**Limitations:** localStorage remains XSS-sensitive; issued backend JWTs have no central per-token revocation list. Explicit account-link migration is not implemented. Reloaded saved sessions require reauthentication at expiry; real browser Firebase refresh/multi-tab behavior remains to certify.

### 3.3 Responses API and bounded repository-aware generation

**Root causes:** insufficient provider/schema/error validation, unsafe context and falsely usable incomplete output.

**Repairs:** installed Responses API client, strict JSON-schema output plus independent AJV validation, `store:false`, bounded prompts/context/results, usage persistence when reported, per-attempt timeouts/retries and shared run cancellation. Intent/plan output caps are 1,500/2,500 tokens; developer default 8,000, bounded to 1,000–12,000. No provider failure becomes placeholder code or a successful proposal. Incomplete/refused/malformed/empty/oversized/schema-invalid output fails explicitly. Credential-like values and configured server secrets in V2 context are rejected before provider submission.

Repository tree and complete supplied text are pinned to the discovered default-head SHA. Updates require actual contextual blob SHAs; only fully supplied files may be updated. Strict canonical Base64/blob-hash and **fatal UTF-8** checks prevent truncated, binary or replacement-character source from entering generation. Protected/credential paths and aggregate proposal/storage bounds are enforced independently of the model.

**Evidence:** provider and workflow suites exercise real installed SDK requests with mocked transport, intent/plan/file-generation stages, context/budgets, malformed/incomplete output, rate/network/timeouts, missing configuration, partial-stage persistence, invalid UTF-8 and no-mutation failures. Credential detection is heuristic, **not comprehensive DLP**.

### 3.4 Real GitHub algorithm; no simulated application PRs

**Root causes:** default-branch assumptions, weak mutation-result/conflict validation, branch/blob confusion and unsafe retries after uncertain writes.

**Repairs:** discover current default and pin its SHA; unique isolated branch; canonical Base64 Contents creates and blob-SHA updates; exact commit/branch/parent/blob/repository/PR-result validation; read-only bounded retries; no automatic mutation retries. Recheck default before writes/PR; stale heads and conflicts require regeneration/reapproval. Confirmed isolated branch/commits and ambiguous candidate evidence survive failures; an uncertain mutation never becomes a claimed PR.

**Evidence:** provider/workflow/core tests use a stateful GitHub HTTP double with real Git blob hashing and `trunk` as target default, proving the algorithm does not rely on `main`. Tests include absent files, create-versus-update mistakes, invalid SHA/Base64/content, binary source, conflicts, partial commits, default advance before/during execution, invalid PR URLs/results, permission/rate/deadline failures and ambiguous branch creation.

**Live evidence:** read-only GitHub API/default-ref discovery and source fetch succeeded with repository permissions. Application automation writes used mocked transport only. The stabilization branch push/review PR is **repository delivery**, not proof that the application's generated-change automation has run live. No application-created live PR or default-branch write is claimed.

### 3.5 Durable runs, approval transactions and honest audit state

**Root causes:** check-then-write races, insufficient immutable proposal binding, lost or overstated outcomes and storage overflow.

**Repairs:** owner-scoped persistence; canonical full-envelope hash; atomic approval/rejection and execution claim; transactional revalidation of repository/base/change envelope and QA; five-minute lease; durable new-run quota (five per owner/minute); bounded document/event/history fields. Earlier intent/plan/error events survive downstream failures. Confirmed provider outcomes are not relabeled failure just because a later audit write fails; uncertain external mutation remains held for investigation, not an automatic retry grant. Per-instance V2 route throttling complements durable claims.

**Evidence:** transactional Firestore double tests and actual Express workflow requests cover ownership, repeat approvals, concurrent approval/rejection, tampered content/repository/base, stale hashes, failed QA, quotas/leases, missing persistence, audit failures and partial/ambiguous provider mutations. This double tests application logic, **not hosted Firestore contention, indexes, rules or IAM**.

Proposed deny-all-client rules, the `devsphereRuns(userId ASC, createdAt DESC)` index and 13 large-field index exclusions are committed for review. They were **not deployed**. Admin SDK bypasses rules, so API authorization and service-account IAM remain mandatory.

### 3.6 Socket.IO, history and signed webhook evidence

**Root causes:** unauthenticated/global events, room/membership weaknesses, synthetic self-healing success and browser stale-response/cleanup races.

**Repairs:** JWT-authenticated owner rooms, expiry disconnects and reserved-room protections; collaboration membership rechecks and sanitized identities. Timeline events persist before scoped emission. Optional shared Redis adapter/emitter supports separated processes but is not claimed as live-verified. Webhooks verify exact raw signatures, repository/project mapping and duplicate deliveries; they store real evidence and **never autonomously invoke fixes/approval/GitHub mutations**.

V2 request generations and owner/selection refs prevent history/detail responses from downgrading a newer approved run. Timeline merging, reactive run query links and scoped notifications survive delayed responses. Topbar refreshes authoritative notifications on authenticated events and exposes loading/offline/error states. Monitoring waits for history/actual socket connection; generation checks stop a delayed history response from opening a socket after unmount, and selectors cannot switch scope mid-initialization.

**Evidence:** four real local Socket.IO tests cover authentication, owner isolation, events, collaboration and expiry; security webhook regressions exercise raw signatures/deduplication/history. Client V2 9, Topbar 2 and monitoring unmount 1 use mocked HTTP/browser sockets. A complete deployment event → real browser notification journey is not certified.

### 3.7 Deployment and actual outcome preservation

**Root causes:** skipped prerequisites presented as success, insufficient merge/default/CI/project binding, duplicate creation after a read/audit failure and incorrect pending/ready/error transitions.

**Repairs:** explicit server enable plus operator/owner gate; verify the tracked PR's actual merge, original delivered head, target repository/current default and unchanged merge SHA; validate configured required CI on the merged commit using latest source/app-aware attempts. Missing/inaccessible required-check configuration safely skips; ruleset-only required checks are not discovered. No auto-merge was added.

Create only once through Vercel's API. Creation responses must identify the configured project; IDs/status/URLs are validated. Pending IDs refresh by GET and project match. READY is deployed; ERROR/CANCELED failed; queued/building pending. Lost reads/audit writes preserve a known ID/outcome. Uncertain creation is `unknown`, blocks another POST and needs manual reconciliation. Read/retry work shares an abort deadline rather than receiving a new whole budget on each stage.

**Evidence:** 20 deployment regressions. The wrong-project creation regression first reproduced **HTTP 200 instead of expected 502**, then passed after the targeted binding fix; the run is now unknown and a second creation is refused. Deferred creation also proves one request under concurrent callers. All Vercel transport responses here are mocks; no live deployment URL or live READY claim is made.

### 3.8 Preserve and repair existing features

- **Workspace/projects/editor:** unavailable DB is 503, not silent empty success; bounded safe file structures, integer versions and transaction-based saves return 409 for stale edits. Scaffolding cannot overwrite existing project contents. Editor changes apply to their original owner/project/file/version; stale AI/save/error responses cannot mutate a newly selected file. Inline completion is debounced, cancelable, cursor/model/version scoped and cleaned up; replacement helpers handle end-of-file/deletions correctly.
- **Legacy AI:** a shared bounded Gemini wrapper uses a real SDK AbortSignal, not a leaking timeout race. Non-STOP, blocked, empty or oversized generation fails rather than persisting a truncated scaffold/resume. Actual provider failures remain visible. The compiler runner rejects unsupported IDs and enforces provider deadlines instead of substituting another language.
- **Resume:** actual multipart PDF/TXT parsing; 2 MB input, 20 pages, 60,000 extracted characters, ten-second PDF deadline, two workers per process and 128 MB V8 old-heap setting. Real 21-page and concurrency-limit regressions exist. This is not an OS/native-memory security sandbox.
- **Local Git:** serialized project-isolated native Git, no inherited parent checkout/config/HOME/hooks; reject unsafe cached configuration, symlinked or linked metadata. Metadata traversal has depth/count limits; unsafe caches require quarantine, not relaxed safety. A real temporary project commit/history test runs. Shared-cache cross-process locking and dedicated tests for every alternate metadata mechanism are not supplied.
- **Social/chat/marketplace:** atomic likes/comments, byte-aware document guards, bounded chat history and honest install/provider errors. Post envelope is capped at 900 KB; chat at 200 KB with a combined project envelope cap. No fabricated install/template success.
- **Public repositories/profile:** canonical GitHub API preview, 15-second / 250 KB bounds, canonical Base64/fatal UTF-8, no untrusted download URL; request cancellation and honest errors. Repository preview/helper tests pass. Profile lacks dedicated nested-payload/live-provider tests, so that part is not certified.

**Evidence:** legacy suite (13 tests), editor 5, inline 4, change helpers 2, button 1, repository preview/helper 3 and App real MemoryRouter smoke test. Actual Monaco registration/language switching and the full legacy UI are outside these unit/component assertions.

## 4. Negative and failure-path evidence

| Condition | Result / regression location |
| --- | --- |
| Malformed requests, missing/expired/invalid/algorithm-mismatched auth, weak production config, non-operator | **PASS fail-closed:** `security`, `workflows`, `socket`, Auth tests. |
| Another user's run/approval/project/Git history/install/event | **PASS denied or hidden:** `persistence`, `security`, `workflows`, `socket`. |
| Duplicate/stale/tampered/racing approval or approval versus rejection | **PASS single-use exact binding:** `persistence`, `workflows`, `v2-core`. |
| Failed/inconclusive QA; model claims low risk for security/system changes | **PASS no execution:** `v2-core`, `providers`, `workflows`. |
| Invalid/incomplete/refused/over-budget AI; no configured provider; rate/network/deadline failures | **PASS explicit error/no placeholder:** `providers`, `legacy`, `workflows`. |
| Invalid GitHub text/blob/SHA/commit/PR; conflicts/default advance; ambiguous mutation | **PASS fail-closed and retain available evidence:** `providers`, `workflows`. |
| No real merge, wrong default/repository/head/CI or missing deploy enable/config | **PASS skipped, not deployed:** `deployment`. |
| Duplicate Vercel POST, wrong project, unknown response, status/audit failure | **PASS no false success or new POST retry:** `deployment`. |
| Forged/replayed/wrong-repository webhook; reserved room; expired live socket | **PASS no autonomous mutation or cross-user leak:** `security`, `socket`. |
| Unrequested OAuth fragment, account-switch/stale request, delayed history/notification/editor response, unmount | **PASS for covered cases:** client OAuth/Login/Auth/Workspace/V2/Topbar/editor/monitoring tests. |

The monitoring-unmount regression reproduced one unwanted `io()` call after unmount, then passed with lifecycle generation guards. Repair attempts remained below the requested ten-iteration cap. Review continued after green builds; these last defects were repaired and the **entire required suite rerun**, not merely the failed test.

## 5. Exact mock versus live boundary

| Integration | What actually executed | What did not execute |
| --- | --- | --- |
| OpenAI | Installed SDK, actual request construction/Responses stages, schemas, budgets and error handling; deterministic mocked HTTP transport. | Live model, paid usage, account access, service-side latency/limits or output quality. |
| Firebase | Actual models/services/middleware and singleton; transactional in-memory Firestore double for ownership/claims/history. | Hosted Auth/Firestore, actual emulator, composite-index readiness, rules deployment or IAM certification. |
| GitHub | Actual REST algorithm against stateful mocked fetch; **live read-only** repository/default/ref/permissions/fetch for this checkout. | Live application branch/Contents/PR/merge/required-CI mutation journey. The delivery PR is tracked separately. |
| Vercel | Actual gate/state/recovery services and mocked API responses, including failure/timeout/concurrency. | Application-triggered live creation/READY, runtime/assets, actual merge-triggered production deployment. Automatic non-production Git-integration Preview is separately recorded above. |
| Socket.IO | Real local server/client network, authentication, rooms, events, presence and expiry; component transports mocked. | Public browser proxy/CORS/TLS, production reconnects or Redis between separate processes. |
| Gemini / compiler | Actual installed Gemini SDK and HTTP route/multipart handling with mocked provider HTTP; compiler validation and timeout/failure handling. | Live model/compiler access, accuracy or provider privacy/retention behavior. |
| Native Git / PDF | Real native Git in isolated temporary projects and actual PDF extraction workers, including page/concurrency limits. | Production filesystem/container isolation, Vercel worker bundling, multi-instance cache locking or hostile-native-memory containment. |
| Browser | JSDOM React tests and real MemoryRouter in App smoke; production bundle built. | Playwright/real BrowserRouter/Monaco, multi-tab/browser OAuth popup or full visual/mobile/accessibility certification. |

No mock requires production credentials. Checked fixtures use explicitly synthetic test tokens/IDs/provider data; no live secret was copied into a fixture. A changed/new-file private-key and common GitHub/OpenAI/Google-key material scan found no matches; this targeted check is not a substitute for an independent secret scanner/review.

## 6. Dependency/security status

Latest refreshed `npm audit --json` results:

| Installation | Critical | High | Moderate | Result |
| --- | ---: | ---: | ---: | --- |
| Root | 0 | 0 | **6** | **BLOCKED** pending remediation/security acceptance. |
| Backend | 0 | 0 | **6** | Same upstream chain, not six additional independent issues. |
| Client | 0 | 0 | 0 | **PASS** for this audit snapshot. |
| Socket launcher | 0 | 0 | 0 | **PASS**; it reuses backend dependencies, so this does not erase backend exposure. |

Remaining root/backend advisory propagation affects `gaxios`, `gcp-metadata`, `glob`, `google-gax`, `minimatch` and `rimraf`, through the Firebase/Firestore dependency graph:

- [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4): Glob AbortSignal cancellation bypass / post-timeout traversal.
- [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249): minimatch globparts-amplification denial of service.

The installed Firestore/API package constrains the older API/google-gax/glob/minimatch family. Although audit reports `fixAvailable:true`, an actual `npm audit fix --dry-run --ignore-scripts --json` planned **zero changes** and retained six moderate advisories. Unsafe cross-major transitive overrides and downgrading Firebase to an obsolete release were rejected. No assertion of unreachability or risk acceptance is made. Obtain compatible upstream updates and rerun everything, or obtain explicit documented security acceptance before release.

Client DOMPurify/gRPC resolution overrides and supported Firebase/simple-git/socket upgrades removed other measured findings. Audit results are time-dependent; a green audit is neither a penetration test nor a future vulnerability guarantee. The large frontend chunk warning also remains an optimization/deployment-performance concern, not a hidden test failure.

## 7. Production blockers and required operator work

| Priority | Blocker | Required evidence before calling the MVP production-ready |
| --- | --- | --- |
| P0 | **Live providers unavailable/untested** | Supply budget-limited OpenAI/Gemini/Firebase/GitHub application credentials in an isolated authorized environment; run all mode journeys with real stored state and inspect real generated changes. No secrets in Git/chat/browser bundles. |
| P0 | **Firebase schema/index/rules/IAM unverified** | Back up/review existing data and email uniqueness migration; explicitly review/deploy proposed rules/indexes to the intended project; wait for index readiness; verify real ownership/transactions/restarts and restricted Admin IAM. |
| P0 | **Production merge/deployment not authorized or certified** | Independent PR review and green exact-head CI; branch protection/trusted required-check configuration; separately authorize an isolated merge/deployment and verify one real Vercel creation, pending/READY/error and recovery. Do not self-merge this PR. |
| P0 | **Six moderate upstream advisories unresolved** | Compatible remediation or explicit security-owner acceptance, followed by lockfile/install/audit/regression verification. No unsafe override to hide audit output. |
| P1 | **Browser/Monaco/session lifecycle coverage** | Real browser login/OAuth/Firebase, expiry/reauth, account switch/multi-tab, editor language/completion/collaboration lifecycle, exact-run navigation and notification checks. Profile nested-payload tests remain a specific gap. |
| P1 | **Distributed realtime/ingress not certified** | Actual persistent socket host; correct public CORS/socket origins; Redis cross-process delivery/recovery if split hosts; sticky sessions where required; deployment-wide request/abuse limits. Process-local limits are not distributed protection. |
| P1 | **Operations/recovery/resource containment** | Vercel function/worker asset preview, plan limits, OS worker CPU/native-memory limits, backups/retention/observability/spend alerts and a documented manual procedure for ambiguous GitHub/Vercel writes. Do not share a native Git cache across processes. |

Configuration names, limits, migration implications and safe rollout/recovery procedures are in [CONFIGURATION.md](CONFIGURATION.md). Production `JWT_SECRET`, `V2_ALLOWED_USER_IDS`, exact public origins, Firebase Admin identity, provider keys and deployment mapping must be intentionally configured. The separate Vercel Git integration must not bypass application gates or create duplicate deployments.

### Release decision

- **PASS:** required local checks, covered workflow/negative regressions, preserved application/API architecture and targeted security repairs.
- **FAIL:** none in the final required local check run. Earlier reproduced failures are documented above and superseded by passing regressions.
- **BLOCKED:** live-provider/browser/distributed/infrastructure/deployment certification and remaining advisory disposition.

**Hand off this branch for review and isolated staging verification. Do not label it production-ready, merge it, modify production secrets or trigger production deployments based only on this report or green mocks.**
