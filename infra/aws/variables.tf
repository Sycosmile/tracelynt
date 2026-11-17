variable "environment" {
  description = "Deployment environment used in resource names and tags."
  type        = string
  default     = "dev"

  validation {
    condition     = can(regex("^[a-z0-9-]{2,12}$", var.environment))
    error_message = "environment must be 2-12 lowercase letters, digits, or hyphens."
  }
}

variable "availability_zone" {
  description = "Explicit single Availability Zone for this initial, non-HA foundation."
  type        = string
  nullable    = false

  validation {
    condition     = length(trimspace(var.availability_zone)) > 0
    error_message = "availability_zone must be selected for the chosen AWS region."
  }
}

variable "vpc_cidr" {
  description = "Dedicated CIDR block for the isolated inspection VPC."
  type        = string
  default     = "10.40.0.0/16"

  validation {
    condition     = can(cidrnetmask(var.vpc_cidr))
    error_message = "vpc_cidr must be a valid IPv4 CIDR block."
  }
}

variable "worker_subnet_cidr" {
  description = "Private subnet reserved for future inspection workers."
  type        = string
  default     = "10.40.10.0/24"

  validation {
    condition     = can(cidrnetmask(var.worker_subnet_cidr))
    error_message = "worker_subnet_cidr must be a valid IPv4 CIDR block."
  }
}
