# Frontend

The first interface is a dependency-free, responsive HTML/CSS/JavaScript prototype served by the backend from the same origin.

## Run

Use Node.js 22 or newer. From the repository root:

    cd backend
    npm start

Open http://127.0.0.1:8000 in a browser. The interface sends domain checks to the local API. The backend serves only an explicit allowlist of frontend assets; do not open index.html directly from the filesystem.

## Current screen

- Domain input and loading/error states.
- DNS A, AAAA, MX, and TXT observations.
- TLS certificate metadata.
- Retrieval timestamp and explicit limitations.
- Responsive layout and accessible status announcements.

## Security requirements

- Values from the API are inserted with textContent, not interpreted as HTML.
- No third-party scripts, analytics, or client-side secrets.
- The browser does not fetch the submitted domain directly; the backend performs bounded DNS/TLS checks.
- Static asset routes are explicitly allowlisted.
- Do not treat the results as proof of legitimacy or operator identity.
- Authentication, private case workspaces, report export, and production hardening are not implemented yet.

This is a prototype, not a production-ready application.
