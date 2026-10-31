# Stabilization changed-file inventory

Compared with base `0149ec9ad0d06363df89f363d261e31731b6a548` on `arena/a75b6061-devsphere`.

**118 paths** (including the removed legacy Vite config and its ESM replacement). Generated builds, node_modules, local logs, credentials and caches are not included. Git rename detection may display the config replacement as a single rename.

Rationale, regressions and remaining gaps: [STABILIZATION_REPORT.md](STABILIZATION_REPORT.md).

## Runtime, CI, dependencies and hosting

- `.github/workflows/ci.yml`
- `client/package-lock.json`
- `client/package.json`
- `client/vite.config.js` — removed; replaced by `client/vite.config.mjs`
- `client/vite.config.mjs`
- `package-lock.json`
- `package.json`
- `scripts/check-server.mjs`
- `server/package-lock.json`
- `server/package.json`
- `socket-server/package-lock.json`
- `socket-server/package.json`
- `vercel.json`

## Client application and regressions

- `client/src/App.test.jsx`
- `client/src/components/layout/Layout.jsx`
- `client/src/components/layout/Topbar.jsx`
- `client/src/components/layout/Topbar.test.jsx`
- `client/src/components/ui/Button.jsx`
- `client/src/components/ui/Button.test.jsx`
- `client/src/context/AuthContext.jsx`
- `client/src/context/AuthContext.test.jsx`
- `client/src/context/WorkspaceContext.jsx`
- `client/src/context/WorkspaceContext.test.jsx`
- `client/src/firebase.js`
- `client/src/pages/AIToolsPage.jsx`
- `client/src/pages/CodeEditorPage.jsx`
- `client/src/pages/CodeEditorPage.test.jsx`
- `client/src/pages/Dashboard.jsx`
- `client/src/pages/LoginSignupPage.jsx`
- `client/src/pages/LoginSignupPage.test.jsx`
- `client/src/pages/MarketplacePage.jsx`
- `client/src/pages/ProfilePage.jsx`
- `client/src/pages/RepositoryViewerPage.jsx`
- `client/src/pages/RepositoryViewerPage.test.jsx`
- `client/src/pages/SelfHealingPage.jsx`
- `client/src/pages/SelfHealingPage.test.jsx`
- `client/src/pages/SocialFeedPage.jsx`
- `client/src/pages/V2WorkspacePage.jsx`
- `client/src/pages/V2WorkspacePage.test.jsx`
- `client/src/services/api.js`
- `client/src/services/githubOAuth.js`
- `client/src/services/githubOAuth.test.js`
- `client/src/services/publicGithub.js`
- `client/src/services/publicGithub.test.js`
- `client/src/services/socket.js`
- `client/src/utils/editorChanges.js`
- `client/src/utils/editorChanges.test.js`
- `client/src/utils/inlineCompletions.js`
- `client/src/utils/inlineCompletions.test.js`

## Server/API/socket application and regressions

- `api/ai/agent.js`
- `api/index.js`
- `server/agents/deployAgent.js`
- `server/agents/devAgent.js`
- `server/agents/errorAgent.js`
- `server/agents/qaAgent.js`
- `server/config/cors.js`
- `server/config/firebase.js`
- `server/config/session.js`
- `server/engines/decisionEngine.js`
- `server/engines/designEngine.js`
- `server/engines/orchestrator.js`
- `server/middleware/auth.js`
- `server/middleware/projectAccess.js`
- `server/middleware/rateLimit.js`
- `server/models/MarketplaceItem.js`
- `server/models/Post.js`
- `server/models/Project.js`
- `server/models/Workspace.js`
- `server/models/database.js`
- `server/models/user.js`
- `server/routes/ai.js`
- `server/routes/analytics.js`
- `server/routes/auth.js`
- `server/routes/code.js`
- `server/routes/git.js`
- `server/routes/marketplace.js`
- `server/routes/post.js`
- `server/routes/profile.js`
- `server/routes/projects.js`
- `server/routes/v2.js`
- `server/routes/webhook.js`
- `server/routes/workspaces.js`
- `server/server.js`
- `server/services/aiService.js`
- `server/services/firebaseService.js`
- `server/services/geminiService.js`
- `server/services/gitService.js`
- `server/services/githubService.js`
- `server/services/resumeTextService.js`
- `server/services/vercelService.js`
- `server/socketServer.js`
- `server/sockets/authenticateSocket.js`
- `server/sockets/runtime.js`
- `server/sockets/socketHandler.js`
- `server/test/deployment.test.js`
- `server/test/helpers/firestore.js`
- `server/test/helpers/providers.js`
- `server/test/legacy.test.js`
- `server/test/persistence.test.js`
- `server/test/providers.test.js`
- `server/test/security.test.js`
- `server/test/socket.test.js`
- `server/test/v2-core.test.js`
- `server/test/v2-http.test.js`
- `server/test/workflows.test.js`
- `server/utils/repositorySafety.js`
- `server/utils/security.js`
- `server/workers/resumePdf.js`
- `socket-server/server.js`

## Firebase proposals

- `firebase.json`
- `firestore.indexes.json`
- `firestore.rules`

## Documentation and evidence

- `README.md`
- `client/README.md`
- `docs/CHANGED_FILES.md`
- `docs/CONFIGURATION.md`
- `docs/STABILIZATION_REPORT.md`
- `docs/validation-results.json`
