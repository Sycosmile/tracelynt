# Security Baseline

## Status

This document defines requirements for future implementation. It does not mean the repository or a deployed application has been security-tested. Do not publish sensitive vulnerability details or real personal records in public issues.

## Threat model

Assets: credentials and sessions, private cases and search history, provider keys and quotas, reports, audit records, and application integrity.

Threat actors: unauthenticated users, authenticated users attempting cross-user access, abusive users, malicious providers, attackers supplying crafted inputs, and compromised insiders or credentials.

Primary risks: broken object-level authorization, SSRF, injection and unsafe rendering, secret leakage, quota abuse and enumeration, misleading identity matches, unsubstantiated allegations, excessive retention, and supply-chain compromise.

## Minimum controls before public deployment

### Identity and access
- Use a maintained authentication library or identity provider.
- Check authorization server-side for every private object.
- Use secure session settings and CSRF protections where applicable.
- Rate-limit authentication and sensitive actions.
- Support safe session revocation and account recovery.

### Input and network
- Validate inputs with explicit schemas and normalize them.
- Parameterize database queries.
- Treat provider data, source pages, reports, and uploads as untrusted.
- Apply SSRF controls documented in ARCHITECTURE.md.
- Restrict outbound access and prohibit arbitrary proxying.
- Set request, response-size, and execution-time limits.

### Secrets and dependencies
- Commit placeholders only; never real API keys or tokens.
- Keep local environment files out of version control.
- Use least-privilege provider credentials and rotate exposed secrets.
- Enable dependency review, lockfiles, secret scanning, and vulnerability alerts.

### Data protection
- Collect only information necessary for a defined purpose.
- Apply retention deadlines and deletion workflows.
- Redact personal data from logs unless strictly necessary.
- Encrypt traffic in transit and use managed storage encryption where available.
- Restrict report downloads and expire stored export links.
- Exclude private data from analytics, traces, and error reports.

### Abuse prevention
- Do not support private subscriber lookup, call/SMS history, or live-location tracking without a separately reviewed lawful and authorized integration.
- Prevent bulk enumeration of phone numbers or people.
- Apply proportionate per-account, per-IP, and per-provider limits.
- Provide abuse reporting, correction, dispute, and review channels.
- Do not label someone a scammer based solely on a user report or weak signal.
- Review high-risk feature requests for legal, privacy, and abuse implications.

## Evidence integrity

Record source references and retrieval times. Separate direct observations from analyst conclusions. Preserve correction/retraction history where appropriate. Record who created or changed a finding. Never treat OTP control as legal identity or original ownership. Do not merge identities from one shared attribute.

## Security test checklist

- [ ] Authentication and session handling reviewed.
- [ ] Cross-user and cross-case authorization tests pass.
- [ ] Input validation and injection tests pass.
- [ ] SSRF tests cover private/reserved IPs, redirects, DNS rebinding, IPv6, and metadata endpoints.
- [ ] Rate limits and quotas are tested.
- [ ] Logs and errors are checked for secrets and personal data.
- [ ] Dependency and secret scans run in CI.
- [ ] Export access, expiry, and deletion are tested.
- [ ] Backup restoration and incident-response procedures are documented.
- [ ] Abuse-report and correction workflows are tested.

## Vulnerability reporting

Do not publish sensitive vulnerability details or personal records in public issues. Configure a dedicated security contact and reporting channel before production release.