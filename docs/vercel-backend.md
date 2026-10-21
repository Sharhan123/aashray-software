# Vercel backend experiment

This branch keeps the existing Render backend and frontend project unchanged. Configure a **separate** Vercel project from this repository with:

- Project name: `aashray-hospitality-api-vercel`
- Production branch: `vercel-backend`
- Root directory: `server`
- Framework preset: Express
- Install command: `npm ci --include=dev` (uses the repository root lockfile)
- Build command: `npm run build`
- Node.js: 22.x (also pinned by `server/package.json`)

The Express application is exported from `server/src/app.ts`, which Vercel recognizes as an Express entry point. The Render process entry remains `server/src/server.ts`. In the Vercel runtime, API and readiness requests initialize MongoDB and model indexes through a shared per-instance promise; failed initialization can be retried on a later request. Login throttling uses atomic MongoDB counters with a TTL index on Vercel, so limits are shared across function instances; Render retains its existing in-memory limiter. No cron, worker, or listener is started by the function.

## Environment variables

Set these in the Vercel project's Production and Preview environments as appropriate. Supply values through Vercel's secure Environment Variables UI; do not commit them or copy development credentials into production.

| Variable | Required | Value guidance |
| --- | --- | --- |
| `NODE_ENV` | Yes | `production` |
| `MONGODB_URI` | Yes | MongoDB Atlas URI for an isolated staging database during the experiment. Configure Atlas network access for Vercel using an approved egress/network option; do not open Atlas to all IPs. |
| `SESSION_SECRET` | Yes | At least 32 cryptographically random characters, distinct from Render's value. |
| `CLIENT_ORIGIN` | Yes | `https://aashray-software.vercel.app` |
| `COOKIE_SECURE` | Recommended | `true` |
| `COOKIE_SAME_SITE` | Recommended | `none` for cross-site credentialed requests over HTTPS |

Do not enable `ENABLE_ADMIN_BOOTSTRAP` on a production database or set `INITIAL_ADMIN_*` unless performing a separately reviewed, one-time bootstrap. `PORT` is managed by the runtime. The existing Vercel frontend API rewrite continues to point to Render; do not change it as part of this experiment.

## Branch synchronization

`.github/workflows/sync-vercel-backend.yml` runs only for pushes to `main`. It fetches both branches and performs a normal merge of `main` into `vercel-backend`, then pushes only if the merge succeeds. It never force-pushes. It then calls the Vercel Deploy Hook. Create one for the `vercel-backend` branch in the Vercel project's **Settings → Git → Deploy Hooks** and save the URL as the GitHub repository Actions secret `VERCEL_BACKEND_DEPLOY_HOOK`. The workflow fails clearly if that secret is missing. On a merge failure it creates an issue with the workflow run and manual resolution steps. Because the workflow triggers only on `main`, pushing the synchronized backend branch cannot recursively start another sync. Render's existing configuration is unchanged; its service should remain attached to its current production branch.

To resolve a conflict, check out `vercel-backend`, merge the latest `origin/main`, resolve conflicts without discarding Vercel-only files, and push the merge commit. Close the generated issue after the sync workflow has completed successfully.

## Validation and operational limits

Vercel deploys this Express application as one Node.js Function. It retains Express routing, auth, rate limiting, CSRF, CORS, and error middleware. There are no application schedulers, local persistent-file dependencies, or WebSocket listeners in the inspected server code. Function requests and responses have Vercel's current payload limits; large imports or exports should be checked against them. MongoDB connection reuse is scoped to warm function instances, not shared globally across instances.

The application is used for commercial property management. Vercel's Hobby plan is restricted to non-commercial personal use; use a Pro or Enterprise team for a commercial deployment. Do not cut production traffic over until a suitable plan, isolated database, Vercel environment variables, auth/CSRF/CORS behavior, and representative workflows have been verified. Vercel-generated domains are separate sites, so browser third-party-cookie policies may affect cookie-backed login; test this explicitly before any frontend API switch.
