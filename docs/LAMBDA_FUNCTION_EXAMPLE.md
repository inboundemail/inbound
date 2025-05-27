# AWS Lambda Function Example for SES Email Processing

This document provides a complete example of how to implement an AWS Lambda function using the `aws-ses.ts` library to process inbound emails.

## Lambda Function Implementation

### Basic Lambda Handler

```typescript
// lambda/email-processor/index.ts
import { 
  handleSESEvent, 
  ProcessedEmail, 
  AWSSESEmailProcessor,
  EmailProcessingConfig 
} from '../../lib/aws-ses';

// Configuration for email processing
const emailConfig: EmailProcessingConfig = {
  s3Region: process.env.AWS_REGION || 'us-west-2',
  sesRegion: process.env.AWS_REGION || 'us-west-2',
  allowedDomains: process.env.ALLOWED_DOMAINS?.split(',') || [],
  blockedSenders: process.env.BLOCKED_SENDERS?.split(',') || [],
  maxAttachmentSize: parseInt(process.env.MAX_ATTACHMENT_SIZE || '10485760'), // 10MB
  enableSpamFilter: process.env.ENABLE_SPAM_FILTER !== 'false',
  enableVirusFilter: process.env.ENABLE_VIRUS_FILTER !== 'false',
};

export const handler = async (event: any, context: any) => {
  console.log('Processing SES email event:', JSON.stringify(event, null, 2));

  try {
    // Process the SES event
    const processedEmails = await handleSESEvent(event, emailConfig);
    
    console.log(`Successfully processed ${processedEmails.length} emails`);

    // Process each email
    for (const email of processedEmails) {
      await processEmail(email);
    }

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

async function processEmail(email: ProcessedEmail): Promise<void> {
  console.log(`Processing email: ${email.messageId} from ${email.from} to ${email.recipient}`);

  try {
    // Route email based on recipient
    const handler = AWSSESEmailProcessor.routeEmailByRecipient(email);
    console.log(`Routing email to handler: ${handler}`);

    // Process based on handler type
    switch (handler) {
      case 'support':
        await handleSupportEmail(email);
        break;
      case 'sales':
        await handleSalesEmail(email);
        break;
      case 'billing':
        await handleBillingEmail(email);
        break;
      case 'admin':
        await handleAdminEmail(email);
        break;
      default:
        await handleGeneralEmail(email);
        break;
    }

    // Send webhook notification to your service
    await sendWebhookNotification(email);

  } catch (error) {
    console.error(`Error processing email ${email.messageId}:`, error);
    throw error;
  }
}

async function handleSupportEmail(email: ProcessedEmail): Promise<void> {
  console.log('Processing support email');
  
  // Example: Create support ticket
  const ticketData = {
    subject: email.subject,
    description: email.body.text || email.body.html || '',
    customerEmail: email.from,
    attachments: email.attachments.map(att => ({
      filename: att.filename,
      size: att.size,
      contentType: att.contentType,
    })),
    priority: email.subject.toLowerCase().includes('urgent') ? 'high' : 'normal',
  };

  // Call your service API to create support ticket
  await callServiceAPI('/api/support/tickets', 'POST', ticketData);
}

async function handleSalesEmail(email: ProcessedEmail): Promise<void> {
  console.log('Processing sales email');
  
  // Example: Create sales lead
  const leadData = {
    email: email.from,
    subject: email.subject,
    message: email.body.text || email.body.html || '',
    source: 'email',
    timestamp: email.timestamp.toISOString(),
  };

  // Call your service API to create lead
  await callServiceAPI('/api/sales/leads', 'POST', leadData);
}

async function handleBillingEmail(email: ProcessedEmail): Promise<void> {
  console.log('Processing billing email');
  
  // Example: Create billing inquiry
  const billingData = {
    customerEmail: email.from,
    subject: email.subject,
    inquiry: email.body.text || email.body.html || '',
    timestamp: email.timestamp.toISOString(),
  };

  // Call your service API to create billing inquiry
  await callServiceAPI('/api/billing/inquiries', 'POST', billingData);
}

async function handleAdminEmail(email: ProcessedEmail): Promise<void> {
  console.log('Processing admin email');
  
  // Example: Forward to admin team
  const adminData = {
    from: email.from,
    subject: `[ADMIN] ${email.subject}`,
    body: email.body.text || email.body.html || '',
    originalMessageId: email.messageId,
    timestamp: email.timestamp.toISOString(),
  };

  // Call your service API to notify admin
  await callServiceAPI('/api/admin/notifications', 'POST', adminData);
}

async function handleGeneralEmail(email: ProcessedEmail): Promise<void> {
  console.log('Processing general email');
  
  // Example: Store in general inbox
  const inboxData = {
    messageId: email.messageId,
    from: email.from,
    to: email.recipient,
    subject: email.subject,
    body: email.body.text || email.body.html || '',
    timestamp: email.timestamp.toISOString(),
    hasAttachments: email.attachments.length > 0,
  };

  // Call your service API to store in inbox
  await callServiceAPI('/api/inbox/messages', 'POST', inboxData);
}

async function sendWebhookNotification(email: ProcessedEmail): Promise<void> {
  try {
    // Generate webhook payload
    const webhookPayload = AWSSESEmailProcessor.generateWebhookPayload(email, 'email_received');
    
    // Send to your service webhook endpoint
    await callServiceAPI('/api/webhooks/email-received', 'POST', webhookPayload);
    
    console.log(`Webhook sent for email: ${email.messageId}`);
  } catch (error) {
    console.error(`Failed to send webhook for email ${email.messageId}:`, error);
    // Don't throw error here - webhook failure shouldn't stop email processing
  }
}

async function callServiceAPI(endpoint: string, method: string, data: any): Promise<any> {
  const serviceUrl = process.env.SERVICE_URL || 'https://your-service.com';
  const apiKey = process.env.SERVICE_API_KEY;

  if (!apiKey) {
    throw new Error('SERVICE_API_KEY environment variable is required');
  }

  try {
    const response = await fetch(`${serviceUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'AWS-Lambda-Email-Processor/1.0',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error calling service API ${endpoint}:`, error);
    throw error;
  }
}
```

## Environment Variables

Configure these environment variables in your Lambda function:

```bash
# AWS Configuration
AWS_REGION=us-west-2

# Email Processing Configuration
ALLOWED_DOMAINS=yourdomain.com,anotherdomain.com
BLOCKED_SENDERS=spam@example.com,blocked@example.com
MAX_ATTACHMENT_SIZE=10485760
ENABLE_SPAM_FILTER=true
ENABLE_VIRUS_FILTER=true

# Service Integration
SERVICE_URL=https://your-service.com
SERVICE_API_KEY=your-api-key-here
```

## Lambda Function Configuration

### Runtime Settings
- **Runtime**: Node.js 20.x
- **Handler**: index.handler
- **Timeout**: 5 minutes (300 seconds)
- **Memory**: 512 MB (adjust based on email size and processing needs)

### IAM Role Permissions

The Lambda execution role needs these permissions:

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
    }
  ]
}
```

## Deployment Package Structure

```
lambda-package/
├── index.js                 # Compiled Lambda handler
├── lib/
│   └── aws-ses.js           # Compiled library
├── node_modules/            # Dependencies
└── package.json
```

## Building and Deploying

### Option 1: Using AWS CDK (Recommended)

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
      bucketName: 'your-email-bucket',
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{
        id: 'DeleteOldEmails',
        expiration: cdk.Duration.days(90),
      }],
    });

    // Lambda function
    const emailProcessor = new lambda.Function(this, 'EmailProcessor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/email-processor'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        AWS_REGION: this.region,
        ALLOWED_DOMAINS: 'yourdomain.com',
        SERVICE_URL: 'https://your-service.com',
        SERVICE_API_KEY: 'your-api-key',
      },
    });

    // Grant permissions
    emailBucket.grantRead(emailProcessor);
    emailProcessor.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendBounce'],
      resources: ['*'],
    }));

    // SES receipt rule
    const ruleSet = new ses.ReceiptRuleSet(this, 'EmailRuleSet', {
      receiptRuleSetName: 'email-processing-rules',
    });

    new ses.ReceiptRule(this, 'EmailRule', {
      ruleSet,
      recipients: ['yourdomain.com'],
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
    });
  }
}
```

