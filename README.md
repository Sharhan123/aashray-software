# Aashray Hospitality · Phase 1 foundation

Private resident and rental management workspace for Aashray Hospitality, Surat. This repository contains a React/Vite TypeScript client and an Express/Mongoose TypeScript API. There is no public registration endpoint.

## Project layout

```text
client/   React, TypeScript, Vite, Tailwind, Router, React Query
server/   Express REST API, Mongoose models, validation, auth services
```

The client uses a small custom Tailwind design system with shared components and a responsive login and workspace shell. Authentication uses server-issued opaque sessions stored by hash in MongoDB, an HttpOnly session cookie, SameSite cookie policy, CSRF token checks on state-changing routes, rate-limited login, and Argon2id password hashes. Super Admin authorization is enforced server-side; staff permissions default to none and are checked by `requirePermission` for future protected routes.

## Requirements and local setup

- Node.js 22.12 or later and npm 10 or later. (The selected Vitest release requires Node.js 22.12+ and Vite 6.4+.)
- MongoDB 7 or later running locally or a private MongoDB deployment. Keep its port private; do not expose the database to the public internet.

```powershell
npm install
Copy-Item .env.example server/.env
Copy-Item client/.env.example client/.env
```

Edit `server/.env`: set a private `MONGODB_URI`, `SESSION_SECRET` (at least 32 characters from a cryptographically secure random generator), and `INITIAL_ADMIN_*` values. Keep the admin password out of shell history, source control, and shared logs. For local development the example origin and `COOKIE_SECURE=false` are suitable only on localhost. In production set `NODE_ENV=production`, `COOKIE_SECURE=true`, use HTTPS, set an exact `CLIENT_ORIGIN`, choose an appropriate `COOKIE_SAME_SITE`, and configure the reverse proxy to trust only the expected proxy hop.

Create the first Super Admin once, using the same server environment:

```powershell
$env:ENABLE_ADMIN_BOOTSTRAP = 'true'
npm --workspace server run bootstrap:admin
Remove-Item Env:\ENABLE_ADMIN_BOOTSTRAP
```

The bootstrap command also requires `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL`, and a strong `INITIAL_ADMIN_PASSWORD` in `server/.env`. It refuses to run without the explicit flag, requires a 14 character minimum password, refuses to run if a Super Admin exists, and never changes an existing account. After creation, sign in at `http://localhost:5173` with that email and password. To rotate a credential, use a future audited admin credential-management operation or a controlled one-off maintenance command; do not edit MongoDB password hashes manually or rerun bootstrap to reset it. Password reset management UI is not part of this phase.

Start both applications:

```powershell
npm run dev
```

Client: `http://localhost:5173`; API: `http://localhost:4000/api`; liveness: `http://localhost:4000/api/health`.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

## Security and product boundaries

- `GET /api/auth/csrf`, `POST /api/auth/login`, `GET /api/auth/me`, and `POST /api/auth/logout` are the only account endpoints. Public signup is absent.
- Login failures use the same response for unknown, inactive, and incorrect-password accounts. Login is rate-limited. Sensitive fields are excluded from normal user queries and redacted from logs.
- All business API routes use `requireAuth` and the relevant permission check; state-changing routes also pass through `requireCsrf`. A frontend route guard is a usability check, not authorization.
- Session tokens are random, stored only as SHA-256 hashes, expire after 12 hours, and are revoked on logout. The browser receives the raw token only in an HttpOnly cookie.
- Configure TLS and a private tunnel or well-secured VPN/reverse proxy for remote access from the office machine. Add automated encrypted MongoDB backups and perform recovery tests before using real resident data.
- WhatsApp is not connected and no messages are sent. Future Cloud API credentials belong only in the server environment/secret manager. Implement an asynchronous service, verified webhooks, message audit records, idempotency, approved templates, consent, and Meta messaging-window rules before enabling delivery. Manual click-to-chat links must remain distinct from API automation.
- Dashboard metrics query live room, resident, charge, and payment records. Empty accounts show zero values rather than sample analytics.

## Current scope

