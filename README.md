# Tracelynt

**Follow the evidence.**

Tracelynt is a planned evidence-led intelligence and verification workspace for researching public information, documenting findings, and assessing claims with transparent sources and limitations.

> **Status: early foundation.** This repository defines product direction and engineering guardrails. It is not a functioning lookup service, and this documentation does not claim that integrations or data sources exist.

## Product direction

- **Phone-number intelligence:** normalize numbers and identify numbering region; show carrier or line-type data only when an approved provider supports it.
- **Public-source research:** organize lawfully accessible information with links to original sources.
- **Business and website checks:** review public business details, domains, DNS/TLS signals, and other appropriately sourced indicators.
- **Evidence correlation:** record timestamps, separate facts from allegations, and explain confidence and uncertainty.
- **Investigation workspaces:** save notes and source references with controlled access.
- **Exportable reports:** include sources, retrieval timestamps, caveats, and correction history where applicable.

## Principles

1. Evidence before conclusions: material findings identify source, retrieval time, and limitations.
2. No invented certainty: a number, username, photo, or name match is not proof of identity.
3. Privacy by design: minimize collection, restrict access, and set retention limits.
4. Lawful sources only: no unauthorized telecom subscriber databases, call records, private account access, or live-location tracking.
5. Allegations are not facts: user-submitted scam reports remain unverified unless independently substantiated.
6. Safe failure: unavailable or unverified results must be labelled honestly.
7. Accountability: support corrections, source review, audit logs, and abuse reporting.

## Proposed architecture

- **Frontend:** TypeScript web client for searches, case workspaces, and reports.
- **Backend API:** authentication, authorization, validation, provider orchestration, evidence records, and reporting.
- **Provider adapters:** isolated integrations for numbering metadata, domain/DNS/TLS checks, and approved public sources.
- **Persistence:** relational records for users, cases, findings, source metadata, and audit events.
- **Operations:** bounded background jobs, structured logs, quotas, and monitoring without leaking sensitive query values.

See [Product Requirements](docs/PRODUCT_REQUIREMENTS.md), [Architecture](docs/ARCHITECTURE.md), [Security](docs/SECURITY.md), [Data Governance](docs/DATA_GOVERNANCE.md), and [Roadmap](docs/ROADMAP.md).

## Repository layout

- docs/: product requirements, architecture, security, governance, roadmap
- frontend/: frontend boundary and future implementation notes
- backend/: backend boundary and future implementation notes
- .env.example: placeholder configuration template
- .gitignore: excludes local secrets and investigation data

## Development status

There is no application code or dependency manifest yet. The next step is to select a stack and implement a small, tested vertical slice.

When code is added:
1. Use synthetic or explicitly authorized test data.
2. Keep real credentials in an untracked local environment file or secret manager.
3. Never commit real investigation records or provider payloads containing personal data.
4. Run tests and security checks before proposing changes.

## Responsible-use boundary

Tracelynt is intended for legitimate fraud prevention, security research, business due diligence, and evidence organization. It must not enable stalking, doxxing, harassment, discrimination, unauthorized surveillance, or attempts to obtain protected identity or telecom records.

## Contributions

Changes should explain purpose, data sources, privacy impact, tests, and new security assumptions.

## License

No license has been selected. Do not assume that public availability grants permission to reuse, redistribute, or commercially exploit this repository.