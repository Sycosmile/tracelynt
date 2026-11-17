variable "aws_region" {
  description = "AWS region selected after latency, data-residency, and cost review."
  type        = string
  nullable    = false

  validation {
    condition     = length(trimspace(var.aws_region)) > 0
    error_message = "aws_region must be a non-empty AWS region."
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Tracelynt"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Component   = "Inspection"
    }
  }
}
