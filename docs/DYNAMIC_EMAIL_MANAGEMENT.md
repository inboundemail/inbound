# Dynamic Email Management System

This document outlines the complete system for dynamically managing email addresses and domains through your API, with automatic email receiving and processing via AWS SES.

## 📋 Overview

The dynamic email management system allows you to:
1. **Add domains and email addresses** via your API
2. **Automatically receive emails** for those addresses
3. **Store emails in S3** with metadata
4. **Process emails via Lambda** and send webhooks to your API
5. **Retrieve emails** from S3 when needed via your API

## 🏗️ System Architecture

```
Your API (Add Email) → SES Receipt Rules → Email Received → S3 Storage → Lambda → Webhook to Your API
                                                                              ↓
Your API (Get Email) ← S3 Retrieval ← Email Processing Request
```

### Flow Breakdown

1. **Email Registration**: Your API adds new email addresses to be monitored
2. **Email Reception**: AWS SES receives emails for registered addresses
3. **Storage**: Emails are stored in S3 with unique keys
4. **Processing**: Lambda processes emails and validates recipients
5. **Notification**: Webhook sent to your API with email metadata
6. **Retrieval**: Your API can fetch full email content from S3 when needed

## 🔧 Implementation Components

### 1. API Endpoints (Your Service)

You need to implement these endpoints in your service:

#### Check Recipient Endpoint
```typescript
// POST /api/emails/check-recipient
// Called by Lambda to validate if an email address is managed
{
  "recipient": "support@yourdomain.com"
}

// Response:
{
  "isManaged": true,
  "emailId": "email_123",
  "settings": {
    "autoRespond": false,
    "forwardTo": null
  }
}
```

#### Webhook Endpoint
```typescript
// POST /api/webhooks/email-received
// Called by Lambda when an email is received
{
  "type": "email_received",
  "timestamp": "2023-01-01T12:00:00.000Z",
  "data": {
    "messageId": "ses-message-id",
    "from": "sender@example.com",
    "to": ["support@yourdomain.com"],
    "recipient": "support@yourdomain.com",
    "subject": "Customer Support Request",
    "bodyPreview": "Hello, I need help with...",
    "hasAttachments": true,
    "attachmentCount": 2,
    "authResults": {
      "spf": "PASS",
      "dkim": "PASS",
      "dmarc": "PASS",
      "spam": "PASS",
      "virus": "PASS"
    },
    "s3Location": {
      "bucket": "your-email-bucket",
      "key": "emails/2023/01/01/ses-message-id"
    },
    "headers": {
      "messageId": "original-message-id",
      "date": "Mon, 1 Jan 2023 12:00:00 +0000",
      "replyTo": "sender@example.com"
    }
  }
}
```

#### Email Management Endpoints
```typescript
// POST /api/emails/addresses
// Add a new email address to monitor
{
  "email": "support@yourdomain.com",
  "domain": "yourdomain.com",
  "settings": {
    "autoRespond": false,
    "forwardTo": null,
    "tags": ["support", "customer-service"]
  }
}

// GET /api/emails/addresses
// List all managed email addresses

// DELETE /api/emails/addresses/{id}
// Remove an email address from monitoring
```

### 2. Lambda Function Configuration

#### Environment Variables
```bash
# AWS Configuration
AWS_REGION=us-west-2

# Your Service Integration
SERVICE_API_URL=https://your-service.com
SERVICE_API_KEY=your-secure-api-key

# Email Processing Settings
MAX_ATTACHMENT_SIZE=10485760  # 10MB
ENABLE_SPAM_FILTER=true
ENABLE_VIRUS_FILTER=true
```

#### Lambda Handler Implementation
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

