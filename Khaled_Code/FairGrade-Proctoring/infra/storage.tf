terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}
variable "bucket_name" { type = string }
variable "student_origin" { type = string }
variable "instructor_origin" { type = string }
variable "clip_retention_days" {
  type = number
  description = "Team-approved retention period; intentionally no assumed production default."
  validation {
    condition = var.clip_retention_days >= 1 && floor(var.clip_retention_days) == var.clip_retention_days
    error_message = "Retention must be a positive integer number of days."
  }
}
# A NEW dedicated bucket. Do not apply this to Omar's existing bucket without reconciling state and rules.
resource "aws_s3_bucket" "evidence" {
  bucket = var.bucket_name
  force_destroy = false
}
resource "aws_s3_bucket_public_access_block" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  block_public_acls = true
  block_public_policy = true
  ignore_public_acls = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_ownership_controls" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  rule { object_ownership = "BucketOwnerEnforced" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_lifecycle_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  rule {
    id = "proctoring-retention"
    status = "Enabled"
    filter { prefix = "proctoring/" }
    expiration { days = var.clip_retention_days }
    # Also purge old versions if versioning is enabled later; see retention notes.
    noncurrent_version_expiration { noncurrent_days = 1 }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
}
resource "aws_s3_bucket_cors_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  cors_rule {
    allowed_headers = ["Content-Type", "x-amz-checksum-sha256"]
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = distinct([var.student_origin, var.instructor_origin])
    expose_headers = ["ETag"]
    max_age_seconds = 300
  }
}
resource "aws_s3_bucket_policy" "tls" {
  bucket = aws_s3_bucket.evidence.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid = "DenyInsecureTransport"
      Effect = "Deny"
      Principal = "*"
      Action = "s3:*"
      Resource = [aws_s3_bucket.evidence.arn, "${aws_s3_bucket.evidence.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}
output "bucket_name" { value = aws_s3_bucket.evidence.id }
