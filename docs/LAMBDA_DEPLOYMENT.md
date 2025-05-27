# Lambda Deployment Guide

This guide covers all the deployment options for the AWS Lambda function that processes inbound emails.

## 📋 Overview

The Lambda function needs to be deployed to AWS and configured to work with SES email receiving. There are several deployment approaches depending on your preferences and infrastructure setup.

## 🏗️ Deployment Options

### Option 1: AWS CDK (Recommended for Production)

AWS CDK provides infrastructure as code and is the most robust deployment method.

#### Setup CDK Project

1. **Install CDK**:
```bash
bun add -g aws-cdk
```

2. **Create CDK Stack**:
```typescript
// aws/cdk/lib/email-processor-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export class EmailProcessorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket for email storage
    const emailBucket = new s3.Bucket(this, 'EmailBucket', {
      bucketName: `inbound-emails-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{
        id: 'DeleteOldEmails',
        expiration: cdk.Duration.days(90),
      }],
      versioning: false,
      publicReadAccess: false,
    });

    // Dead Letter Queue for failed Lambda invocations
    const dlq = new sqs.Queue(this, 'EmailProcessorDLQ', {
      queueName: 'email-processor-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    // Lambda function for email processing
    const emailProcessor = new lambda.Function(this, 'EmailProcessor', {
      functionName: 'inbound-email-processor',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/email-processor'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        SERVICE_API_URL: process.env.SERVICE_API_URL || '',
        SERVICE_API_KEY: process.env.SERVICE_API_KEY || '',
        MAX_ATTACHMENT_SIZE: '10485760',
        ENABLE_SPAM_FILTER: 'true',
        ENABLE_VIRUS_FILTER: 'true',
      },
      deadLetterQueue: dlq,
      retryAttempts: 2,
    });

    // Grant S3 read permissions to Lambda
    emailBucket.grantRead(emailProcessor);

    // Grant SES bounce permissions
    emailProcessor.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendBounce'],
      resources: ['*'],
    }));

    // SES receipt rule set
    const ruleSet = new ses.ReceiptRuleSet(this, 'EmailRuleSet', {
      receiptRuleSetName: 'inbound-email-rules',
    });

    // Catch-all rule for your domains
    new ses.ReceiptRule(this, 'CatchAllRule', {
      ruleSet,
      recipients: [
        'yourdomain.com',
        // Add more domains as needed
      ],
      actions: [
        new ses.actions.S3({
          bucket: emailBucket,
          objectKeyPrefix: 'emails/',
        }),
        new ses.actions.Lambda({
          function: emailProcessor,
          invocationType: ses.LambdaInvocationType.EVENT,
        }),
      ],
      scanEnabled: true,
    });

    // CloudWatch Alarms
    new cloudwatch.Alarm(this, 'EmailProcessorErrors', {
      alarmName: 'EmailProcessor-Errors',
      metric: emailProcessor.metricErrors(),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Outputs
    new cdk.CfnOutput(this, 'EmailBucketName', {
      value: emailBucket.bucketName,
      description: 'S3 bucket for storing emails',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: emailProcessor.functionName,
      description: 'Lambda function for processing emails',
    });

    new cdk.CfnOutput(this, 'RuleSetName', {
      value: ruleSet.receiptRuleSetName,
      description: 'SES receipt rule set name',
    });
  }
}
```

3. **Deploy with CDK**:
```bash
# Bootstrap CDK (first time only)
cdk bootstrap

# Deploy the stack
SERVICE_API_URL=https://your-service.com \
SERVICE_API_KEY=your-api-key \
cdk deploy EmailProcessorStack
```

### Option 2: Manual Deployment

For simpler setups or when you prefer manual control.

#### Step 1: Prepare Lambda Package

1. **Create Lambda directory structure**:
```bash
mkdir -p lambda/email-processor
cd lambda/email-processor
```

2. **Create package.json**:
```json
{
  "name": "email-processor",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-s3": "^3.0.0",
    "@aws-sdk/client-ses": "^3.0.0",
    "mailparser": "^3.0.0"
  }
}
```

3. **Create Lambda handler**:
```typescript
// lambda/email-processor/index.ts
import { handleSESEvent, EmailProcessingConfig } from '../../lib/aws-ses';

