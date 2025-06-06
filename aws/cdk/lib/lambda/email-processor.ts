import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as Sentry from "@sentry/node";

// Initialize Sentry with logging enabled
Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://cc6673097b7fe8856211b5d531bab8d9@o4509397176745984.ingest.us.sentry.io/4509453372817408",
  environment: process.env.NODE_ENV || 'production',
  tracesSampleRate: 1.0,
  _experiments: {
    enableLogs: true,
  },
  integrations: [
    // Send console.log, console.error, and console.warn calls as logs to Sentry
    Sentry.consoleLoggingIntegration({ levels: ["log", "error", "warn"] }),
  ],
});

const { logger } = Sentry;
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });

/**
 * Fetch email content from S3
 */
async function getEmailFromS3(bucketName: string, objectKey: string): Promise<string | null> {
  try {
    logger.info(logger.fmt`Fetching email from S3: ${bucketName}/${objectKey}`, {
      operation: 'getEmailFromS3',
      bucket: bucketName,
      key: objectKey
    });
    
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    const response = await s3Client.send(command);
    
    if (!response.Body) {
      logger.error('No email content found in S3 object', {
        operation: 'getEmailFromS3',
        bucket: bucketName,
        key: objectKey,
        issue: 'empty_response_body'
      });
      return null;
    }

    // Convert stream to string
    const chunks: Uint8Array[] = [];
    const reader = response.Body.transformToWebStream().getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const emailContent = Buffer.concat(chunks).toString('utf-8');
    logger.info(logger.fmt`Successfully fetched email content (${emailContent.length} bytes)`, {
      operation: 'getEmailFromS3',
      bucket: bucketName,
      key: objectKey,
      contentSize: emailContent.length,
      success: true
    });
    
    return emailContent;
  } catch (error) {
    logger.error(logger.fmt`Error fetching email from S3: ${bucketName}/${objectKey}`, {
      operation: 'getEmailFromS3',
      bucket: bucketName,
      key: objectKey,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Also capture the exception in Sentry
    Sentry.captureException(error, {
      tags: {
        operation: 'getEmailFromS3',
        bucket: bucketName,
        key: objectKey
      }
    });
    
    return null;
  }
}

export const handler = async (event: any, context: any) => {
  // Set Sentry context for this Lambda invocation
  Sentry.setContext("lambda", {
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    requestId: context.awsRequestId,
    remainingTimeInMillis: context.getRemainingTimeInMillis()
  });

  logger.info('Received SES email event', {
    operation: 'handler',
    eventType: 'ses_email',
    recordCount: event.Records?.length || 0
  });
  
  logger.debug('Event details', {
    operation: 'handler',
    event: JSON.stringify(event, null, 2)
  });

  const serviceApiUrl = process.env.SERVICE_API_URL;
  const serviceApiKey = process.env.SERVICE_API_KEY;
  const s3BucketName = process.env.S3_BUCKET_NAME;

  if (!serviceApiUrl || !serviceApiKey) {
    const error = new Error('Missing required environment variables: SERVICE_API_URL or SERVICE_API_KEY');
    logger.fatal('Missing required environment variables', {
      operation: 'handler',
      errorType: 'configuration',
      missingVars: {
        serviceApiUrl: !serviceApiUrl,
        serviceApiKey: !serviceApiKey
      }
    });
    
    Sentry.captureException(error, {
      tags: { errorType: 'configuration' }
    });
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Missing required environment variables',
        timestamp: new Date().toISOString(),
      }),
    };
  }

  if (!s3BucketName) {
    const error = new Error('Missing S3_BUCKET_NAME environment variable');
    logger.fatal('Missing S3_BUCKET_NAME environment variable', {
      operation: 'handler',
      errorType: 'configuration'
    });
    
    Sentry.captureException(error, {
      tags: { errorType: 'configuration' }
    });
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Missing S3_BUCKET_NAME environment variable',
        timestamp: new Date().toISOString(),
      }),
    };
  }

  try {
    // Process each SES record and fetch email content
    const processedRecords = [];
    
    for (const record of event.Records || []) {
      try {
        const sesData = record.ses;
        const messageId = sesData.mail.messageId;
        
        // Extract domain from recipient email
        const recipients = sesData.mail.destination || [];
        const recipientEmail = recipients[0] || '';
        const domain = recipientEmail.split('@')[1] || '';
        
        // Construct S3 object key based on SES receipt rule configuration
        // The receipt rule stores emails with prefix: emails/{domain}/
        const objectKey = `emails/${domain}/${messageId}`;
        
        logger.info(logger.fmt`Processing email: ${messageId}`, {
          operation: 'processSESRecord',
          messageId,
          recipientEmail,
          domain,
          objectKey
        });
        
        logger.debug(logger.fmt`S3 location: ${s3BucketName}/${objectKey}`, {
          operation: 'processSESRecord',
          messageId,
          s3Bucket: s3BucketName,
          s3Key: objectKey
        });
        
        // Fetch email content from S3
        const emailContent = await getEmailFromS3(s3BucketName, objectKey);
        
        processedRecords.push({
          ...record,
          emailContent: emailContent,
          s3Location: {
            bucket: s3BucketName,
            key: objectKey,
            contentFetched: emailContent !== null,
            contentSize: emailContent ? emailContent.length : 0
          }
        });
        
        logger.info(logger.fmt`Processed record for ${messageId}`, {
          operation: 'processSESRecord',
          messageId,
          contentFetched: emailContent !== null,
          contentSize: emailContent ? emailContent.length : 0,
          success: true
        });
      } catch (recordError) {
        const messageId = record?.ses?.mail?.messageId;
        logger.error(logger.fmt`Error processing SES record for ${messageId}`, {
          operation: 'processSESRecord',
          messageId,
          error: recordError instanceof Error ? recordError.message : 'Unknown error',
          stack: recordError instanceof Error ? recordError.stack : undefined
        });
        
        // Capture the exception in Sentry with context
        Sentry.captureException(recordError, {
          tags: {
            operation: 'processSESRecord',
            messageId
          }
        });
        
        // Include the record even if S3 fetch failed
        processedRecords.push({
          ...record,
          emailContent: null,
          s3Error: recordError instanceof Error ? recordError.message : 'Unknown error'
        });
      }
    }
    
    // Forward the enhanced event to the webhook
    const webhookUrl = `${serviceApiUrl}/api/inbound/webhook`;
    
    logger.info(logger.fmt`Forwarding ${processedRecords.length} processed records to webhook: ${webhookUrl}`, {
      operation: 'webhook',
      webhookUrl,
      recordCount: processedRecords.length
    });
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceApiKey}`,
        'User-Agent': 'AWS-Lambda-Email-Forwarder/1.0',
      },
      body: JSON.stringify({
        type: 'ses_event_with_content',
        timestamp: new Date().toISOString(),
        originalEvent: event,
        processedRecords: processedRecords,
        context: {
          functionName: context.functionName,
          functionVersion: context.functionVersion,
          requestId: context.awsRequestId,
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(logger.fmt`Webhook failed: ${response.status} ${response.statusText}`, {
        operation: 'webhook',
        statusCode: response.status,
        statusText: response.statusText,
        webhookUrl,
        errorResponse: errorText
      });
      
      // Capture webhook failure in Sentry
      Sentry.captureMessage(`Webhook request failed: ${response.status} ${response.statusText}`, {
        level: 'error',
        tags: {
          operation: 'webhook',
          statusCode: response.status
        },
        extra: {
          webhookUrl,
          errorResponse: errorText
        }
      });
      
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: 'Webhook request failed',
          status: response.status,
          statusText: response.statusText,
          timestamp: new Date().toISOString(),
        }),
      };
    }

    const result = await response.json();
    logger.info('Webhook response received', {
      operation: 'webhook',
      success: true,
      response: result
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Email event forwarded successfully',
        webhookResponse: result,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.fatal('Unhandled error in Lambda handler', {
      operation: 'handler',
      errorType: 'unhandled',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Capture the unhandled exception in Sentry
    Sentry.captureException(error, {
      tags: {
        operation: 'handler',
        errorType: 'unhandled'
      }
    });
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to forward email event',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
    };
  }
}; 