# Inbound Email CDK Stack

This CDK stack deploys the AWS infrastructure needed for processing inbound emails.

## What Gets Deployed

- **S3 Bucket**: Stores incoming emails
- **Lambda Function**: Processes emails and sends webhooks
- **SES Receipt Rule Set**: Routes emails to Lambda and S3
- **CloudWatch Alarms**: Monitors Lambda function performance
- **IAM Roles**: Proper permissions for all services

## Prerequisites

1. **AWS CLI configured** with appropriate credentials
2. **CDK installed** globally: `npm install -g aws-cdk`
3. **Node.js 18+** installed

## Deployment Options

### Option 1: Full Deployment Script (Recommended)

```bash
cd aws/cdk
npm install
./deploy.sh
```

This script will:
- Build the TypeScript
- Deploy the stack
- Extract and display the environment variables you need

### Option 2: Simple Deployment Script

```bash
cd aws/cdk
npm install
./deploy-simple.sh
```

This version doesn't require `jq` and shows the raw CDK outputs.

### Option 3: Manual Deployment

```bash
cd aws/cdk
npm install
npm run build
npm run deploy
```

Then manually check the outputs:
```bash
aws cloudformation describe-stacks --stack-name InboundEmailStack --query 'Stacks[0].Outputs'
```

## Environment Variables

After deployment, you'll get output like this:

```bash
# Add these to your .env file:
S3_BUCKET_NAME=inbound-emails-123456789012-us-west-2
AWS_ACCOUNT_ID=123456789012
LAMBDA_FUNCTION_NAME=inbound-email-processor
AWS_REGION=us-west-2

# Make sure you also have these (from your AWS credentials):
# AWS_ACCESS_KEY_ID=your_access_key_here
# AWS_SECRET_ACCESS_KEY=your_secret_key_here
```

Copy these values to your main application's `.env` file.

## Configuration

You can customize the deployment by setting these environment variables before deploying:

- `SERVICE_API_URL`: Your application's API URL (default: https://inbound.exon.dev)
- `SERVICE_API_KEY`: API key for webhook authentication
- `EMAIL_DOMAINS`: Comma-separated list of domains (default: exon.dev)

Example:
```bash
export SERVICE_API_URL=https://your-app.com
export SERVICE_API_KEY=your-secret-key
export EMAIL_DOMAINS=yourdomain.com,anotherdomain.com
./deploy.sh
```

## Cleanup

To remove all resources:

```bash
npm run destroy
```

## Troubleshooting

### Build Errors
- Make sure you're in the `aws/cdk` directory
- Run `npm install` to install dependencies
- Check that TypeScript compiles: `npm run build`

### Deployment Errors
- Verify AWS credentials: `aws sts get-caller-identity`
- Check AWS region is supported for SES
- Ensure you have proper IAM permissions

### Missing Outputs
- Make sure the stack deployed successfully
- Check CloudFormation console for any errors
- Verify stack name is `InboundEmailStack`

## Next Steps

1. Copy the environment variables to your `.env` file
2. Test the email workflow in your Development tab
3. Configure your first domain and email addresses
4. Send test emails to verify the complete flow 