const emailConfig: EmailProcessingConfig = {
  serviceApiUrl: process.env.SERVICE_API_URL!,
  serviceApiKey: process.env.SERVICE_API_KEY!,
  maxAttachmentSize: parseInt(process.env.MAX_ATTACHMENT_SIZE || '10485760'),
  enableSpamFilter: process.env.ENABLE_SPAM_FILTER !== 'false',
  enableVirusFilter: process.env.ENABLE_VIRUS_FILTER !== 'false',
};

export const handler = async (event: any, context: any) => {
  console.log('Processing SES email event:', JSON.stringify(event, null, 2));

  try {
    const processedEmails = await handleSESEvent(event, emailConfig);
    
    console.log(`Successfully processed ${processedEmails.length} emails`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Successfully processed ${processedEmails.length} emails`,
        processedEmails: processedEmails.length,
      }),
    };
  } catch (error) {
    console.error('Error processing SES event:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error processing emails',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
```

4. **Build and package**:
```bash
# Install dependencies
bun install

# Compile TypeScript (if using)
npx tsc

# Copy library files
cp -r ../../lib ./

# Create deployment package
zip -r email-processor.zip index.js lib/ node_modules/ package.json
```

#### Step 2: Deploy to AWS

1. **Create Lambda function**:
```bash
aws lambda create-function \
  --function-name inbound-email-processor \
  --runtime nodejs20.x \
  --role arn:aws:iam::YOUR_ACCOUNT:role/lambda-execution-role \
  --handler index.handler \
  --zip-file fileb://email-processor.zip \
  --timeout 300 \
  --memory-size 512 \
  --environment Variables='{
    "SERVICE_API_URL":"https://your-service.com",
    "SERVICE_API_KEY":"your-api-key",
    "MAX_ATTACHMENT_SIZE":"10485760",
    "ENABLE_SPAM_FILTER":"true",
    "ENABLE_VIRUS_FILTER":"true"
  }'
```

2. **Update function code** (for subsequent deployments):
```bash
aws lambda update-function-code \
  --function-name inbound-email-processor \
  --zip-file fileb://email-processor.zip
```

### Option 3: CI/CD with GitHub Actions

Automate deployments with GitHub Actions.

#### Create Workflow File

```yaml
# .github/workflows/deploy-lambda.yml
name: Deploy Email Processor Lambda

on:
  push:
    branches: [main]
    paths: 
      - 'lambda/email-processor/**'
      - 'lib/aws-ses.ts'
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy to'
        required: true
        default: 'staging'
        type: choice
        options:
        - staging
        - production

env:
  AWS_REGION: us-west-2

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment || 'staging' }}
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest
          
      - name: Install dependencies
        run: |
          cd lambda/email-processor
          bun install
          
      - name: Build Lambda package
        run: |
          cd lambda/email-processor
          
          # Compile TypeScript if needed
          if [ -f "tsconfig.json" ]; then
            npx tsc
          fi
          
          # Copy library files
          cp -r ../../lib ./
          
          # Create deployment package
          zip -r email-processor.zip index.js lib/ node_modules/ package.json
          
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
          
      - name: Deploy to Lambda
        run: |
          cd lambda/email-processor
          
          # Update function code
          aws lambda update-function-code \
            --function-name inbound-email-processor \
            --zip-file fileb://email-processor.zip
            
          # Update environment variables
          aws lambda update-function-configuration \
            --function-name inbound-email-processor \
            --environment Variables='{
              "SERVICE_API_URL":"${{ secrets.SERVICE_API_URL }}",
              "SERVICE_API_KEY":"${{ secrets.SERVICE_API_KEY }}",
              "MAX_ATTACHMENT_SIZE":"10485760",
              "ENABLE_SPAM_FILTER":"true",
              "ENABLE_VIRUS_FILTER":"true"
            }'
            
      - name: Test Lambda function
        run: |
          # Invoke function with test event
          aws lambda invoke \
            --function-name inbound-email-processor \
            --payload '{"test": true}' \
            response.json
            
          cat response.json
```

#### Required GitHub Secrets

Add these secrets to your GitHub repository:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `SERVICE_API_URL`
- `SERVICE_API_KEY`

## 🔧 IAM Role Setup

The Lambda function needs proper IAM permissions:

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
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::your-email-bucket/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendBounce"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage"
      ],
      "Resource": "arn:aws:sqs:*:*:email-processor-dlq"
    }
  ]
}
```

## 🧪 Testing Deployment

### Local Testing

```bash
# Test with sample SES event
cat > test-event.json << EOF
{
  "Records": [
    {
      "eventSource": "aws:ses",
      "eventVersion": "1.0",
      "ses": {
        "receipt": {
          "timestamp": "2023-01-01T12:00:00.000Z",
          "processingTimeMillis": 100,
          "recipients": ["test@yourdomain.com"],
          "spamVerdict": {"status": "PASS"},
          "virusVerdict": {"status": "PASS"},
          "spfVerdict": {"status": "PASS"},
          "dkimVerdict": {"status": "PASS"},
          "dmarcVerdict": {"status": "PASS"},
          "action": {
            "type": "S3",
            "bucketName": "test-bucket",
            "objectKey": "test-key"
          }
        },
        "mail": {
          "timestamp": "2023-01-01T12:00:00.000Z",
          "messageId": "test-message-id",
          "source": "sender@example.com",
          "destination": ["test@yourdomain.com"],
          "commonHeaders": {
            "from": ["sender@example.com"],
            "to": ["test@yourdomain.com"],
            "subject": "Test Email"
          }
        }
      }
    }
  ]
}
EOF

