output "vpc_id" {
  description = "ID of the isolated inspection VPC."
  value       = aws_vpc.inspection.id
}
output "worker_subnet_id" {
  description = "Private subnet reserved for future inspection workers."
  value       = aws_subnet.worker.id
}
output "worker_security_group_id" {
  description = "Deny-all security group reserved for future workers."
  value       = aws_security_group.worker.id
}
output "worker_route_table_id" {
  description = "Route table associated with the worker subnet."
  value       = aws_route_table.worker.id
}
output "inspection_jobs_queue_url" {
  description = "URL of the inspection job queue."
  value       = aws_sqs_queue.inspection_jobs.url
}
output "inspection_jobs_queue_arn" {
  description = "ARN of the inspection job queue."
  value       = aws_sqs_queue.inspection_jobs.arn
}
output "inspection_results_queue_url" {
  description = "URL of the inspection result queue."
  value       = aws_sqs_queue.inspection_results.url
}
output "inspection_results_queue_arn" {
  description = "ARN of the inspection result queue."
  value       = aws_sqs_queue.inspection_results.arn
}
output "inspection_dead_letter_queue_arn" {
  description = "ARN of the inspection dead-letter queue."
  value       = aws_sqs_queue.inspection_dead_letter.arn
}
