# AWS SES Email Receiving Setup Guide

## Overview

This document outlines the complete setup process for AWS SES email receiving with S3 storage and Lambda processing for the Inbound project.

## Architecture Decision: Single Lambda vs Multiple Lambdas

**Recommendation: Use a Single Lambda Function**

### Why Single Lambda?
- **Cost Efficiency**: Reduces cold starts and resource overhead
- **Maintainability**: Single codebase with routing logic is easier to manage
- **Scalability**: Lambda can efficiently handle multiple email addresses
- **AWS Best Practices**: Recommended approach for better resource utilization
- **Simplified Monitoring**: Centralized logging and metrics

### Architecture Flow

```
Email → SES → S3 Bucket → Lambda Function → Your Service API
                ↓
            SNS Notification (optional)
```

## Prerequisites

### 1. Regional Requirements
- AWS SES email receiving is only available in specific regions:
  - US East (N. Virginia) - us-east-1
  - US West (Oregon) - us-west-2  
  - Europe (Ireland) - eu-west-1

### 2. Domain Verification
- Domain must be verified in SES
- DKIM authentication must be configured
- SPF records should be set up

### 3. MX Record Configuration
Add MX record to your domain's DNS:
```
Priority: 10
Value: inbound-smtp.[region].amazonaws.com
```
Example for us-west-2:
```
10 inbound-smtp.us-west-2.amazonaws.com
```

## Setup Steps

### Step 1: Create S3 Bucket for Email Storage

1. Create S3 bucket in the same region as SES
2. Apply bucket policy to allow SES to write emails:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSESPuts",
      "Effect": "Allow",
      "Principal": {
        "Service": "ses.amazonaws.com"
      },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::your-bucket-name/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceAccount": "YOUR_AWS_ACCOUNT_ID",
          "AWS:SourceArn": "arn:aws:ses:REGION:YOUR_AWS_ACCOUNT_ID:receipt-rule-set/RULE_SET_NAME:receipt-rule/RULE_NAME"
        }
      }
    }
  ]
}
```

### Step 2: Create Lambda Function

1. Create Lambda function in the same region as SES
2. Configure execution role with permissions:
   - S3 read access to email bucket
   - CloudWatch Logs write access
   - Any additional permissions for your service integration

3. Lambda resource-based policy (automatically added by SES):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ses.amazonaws.com"
      },
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:FUNCTION_NAME",
      "Condition": {
        "StringEquals": {
          "AWS:SourceAccount": "YOUR_AWS_ACCOUNT_ID"
        }
      }
    }
  ]
}
```

### Step 3: Create SES Receipt Rule Set

1. **Create Rule Set**:
   - Navigate to SES Console → Email Receiving → Rule Sets
   - Create new rule set
   - Set as active rule set

2. **Create Receipt Rule**:
   - Add recipient conditions (email addresses or domains)
   - Configure actions in order:
     1. **S3 Action**: Store email in S3 bucket
     2. **Lambda Action**: Trigger processing function (asynchronous)

### Step 4: Configure Receipt Rule Actions

#### S3 Action Configuration:
- **Bucket**: Your email storage bucket
- **Object Key Prefix**: `emails/` (optional, for organization)
- **Encryption**: Use AWS managed key (aws/ses) or custom KMS key
- **SNS Topic**: Optional notification topic

#### Lambda Action Configuration:
- **Function**: Your email processing Lambda
- **Invocation Type**: Event (asynchronous) - recommended
- **SNS Topic**: Optional notification topic

## Email Processing Flow

### 1. Email Reception Process
1. Email arrives at SES
2. IP address filtering (if configured)
3. Recipient condition matching
4. Spam/virus scanning
5. Authentication checks (SPF, DKIM, DMARC)
6. Rule actions execution

### 2. Lambda Event Structure
```json
{
  "Records": [
    {
      "eventSource": "aws:ses",
      "eventVersion": "1.0",
      "ses": {
        "receipt": {
          "timestamp": "2023-01-01T12:00:00.000Z",
          "processingTimeMillis": 100,
          "recipients": ["user@example.com"],
          "spamVerdict": {"status": "PASS"},
          "virusVerdict": {"status": "PASS"},
          "spfVerdict": {"status": "PASS"},
          "dkimVerdict": {"status": "PASS"},
          "dmarcVerdict": {"status": "PASS"},
          "action": {
            "type": "S3",
            "bucketName": "your-bucket",
            "objectKey": "emails/messageId"
          }
        },
        "mail": {
          "timestamp": "2023-01-01T12:00:00.000Z",
          "messageId": "unique-message-id",
          "source": "sender@example.com",
          "destination": ["user@example.com"],
          "commonHeaders": {
            "from": ["sender@example.com"],
            "to": ["user@example.com"],
            "subject": "Email Subject"
          }
        }
      }
    }
  ]
}
```

## Security Best Practices

### 1. IAM Permissions
- Use least privilege principle
- Separate roles for SES, Lambda, and S3
- Regular permission audits

### 2. Encryption
- Enable S3 bucket encryption
- Use KMS keys for sensitive data
- Encrypt data in transit

### 3. Monitoring
- CloudWatch metrics for SES receipt rules
- Lambda function monitoring
- S3 access logging

### 4. Spam/Virus Protection
- Enable SES spam and virus scanning
- Implement additional filtering in Lambda
- Monitor authentication results

## Monitoring and Alerting

### CloudWatch Metrics to Monitor:
- `SES/Receipt/Received`
- `SES/Receipt/PublishSuccess`
- `SES/Receipt/PublishFailure`
- `Lambda/Duration`
- `Lambda/Errors`
- `Lambda/Throttles`

### Recommended Alarms:
- Lambda function errors > 5% error rate
- SES receipt rule failures
- S3 bucket access denied errors
- High email volume spikes

## Cost Optimization

### 1. Email Size Limits
- S3 storage: 40 MB max per email
- SNS notifications: 150 KB max per email
- Consider email size when choosing storage method

### 2. Lambda Optimization
- Right-size memory allocation
- Minimize cold starts with provisioned concurrency (if needed)
- Use asynchronous invocation when possible

### 3. S3 Storage Classes
- Use S3 Intelligent Tiering for automatic cost optimization
- Implement lifecycle policies for old emails
- Consider S3 Glacier for long-term archival

## Troubleshooting

### Common Issues:
1. **Access Denied Errors**: Check S3 bucket policy and IAM permissions
2. **Lambda Not Triggered**: Verify SES rule configuration and Lambda permissions
3. **Email Not Stored**: Check S3 bucket policy and SES rule actions
4. **High Latency**: Optimize Lambda function and consider provisioned concurrency

### Debugging Steps:
1. Check CloudWatch logs for Lambda function
2. Verify SES receipt rule metrics
3. Test with simple email first
4. Use SES message events for tracking

## Limits and Quotas

- **Receipt Rules per Rule Set**: 200 maximum
- **Rule Sets per Account**: 20 maximum
- **Email Size**: 40 MB maximum (S3), 150 KB (SNS)
- **Lambda Timeout**: 15 minutes maximum
- **Concurrent Executions**: Account-level Lambda limits apply

## Next Steps

1. Implement the AWS SES library (`lib/aws-ses.ts`)
2. Create Lambda function using the library
3. Set up monitoring and alerting
4. Test with sample emails
5. Deploy to production with proper IAM roles

## References

- [AWS SES Email Receiving Documentation](https://docs.aws.amazon.com/ses/latest/dg/receiving-email.html)
- [AWS SES Permissions Guide](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-permissions.html)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html) 