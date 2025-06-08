"use strict";
// THIS IS THE PRIMARY LAMBDA FUNCTION FOR PROCESSING EMAILS
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3Client = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
/**
 * Fetch email content from S3
 */
async function getEmailFromS3(bucketName, objectKey) {
    try {
        console.log(`📥 Lambda - Fetching email from S3: ${bucketName}/${objectKey}`);
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
        console.log(`✅ Lambda - Successfully fetched email content (${emailContent.length} bytes)`);
        return emailContent;
    }
    catch (error) {
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
        // Forward the enhanced event to the webhook
        // Check if any email subject contains the test string to determine which API URL to use
        const hasTestSubject = processedRecords.some(record => {
            const subject = record?.ses?.mail?.commonHeaders?.subject || '';
            return subject.includes('ilovejesssomuch');
        });
        const targetApiUrl = hasTestSubject && serviceApiUrlDev ? serviceApiUrlDev : serviceApiUrl;
        const webhookUrl = `${targetApiUrl}/api/inbound/webhook`;
        if (hasTestSubject) {
            console.log('🧪 Lambda - Test subject detected, using development API URL:', {
                usingDevUrl: !!serviceApiUrlDev,
                targetApiUrl
            });
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1haWwtcHJvY2Vzc29yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZW1haWwtcHJvY2Vzc29yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSw0REFBNEQ7OztBQUU1RCxrREFBZ0U7QUFFaEUsTUFBTSxRQUFRLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFFakY7O0dBRUc7QUFDSCxLQUFLLFVBQVUsY0FBYyxDQUFDLFVBQWtCLEVBQUUsU0FBaUI7SUFDakUsSUFBSTtRQUNGLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUNBQXVDLFVBQVUsSUFBSSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBRTlFLE1BQU0sT0FBTyxHQUFHLElBQUksNEJBQWdCLENBQUM7WUFDbkMsTUFBTSxFQUFFLFVBQVU7WUFDbEIsR0FBRyxFQUFFLFNBQVM7U0FDZixDQUFDLENBQUM7UUFFSCxNQUFNLFFBQVEsR0FBRyxNQUFNLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFOUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUU7WUFDbEIsT0FBTyxDQUFDLEtBQUssQ0FBQyxnREFBZ0QsQ0FBQyxDQUFDO1lBQ2hFLE9BQU8sSUFBSSxDQUFDO1NBQ2I7UUFFRCwyQkFBMkI7UUFDM0IsTUFBTSxNQUFNLEdBQWlCLEVBQUUsQ0FBQztRQUNoQyxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUMsU0FBUyxFQUFFLENBQUM7UUFFaEUsT0FBTyxJQUFJLEVBQUU7WUFDWCxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxHQUFHLE1BQU0sTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQzVDLElBQUksSUFBSTtnQkFBRSxNQUFNO1lBQ2hCLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFD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S0FDSDtJQUFDLE9BQU8sS0FBSyxFQUFFO1FBQ2QsT0FBTyxDQUFDLEtBQUssQ0FBQywyQ0FBMkMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVsRSw4QkFBOEI7UUFDOUIsT0FBTyxDQUFDLEtBQUssQ0FBQywwQkFBMEIsRUFBRTtZQUN4QyxTQUFTLEVBQUUsU0FBUztZQUNwQixTQUFTLEVBQUUsV0FBVztZQUN0QixLQUFLLEVBQUUsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZTtZQUMvRCxLQUFLLEVBQUUsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsU0FBUztTQUN4RCxDQUFDLENBQUM7UUFFSCxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsS0FBSyxFQUFFLCtCQUErQjtnQkFDdEMsT0FBTyxFQUFFLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWU7Z0JBQ2pFLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTthQUNwQyxDQUFDO1NBQ0gsQ0FBQztLQUNIO0FBQ0gsQ0FBQyxDQUFDO0FBdE1XLFFBQUEsT0FBTyxXQXNNbEIiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBUSElTIElTIFRIRSBQUklNQVJZIExBTUJEQSBGVU5DVElPTiBGT1IgUFJPQ0VTU0lORyBFTUFJTFNcblxuaW1wb3J0IHsgUzNDbGllbnQsIEdldE9iamVjdENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuXG5jb25zdCBzM0NsaWVudCA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0yJyB9KTtcblxuLyoqXG4gKiBGZXRjaCBlbWFpbCBjb250ZW50IGZyb20gUzNcbiAqL1xuYXN5bmMgZnVuY3Rpb24gZ2V0RW1haWxGcm9tUzMoYnVja2V0TmFtZTogc3RyaW5nLCBvYmplY3RLZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKGDwn5OlIExhbWJkYSAtIEZldGNoaW5nIGVtYWlsIGZyb20gUzM6ICR7YnVja2V0TmFtZX0vJHtvYmplY3RLZXl9YCk7XG4gICAgXG4gICAgY29uc3QgY29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgIEJ1Y2tldDogYnVja2V0TmFtZSxcbiAgICAgIEtleTogb2JqZWN0S2V5LFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzM0NsaWVudC5zZW5kKGNvbW1hbmQpO1xuICAgIFxuICAgIGlmICghcmVzcG9uc2UuQm9keSkge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIExhbWJkYSAtIE5vIGVtYWlsIGNvbnRlbnQgZm91bmQgaW4gUzMgb2JqZWN0Jyk7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvLyBDb252ZXJ0IHN0cmVhbSB0byBzdHJpbmdcbiAgICBjb25zdCBjaHVua3M6IFVpbnQ4QXJyYXlbXSA9IFtdO1xuICAgIGNvbnN0IHJlYWRlciA9IHJlc3BvbnNlLkJvZHkudHJhbnNmb3JtVG9XZWJTdHJlYW0oKS5nZXRSZWFkZXIoKTtcbiAgICBcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgY29uc3QgeyBkb25lLCB2YWx1ZSB9ID0gYXdhaXQgcmVhZGVyLnJlYWQoKTtcbiAgICAgIGlmIChkb25lKSBicmVhaztcbiAgICAgIGNodW5rcy5wdXNoKHZhbHVlKTtcbiAgICB9XG5cbiAgICBjb25zdCBlbWFpbENvbnRlbnQgPSBCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoJ3V0Zi04Jyk7XG4gICAgY29uc29sZS5sb2coYOKchSBMYW1iZGEgLSBTdWNjZXNzZnVsbHkgZmV0Y2hlZCBlbWFpbCBjb250ZW50ICgke2VtYWlsQ29udGVudC5sZW5ndGh9IGJ5dGVzKWApO1xuICAgIFxuICAgIHJldHVybiBlbWFpbENvbnRlbnQ7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihg4p2MIExhbWJkYSAtIEVycm9yIGZldGNoaW5nIGVtYWlsIGZyb20gUzM6ICR7YnVja2V0TmFtZX0vJHtvYmplY3RLZXl9YCwgZXJyb3IpO1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGRldGFpbHM6Jywge1xuICAgICAgb3BlcmF0aW9uOiAnZ2V0RW1haWxGcm9tUzMnLFxuICAgICAgYnVja2V0OiBidWNrZXROYW1lLFxuICAgICAga2V5OiBvYmplY3RLZXksXG4gICAgICBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcidcbiAgICB9KTtcbiAgICBcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogYW55LCBjb250ZXh0OiBhbnkpID0+IHtcbiAgY29uc29sZS5sb2coJ/Cfk6cgTGFtYmRhIC0gUmVjZWl2ZWQgU0VTIGVtYWlsIGV2ZW50Jyk7XG4gIGNvbnNvbGUubG9nKCfwn5SNIExhbWJkYSAtIEV2ZW50IGRldGFpbHM6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcblxuICBjb25zdCBzZXJ2aWNlQXBpVXJsID0gcHJvY2Vzcy5lbnYuU0VSVklDRV9BUElfVVJMO1xuICBjb25zdCBzZXJ2aWNlQXBpVXJsRGV2ID0gcHJvY2Vzcy5lbnYuU0VSVklDRV9BUElfVVJMX0RFVjtcbiAgY29uc3Qgc2VydmljZUFwaUtleSA9IHByb2Nlc3MuZW52LlNFUlZJQ0VfQVBJX0tFWTtcbiAgY29uc3QgczNCdWNrZXROYW1lID0gcHJvY2Vzcy5lbnYuUzNfQlVDS0VUX05BTUU7XG5cbiAgaWYgKCFzZXJ2aWNlQXBpVXJsIHx8ICFzZXJ2aWNlQXBpS2V5KSB7XG4gICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ01pc3NpbmcgcmVxdWlyZWQgZW52aXJvbm1lbnQgdmFyaWFibGVzOiBTRVJWSUNFX0FQSV9VUkwgb3IgU0VSVklDRV9BUElfS0VZJyk7XG4gICAgY29uc29sZS5lcnJvcign4p2MIExhbWJkYSAtICcgKyBlcnJvci5tZXNzYWdlKTtcbiAgICBjb25zb2xlLmVycm9yKCdDb25maWd1cmF0aW9uIGVycm9yOicsIHsgZXJyb3JUeXBlOiAnY29uZmlndXJhdGlvbicgfSk7XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZXJyb3I6ICdNaXNzaW5nIHJlcXVpcmVkIGVudmlyb25tZW50IHZhcmlhYmxlcycsXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgfSksXG4gICAgfTtcbiAgfVxuXG4gIGlmICghczNCdWNrZXROYW1lKSB7XG4gICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ01pc3NpbmcgUzNfQlVDS0VUX05BTUUgZW52aXJvbm1lbnQgdmFyaWFibGUnKTtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgTGFtYmRhIC0gJyArIGVycm9yLm1lc3NhZ2UpO1xuICAgIGNvbnNvbGUuZXJyb3IoJ0NvbmZpZ3VyYXRpb24gZXJyb3I6JywgeyBlcnJvclR5cGU6ICdjb25maWd1cmF0aW9uJyB9KTtcbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBlcnJvcjogJ01pc3NpbmcgUzNfQlVDS0VUX05BTUUgZW52aXJvbm1lbnQgdmFyaWFibGUnLFxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cblxuICB0cnkge1xuICAgIC8vIFByb2Nlc3MgZWFjaCBTRVMgcmVjb3JkIGFuZCBmZXRjaCBlbWFpbCBjb250ZW50XG4gICAgY29uc3QgcHJvY2Vzc2VkUmVjb3JkcyA9IFtdO1xuICAgIFxuICAgIGZvciAoY29uc3QgcmVjb3JkIG9mIGV2ZW50LlJlY29yZHMgfHwgW10pIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHNlc0RhdGEgPSByZWNvcmQuc2VzO1xuICAgICAgICBjb25zdCBtZXNzYWdlSWQgPSBzZXNEYXRhLm1haWwubWVzc2FnZUlkO1xuICAgICAgICBjb25zdCBzdWJqZWN0ID0gc2VzRGF0YS5tYWlsLmNvbW1vbkhlYWRlcnM/LnN1YmplY3QgfHwgJ05vIFN1YmplY3QnO1xuICAgICAgICBcbiAgICAgICAgLy8gRXh0cmFjdCBkb21haW4gZnJvbSByZWNpcGllbnQgZW1haWxcbiAgICAgICAgY29uc3QgcmVjaXBpZW50cyA9IHNlc0RhdGEubWFpbC5kZXN0aW5hdGlvbiB8fCBbXTtcbiAgICAgICAgY29uc3QgcmVjaXBpZW50RW1haWwgPSByZWNpcGllbnRzWzBdIHx8ICcnO1xuICAgICAgICBjb25zdCBkb21haW4gPSByZWNpcGllbnRFbWFpbC5zcGxpdCgnQCcpWzFdIHx8ICcnO1xuICAgICAgICAvLyBDb25zdHJ1Y3QgUzMgb2JqZWN0IGtleSBiYXNlZCBvbiBTRVMgcmVjZWlwdCBydWxlIGNvbmZpZ3VyYXRpb25cbiAgICAgICAgLy8gVGhlIHJlY2VpcHQgcnVsZSBzdG9yZXMgZW1haWxzIHdpdGggcHJlZml4OiBlbWFpbHMve2RvbWFpbn0vXG4gICAgICAgIGNvbnN0IG9iamVjdEtleSA9IGBlbWFpbHMvJHtkb21haW59LyR7bWVzc2FnZUlkfWA7XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhg8J+TqCBMYW1iZGEgLSBQcm9jZXNzaW5nIGVtYWlsOiAke21lc3NhZ2VJZH1gKTtcbiAgICAgICAgY29uc29sZS5sb2coYPCfk40gTGFtYmRhIC0gUzMgbG9jYXRpb246ICR7czNCdWNrZXROYW1lfS8ke29iamVjdEtleX1gKTtcbiAgICAgICAgXG4gICAgICAgIC8vIExvZyBwcm9jZXNzaW5nIGRldGFpbHMgZm9yIGRlYnVnZ2luZ1xuICAgICAgICBjb25zb2xlLmxvZygnUHJvY2Vzc2luZyBlbWFpbCBkZXRhaWxzOicsIHtcbiAgICAgICAgICBtZXNzYWdlSWQsXG4gICAgICAgICAgcmVjaXBpZW50RW1haWwsXG4gICAgICAgICAgZG9tYWluLFxuICAgICAgICAgIG9iamVjdEtleVxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIC8vIEZldGNoIGVtYWlsIGNvbnRlbnQgZnJvbSBTM1xuICAgICAgICBjb25zdCBlbWFpbENvbnRlbnQgPSBhd2FpdCBnZXRFbWFpbEZyb21TMyhzM0J1Y2tldE5hbWUsIG9iamVjdEtleSk7XG4gICAgICAgIFxuICAgICAgICBwcm9jZXNzZWRSZWNvcmRzLnB1c2goe1xuICAgICAgICAgIC4uLnJlY29yZCxcbiAgICAgICAgICBlbWFpbENvbnRlbnQ6IGVtYWlsQ29udGVudCxcbiAgICAgICAgICBzM0xvY2F0aW9uOiB7XG4gICAgICAgICAgICBidWNrZXQ6IHMzQnVja2V0TmFtZSxcbiAgICAgICAgICAgIGtleTogb2JqZWN0S2V5LFxuICAgICAgICAgICAgY29udGVudEZldGNoZWQ6IGVtYWlsQ29udGVudCAhPT0gbnVsbCxcbiAgICAgICAgICAgIGNvbnRlbnRTaXplOiBlbWFpbENvbnRlbnQgPyBlbWFpbENvbnRlbnQubGVuZ3RoIDogMFxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIExhbWJkYSAtIFByb2Nlc3NlZCByZWNvcmQgZm9yICR7bWVzc2FnZUlkfWApO1xuICAgICAgfSBjYXRjaCAocmVjb3JkRXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIExhbWJkYSAtIEVycm9yIHByb2Nlc3NpbmcgU0VTIHJlY29yZDonLCByZWNvcmRFcnJvcik7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1JlY29yZCBwcm9jZXNzaW5nIGVycm9yIGRldGFpbHM6Jywge1xuICAgICAgICAgIG9wZXJhdGlvbjogJ3Byb2Nlc3NTRVNSZWNvcmQnLFxuICAgICAgICAgIG1lc3NhZ2VJZDogcmVjb3JkPy5zZXM/Lm1haWw/Lm1lc3NhZ2VJZCxcbiAgICAgICAgICBlcnJvcjogcmVjb3JkRXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IHJlY29yZEVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcidcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICAvLyBJbmNsdWRlIHRoZSByZWNvcmQgZXZlbiBpZiBTMyBmZXRjaCBmYWlsZWRcbiAgICAgICAgcHJvY2Vzc2VkUmVjb3Jkcy5wdXNoKHtcbiAgICAgICAgICAuLi5yZWNvcmQsXG4gICAgICAgICAgZW1haWxDb250ZW50OiBudWxsLFxuICAgICAgICAgIHMzRXJyb3I6IHJlY29yZEVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyByZWNvcmRFcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBGb3J3YXJkIHRoZSBlbmhhbmNlZCBldmVudCB0byB0aGUgd2ViaG9va1xuICAgIC8vIENoZWNrIGlmIGFueSBlbWFpbCBzdWJqZWN0IGNvbnRhaW5zIHRoZSB0ZXN0IHN0cmluZyB0byBkZXRlcm1pbmUgd2hpY2ggQVBJIFVSTCB0byB1c2VcbiAgICBjb25zdCBoYXNUZXN0U3ViamVjdCA9IHByb2Nlc3NlZFJlY29yZHMuc29tZShyZWNvcmQgPT4ge1xuICAgICAgY29uc3Qgc3ViamVjdCA9IHJlY29yZD8uc2VzPy5tYWlsPy5jb21tb25IZWFkZXJzPy5zdWJqZWN0IHx8ICcnO1xuICAgICAgcmV0dXJuIHN1YmplY3QuaW5jbHVkZXMoJ2lsb3ZlamVzc3NvbXVjaCcpO1xuICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IHRhcmdldEFwaVVybCA9IGhhc1Rlc3RTdWJqZWN0ICYmIHNlcnZpY2VBcGlVcmxEZXYgPyBzZXJ2aWNlQXBpVXJsRGV2IDogc2VydmljZUFwaVVybDtcbiAgICBjb25zdCB3ZWJob29rVXJsID0gYCR7dGFyZ2V0QXBpVXJsfS9hcGkvaW5ib3VuZC93ZWJob29rYDtcbiAgICBcbiAgICBpZiAoaGFzVGVzdFN1YmplY3QpIHtcbiAgICAgIGNvbnNvbGUubG9nKCfwn6eqIExhbWJkYSAtIFRlc3Qgc3ViamVjdCBkZXRlY3RlZCwgdXNpbmcgZGV2ZWxvcG1lbnQgQVBJIFVSTDonLCB7XG4gICAgICAgIHVzaW5nRGV2VXJsOiAhIXNlcnZpY2VBcGlVcmxEZXYsXG4gICAgICAgIHRhcmdldEFwaVVybFxuICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKGDwn5qAIExhbWJkYSAtIEZvcndhcmRpbmcgJHtwcm9jZXNzZWRSZWNvcmRzLmxlbmd0aH0gcHJvY2Vzc2VkIHJlY29yZHMgdG8gd2ViaG9vazogJHt3ZWJob29rVXJsfWApO1xuICAgIFxuICAgIC8vIExvZyB3ZWJob29rIGNhbGwgZGV0YWlsc1xuICAgIGNvbnNvbGUubG9nKCdXZWJob29rIGNhbGwgZGV0YWlsczonLCB7XG4gICAgICB1cmw6IHdlYmhvb2tVcmwsXG4gICAgICByZWNvcmRDb3VudDogcHJvY2Vzc2VkUmVjb3Jkcy5sZW5ndGhcbiAgICB9KTtcbiAgICBcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHdlYmhvb2tVcmwsIHtcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtzZXJ2aWNlQXBpS2V5fWAsXG4gICAgICAgICdVc2VyLUFnZW50JzogJ0FXUy1MYW1iZGEtRW1haWwtRm9yd2FyZGVyLzEuMCcsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICB0eXBlOiAnc2VzX2V2ZW50X3dpdGhfY29udGVudCcsXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICBvcmlnaW5hbEV2ZW50OiBldmVudCxcbiAgICAgICAgcHJvY2Vzc2VkUmVjb3JkczogcHJvY2Vzc2VkUmVjb3JkcyxcbiAgICAgICAgY29udGV4dDoge1xuICAgICAgICAgIGZ1bmN0aW9uTmFtZTogY29udGV4dC5mdW5jdGlvbk5hbWUsXG4gICAgICAgICAgZnVuY3Rpb25WZXJzaW9uOiBjb250ZXh0LmZ1bmN0aW9uVmVyc2lvbixcbiAgICAgICAgICByZXF1ZXN0SWQ6IGNvbnRleHQuYXdzUmVxdWVzdElkLFxuICAgICAgICB9XG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgIGNvbnN0IGVycm9yVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBMYW1iZGEgLSBXZWJob29rIGZhaWxlZDogJHtyZXNwb25zZS5zdGF0dXN9ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBMYW1iZGEgLSBFcnJvciByZXNwb25zZTogJHtlcnJvclRleHR9YCk7XG4gICAgICBcbiAgICAgIC8vIExvZyB3ZWJob29rIGZhaWx1cmUgZGV0YWlsc1xuICAgICAgY29uc29sZS5lcnJvcignV2ViaG9vayBmYWlsdXJlIGRldGFpbHM6Jywge1xuICAgICAgICBvcGVyYXRpb246ICd3ZWJob29rJyxcbiAgICAgICAgc3RhdHVzQ29kZTogcmVzcG9uc2Uuc3RhdHVzLFxuICAgICAgICB3ZWJob29rVXJsLFxuICAgICAgICBlcnJvclJlc3BvbnNlOiBlcnJvclRleHRcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiByZXNwb25zZS5zdGF0dXMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ1dlYmhvb2sgcmVxdWVzdCBmYWlsZWQnLFxuICAgICAgICAgIHN0YXR1czogcmVzcG9uc2Uuc3RhdHVzLFxuICAgICAgICAgIHN0YXR1c1RleHQ6IHJlc3BvbnNlLnN0YXR1c1RleHQsXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgY29uc29sZS5sb2coJ+KchSBMYW1iZGEgLSBXZWJob29rIHJlc3BvbnNlOicsIHJlc3VsdCk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBtZXNzYWdlOiAnRW1haWwgZXZlbnQgZm9yd2FyZGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICAgIHdlYmhvb2tSZXNwb25zZTogcmVzdWx0LFxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign8J+SpSBMYW1iZGEgLSBFcnJvciBmb3J3YXJkaW5nIGVtYWlsIGV2ZW50OicsIGVycm9yKTtcbiAgICBcbiAgICAvLyBMb2cgdW5oYW5kbGVkIGVycm9yIGRldGFpbHNcbiAgICBjb25zb2xlLmVycm9yKCdVbmhhbmRsZWQgZXJyb3IgZGV0YWlsczonLCB7XG4gICAgICBvcGVyYXRpb246ICdoYW5kbGVyJyxcbiAgICAgIGVycm9yVHlwZTogJ3VuaGFuZGxlZCcsXG4gICAgICBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICBzdGFjazogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLnN0YWNrIDogdW5kZWZpbmVkXG4gICAgfSk7XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gZm9yd2FyZCBlbWFpbCBldmVudCcsXG4gICAgICAgIGRldGFpbHM6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InLFxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cbn07ICJdfQ==