Implemented: login, cookie session auth, role and permission checks, explicit initial admin bootstrap, responsive shell, property cards and property workspaces, property-scoped rooms/residents/rent and utility workflows, explicit legacy-room assignment, resident admission/edit/departure/history, initial and recurring rent charges, utility charges, payment allocation/reversal, live dashboard metrics, manual WhatsApp click-to-chat reminders, staff administration, CSV reports and resident CSV import, and business settings.

## Operations modules and API routes

Business routes are under `/api` and require an authenticated session plus the corresponding staff permission. JSON write requests require the CSRF header supplied by the client.

- Rooms: `GET/POST /api/rooms`, `PUT /api/rooms/:id`, `PATCH /api/rooms/:id/deactivate`.
- Properties: `GET/POST /api/properties`, `PUT /api/properties/:id`, `PATCH /api/properties/:id/deactivate`, and `POST /api/properties/:id/assign-room`. Legacy rooms remain unassigned until an authorized operator records the assignment reason. New room uniqueness is enforced by `{ propertyId, roomNumber }`.
- Residents: `GET/POST /api/residents`, `GET/PUT /api/residents/:id`, `PATCH /api/residents/:id/status`. Admission is idempotent and uses a MongoDB transaction to create the resident, bed allocation, initial full-month rent charge, optional deposit receipt, and audit event together.
- Billing: `GET /api/charges`, `POST /api/billing/generate`, `PATCH /api/charges/:id/adjust`, `POST /api/utilities`. Rent generation is period-based and idempotent; choose the period explicitly from Rent & Billing.
- Payments: `GET/POST /api/payments`, `POST /api/payments/:id/reverse`. Payments must reconcile exactly to charge allocations; advances are disabled. Reversals retain the payment and audit trail.
- Dashboard: `GET /api/dashboard`.
- Messages: `GET /api/messages`, `POST /api/messages/prepare`, `POST /api/messages/:id/opened`. Prepared messages open WhatsApp with prefilled text; this records preparation/open status and does not claim delivery.
- Staff: `GET/POST /api/staff`, `PATCH /api/staff/:id`, `POST /api/staff/:id/reset-password`.
- Settings: `GET/PUT /api/settings`.
- Reports: `GET /api/reports/:name?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv`. Supported names: residents, occupancy, rent, overdue, collections, outstanding, utilities, admissions.
- Resident import: `GET /api/imports/residents/template`, `POST /api/imports/residents/preview`, `POST /api/imports/residents/commit`. CSV preview is required before commit; each admitted row is atomic, row errors are reported, and identical file retries are idempotent.

### Property schema rollout

`Room.propertyId` is optional for existing documents so startup never guesses a property's identity or changes financial history. Assign legacy rooms from a property workspace after verifying the source records. A one-time index migration is provided: `npm --workspace server run migrate:property-room-index` is a dry run; inspect the output, then use `npm --workspace server run migrate:property-room-index -- --apply` to create the property-scoped unique index and drop the former `propertyName + roomNumber` index. The migration changes indexes only and does not rewrite room, resident, charge or payment documents. It has not been run automatically.

All financial amounts are stored as integer paise. MongoDB transaction support was verified against the configured Atlas deployment with a read-only transaction. Financial multi-document writes fail closed if the deployment cannot provide transactions; there is no unsafe fallback.

## Remaining configuration and limits

- The Meta WhatsApp Cloud API is not connected. Manual WhatsApp links work; sending, webhooks, templates, consent tracking, and delivery callbacks are not implemented. Automated reminders remain disabled.
- Bulk import/export currently uses CSV, not XLSX. Resident CSV imports commit valid rows independently and return a row-by-row summary.
- Payment entry currently allocates to one selected charge in the UI, while the API supports multiple charge allocations. Unallocated advances are not supported.
- No reminder scheduler is running. Rent generation is an authorized, explicit monthly action and can be invoked for one selected period.
- Set up encrypted database backups and test restore/recovery before storing operational resident data. Use HTTPS plus a private tunnel or VPN for remote access; this development server is not deployed publicly.
