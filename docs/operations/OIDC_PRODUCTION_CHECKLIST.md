# Production OIDC configuration checklist

## Status

Tracelynt contains a configurable OpenID Connect authorization-code flow, but no production identity provider has been selected or verified. This checklist does not approve a provider or establish production readiness.

The current backend uses discovery from `OIDC_ISSUER`, a confidential client ID/secret, state, nonce, PKCE, a browser-binding cookie, a one-time database login transaction, and opaque server-side sessions. The current session lifetime is 12 hours and the login transaction lifetime is 10 minutes.

## Provider selection

Before creating production credentials, record and review:

- Provider legal entity, security posture, service availability, support and incident-notification commitments.
- Data-processing terms, processing locations, subprocessors, cross-border transfers, retention, deletion, and account offboarding.
- Account recovery, MFA enforcement, administrator access, and recovery-channel security.
- Issuer stability, discovery metadata, signing-key rotation, token validation behavior, and supported logout/revocation options.
- Whether the provider's terms and account model fit the intended user population and jurisdictions.

Do not choose a provider solely because its free tier is available.

## Application registration

Register a confidential web application. Configure the exact HTTPS redirect URI:

`https://<approved-app-origin>/auth/callback`

The URI must match the deployed `APP_BASE_URL` origin and callback path exactly. Do not use wildcard callback URLs or a callback on an untrusted preview domain.

Request only the scopes the application needs. The current implementation requests `openid email`; do not add profile or other scopes without a documented purpose and review.

## Secret and environment configuration

Set these values through the deployment secret manager, not committed files:

- `APP_BASE_URL`: canonical HTTPS application origin, with no path, query, fragment, or credentials.
- `OIDC_ISSUER`: exact trusted issuer URL published by the selected provider.
- `OIDC_CLIENT_ID`: confidential client identifier.
- `OIDC_CLIENT_SECRET`: secret generated and managed by the provider.
- `AUTH_SECRET`: at least 32 bytes, generated uniquely for this deployment and stored as a secret.
- `DATABASE_URL`: private PostgreSQL connection string with least-privilege credentials.

Production rejects non-HTTPS application origins and non-HTTPS OIDC issuers. Do not copy local-development values from `.env.example` into production.

## Pre-release verification

- [ ] Confirm the registered callback URI exactly matches the deployed origin and `/auth/callback`.
- [ ] Confirm the issuer and discovery metadata over HTTPS.
- [ ] Confirm the client is confidential and its secret is stored outside source control.
- [ ] Verify state, nonce, PKCE, browser binding, and one-time login transaction behavior.
- [ ] Verify invalid issuer, signature, audience, nonce, state, PKCE, expired transaction, and replay attempts are rejected.
- [ ] Verify signing-key rotation and provider discovery/token endpoint outage behavior.
- [ ] Verify suspended and deletion-pending accounts cannot establish sessions.
- [ ] Verify session cookies are Secure, HttpOnly, SameSite=Lax, and host-only in production.
- [ ] Verify logout revokes the server-side session and clears both authentication cookies.
- [ ] Verify CSRF checks on every state-changing authenticated route.
- [ ] Verify account recovery and MFA policy at the provider, not only in application code.
- [ ] Verify provider account offboarding and secret rotation procedures.
- [ ] Complete privacy/legal review and record the approved provider and configuration owner.

## Operational response

Document who can rotate the client secret, how to respond to issuer/discovery/signing-key outages, how to revoke sessions after a provider or credential incident, and how to disable new login without making existing account data public.

A successful local test or passing CI run does not verify the provider's production configuration. Keep production sign-in disabled until the selected provider has been configured and the full checklist has been tested in the deployed environment.
