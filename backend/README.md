# Backend

Tracelynt uses a Node.js 22+ HTTP API, PostgreSQL persistence, and a configurable OpenID Connect (OIDC) client. This is a development prototype, not production-ready software. No identity provider or hosted environment is configured. Use synthetic data only.

## Local setup

Requirements:
- Node.js 22 or newer.
- Docker Compose or PostgreSQL 17.
- PostgreSQL psql client for migrations.

From the repository root:

    docker compose up -d postgres

From this directory, install dependencies:

    npm install

Set environment variables in your shell. PowerShell example:

    $env:DATABASE_URL = "postgresql://tracelynt_app:local-dev-only-change-me@127.0.0.1:5432/tracelynt"
    $env:APP_BASE_URL = "http://127.0.0.1:8000"
    $env:AUTH_SECRET = "<generate a unique secret of at least 32 bytes>"

Then apply migrations and run checks:

    npm run migrate
    npm run check
    npm test
    npm start

Do not expose PostgreSQL beyond localhost. Change the Compose development password before using any database that contains data you want to keep. The migration runner requires psql; it applies each migration and its checksum ledger entry in a transaction.

## Render web-service binding

When the Render platform sets `RENDER=true`, the backend binds to `0.0.0.0` so Render's public web-service proxy can reach it. Outside Render, the default remains `127.0.0.1`; an explicit `HOST` value is respected for local or other-host deployments. Render supplies the runtime `PORT` value to the start command.

Configure Render's health-check path as `/health`. This endpoint is a lightweight liveness check and intentionally does not require PostgreSQL or an external provider to be available. A successful health response does not mean private-workspace database features or authentication are ready.

## PostgreSQL connection limits

The API uses a PostgreSQL pool of 10 connections by default. `DB_POOL_MAX` may be set to an integer from 1 to 20; invalid or excessive values prevent pool creation rather than silently falling back. Connections have a 5-second acquisition timeout, idle connections are closed after 30 seconds, and PostgreSQL statements and idle transactions are each limited to 15 seconds. Tune these limits only after measuring the database plan's actual connection budget and query workload.

## OIDC configuration

Configure an OIDC provider that supports discovery and authorization-code flow. Set:

- OIDC_ISSUER: exact issuer URL from the provider's discovery document.
- OIDC_CLIENT_ID and OIDC_CLIENT_SECRET: credentials stored outside source control.
- APP_BASE_URL: the app's origin, with no path or trailing route. Production must use HTTPS.
- AUTH_SECRET: unique random secret, at least 32 bytes.

Register this exact redirect URI with the provider:

    http://127.0.0.1:8000/auth/callback

Use the matching hostname consistently; localhost and 127.0.0.1 are different origins. Production must register its HTTPS callback URI separately. Do not configure a real provider or deploy case storage until provider account recovery, terms, data processing, privacy, and deletion controls have been reviewed.

The login flow uses state, nonce, PKCE, short-lived server-side login transactions, and a browser-binding cookie. The server creates a high-entropy opaque session token, stores only its SHA-256 hash, and sends the token in an HttpOnly, SameSite cookie (Secure in production). Sessions expire after 12 hours. State-changing cookie-authenticated requests require a same-origin Origin/Referer check and an HMAC-derived CSRF token from GET /api/session in the X-CSRF-Token header.

## Endpoints

Public prototype:
- GET /health — health response.
- POST /api/domain-check — DNS/TLS observations for a validated domain.
- POST /api/report — generate a non-persistent report from analyst-supplied business/domain findings.

Authentication:
- GET /auth/login — begin OIDC sign-in.
- GET /auth/callback — handle the configured OIDC callback.
- GET /api/session — return authentication state and a CSRF token for an active session.
- POST /auth/logout — revoke the current session and clear auth cookies; send JSON content type, same-origin Origin header, and CSRF token.
- DELETE /api/account — requires JSON {"confirm":true}; revokes sessions and marks the account and its cases deletion_pending.

