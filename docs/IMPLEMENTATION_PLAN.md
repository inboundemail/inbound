# AWS SES Email Receiving Implementation Plan

## Project Structure

```
inbound.exon.dev/
├── app/                    # Next.js frontend
├── lib/                    # Shared libraries
├── aws/                    # AWS infrastructure code
│   ├── cdk/               # CDK infrastructure
│   │   ├── bin/          # CDK app entry point
│   │   ├── lib/          # CDK stacks
│   │   └── test/         # CDK tests
│   ├── lambda/           # Lambda functions
│   │   ├── email-processor/
│   │   └── shared/       # Shared Lambda utilities
│   ├── package.json
│   └── tsconfig.json
├── docs/
│   ├── AWS_SETUP_GUIDE.md
│   └── IMPLEMENTATION_PLAN.md
└── README.md
```

## Phase 1: AWS Infrastructure Setup (Week 1)

### 1.1 CDK Project Setup

Create the CDK infrastructure:

```typescript
// aws/cdk/lib/inbound-email-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sesActions from 'aws-cdk-lib/aws-ses-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';

export interface InboundEmailStackProps extends cdk.StackProps {
  domainName: string;
  webhookEndpoint?: string;
}

export class InboundEmailStack extends cdk.Stack {
  public readonly emailBucket: s3.Bucket;
  public readonly emailProcessor: lambda.Function;
  public readonly receiptRuleSet: ses.ReceiptRuleSet;

  constructor(scope: Construct, id: string, props: InboundEmailStackProps) {
    super(scope, id, props);

    // S3 Bucket for temporary email storage
    this.emailBucket = new s3.Bucket(this, 'EmailBucket', {
      bucketName: `inbound-emails-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{
        id: 'DeleteEmailsAfter24Hours',
        expiration: cdk.Duration.days(1),
        prefix: 'emails/'
      }],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    // Lambda function for processing emails
    this.emailProcessor = new lambda.Function(this, 'EmailProcessor', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/email-processor'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: {
        EMAIL_BUCKET: this.emailBucket.bucketName,
        WEBHOOK_ENDPOINT: props.webhookEndpoint || '',
        LOG_LEVEL: 'info'
      },
      logRetention: logs.RetentionDays.ONE_WEEK
    });

    // Grant Lambda permissions
    this.emailBucket.grantReadWrite(this.emailProcessor);

    // SES Receipt Rule Set
    this.receiptRuleSet = new ses.ReceiptRuleSet(this, 'EmailReceiptRuleSet', {
      receiptRuleSetName: 'inbound-email-rules'
    });

    // Receipt Rule
    this.receiptRuleSet.addRule('ProcessInboundEmails', {
      enabled: true,
      scanEnabled: true,
      recipients: [`@${props.domainName}`],
      actions: [
        new sesActions.S3({
          bucket: this.emailBucket,
          objectKeyPrefix: 'emails/'
        }),
        new sesActions.Lambda({
          function: this.emailProcessor,
          invocationType: sesActions.LambdaInvocationType.EVENT
        })
      ]
    });

    // CloudWatch Alarms
    this.createAlarms();
  }

  private createAlarms() {
    const errorMetric = this.emailProcessor.metricErrors({
      period: cdk.Duration.minutes(5)
    });

    new cloudwatch.Alarm(this, 'EmailProcessingErrors', {
      metric: errorMetric,
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: 'Email processing errors detected'
    });
  }
}
```

### 1.2 Lambda Function Implementation

```typescript
// aws/lambda/email-processor/index.ts
import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { SESEvent, Context } from 'aws-lambda';
import { simpleParser } from 'mailparser';
import axios from 'axios';

const s3Client = new S3Client({});
const BUCKET_NAME = process.env.EMAIL_BUCKET!;
const WEBHOOK_ENDPOINT = process.env.WEBHOOK_ENDPOINT!;

interface EmailData {
  messageId: string;
  from: string;
  to: string[];
  subject: string;
  date: Date;
  text?: string;
  html?: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    content: string; // base64 encoded
  }>;
  headers: Record<string, string>;
}

export const handler = async (event: SESEvent, context: Context): Promise<void> => {
  console.log('Processing SES event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    try {
      await processEmail(record);
    } catch (error) {
      console.error('Error processing email:', error);
      throw error; // Let Lambda retry
    }
  }
};

