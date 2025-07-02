// THIS IS THE PRIMARY LAMBDA FUNCTION FOR PROCESSING EMAILS

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });

/**
 * Fetch email content from S3
 */
async function getEmailFromS3(bucketName: string, objectKey: string, suppressNotFoundErrors: boolean = false, requestId?: string): Promise<string | null> {
  try {
    if (!suppressNotFoundErrors) {
      console.log(`📥 ${requestId ? `${requestId}|` : ''}Lambda - Fetching email from S3: ${bucketName}/${objectKey}`);
    }

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      console.error(`❌ ${requestId ? `${requestId}|` : ''}Lambda - No email content found in S3 object`);
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
    
    if (!suppressNotFoundErrors) {
      console.log(`✅ ${requestId ? `${requestId}|` : ''}Lambda - Successfully fetched email content (${emailContent.length} bytes)`);
    }

    return emailContent;
  } catch (error) {
    // Handle NoSuchKey errors more quietly during fallback searches
    if (error instanceof Error && error.name === 'NoSuchKey') {
      if (suppressNotFoundErrors) {
        console.log(`📭 ${requestId ? `${requestId}|` : ''}Lambda - Email not found at: ${bucketName}/${objectKey} (checking other locations...)`);
        return null;
      } else {
        console.error(`❌ ${requestId ? `${requestId}|` : ''}Lambda - S3 object not found: ${bucketName}/${objectKey}`);
        console.error(`❌ ${requestId ? `${requestId}|` : ''}Lambda - This usually means the S3 object key in the SES receipt rule doesn\'t match the actual stored location`);
      }
    } else {
      console.error(`❌ ${requestId ? `${requestId}|` : ''}Lambda - Error fetching email from S3: ${bucketName}/${objectKey}`, error);
      
      // Provide more specific error information for other errors
      if (error instanceof Error) {
        if (error.name === 'NoSuchBucket') {
          console.error(`❌ ${requestId ? `${requestId}|` : ''}Lambda - S3 bucket not found: ${bucketName}`);
        } else if (error.name === 'AccessDenied') {
          console.error(`❌ ${requestId ? `${requestId}|` : ''}Lambda - Access denied to S3 object: ${bucketName}/${objectKey}`);
          console.error(`❌ ${requestId ? `${requestId}|` : ''}Lambda - Check Lambda function S3 permissions`);
        }
      }
      
      console.error(`❌ ${requestId ? `${requestId}|` : ''}Error details:`, {
        operation: 'getEmailFromS3',
        bucket: bucketName,
        key: objectKey,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorCode: (error as any)?.Code || 'Unknown'
      });
    }

    return null;
  }
}

/**
 * Send webhook request to a specific URL
 */
