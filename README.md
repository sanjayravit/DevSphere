<!-- 🔥 DEVSPHERE BANNER -->

<h1 align="center">🚀 DevSphere</h1>
<h3 align="center">The operating system for developers.</h3>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active%20Development-blueviolet?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/Version-2.0%20Core-black?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/AI-Powered-cyan?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/FullStack-Platform-green?style=for-the-badge"/>
</p>

---

## Overview

DevSphere combines developer collaboration, AI assistance, repository tools, and a social network in one React application. V2 adds a decision-driven developer workspace to the existing product: agents propose repository-native changes, server policy decides whether they can execute, and GitHub changes are delivered as reviewable pull requests.

## Existing platform

- React/Vite dashboard, existing Firebase authentication and Firebase data models
- Code editor, project/workspace management, marketplace, social feed, repository viewer, and self-healing UI
- Existing API and collaboration socket infrastructure

## DevSphere V2 core

The V2 workspace is available at `/v2` after signing in. Its flow is:

1. **Intent Engine** structures a request using the OpenAI Responses API.
2. **Planner, Developer, QA, and Design** agents create a plan, review bounded repository context, emit explicit create/update file proposals, run static validation, and assess scope/risk.
3. **Decision Engine** enforces Manual, Approval, Assisted, and Full Auto modes on the server. Failed or inconclusive QA never executes. High-risk changes require explicit approval; low-confidence/high-risk changes are blocked.
4. **GitHub service** resolves the live repository default branch, branches from its current SHA, writes UTF-8 Base64 contents using the Contents API (including current blob SHA for updates), and opens a real PR. Environment/credential/private-key paths are blocked and concurrent edits fail closed.
5. **Firestore and authenticated Socket.IO** store run history, proposals, decisions, approvals, events, execution links, and deployment outcomes. Live V2 events are delivered only to the authenticated owner's room.
6. **Deployment** is a separate post-merge action. It verifies the PR is merged into the live default branch and configured required checks pass before requesting a Vercel production deployment. Missing provider configuration is reported as skipped.

QA currently performs static file/path/syntax validation. It does not claim the target repository's test suite was executed: the proposed files are remote and are not applied to a temporary checkout.

## Development and checks

Use Node.js 20 or later.

```bash
npm ci
npm ci --prefix client
npm run check:server
npm run test:server
npm test --prefix client -- --run
npm run build --prefix client
npm start
```

The persistent Express backend listens on port `5050` by default and serves the existing `/api/*` routes plus `/api/v2/*`. For local development run `npm run dev --prefix client` in a second terminal. Vite proxies API and Socket.IO traffic to the backend. V2's Socket.IO server is attached to the persistent Express server; Vercel Functions themselves are serverless and cannot host a durable Socket.IO server, so configure the client socket URL to point at the persistent backend when deploying the frontend separately.

## Required server environment

Keep all server credentials on the backend. Never prefix secrets with `VITE_`.

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Signs/verifies the existing authenticated API and Socket.IO sessions; required in production. |
| `OPENAI_API_KEY` | OpenAI Responses API credential for intent, planning, and code proposals. |
| `OPENAI_MODEL` | Optional model override; defaults to `gpt-4.1-mini`. |
| `OPENAI_TIMEOUT_MS` | Optional OpenAI request timeout in milliseconds. |
| `GITHUB_TOKEN` | GitHub token with repository contents, pull-request, and (for deployment gates) checks/branch-protection read permissions. |
| `GITHUB_REPOSITORY` | Target repository in `owner/name` form. The target repository's default branch is always discovered through GitHub. |
| `GITHUB_TIMEOUT_MS` | Optional GitHub request timeout in milliseconds. |
| `FIREBASE_PROJECT_ID` | Firebase Admin project ID. |
| `FIREBASE_CLIENT_EMAIL` | Service-account email (or use the runtime's Google Application Default Credentials). |
| `FIREBASE_PRIVATE_KEY` | Service-account private key; newline escapes are supported. Never commit this value. |
| `VERCEL_API_TOKEN` | Optional Vercel token for the explicitly gated post-merge deploy action. |
| `VERCEL_PROJECT_ID` | Vercel project ID for production deployments. |
| `VERCEL_GITHUB_REPO_ID` | Git provider repository ID linked to the Vercel project. |
| `VERCEL_TEAM_ID` | Optional Vercel team ID. |
| `VERCEL_PROJECT_NAME` | Optional project name sent to Vercel. |
| `CLIENT_ORIGINS` | Optional comma-separated additional browser origins allowed by the backend. Vercel and Arena preview origins are allowed by pattern. |
| `VITE_API_URL` | Optional public API base such as `https://api.example.com/api`; set this to route browser API calls directly to a persistent backend rather than Vercel Functions. |
| `VITE_SOCKET_URL` | Optional public origin of the persistent backend Socket.IO server; safe to expose, unlike API keys. |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Existing Firebase browser SDK config values used by the existing sign-in flow. These are public Firebase client config, not Admin credentials. |

Firebase Admin is initialized once and shared with existing server models. For local development, use a service account environment configuration or the Firestore emulator (`FIRESTORE_EMULATOR_HOST`). V2 run/history endpoints require Firestore; without it they return a configuration error instead of pretending audit persistence succeeded.

## Deployment notes

- The existing Vercel configuration still builds the Vite app from `client/build`, serves React routes through the SPA fallback, and routes `/api/*` through the ESM serverless adapter. Set production environment variables in the hosting provider; Vercel serverless functions do not provide durable Socket.IO transport.
- Deploy the persistent `server/server.js` process on a host that supports long-lived HTTP/WebSocket connections (for example the existing persistent backend service). Set `NODE_ENV=production`, `PORT`, all server credentials, and `CLIENT_ORIGINS` there. Set `VITE_API_URL` to the persistent service's `/api` endpoint and `VITE_SOCKET_URL` to its origin to use the integrated API/socket runtime directly. If browser API calls instead go through Vercel Functions, configure `REDIS_URL` on both serverless and persistent socket processes so authenticated V2 events can be relayed through the existing Redis Socket.IO adapter/emitter.
- Production deploy requests are intentionally not triggered by PR creation. A user must request deployment after merge; V2 verifies merge state and required checks before contacting Vercel.
- GitHub branch protection should define required checks. If branch-protection/check data cannot be verified, deployment is skipped.

## CI

GitHub Actions runs backend ES-module syntax checks, backend policy/integration-unit tests, and a frontend production build for pushes and pull requests.