async function processEmail(record: any): Promise<void> {
  const { ses } = record;
  const messageId = ses.mail.messageId;
  const objectKey = `emails/${messageId}`;

  console.log(`Processing email ${messageId} from S3 key: ${objectKey}`);

  // Get email from S3
  const getCommand = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: objectKey
  });

  const response = await s3Client.send(getCommand);
  const emailContent = await streamToString(response.Body);

  // Parse email
  const parsed = await simpleParser(emailContent);
  
  // Prepare email data
  const emailData: EmailData = {
    messageId,
    from: parsed.from?.text || '',
    to: parsed.to ? (Array.isArray(parsed.to) ? parsed.to.map(t => t.text) : [parsed.to.text]) : [],
    subject: parsed.subject || '',
    date: parsed.date || new Date(),
    text: parsed.text,
    html: parsed.html || undefined,
    attachments: parsed.attachments.map(att => ({
      filename: att.filename || 'unnamed',
      contentType: att.contentType,
      size: att.size,
      content: att.content.toString('base64')
    })),
    headers: Object.fromEntries(
      parsed.headers.entries()
    )
  };

  // Send to webhook endpoint
  if (WEBHOOK_ENDPOINT) {
    await sendToWebhook(emailData);
  }

  // Delete email from S3
  const deleteCommand = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: objectKey
  });
  await s3Client.send(deleteCommand);

  console.log(`Successfully processed email ${messageId}`);
}

