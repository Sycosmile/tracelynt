# AWS inspection foundation

This Terraform root defines an intentionally incomplete, isolated foundation:

- A dedicated VPC and one private subnet reserved for future inspection workers.
- An explicit route table with no internet, NAT, peering, or transit routes.
- A deny-all network ACL and deny-all security groups for the worker subnet.
- Encrypted SQS job, result, and dead-letter queues.
- SQS policies that reject non-TLS requests and restrict dead-letter redrive to the jobs queue.

## Deliberate limitations

This is **not a deployable inspection service**. There is no ECS service, task role, Railway integration, NAT Gateway, Internet Gateway, VPC peering, Transit Gateway, Network Firewall, public route, or worker runtime. The subnet has no internet route; its network ACL and security groups deny all traffic. No VPC endpoints are configured, so workloads cannot reach SQS or other AWS APIs from this subnet.

The queues are not accessible to Railway or a worker through this configuration. Queue policies explicitly deny requests that do not use TLS and do not add allow permissions. Do not add long-lived AWS keys to the repository. Review Railway-to-AWS authentication, scoped IAM, endpoint policies, and result delivery before enabling queue access.

## Security invariants

- Worker subnet is associated with an explicit route table containing only the VPC-local route.
- Worker and default security groups have no ingress or egress rules.
- Worker subnet is associated with a network ACL with no allow rules.
- SQS queues use SQS-managed encryption, reject non-TLS API requests, and have Terraform deletion protection.
- Only the jobs queue may use the configured dead-letter queue.

These controls intentionally make the foundation unusable for live inspection until a separate change defines narrowly scoped VPC endpoints, task identity, logging, and result delivery. Do not weaken deny-all controls merely to make a test workload function.

## Before planning or applying

1. Select an AWS region after reviewing latency, data-residency requirements, and regional service availability.
2. Select an Availability Zone in that region; this initial layout is single-AZ and not highly available.
3. Review CIDR blocks for overlap with networks that may later be connected.
4. Copy `terraform.tfvars.example` to an ignored local `terraform.tfvars` and replace both placeholders.
5. Run `terraform fmt -check -recursive`, `terraform init -backend=false`, and `terraform validate`.
6. Review a saved plan and current AWS pricing before any apply.

## State and secrets

Terraform state can contain infrastructure metadata and must not be committed. This foundation has no remote state backend. Before shared or production use, configure an encrypted remote state backend with locking and tightly scoped access. Never place AWS access keys in Terraform variables or source control.

## Cost and deployment boundary

CI validation does not create AWS resources. **Do not run `terraform apply` without a separate explicit budget and deployment approval.** SQS usage and other AWS charges depend on account pricing and free-tier eligibility. NAT Gateway, Network Firewall, and compute are deliberately omitted because they can incur ongoing charges.