export const handler = async (event: any) => {
  console.log('Processing SES email event');

  try {
    // Process emails - this will automatically:
    // 1. Check if recipients are managed via your API
    // 2. Send webhooks to your API for valid emails
    const processedEmails = await handleSESEvent(event, emailConfig);
    
    console.log(`Successfully processed ${processedEmails.length} emails`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Successfully processed ${processedEmails.length} emails`,
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

### 3. Email Retrieval in Your API

When you need to fetch the full email content:

```typescript
// In your API route handler
import { getEmailFromS3, getEmailMetadata } from '@/lib/aws-ses';

// Get full email content
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bucket = searchParams.get('bucket');
  const key = searchParams.get('key');

  if (!bucket || !key) {
    return Response.json({ error: 'Missing bucket or key' }, { status: 400 });
  }

  try {
    // Get full email with attachments
    const email = await getEmailFromS3(bucket, key);
    
    return Response.json({
      messageId: email.messageId,
      from: email.from,
      to: email.to,
      subject: email.subject,
      body: email.body,
      attachments: email.attachments.map(att => ({
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        // Note: Don't send content in JSON, provide download URL instead
      })),
      timestamp: email.timestamp,
      headers: email.headers,
    });
  } catch (error) {
    console.error('Error retrieving email:', error);
    return Response.json({ error: 'Failed to retrieve email' }, { status: 500 });
  }
}

// Get email metadata only (faster)
export async function getEmailPreview(bucket: string, key: string) {
  try {
    const metadata = await getEmailMetadata(bucket, key);
    return metadata;
  } catch (error) {
    console.error('Error getting email metadata:', error);
    throw error;
  }
}
```

## 🚀 Deployment Strategy

### Option 1: AWS CDK (Recommended)

Create a CDK stack that automatically deploys and updates your Lambda function:

```typescript
// aws/cdk/lib/email-processor-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as iam from 'aws-cdk-lib/aws-iam';

export class EmailProcessorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket for email storage
    const emailBucket = new s3.Bucket(this, 'EmailBucket', {
      bucketName: `inbound-emails-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{
        id: 'DeleteOldEmails',
        expiration: cdk.Duration.days(90), // Adjust as needed
      }],
      versioning: false,
      publicReadAccess: false,
    });

    // Lambda function for email processing
    const emailProcessor = new lambda.Function(this, 'EmailProcessor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/email-processor'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        SERVICE_API_URL: process.env.SERVICE_API_URL || 'https://your-service.com',
        SERVICE_API_KEY: process.env.SERVICE_API_KEY || '',
        MAX_ATTACHMENT_SIZE: '10485760',
        ENABLE_SPAM_FILTER: 'true',
        ENABLE_VIRUS_FILTER: 'true',
      },
      deadLetterQueue: new sqs.Queue(this, 'EmailProcessorDLQ', {
        retentionPeriod: cdk.Duration.days(14),
      }),
    });

    // Grant permissions
    emailBucket.grantRead(emailProcessor);
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
      recipients: ['yourdomain.com'], // Add your domains here
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
      scanEnabled: true, // Enable spam/virus scanning
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
  }
}
```

### Option 2: Manual Deployment

1. **Build Lambda Package**:
```bash
# In your project root
cd lambda/email-processor
bun install
bun run build
zip -r email-processor.zip dist/ node_modules/ package.json
```

2. **Deploy via AWS CLI**:
```bash
# Create or update Lambda function
aws lambda update-function-code \
  --function-name email-processor \
  --zip-file fileb://email-processor.zip

# Update environment variables
aws lambda update-function-configuration \
  --function-name email-processor \
  --environment Variables='{
    "SERVICE_API_URL":"https://your-service.com",
    "SERVICE_API_KEY":"your-api-key",
    "MAX_ATTACHMENT_SIZE":"10485760"
  }'
```

### Option 3: CI/CD Pipeline

Create a GitHub Actions workflow for automatic deployment:

```yaml
# .github/workflows/deploy-lambda.yml
name: Deploy Email Processor Lambda

on:
  push:
    branches: [main]
    paths: 
      - 'lambda/email-processor/**'
      - 'lib/aws-ses.ts'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        
      - name: Install dependencies
        run: |
          cd lambda/email-processor
          bun install
          
      - name: Build Lambda package
        run: |
          cd lambda/email-processor
          bun run build
          zip -r email-processor.zip dist/ node_modules/ package.json
          
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-west-2
          
      - name: Deploy to Lambda
        run: |
          cd lambda/email-processor
          aws lambda update-function-code \
            --function-name email-processor \
            --zip-file fileb://email-processor.zip
```

## 📊 Database Schema

You'll need to store email address configurations in your database:

```sql
-- Email addresses table
CREATE TABLE email_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  domain VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Email messages table (for tracking received emails)
CREATE TABLE email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id VARCHAR(255) UNIQUE NOT NULL,
  email_address_id UUID REFERENCES email_addresses(id),
  from_address VARCHAR(255) NOT NULL,
  subject TEXT,
  body_preview TEXT,
  has_attachments BOOLEAN DEFAULT false,
  attachment_count INTEGER DEFAULT 0,
  s3_bucket VARCHAR(255) NOT NULL,
  s3_key VARCHAR(500) NOT NULL,
  auth_results JSONB,
  headers JSONB,
  received_at TIMESTAMP NOT NULL,
  processed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_email_addresses_domain ON email_addresses(domain);
CREATE INDEX idx_email_addresses_user_id ON email_addresses(user_id);
CREATE INDEX idx_email_messages_email_address_id ON email_messages(email_address_id);
CREATE INDEX idx_email_messages_received_at ON email_messages(received_at);
```

## 🔒 Security Considerations

### API Security
- Use strong API keys for Lambda ↔ API communication
- Implement rate limiting on email management endpoints
- Validate email addresses and domains before adding
- Use HTTPS for all API communications

### Email Security
- Enable SES spam and virus filtering
- Validate SPF, DKIM, and DMARC results
- Implement sender blocking for known bad actors
- Monitor for unusual email patterns

### S3 Security
- Use bucket policies to restrict access
- Enable S3 access logging
- Consider encryption at rest for sensitive emails
- Implement lifecycle policies for data retention

## 📈 Monitoring and Alerting

### Key Metrics to Monitor
- Email processing success rate
- Lambda function errors and duration
- API webhook delivery success rate
- S3 storage usage and costs
- SES bounce and complaint rates

### Recommended Alarms
```typescript
// CloudWatch Alarms
const emailProcessingErrors = new cloudwatch.Alarm(this, 'EmailProcessingErrors', {
  metric: emailProcessor.metricErrors(),
  threshold: 5,
  evaluationPeriods: 2,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
});

const webhookFailures = new cloudwatch.Alarm(this, 'WebhookFailures', {
  metric: new cloudwatch.Metric({
    namespace: 'AWS/Lambda',
    metricName: 'Errors',
    dimensionsMap: {
      FunctionName: emailProcessor.functionName,
    },
  }),
  threshold: 10,
  evaluationPeriods: 3,
});
```

## 🧪 Testing

### Unit Tests
```typescript
// Test email processing
import { handleSESEvent } from '@/lib/aws-ses';

describe('Email Processing', () => {
  it('should process valid emails', async () => {
    const mockEvent = {
      Records: [{
        eventSource: 'aws:ses',
        ses: {
          mail: {
            messageId: 'test-id',
            source: 'test@example.com',
            destination: ['support@yourdomain.com'],
            commonHeaders: {
              subject: 'Test Email',
              from: ['test@example.com'],
              to: ['support@yourdomain.com'],
            },
            timestamp: new Date().toISOString(),
          },
          receipt: {
            recipients: ['support@yourdomain.com'],
            spamVerdict: { status: 'PASS' },
            virusVerdict: { status: 'PASS' },
            spfVerdict: { status: 'PASS' },
            dkimVerdict: { status: 'PASS' },
            dmarcVerdict: { status: 'PASS' },
            action: {
              type: 'S3',
              bucketName: 'test-bucket',
              objectKey: 'test-key',
            },
            timestamp: new Date().toISOString(),
            processingTimeMillis: 100,
          },
        },
      }],
    };

    const result = await handleSESEvent(mockEvent);
    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe('test-id');
  });
});
```

### Integration Tests
```bash
# Test email reception end-to-end
aws ses send-email \
  --source test@yourdomain.com \
  --destination ToAddresses=support@yourdomain.com \
  --message Subject={Data="Test Email"},Body={Text={Data="Test message"}}
```

This dynamic email management system provides a complete solution for managing email addresses via your API while leveraging AWS SES for reliable email receiving and processing. 