async function sendWebhookRequest(
  webhookUrl: string,
  serviceApiKey: string,
  payload: any,
  context: any,
  requestId?: string
): Promise<{ success: boolean; response?: any; error?: string; statusCode?: number }> {
  try {
    console.log(`🚀 ${requestId ? `${requestId}|` : ''}Lambda - Sending webhook request to: ${webhookUrl}`);

    // Log webhook call details
    console.log(`🔍 ${requestId ? `${requestId}|` : ''}Webhook call details:`, {
      url: webhookUrl,
      recordCount: payload.processedRecords?.length || 0
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
        originalEvent: payload.originalEvent,
        processedRecords: payload.processedRecords,
        context: {
          functionName: context.functionName,
          functionVersion: context.functionVersion,
          requestId: context.awsRequestId,
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ ${requestId ? `${requestId}|` : ''}Lambda - Webhook failed: ${response.status} ${response.statusText}`);
      console.error(`❌ ${requestId ? `${requestId}|` : ''}Lambda - Error response: ${errorText}`);

      // Log webhook failure details
      console.error(`❌ ${requestId ? `${requestId}|` : ''}Webhook failure details:`, {
        operation: 'webhook',
        statusCode: response.status,
        webhookUrl,
        errorResponse: errorText
      });

      return {
        success: false,
        error: `Webhook request failed: ${response.status} ${response.statusText}`,
        statusCode: response.status
      };
    }

    const result = await response.json();
    console.log(`✅ ${requestId ? `${requestId}|` : ''}Lambda - Webhook response:`, result);

    return {
      success: true,
      response: result
    };
  } catch (error) {
    console.error(`❌ ${requestId ? `${requestId}|` : ''}Lambda - Error sending webhook request to ${webhookUrl}:`, error);
    console.error(`❌ ${requestId ? `${requestId}|` : ''}Webhook error details:`, {
      operation: 'sendWebhookRequest',
      webhookUrl,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export const handler = async (event: any, context: any) => {
  const requestId = context.awsRequestId;
  console.log(`📧 ${requestId}|Lambda - Received SES email event`);
  console.log(`🆔 REQUEST_START|${requestId}|Starting email processing request`);
  console.log(`🔍 ${requestId}|Lambda - Event details:`, JSON.stringify(event, null, 2));

  const serviceApiUrl = process.env.SERVICE_API_URL;
  const serviceApiUrlDev = process.env.SERVICE_API_URL_DEV;
  const serviceApiKey = process.env.SERVICE_API_KEY;
  const s3BucketName = process.env.S3_BUCKET_NAME;

  if (!serviceApiUrl || !serviceApiKey) {
    const error = new Error('Missing required environment variables: SERVICE_API_URL or SERVICE_API_KEY');
    console.error(`❌ ${requestId}|Lambda - ` + error.message);
    console.error(`❌ ${requestId}|Configuration error:`, { errorType: 'configuration' });

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
    console.error(`❌ ${requestId}|Lambda - ` + error.message);
    console.error(`❌ ${requestId}|Configuration error:`, { errorType: 'configuration' });

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
    const processedRecords: any[] = [];

    for (const record of event.Records || []) {
      try {
        const sesData = record.ses;
        const messageId = sesData.mail.messageId;
        const subject = sesData.mail.commonHeaders?.subject || 'No Subject';

        // Extract domain from recipient email
        const recipients = sesData.mail.destination || [];
        const recipientEmail = recipients[0] || '';
        const domain = recipientEmail.split('@')[1] || '';
        
        // Try to get S3 object key from SES receipt action first
        let objectKey = sesData.receipt?.action?.objectKey;
        let s3Bucket = sesData.receipt?.action?.bucketName || s3BucketName;

        console.log(`📨 ${requestId}|Lambda - Processing email: ${messageId}`);
        console.log(`📧 EMAIL_TARGET|${requestId}|${recipientEmail}|Processing email for ${recipientEmail}`);
        console.log(`🔍 ${requestId}|Lambda - SES provided object key: ${objectKey || 'NOT PROVIDED'}`);

        // If SES didn't provide the object key, we need to determine the correct location
        // Check both individual and catch-all locations
        let emailContent = null;
        
        if (!objectKey) {
          console.log(`⚠️ ${requestId}|Lambda - No S3 object key in SES event, will check both possible locations`);
          
          // Possible locations for the email:
          // 1. Individual email rule: emails/{domain}/{messageId}
          // 2. Catch-all rule: emails/{domain}/catchall/{messageId}
          const possibleKeys = [
            `emails/${domain}/${messageId}`,           // Individual rule location
            `emails/${domain}/catchall/${messageId}`   // Catch-all rule location
          ];

          console.log(`🔍 ${requestId}|Lambda - Will check these S3 locations:`, possibleKeys);

          // Try each location until we find the email
          let foundKey = null;

          for (const testKey of possibleKeys) {
            const content = await getEmailFromS3(s3Bucket, testKey, true, requestId); // Suppress "not found" errors during search
            if (content !== null) {
              emailContent = content;
              foundKey = testKey;
              console.log(`✅ ${requestId}|Lambda - Found email at: ${s3Bucket}/${testKey}`);
              break;
            }
          }

          if (!foundKey) {
            console.error(`❌ ${requestId}|Lambda - Email not found in any expected location for message ${messageId}`);
            console.error(`❌ ${requestId}|Lambda - Checked locations:`, possibleKeys.map(key => `${s3Bucket}/${key}`));
            throw new Error(`Email content not found in S3 for message ${messageId}`);
          }

          objectKey = foundKey;
        } else {
          // SES provided the object key, validate it exists
          if (!s3Bucket) {
            console.error(`❌ ${requestId}|Lambda - Missing S3 bucket name for message ${messageId}`);
            throw new Error(`Missing S3 bucket name for message ${messageId}`);
          }

          console.log(`📍 ${requestId}|Lambda - Using SES provided S3 location: ${s3Bucket}/${objectKey}`);
          
          // Fetch email content using the SES-provided key
          emailContent = await getEmailFromS3(s3Bucket, objectKey, false, requestId);
        }

        // Log processing details for debugging
        console.log(`🔍 ${requestId}|Processing email details:`, {
          messageId,
          recipientEmail,
          domain,
          objectKey,
          s3BucketFromReceipt: sesData.receipt?.action?.bucketName,
          s3BucketFromEnv: s3BucketName,
          s3BucketUsed: s3Bucket,
          objectKeySource: sesData.receipt?.action?.objectKey ? 'SES_EVENT' : 'FALLBACK_SEARCH',
          emailContentFound: emailContent !== null,
          emailContentSize: emailContent ? emailContent.length : 0
        });

        processedRecords.push({
          ...record,
          emailContent: emailContent,
          s3Location: {
            bucket: s3Bucket,
            key: objectKey,
            contentFetched: emailContent !== null,
            contentSize: emailContent ? emailContent.length : 0
          }
        });

        console.log(`✅ ${requestId}|Lambda - Processed record for ${messageId}`);
      } catch (recordError) {
        console.error(`❌ ${requestId}|Lambda - Error processing SES record:`, recordError);
        console.error(`❌ ${requestId}|Record processing error details:`, {
          operation: 'processSESRecord',
          messageId: record?.ses?.mail?.messageId,
          error: recordError instanceof Error ? recordError.message : 'Unknown error'
        });

        // Include the record even if S3 fetch failed
        processedRecords.push({
          ...record,
          emailContent: null,
          s3Error: recordError instanceof Error ? recordError.message : 'Unknown error'
        });
      }
    }

    // Check if any email subject starts with [[[DEV||| to determine which API URL to use
    const hasDevSubject = processedRecords.some(record => {
      const subject = record?.ses?.mail?.commonHeaders?.subject || '';
      return subject.startsWith('[[[DEV|||');
    });

    // Use dev URL if subject starts with [[[DEV||| and dev URL is configured
    const targetApiUrl = hasDevSubject && serviceApiUrlDev ? serviceApiUrlDev : serviceApiUrl;

    // Build list of endpoints, filtering out null/undefined values
    const endpoints = [targetApiUrl].filter(Boolean);
    
    console.log(`🚀 ${requestId}|Lambda - Will attempt to send to ${endpoints.length} endpoints:`, endpoints);

    if (hasDevSubject) {
      console.log(`🧪 ${requestId}|Lambda - Dev subject detected ([[[DEV|||), using development API URL:`, {
        usingDevUrl: !!serviceApiUrlDev,
        targetApiUrl
      });
    }
    
    // Send to all endpoints in parallel and collect results
    console.log(`🚀 ${requestId}|Lambda - Sending ${processedRecords.length} processed records to ${endpoints.length} endpoints in parallel`);
    
    const webhookPromises = endpoints.map(endpoint => 
      sendWebhookRequest(
        `${endpoint}/api/inbound/webhook`,
        serviceApiKey,
        {
          originalEvent: event,
          processedRecords: processedRecords
        },
        context,
        requestId
      ).then(result => ({
        endpoint,
        ...result
      }))
    );

    // Wait for all webhook requests to complete (both successful and failed)
    const settledResults = await Promise.allSettled(webhookPromises);
    
    // Process results and extract actual webhook responses
    const webhookResults = settledResults.map((result, index) => {
      const endpoint = endpoints[index];
      
      if (result.status === 'fulfilled') {
        const webhookResult = result.value;
        if (webhookResult.success) {
          console.log(`✅ ${requestId}|Lambda - Successfully sent to ${endpoint}`);
        } else {
          console.error(`❌ ${requestId}|Lambda - Failed to send to ${endpoint}: ${webhookResult.error}`);
        }
        return webhookResult;
      } else {
        // Promise was rejected (network error, etc.)
        console.error(`❌ ${requestId}|Lambda - Promise rejected for ${endpoint}: ${result.reason}`);
        return {
          endpoint,
          success: false,
          error: result.reason instanceof Error ? result.reason.message : 'Promise rejected'
        };
      }
    });

    const hasSuccessfulWebhook = webhookResults.some(result => result.success);

    // Log summary of all webhook attempts
    console.log(`📊 ${requestId}|Lambda - Webhook summary:`, {
      totalEndpoints: endpoints.length,
      successfulWebhooks: webhookResults.filter(r => r.success).length,
      failedWebhooks: webhookResults.filter(r => !r.success).length,
      results: webhookResults.map(r => ({ endpoint: r.endpoint, success: r.success, error: r.error }))
    });

    // Return success if at least one webhook succeeded
    if (hasSuccessfulWebhook) {
      console.log(`✅ REQUEST_COMPLETE|${requestId}|SUCCESS|Request completed successfully`);
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Email event forwarded successfully',
          webhookResults: webhookResults,
          successfulEndpoints: webhookResults.filter(r => r.success).length,
          totalEndpoints: endpoints.length,
          timestamp: new Date().toISOString(),
        }),
      };
    } else {
      // All webhooks failed
      console.log(`❌ REQUEST_COMPLETE|${requestId}|FAILED|All webhook requests failed`);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'All webhook requests failed',
          webhookResults: webhookResults,
          timestamp: new Date().toISOString(),
        }),
      };
    }
  } catch (error) {
    console.error(`💥 ${requestId}|Lambda - Error forwarding email event:`, error);

    // Log unhandled error details
    console.error(`💥 ${requestId}|Unhandled error details:`, {
      operation: 'handler',
      errorType: 'unhandled',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
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