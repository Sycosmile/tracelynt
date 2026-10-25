# Tracelynt

**Follow the evidence.**

Tracelynt is an evidence-led intelligence and verification workspace for researching public information, documenting findings, and assessing claims with transparent sources and limitations.

> **Status: early prototype.** The repository contains the product foundation, a domain-intelligence API, and a small browser interface. It is not a production-ready lookup service, and no external provider integrations are configured.

## Current implementation

- Domain normalization and input validation.
- DNS A/AAAA, MX, and TXT observations.
- TLS certificate metadata from a validated public IPv4 address.
- Same-origin browser interface served by the backend.
- Explicit frontend asset allowlist, request-size limits, no-store responses, and a basic in-memory rate limit.
- Evidence report builder for business/domain findings with source attribution, review states, timestamps, and explicit limitations.
- JSON export and browser print-to-PDF workflow for generated reports; reports are not stored server-side.
- Tests for domain validation, IP-range guards, report validation, API responses, and static asset serving.
- GitHub Actions workflow for JavaScript syntax checks and automated tests.

See [Backend](backend/README.md) and [Frontend](frontend/README.md) for setup and limitations. Run the test suite with npm from the backend directory.

## Product direction

- Phone-number intelligence based on numbering plans and reviewed providers.
- Public-source research with links to original sources.
- Business and website checks based on appropriately sourced information.
- Analyst-authored evidence reports; official registry/provider integrations remain unconfigured.
- Evidence correlation with timestamps, source attribution, uncertainty, and correction history.
- Private investigation workspaces and reports with controlled access.

The evidence report builder is implemented, but it records author-supplied claims and links only; it does not independently verify source content. Other items remain product goals, not claims that integrations or data sources already exist.

## Principles

1. Evidence before conclusions: material findings identify source, retrieval time, and limitations.
2. No invented certainty: a number, username, photo, or name match is not proof of identity.
3. Privacy by design: minimize collection, restrict access, and set retention limits.
4. Lawful sources only: no unauthorized telecom subscriber databases, call records, private account access, or live-location tracking.
5. Allegations are not facts: user-submitted scam reports remain unverified unless independently substantiated.
6. Safe failure: unavailable or unverified results must be labelled honestly.
7. Accountability: support corrections, source review, audit logs, and abuse reporting.

## Repository layout

- backend/: domain-intelligence and evidence-report API, with tests
- frontend/: responsive domain-inspection interface and evidence report builder
- docs/PRODUCT_REQUIREMENTS.md: scope and acceptance criteria
- docs/ARCHITECTURE.md: design and network safeguards
- docs/SECURITY.md: threat model and security baseline
- docs/DATA_GOVERNANCE.md: privacy, data handling, and retention
- docs/ROADMAP.md: phased development plan
- .env.example: placeholder configuration template
- .gitignore: excludes local secrets and investigation data

## Development

Requirements: Node.js 22 or newer. The API uses Node.js built-ins and has no third-party runtime dependencies.

    cd backend
    npm test
    npm run check
    npm start

Open http://127.0.0.1:8000 after starting the server. Keep the service bound to localhost during development.

## Responsible-use boundary

Tracelynt is intended for legitimate fraud prevention, security research, business due diligence, and evidence organization. It must not enable stalking, doxxing, harassment, discrimination, unauthorized surveillance, or attempts to obtain protected identity or telecom records.

## Contributions

Changes should explain purpose, data sources, privacy impact, tests, and new security assumptions.

## License

No license has been selected. Do not assume that public availability grants permission to reuse, redistribute, or commercially exploit this repository.
