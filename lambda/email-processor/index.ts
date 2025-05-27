import { handleSESEvent, EmailProcessingConfig } from '../../lib/aws-ses';

const emailConfig: EmailProcessingConfig = {
  serviceApiUrl: process.env.SERVICE_API_URL!,
  serviceApiKey: process.env.SERVICE_API_KEY!,
  maxAttachmentSize: parseInt(process.env.MAX_ATTACHMENT_SIZE || '10485760'),
  enableSpamFilter: process.env.ENABLE_SPAM_FILTER !== 'false',
  enableVirusFilter: process.env.ENABLE_VIRUS_FILTER !== 'false',
};

export const handler = async (event: any, context: any) => {
  console.log('Processing SES email event:', JSON.stringify(event, null, 2));
  console.log('Lambda context:', JSON.stringify(context, null, 2));

  try {
    // Process emails - this will automatically:
    // 1. Check if recipients are managed via your API
    // 2. Send webhooks to your API for valid emails
    const processedEmails = await handleSESEvent(event, emailConfig);
    
    console.log(`Successfully processed ${processedEmails.length} emails`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Successfully processed ${processedEmails.length} emails`,
        processedEmails: processedEmails.length,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('Error processing SES event:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error processing emails',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
    };
  }
}; 