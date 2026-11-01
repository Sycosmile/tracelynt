# AWS inspection foundation

This Terraform root defines only the initial, isolated foundation:

- A dedicated VPC with DNS support.
- One private subnet reserved for future Fargate workers.
- Encrypted SQS job and result queues.
- A dead-letter queue for jobs that repeatedly fail.

## Deliberate limitations

This is **not a deployable inspection service yet**. There is no ECS service, task role, Railway integration, NAT Gateway, Internet Gateway, Network Firewall, public route, or worker security group. The subnet has no route to the internet. This fail-closed starting point avoids accidentally giving a future worker unrestricted outbound access.

The SQS queues are not yet accessible to Railway or a worker. Do not add long-lived AWS keys to the repository. The Railway-to-AWS authentication and result-delivery design must be reviewed before queue policies or IAM permissions are added.

## Before planning or applying

1. Select an AWS region after reviewing latency, data-residency requirements, and regional service availability.
2. Select an Availability Zone in that region. This initial layout is single-AZ and is not highly available.
3. Review the CIDR blocks for overlap with any networks that may later be connected.
4. Copy `terraform.tfvars.example` to an ignored local `terraform.tfvars` and replace both placeholders.
5. Run `terraform fmt -check -recursive`, `terraform init -backend=false`, and `terraform validate`.
6. Review a saved plan and current AWS pricing before any apply.

## State and secrets

Terraform state can contain infrastructure metadata and must not be committed. This foundation does not configure a remote state backend. Before a shared or production deployment, configure a dedicated encrypted remote state backend with locking and tightly scoped access. Never place AWS access keys in Terraform variables or source control.

## Cost

The configuration deliberately omits hourly-billed NAT Gateway, Network Firewall, and compute resources. SQS usage and other AWS charges are still subject to the selected account's pricing and free-tier eligibility. A successful validation does not create resources; `terraform apply` does.
