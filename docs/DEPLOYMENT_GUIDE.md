# Email System Deployment Guide

This guide will help you deploy the AWS SES email receiving system for testing domain email reception.

## 📋 Overview

The deployment process involves:
1. **Lambda Function**: Processes incoming emails and sends webhooks to your API
2. **AWS SES**: Receives emails for your domains with spam/virus filtering
3. **S3 Bucket**: Stores email content temporarily
4. **CloudWatch**: Monitors the system and provides logs

## 🚀 Quick Start

### Prerequisites

1. **AWS CLI configured**:
   ```bash
   aws configure
   # Enter your AWS Access Key ID, Secret Access Key, and region
   ```

2. **AWS CDK bootstrapped** (first time only):
   ```bash
   cd aws/cdk
   bun run cdk bootstrap
   ```

3. **Environment variables** (optional):
   ```bash
   export SERVICE_API_URL="https://inbound.exon.dev"
   export SERVICE_API_KEY="your-api-key"
   export EMAIL_DOMAINS="exon.dev,yourdomain.com"
   export AWS_REGION="us-west-2"
   ```

### Option 1: Quick Deployment (Recommended for Testing)

```bash
# Deploy everything with default settings
bun run deploy:quick

# Or with custom settings
SERVICE_API_URL=https://your-domain.com bun run deploy:quick
```

### Option 2: Full Deployment with Configuration

```bash
# Deploy with full configuration options
bun run deploy:email --service-api-url https://your-domain.com --email-domains exon.dev,example.com

# Or with environment variables
SERVICE_API_URL=https://your-domain.com \
SERVICE_API_KEY=your-secret-key \
EMAIL_DOMAINS=exon.dev,example.com \
bun run deploy:email
```

### Option 3: Step-by-Step Deployment

```bash
# 1. Build Lambda function
bun run deploy:lambda

# 2. Deploy CDK stack
SERVICE_API_URL=https://your-domain.com bun run deploy:cdk
```

## 🔧 Configuration Options

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SERVICE_API_URL` | Your API endpoint for webhooks | `https://inbound.exon.dev` | Yes |
| `SERVICE_API_KEY` | API key for authentication | `test-key` | No |
| `EMAIL_DOMAINS` | Comma-separated domains to receive emails for | `exon.dev` | No |
| `AWS_REGION` | AWS region for deployment | `us-west-2` | No |
| `AWS_PROFILE` | AWS profile to use | `default` | No |

### Command Line Options

```bash
# Full deployment script options
bun run scripts/deploy-email-system.ts \
  --service-api-url https://your-api.com \
  --service-api-key your-secret-key \
  --email-domains domain1.com,domain2.com \
  --aws-region us-east-1 \
  --aws-profile production
```

## 📧 Testing Email Reception

### 1. Verify Domain in AWS SES

After deployment, verify your domain:

```bash
# Replace with your domain
aws ses verify-domain-identity --domain exon.dev --region us-west-2
```

### 2. Configure DNS Records

Add these DNS records to your domain:

**MX Record:**
```
Type: MX
Name: @ (or your domain)
Value: 10 inbound-smtp.us-west-2.amazonaws.com
TTL: 300
```

**TXT Record for Domain Verification:**
```
Type: TXT
Name: @ (or your domain)
Value: [Value provided by AWS SES verification]
TTL: 300
```

### 3. Send Test Email

Send an email to any address at your domain:
```
test@yourdomain.com
support@yourdomain.com
hello@yourdomain.com
```

### 4. Monitor Logs

Check CloudWatch logs for processing:
```bash
# View Lambda logs
aws logs tail /aws/lambda/inbound-email-processor --follow --region us-west-2

# View SES metrics in AWS Console
# Go to: CloudWatch > Metrics > SES
```

## 🔍 Troubleshooting

### Common Issues

1. **"Access Denied" errors**
   - Check AWS credentials: `aws sts get-caller-identity`
   - Verify IAM permissions for SES, S3, and Lambda

2. **Lambda not triggered**
   - Check SES receipt rule configuration
   - Verify Lambda permissions in AWS Console
   - Check CloudWatch logs for errors

3. **Emails not received**
   - Verify domain in SES console
   - Check MX records are correctly configured
   - Ensure domain is not in SES sandbox mode

4. **CDK deployment fails**
   - Run `bun run cdk bootstrap` first
   - Check AWS region is correct
   - Verify sufficient IAM permissions

### Debug Commands

```bash
# Check AWS configuration
aws sts get-caller-identity

# Check CDK status
cd aws/cdk && bun run cdk list

# Check Lambda function
aws lambda get-function --function-name inbound-email-processor --region us-west-2

# Check SES receipt rules
aws ses describe-receipt-rule-set --rule-set-name inbound-email-rules --region us-west-2

# Test Lambda function manually
aws lambda invoke \
  --function-name inbound-email-processor \
  --payload '{"Records":[{"eventSource":"aws:ses","ses":{"mail":{"messageId":"test"}}}]}' \
  --region us-west-2 \
  response.json
```

## 📊 Monitoring

### CloudWatch Metrics to Monitor

- **Lambda Duration**: Processing time per email
- **Lambda Errors**: Failed email processing
- **SES Receipt**: Emails received count
- **S3 Objects**: Stored emails count

### Recommended Alarms

The deployment automatically creates these alarms:
- Lambda error rate > 5 errors in 5 minutes
- Lambda duration > 30 seconds for 3 consecutive periods

### Log Groups

- `/aws/lambda/inbound-email-processor` - Lambda function logs
- SES metrics available in CloudWatch Metrics console

## 🔄 Updates and Redeployment

### Update Lambda Function Only

```bash
bun run deploy:lambda
```

### Update CDK Stack Only

```bash
bun run deploy:cdk
```

### Full Redeployment

```bash
bun run deploy:quick
```

### Destroy Resources

```bash
cd aws/cdk
bun run cdk destroy
```

## 🔐 Security Considerations

1. **API Keys**: Store sensitive keys in environment variables, not in code
2. **IAM Permissions**: Use least privilege principle
3. **S3 Bucket**: Emails are automatically deleted after 90 days
4. **SES Filtering**: Spam and virus filtering enabled by default

## 💰 Cost Estimation

Typical costs for moderate usage:
- **Lambda**: ~$0.20 per 1M requests
- **S3**: ~$0.023 per GB stored
- **SES**: $0.10 per 1,000 emails received
- **CloudWatch**: ~$0.50 per GB of logs

## 📚 Next Steps

After successful deployment:

1. **Implement API endpoints** for email management
2. **Set up webhook handling** in your application
3. **Configure email forwarding** rules
4. **Set up monitoring** and alerting
5. **Test with real email scenarios**

## 🆘 Support

If you encounter issues:

1. Check the [troubleshooting section](#troubleshooting)
2. Review CloudWatch logs
3. Verify AWS permissions and configuration
4. Test with simple email scenarios first 