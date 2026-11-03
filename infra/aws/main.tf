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

resource "aws_route_table" "worker" {
  vpc_id = aws_vpc.inspection.id
  tags = {
    Name = "tracelynt-worker-isolated-${var.environment}"
  }
}

resource "aws_route_table_association" "worker" {
  subnet_id      = aws_subnet.worker.id
  route_table_id = aws_route_table.worker.id
}

resource "aws_network_acl" "worker" {
  vpc_id     = aws_vpc.inspection.id
  subnet_ids = [aws_subnet.worker.id]
  tags = {
    Name = "tracelynt-worker-deny-all-${var.environment}"
  }
}

resource "aws_default_security_group" "inspection" {
  vpc_id  = aws_vpc.inspection.id
  ingress = []
  egress  = []
  tags = {
    Name = "tracelynt-default-deny-all-${var.environment}"
  }
}

resource "aws_security_group" "worker" {
  name        = "tracelynt-worker-deny-all-${var.environment}"
  description = "Deny-all placeholder; no worker until egress review."
  vpc_id      = aws_vpc.inspection.id
  ingress     = []
  egress      = []
  tags = {
    Name = "tracelynt-worker-deny-all-${var.environment}"
  }
}

resource "aws_sqs_queue" "inspection_dead_letter" {
  name                      = "tracelynt-inspection-dlq-${var.environment}"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
  lifecycle {
    prevent_destroy = true
  }
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
  lifecycle {
    prevent_destroy = true
  }
  tags = {
    Name = "tracelynt-inspection-jobs-${var.environment}"
  }
}

resource "aws_sqs_queue_redrive_allow_policy" "inspection_dead_letter" {
  queue_url = aws_sqs_queue.inspection_dead_letter.id
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns = [aws_sqs_queue.inspection_jobs.arn]
  })
}

resource "aws_sqs_queue" "inspection_results" {
  name                      = "tracelynt-inspection-results-${var.environment}"
  message_retention_seconds = 345600
  receive_wait_time_seconds = 20
  sqs_managed_sse_enabled   = true
  lifecycle {
    prevent_destroy = true
  }
  tags = {
    Name = "tracelynt-inspection-results-${var.environment}"
  }
}

locals {
  queue_tls_resources = {
    jobs = {
      url = aws_sqs_queue.inspection_jobs.id
      arn = aws_sqs_queue.inspection_jobs.arn
    }
    results = {
      url = aws_sqs_queue.inspection_results.id
      arn = aws_sqs_queue.inspection_results.arn
    }
    dead_letter = {
      url = aws_sqs_queue.inspection_dead_letter.id
      arn = aws_sqs_queue.inspection_dead_letter.arn
    }
  }
}

resource "aws_sqs_queue_policy" "tls_only" {
  for_each  = local.queue_tls_resources
  queue_url = each.value.url
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "sqs:*"
      Resource  = each.value.arn
      Condition = {
        Bool = {
          "aws:SecureTransport" = "false"
        }
      }
    }]
  })
}
