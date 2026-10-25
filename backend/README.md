# Backend

The initial runnable backend slice is a dependency-free Node.js HTTP API. It provides a health endpoint and bounded domain-intelligence checks. It is an early development implementation, not production-ready software.

## Requirements

- Node.js 22 or newer.
- No third-party runtime dependencies are required for this slice.

## Run locally

From this directory:

    npm test
    npm run check
    npm start

The API binds to 127.0.0.1:8000 by default. Set HOST and PORT only when needed. Keep the service bound to localhost during development.

## Endpoints

- GET /health — service health.
- POST /api/domain-check — JSON body with a domain field.

Example request:

    curl -X POST http://127.0.0.1:8000/api/domain-check -H "content-type: application/json" -d "{\"domain\":\"example.com\"}"

The endpoint returns DNS A/AAAA, MX and TXT observations, plus TLS certificate metadata where a validated public IPv4 address is available. Results include a retrieval timestamp and limitations.

## Security notes

- Only domain names are accepted; URLs, paths, ports, and IP literals are rejected.
- DNS answers are checked and the request is blocked if any resolved address is non-public or special-use.
- TLS connects directly to a validated IPv4 address while using the domain as SNI, reducing DNS-rebinding exposure.
- The initial version does not fetch page content or follow redirects.
- Request bodies are bounded, responses are marked no-store, and a simple in-memory per-IP rate limit is applied.
- The rate limiter is process-local and resets on restart; it is not a production abuse-control system.
- IPv6 DNS records are reported, but TLS checks currently use validated public IPv4 only.
- DNS and TLS results do not prove that a domain is legitimate or identify its operator.

Before production, add a reviewed authentication strategy if needed, robust distributed rate limiting, structured redacted logging, deployment-level egress controls, monitoring, and broader integration tests. Never commit real provider credentials or investigation records.
