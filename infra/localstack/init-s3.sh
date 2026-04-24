#!/bin/bash
# infra/localstack/init-s3.sh
# Runs inside LocalStack on startup to create the dev S3 bucket.
# This script is mounted at /etc/localstack/init/ready.d/

set -e

echo "Creating HouseMind dev S3 bucket..."

awslocal s3api create-bucket \
  --bucket housemind-dev-bucket \
  --region ap-southeast-1 \
  --create-bucket-configuration LocationConstraint=ap-southeast-1 \
  2>/dev/null || echo "Bucket already exists, skipping"

awslocal s3api put-bucket-cors \
  --bucket housemind-dev-bucket \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedOrigins": ["http://localhost:3000"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }]
  }'

echo "S3 bucket ready: housemind-dev-bucket (ap-southeast-1)"
