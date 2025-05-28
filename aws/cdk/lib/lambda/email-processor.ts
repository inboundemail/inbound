import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });

/**
 * Fetch email content from S3
 */
async function getEmailFromS3(bucketName: string, objectKey: string): Promise<string | null> {
  try {
    console.log(`📥 Lambda - Fetching email from S3: ${bucketName}/${objectKey}`);
    
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    const response = await s3Client.send(command);
    
    if (!response.Body) {
      console.error('❌ Lambda - No email content found in S3 object');
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
    console.log(`✅ Lambda - Successfully fetched email content (${emailContent.length} bytes)`);
    
    return emailContent;
  } catch (error) {
    console.error(`❌ Lambda - Error fetching email from S3: ${bucketName}/${objectKey}`, error);
    console.error('Error details:', {
      operation: 'getEmailFromS3',
      bucket: bucketName,
      key: objectKey,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
}

export const handler = async (event: any, context: any) => {
  console.log('📧 Lambda - Received SES email event');
  console.log('🔍 Lambda - Event details:', JSON.stringify(event, null, 2));

  const serviceApiUrl = process.env.SERVICE_API_URL;
  const serviceApiKey = process.env.SERVICE_API_KEY;
  const s3BucketName = process.env.S3_BUCKET_NAME;

  if (!serviceApiUrl || !serviceApiKey) {
    const error = new Error('Missing required environment variables: SERVICE_API_URL or SERVICE_API_KEY');
    console.error('❌ Lambda - ' + error.message);
    console.error('Configuration error:', { errorType: 'configuration' });
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
    console.error('❌ Lambda - ' + error.message);
    console.error('Configuration error:', { errorType: 'configuration' });
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
        
        console.log(`📨 Lambda - Processing email: ${messageId}`);
        console.log(`📍 Lambda - S3 location: ${s3BucketName}/${objectKey}`);
        
        // Log processing details for debugging
        console.log('Processing email details:', {
          messageId,
          recipientEmail,
          domain,
          objectKey
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
        
        console.log(`✅ Lambda - Processed record for ${messageId}`);
      } catch (recordError) {
        console.error('❌ Lambda - Error processing SES record:', recordError);
        console.error('Record processing error details:', {
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
    
    // Forward the enhanced event to the webhook
    const webhookUrl = `${serviceApiUrl}/api/inbound/webhook`;
    
    console.log(`🚀 Lambda - Forwarding ${processedRecords.length} processed records to webhook: ${webhookUrl}`);
    
    // Log webhook call details
    console.log('Webhook call details:', {
      url: webhookUrl,
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
      console.error(`❌ Lambda - Webhook failed: ${response.status} ${response.statusText}`);
      console.error(`❌ Lambda - Error response: ${errorText}`);
      
      // Log webhook failure details
      console.error('Webhook failure details:', {
        operation: 'webhook',
        statusCode: response.status,
        webhookUrl,
        errorResponse: errorText
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
    console.log('✅ Lambda - Webhook response:', result);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Email event forwarded successfully',
        webhookResponse: result,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('💥 Lambda - Error forwarding email event:', error);
    
    // Log unhandled error details
    console.error('Unhandled error details:', {
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