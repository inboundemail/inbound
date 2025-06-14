"use strict";
// THIS IS THE PRIMARY LAMBDA FUNCTION FOR PROCESSING EMAILS
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3Client = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
/**
 * Fetch email content from S3
 */
async function getEmailFromS3(bucketName, objectKey, suppressNotFoundErrors = false) {
    try {
        if (!suppressNotFoundErrors) {
            console.log(`📥 Lambda - Fetching email from S3: ${bucketName}/${objectKey}`);
        }
        const command = new client_s3_1.GetObjectCommand({
            Bucket: bucketName,
            Key: objectKey,
        });
        const response = await s3Client.send(command);
        if (!response.Body) {
            console.error('❌ Lambda - No email content found in S3 object');
            return null;
        }
        // Convert stream to string
        const chunks = [];
        const reader = response.Body.transformToWebStream().getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            chunks.push(value);
        }
        const emailContent = Buffer.concat(chunks).toString('utf-8');
        if (!suppressNotFoundErrors) {
            console.log(`✅ Lambda - Successfully fetched email content (${emailContent.length} bytes)`);
        }
        return emailContent;
    }
    catch (error) {
        // Handle NoSuchKey errors more quietly during fallback searches
        if (error instanceof Error && error.name === 'NoSuchKey') {
            if (suppressNotFoundErrors) {
                console.log(`📭 Lambda - Email not found at: ${bucketName}/${objectKey} (checking other locations...)`);
                return null;
            }
            else {
                console.error(`❌ Lambda - S3 object not found: ${bucketName}/${objectKey}`);
                console.error('❌ Lambda - This usually means the S3 object key in the SES receipt rule doesn\'t match the actual stored location');
            }
        }
        else {
            console.error(`❌ Lambda - Error fetching email from S3: ${bucketName}/${objectKey}`, error);
            // Provide more specific error information for other errors
            if (error instanceof Error) {
                if (error.name === 'NoSuchBucket') {
                    console.error(`❌ Lambda - S3 bucket not found: ${bucketName}`);
                }
                else if (error.name === 'AccessDenied') {
                    console.error(`❌ Lambda - Access denied to S3 object: ${bucketName}/${objectKey}`);
                    console.error('❌ Lambda - Check Lambda function S3 permissions');
                }
            }
            console.error('Error details:', {
                operation: 'getEmailFromS3',
                bucket: bucketName,
                key: objectKey,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                errorCode: error?.Code || 'Unknown'
            });
        }
        return null;
    }
}
/**
 * Send webhook request to a specific URL
 */
