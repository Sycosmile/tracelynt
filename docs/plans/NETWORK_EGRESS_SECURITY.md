# Network egress hardening for domain inspection

## Current state
The domain inspector validates DNS answers and connects to a validated public IPv4 address for TLS. Application checks are necessary but insufficient: DNS rebinding, resolver behavior, route changes and deployment-level network access require defense in depth.

## Hosting decision required
Concrete enforcement depends on the hosting target, container runtime, DNS resolver and network policy system. Do not add guessed firewall rules or claim isolation without testing the actual deployment.

## Required controls
- Run inspection in a dedicated network boundary with no route to private application, database, control-plane or metadata networks.
- Deny loopback, RFC1918, link-local, carrier-grade NAT, IPv6 ULA, IPv6 link-local, special-use, multicast and metadata destinations at egress.
- Allow DNS only to approved resolvers and the minimum outbound TCP destination/port required for TLS.
- Do not introduce redirects or arbitrary URL fetching without a separate threat review.
- Pin the validated destination address for the outbound connection and preserve intended TLS SNI.
- Revalidate addresses at connection time and handle resolver changes safely.
- Apply connection, handshake, response, concurrency and total execution limits.
- Log policy decisions without unnecessary user-supplied personal data.

## Acceptance tests
- A test worker cannot reach private IPv4/IPv6 hosts, host services, database ports, container control sockets or cloud metadata endpoints.
- DNS answers changing between validation and connection cannot route traffic to prohibited targets.
- IPv4-mapped IPv6 and transition/translation ranges are covered.
- Only expected outbound protocols and ports are permitted.
- Policy behavior is tested in the actual deployment environment.

## Release gate
Do not expose domain inspection to untrusted public traffic until network policy is deployed and independently verified. Repository-level tests alone do not satisfy this gate.
