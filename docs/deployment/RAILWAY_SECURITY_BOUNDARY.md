# Railway deployment boundary

## Decision

Railway is the initial prototype deployment target, not an approved production security boundary for domain inspection.

Railway's private networking is useful for service-to-service communication, but it is not a configurable outbound firewall. Static outbound IPs support allowlisting by external services; they do not deny connections to private, link-local, metadata, or other prohibited destinations. A worker deployed in the same Railway project/environment must therefore not be described as network-isolated from the API, database, or platform services.

## Deployment stages

### Stage 0 — safe prototype

- Keep domain inspection disabled on any public deployment.
- Do not configure a public domain-inspection endpoint for untrusted users.
- Use local development for functional testing.
- Do not put production investigation data, real credentials, or sensitive personal data in the prototype.
- Keep the database private; do not publish its TCP port.
- Use Railway-managed secrets for deployment configuration. Never commit environment values.

### Stage 1 — Railway application prototype

Railway may host the web/API prototype and private workspace only after the applicable authentication, authorization, CSRF, database, secret-management, and retention controls have been reviewed.

Domain inspection remains disabled. Deploying the API and a separate worker as two Railway services does not, by itself, satisfy the egress isolation requirement. Do not rely on a separate service name or private hostname as a security boundary.

### Stage 2 — domain inspection behind an enforced egress boundary

Before enabling domain inspection for untrusted traffic, choose an execution environment that can enforce and independently verify outbound network policy. Acceptable designs must provide all of the following:

1. A dedicated inspection runtime with no route to application, database, control-plane, host-management, or cloud metadata networks.
2. Egress deny rules covering IPv4 and IPv6 private, loopback, link-local, CGNAT, special-use, multicast, mapped, transition, and metadata destinations.
3. DNS restricted to approved resolvers.
4. Outbound TCP restricted to the minimum required destination port(s).
5. Connection-time destination validation and IP pinning, with the intended TLS SNI retained.
6. Bounded DNS, connection, TLS handshake, response, concurrency, and total execution time.
7. Deployment-level tests proving prohibited destinations are unreachable from the actual inspection runtime.

A controlled egress proxy or a hosting environment with enforceable network policies may be used, but its policy must be tested from the deployed worker. Application-level IP checks are defense in depth, not a substitute for the network boundary.

## Railway-specific constraints

- Private networking provides connectivity between services; it should not be interpreted as a deny-by-default egress policy.
- Static outbound IPs are for identifying/allowlisting outbound traffic at external destinations. They do not implement destination filtering.
- Do not place the inspection worker in the same private network as sensitive services and then claim it has no path to them.
- If a future design uses an external egress gateway, authenticate worker-to-gateway requests, restrict the gateway API to the one inspection operation, and prevent caller-controlled proxy destinations.

## Release gate

The public `POST /api/domain-check` route must remain unavailable to untrusted traffic until the actual inspection runtime has passed the network-level acceptance tests in [NETWORK_EGRESS_SECURITY.md](../plans/NETWORK_EGRESS_SECURITY.md). A passing repository test suite, a Railway deployment, private networking, or a static outbound IP is not evidence that this gate has passed.

## Cost control

Use a small prototype service and monitor usage from the Railway dashboard. Railway is usage-billed; do not assume the free trial is a permanent free hosting tier. Keep local development as the default until a deployment is needed.
