resource "aws_vpc" "inspection" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "tracelynt-inspection-${var.environment}"
  }
}

resource "aws_subnet" "worker" {
  vpc_id                  = aws_vpc.inspection.id
  availability_zone       = var.availability_zone
  cidr_block              = var.worker_subnet_cidr
  map_public_ip_on_launch = false

  tags = {
    Name = "tracelynt-worker-private-${var.environment}"
    Tier = "private"
  }
}

resource "aws_sqs_queue" "inspection_dead_letter" {
  name                      = "tracelynt-inspection-dlq-${var.environment}"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true

  tags = {
    Name = "tracelynt-inspection-dlq-${var.environment}"
  }
}

resource "aws_sqs_queue" "inspection_jobs" {
  name                       = "tracelynt-inspection-jobs-${var.environment}"
  message_retention_seconds  = 345600
  visibility_timeout_seconds = 120
  receive_wait_time_seconds  = 20
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.inspection_dead_letter.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "tracelynt-inspection-jobs-${var.environment}"
  }
}

resource "aws_sqs_queue" "inspection_results" {
  name                      = "tracelynt-inspection-results-${var.environment}"
  message_retention_seconds = 345600
  receive_wait_time_seconds = 20
  sqs_managed_sse_enabled   = true

  tags = {
    Name = "tracelynt-inspection-results-${var.environment}"
  }
}
