"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3Client = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-west-2' });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1haWwtcHJvY2Vzc29yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZW1haWwtcHJvY2Vzc29yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLGtEQUFnRTtBQUVoRSxNQUFNLFFBQVEsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVyxFQUFFLENBQUMsQ0FBQztBQUVqRjs7R0FFRztBQUNILEtBQUssVUFBVSxjQUFjLENBQUMsVUFBa0IsRUFBRSxTQUFpQjtJQUNqRSxJQUFJO1FBQ0YsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1Q0FBdUMsVUFBVSxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFFOUUsTUFBTSxPQUFPLEdBQUcsSUFBSSw0QkFBZ0IsQ0FBQztZQUNuQyxNQUFNLEVBQUUsVUFBVTtZQUNsQixHQUFHLEVBQUUsU0FBUztTQUNmLENBQUMsQ0FBQztRQUVILE1BQU0sUUFBUSxHQUFHLE1BQU0sUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUU5QyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRTtZQUNsQixPQUFPLENBQUMsS0FBSyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7WUFDaEUsT0FBTyxJQUFJLENBQUM7U0FDYjtRQUVELDJCQUEyQjtRQUMzQixNQUFNLE1BQU0sR0FBaUIsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUVoRSxPQUFPLElBQUksRUFBRTtZQUNYLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEdBQUcsTUFBTSxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDNUMsSUFBSSxJQUFJO2dCQUFFLE1BQU07WUFDaEIsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztTQUNwQjtRQUVELE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzdELE9BQU8sQ0FBQyxHQUFHLENBQUMsa0RBQWtELFlBQVksQ0FBQyxNQUFNLFNBQVMsQ0FBQyxDQUFDO1FBRTVGLE9BQU8sWUFBWSxDQUFDO0tBQ3JCO0lBQUMsT0FBTyxLQUFLLEVBQUU7UUFDZCxPQUFPLENBQUMsS0FBSyxDQUFDLDRDQUE0QyxVQUFVLElBQUksU0FBUyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDNUYsT0FBTyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRTtZQUM5QixTQUFTLEVBQUUsZ0JBQWdCO1lBQzNCLE1BQU0sRUFBRSxVQUFVO1lBQ2xCLEdBQUcsRUFBRSxTQUFTO1lBQ2QsS0FBSyxFQUFFLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWU7U0FDaEUsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxJQUFJLENBQUM7S0FDYjtBQUNILENBQUM7QUFFTSxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQUUsS0FBVSxFQUFFLE9BQVksRUFBRSxFQUFFO0lBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQUMsc0NBQXNDLENBQUMsQ0FBQztJQUNwRCxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTFFLE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDO0lBQ2xELE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDO0lBQ2xELE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDO0lBRWhELElBQUksQ0FBQyxhQUFhLElBQUksQ0FBQyxhQUFhLEVBQUU7UUFDcEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxLQUFLLENBQUMsNEVBQTRFLENBQUMsQ0FBQztRQUN0RyxPQUFPLENBQUMsS0FBSyxDQUFDLGFBQWEsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDN0MsT0FBTyxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixLQUFLLEVBQUUsd0NBQXdDO2dCQUMvQyxTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7YUFDcEMsQ0FBQztTQUNILENBQUM7S0FDSDtJQUVELElBQUksQ0FBQyxZQUFZLEVBQUU7UUFDakIsTUFBTSxLQUFLLEdBQUcsSUFBSSxLQUFLLENBQUMsNkNBQTZDLENBQUMsQ0FBQztRQUN2RSxPQUFPLENBQUMsS0FBSyxDQUFDLGFBQWEsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDN0MsT0FBTyxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixLQUFLLEVBQUUsNkNBQTZDO2dCQUNwRCxTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7YUFDcEMsQ0FBQztTQUNILENBQUM7S0FDSDtJQUVELElBQUk7UUFDRixrREFBa0Q7UUFDbEQsTUFBTSxnQkFBZ0IsR0FBRyxFQUFFLENBQUM7UUFFNUIsS0FBSyxNQUFNLE1BQU0sSUFBSSxLQUFLLENBQUMsT0FBTyxJQUFJLEVBQUUsRUFBRTtZQUN4QyxJQUFJO2dCQUNGLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUM7Z0JBQzNCLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUV6QyxzQ0FBc0M7Z0JBQ3RDLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxJQUFJLEVBQUUsQ0FBQztnQkFDbEQsTUFBTSxjQUFjLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDM0MsTUFBTSxNQUFNLEdBQUcsY0FBYyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBRWxELGtFQUFrRTtnQkFDbEUsK0RBQStEO2dCQUMvRCxNQUFNLFNBQVMsR0FBRyxVQUFVLE1BQU0sSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFFbEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsU0FBUyxFQUFFLENBQUMsQ0FBQztnQkFDMUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsWUFBWSxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUM7Z0JBRXJFLHVDQUF1QztnQkFDdkMsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsRUFBRTtvQkFDdkMsU0FBUztvQkFDVCxjQUFjO29CQUNkLE1BQU07b0JBQ04sU0FBUztpQkFDVixDQUFDLENBQUM7Z0JBRUgsOEJBQThCO2dCQUM5QixNQUFNLFlBQVksR0FBRyxNQUFNLGNBQWMsQ0FBQyxZQUFZLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBRW5FLGdCQUFnQixDQUFDLElBQUksQ0FBQztvQkFDcEIsR0FBRyxNQUFNO29CQUNULFlBQVksRUFBRSxZQUFZO29CQUMxQixVQUFVLEVBQUU7d0JBQ1YsTUFBTSxFQUFFLFlBQVk7d0JBQ3BCLEdBQUcsRUFBRSxTQUFTO3dCQUNkLGNBQWMsRUFBRSxZQUFZLEtBQUssSUFBSTt3QkFDckMsV0FBVyxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztxQkFDcEQ7aUJBQ0YsQ0FBQyxDQUFDO2dCQUVILE9BQU8sQ0FBQyxHQUFHLENBQUMsbUNBQW1DLFNBQVMsRUFBRSxDQUFDLENBQUM7YUFDN0Q7WUFBQyxPQUFPLFdBQVcsRUFBRTtnQkFDcEIsT0FBTyxDQUFDLEtBQUssQ0FBQyx5Q0FBeUMsRUFBRSxXQUFXLENBQUMsQ0FBQztnQkFDdEUsT0FBTyxDQUFDLEtBQUssQ0FBQyxrQ0FBa0MsRUFBRTtvQkFDaEQsU0FBUyxFQUFFLGtCQUFrQjtvQkFDN0IsU0FBUyxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLFNBQVM7b0JBQ3ZDLEtBQUssRUFBRSxXQUFXLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxlQUFlO2lCQUM1RSxDQUFDLENBQUM7Z0JBQ0gsNkNBQTZDO2dCQUM3QyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUM7b0JBQ3BCLEdBQUcsTUFBTTtvQkFDVCxZQUFZLEVBQUUsSUFBSTtvQkFDbEIsT0FBTyxFQUFFLFdBQVcsWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWU7aUJBQzlFLENBQUMsQ0FBQzthQUNKO1NBQ0Y7UUFFRCw0Q0FBNEM7UUFDNUMsTUFBTSxVQUFVLEdBQUcsR0FBRyxhQUFhLHNCQUFzQixDQUFDO1FBRTFELE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLGdCQUFnQixDQUFDLE1BQU0sa0NBQWtDLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFFN0csMkJBQTJCO1FBQzNCLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLEVBQUU7WUFDbkMsR0FBRyxFQUFFLFVBQVU7WUFDZixXQUFXLEVBQUUsZ0JBQWdCLENBQUMsTUFBTTtTQUNyQyxDQUFDLENBQUM7UUFFSCxNQUFNLFFBQVEsR0FBRyxNQUFNLEtBQUssQ0FBQyxVQUFVLEVBQUU7WUFDdkMsTUFBTSxFQUFFLE1BQU07WUFDZCxPQUFPLEVBQUU7Z0JBQ1AsY0FBYyxFQUFFLGtCQUFrQjtnQkFDbEMsZUFBZSxFQUFFLFVBQVUsYUFBYSxFQUFFO2dCQUMxQyxZQUFZLEVBQUUsZ0NBQWdDO2FBQy9DO1lBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBQ25CLElBQUksRUFBRSx3QkFBd0I7Z0JBQzlCLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtnQkFDbkMsYUFBYSxFQUFFLEtBQUs7Z0JBQ3BCLGdCQUFnQixFQUFFLGdCQUFnQjtnQkFDbEMsT0FBTyxFQUFFO29CQUNQLFlBQVksRUFBRSxPQUFPLENBQUMsWUFBWTtvQkFDbEMsZUFBZSxFQUFFLE9BQU8sQ0FBQyxlQUFlO29CQUN4QyxTQUFTLEVBQUUsT0FBTyxDQUFDLFlBQVk7aUJBQ2hDO2FBQ0YsQ0FBQztTQUNILENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFO1lBQ2hCLE1BQU0sU0FBUyxHQUFHLE1BQU0sUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3hDLE9BQU8sQ0FBQyxLQUFLLENBQUMsOEJBQThCLFFBQVEsQ0FBQyxNQUFNLElBQUksUUFBUSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7WUFDdEYsT0FBTyxDQUFDLEtBQUssQ0FBQyw4QkFBOEIsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUV6RCw4QkFBOEI7WUFDOUIsT0FBTyxDQUFDLEtBQUssQ0FBQywwQkFBMEIsRUFBRTtnQkFDeEMsU0FBUyxFQUFFLFNBQVM7Z0JBQ3BCLFVBQVUsRUFBRSxRQUFRLENBQUMsTUFBTTtnQkFDM0IsVUFBVTtnQkFDVixhQUFhLEVBQUUsU0FBUzthQUN6QixDQUFDLENBQUM7WUFFSCxPQUFPO2dCQUNMLFVBQVUsRUFBRSxRQUFRLENBQUMsTUFBTTtnQkFDM0IsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7b0JBQ25CLEtBQUssRUFBRSx3QkFBd0I7b0JBQy9CLE1BQU0sRUFBRSxRQUFRLENBQUMsTUFBTTtvQkFDdkIsVUFBVSxFQUFFLFFBQVEsQ0FBQyxVQUFVO29CQUMvQixTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7aUJBQ3BDLENBQUM7YUFDSCxDQUFDO1NBQ0g7UUFFRCxNQUFNLE1BQU0sR0FBRyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNyQyxPQUFPLENBQUMsR0FBRyxDQUFDLDhCQUE4QixFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRXBELE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixPQUFPLEVBQUUsb0NBQW9DO2dCQUM3QyxlQUFlLEVBQUUsTUFBTTtnQkFDdkIsU0FBUyxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO2FBQ3BDLENBQUM7U0FDSCxDQUFDO0tBQ0g7SUFBQyxPQUFPLEtBQUssRUFBRTtRQUNkLE9BQU8sQ0FBQyxLQUFLLENBQUMsMkNBQTJDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFbEUsOEJBQThCO1FBQzlCLE9BQU8sQ0FBQyxLQUFLLENBQUMsMEJBQTBCLEVBQUU7WUFDeEMsU0FBUyxFQUFFLFNBQVM7WUFDcEIsU0FBUyxFQUFFLFdBQVc7WUFDdEIsS0FBSyxFQUFFLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWU7WUFDL0QsS0FBSyxFQUFFLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLFNBQVM7U0FDeEQsQ0FBQyxDQUFDO1FBRUgsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBQ25CLEtBQUssRUFBRSwrQkFBK0I7Z0JBQ3RDLE9BQU8sRUFBRSxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxlQUFlO2dCQUNqRSxTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7YUFDcEMsQ0FBQztTQUNILENBQUM7S0FDSDtBQUNILENBQUMsQ0FBQztBQXBMVyxRQUFBLE9BQU8sV0FvTGxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUzNDbGllbnQsIEdldE9iamVjdENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuXG5jb25zdCBzM0NsaWVudCA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtd2VzdC0yJyB9KTtcblxuLyoqXG4gKiBGZXRjaCBlbWFpbCBjb250ZW50IGZyb20gUzNcbiAqL1xuYXN5bmMgZnVuY3Rpb24gZ2V0RW1haWxGcm9tUzMoYnVja2V0TmFtZTogc3RyaW5nLCBvYmplY3RLZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKGDwn5OlIExhbWJkYSAtIEZldGNoaW5nIGVtYWlsIGZyb20gUzM6ICR7YnVja2V0TmFtZX0vJHtvYmplY3RLZXl9YCk7XG4gICAgXG4gICAgY29uc3QgY29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgIEJ1Y2tldDogYnVja2V0TmFtZSxcbiAgICAgIEtleTogb2JqZWN0S2V5LFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzM0NsaWVudC5zZW5kKGNvbW1hbmQpO1xuICAgIFxuICAgIGlmICghcmVzcG9uc2UuQm9keSkge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIExhbWJkYSAtIE5vIGVtYWlsIGNvbnRlbnQgZm91bmQgaW4gUzMgb2JqZWN0Jyk7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvLyBDb252ZXJ0IHN0cmVhbSB0byBzdHJpbmdcbiAgICBjb25zdCBjaHVua3M6IFVpbnQ4QXJyYXlbXSA9IFtdO1xuICAgIGNvbnN0IHJlYWRlciA9IHJlc3BvbnNlLkJvZHkudHJhbnNmb3JtVG9XZWJTdHJlYW0oKS5nZXRSZWFkZXIoKTtcbiAgICBcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgY29uc3QgeyBkb25lLCB2YWx1ZSB9ID0gYXdhaXQgcmVhZGVyLnJlYWQoKTtcbiAgICAgIGlmIChkb25lKSBicmVhaztcbiAgICAgIGNodW5rcy5wdXNoKHZhbHVlKTtcbiAgICB9XG5cbiAgICBjb25zdCBlbWFpbENvbnRlbnQgPSBCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoJ3V0Zi04Jyk7XG4gICAgY29uc29sZS5sb2coYOKchSBMYW1iZGEgLSBTdWNjZXNzZnVsbHkgZmV0Y2hlZCBlbWFpbCBjb250ZW50ICgke2VtYWlsQ29udGVudC5sZW5ndGh9IGJ5dGVzKWApO1xuICAgIFxuICAgIHJldHVybiBlbWFpbENvbnRlbnQ7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihg4p2MIExhbWJkYSAtIEVycm9yIGZldGNoaW5nIGVtYWlsIGZyb20gUzM6ICR7YnVja2V0TmFtZX0vJHtvYmplY3RLZXl9YCwgZXJyb3IpO1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGRldGFpbHM6Jywge1xuICAgICAgb3BlcmF0aW9uOiAnZ2V0RW1haWxGcm9tUzMnLFxuICAgICAgYnVja2V0OiBidWNrZXROYW1lLFxuICAgICAga2V5OiBvYmplY3RLZXksXG4gICAgICBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcidcbiAgICB9KTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogYW55LCBjb250ZXh0OiBhbnkpID0+IHtcbiAgY29uc29sZS5sb2coJ/Cfk6cgTGFtYmRhIC0gUmVjZWl2ZWQgU0VTIGVtYWlsIGV2ZW50Jyk7XG4gIGNvbnNvbGUubG9nKCfwn5SNIExhbWJkYSAtIEV2ZW50IGRldGFpbHM6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcblxuICBjb25zdCBzZXJ2aWNlQXBpVXJsID0gcHJvY2Vzcy5lbnYuU0VSVklDRV9BUElfVVJMO1xuICBjb25zdCBzZXJ2aWNlQXBpS2V5ID0gcHJvY2Vzcy5lbnYuU0VSVklDRV9BUElfS0VZO1xuICBjb25zdCBzM0J1Y2tldE5hbWUgPSBwcm9jZXNzLmVudi5TM19CVUNLRVRfTkFNRTtcblxuICBpZiAoIXNlcnZpY2VBcGlVcmwgfHwgIXNlcnZpY2VBcGlLZXkpIHtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcignTWlzc2luZyByZXF1aXJlZCBlbnZpcm9ubWVudCB2YXJpYWJsZXM6IFNFUlZJQ0VfQVBJX1VSTCBvciBTRVJWSUNFX0FQSV9LRVknKTtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgTGFtYmRhIC0gJyArIGVycm9yLm1lc3NhZ2UpO1xuICAgIGNvbnNvbGUuZXJyb3IoJ0NvbmZpZ3VyYXRpb24gZXJyb3I6JywgeyBlcnJvclR5cGU6ICdjb25maWd1cmF0aW9uJyB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBlcnJvcjogJ01pc3NpbmcgcmVxdWlyZWQgZW52aXJvbm1lbnQgdmFyaWFibGVzJyxcbiAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICB9KSxcbiAgICB9O1xuICB9XG5cbiAgaWYgKCFzM0J1Y2tldE5hbWUpIHtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcignTWlzc2luZyBTM19CVUNLRVRfTkFNRSBlbnZpcm9ubWVudCB2YXJpYWJsZScpO1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBMYW1iZGEgLSAnICsgZXJyb3IubWVzc2FnZSk7XG4gICAgY29uc29sZS5lcnJvcignQ29uZmlndXJhdGlvbiBlcnJvcjonLCB7IGVycm9yVHlwZTogJ2NvbmZpZ3VyYXRpb24nIH0pO1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIGVycm9yOiAnTWlzc2luZyBTM19CVUNLRVRfTkFNRSBlbnZpcm9ubWVudCB2YXJpYWJsZScsXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgfSksXG4gICAgfTtcbiAgfVxuXG4gIHRyeSB7XG4gICAgLy8gUHJvY2VzcyBlYWNoIFNFUyByZWNvcmQgYW5kIGZldGNoIGVtYWlsIGNvbnRlbnRcbiAgICBjb25zdCBwcm9jZXNzZWRSZWNvcmRzID0gW107XG4gICAgXG4gICAgZm9yIChjb25zdCByZWNvcmQgb2YgZXZlbnQuUmVjb3JkcyB8fCBbXSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc2VzRGF0YSA9IHJlY29yZC5zZXM7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2VJZCA9IHNlc0RhdGEubWFpbC5tZXNzYWdlSWQ7XG4gICAgICAgIFxuICAgICAgICAvLyBFeHRyYWN0IGRvbWFpbiBmcm9tIHJlY2lwaWVudCBlbWFpbFxuICAgICAgICBjb25zdCByZWNpcGllbnRzID0gc2VzRGF0YS5tYWlsLmRlc3RpbmF0aW9uIHx8IFtdO1xuICAgICAgICBjb25zdCByZWNpcGllbnRFbWFpbCA9IHJlY2lwaWVudHNbMF0gfHwgJyc7XG4gICAgICAgIGNvbnN0IGRvbWFpbiA9IHJlY2lwaWVudEVtYWlsLnNwbGl0KCdAJylbMV0gfHwgJyc7XG4gICAgICAgIFxuICAgICAgICAvLyBDb25zdHJ1Y3QgUzMgb2JqZWN0IGtleSBiYXNlZCBvbiBTRVMgcmVjZWlwdCBydWxlIGNvbmZpZ3VyYXRpb25cbiAgICAgICAgLy8gVGhlIHJlY2VpcHQgcnVsZSBzdG9yZXMgZW1haWxzIHdpdGggcHJlZml4OiBlbWFpbHMve2RvbWFpbn0vXG4gICAgICAgIGNvbnN0IG9iamVjdEtleSA9IGBlbWFpbHMvJHtkb21haW59LyR7bWVzc2FnZUlkfWA7XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhg8J+TqCBMYW1iZGEgLSBQcm9jZXNzaW5nIGVtYWlsOiAke21lc3NhZ2VJZH1gKTtcbiAgICAgICAgY29uc29sZS5sb2coYPCfk40gTGFtYmRhIC0gUzMgbG9jYXRpb246ICR7czNCdWNrZXROYW1lfS8ke29iamVjdEtleX1gKTtcbiAgICAgICAgXG4gICAgICAgIC8vIExvZyBwcm9jZXNzaW5nIGRldGFpbHMgZm9yIGRlYnVnZ2luZ1xuICAgICAgICBjb25zb2xlLmxvZygnUHJvY2Vzc2luZyBlbWFpbCBkZXRhaWxzOicsIHtcbiAgICAgICAgICBtZXNzYWdlSWQsXG4gICAgICAgICAgcmVjaXBpZW50RW1haWwsXG4gICAgICAgICAgZG9tYWluLFxuICAgICAgICAgIG9iamVjdEtleVxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIC8vIEZldGNoIGVtYWlsIGNvbnRlbnQgZnJvbSBTM1xuICAgICAgICBjb25zdCBlbWFpbENvbnRlbnQgPSBhd2FpdCBnZXRFbWFpbEZyb21TMyhzM0J1Y2tldE5hbWUsIG9iamVjdEtleSk7XG4gICAgICAgIFxuICAgICAgICBwcm9jZXNzZWRSZWNvcmRzLnB1c2goe1xuICAgICAgICAgIC4uLnJlY29yZCxcbiAgICAgICAgICBlbWFpbENvbnRlbnQ6IGVtYWlsQ29udGVudCxcbiAgICAgICAgICBzM0xvY2F0aW9uOiB7XG4gICAgICAgICAgICBidWNrZXQ6IHMzQnVja2V0TmFtZSxcbiAgICAgICAgICAgIGtleTogb2JqZWN0S2V5LFxuICAgICAgICAgICAgY29udGVudEZldGNoZWQ6IGVtYWlsQ29udGVudCAhPT0gbnVsbCxcbiAgICAgICAgICAgIGNvbnRlbnRTaXplOiBlbWFpbENvbnRlbnQgPyBlbWFpbENvbnRlbnQubGVuZ3RoIDogMFxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIExhbWJkYSAtIFByb2Nlc3NlZCByZWNvcmQgZm9yICR7bWVzc2FnZUlkfWApO1xuICAgICAgfSBjYXRjaCAocmVjb3JkRXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIExhbWJkYSAtIEVycm9yIHByb2Nlc3NpbmcgU0VTIHJlY29yZDonLCByZWNvcmRFcnJvcik7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1JlY29yZCBwcm9jZXNzaW5nIGVycm9yIGRldGFpbHM6Jywge1xuICAgICAgICAgIG9wZXJhdGlvbjogJ3Byb2Nlc3NTRVNSZWNvcmQnLFxuICAgICAgICAgIG1lc3NhZ2VJZDogcmVjb3JkPy5zZXM/Lm1haWw/Lm1lc3NhZ2VJZCxcbiAgICAgICAgICBlcnJvcjogcmVjb3JkRXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IHJlY29yZEVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcidcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIEluY2x1ZGUgdGhlIHJlY29yZCBldmVuIGlmIFMzIGZldGNoIGZhaWxlZFxuICAgICAgICBwcm9jZXNzZWRSZWNvcmRzLnB1c2goe1xuICAgICAgICAgIC4uLnJlY29yZCxcbiAgICAgICAgICBlbWFpbENvbnRlbnQ6IG51bGwsXG4gICAgICAgICAgczNFcnJvcjogcmVjb3JkRXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IHJlY29yZEVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcidcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEZvcndhcmQgdGhlIGVuaGFuY2VkIGV2ZW50IHRvIHRoZSB3ZWJob29rXG4gICAgY29uc3Qgd2ViaG9va1VybCA9IGAke3NlcnZpY2VBcGlVcmx9L2FwaS9pbmJvdW5kL3dlYmhvb2tgO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKGDwn5qAIExhbWJkYSAtIEZvcndhcmRpbmcgJHtwcm9jZXNzZWRSZWNvcmRzLmxlbmd0aH0gcHJvY2Vzc2VkIHJlY29yZHMgdG8gd2ViaG9vazogJHt3ZWJob29rVXJsfWApO1xuICAgIFxuICAgIC8vIExvZyB3ZWJob29rIGNhbGwgZGV0YWlsc1xuICAgIGNvbnNvbGUubG9nKCdXZWJob29rIGNhbGwgZGV0YWlsczonLCB7XG4gICAgICB1cmw6IHdlYmhvb2tVcmwsXG4gICAgICByZWNvcmRDb3VudDogcHJvY2Vzc2VkUmVjb3Jkcy5sZW5ndGhcbiAgICB9KTtcbiAgICBcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHdlYmhvb2tVcmwsIHtcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtzZXJ2aWNlQXBpS2V5fWAsXG4gICAgICAgICdVc2VyLUFnZW50JzogJ0FXUy1MYW1iZGEtRW1haWwtRm9yd2FyZGVyLzEuMCcsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICB0eXBlOiAnc2VzX2V2ZW50X3dpdGhfY29udGVudCcsXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICBvcmlnaW5hbEV2ZW50OiBldmVudCxcbiAgICAgICAgcHJvY2Vzc2VkUmVjb3JkczogcHJvY2Vzc2VkUmVjb3JkcyxcbiAgICAgICAgY29udGV4dDoge1xuICAgICAgICAgIGZ1bmN0aW9uTmFtZTogY29udGV4dC5mdW5jdGlvbk5hbWUsXG4gICAgICAgICAgZnVuY3Rpb25WZXJzaW9uOiBjb250ZXh0LmZ1bmN0aW9uVmVyc2lvbixcbiAgICAgICAgICByZXF1ZXN0SWQ6IGNvbnRleHQuYXdzUmVxdWVzdElkLFxuICAgICAgICB9XG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgIGNvbnN0IGVycm9yVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBMYW1iZGEgLSBXZWJob29rIGZhaWxlZDogJHtyZXNwb25zZS5zdGF0dXN9ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBMYW1iZGEgLSBFcnJvciByZXNwb25zZTogJHtlcnJvclRleHR9YCk7XG4gICAgICBcbiAgICAgIC8vIExvZyB3ZWJob29rIGZhaWx1cmUgZGV0YWlsc1xuICAgICAgY29uc29sZS5lcnJvcignV2ViaG9vayBmYWlsdXJlIGRldGFpbHM6Jywge1xuICAgICAgICBvcGVyYXRpb246ICd3ZWJob29rJyxcbiAgICAgICAgc3RhdHVzQ29kZTogcmVzcG9uc2Uuc3RhdHVzLFxuICAgICAgICB3ZWJob29rVXJsLFxuICAgICAgICBlcnJvclJlc3BvbnNlOiBlcnJvclRleHRcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiByZXNwb25zZS5zdGF0dXMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ1dlYmhvb2sgcmVxdWVzdCBmYWlsZWQnLFxuICAgICAgICAgIHN0YXR1czogcmVzcG9uc2Uuc3RhdHVzLFxuICAgICAgICAgIHN0YXR1c1RleHQ6IHJlc3BvbnNlLnN0YXR1c1RleHQsXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgY29uc29sZS5sb2coJ+KchSBMYW1iZGEgLSBXZWJob29rIHJlc3BvbnNlOicsIHJlc3VsdCk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBtZXNzYWdlOiAnRW1haWwgZXZlbnQgZm9yd2FyZGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICAgIHdlYmhvb2tSZXNwb25zZTogcmVzdWx0LFxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign8J+SpSBMYW1iZGEgLSBFcnJvciBmb3J3YXJkaW5nIGVtYWlsIGV2ZW50OicsIGVycm9yKTtcbiAgICBcbiAgICAvLyBMb2cgdW5oYW5kbGVkIGVycm9yIGRldGFpbHNcbiAgICBjb25zb2xlLmVycm9yKCdVbmhhbmRsZWQgZXJyb3IgZGV0YWlsczonLCB7XG4gICAgICBvcGVyYXRpb246ICdoYW5kbGVyJyxcbiAgICAgIGVycm9yVHlwZTogJ3VuaGFuZGxlZCcsXG4gICAgICBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICBzdGFjazogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLnN0YWNrIDogdW5kZWZpbmVkXG4gICAgfSk7XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gZm9yd2FyZCBlbWFpbCBldmVudCcsXG4gICAgICAgIGRldGFpbHM6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InLFxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cbn07ICJdfQ==