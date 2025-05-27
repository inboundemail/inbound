# 🚀 Inbound Email System - Quick Deployment

## What This System Does

**Inbound.exon.dev** is a dynamic email receiving and processing system that:

1. **Receives emails** for any domain you configure (like `support@yourdomain.com`)
2. **Processes emails** through AWS Lambda with spam/virus filtering
3. **Stores emails** temporarily in S3 (auto-deleted after 90 days)
4. **Sends webhooks** to your API when emails are received
5. **Allows retrieval** of full email content via your API

## 🏗️ Architecture

```
Email Sent → AWS SES → S3 Storage → Lambda Function → Webhook to Your API
                                         ↓
Your API ← S3 Retrieval ← Email Processing Request
```

## ⚡ Quick Start

### 1. Prerequisites

```bash
# Configure AWS CLI
aws configure

# Bootstrap CDK (first time only)
cd aws/cdk && bun run cdk bootstrap
```

### 2. Deploy Everything

```bash
# Quick deployment with defaults
bun run deploy:quick

# Or with custom configuration
SERVICE_API_URL=https://your-domain.com bun run deploy:quick
```

### 3. Test Deployment

```bash
# Verify everything is working
bun run test:deployment
```

### 4. Configure DNS

Add MX record to your domain:
```
Type: MX
Name: @
Value: 10 inbound-smtp.us-west-2.amazonaws.com
TTL: 300
```

### 5. Verify Domain

```bash
aws ses verify-domain-identity --domain yourdomain.com --region us-west-2
```

## 📋 Available Commands

| Command | Description |
|---------|-------------|
| `bun run deploy:quick` | Quick deployment with defaults |
| `bun run deploy:email` | Full deployment with options |
| `bun run deploy:lambda` | Deploy Lambda function only |
| `bun run deploy:cdk` | Deploy CDK stack only |
| `bun run test:deployment` | Test the deployment |

## 🔧 Configuration

Set these environment variables:

```bash
export SERVICE_API_URL="https://your-api.com"
export SERVICE_API_KEY="your-secret-key"
export EMAIL_DOMAINS="yourdomain.com,anotherdomain.com"
export AWS_REGION="us-west-2"
```

## 📧 Testing Email Reception

1. **Send test email** to `test@yourdomain.com`
2. **Check CloudWatch logs**: `/aws/lambda/inbound-email-processor`
3. **Monitor your webhook endpoint** for notifications
4. **Verify S3 storage** in AWS console

## 🔍 Troubleshooting

### Common Issues

- **Access Denied**: Check AWS credentials with `aws sts get-caller-identity`
- **Lambda not triggered**: Verify SES receipt rules in AWS console
- **Emails not received**: Check MX records and domain verification
- **CDK fails**: Run `bun run cdk bootstrap` first

### Debug Commands

```bash
# Check AWS setup
aws sts get-caller-identity

# View Lambda logs
aws logs tail /aws/lambda/inbound-email-processor --follow

# Test Lambda manually
aws lambda invoke --function-name inbound-email-processor \
  --payload '{"Records":[{"eventSource":"aws:ses"}]}' response.json
```

## 📚 Documentation

- **[Full Deployment Guide](docs/DEPLOYMENT_GUIDE.md)** - Complete setup instructions
- **[Implementation Plan](docs/IMPLEMENTATION_PLAN.md)** - Technical architecture
- **[Lambda Deployment](docs/LAMBDA_DEPLOYMENT.md)** - Lambda-specific setup
- **[Dynamic Email Management](docs/DYNAMIC_EMAIL_MANAGEMENT.md)** - API integration

## 🆘 Need Help?

1. Check the [troubleshooting section](#troubleshooting)
2. Review CloudWatch logs for errors
3. Verify AWS permissions and configuration
4. Test with simple scenarios first

---

**Ready to start receiving emails? Run `bun run deploy:quick` and follow the setup steps!** 🎉 