Private workspace (requires a valid session):
- GET /api/cases — list the authenticated user's cases.
- POST /api/cases — create a case using title, purpose, subjectType, and subjectLabel.
- GET /api/cases/:id — read an owned case.
- PATCH /api/cases/:id — update title/purpose/subject fields or set status to open or archived.
- DELETE /api/cases/:id — requires JSON {"confirm":true}; marks the owned case deletion_pending and hides it from normal access. This is not physical deletion.
- GET /api/cases/:id/evidence — list evidence for an owned case.
- POST /api/cases/:id/evidence — add a finding with claim, category, source name, optional HTTPS source URL, limitations, and optional observation time.
- PATCH /api/cases/:id/evidence/:evidenceId — update review state, correction note, or limitations.
- GET /api/cases/:id/reports — list report version metadata.
- GET /api/cases/:id/reports/:reportId — read an owned report version.
- POST /api/cases/:id/reports — generate and store a versioned summary from the case's evidence. The report explicitly says that claims are not independently verified.
- POST /api/cases/:id/reports/:reportId/export — authorize and audit a report export before returning the snapshot.

Every case, evidence, and report query is scoped to the authenticated owner. Unknown and non-owned IDs return the same not-found response. Mutations and sensitive reads write minimized audit events in the same transaction. Sharing and public case links are not supported.

## Security and limitations

- Domain checks reject URLs, paths, ports, IP literals, and DNS results that are non-public or special-use; arbitrary web pages are not fetched.
- Rate limits use the socket peer address for direct/local deployments. On Render (`RENDER=true`), they use only a single syntactically valid `CF-Connecting-IP` value supplied through Render's Cloudflare edge; `X-Forwarded-For` is never used. Missing or malformed trusted client-IP headers share a fail-closed `unknown` rate-limit bucket.
- Domain inspection requires both `DOMAIN_INSPECTION_ENABLED=true` and `DOMAIN_INSPECTION_EGRESS_VERIFIED=true`. It is additionally hard-disabled when Render's platform-provided `RENDER=true` is present because Render's documented networking features do not provide the required per-service outbound destination firewall. Do not remove this guard without independently verified network-level egress controls.
- External evidence URLs are stored as references and never fetched by the case API.
- HTTP ingress is bounded to 16 KiB of headers, 50 header fields, 10 seconds for headers, 15 seconds to receive a request, 5 seconds of keep-alive, 100 requests per socket, and 100 concurrent connections per process. Oversized headers receive a 431 response and the connection is closed.
- JSON request bodies are capped at 2 KiB for ordinary endpoints and 96 KiB for report and case payloads. These are application-level limits; the hosting proxy should enforce compatible or stricter limits.
- Report versions are immutable snapshots; later evidence corrections do not silently rewrite previous reports.
- Production rate limits use shared PostgreSQL buckets; local development uses a bounded process-local fallback. Neither replaces network-level abuse controls.
- Domain inspection uses independently cancellable DNS resolvers, a hard TLS deadline that destroys stalled sockets, and a per-process concurrency ceiling of four. These application controls do not replace network egress isolation.
- Case and account deletion requests mark records deletion_pending, block normal case access, and revoke account sessions. The operator command npm run purge:pending defaults to a read-only dry-run. Review its counts and the approved retention policy before setting PURGE_DRY_RUN=false and CONFIRM_PURGE_PENDING_CASES=YES for a destructive run. PURGE_DRY_RUN accepts only true or false; invalid values fail closed. An optional PURGE_OWNER_IDS comma-separated UUID list limits a run to selected owners. No scheduled purge, approved retention period, backup expiry, or restoration drill is configured; deleting primary database rows does not remove backup copies.
- The frontend is wired to the private case APIs, but end-to-end login remains unverified until a real OIDC provider is configured.
- Use a least-privilege database role in any non-disposable environment; keep migration credentials separate from runtime credentials.
- Never commit real provider credentials or investigation records. Do not store sensitive production records until access-control, retention, deletion, monitoring, backup, provider, and hosting reviews are complete.

See database setup, case workspace design, and security decisions in the repository docs.
