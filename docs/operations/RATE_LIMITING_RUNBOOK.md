# Rate-limiting operations

## Status and current behavior

This runbook describes the prototype implementation. The current limiter is an in-memory fixed window in each Node.js process; it is not shared between processes or replicas and resets when a process restarts.

The current limits in `backend/src/server.js` are:

| Route group | Key scope | Limit | Window |
| --- | --- | ---: | ---: |
| General domain/report requests | Socket remote address | 20 | 60 seconds |
| Phone-format checks | Socket remote address | 30 | 60 seconds |
| Login and callback | Socket remote address, auth suffix | 10 | 60 seconds |
| Case workspace and account deletion | Socket remote address, workspace suffix | 120 | 60 seconds |

A rejected request returns HTTP 429 with a `RATE_LIMITED` error. The current implementation does not return a `Retry-After` header. Limits are process-local, so the table must not be interpreted as an aggregate deployment quota.

## Safe operation

- Keep the application behind a correctly configured ingress and do not trust caller-supplied `X-Forwarded-For` or similar headers as client identity.
- The current implementation uses the TCP socket's remote address. If a reverse proxy is introduced, document the exact trusted proxy topology before changing client-IP derivation.
- Do not increase limits to compensate for legitimate multi-user traffic without measuring abuse, provider quotas, and database load.
- Treat IP limits as a coarse abuse control, not user authentication or a defense against distributed abuse.
- Do not log raw phone numbers, case content, session tokens, or full request bodies when investigating rate-limit events.

## Deployment limitation

A multi-process or multi-replica deployment has independent counters. A client can therefore receive a larger aggregate allowance by reaching different replicas, and a restart clears counters. The process-local limiter is suitable only as a prototype safeguard.

Before production or horizontally scaled deployment, select a shared atomic store and document:

1. Key design for anonymous IPs, authenticated stable user IDs, route groups, and provider quotas.
2. Atomic increment and expiry behavior under concurrent requests.
3. Trusted-proxy configuration and spoofed-forwarded-header tests.
4. Bounded key cardinality and TTL cleanup.
5. Explicit behavior during shared-store outages; do not silently fail open for sensitive routes.
6. Consistent 429 responses and a truthful `Retry-After` value when the retry time is known.
7. Metrics for allowed/denied counts and store health without collecting unnecessary personal data.

See [the distributed rate-limiting plan](../plans/DISTRIBUTED_RATE_LIMITING.md) if present in the repository roadmap history. The backend choice remains an explicit deployment decision; this runbook does not select a vendor.

## Verification checklist

- [ ] Confirm the deployed process count and whether traffic can reach multiple replicas.
- [ ] Confirm the ingress/proxy path and the address visible as `socket.remoteAddress`.
- [ ] Verify each route group's configured threshold in the deployed commit.
- [ ] Exercise the threshold and confirm the next request receives 429.
- [ ] Verify counters expire after the configured window.
- [ ] For a shared implementation, test concurrent increments across independent instances and store-outage behavior.
- [ ] Confirm rate-limit telemetry contains no request body, phone number, case data, or credential.

Do not claim distributed enforcement until the shared-store tests pass in the deployed topology.
