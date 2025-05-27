# AWS SES Email Receiving Implementation

This directory contains the complete implementation for AWS SES email receiving with Lambda processing for the Inbound project.

## 📋 Overview

This implementation provides a robust, scalable solution for receiving and processing emails using AWS SES, S3, and Lambda. The system supports **dynamic email address management** via your API, where you can add domains and email addresses programmatically, and the system will automatically receive and process emails for those addresses.

## 🏗️ Architecture

```
Your API (Add Email) → SES Receipt Rules → Email Received → S3 Storage → Lambda → Webhook to Your API
                                                                              ↓
Your API (Get Email) ← S3 Retrieval ← Email Processing Request
```

### Key Components

1. **Your API**: Manages email addresses and receives webhook notifications
2. **AWS SES**: Receives emails for managed addresses and performs spam/virus filtering
3. **S3 Bucket**: Stores email content (up to 40MB per email) with metadata
4. **Lambda Function**: Validates recipients and sends webhooks to your API
5. **Dynamic Management**: Add/remove email addresses via API calls

## 📁 Files and Documentation

### Core Implementation
- [`lib/aws-ses.ts`](../lib/aws-ses.ts) - Main library for SES email processing with API integration
- [`docs/DYNAMIC_EMAIL_MANAGEMENT.md`](./DYNAMIC_EMAIL_MANAGEMENT.md) - **NEW**: Dynamic email management system guide
- [`docs/LAMBDA_DEPLOYMENT.md`](./LAMBDA_DEPLOYMENT.md) - **NEW**: Complete Lambda deployment guide
- [`docs/AWS_SES_EMAIL_RECEIVING_SETUP.md`](./AWS_SES_EMAIL_RECEIVING_SETUP.md) - Complete AWS SES setup guide
- [`docs/LAMBDA_FUNCTION_EXAMPLE.md`](./LAMBDA_FUNCTION_EXAMPLE.md) - Lambda implementation example

### Key Features

✅ **Dynamic Email Management** - Add/remove email addresses via API  
✅ **Single Lambda Architecture** - Cost-efficient, maintainable solution  
✅ **Real-time Webhooks** - Instant notifications when emails are received  
✅ **S3 Email Storage** - Reliable storage with on-demand retrieval  
✅ **Spam/Virus Filtering** - Built-in AWS SES security features  
✅ **Attachment Processing** - Handle email attachments up to 10MB  
✅ **Recipient Validation** - Only process emails for managed addresses  
✅ **Error Handling** - Graceful failure handling and bounce management  
✅ **TypeScript Support** - Full type safety and IntelliSense  

## 🚀 Quick Start

### 1. Install Dependencies
```bash
bun add @aws-sdk/client-s3 @aws-sdk/client-ses mailparser
bun add -D @types/mailparser
```

### 2. Configure AWS SES
Follow the [setup guide](./AWS_SES_EMAIL_RECEIVING_SETUP.md) to:
- Verify your domain
- Set up MX records
- Create S3 bucket with proper permissions
- Configure SES receipt rules

### 3. Deploy Lambda Function
Use the [Lambda example](./LAMBDA_FUNCTION_EXAMPLE.md) to:
- Create Lambda function
- Configure IAM permissions
- Set environment variables
- Deploy and test

### 4. Use the Library
```typescript
import { handleSESEvent, EmailProcessingConfig } from '@/lib/aws-ses';

const config: EmailProcessingConfig = {
  serviceApiUrl: process.env.SERVICE_API_URL!,
  serviceApiKey: process.env.SERVICE_API_KEY!,
  enableSpamFilter: true,
  enableVirusFilter: true,
};

export const handler = async (event: any) => {
  // This will automatically:
  // 1. Check if recipients are managed via your API
  // 2. Send webhooks to your API for valid emails
  const processedEmails = await handleSESEvent(event, config);
  
  console.log(`Processed ${processedEmails.length} emails`);
};
```