async function sendToWebhook(emailData: EmailData): Promise<void> {
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(WEBHOOK_ENDPOINT, emailData, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.API_KEY || ''
        },
        timeout: 30000 // 30 seconds
      });

      if (response.status >= 200 && response.status < 300) {
        console.log(`Successfully sent email to webhook: ${response.status}`);
        return;
      }
    } catch (error) {
      lastError = error;
      console.error(`Webhook attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  throw new Error(`Failed to send to webhook after ${maxRetries} attempts: ${lastError}`);
}

async function streamToString(stream: any): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}
```

### 1.3 Package Dependencies

```json
// aws/lambda/email-processor/package.json
{
  "name": "email-processor",
  "version": "1.0.0",
  "description": "Lambda function to process inbound emails",
  "main": "index.js",
  "scripts": {
    "build": "tsc",
    "package": "npm run build && zip -r function.zip ."
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.400.0",
    "axios": "^1.5.0",
    "mailparser": "^3.6.5"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.119",
    "@types/node": "^20.5.0",
    "typescript": "^5.1.6"
  }
}
```

## Phase 2: Database Integration (Week 2)

### 2.1 Drizzle Schema

```typescript
// lib/db/schema.ts
import { pgTable, text, timestamp, jsonb, integer, boolean } from 'drizzle-orm/pg-core';

export const emailDomains = pgTable('email_domains', {
  id: text('id').primaryKey(),
  domain: text('domain').notNull().unique(),
  status: text('status').notNull(), // 'pending', 'verified', 'failed'
  verificationToken: text('verification_token'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  userId: text('user_id').notNull(),
});

export const emailAddresses = pgTable('email_addresses', {
  id: text('id').primaryKey(),
  address: text('address').notNull().unique(),
  domainId: text('domain_id').references(() => emailDomains.id),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  userId: text('user_id').notNull(),
});

export const receivedEmails = pgTable('received_emails', {
  id: text('id').primaryKey(),
  messageId: text('message_id').notNull().unique(),
  from: text('from').notNull(),
  to: jsonb('to').notNull(),
  subject: text('subject'),
  receivedAt: timestamp('received_at').notNull(),
  processedAt: timestamp('processed_at'),
  status: text('status').notNull(), // 'received', 'processing', 'forwarded', 'failed'
  metadata: jsonb('metadata'),
  userId: text('user_id').notNull(),
});

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: text('id').primaryKey(),
  emailId: text('email_id').references(() => receivedEmails.id),
  endpoint: text('endpoint').notNull(),
  status: text('status').notNull(), // 'pending', 'success', 'failed'
  attempts: integer('attempts').default(0),
  lastAttemptAt: timestamp('last_attempt_at'),
  responseCode: integer('response_code'),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### 2.2 Better-Auth Integration

```typescript
// lib/auth.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg'
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }
  }
});
```

## Phase 3: API Development (Week 3)

### 3.1 API Routes

```typescript
// app/api/domains/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailDomains } from '@/lib/db/schema';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const domains = await db
    .select()
    .from(emailDomains)
    .where(eq(emailDomains.userId, session.user.id));

  return NextResponse.json({ domains });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { domain } = await req.json();

  // Verify domain ownership via DNS TXT record
  const verificationToken = generateVerificationToken();
  
  const newDomain = await db.insert(emailDomains).values({
    id: generateId(),
    domain,
    status: 'pending',
    verificationToken,
    userId: session.user.id
  }).returning();

  return NextResponse.json({ 
    domain: newDomain[0],
    verificationInstructions: {
      txtRecord: `_inbound-verification.${domain}`,
      txtValue: verificationToken
    }
  });
}
```

## Phase 4: Frontend Development (Week 4)

### 4.1 Dashboard Components

```typescript
// app/components/DomainManager.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export function DomainManager() {
  const [domains, setDomains] = useState([]);
  const [newDomain, setNewDomain] = useState('');

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    const res = await fetch('/api/domains');
    const data = await res.json();
    setDomains(data.domains);
  };

  const addDomain = async () => {
    const res = await fetch('/api/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: newDomain })
    });

    if (res.ok) {
      setNewDomain('');
      fetchDomains();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Domains</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="example.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
            />
            <Button onClick={addDomain}>Add Domain</Button>
          </div>

          <div className="space-y-2">
            {domains.map((domain) => (
              <div key={domain.id} className="flex justify-between items-center p-3 border rounded">
                <span>{domain.domain}</span>
                <Badge variant={domain.status === 'verified' ? 'success' : 'warning'}>
                  {domain.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

## Deployment Checklist

### Pre-deployment
- [ ] AWS Account setup complete
- [ ] Domain DNS access confirmed
- [ ] Environment variables configured
- [ ] Database provisioned (PostgreSQL)
- [ ] SSL certificates ready

### Deployment Steps
1. Deploy CDK infrastructure: `cd aws && npx cdk deploy`
2. Verify domain in SES console
3. Update DNS records (MX, TXT, DKIM)
4. Deploy Lambda function
5. Activate SES receipt rule set
6. Deploy Next.js application
7. Configure monitoring alerts

### Post-deployment
- [ ] Send test emails
- [ ] Verify Lambda logs in CloudWatch
- [ ] Test webhook delivery
- [ ] Monitor error rates
- [ ] Set up backup procedures

## Security Considerations

1. **Email Address Obfuscation**
   - Never expose receiving email addresses
   - Use UUID-based addresses: `abc123@inbound.domain.com`
   - Rotate addresses periodically

2. **Rate Limiting**
   ```typescript
   // Lambda concurrency limit
   const emailProcessor = new lambda.Function(this, 'EmailProcessor', {
     reservedConcurrentExecutions: 100 // Limit concurrent executions
   });
   ```

3. **Webhook Security**
   - Implement HMAC signature verification
   - Use API keys with rotation
   - Whitelist client IPs if possible

4. **Data Retention**
   - S3 lifecycle policies (24-hour retention)
   - Database cleanup jobs
   - GDPR compliance considerations

## Monitoring & Operations

### Key Metrics
1. **Email Volume**: Track incoming email rate
2. **Processing Latency**: Time from receipt to webhook delivery
3. **Error Rate**: Failed processing or delivery
4. **Storage Usage**: S3 and database growth

### Operational Procedures
1. **Daily Checks**
   - Review CloudWatch dashboards
   - Check error logs
   - Verify domain status

2. **Weekly Tasks**
   - Review cost reports
   - Update documentation
   - Security audit

3. **Monthly Tasks**
   - Rotate API keys
   - Review and optimize Lambda performance
   - Update dependencies

## Cost Optimization

1. **Lambda Optimization**
   - Right-size memory allocation
   - Implement efficient email parsing
   - Use Lambda layers for dependencies

2. **S3 Cost Management**
   - Aggressive lifecycle policies
   - Use S3 Intelligent-Tiering
   - Monitor large attachments

3. **Database Optimization**
   - Index frequently queried fields
   - Implement data archival
   - Use read replicas for analytics

## Future Enhancements

1. **Phase 5: Advanced Features**
   - Email filtering and routing rules
   - Attachment scanning and processing
   - Auto-responders
   - Email analytics dashboard

2. **Phase 6: Scale & Performance**
   - Multi-region deployment
   - Redis caching layer
   - Elasticsearch for email search
   - Real-time notifications via WebSockets

3. **Phase 7: Enterprise Features**
   - SAML/SSO integration
   - Audit logging
   - Compliance reporting
   - White-label support 