# Invoke Lambda locally (if using SAM)
sam local invoke EmailProcessor -e test-event.json
```

### AWS Testing

```bash
# Test deployed Lambda function
aws lambda invoke \
  --function-name inbound-email-processor \
  --payload file://test-event.json \
  response.json

cat response.json
```

### End-to-End Testing

```bash
# Send test email via SES
aws ses send-email \
  --source test@yourdomain.com \
  --destination ToAddresses=support@yourdomain.com \
  --message Subject={Data="Test Email"},Body={Text={Data="Test message content"}}
```

## 📊 Monitoring Deployment

### CloudWatch Logs

```bash
# View Lambda logs
aws logs tail /aws/lambda/inbound-email-processor --follow

# Search for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/inbound-email-processor \
  --filter-pattern "ERROR"
```

### Metrics to Monitor

- **Invocations**: Number of times Lambda is called
- **Duration**: How long each invocation takes
- **Errors**: Failed invocations
- **Throttles**: Rate-limited invocations
- **Dead Letter Queue**: Failed messages

### Alarms

Set up CloudWatch alarms for:
- Error rate > 5%
- Duration > 30 seconds
- Throttles > 0
- DLQ messages > 0

## 🔄 Update Strategy

### Rolling Updates

1. **Test in staging** environment first
2. **Deploy to production** during low-traffic periods
3. **Monitor metrics** after deployment
4. **Rollback** if issues are detected

### Blue-Green Deployment

```bash
# Create new version
aws lambda publish-version \
  --function-name inbound-email-processor

# Update alias to new version
aws lambda update-alias \
  --function-name inbound-email-processor \
  --name LIVE \
  --function-version 2
```

## 🚨 Troubleshooting

### Common Issues

1. **Permission Denied**: Check IAM role permissions
2. **Timeout**: Increase Lambda timeout or optimize code
3. **Memory Issues**: Increase memory allocation
4. **Package Too Large**: Optimize dependencies or use layers

### Debug Commands

```bash
# Check function configuration
aws lambda get-function-configuration \
  --function-name inbound-email-processor

# View recent invocations
aws lambda get-function \
  --function-name inbound-email-processor

# Check SES rule configuration
aws ses describe-receipt-rule-set \
  --rule-set-name inbound-email-rules
```

This deployment guide provides multiple options to suit different team preferences and infrastructure requirements. Choose the approach that best fits your workflow and scale requirements. 