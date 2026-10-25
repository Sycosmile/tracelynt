# Tracelynt

**Follow the evidence.**

Tracelynt is an evidence-led intelligence and verification workspace for researching public information, documenting findings, and assessing claims with transparent sources and limitations.

> **Status: early development.** The repository contains the product foundation and an initial domain-intelligence API slice. It is not a production-ready lookup service, and no external provider integrations are configured.

## Current implementation

The backend uses Node.js built-in modules and provides:
- Domain normalization and validation.
- DNS A/AAAA, MX, and TXT observations.
- TLS certificate metadata from a validated public IPv4 address.
- A local health endpoint and domain-check endpoint.
- Unit tests for normalization, public-IP guards, and evidence response shape.

See [Backend](backend/README.md) for setup and endpoint details. Run tests with npm from the backend directory.

## Product direction

- Phone-number intelligence based on numbering plans and reviewed providers.
- Public-source research with links to original sources.
- Business and website checks based on appropriately sourced information.
- Evidence correlation with timestamps, source attribution, uncertainty, and correction history.
- Private investigation workspaces and reports with controlled access.

These are product goals, not claims that integrations or data sources already exist.

## Principles

1. Evidence before conclusions: material findings identify source, retrieval time, and limitations.
2. No invented certainty: a number, username, photo, or name match is not proof of identity.
3. Privacy by design: minimize collection, restrict access, and set retention limits.
4. Lawful sources only: no unauthorized telecom subscriber databases, call records, private account access, or live-location tracking.
5. Allegations are not facts: user-submitted scam reports remain unverified unless independently substantiated.
6. Safe failure: unavailable or unverified results must be labelled honestly.
7. Accountability: support corrections, source review, audit logs, and abuse reporting.

## Repository layout

- backend/: initial domain-intelligence API and tests
- frontend/: frontend responsibilities and future implementation notes
- docs/PRODUCT_REQUIREMENTS.md: scope and acceptance criteria
- docs/ARCHITECTURE.md: design and network safeguards
- docs/SECURITY.md: threat model and security baseline
- docs/DATA_GOVERNANCE.md: privacy, data handling, and retention
- docs/ROADMAP.md: phased development plan
- .env.example: placeholder configuration template
- .gitignore: excludes local secrets and investigation data

## Development

Requirements: Node.js 22 or newer. The backend slice uses Node.js built-ins and has no third-party runtime dependencies.

    cd backend
    npm test
    npm run check
    npm start

By default, the API binds to 127.0.0.1:8000. Keep it local during development.

## Responsible-use boundary

Tracelynt is intended for legitimate fraud prevention, security research, business due diligence, and evidence organization. It must not enable stalking, doxxing, harassment, discrimination, unauthorized surveillance, or attempts to obtain protected identity or telecom records.

## Contributions

Changes should explain purpose, data sources, privacy impact, tests, and new security assumptions.

## License

No license has been selected. Do not assume that public availability grants permission to reuse, redistribute, or commercially exploit this repository.
