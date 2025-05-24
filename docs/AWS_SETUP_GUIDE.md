# AWS SES Email Receiving Setup Guide

## Overview

This guide walks you through setting up AWS SES (Simple Email Service) to receive emails and process them through a serverless pipeline. The architecture consists of:

1. **AWS SES** - Receives incoming emails
2. **Amazon S3** - Temporarily stores email content
3. **AWS Lambda** - Processes emails and forwards to client endpoints
4. **Amazon CloudWatch** - Monitoring and alerts

## Prerequisites

- AWS Account (brand new is fine)
- Domain name you control (for receiving emails)
- AWS CLI installed and configured
- Node.js 18+ and npm/bun installed
- Basic understanding of AWS services

## Architecture Overview

```
[Email Sender] → [AWS SES] → [S3 Bucket] → [Lambda Function] → [Client Endpoint]
                                ↓
                        [CloudWatch Logs/Metrics]
```

## AWS Service Limits

### Email Receiving Quotas
- **Maximum email size in S3**: 40 MB (including headers)
- **Maximum receipt rules per rule set**: 200
- **Maximum actions per receipt rule**: 10
- **Maximum recipients per receipt rule**: 500
- **Regions supporting email receiving**: Limited (check AWS docs)

## Setup Steps

### 1. Choose AWS Region

Email receiving is only available in certain AWS regions:
- US East (N. Virginia) - `us-east-1`
- US West (Oregon) - `us-west-2`
- EU (Ireland) - `eu-west-1`

Choose your region and ensure all resources are created in the same region.

### 2. Domain Verification

#### 2.1 Verify Domain in SES
```bash
# Using AWS CLI
aws ses verify-domain-identity --domain yourdomain.com --region us-east-1
```

#### 2.2 Add DNS Records
Add the following DNS records to your domain:

**TXT Record for Domain Verification:**
- Name: `_amazonses.yourdomain.com`
- Value: (provided by AWS after verification request)

**MX Record for Email Receiving:**
- Name: `@` or subdomain (e.g., `inbound`)
- Priority: 10
- Value: `inbound-smtp.[region].amazonaws.com`

Example for us-east-1:
```
10 inbound-smtp.us-east-1.amazonaws.com
```

**DKIM Records (3 CNAME records):**
AWS will provide 3 CNAME records for DKIM authentication.

### 3. Create S3 Bucket for Email Storage

```bash
# Create bucket
aws s3 mb s3://inbound-emails-[your-account-id] --region us-east-1

# Create lifecycle policy to delete emails after 24 hours
cat > lifecycle.json << EOF
{
    "Rules": [
        {
            "Id": "DeleteEmailsAfter24Hours",
            "Status": "Enabled",
            "Prefix": "emails/",
            "Expiration": {
                "Days": 1
            }
        }
    ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
    --bucket inbound-emails-[your-account-id] \
    --lifecycle-configuration file://lifecycle.json
```

### 4. Create S3 Bucket Policy

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
            "Resource": "arn:aws:s3:::inbound-emails-[your-account-id]/*",
            "Condition": {
                "StringEquals": {
                    "AWS:SourceAccount": "[your-account-id]"
                },
                "StringLike": {
                    "AWS:SourceArn": "arn:aws:ses:*"
                }
            }
        }
    ]
}
```

### 5. Create IAM Role for Lambda

Create a role with the following trust policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

Attach the following inline policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws:logs:*:*:*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:DeleteObject"
            ],
            "Resource": "arn:aws:s3:::inbound-emails-[your-account-id]/*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "ses:SendEmail",
                "ses:SendRawEmail"
            ],
            "Resource": "*"
        }
    ]
}
```

### 6. Deploy Lambda Function

The Lambda function code is in the `/aws` folder of this project. Deploy using AWS CDK:

```bash
cd aws
npm install
npx cdk bootstrap
npx cdk deploy
```

### 7. Create SES Receipt Rule Set

