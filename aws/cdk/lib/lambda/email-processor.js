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
        const endpoints = [serviceApiUrl, serviceApiUrlDev, 'https://inbound.new'].filter(Boolean);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1haWwtcHJvY2Vzc29yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZW1haWwtcHJvY2Vzc29yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSw0REFBNEQ7OztBQUU1RCxrREFBZ0U7QUFFaEUsTUFBTSxRQUFRLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFFakY7O0dBRUc7QUFDSCxLQUFLLFVBQVUsY0FBYyxDQUFDLFVBQWtCLEVBQUUsU0FBaUIsRUFBRSx5QkFBa0MsS0FBSztJQUMxRyxJQUFJO1FBQ0YsSUFBSSxDQUFDLHNCQUFzQixFQUFFO1lBQzNCLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUNBQXVDLFVBQVUsSUFBSSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1NBQy9FO1FBRUQsTUFBTSxPQUFPLEdBQUcsSUFBSSw0QkFBZ0IsQ0FBQztZQUNuQyxNQUFNLEVBQUUsVUFBVTtZQUNsQixHQUFHLEVBQUUsU0FBUztTQUNmLENBQUMsQ0FBQztRQUVILE1BQU0sUUFBUSxHQUFHLE1BQU0sUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUU5QyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRTtZQUNsQixPQUFPLENBQUMsS0FBSyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7WUFDaEUsT0FBTyxJQUFJLENBQUM7U0FDYjtRQUVELDJCQUEyQjtRQUMzQixNQUFNLE1BQU0sR0FBaUIsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUVoRSxPQUFPLElBQUksRUFBRTtZQUNYLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEdBQUcsTUFBTSxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDNUMsSUFBSSxJ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TUFSWSBMQU1CREEgRlVOQ1RJT04gRk9SIFBST0NFU1NJTkcgRU1BSUxTXG5cbmltcG9ydCB7IFMzQ2xpZW50LCBHZXRPYmplY3RDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcblxuY29uc3QgczNDbGllbnQgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMicgfSk7XG5cbi8qKlxuICogRmV0Y2ggZW1haWwgY29udGVudCBmcm9tIFMzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGdldEVtYWlsRnJvbVMzKGJ1Y2tldE5hbWU6IHN0cmluZywgb2JqZWN0S2V5OiBzdHJpbmcsIHN1cHByZXNzTm90Rm91bmRFcnJvcnM6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICB0cnkge1xuICAgIGlmICghc3VwcHJlc3NOb3RGb3VuZEVycm9ycykge1xuICAgICAgY29uc29sZS5sb2coYPCfk6UgTGFtYmRhIC0gRmV0Y2hpbmcgZW1haWwgZnJvbSBTMzogJHtidWNrZXROYW1lfS8ke29iamVjdEtleX1gKTtcbiAgICB9XG5cbiAgICBjb25zdCBjb21tYW5kID0gbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgQnVja2V0OiBidWNrZXROYW1lLFxuICAgICAgS2V5OiBvYmplY3RLZXksXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHMzQ2xpZW50LnNlbmQoY29tbWFuZCk7XG5cbiAgICBpZiAoIXJlc3BvbnNlLkJvZHkpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBMYW1iZGEgLSBObyBlbWFpbCBjb250ZW50IGZvdW5kIGluIFMzIG9iamVjdCcpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gQ29udmVydCBzdHJlYW0gdG8gc3RyaW5nXG4gICAgY29uc3QgY2h1bmtzOiBVaW50OEFycmF5W10gPSBbXTtcbiAgICBjb25zdCByZWFkZXIgPSByZXNwb25zZS5Cb2R5LnRyYW5zZm9ybVRvV2ViU3RyZWFtKCkuZ2V0UmVhZGVyKCk7XG5cbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgY29uc3QgeyBkb25lLCB2YWx1ZSB9ID0gYXdhaXQgcmVhZGVyLnJlYWQoKTtcbiAgICAgIGlmIChkb25lKSBicmVhaztcbiAgICAgIGNodW5rcy5wdXNoKHZhbHVlKTtcbiAgICB9XG5cbiAgICBjb25zdCBlbWFpbENvbnRlbnQgPSBCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoJ3V0Zi04Jyk7XG4gICAgXG4gICAgaWYgKCFzdXBwcmVzc05vdEZvdW5kRXJyb3JzKSB7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIExhbWJkYSAtIFN1Y2Nlc3NmdWxseSBmZXRjaGVkIGVtYWlsIGNvbnRlbnQgKCR7ZW1haWxDb250ZW50Lmxlbmd0aH0gYnl0ZXMpYCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGVtYWlsQ29udGVudDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAvLyBIYW5kbGUgTm9TdWNoS2V5IGVycm9ycyBtb3JlIHF1aWV0bHkgZHVyaW5nIGZhbGxiYWNrIHNlYXJjaGVzXG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubmFtZSA9PT0gJ05vU3VjaEtleScpIHtcbiAgICAgIGlmIChzdXBwcmVzc05vdEZvdW5kRXJyb3JzKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5OtIExhbWJkYSAtIEVtYWlsIG5vdCBmb3VuZCBhdDogJHtidWNrZXROYW1lfS8ke29iamVjdEtleX0gKGNoZWNraW5nIG90aGVyIGxvY2F0aW9ucy4uLilgKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgTGFtYmRhIC0gUzMgb2JqZWN0IG5vdCBmb3VuZDogJHtidWNrZXROYW1lfS8ke29iamVjdEtleX1gKTtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIExhbWJkYSAtIFRoaXMgdXN1YWxseSBtZWFucyB0aGUgUzMgb2JqZWN0IGtleSBpbiB0aGUgU0VTIHJlY2VpcHQgcnVsZSBkb2VzblxcJ3QgbWF0Y2ggdGhlIGFjdHVhbCBzdG9yZWQgbG9jYXRpb24nKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5lcnJvcihg4p2MIExhbWJkYSAtIEVycm9yIGZldGNoaW5nIGVtYWlsIGZyb20gUzM6ICR7YnVja2V0TmFtZX0vJHtvYmplY3RLZXl9YCwgZXJyb3IpO1xuICAgICAgXG4gICAgICAvLyBQcm92aWRlIG1vcmUgc3BlY2lmaWMgZXJyb3IgaW5mb3JtYXRpb24gZm9yIG90aGVyIGVycm9yc1xuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdOb1N1Y2hCdWNrZXQnKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIExhbWJkYSAtIFMzIGJ1Y2tldCBub3QgZm91bmQ6ICR7YnVja2V0TmFtZX1gKTtcbiAgICAgICAgfSBlbHNlIGlmIChlcnJvci5uYW1lID09PSAnQWNjZXNzRGVuaWVkJykge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBMYW1iZGEgLSBBY2Nlc3MgZGVuaWVkIHRvIFMzIG9iamVjdDogJHtidWNrZXROYW1lfS8ke29iamVjdEtleX1gKTtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgTGFtYmRhIC0gQ2hlY2sgTGFtYmRhIGZ1bmN0aW9uIFMzIHBlcm1pc3Npb25zJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgZGV0YWlsczonLCB7XG4gICAgICAgIG9wZXJhdGlvbjogJ2dldEVtYWlsRnJvbVMzJyxcbiAgICAgICAgYnVja2V0OiBidWNrZXROYW1lLFxuICAgICAgICBrZXk6IG9iamVjdEtleSxcbiAgICAgICAgZXJyb3JOYW1lOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubmFtZSA6ICdVbmtub3duJyxcbiAgICAgICAgZXJyb3JNZXNzYWdlOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcbiAgICAgICAgZXJyb3JDb2RlOiAoZXJyb3IgYXMgYW55KT8uQ29kZSB8fCAnVW5rbm93bidcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbi8qKlxuICogU2VuZCB3ZWJob29rIHJlcXVlc3QgdG8gYSBzcGVjaWZpYyBVUkxcbiAqL1xuYXN5bmMgZnVuY3Rpb24gc2VuZFdlYmhvb2tSZXF1ZXN0KFxuICB3ZWJob29rVXJsOiBzdHJpbmcsXG4gIHNlcnZpY2VBcGlLZXk6IHN0cmluZyxcbiAgcGF5bG9hZDogYW55LFxuICBjb250ZXh0OiBhbnlcbik6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyByZXNwb25zZT86IGFueTsgZXJyb3I/OiBzdHJpbmc7IHN0YXR1c0NvZGU/OiBudW1iZXIgfT4ge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKGDwn5qAIExhbWJkYSAtIFNlbmRpbmcgd2ViaG9vayByZXF1ZXN0IHRvOiAke3dlYmhvb2tVcmx9YCk7XG5cbiAgICAvLyBMb2cgd2ViaG9vayBjYWxsIGRldGFpbHNcbiAgICBjb25zb2xlLmxvZygnV2ViaG9vayBjYWxsIGRldGFpbHM6Jywge1xuICAgICAgdXJsOiB3ZWJob29rVXJsLFxuICAgICAgcmVjb3JkQ291bnQ6IHBheWxvYWQucHJvY2Vzc2VkUmVjb3Jkcz8ubGVuZ3RoIHx8IDBcbiAgICB9KTtcblxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2god2ViaG9va1VybCwge1xuICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke3NlcnZpY2VBcGlLZXl9YCxcbiAgICAgICAgJ1VzZXItQWdlbnQnOiAnQVdTLUxhbWJkYS1FbWFpbC1Gb3J3YXJkZXIvMS4wJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIHR5cGU6ICdzZXNfZXZlbnRfd2l0aF9jb250ZW50JyxcbiAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIG9yaWdpbmFsRXZlbnQ6IHBheWxvYWQub3JpZ2luYWxFdmVudCxcbiAgICAgICAgcHJvY2Vzc2VkUmVjb3JkczogcGF5bG9hZC5wcm9jZXNzZWRSZWNvcmRzLFxuICAgICAgICBjb250ZXh0OiB7XG4gICAgICAgICAgZnVuY3Rpb25OYW1lOiBjb250ZXh0LmZ1bmN0aW9uTmFtZSxcbiAgICAgICAgICBmdW5jdGlvblZlcnNpb246IGNvbnRleHQuZnVuY3Rpb25WZXJzaW9uLFxuICAgICAgICAgIHJlcXVlc3RJZDogY29udGV4dC5hd3NSZXF1ZXN0SWQsXG4gICAgICAgIH1cbiAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgY29uc3QgZXJyb3JUZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgICAgY29uc29sZS5lcnJvcihg4p2MIExhbWJkYSAtIFdlYmhvb2sgZmFpbGVkOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xuICAgICAgY29uc29sZS5lcnJvcihg4p2MIExhbWJkYSAtIEVycm9yIHJlc3BvbnNlOiAke2Vycm9yVGV4dH1gKTtcblxuICAgICAgLy8gTG9nIHdlYmhvb2sgZmFpbHVyZSBkZXRhaWxzXG4gICAgICBjb25zb2xlLmVycm9yKCdXZWJob29rIGZhaWx1cmUgZGV0YWlsczonLCB7XG4gICAgICAgIG9wZXJhdGlvbjogJ3dlYmhvb2snLFxuICAgICAgICBzdGF0dXNDb2RlOiByZXNwb25zZS5zdGF0dXMsXG4gICAgICAgIHdlYmhvb2tVcmwsXG4gICAgICAgIGVycm9yUmVzcG9uc2U6IGVycm9yVGV4dFxuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICBlcnJvcjogYFdlYmhvb2sgcmVxdWVzdCBmYWlsZWQ6ICR7cmVzcG9uc2Uuc3RhdHVzfSAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCxcbiAgICAgICAgc3RhdHVzQ29kZTogcmVzcG9uc2Uuc3RhdHVzXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICBjb25zb2xlLmxvZygn4pyFIExhbWJkYSAtIFdlYmhvb2sgcmVzcG9uc2U6JywgcmVzdWx0KTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgcmVzcG9uc2U6IHJlc3VsdFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihg4p2MIExhbWJkYSAtIEVycm9yIHNlbmRpbmcgd2ViaG9vayByZXF1ZXN0IHRvICR7d2ViaG9va1VybH06YCwgZXJyb3IpO1xuICAgIGNvbnNvbGUuZXJyb3IoJ1dlYmhvb2sgZXJyb3IgZGV0YWlsczonLCB7XG4gICAgICBvcGVyYXRpb246ICdzZW5kV2ViaG9va1JlcXVlc3QnLFxuICAgICAgd2ViaG9va1VybCxcbiAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InXG4gICAgfTtcbiAgfVxufVxuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogYW55LCBjb250ZXh0OiBhbnkpID0+IHtcbiAgY29uc29sZS5sb2coJ/Cfk6cgTGFtYmRhIC0gUmVjZWl2ZWQgU0VTIGVtYWlsIGV2ZW50Jyk7XG4gIGNvbnNvbGUubG9nKCfwn5SNIExhbWJkYSAtIEV2ZW50IGRldGFpbHM6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcblxuICBjb25zdCBzZXJ2aWNlQXBpVXJsID0gcHJvY2Vzcy5lbnYuU0VSVklDRV9BUElfVVJMO1xuICBjb25zdCBzZXJ2aWNlQXBpVXJsRGV2ID0gcHJvY2Vzcy5lbnYuU0VSVklDRV9BUElfVVJMX0RFVjtcbiAgY29uc3Qgc2VydmljZUFwaUtleSA9IHByb2Nlc3MuZW52LlNFUlZJQ0VfQVBJX0tFWTtcbiAgY29uc3QgczNCdWNrZXROYW1lID0gcHJvY2Vzcy5lbnYuUzNfQlVDS0VUX05BTUU7XG5cbiAgaWYgKCFzZXJ2aWNlQXBpVXJsIHx8ICFzZXJ2aWNlQXBpS2V5KSB7XG4gICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ01pc3NpbmcgcmVxdWlyZWQgZW52aXJvbm1lbnQgdmFyaWFibGVzOiBTRVJWSUNFX0FQSV9VUkwgb3IgU0VSVklDRV9BUElfS0VZJyk7XG4gICAgY29uc29sZS5lcnJvcign4p2MIExhbWJkYSAtICcgKyBlcnJvci5tZXNzYWdlKTtcbiAgICBjb25zb2xlLmVycm9yKCdDb25maWd1cmF0aW9uIGVycm9yOicsIHsgZXJyb3JUeXBlOiAnY29uZmlndXJhdGlvbicgfSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBlcnJvcjogJ01pc3NpbmcgcmVxdWlyZWQgZW52aXJvbm1lbnQgdmFyaWFibGVzJyxcbiAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICB9KSxcbiAgICB9O1xuICB9XG5cbiAgaWYgKCFzM0J1Y2tldE5hbWUpIHtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcignTWlzc2luZyBTM19CVUNLRVRfTkFNRSBlbnZpcm9ubWVudCB2YXJpYWJsZScpO1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBMYW1iZGEgLSAnICsgZXJyb3IubWVzc2FnZSk7XG4gICAgY29uc29sZS5lcnJvcignQ29uZmlndXJhdGlvbiBlcnJvcjonLCB7IGVycm9yVHlwZTogJ2NvbmZpZ3VyYXRpb24nIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZXJyb3I6ICdNaXNzaW5nIFMzX0JVQ0tFVF9OQU1FIGVudmlyb25tZW50IHZhcmlhYmxlJyxcbiAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICB9KSxcbiAgICB9O1xuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBQcm9jZXNzIGVhY2ggU0VTIHJlY29yZCBhbmQgZmV0Y2ggZW1haWwgY29udGVudFxuICAgIGNvbnN0IHByb2Nlc3NlZFJlY29yZHM6IGFueVtdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IHJlY29yZCBvZiBldmVudC5SZWNvcmRzIHx8IFtdKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBzZXNEYXRhID0gcmVjb3JkLnNlcztcbiAgICAgICAgY29uc3QgbWVzc2FnZUlkID0gc2VzRGF0YS5tYWlsLm1lc3NhZ2VJZDtcbiAgICAgICAgY29uc3Qgc3ViamVjdCA9IHNlc0RhdGEubWFpbC5jb21tb25IZWFkZXJzPy5zdWJqZWN0IHx8ICdObyBTdWJqZWN0JztcblxuICAgICAgICAvLyBFeHRyYWN0IGRvbWFpbiBmcm9tIHJlY2lwaWVudCBlbWFpbFxuICAgICAgICBjb25zdCByZWNpcGllbnRzID0gc2VzRGF0YS5tYWlsLmRlc3RpbmF0aW9uIHx8IFtdO1xuICAgICAgICBjb25zdCByZWNpcGllbnRFbWFpbCA9IHJlY2lwaWVudHNbMF0gfHwgJyc7XG4gICAgICAgIGNvbnN0IGRvbWFpbiA9IHJlY2lwaWVudEVtYWlsLnNwbGl0KCdAJylbMV0gfHwgJyc7XG4gICAgICAgIFxuICAgICAgICAvLyBUcnkgdG8gZ2V0IFMzIG9iamVjdCBrZXkgZnJvbSBTRVMgcmVjZWlwdCBhY3Rpb24gZmlyc3RcbiAgICAgICAgbGV0IG9iamVjdEtleSA9IHNlc0RhdGEucmVjZWlwdD8uYWN0aW9uPy5vYmplY3RLZXk7XG4gICAgICAgIGxldCBzM0J1Y2tldCA9IHNlc0RhdGEucmVjZWlwdD8uYWN0aW9uPy5idWNrZXROYW1lIHx8IHMzQnVja2V0TmFtZTtcblxuICAgICAgICBjb25zb2xlLmxvZyhg8J+TqCBMYW1iZGEgLSBQcm9jZXNzaW5nIGVtYWlsOiAke21lc3NhZ2VJZH1gKTtcbiAgICAgICAgY29uc29sZS5sb2coYPCflI0gTGFtYmRhIC0gU0VTIHByb3ZpZGVkIG9iamVjdCBrZXk6ICR7b2JqZWN0S2V5IHx8ICdOT1QgUFJPVklERUQnfWApO1xuXG4gICAgICAgIC8vIElmIFNFUyBkaWRuJ3QgcHJvdmlkZSB0aGUgb2JqZWN0IGtleSwgd2UgbmVlZCB0byBkZXRlcm1pbmUgdGhlIGNvcnJlY3QgbG9jYXRpb25cbiAgICAgICAgLy8gQ2hlY2sgYm90aCBpbmRpdmlkdWFsIGFuZCBjYXRjaC1hbGwgbG9jYXRpb25zXG4gICAgICAgIGxldCBlbWFpbENvbnRlbnQgPSBudWxsO1xuICAgICAgICBcbiAgICAgICAgaWYgKCFvYmplY3RLZXkpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg4pqg77iPIExhbWJkYSAtIE5vIFMzIG9iamVjdCBrZXkgaW4gU0VTIGV2ZW50LCB3aWxsIGNoZWNrIGJvdGggcG9zc2libGUgbG9jYXRpb25zYCk7XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gUG9zc2libGUgbG9jYXRpb25zIGZvciB0aGUgZW1haWw6XG4gICAgICAgICAgLy8gMS4gSW5kaXZpZHVhbCBlbWFpbCBydWxlOiBlbWFpbHMve2RvbWFpbn0ve21lc3NhZ2VJZH1cbiAgICAgICAgICAvLyAyLiBDYXRjaC1hbGwgcnVsZTogZW1haWxzL3tkb21haW59L2NhdGNoYWxsL3ttZXNzYWdlSWR9XG4gICAgICAgICAgY29uc3QgcG9zc2libGVLZXlzID0gW1xuICAgICAgICAgICAgYGVtYWlscy8ke2RvbWFpbn0vJHttZXNzYWdlSWR9YCwgICAgICAgICAgIC8vIEluZGl2aWR1YWwgcnVsZSBsb2NhdGlvblxuICAgICAgICAgICAgYGVtYWlscy8ke2RvbWFpbn0vY2F0Y2hhbGwvJHttZXNzYWdlSWR9YCAgIC8vIENhdGNoLWFsbCBydWxlIGxvY2F0aW9uXG4gICAgICAgICAgXTtcblxuICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5SNIExhbWJkYSAtIFdpbGwgY2hlY2sgdGhlc2UgUzMgbG9jYXRpb25zOmAsIHBvc3NpYmxlS2V5cyk7XG5cbiAgICAgICAgICAvLyBUcnkgZWFjaCBsb2NhdGlvbiB1bnRpbCB3ZSBmaW5kIHRoZSBlbWFpbFxuICAgICAgICAgIGxldCBmb3VuZEtleSA9IG51bGw7XG5cbiAgICAgICAgICBmb3IgKGNvbnN0IHRlc3RLZXkgb2YgcG9zc2libGVLZXlzKSB7XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgZ2V0RW1haWxGcm9tUzMoczNCdWNrZXQsIHRlc3RLZXksIHRydWUpOyAvLyBTdXBwcmVzcyBcIm5vdCBmb3VuZFwiIGVycm9ycyBkdXJpbmcgc2VhcmNoXG4gICAgICAgICAgICBpZiAoY29udGVudCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICBlbWFpbENvbnRlbnQgPSBjb250ZW50O1xuICAgICAgICAgICAgICBmb3VuZEtleSA9IHRlc3RLZXk7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgTGFtYmRhIC0gRm91bmQgZW1haWwgYXQ6ICR7czNCdWNrZXR9LyR7dGVzdEtleX1gKTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCFmb3VuZEtleSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIExhbWJkYSAtIEVtYWlsIG5vdCBmb3VuZCBpbiBhbnkgZXhwZWN0ZWQgbG9jYXRpb24gZm9yIG1lc3NhZ2UgJHttZXNzYWdlSWR9YCk7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgTGFtYmRhIC0gQ2hlY2tlZCBsb2NhdGlvbnM6YCwgcG9zc2libGVLZXlzLm1hcChrZXkgPT4gYCR7czNCdWNrZXR9LyR7a2V5fWApKTtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRW1haWwgY29udGVudCBub3QgZm91bmQgaW4gUzMgZm9yIG1lc3NhZ2UgJHttZXNzYWdlSWR9YCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgb2JqZWN0S2V5ID0gZm91bmRLZXk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gU0VTIHByb3ZpZGVkIHRoZSBvYmplY3Qga2V5LCB2YWxpZGF0ZSBpdCBleGlzdHNcbiAgICAgICAgICBpZiAoIXMzQnVja2V0KSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgTGFtYmRhIC0gTWlzc2luZyBTMyBidWNrZXQgbmFtZSBmb3IgbWVzc2FnZSAke21lc3NhZ2VJZH1gKTtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTWlzc2luZyBTMyBidWNrZXQgbmFtZSBmb3IgbWVzc2FnZSAke21lc3NhZ2VJZH1gKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zb2xlLmxvZyhg8J+TjSBMYW1iZGEgLSBVc2luZyBTRVMgcHJvdmlkZWQgUzMgbG9jYXRpb246ICR7czNCdWNrZXR9LyR7b2JqZWN0S2V5fWApO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIEZldGNoIGVtYWlsIGNvbnRlbnQgdXNpbmcgdGhlIFNFUy1wcm92aWRlZCBrZXlcbiAgICAgICAgICBlbWFpbENvbnRlbnQgPSBhd2FpdCBnZXRFbWFpbEZyb21TMyhzM0J1Y2tldCwgb2JqZWN0S2V5KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIExvZyBwcm9jZXNzaW5nIGRldGFpbHMgZm9yIGRlYnVnZ2luZ1xuICAgICAgICBjb25zb2xlLmxvZygnUHJvY2Vzc2luZyBlbWFpbCBkZXRhaWxzOicsIHtcbiAgICAgICAgICBtZXNzYWdlSWQsXG4gICAgICAgICAgcmVjaXBpZW50RW1haWwsXG4gICAgICAgICAgZG9tYWluLFxuICAgICAgICAgIG9iamVjdEtleSxcbiAgICAgICAgICBzM0J1Y2tldEZyb21SZWNlaXB0OiBzZXNEYXRhLnJlY2VpcHQ/LmFjdGlvbj8uYnVja2V0TmFtZSxcbiAgICAgICAgICBzM0J1Y2tldEZyb21FbnY6IHMzQnVja2V0TmFtZSxcbiAgICAgICAgICBzM0J1Y2tldFVzZWQ6IHMzQnVja2V0LFxuICAgICAgICAgIG9iamVjdEtleVNvdXJjZTogc2VzRGF0YS5yZWNlaXB0Py5hY3Rpb24/Lm9iamVjdEtleSA/ICdTRVNfRVZFTlQnIDogJ0ZBTExCQUNLX1NFQVJDSCcsXG4gICAgICAgICAgZW1haWxDb250ZW50Rm91bmQ6IGVtYWlsQ29udGVudCAhPT0gbnVsbCxcbiAgICAgICAgICBlbWFpbENvbnRlbnRTaXplOiBlbWFpbENvbnRlbnQgPyBlbWFpbENvbnRlbnQubGVuZ3RoIDogMFxuICAgICAgICB9KTtcblxuICAgICAgICBwcm9jZXNzZWRSZWNvcmRzLnB1c2goe1xuICAgICAgICAgIC4uLnJlY29yZCxcbiAgICAgICAgICBlbWFpbENvbnRlbnQ6IGVtYWlsQ29udGVudCxcbiAgICAgICAgICBzM0xvY2F0aW9uOiB7XG4gICAgICAgICAgICBidWNrZXQ6IHMzQnVja2V0LFxuICAgICAgICAgICAga2V5OiBvYmplY3RLZXksXG4gICAgICAgICAgICBjb250ZW50RmV0Y2hlZDogZW1haWxDb250ZW50ICE9PSBudWxsLFxuICAgICAgICAgICAgY29udGVudFNpemU6IGVtYWlsQ29udGVudCA/IGVtYWlsQ29udGVudC5sZW5ndGggOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIExhbWJkYSAtIFByb2Nlc3NlZCByZWNvcmQgZm9yICR7bWVzc2FnZUlkfWApO1xuICAgICAgfSBjYXRjaCAocmVjb3JkRXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIExhbWJkYSAtIEVycm9yIHByb2Nlc3NpbmcgU0VTIHJlY29yZDonLCByZWNvcmRFcnJvcik7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1JlY29yZCBwcm9jZXNzaW5nIGVycm9yIGRldGFpbHM6Jywge1xuICAgICAgICAgIG9wZXJhdGlvbjogJ3Byb2Nlc3NTRVNSZWNvcmQnLFxuICAgICAgICAgIG1lc3NhZ2VJZDogcmVjb3JkPy5zZXM/Lm1haWw/Lm1lc3NhZ2VJZCxcbiAgICAgICAgICBlcnJvcjogcmVjb3JkRXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IHJlY29yZEVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gSW5jbHVkZSB0aGUgcmVjb3JkIGV2ZW4gaWYgUzMgZmV0Y2ggZmFpbGVkXG4gICAgICAgIHByb2Nlc3NlZFJlY29yZHMucHVzaCh7XG4gICAgICAgICAgLi4ucmVjb3JkLFxuICAgICAgICAgIGVtYWlsQ29udGVudDogbnVsbCxcbiAgICAgICAgICBzM0Vycm9yOiByZWNvcmRFcnJvciBpbnN0YW5jZW9mIEVycm9yID8gcmVjb3JkRXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiBhbnkgZW1haWwgc3ViamVjdCBjb250YWlucyB0aGUgdGVzdCBzdHJpbmcgdG8gZGV0ZXJtaW5lIHdoaWNoIEFQSSBVUkwgdG8gdXNlXG4gICAgLy8gY29uc3QgaGFzVGVzdFN1YmplY3QgPSBwcm9jZXNzZWRSZWNvcmRzLnNvbWUocmVjb3JkID0+IHtcbiAgICAvLyAgIGNvbnN0IHN1YmplY3QgPSByZWNvcmQ/LnNlcz8ubWFpbD8uY29tbW9uSGVhZGVycz8uc3ViamVjdCB8fCAnJztcbiAgICAvLyAgIHJldHVybiBzdWJqZWN0LmluY2x1ZGVzKCdpbG92ZWplc3Nzb211Y2gnKTtcbiAgICAvLyB9KTtcblxuICAgIC8vIGNvbnN0IHRhcmdldEFwaVVybCA9IGhhc1Rlc3RTdWJqZWN0ICYmIHNlcnZpY2VBcGlVcmxEZXYgPyBzZXJ2aWNlQXBpVXJsRGV2IDogc2VydmljZUFwaVVybDtcblxuICAgIC8vIEJ1aWxkIGxpc3Qgb2YgZW5kcG9pbnRzLCBmaWx0ZXJpbmcgb3V0IG51bGwvdW5kZWZpbmVkIHZhbHVlc1xuICAgIGNvbnN0IGVuZHBvaW50cyA9IFtzZXJ2aWNlQXBpVXJsLCBzZXJ2aWNlQXBpVXJsRGV2LCAnaHR0cHM6Ly9pbmJvdW5kLm5ldyddLmZpbHRlcihCb29sZWFuKTtcbiAgICBcbiAgICBjb25zb2xlLmxvZyhg8J+agCBMYW1iZGEgLSBXaWxsIGF0dGVtcHQgdG8gc2VuZCB0byAke2VuZHBvaW50cy5sZW5ndGh9IGVuZHBvaW50czpgLCBlbmRwb2ludHMpO1xuXG4gICAgLy8gaWYgKGhhc1Rlc3RTdWJqZWN0KSB7XG4gICAgLy8gICBjb25zb2xlLmxvZygn8J+nqiBMYW1iZGEgLSBUZXN0IHN1YmplY3QgZGV0ZWN0ZWQsIHVzaW5nIGRldmVsb3BtZW50IEFQSSBVUkw6Jywge1xuICAgIC8vICAgICB1c2luZ0RldlVybDogISFzZXJ2aWNlQXBpVXJsRGV2LFxuICAgIC8vICAgICB0YXJnZXRBcGlVcmxcbiAgICAvLyAgIH0pO1xuICAgIC8vIH1cbiAgICBcbiAgICAvLyBTZW5kIHRvIGFsbCBlbmRwb2ludHMgaW4gcGFyYWxsZWwgYW5kIGNvbGxlY3QgcmVzdWx0c1xuICAgIGNvbnNvbGUubG9nKGDwn5qAIExhbWJkYSAtIFNlbmRpbmcgJHtwcm9jZXNzZWRSZWNvcmRzLmxlbmd0aH0gcHJvY2Vzc2VkIHJlY29yZHMgdG8gJHtlbmRwb2ludHMubGVuZ3RofSBlbmRwb2ludHMgaW4gcGFyYWxsZWxgKTtcbiAgICBcbiAgICBjb25zdCB3ZWJob29rUHJvbWlzZXMgPSBlbmRwb2ludHMubWFwKGVuZHBvaW50ID0+IFxuICAgICAgc2VuZFdlYmhvb2tSZXF1ZXN0KFxuICAgICAgICBgJHtlbmRwb2ludH0vYXBpL2luYm91bmQvd2ViaG9va2AsXG4gICAgICAgIHNlcnZpY2VBcGlLZXksXG4gICAgICAgIHtcbiAgICAgICAgICBvcmlnaW5hbEV2ZW50OiBldmVudCxcbiAgICAgICAgICBwcm9jZXNzZWRSZWNvcmRzOiBwcm9jZXNzZWRSZWNvcmRzXG4gICAgICAgIH0sXG4gICAgICAgIGNvbnRleHRcbiAgICAgICkudGhlbihyZXN1bHQgPT4gKHtcbiAgICAgICAgZW5kcG9pbnQsXG4gICAgICAgIC4uLnJlc3VsdFxuICAgICAgfSkpXG4gICAgKTtcblxuICAgIC8vIFdhaXQgZm9yIGFsbCB3ZWJob29rIHJlcXVlc3RzIHRvIGNvbXBsZXRlIChib3RoIHN1Y2Nlc3NmdWwgYW5kIGZhaWxlZClcbiAgICBjb25zdCBzZXR0bGVkUmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZCh3ZWJob29rUHJvbWlzZXMpO1xuICAgIFxuICAgIC8vIFByb2Nlc3MgcmVzdWx0cyBhbmQgZXh0cmFjdCBhY3R1YWwgd2ViaG9vayByZXNwb25zZXNcbiAgICBjb25zdCB3ZWJob29rUmVzdWx0cyA9IHNldHRsZWRSZXN1bHRzLm1hcCgocmVzdWx0LCBpbmRleCkgPT4ge1xuICAgICAgY29uc3QgZW5kcG9pbnQgPSBlbmRwb2ludHNbaW5kZXhdO1xuICAgICAgXG4gICAgICBpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcpIHtcbiAgICAgICAgY29uc3Qgd2ViaG9va1Jlc3VsdCA9IHJlc3VsdC52YWx1ZTtcbiAgICAgICAgaWYgKHdlYmhvb2tSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgTGFtYmRhIC0gU3VjY2Vzc2Z1bGx5IHNlbnQgdG8gJHtlbmRwb2ludH1gKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgTGFtYmRhIC0gRmFpbGVkIHRvIHNlbmQgdG8gJHtlbmRwb2ludH06ICR7d2ViaG9va1Jlc3VsdC5lcnJvcn1gKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gd2ViaG9va1Jlc3VsdDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFByb21pc2Ugd2FzIHJlamVjdGVkIChuZXR3b3JrIGVycm9yLCBldGMuKVxuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgTGFtYmRhIC0gUHJvbWlzZSByZWplY3RlZCBmb3IgJHtlbmRwb2ludH06ICR7cmVzdWx0LnJlYXNvbn1gKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBlbmRwb2ludCxcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICBlcnJvcjogcmVzdWx0LnJlYXNvbiBpbnN0YW5jZW9mIEVycm9yID8gcmVzdWx0LnJlYXNvbi5tZXNzYWdlIDogJ1Byb21pc2UgcmVqZWN0ZWQnXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBoYXNTdWNjZXNzZnVsV2ViaG9vayA9IHdlYmhvb2tSZXN1bHRzLnNvbWUocmVzdWx0ID0+IHJlc3VsdC5zdWNjZXNzKTtcblxuICAgIC8vIExvZyBzdW1tYXJ5IG9mIGFsbCB3ZWJob29rIGF0dGVtcHRzXG4gICAgY29uc29sZS5sb2coJ/Cfk4ogTGFtYmRhIC0gV2ViaG9vayBzdW1tYXJ5OicsIHtcbiAgICAgIHRvdGFsRW5kcG9pbnRzOiBlbmRwb2ludHMubGVuZ3RoLFxuICAgICAgc3VjY2Vzc2Z1bFdlYmhvb2tzOiB3ZWJob29rUmVzdWx0cy5maWx0ZXIociA9PiByLnN1Y2Nlc3MpLmxlbmd0aCxcbiAgICAgIGZhaWxlZFdlYmhvb2tzOiB3ZWJob29rUmVzdWx0cy5maWx0ZXIociA9PiAhci5zdWNjZXNzKS5sZW5ndGgsXG4gICAgICByZXN1bHRzOiB3ZWJob29rUmVzdWx0cy5tYXAociA9PiAoeyBlbmRwb2ludDogci5lbmRwb2ludCwgc3VjY2Vzczogci5zdWNjZXNzLCBlcnJvcjogci5lcnJvciB9KSlcbiAgICB9KTtcblxuICAgIC8vIFJldHVybiBzdWNjZXNzIGlmIGF0IGxlYXN0IG9uZSB3ZWJob29rIHN1Y2NlZWRlZFxuICAgIGlmIChoYXNTdWNjZXNzZnVsV2ViaG9vaykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgbWVzc2FnZTogJ0VtYWlsIGV2ZW50IGZvcndhcmRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgICAgIHdlYmhvb2tSZXN1bHRzOiB3ZWJob29rUmVzdWx0cyxcbiAgICAgICAgICBzdWNjZXNzZnVsRW5kcG9pbnRzOiB3ZWJob29rUmVzdWx0cy5maWx0ZXIociA9PiByLnN1Y2Nlc3MpLmxlbmd0aCxcbiAgICAgICAgICB0b3RhbEVuZHBvaW50czogZW5kcG9pbnRzLmxlbmd0aCxcbiAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBBbGwgd2ViaG9va3MgZmFpbGVkXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ0FsbCB3ZWJob29rIHJlcXVlc3RzIGZhaWxlZCcsXG4gICAgICAgICAgd2ViaG9va1Jlc3VsdHM6IHdlYmhvb2tSZXN1bHRzLFxuICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ/CfkqUgTGFtYmRhIC0gRXJyb3IgZm9yd2FyZGluZyBlbWFpbCBldmVudDonLCBlcnJvcik7XG5cbiAgICAvLyBMb2cgdW5oYW5kbGVkIGVycm9yIGRldGFpbHNcbiAgICBjb25zb2xlLmVycm9yKCdVbmhhbmRsZWQgZXJyb3IgZGV0YWlsczonLCB7XG4gICAgICBvcGVyYXRpb246ICdoYW5kbGVyJyxcbiAgICAgIGVycm9yVHlwZTogJ3VuaGFuZGxlZCcsXG4gICAgICBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICBzdGFjazogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLnN0YWNrIDogdW5kZWZpbmVkXG4gICAgfSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBlcnJvcjogJ0ZhaWxlZCB0byBmb3J3YXJkIGVtYWlsIGV2ZW50JyxcbiAgICAgICAgZGV0YWlsczogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgfSksXG4gICAgfTtcbiAgfVxufTsgIl19