async function sendWebhookRequest(webhookUrl, serviceApiKey, payload, context) {
    try {
        console.log(`🚀 Lambda - Sending webhook request to: ${webhookUrl}`);
        // Log webhook call details
        console.log('Webhook call details:', {
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
                success: false,
                error: `Webhook request failed: ${response.status} ${response.statusText}`,
                statusCode: response.status
            };
        }
        const result = await response.json();
        console.log('✅ Lambda - Webhook response:', result);
        return {
            success: true,
            response: result
        };
    }
    catch (error) {
        console.error(`❌ Lambda - Error sending webhook request to ${webhookUrl}:`, error);
        console.error('Webhook error details:', {
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
const handler = async (event, context) => {
    console.log('📧 Lambda - Received SES email event');
    console.log('🔍 Lambda - Event details:', JSON.stringify(event, null, 2));
    const serviceApiUrl = process.env.SERVICE_API_URL;
    const serviceApiUrlDev = process.env.SERVICE_API_URL_DEV;
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
                const subject = sesData.mail.commonHeaders?.subject || 'No Subject';
                // Extract domain from recipient email
                const recipients = sesData.mail.destination || [];
                const recipientEmail = recipients[0] || '';
                const domain = recipientEmail.split('@')[1] || '';
                // Try to get S3 object key from SES receipt action first
                let objectKey = sesData.receipt?.action?.objectKey;
                let s3Bucket = sesData.receipt?.action?.bucketName || s3BucketName;
                console.log(`📨 Lambda - Processing email: ${messageId}`);
                console.log(`🔍 Lambda - SES provided object key: ${objectKey || 'NOT PROVIDED'}`);
                // If SES didn't provide the object key, we need to determine the correct location
                // Check both individual and catch-all locations
                let emailContent = null;
                if (!objectKey) {
                    console.log(`⚠️ Lambda - No S3 object key in SES event, will check both possible locations`);
                    // Possible locations for the email:
                    // 1. Individual email rule: emails/{domain}/{messageId}
                    // 2. Catch-all rule: emails/{domain}/catchall/{messageId}
                    const possibleKeys = [
                        `emails/${domain}/${messageId}`,
                        `emails/${domain}/catchall/${messageId}` // Catch-all rule location
                    ];
                    console.log(`🔍 Lambda - Will check these S3 locations:`, possibleKeys);
                    // Try each location until we find the email
                    let foundKey = null;
                    for (const testKey of possibleKeys) {
                        const content = await getEmailFromS3(s3Bucket, testKey, true); // Suppress "not found" errors during search
                        if (content !== null) {
                            emailContent = content;
                            foundKey = testKey;
                            console.log(`✅ Lambda - Found email at: ${s3Bucket}/${testKey}`);
                            break;
                        }
                    }
                    if (!foundKey) {
                        console.error(`❌ Lambda - Email not found in any expected location for message ${messageId}`);
                        console.error(`❌ Lambda - Checked locations:`, possibleKeys.map(key => `${s3Bucket}/${key}`));
                        throw new Error(`Email content not found in S3 for message ${messageId}`);
                    }
                    objectKey = foundKey;
                }
                else {
                    // SES provided the object key, validate it exists
                    if (!s3Bucket) {
                        console.error(`❌ Lambda - Missing S3 bucket name for message ${messageId}`);
                        throw new Error(`Missing S3 bucket name for message ${messageId}`);
                    }
                    console.log(`📍 Lambda - Using SES provided S3 location: ${s3Bucket}/${objectKey}`);
                    // Fetch email content using the SES-provided key
                    emailContent = await getEmailFromS3(s3Bucket, objectKey);
                }
                // Log processing details for debugging
                console.log('Processing email details:', {
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
                console.log(`✅ Lambda - Processed record for ${messageId}`);
            }
            catch (recordError) {
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
        // Check if any email subject contains the test string to determine which API URL to use
        // const hasTestSubject = processedRecords.some(record => {
        //   const subject = record?.ses?.mail?.commonHeaders?.subject || '';
        //   return subject.includes('ilovejesssomuch');
        // });
        // const targetApiUrl = hasTestSubject && serviceApiUrlDev ? serviceApiUrlDev : serviceApiUrl;
        // Build list of endpoints, filtering out null/undefined values
        // const endpoints = [serviceApiUrl, serviceApiUrlDev, 'https://inbound.new'].filter(Boolean);
        const endpoints = [serviceApiUrl].filter(Boolean);
        console.log(`🚀 Lambda - Will attempt to send to ${endpoints.length} endpoints:`, endpoints);
        // if (hasTestSubject) {
        //   console.log('🧪 Lambda - Test subject detected, using development API URL:', {
        //     usingDevUrl: !!serviceApiUrlDev,
        //     targetApiUrl
        //   });
        // }
        // Send to all endpoints in parallel and collect results
        console.log(`🚀 Lambda - Sending ${processedRecords.length} processed records to ${endpoints.length} endpoints in parallel`);
        const webhookPromises = endpoints.map(endpoint => sendWebhookRequest(`${endpoint}/api/inbound/webhook`, serviceApiKey, {
            originalEvent: event,
            processedRecords: processedRecords
        }, context).then(result => ({
            endpoint,
            ...result
        })));
        // Wait for all webhook requests to complete (both successful and failed)
        const settledResults = await Promise.allSettled(webhookPromises);
        // Process results and extract actual webhook responses
        const webhookResults = settledResults.map((result, index) => {
            const endpoint = endpoints[index];
            if (result.status === 'fulfilled') {
                const webhookResult = result.value;
                if (webhookResult.success) {
                    console.log(`✅ Lambda - Successfully sent to ${endpoint}`);
                }
                else {
                    console.error(`❌ Lambda - Failed to send to ${endpoint}: ${webhookResult.error}`);
                }
                return webhookResult;
            }
            else {
                // Promise was rejected (network error, etc.)
                console.error(`❌ Lambda - Promise rejected for ${endpoint}: ${result.reason}`);
                return {
                    endpoint,
                    success: false,
                    error: result.reason instanceof Error ? result.reason.message : 'Promise rejected'
                };
            }
        });
        const hasSuccessfulWebhook = webhookResults.some(result => result.success);
        // Log summary of all webhook attempts
        console.log('📊 Lambda - Webhook summary:', {
            totalEndpoints: endpoints.length,
            successfulWebhooks: webhookResults.filter(r => r.success).length,
            failedWebhooks: webhookResults.filter(r => !r.success).length,
            results: webhookResults.map(r => ({ endpoint: r.endpoint, success: r.success, error: r.error }))
        });
        // Return success if at least one webhook succeeded
        if (hasSuccessfulWebhook) {
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
        }
        else {
            // All webhooks failed
            return {
                statusCode: 500,
                body: JSON.stringify({
                    error: 'All webhook requests failed',
                    webhookResults: webhookResults,
                    timestamp: new Date().toISOString(),
                }),
            };
        }
    }
    catch (error) {
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
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1haWwtcHJvY2Vzc29yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZW1haWwtcHJvY2Vzc29yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSw0REFBNEQ7OztBQUU1RCxrREFBZ0U7QUFFaEUsTUFBTSxRQUFRLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFFakY7O0dBRUc7QUFDSCxLQUFLLFVBQVUsY0FBYyxDQUFDLFVBQWtCLEVBQUUsU0FBaUIsRUFBRSx5QkFBa0MsS0FBSztJQUMxRyxJQUFJO1FBQ0YsSUFBSSxDQUFDLHNCQUFzQixFQUFFO1lBQzNCLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUNBQXVDLFVBQVUsSUFBSSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1NBQy9FO1FBRUQsTUFBTSxPQUFPLEdBQUcsSUFBSSw0QkFBZ0IsQ0FBQztZQUNuQyxNQUFNLEVBQUUsVUFBVTtZQUNsQixHQUFHLEVBQUUsU0FBUztTQUNmLENBQUMsQ0FBQztRQUVILE1BQU0sUUFBUSxHQUFHLE1BQU0sUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUU5QyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRTtZQUNsQixPQUFPLENBQUMsS0FBSyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7WUFDaEUsT0FBTyxJQUFJLENBQUM7U0FDYjtRQUVELDJCQUEyQjtRQUMzQixNQUFNLE1BQU0sR0FBaUIsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUVoRSxPQUFPLElBQUksRUFBRTtZQUNYLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEdBQUcsTUFBTSxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDNUMsSUFBSSxJ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IEZVTkNUSU9OIEZPUiBQUk9DRVNTSU5HIEVNQUlMU1xuXG5pbXBvcnQgeyBTM0NsaWVudCwgR2V0T2JqZWN0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5cbmNvbnN0IHMzQ2xpZW50ID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTInIH0pO1xuXG4vKipcbiAqIEZldGNoIGVtYWlsIGNvbnRlbnQgZnJvbSBTM1xuICovXG5hc3luYyBmdW5jdGlvbiBnZXRFbWFpbEZyb21TMyhidWNrZXROYW1lOiBzdHJpbmcsIG9iamVjdEtleTogc3RyaW5nLCBzdXBwcmVzc05vdEZvdW5kRXJyb3JzOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgdHJ5IHtcbiAgICBpZiAoIXN1cHByZXNzTm90Rm91bmRFcnJvcnMpIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OlIExhbWJkYSAtIEZldGNoaW5nIGVtYWlsIGZyb20gUzM6ICR7YnVja2V0TmFtZX0vJHtvYmplY3RLZXl9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgY29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgIEJ1Y2tldDogYnVja2V0TmFtZSxcbiAgICAgIEtleTogb2JqZWN0S2V5LFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzM0NsaWVudC5zZW5kKGNvbW1hbmQpO1xuXG4gICAgaWYgKCFyZXNwb25zZS5Cb2R5KSB7XG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgTGFtYmRhIC0gTm8gZW1haWwgY29udGVudCBmb3VuZCBpbiBTMyBvYmplY3QnKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8vIENvbnZlcnQgc3RyZWFtIHRvIHN0cmluZ1xuICAgIGNvbnN0IGNodW5rczogVWludDhBcnJheVtdID0gW107XG4gICAgY29uc3QgcmVhZGVyID0gcmVzcG9uc2UuQm9keS50cmFuc2Zvcm1Ub1dlYlN0cmVhbSgpLmdldFJlYWRlcigpO1xuXG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIGNvbnN0IHsgZG9uZSwgdmFsdWUgfSA9IGF3YWl0IHJlYWRlci5yZWFkKCk7XG4gICAgICBpZiAoZG9uZSkgYnJlYWs7XG4gICAgICBjaHVua3MucHVzaCh2YWx1ZSk7XG4gICAgfVxuXG4gICAgY29uc3QgZW1haWxDb250ZW50ID0gQnVmZmVyLmNvbmNhdChjaHVua3MpLnRvU3RyaW5nKCd1dGYtOCcpO1xuICAgIFxuICAgIGlmICghc3VwcHJlc3NOb3RGb3VuZEVycm9ycykge1xuICAgICAgY29uc29sZS5sb2coYOKchSBMYW1iZGEgLSBTdWNjZXNzZnVsbHkgZmV0Y2hlZCBlbWFpbCBjb250ZW50ICgke2VtYWlsQ29udGVudC5sZW5ndGh9IGJ5dGVzKWApO1xuICAgIH1cblxuICAgIHJldHVybiBlbWFpbENvbnRlbnQ7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgLy8gSGFuZGxlIE5vU3VjaEtleSBlcnJvcnMgbW9yZSBxdWlldGx5IGR1cmluZyBmYWxsYmFjayBzZWFyY2hlc1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yICYmIGVycm9yLm5hbWUgPT09ICdOb1N1Y2hLZXknKSB7XG4gICAgICBpZiAoc3VwcHJlc3NOb3RGb3VuZEVycm9ycykge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+TrSBMYW1iZGEgLSBFbWFpbCBub3QgZm91bmQgYXQ6ICR7YnVja2V0TmFtZX0vJHtvYmplY3RLZXl9IChjaGVja2luZyBvdGhlciBsb2NhdGlvbnMuLi4pYCk7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIExhbWJkYSAtIFMzIG9iamVjdCBub3QgZm91bmQ6ICR7YnVja2V0TmFtZX0vJHtvYmplY3RLZXl9YCk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBMYW1iZGEgLSBUaGlzIHVzdWFsbHkgbWVhbnMgdGhlIFMzIG9iamVjdCBrZXkgaW4gdGhlIFNFUyByZWNlaXB0IHJ1bGUgZG9lc25cXCd0IG1hdGNoIHRoZSBhY3R1YWwgc3RvcmVkIGxvY2F0aW9uJyk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBMYW1iZGEgLSBFcnJvciBmZXRjaGluZyBlbWFpbCBmcm9tIFMzOiAke2J1Y2tldE5hbWV9LyR7b2JqZWN0S2V5fWAsIGVycm9yKTtcbiAgICAgIFxuICAgICAgLy8gUHJvdmlkZSBtb3JlIHNwZWNpZmljIGVycm9yIGluZm9ybWF0aW9uIGZvciBvdGhlciBlcnJvcnNcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvci5uYW1lID09PSAnTm9TdWNoQnVja2V0Jykge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBMYW1iZGEgLSBTMyBidWNrZXQgbm90IGZvdW5kOiAke2J1Y2tldE5hbWV9YCk7XG4gICAgICAgIH0gZWxzZSBpZiAoZXJyb3IubmFtZSA9PT0gJ0FjY2Vzc0RlbmllZCcpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgTGFtYmRhIC0gQWNjZXNzIGRlbmllZCB0byBTMyBvYmplY3Q6ICR7YnVja2V0TmFtZX0vJHtvYmplY3RLZXl9YCk7XG4gICAgICAgICAgY29uc29sZS5lcnJvcign4p2MIExhbWJkYSAtIENoZWNrIExhbWJkYSBmdW5jdGlvbiBTMyBwZXJtaXNzaW9ucycpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGRldGFpbHM6Jywge1xuICAgICAgICBvcGVyYXRpb246ICdnZXRFbWFpbEZyb21TMycsXG4gICAgICAgIGJ1Y2tldDogYnVja2V0TmFtZSxcbiAgICAgICAga2V5OiBvYmplY3RLZXksXG4gICAgICAgIGVycm9yTmFtZTogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm5hbWUgOiAnVW5rbm93bicsXG4gICAgICAgIGVycm9yTWVzc2FnZTogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICAgIGVycm9yQ29kZTogKGVycm9yIGFzIGFueSk/LkNvZGUgfHwgJ1Vua25vd24nXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG4vKipcbiAqIFNlbmQgd2ViaG9vayByZXF1ZXN0IHRvIGEgc3BlY2lmaWMgVVJMXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHNlbmRXZWJob29rUmVxdWVzdChcbiAgd2ViaG9va1VybDogc3RyaW5nLFxuICBzZXJ2aWNlQXBpS2V5OiBzdHJpbmcsXG4gIHBheWxvYWQ6IGFueSxcbiAgY29udGV4dDogYW55XG4pOiBQcm9taXNlPHsgc3VjY2VzczogYm9vbGVhbjsgcmVzcG9uc2U/OiBhbnk7IGVycm9yPzogc3RyaW5nOyBzdGF0dXNDb2RlPzogbnVtYmVyIH0+IHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhg8J+agCBMYW1iZGEgLSBTZW5kaW5nIHdlYmhvb2sgcmVxdWVzdCB0bzogJHt3ZWJob29rVXJsfWApO1xuXG4gICAgLy8gTG9nIHdlYmhvb2sgY2FsbCBkZXRhaWxzXG4gICAgY29uc29sZS5sb2coJ1dlYmhvb2sgY2FsbCBkZXRhaWxzOicsIHtcbiAgICAgIHVybDogd2ViaG9va1VybCxcbiAgICAgIHJlY29yZENvdW50OiBwYXlsb2FkLnByb2Nlc3NlZFJlY29yZHM/Lmxlbmd0aCB8fCAwXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHdlYmhvb2tVcmwsIHtcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtzZXJ2aWNlQXBpS2V5fWAsXG4gICAgICAgICdVc2VyLUFnZW50JzogJ0FXUy1MYW1iZGEtRW1haWwtRm9yd2FyZGVyLzEuMCcsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICB0eXBlOiAnc2VzX2V2ZW50X3dpdGhfY29udGVudCcsXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICBvcmlnaW5hbEV2ZW50OiBwYXlsb2FkLm9yaWdpbmFsRXZlbnQsXG4gICAgICAgIHByb2Nlc3NlZFJlY29yZHM6IHBheWxvYWQucHJvY2Vzc2VkUmVjb3JkcyxcbiAgICAgICAgY29udGV4dDoge1xuICAgICAgICAgIGZ1bmN0aW9uTmFtZTogY29udGV4dC5mdW5jdGlvbk5hbWUsXG4gICAgICAgICAgZnVuY3Rpb25WZXJzaW9uOiBjb250ZXh0LmZ1bmN0aW9uVmVyc2lvbixcbiAgICAgICAgICByZXF1ZXN0SWQ6IGNvbnRleHQuYXdzUmVxdWVzdElkLFxuICAgICAgICB9XG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgIGNvbnN0IGVycm9yVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBMYW1iZGEgLSBXZWJob29rIGZhaWxlZDogJHtyZXNwb25zZS5zdGF0dXN9ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBMYW1iZGEgLSBFcnJvciByZXNwb25zZTogJHtlcnJvclRleHR9YCk7XG5cbiAgICAgIC8vIExvZyB3ZWJob29rIGZhaWx1cmUgZGV0YWlsc1xuICAgICAgY29uc29sZS5lcnJvcignV2ViaG9vayBmYWlsdXJlIGRldGFpbHM6Jywge1xuICAgICAgICBvcGVyYXRpb246ICd3ZWJob29rJyxcbiAgICAgICAgc3RhdHVzQ29kZTogcmVzcG9uc2Uuc3RhdHVzLFxuICAgICAgICB3ZWJob29rVXJsLFxuICAgICAgICBlcnJvclJlc3BvbnNlOiBlcnJvclRleHRcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgZXJyb3I6IGBXZWJob29rIHJlcXVlc3QgZmFpbGVkOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fWAsXG4gICAgICAgIHN0YXR1c0NvZGU6IHJlc3BvbnNlLnN0YXR1c1xuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgY29uc29sZS5sb2coJ+KchSBMYW1iZGEgLSBXZWJob29rIHJlc3BvbnNlOicsIHJlc3VsdCk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgIHJlc3BvbnNlOiByZXN1bHRcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBMYW1iZGEgLSBFcnJvciBzZW5kaW5nIHdlYmhvb2sgcmVxdWVzdCB0byAke3dlYmhvb2tVcmx9OmAsIGVycm9yKTtcbiAgICBjb25zb2xlLmVycm9yKCdXZWJob29rIGVycm9yIGRldGFpbHM6Jywge1xuICAgICAgb3BlcmF0aW9uOiAnc2VuZFdlYmhvb2tSZXF1ZXN0JyxcbiAgICAgIHdlYmhvb2tVcmwsXG4gICAgICBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcidcbiAgICB9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ1xuICAgIH07XG4gIH1cbn1cblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IGFueSwgY29udGV4dDogYW55KSA9PiB7XG4gIGNvbnNvbGUubG9nKCfwn5OnIExhbWJkYSAtIFJlY2VpdmVkIFNFUyBlbWFpbCBldmVudCcpO1xuICBjb25zb2xlLmxvZygn8J+UjSBMYW1iZGEgLSBFdmVudCBkZXRhaWxzOicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG5cbiAgY29uc3Qgc2VydmljZUFwaVVybCA9IHByb2Nlc3MuZW52LlNFUlZJQ0VfQVBJX1VSTDtcbiAgY29uc3Qgc2VydmljZUFwaVVybERldiA9IHByb2Nlc3MuZW52LlNFUlZJQ0VfQVBJX1VSTF9ERVY7XG4gIGNvbnN0IHNlcnZpY2VBcGlLZXkgPSBwcm9jZXNzLmVudi5TRVJWSUNFX0FQSV9LRVk7XG4gIGNvbnN0IHMzQnVja2V0TmFtZSA9IHByb2Nlc3MuZW52LlMzX0JVQ0tFVF9OQU1FO1xuXG4gIGlmICghc2VydmljZUFwaVVybCB8fCAhc2VydmljZUFwaUtleSkge1xuICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKCdNaXNzaW5nIHJlcXVpcmVkIGVudmlyb25tZW50IHZhcmlhYmxlczogU0VSVklDRV9BUElfVVJMIG9yIFNFUlZJQ0VfQVBJX0tFWScpO1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBMYW1iZGEgLSAnICsgZXJyb3IubWVzc2FnZSk7XG4gICAgY29uc29sZS5lcnJvcignQ29uZmlndXJhdGlvbiBlcnJvcjonLCB7IGVycm9yVHlwZTogJ2NvbmZpZ3VyYXRpb24nIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZXJyb3I6ICdNaXNzaW5nIHJlcXVpcmVkIGVudmlyb25tZW50IHZhcmlhYmxlcycsXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgfSksXG4gICAgfTtcbiAgfVxuXG4gIGlmICghczNCdWNrZXROYW1lKSB7XG4gICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ01pc3NpbmcgUzNfQlVDS0VUX05BTUUgZW52aXJvbm1lbnQgdmFyaWFibGUnKTtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgTGFtYmRhIC0gJyArIGVycm9yLm1lc3NhZ2UpO1xuICAgIGNvbnNvbGUuZXJyb3IoJ0NvbmZpZ3VyYXRpb24gZXJyb3I6JywgeyBlcnJvclR5cGU6ICdjb25maWd1cmF0aW9uJyB9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIGVycm9yOiAnTWlzc2luZyBTM19CVUNLRVRfTkFNRSBlbnZpcm9ubWVudCB2YXJpYWJsZScsXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgfSksXG4gICAgfTtcbiAgfVxuXG4gIHRyeSB7XG4gICAgLy8gUHJvY2VzcyBlYWNoIFNFUyByZWNvcmQgYW5kIGZldGNoIGVtYWlsIGNvbnRlbnRcbiAgICBjb25zdCBwcm9jZXNzZWRSZWNvcmRzOiBhbnlbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCByZWNvcmQgb2YgZXZlbnQuUmVjb3JkcyB8fCBbXSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc2VzRGF0YSA9IHJlY29yZC5zZXM7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2VJZCA9IHNlc0RhdGEubWFpbC5tZXNzYWdlSWQ7XG4gICAgICAgIGNvbnN0IHN1YmplY3QgPSBzZXNEYXRhLm1haWwuY29tbW9uSGVhZGVycz8uc3ViamVjdCB8fCAnTm8gU3ViamVjdCc7XG5cbiAgICAgICAgLy8gRXh0cmFjdCBkb21haW4gZnJvbSByZWNpcGllbnQgZW1haWxcbiAgICAgICAgY29uc3QgcmVjaXBpZW50cyA9IHNlc0RhdGEubWFpbC5kZXN0aW5hdGlvbiB8fCBbXTtcbiAgICAgICAgY29uc3QgcmVjaXBpZW50RW1haWwgPSByZWNpcGllbnRzWzBdIHx8ICcnO1xuICAgICAgICBjb25zdCBkb21haW4gPSByZWNpcGllbnRFbWFpbC5zcGxpdCgnQCcpWzFdIHx8ICcnO1xuICAgICAgICBcbiAgICAgICAgLy8gVHJ5IHRvIGdldCBTMyBvYmplY3Qga2V5IGZyb20gU0VTIHJlY2VpcHQgYWN0aW9uIGZpcnN0XG4gICAgICAgIGxldCBvYmplY3RLZXkgPSBzZXNEYXRhLnJlY2VpcHQ/LmFjdGlvbj8ub2JqZWN0S2V5O1xuICAgICAgICBsZXQgczNCdWNrZXQgPSBzZXNEYXRhLnJlY2VpcHQ/LmFjdGlvbj8uYnVja2V0TmFtZSB8fCBzM0J1Y2tldE5hbWU7XG5cbiAgICAgICAgY29uc29sZS5sb2coYPCfk6ggTGFtYmRhIC0gUHJvY2Vzc2luZyBlbWFpbDogJHttZXNzYWdlSWR9YCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SNIExhbWJkYSAtIFNFUyBwcm92aWRlZCBvYmplY3Qga2V5OiAke29iamVjdEtleSB8fCAnTk9UIFBST1ZJREVEJ31gKTtcblxuICAgICAgICAvLyBJZiBTRVMgZGlkbid0IHByb3ZpZGUgdGhlIG9iamVjdCBrZXksIHdlIG5lZWQgdG8gZGV0ZXJtaW5lIHRoZSBjb3JyZWN0IGxvY2F0aW9uXG4gICAgICAgIC8vIENoZWNrIGJvdGggaW5kaXZpZHVhbCBhbmQgY2F0Y2gtYWxsIGxvY2F0aW9uc1xuICAgICAgICBsZXQgZW1haWxDb250ZW50ID0gbnVsbDtcbiAgICAgICAgXG4gICAgICAgIGlmICghb2JqZWN0S2V5KSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYOKaoO+4jyBMYW1iZGEgLSBObyBTMyBvYmplY3Qga2V5IGluIFNFUyBldmVudCwgd2lsbCBjaGVjayBib3RoIHBvc3NpYmxlIGxvY2F0aW9uc2ApO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIFBvc3NpYmxlIGxvY2F0aW9ucyBmb3IgdGhlIGVtYWlsOlxuICAgICAgICAgIC8vIDEuIEluZGl2aWR1YWwgZW1haWwgcnVsZTogZW1haWxzL3tkb21haW59L3ttZXNzYWdlSWR9XG4gICAgICAgICAgLy8gMi4gQ2F0Y2gtYWxsIHJ1bGU6IGVtYWlscy97ZG9tYWlufS9jYXRjaGFsbC97bWVzc2FnZUlkfVxuICAgICAgICAgIGNvbnN0IHBvc3NpYmxlS2V5cyA9IFtcbiAgICAgICAgICAgIGBlbWFpbHMvJHtkb21haW59LyR7bWVzc2FnZUlkfWAsICAgICAgICAgICAvLyBJbmRpdmlkdWFsIHJ1bGUgbG9jYXRpb25cbiAgICAgICAgICAgIGBlbWFpbHMvJHtkb21haW59L2NhdGNoYWxsLyR7bWVzc2FnZUlkfWAgICAvLyBDYXRjaC1hbGwgcnVsZSBsb2NhdGlvblxuICAgICAgICAgIF07XG5cbiAgICAgICAgICBjb25zb2xlLmxvZyhg8J+UjSBMYW1iZGEgLSBXaWxsIGNoZWNrIHRoZXNlIFMzIGxvY2F0aW9uczpgLCBwb3NzaWJsZUtleXMpO1xuXG4gICAgICAgICAgLy8gVHJ5IGVhY2ggbG9jYXRpb24gdW50aWwgd2UgZmluZCB0aGUgZW1haWxcbiAgICAgICAgICBsZXQgZm91bmRLZXkgPSBudWxsO1xuXG4gICAgICAgICAgZm9yIChjb25zdCB0ZXN0S2V5IG9mIHBvc3NpYmxlS2V5cykge1xuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IGdldEVtYWlsRnJvbVMzKHMzQnVja2V0LCB0ZXN0S2V5LCB0cnVlKTsgLy8gU3VwcHJlc3MgXCJub3QgZm91bmRcIiBlcnJvcnMgZHVyaW5nIHNlYXJjaFxuICAgICAgICAgICAgaWYgKGNvbnRlbnQgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgZW1haWxDb250ZW50ID0gY29udGVudDtcbiAgICAgICAgICAgICAgZm91bmRLZXkgPSB0ZXN0S2V5O1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg4pyFIExhbWJkYSAtIEZvdW5kIGVtYWlsIGF0OiAke3MzQnVja2V0fS8ke3Rlc3RLZXl9YCk7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICghZm91bmRLZXkpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBMYW1iZGEgLSBFbWFpbCBub3QgZm91bmQgaW4gYW55IGV4cGVjdGVkIGxvY2F0aW9uIGZvciBtZXNzYWdlICR7bWVzc2FnZUlkfWApO1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIExhbWJkYSAtIENoZWNrZWQgbG9jYXRpb25zOmAsIHBvc3NpYmxlS2V5cy5tYXAoa2V5ID0+IGAke3MzQnVja2V0fS8ke2tleX1gKSk7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEVtYWlsIGNvbnRlbnQgbm90IGZvdW5kIGluIFMzIGZvciBtZXNzYWdlICR7bWVzc2FnZUlkfWApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIG9iamVjdEtleSA9IGZvdW5kS2V5O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFNFUyBwcm92aWRlZCB0aGUgb2JqZWN0IGtleSwgdmFsaWRhdGUgaXQgZXhpc3RzXG4gICAgICAgICAgaWYgKCFzM0J1Y2tldCkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIExhbWJkYSAtIE1pc3NpbmcgUzMgYnVja2V0IG5hbWUgZm9yIG1lc3NhZ2UgJHttZXNzYWdlSWR9YCk7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgUzMgYnVja2V0IG5hbWUgZm9yIG1lc3NhZ2UgJHttZXNzYWdlSWR9YCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc29sZS5sb2coYPCfk40gTGFtYmRhIC0gVXNpbmcgU0VTIHByb3ZpZGVkIFMzIGxvY2F0aW9uOiAke3MzQnVja2V0fS8ke29iamVjdEtleX1gKTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBGZXRjaCBlbWFpbCBjb250ZW50IHVzaW5nIHRoZSBTRVMtcHJvdmlkZWQga2V5XG4gICAgICAgICAgZW1haWxDb250ZW50ID0gYXdhaXQgZ2V0RW1haWxGcm9tUzMoczNCdWNrZXQsIG9iamVjdEtleSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBMb2cgcHJvY2Vzc2luZyBkZXRhaWxzIGZvciBkZWJ1Z2dpbmdcbiAgICAgICAgY29uc29sZS5sb2coJ1Byb2Nlc3NpbmcgZW1haWwgZGV0YWlsczonLCB7XG4gICAgICAgICAgbWVzc2FnZUlkLFxuICAgICAgICAgIHJlY2lwaWVudEVtYWlsLFxuICAgICAgICAgIGRvbWFpbixcbiAgICAgICAgICBvYmplY3RLZXksXG4gICAgICAgICAgczNCdWNrZXRGcm9tUmVjZWlwdDogc2VzRGF0YS5yZWNlaXB0Py5hY3Rpb24/LmJ1Y2tldE5hbWUsXG4gICAgICAgICAgczNCdWNrZXRGcm9tRW52OiBzM0J1Y2tldE5hbWUsXG4gICAgICAgICAgczNCdWNrZXRVc2VkOiBzM0J1Y2tldCxcbiAgICAgICAgICBvYmplY3RLZXlTb3VyY2U6IHNlc0RhdGEucmVjZWlwdD8uYWN0aW9uPy5vYmplY3RLZXkgPyAnU0VTX0VWRU5UJyA6ICdGQUxMQkFDS19TRUFSQ0gnLFxuICAgICAgICAgIGVtYWlsQ29udGVudEZvdW5kOiBlbWFpbENvbnRlbnQgIT09IG51bGwsXG4gICAgICAgICAgZW1haWxDb250ZW50U2l6ZTogZW1haWxDb250ZW50ID8gZW1haWxDb250ZW50Lmxlbmd0aCA6IDBcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcHJvY2Vzc2VkUmVjb3Jkcy5wdXNoKHtcbiAgICAgICAgICAuLi5yZWNvcmQsXG4gICAgICAgICAgZW1haWxDb250ZW50OiBlbWFpbENvbnRlbnQsXG4gICAgICAgICAgczNMb2NhdGlvbjoge1xuICAgICAgICAgICAgYnVja2V0OiBzM0J1Y2tldCxcbiAgICAgICAgICAgIGtleTogb2JqZWN0S2V5LFxuICAgICAgICAgICAgY29udGVudEZldGNoZWQ6IGVtYWlsQ29udGVudCAhPT0gbnVsbCxcbiAgICAgICAgICAgIGNvbnRlbnRTaXplOiBlbWFpbENvbnRlbnQgPyBlbWFpbENvbnRlbnQubGVuZ3RoIDogMFxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc29sZS5sb2coYOKchSBMYW1iZGEgLSBQcm9jZXNzZWQgcmVjb3JkIGZvciAke21lc3NhZ2VJZH1gKTtcbiAgICAgIH0gY2F0Y2ggKHJlY29yZEVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBMYW1iZGEgLSBFcnJvciBwcm9jZXNzaW5nIFNFUyByZWNvcmQ6JywgcmVjb3JkRXJyb3IpO1xuICAgICAgICBjb25zb2xlLmVycm9yKCdSZWNvcmQgcHJvY2Vzc2luZyBlcnJvciBkZXRhaWxzOicsIHtcbiAgICAgICAgICBvcGVyYXRpb246ICdwcm9jZXNzU0VTUmVjb3JkJyxcbiAgICAgICAgICBtZXNzYWdlSWQ6IHJlY29yZD8uc2VzPy5tYWlsPy5tZXNzYWdlSWQsXG4gICAgICAgICAgZXJyb3I6IHJlY29yZEVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyByZWNvcmRFcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEluY2x1ZGUgdGhlIHJlY29yZCBldmVuIGlmIFMzIGZldGNoIGZhaWxlZFxuICAgICAgICBwcm9jZXNzZWRSZWNvcmRzLnB1c2goe1xuICAgICAgICAgIC4uLnJlY29yZCxcbiAgICAgICAgICBlbWFpbENvbnRlbnQ6IG51bGwsXG4gICAgICAgICAgczNFcnJvcjogcmVjb3JkRXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IHJlY29yZEVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcidcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgYW55IGVtYWlsIHN1YmplY3QgY29udGFpbnMgdGhlIHRlc3Qgc3RyaW5nIHRvIGRldGVybWluZSB3aGljaCBBUEkgVVJMIHRvIHVzZVxuICAgIC8vIGNvbnN0IGhhc1Rlc3RTdWJqZWN0ID0gcHJvY2Vzc2VkUmVjb3Jkcy5zb21lKHJlY29yZCA9PiB7XG4gICAgLy8gICBjb25zdCBzdWJqZWN0ID0gcmVjb3JkPy5zZXM/Lm1haWw/LmNvbW1vbkhlYWRlcnM/LnN1YmplY3QgfHwgJyc7XG4gICAgLy8gICByZXR1cm4gc3ViamVjdC5pbmNsdWRlcygnaWxvdmVqZXNzc29tdWNoJyk7XG4gICAgLy8gfSk7XG5cbiAgICAvLyBjb25zdCB0YXJnZXRBcGlVcmwgPSBoYXNUZXN0U3ViamVjdCAmJiBzZXJ2aWNlQXBpVXJsRGV2ID8gc2VydmljZUFwaVVybERldiA6IHNlcnZpY2VBcGlVcmw7XG5cbiAgICAvLyBCdWlsZCBsaXN0IG9mIGVuZHBvaW50cywgZmlsdGVyaW5nIG91dCBudWxsL3VuZGVmaW5lZCB2YWx1ZXNcbiAgICAvLyBjb25zdCBlbmRwb2ludHMgPSBbc2VydmljZUFwaVVybCwgc2VydmljZUFwaVVybERldiwgJ2h0dHBzOi8vaW5ib3VuZC5uZXcnXS5maWx0ZXIoQm9vbGVhbik7XG4gICAgY29uc3QgZW5kcG9pbnRzID0gW3NlcnZpY2VBcGlVcmxdLmZpbHRlcihCb29sZWFuKTtcbiAgICBcbiAgICBjb25zb2xlLmxvZyhg8J+agCBMYW1iZGEgLSBXaWxsIGF0dGVtcHQgdG8gc2VuZCB0byAke2VuZHBvaW50cy5sZW5ndGh9IGVuZHBvaW50czpgLCBlbmRwb2ludHMpO1xuXG4gICAgLy8gaWYgKGhhc1Rlc3RTdWJqZWN0KSB7XG4gICAgLy8gICBjb25zb2xlLmxvZygn8J+nqiBMYW1iZGEgLSBUZXN0IHN1YmplY3QgZGV0ZWN0ZWQsIHVzaW5nIGRldmVsb3BtZW50IEFQSSBVUkw6Jywge1xuICAgIC8vICAgICB1c2luZ0RldlVybDogISFzZXJ2aWNlQXBpVXJsRGV2LFxuICAgIC8vICAgICB0YXJnZXRBcGlVcmxcbiAgICAvLyAgIH0pO1xuICAgIC8vIH1cbiAgICBcbiAgICAvLyBTZW5kIHRvIGFsbCBlbmRwb2ludHMgaW4gcGFyYWxsZWwgYW5kIGNvbGxlY3QgcmVzdWx0c1xuICAgIGNvbnNvbGUubG9nKGDwn5qAIExhbWJkYSAtIFNlbmRpbmcgJHtwcm9jZXNzZWRSZWNvcmRzLmxlbmd0aH0gcHJvY2Vzc2VkIHJlY29yZHMgdG8gJHtlbmRwb2ludHMubGVuZ3RofSBlbmRwb2ludHMgaW4gcGFyYWxsZWxgKTtcbiAgICBcbiAgICBjb25zdCB3ZWJob29rUHJvbWlzZXMgPSBlbmRwb2ludHMubWFwKGVuZHBvaW50ID0+IFxuICAgICAgc2VuZFdlYmhvb2tSZXF1ZXN0KFxuICAgICAgICBgJHtlbmRwb2ludH0vYXBpL2luYm91bmQvd2ViaG9va2AsXG4gICAgICAgIHNlcnZpY2VBcGlLZXksXG4gICAgICAgIHtcbiAgICAgICAgICBvcmlnaW5hbEV2ZW50OiBldmVudCxcbiAgICAgICAgICBwcm9jZXNzZWRSZWNvcmRzOiBwcm9jZXNzZWRSZWNvcmRzXG4gICAgICAgIH0sXG4gICAgICAgIGNvbnRleHRcbiAgICAgICkudGhlbihyZXN1bHQgPT4gKHtcbiAgICAgICAgZW5kcG9pbnQsXG4gICAgICAgIC4uLnJlc3VsdFxuICAgICAgfSkpXG4gICAgKTtcblxuICAgIC8vIFdhaXQgZm9yIGFsbCB3ZWJob29rIHJlcXVlc3RzIHRvIGNvbXBsZXRlIChib3RoIHN1Y2Nlc3NmdWwgYW5kIGZhaWxlZClcbiAgICBjb25zdCBzZXR0bGVkUmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZCh3ZWJob29rUHJvbWlzZXMpO1xuICAgIFxuICAgIC8vIFByb2Nlc3MgcmVzdWx0cyBhbmQgZXh0cmFjdCBhY3R1YWwgd2ViaG9vayByZXNwb25zZXNcbiAgICBjb25zdCB3ZWJob29rUmVzdWx0cyA9IHNldHRsZWRSZXN1bHRzLm1hcCgocmVzdWx0LCBpbmRleCkgPT4ge1xuICAgICAgY29uc3QgZW5kcG9pbnQgPSBlbmRwb2ludHNbaW5kZXhdO1xuICAgICAgXG4gICAgICBpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcpIHtcbiAgICAgICAgY29uc3Qgd2ViaG9va1Jlc3VsdCA9IHJlc3VsdC52YWx1ZTtcbiAgICAgICAgaWYgKHdlYmhvb2tSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgTGFtYmRhIC0gU3VjY2Vzc2Z1bGx5IHNlbnQgdG8gJHtlbmRwb2ludH1gKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgTGFtYmRhIC0gRmFpbGVkIHRvIHNlbmQgdG8gJHtlbmRwb2ludH06ICR7d2ViaG9va1Jlc3VsdC5lcnJvcn1gKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gd2ViaG9va1Jlc3VsdDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFByb21pc2Ugd2FzIHJlamVjdGVkIChuZXR3b3JrIGVycm9yLCBldGMuKVxuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgTGFtYmRhIC0gUHJvbWlzZSByZWplY3RlZCBmb3IgJHtlbmRwb2ludH06ICR7cmVzdWx0LnJlYXNvbn1gKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBlbmRwb2ludCxcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICBlcnJvcjogcmVzdWx0LnJlYXNvbiBpbnN0YW5jZW9mIEVycm9yID8gcmVzdWx0LnJlYXNvbi5tZXNzYWdlIDogJ1Byb21pc2UgcmVqZWN0ZWQnXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBoYXNTdWNjZXNzZnVsV2ViaG9vayA9IHdlYmhvb2tSZXN1bHRzLnNvbWUocmVzdWx0ID0+IHJlc3VsdC5zdWNjZXNzKTtcblxuICAgIC8vIExvZyBzdW1tYXJ5IG9mIGFsbCB3ZWJob29rIGF0dGVtcHRzXG4gICAgY29uc29sZS5sb2coJ/Cfk4ogTGFtYmRhIC0gV2ViaG9vayBzdW1tYXJ5OicsIHtcbiAgICAgIHRvdGFsRW5kcG9pbnRzOiBlbmRwb2ludHMubGVuZ3RoLFxuICAgICAgc3VjY2Vzc2Z1bFdlYmhvb2tzOiB3ZWJob29rUmVzdWx0cy5maWx0ZXIociA9PiByLnN1Y2Nlc3MpLmxlbmd0aCxcbiAgICAgIGZhaWxlZFdlYmhvb2tzOiB3ZWJob29rUmVzdWx0cy5maWx0ZXIociA9PiAhci5zdWNjZXNzKS5sZW5ndGgsXG4gICAgICByZXN1bHRzOiB3ZWJob29rUmVzdWx0cy5tYXAociA9PiAoeyBlbmRwb2ludDogci5lbmRwb2ludCwgc3VjY2Vzczogci5zdWNjZXNzLCBlcnJvcjogci5lcnJvciB9KSlcbiAgICB9KTtcblxuICAgIC8vIFJldHVybiBzdWNjZXNzIGlmIGF0IGxlYXN0IG9uZSB3ZWJob29rIHN1Y2NlZWRlZFxuICAgIGlmIChoYXNTdWNjZXNzZnVsV2ViaG9vaykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgbWVzc2FnZTogJ0VtYWlsIGV2ZW50IGZvcndhcmRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgICAgIHdlYmhvb2tSZXN1bHRzOiB3ZWJob29rUmVzdWx0cyxcbiAgICAgICAgICBzdWNjZXNzZnVsRW5kcG9pbnRzOiB3ZWJob29rUmVzdWx0cy5maWx0ZXIociA9PiByLnN1Y2Nlc3MpLmxlbmd0aCxcbiAgICAgICAgICB0b3RhbEVuZHBvaW50czogZW5kcG9pbnRzLmxlbmd0aCxcbiAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBBbGwgd2ViaG9va3MgZmFpbGVkXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ0FsbCB3ZWJob29rIHJlcXVlc3RzIGZhaWxlZCcsXG4gICAgICAgICAgd2ViaG9va1Jlc3VsdHM6IHdlYmhvb2tSZXN1bHRzLFxuICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ/CfkqUgTGFtYmRhIC0gRXJyb3IgZm9yd2FyZGluZyBlbWFpbCBldmVudDonLCBlcnJvcik7XG5cbiAgICAvLyBMb2cgdW5oYW5kbGVkIGVycm9yIGRldGFpbHNcbiAgICBjb25zb2xlLmVycm9yKCdVbmhhbmRsZWQgZXJyb3IgZGV0YWlsczonLCB7XG4gICAgICBvcGVyYXRpb246ICdoYW5kbGVyJyxcbiAgICAgIGVycm9yVHlwZTogJ3VuaGFuZGxlZCcsXG4gICAgICBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICBzdGFjazogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLnN0YWNrIDogdW5kZWZpbmVkXG4gICAgfSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBlcnJvcjogJ0ZhaWxlZCB0byBmb3J3YXJkIGVtYWlsIGV2ZW50JyxcbiAgICAgICAgZGV0YWlsczogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgfSksXG4gICAgfTtcbiAgfVxufTsgIl19