# Production OIDC provider verification

## Current state
The application has a provider-neutral OIDC flow, but no production issuer or client credentials are selected. Passing unit tests does not establish a successful real-provider login.

## Provider selection gate
Before configuration, record the provider, issuer URL, supported account lifecycle, MFA policy, recovery process, data-processing terms, region, support owner, and offboarding procedure. Do not commit client secrets.

## Configuration checklist
- Register the exact HTTPS callback URI for the deployed origin.
- Use a confidential client with minimum required scopes.
- Store client credentials and AUTH_SECRET in the deployment secret manager.
- Confirm issuer discovery metadata and signing-key rotation behavior.
- Verify issuer, audience/client ID, nonce, state, PKCE S256, and one-time transaction behavior.
- Confirm secure host-only cookies, HTTPS, CSRF, session expiry/revocation, and logout.
- Ensure disabled/deletion-pending users cannot create sessions.
- Ensure tokens and claims are not leaked through logs or errors.

## End-to-end acceptance
Test successful login; invalid state, nonce, issuer, audience, signature and PKCE; replayed/expired callbacks; provider outage and key rotation; disabled accounts; deletion; logout; and revocation against a dedicated synthetic test tenant.

## Release gate
Production login remains unapproved until a provider is selected, configured, tested end-to-end, and reviewed for security and privacy.
