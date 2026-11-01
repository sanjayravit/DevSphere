# DevSphere client

The existing application uses **React 19 + Vite**, not Create React App. Use Node.js >=22.13 (CI: 22.22.3).

From the repository root:

```sh
npm ci                             # installs root + client lockfiles
npm run dev --prefix client         # http://localhost:3000
npm test --prefix client -- --run
npm run build                      # client/build; generated, do not commit
```

Start the Express backend separately with `npm start`. Vite binds `0.0.0.0`, accepts Arena preview hosts and proxies `/api` and `/socket.io` to the local backend. Browser code uses relative URLs, not the browser's own `localhost`.

Build-time public settings:

- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` are needed for Firebase browser sign-in. Storage bucket and messaging sender ID are optional. Existing `REACT_APP_FIREBASE_*` aliases remain compatible.
- `VITE_API_URL`: optional public API base, e.g. `https://api.example.com/api`; defaults to `/api`.
- `VITE_SOCKET_URL`: persistent public Socket.IO origin. Defaults to the API URL's origin, then the current browser origin. Vercel Functions cannot serve durable sockets.

Only public Firebase **client** configuration belongs here. Never put Firebase Admin private keys, session-signing secrets or provider tokens in browser environment variables. Changes to Vite environment variables require a rebuild.

Auth verifies backend sessions through `/auth/me`, scopes Firebase synchronization, invalidates stale sign-in work and handles cross-tab identity changes. A session switch resets the protected UI. The optional backend GitHub OAuth action starts from the login page and requires a single-use same-browser nonce; unrequested token fragments are rejected. API failures and offline live updates are shown honestly; an AI error does not become a fabricated score, template, PR or deployment.

See the root [README](../README.md), [operations guide](../docs/CONFIGURATION.md) and [stabilization report](../docs/STABILIZATION_REPORT.md) for policy, validation evidence and release blockers. Tests use JSDOM and explicitly mocked HTTP/socket/Firebase browser transports; they are not a real-browser/provider end-to-end certification.
