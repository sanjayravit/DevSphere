# DevSphere

DevSphere is the existing React/Vite developer workspace: Firebase sign-in, workspaces/projects, a collaborative Monaco editor, AI assistance, social feed, marketplace and repository viewer. **V2 extends this application; it is not a replacement.** The authenticated `/v2` page turns development intent into a persisted, policy-gated proposal and, when authorized, an isolated GitHub pull request.

**Release status:** production-readiness work for staging review, **not certified production-ready**. See the [readiness report and release checklist](docs/PRODUCTION-READINESS.md), [staging verification guide](docs/STAGING-VERIFICATION.md), and historical [stabilization report](docs/STABILIZATION_REPORT.md).

## Run locally

Use **Node.js >=22.13**; CI uses **22.22.3**. Native Git must be installed for the existing local project-commit feature.

```sh
npm ci                          # also installs the client deterministically
npm start                       # persistent Express + authenticated Socket.IO, :5050
# In a second terminal:
npm run dev --prefix client     # Vite :3000, same-origin API/socket proxy
```

Run from the repository root. Supply server environment variables to the process or a local, **untracked** `.env`. Missing configuration is an explicit unavailable/error state, not a successful empty database or generated result. Without Firebase browser configuration, Firebase sign-in is unavailable; a valid separately configured backend OAuth flow can still establish a session.

To reproduce all installation paths used in CI:

```sh
npm ci --ignore-scripts
npm ci --prefix client --ignore-scripts
npm ci --prefix server --ignore-scripts
npm ci --prefix socket-server --ignore-scripts
```

### Required checks

```sh
npm run check:server
npm run test:server
npm test --prefix client -- --run
npm run build
```

Backend tests use real local HTTP, Socket.IO, native Git, PDF extraction and the installed provider SDKs where specified, with external provider transports and Firestore persistence mocked. **Green tests are not live-provider certification.** The build writes ignored `client/build` output. Root/server audits currently retain moderate upstream Firestore dependency advisories; do not use an unsafe major-version override or Firebase downgrade to hide them.

## V2 execution contract

| Mode | Server behavior after mandatory sandbox QA |
| --- | --- |
| Manual | Store/display the suggestion. No GitHub writes. |
| Approval | Store issue, suggested fix, confidence, risk, impact, complete changes and their exact SHA-256 envelope hash. Only the owner/operator can approve that immutable envelope once. |
| Assisted | Low risk and confidence **>80** may create a PR. Other risk/confidence combinations ask, suggest or block. |
| Full Auto | Only low risk and confidence **>=70** may create a PR. Medium/high/system impact still requires approval or is blocked. |

Failed or inconclusive QA never executes, including after approval. Detected security/system risk cannot be downgraded by the planner. Confidence is a model estimate, **not an empirically measured probability**. QA preserves static path/credential/JSON/JavaScript/TypeScript checks and can run allowlisted offline install/build/test commands through a separately hosted [isolated sandbox](docs/QA-SANDBOX.md). **Without configured safe runner infrastructure, mandatory QA is inconclusive and no execution or approval can proceed.** Old static-only approvals are not grandfathered in. The local tests mock sandbox results; the real runner still requires staging isolation certification. Generated YAML/CSS/Python and other unsupported file types remain inconclusive. Review and target-repository CI are still required.

GitHub operations discover the current default branch, pin its SHA, create a unique feature branch, validate create/update operations and blob SHAs, write Base64 Contents API payloads, then open a genuine PR. Default-head advances, conflicts, malformed results and uncertain mutations fail closed and retain available branch/commit evidence. Nothing automatically merges a PR. The dashboard can [refresh actual GitHub checks](docs/GITHUB-CI.md) for the exact delivered PR head; stale, missing, inaccessible and failing results never count as success.

Deployment is a **separate explicit action after an independently verified merge** to the current default branch. Required checks must succeed on that merged commit, the tracked PR head/repository must match, Vercel must be configured, and the owner must explicitly enable production deployment. `skipped`, `pending`, `failed` and `unknown` are **not success**; only a verified Vercel `READY` outcome is deployed. Refreshing a known pending ID never creates another deployment.

## Configuration and hosting

See [configuration and operations](docs/CONFIGURATION.md) for every environment variable, Firebase indexes/rules, operator permissions, deployment gates, recovery procedures and remaining infrastructure requirements.

- Keep `JWT_SECRET`, Firebase Admin keys, OpenAI/Gemini/GitHub/Vercel tokens and webhook secrets **server-side**. Never prefix them with `VITE_` or `REACT_APP_`.
- Production requires a shared `JWT_SECRET` of at least 32 random bytes and explicit `V2_ALLOWED_USER_IDS`. JWT sessions use expiring HS256 signatures. Existing non-expiring sessions must sign in again.
- Production CORS uses explicit `CLIENT_ORIGINS` (or `CLIENT_URL`); arbitrary Vercel tenants are not trusted. Local/Arena preview hosts are permitted only outside production.
- A persistent backend can host API + sockets together. Vercel Functions cannot host durable Socket.IO; point `VITE_SOCKET_URL` at a persistent public service. If API and socket processes differ, configure and verify the same `REDIS_URL` on both.
- Browser API calls default to `/api`, never sandbox `localhost`. `VITE_API_URL` may select a public API base including `/api`.
- Signed webhooks persist bounded, deduplicated, repository-bound evidence; they **never autonomously generate fixes, commit, approve, merge or deploy**.

## Staging and release verification

```sh
npm run verify:preflight       # configuration only; no network or live mutation
npm run readiness:preflight    # exits nonzero while release configuration is missing
npm run check:client-secrets   # after build; bounded known-pattern/configured-secret scan
# Only after dedicated staging resources, least-privilege credentials and explicit gates:
npm run verify:staging -- --provider=all
```

New run fields/collections and operator-only index changes are listed in the
[readiness report](docs/PRODUCTION-READINESS.md). No Firebase rules/indexes,
secrets, permissions, merge or production deployment are applied automatically.
Review the exact PR-head CI and independent staging evidence before rollout.
The session branch name is fixed by Arena; the requested feature work is on
`arena/4b8a5a3d-devsphere`, not a separately created `feat/…` branch.