### 5. Retrieve Emails in Your API
```typescript
import { getEmailFromS3, getEmailMetadata } from '@/lib/aws-ses';

// Get full email content
const email = await getEmailFromS3(bucket, key);

// Get just metadata (faster)
const metadata = await getEmailMetadata(bucket, key);
```

## 📧 Dynamic Email Management

The system validates emails against your managed addresses:

| Component | Function | Description |
|-----------|----------|-------------|
| **API Check** | `/api/emails/check-recipient` | Validates if email address is managed |
| **Webhook** | `/api/webhooks/email-received` | Receives email notifications |
| **S3 Retrieval** | `getEmailFromS3()` | Fetches full email content |
| **Metadata** | `getEmailMetadata()` | Gets email preview/summary |
| **Management** | `/api/emails/addresses` | Add/remove email addresses |

## 🔧 Configuration Options

```typescript
interface EmailProcessingConfig {
  s3Region?: string;              // AWS region for S3
  sesRegion?: string;             // AWS region for SES
  serviceApiUrl?: string;         // Your API URL for validation/webhooks
  serviceApiKey?: string;         // API key for authentication
  allowedDomains?: string[];      // Fallback allowed domains
  blockedSenders?: string[];      // Blocked sender addresses
  maxAttachmentSize?: number;     // Max attachment size in bytes
  enableSpamFilter?: boolean;     // Enable spam filtering
  enableVirusFilter?: boolean;    // Enable virus filtering
}
```

## 🛡️ Security Features

- **Spam Detection**: AWS SES built-in spam filtering
- **Virus Scanning**: AWS SES malware detection
- **Authentication**: SPF, DKIM, and DMARC validation
- **Domain Filtering**: Allow/block specific domains
- **Sender Blocking**: Block specific email addresses
- **Attachment Limits**: Configurable size limits

## 📊 Monitoring

### CloudWatch Metrics
- `SES/Receipt/Received` - Emails received
- `SES/Receipt/PublishSuccess` - Successful processing
- `SES/Receipt/PublishFailure` - Processing failures
- `Lambda/Duration` - Processing time
- `Lambda/Errors` - Lambda errors

### Recommended Alarms
- Lambda error rate > 5%
- SES receipt rule failures
- High email volume spikes
- S3 access denied errors

## 💰 Cost Optimization

### Email Size Limits
- **S3 Storage**: 40 MB maximum per email
- **SNS Notifications**: 150 KB maximum per email

### Lambda Optimization
- Use asynchronous invocation when possible
- Right-size memory allocation (512 MB recommended)
- Implement efficient error handling

### S3 Storage
- Use lifecycle policies for old emails
- Consider S3 Intelligent Tiering
- Archive to Glacier for long-term storage

## 🔍 Troubleshooting

### Common Issues

1. **Access Denied Errors**
   - Check S3 bucket policy
   - Verify IAM permissions
   - Ensure correct AWS account ID

2. **Lambda Not Triggered**
   - Verify SES rule configuration
   - Check Lambda permissions
   - Review CloudWatch logs

3. **Email Not Stored**
   - Check S3 bucket policy
   - Verify SES rule actions
   - Monitor SES metrics

### Debug Steps
1. Check CloudWatch logs for Lambda function
2. Verify SES receipt rule metrics
3. Test with simple email first
4. Use SES message events for tracking

## 📚 Additional Resources

- [AWS SES Email Receiving Documentation](https://docs.aws.amazon.com/ses/latest/dg/receiving-email.html)
- [AWS SES Permissions Guide](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-permissions.html)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [AWS SES Regions and Endpoints](https://docs.aws.amazon.com/general/latest/gr/ses.html)

## 🤝 Support

For questions or issues:
1. Check the troubleshooting section
2. Review AWS CloudWatch logs
3. Consult AWS SES documentation
4. Contact your development team

---

**Note**: This implementation is designed for production use with proper error handling, monitoring, and security features. Make sure to test thoroughly in a development environment before deploying to production. 