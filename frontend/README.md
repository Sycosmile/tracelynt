# Frontend

The interface is a dependency-free, responsive HTML/CSS/JavaScript application served by the backend from the same origin.

## Run the public prototype

Requirements: Node.js 22 or newer. You do not need Docker or PostgreSQL to explore the domain-inspection interface and non-persistent report builder.

From the repository root:

    cd backend
    npm install
    npm start

Open http://127.0.0.1:8000. The interface sends domain checks to the local API. The backend serves only an explicit allowlist of frontend assets; do not open `index.html` directly from the filesystem.

## Current screen

- Domain input and loading/error states.
- DNS A, AAAA, MX, and TXT observations.
- TLS certificate metadata.
- Retrieval timestamp and explicit limitations.
- Business/domain evidence report builder with source attribution, analyst notes, and review states.
- JSON export and browser print-to-PDF workflow for generated reports.
- Sign-in state and private case workspace interface.
- Case/evidence management, saved report versions, audited export, and deletion-request controls when the database and authentication provider are configured.
- Responsive layout and accessible status announcements.

## Security requirements

- Values from the API are inserted with `textContent`, not interpreted as HTML.
- No third-party scripts, analytics, or client-side secrets.
- The browser does not fetch the submitted domain directly; the backend performs bounded DNS/TLS checks.
- Static asset routes are explicitly allowlisted.
- Do not treat the results as proof of legitimacy or operator identity.
- The application is a development prototype, not production-ready.

## Database-backed features

Domain inspection and the non-persistent report builder can run without PostgreSQL. The private workspace requires a reachable PostgreSQL database, applied migrations, and a configured OIDC provider for real sign-in. Without those settings, authentication and case features are unavailable; this is expected for a partial local setup.

The report builder collects analyst-supplied claims and HTTPS source links, then asks the API to normalize them into a timestamped report. It does not fetch the linked pages, verify a business against a registry, or save that report. The exported JSON and print output state those limitations. Reports may contain sensitive case material, so store exports securely and include only information needed for the stated purpose.
