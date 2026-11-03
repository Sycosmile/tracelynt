# Rate-limiting operations

## Enforcement model

Production uses PostgreSQL-backed fixed windows. Each decision is one atomic INSERT ... ON CONFLICT DO UPDATE operation, so concurrent requests and separate API processes share the same counter. PostgreSQL is already a required dependency for authenticated workspace data; this implementation adds no Redis service or separate paid infrastructure.

Non-production environments use a bounded in-memory limiter so local development and unit tests do not require a running database. This fallback is not distributed and must never be used as production enforcement.

| Route group | Key scope | Limit | Window |
| --- | --- | ---: | ---: |
| Domain inspection and report generation | Socket remote address | 20 | 60 seconds |
| Phone-format checks | Socket remote address | 30 | 60 seconds |
| Login, callback and logout | Socket remote address | 10 | 60 seconds |
| Case workspace and account deletion | Socket remote address and authenticated user ID, independently | 120 each | 60 seconds |

Keys are SHA-256 hashed with a Tracelynt-specific prefix before persistence. Raw IP addresses and user IDs are not stored in the limiter table. Caller-supplied forwarding headers are ignored; client identity is based on request.socket.remoteAddress until a trusted-proxy topology is explicitly designed and tested.

A rejected request returns HTTP 429 with RATE_LIMITED and a bounded Retry-After value. If the production PostgreSQL limiter is unavailable, protected routes return HTTP 503 RATE_LIMIT_UNAVAILABLE; they do not silently fail open.

## Storage lifecycle

The rate_limit_buckets table stores only a 32-byte key hash, fixed-window start, count, and expiry. Expired rows are removed in bounded batches during normal traffic. The expiry index supports cleanup. This is operational metadata, not evidence or investigation content.

## Safe operation

- Keep the application behind a correctly configured ingress and do not trust caller-supplied X-Forwarded-For or similar headers as client identity.
- Do not increase limits to compensate for legitimate traffic without measuring abuse, provider quotas, and database load.
- IP limits are coarse abuse controls, not user authentication or a defense against distributed botnets.
- Authenticated workspace limits additionally key on stable user IDs, so changing IP addresses does not reset the user's aggregate allowance.
- Do not log raw phone numbers, case content, session tokens, full request bodies, or raw limiter keys.
- Monitor database availability and 503 RATE_LIMIT_UNAVAILABLE responses; a limiter outage is an availability incident, not a reason to disable enforcement.

## Deployment requirements

- Apply migration 006_shared_rate_limit_buckets.sql before deploying the application code.
- Keep the runtime database role limited to the operations required by the application; the limiter needs SELECT, INSERT, UPDATE, and DELETE on rate_limit_buckets.
- Confirm the deployed process count and verify that requests reaching separate instances share the same PostgreSQL counters.
- The current implementation intentionally does not trust proxy headers. If deployed behind a proxy, confirm the socket address behavior and set an ingress-level control rather than accepting arbitrary client headers.
- Keep the database connection pool and request concurrency within the hosting plan's limits.

## Verification checklist

- [ ] Apply all migrations and verify rate_limit_buckets exists.
- [ ] Send concurrent requests through separate API processes and confirm the shared threshold is enforced.
- [ ] Confirm the next request after the threshold receives 429 and a positive Retry-After.
- [ ] Verify fixed-window reset behavior.
- [ ] Stop or isolate PostgreSQL in a production-like test and confirm protected routes fail closed with 503.
- [ ] Confirm spoofed forwarding headers do not change the socket-derived client key.
- [ ] Confirm stored limiter keys are hashes and telemetry contains no personal input.

The repository integration tests exercise atomic concurrent increments and fixed-window expiry against PostgreSQL. Deployment-topology verification and outage drills remain operator tasks; passing CI does not prove the hosted environment is correctly configured.