```bash
# Create rule set
aws ses create-receipt-rule-set \
    --rule-set-name inbound-email-rules \
    --region us-east-1

# Create receipt rule
aws ses put-receipt-rule \
    --rule-set-name inbound-email-rules \
    --rule '{
        "Name": "ProcessInboundEmails",
        "Enabled": true,
        "ScanEnabled": true,
        "Recipients": ["@yourdomain.com"],
        "Actions": [
            {
                "S3Action": {
                    "BucketName": "inbound-emails-[your-account-id]",
                    "ObjectKeyPrefix": "emails/"
                }
            },
            {
                "LambdaAction": {
                    "FunctionArn": "arn:aws:lambda:us-east-1:[your-account-id]:function:EmailProcessor",
                    "InvocationType": "Event"
                }
            }
        ]
    }'

# Activate the rule set
aws ses set-active-receipt-rule-set \
    --rule-set-name inbound-email-rules \
    --region us-east-1
```

### 8. Grant SES Permission to Invoke Lambda

```bash
aws lambda add-permission \
    --function-name EmailProcessor \
    --statement-id AllowSESInvoke \
    --action lambda:InvokeFunction \
    --principal ses.amazonaws.com \
    --source-account [your-account-id] \
    --region us-east-1
```

## Environment Variables

Set the following environment variables for your Lambda function:

```
# Required
WEBHOOK_ENDPOINT=https://api.example.com/email-webhook
API_KEY=your-secure-api-key

# Optional
EMAIL_RETENTION_HOURS=24
LOG_LEVEL=info
```

## Testing

### Send Test Email
```bash
# Send a test email to your domain
echo "Test email body" | mail -s "Test Subject" test@yourdomain.com
```

### Check CloudWatch Logs
Monitor Lambda execution in CloudWatch Logs:
```
/aws/lambda/EmailProcessor
```

## Monitoring & Alerts

### CloudWatch Metrics to Monitor

1. **Lambda Invocations**: Track successful/failed invocations
2. **Lambda Duration**: Monitor processing time
3. **Lambda Errors**: Alert on errors
4. **S3 PUT requests**: Track incoming emails
5. **SES Bounce Rate**: Monitor email health

### Sample CloudWatch Alarm

```bash
aws cloudwatch put-metric-alarm \
    --alarm-name EmailProcessingErrors \
    --alarm-description "Alert when email processing fails" \
    --metric-name Errors \
    --namespace AWS/Lambda \
    --statistic Sum \
    --period 300 \
    --threshold 5 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 1 \
    --dimensions Name=FunctionName,Value=EmailProcessor
```

## Security Best Practices

1. **Never expose SES receiving email addresses publicly**
   - Use unique, hard-to-guess addresses
   - Rotate receiving addresses periodically

2. **Implement rate limiting**
   - Use Lambda reserved concurrency
   - Implement DynamoDB-based rate limiting

3. **Validate webhook endpoints**
   - Use HTTPS only
   - Implement request signing
   - Validate SSL certificates

4. **Encrypt sensitive data**
   - Use AWS KMS for encryption keys
   - Encrypt emails at rest in S3

5. **Implement access controls**
   - Use least privilege IAM policies
   - Enable MFA for AWS account
   - Use AWS CloudTrail for auditing

## Cost Estimation

For moderate usage (10,000 emails/month):

- **SES Receiving**: First 1,000 emails free, then $0.10 per 1,000 emails
- **S3 Storage**: ~$0.023 per GB (minimal with 24hr retention)
- **Lambda**: Free tier covers most use cases
- **Data Transfer**: $0.09 per GB (to internet)

**Estimated monthly cost**: $5-20 depending on email volume and sizes

## Troubleshooting

### Common Issues

1. **Emails not being received**
   - Check MX records are properly configured
   - Verify domain is verified in SES
   - Ensure receipt rule set is active

2. **Lambda not triggering**
   - Check Lambda permissions for SES
   - Verify Lambda function name in receipt rule
   - Check CloudWatch Logs for errors

3. **S3 access denied**
   - Verify S3 bucket policy allows SES
   - Check Lambda IAM role has S3 permissions

4. **Webhook failures**
   - Verify endpoint is accessible from Lambda
   - Check API key/authentication
   - Monitor Lambda timeout settings

## Next Steps

1. Implement email parsing logic in Lambda
2. Add better-auth for user management
3. Set up Drizzle ORM for database operations
4. Create Next.js frontend for monitoring
5. Implement email routing logic based on recipient

## Resources

- [AWS SES Documentation](https://docs.aws.amazon.com/ses/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/) 