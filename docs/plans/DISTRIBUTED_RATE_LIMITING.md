# Distributed rate limiting — implementation contract

## Implemented

- Production decisions use PostgreSQL as the shared atomic store; no Redis or new vendor is required.
- Every decision uses one atomic INSERT ... ON CONFLICT DO UPDATE statement, with fixed 60-second windows and a persisted expiry.
- Public routes are keyed by the TCP socket address; private workspace routes enforce both an IP quota and a stable authenticated-user quota.
- Login, callback, logout, domain/report, phone and workspace routes have separate namespaces and limits.
- Keys are SHA-256 hashed before storage. Raw IPs, user IDs, phone numbers, search terms and case content are not stored in the limiter table.
- Production fails closed with HTTP 503 when PostgreSQL cannot make a decision. Rejected requests return HTTP 429 and Retry-After.
- Non-production uses an in-memory fallback only; this is explicitly not distributed.
- Forwarded headers are ignored. The implementation does not infer client IP from untrusted request headers.

## Data model and operations

Migration 006_shared_rate_limit_buckets.sql creates a bounded-lifecycle table with a 32-byte hash, fixed-window start, count and expiry. Expired records are removed in bounded batches during normal traffic. No external cache, service or paid infrastructure is introduced.

## Validation

PostgreSQL integration tests issue concurrent increments against one key and assert that exactly the configured number are allowed. They also verify persisted counts, hash-only key storage, and window reset. Existing private-case integration tests exercise owner isolation for case reads, updates, evidence, reports and exports.

## Remaining deployment verification

- Apply migration 006 before deploying the matching application revision.
- Verify shared counters through the actual multi-process or multi-replica hosting topology.
- Run a production-like PostgreSQL outage test and confirm fail-closed 503 behavior.
- Verify the actual ingress socket-address behavior; forwarded headers remain untrusted.
- Configure monitoring and database capacity for limiter traffic.

CI tests do not establish production readiness or prove the deployed ingress and database topology. Keep synthetic data only until the separate OIDC, network egress, retention/backup, legal and independent security-review blockers are resolved.