### Option 2: Manual Deployment

1. **Build the package**:
```bash
# Compile TypeScript
npx tsc

# Create deployment package
zip -r email-processor.zip index.js lib/ node_modules/ package.json
```

2. **Deploy via AWS CLI**:
```bash
aws lambda create-function \
  --function-name email-processor \
  --runtime nodejs20.x \
  --role arn:aws:iam::ACCOUNT:role/lambda-execution-role \
  --handler index.handler \
  --zip-file fileb://email-processor.zip \
  --timeout 300 \
  --memory-size 512
```

## Testing

### Test Event

Create a test event in the Lambda console:

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
          "recipients": ["support@yourdomain.com"],
          "spamVerdict": {"status": "PASS"},
          "virusVerdict": {"status": "PASS"},
          "spfVerdict": {"status": "PASS"},
          "dkimVerdict": {"status": "PASS"},
          "dmarcVerdict": {"status": "PASS"},
          "action": {
            "type": "S3",
            "bucketName": "your-email-bucket",
            "objectKey": "emails/test-message-id"
          }
        },
        "mail": {
          "timestamp": "2023-01-01T12:00:00.000Z",
          "messageId": "test-message-id",
          "source": "customer@example.com",
          "destination": ["support@yourdomain.com"],
          "commonHeaders": {
            "from": ["customer@example.com"],
            "to": ["support@yourdomain.com"],
            "subject": "Test Support Request"
          }
        }
      }
    }
  ]
}
```

## Monitoring and Logging

### CloudWatch Metrics to Monitor
- Lambda function duration
- Lambda function errors
- Lambda function throttles
- Custom metrics for email processing

### Log Analysis
```bash
# View recent logs
aws logs tail /aws/lambda/email-processor --follow

# Search for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/email-processor \
  --filter-pattern "ERROR"
```

## Error Handling Best Practices

1. **Graceful Degradation**: Continue processing other emails if one fails
2. **Retry Logic**: Implement exponential backoff for API calls
3. **Dead Letter Queue**: Configure DLQ for failed Lambda invocations
4. **Alerting**: Set up CloudWatch alarms for high error rates
5. **Logging**: Include correlation IDs for tracking email processing

This example provides a complete, production-ready implementation for processing SES inbound emails using the AWS SES library. 