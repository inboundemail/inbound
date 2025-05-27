"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmailMetadata = exports.getEmailFromS3 = exports.handleSESEvent = exports.createEmailProcessor = exports.AWSSESEmailProcessor = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const client_ses_1 = require("@aws-sdk/client-ses");
const mailparser_1 = require("mailparser");
class AWSSESEmailProcessor {
    constructor(config = {}) {
        this.config = {
            s3Region: process.env.AWS_REGION || 'us-west-2',
            sesRegion: process.env.AWS_REGION || 'us-west-2',
            allowedDomains: [],
            blockedSenders: [],
            maxAttachmentSize: 10 * 1024 * 1024,
            enableSpamFilter: true,
            enableVirusFilter: true,
            serviceApiUrl: process.env.SERVICE_API_URL,
            serviceApiKey: process.env.SERVICE_API_KEY,
            ...config,
        };
        this.s3Client = new client_s3_1.S3Client({ region: this.config.s3Region });
        this.sesClient = new client_ses_1.SESClient({ region: this.config.sesRegion });
    }
    /**
     * Main entry point for processing SES email events
     * This is called by Lambda when emails are received
     */
    async processEmailEvent(event) {
        const processedEmails = [];
        for (const record of event.Records) {
            try {
                // Validate the email first
                if (!this.isEmailValid(record)) {
                    console.log(`Skipping invalid email: ${record.ses.mail.messageId}`);
                    continue;
                }
                // Check spam/virus filters
                if (!this.passesSecurityChecks(record.ses.receipt)) {
                    console.log(`Email failed security checks: ${record.ses.mail.messageId}`);
                    await this.bounceEmail(record.ses.mail, 'Email failed security validation');
                    continue;
                }
                // Process each recipient
                for (const recipient of record.ses.receipt.recipients) {
                    const processedEmail = await this.processEmailForRecipient(record, recipient);
                    if (processedEmail) {
                        processedEmails.push(processedEmail);
                        // Send webhook to your API for each recipient
                        await this.sendWebhookToAPI(processedEmail);
                    }
                }
            }
            catch (error) {
                console.error(`Error processing email ${record.ses.mail.messageId}:`, error);
                // Continue processing other emails even if one fails
            }
        }
        return processedEmails;
    }
    /**
     * Retrieve and parse email from S3 for API consumption
     * This is called by your API when it needs to fetch email content
     */
    async getEmailFromS3ForAPI(bucketName, objectKey) {
        try {
            // Get the email content from S3
            const emailContent = await this.getEmailFromS3(bucketName, objectKey);
            // Parse the email
            const parsedEmail = await this.parseEmail(emailContent);
            // Extract metadata from the object key or use defaults
            const messageId = objectKey.split('/').pop() || 'unknown';
            // Helper function to extract email address from AddressObject
            const extractEmailAddress = (addressObj) => {
                if (!addressObj)
                    return 'unknown';
                if (typeof addressObj === 'string')
                    return addressObj;
                if (addressObj.text)
                    return addressObj.text;
                if (Array.isArray(addressObj) && addressObj.length > 0) {
                    return addressObj[0].text || addressObj[0].address || 'unknown';
                }
                if (addressObj.address)
                    return addressObj.address;
                return 'unknown';
            };
            const extractEmailAddresses = (addressObj) => {
                if (!addressObj)
                    return [];
                if (typeof addressObj === 'string')
                    return [addressObj];
                if (Array.isArray(addressObj)) {
                    return addressObj.map(addr => addr.text || addr.address || 'unknown');
                }
                if (addressObj.text)
                    return [addressObj.text];
                if (addressObj.address)
                    return [addressObj.address];
                return [];
            };
            // Create processed email object
            const processedEmail = {
                messageId,
                from: extractEmailAddress(parsedEmail.from),
                to: extractEmailAddresses(parsedEmail.to),
                subject: parsedEmail.subject || 'No Subject',
                body: {
                    text: parsedEmail.text,
                    html: parsedEmail.html || undefined,
                },
                attachments: this.processAttachments(parsedEmail.attachments || []),
                headers: this.extractHeaders(parsedEmail),
                timestamp: parsedEmail.date || new Date(),
                recipient: extractEmailAddress(parsedEmail.to),
                authResults: {
                    spf: 'UNKNOWN',
                    dkim: 'UNKNOWN',
                    dmarc: 'UNKNOWN',
                    spam: 'UNKNOWN',
                    virus: 'UNKNOWN',
                },
                s3Location: {
                    bucket: bucketName,
                    key: objectKey,
                },
            };
            return processedEmail;
        }
        catch (error) {
            console.error(`Error retrieving email from S3: ${bucketName}/${objectKey}`, error);
            throw error;
        }
    }
    /**
     * Get email metadata without downloading full content
     * Useful for listing emails or quick previews
     */
    async getEmailMetadata(bucketName, objectKey) {
        try {
            const processedEmail = await this.getEmailFromS3ForAPI(bucketName, objectKey);
            return {
                messageId: processedEmail.messageId,
                from: processedEmail.from,
                to: processedEmail.to,
                subject: processedEmail.subject,
                timestamp: processedEmail.timestamp,
                recipient: processedEmail.recipient,
                hasAttachments: processedEmail.attachments.length > 0,
                attachmentCount: processedEmail.attachments.length,
                bodyPreview: (processedEmail.body.text || processedEmail.body.html || '').substring(0, 200),
                authResults: processedEmail.authResults,
                s3Location: processedEmail.s3Location,
                headers: processedEmail.headers,
            };
        }
        catch (error) {
            console.error(`Error getting email metadata: ${bucketName}/${objectKey}`, error);
            throw error;
        }
    }
    /**
     * Send webhook notification to your API when email is received
     */
    async sendWebhookToAPI(email) {
        if (!this.config.serviceApiUrl || !this.config.serviceApiKey) {
            console.log('Service API URL or key not configured, skipping webhook');
            return;
        }
        try {
            const webhookPayload = {
                type: 'email_received',
                timestamp: email.timestamp.toISOString(),
                data: {
                    messageId: email.messageId,
                    from: email.from,
                    to: email.to,
                    recipient: email.recipient,
                    subject: email.subject,
                    bodyPreview: (email.body.text || email.body.html || '').substring(0, 200),
                    hasAttachments: email.attachments.length > 0,
                    attachmentCount: email.attachments.length,
                    authResults: email.authResults,
                    s3Location: email.s3Location,
                    headers: {
                        messageId: email.headers['message-id'],
                        date: email.headers.date,
                        replyTo: email.headers['reply-to'],
                        inReplyTo: email.headers['in-reply-to'],
                        references: email.headers.references,
                    },
                },
            };
            const response = await fetch(`${this.config.serviceApiUrl}/api/webhooks/email-received`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.serviceApiKey}`,
                    'User-Agent': 'AWS-Lambda-Email-Processor/1.0',
                },
                body: JSON.stringify(webhookPayload),
            });
            if (!response.ok) {
                throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
            }
            console.log(`Webhook sent successfully for email: ${email.messageId}`);
        }
        catch (error) {
            console.error(`Failed to send webhook for email ${email.messageId}:`, error);
            // Don't throw error here - webhook failure shouldn't stop email processing
        }
    }
    /**
     * Validate if recipient email is managed by your system
     * This should check against your database of managed email addresses
     */
    async isRecipientManaged(recipient) {
        if (!this.config.serviceApiUrl || !this.config.serviceApiKey) {
            // If no API configured, allow all recipients in allowed domains
            if (this.config.allowedDomains && this.config.allowedDomains.length > 0) {
                const domain = recipient.split('@')[1];
                return this.config.allowedDomains.includes(domain);
            }
            return true;
        }
        try {
            const response = await fetch(`${this.config.serviceApiUrl}/api/emails/check-recipient`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.serviceApiKey}`,
                },
                body: JSON.stringify({ recipient }),
            });
            if (response.ok) {
                const result = await response.json();
                return result.isManaged === true;
            }
            return false;
        }
        catch (error) {
            console.error(`Error checking if recipient is managed: ${recipient}`, error);
            // On error, fall back to domain checking
            if (this.config.allowedDomains && this.config.allowedDomains.length > 0) {
                const domain = recipient.split('@')[1];
                return this.config.allowedDomains.includes(domain);
            }
            return false;
        }
    }
    /**
     * Process email for a specific recipient
     */
    async processEmailForRecipient(record, recipient) {
        try {
            // Check if this recipient is managed by your system
            const isManaged = await this.isRecipientManaged(recipient);
            if (!isManaged) {
                console.log(`Recipient ${recipient} is not managed by the system, skipping`);
                return null;
            }
            // Get the email content from S3
            const emailContent = await this.getEmailFromS3(record.ses.receipt.action.bucketName, record.ses.receipt.action.objectKey);
            // Parse the email
            const parsedEmail = await this.parseEmail(emailContent);
            // Create processed email object
            const processedEmail = {
                messageId: record.ses.mail.messageId,
                from: record.ses.mail.source,
                to: record.ses.mail.destination,
                subject: record.ses.mail.commonHeaders.subject,
                body: {
                    text: parsedEmail.text,
                    html: parsedEmail.html || undefined,
                },
                attachments: this.processAttachments(parsedEmail.attachments || []),
                headers: this.extractHeaders(parsedEmail),
                timestamp: new Date(record.ses.mail.timestamp),
                recipient,
                authResults: {
                    spf: record.ses.receipt.spfVerdict.status,
                    dkim: record.ses.receipt.dkimVerdict.status,
                    dmarc: record.ses.receipt.dmarcVerdict.status,
                    spam: record.ses.receipt.spamVerdict.status,
                    virus: record.ses.receipt.virusVerdict.status,
                },
                s3Location: {
                    bucket: record.ses.receipt.action.bucketName,
                    key: record.ses.receipt.action.objectKey,
                },
            };
            return processedEmail;
        }
        catch (error) {
            console.error(`Error processing email for recipient ${recipient}:`, error);
            return null;
        }
    }
    /**
     * Retrieve email content from S3
     */
    async getEmailFromS3(bucketName, objectKey) {
        try {
            const command = new client_s3_1.GetObjectCommand({
                Bucket: bucketName,
                Key: objectKey,
            });
            const response = await this.s3Client.send(command);
            if (!response.Body) {
                throw new Error('No email content found in S3 object');
            }
            // Convert stream to buffer
            const chunks = [];
            const reader = response.Body.transformToWebStream().getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                chunks.push(value);
            }
            return Buffer.concat(chunks);
        }
        catch (error) {
            console.error(`Error retrieving email from S3: ${bucketName}/${objectKey}`, error);
            throw error;
        }
    }
    /**
     * Parse email content using mailparser
     */
    async parseEmail(emailBuffer) {
        try {
            return await (0, mailparser_1.simpleParser)(emailBuffer);
        }
        catch (error) {
            console.error('Error parsing email:', error);
            throw error;
        }
    }
    /**
     * Process email attachments
     */
    processAttachments(attachments) {
        return attachments
            .filter(attachment => {
            // Filter out inline images and oversized attachments
            return (attachment.filename &&
                attachment.size <= this.config.maxAttachmentSize &&
                !attachment.cid // Exclude inline images
            );
        })
            .map(attachment => ({
            filename: attachment.filename,
            contentType: attachment.contentType,
            size: attachment.size,
            content: attachment.content,
        }));
    }
    /**
     * Extract relevant headers from parsed email
     */
    extractHeaders(parsedEmail) {
        const headers = {};
        if (parsedEmail.headers) {
            // Extract common headers
            const commonHeaders = [
                'message-id',
                'date',
                'from',
                'to',
                'cc',
                'bcc',
                'subject',
                'reply-to',
                'in-reply-to',
                'references',
                'x-mailer',
                'x-originating-ip',
            ];
            for (const header of commonHeaders) {
                const value = parsedEmail.headers.get(header);
                if (value) {
                    headers[header] = Array.isArray(value) ? value.join(', ') : value.toString();
                }
            }
        }
        return headers;
    }
    /**
     * Validate email against basic criteria
     */
    isEmailValid(record) {
        const { mail, receipt } = record.ses;
        // Check if sender is blocked
        if (this.config.blockedSenders?.includes(mail.source)) {
            console.log(`Blocked sender: ${mail.source}`);
            return false;
        }
        return true;
    }
    /**
     * Check if email passes spam and virus filters
     */
    passesSecurityChecks(receipt) {
        if (this.config.enableSpamFilter && receipt.spamVerdict.status === 'FAIL') {
            console.log('Email failed spam check');
            return false;
        }
        if (this.config.enableVirusFilter && receipt.virusVerdict.status === 'FAIL') {
            console.log('Email failed virus check');
            return false;
        }
        return true;
    }
    /**
     * Send bounce response for rejected emails
     */
    async bounceEmail(mail, reason) {
        try {
            const bounceParams = {
                OriginalMessageId: mail.messageId,
                BounceSender: `mailer-daemon@${mail.destination[0].split('@')[1]}`,
                MessageDsn: {
                    ReportingMta: `dns; ${mail.destination[0].split('@')[1]}`,
                    ArrivalDate: new Date(mail.timestamp),
                    ExtensionFields: [],
                },
                BouncedRecipientInfoList: mail.destination.map(recipient => ({
                    Recipient: recipient,
                    BounceType: 'Permanent',
                    RecipientArn: undefined,
                    RecipientDsnFields: {
                        FinalRecipient: recipient,
                        Action: 'failed',
                        Status: '5.1.1',
                        DiagnosticCode: reason,
                    },
                })),
            };
            const command = new client_ses_1.SendBounceCommand(bounceParams);
            await this.sesClient.send(command);
            console.log(`Bounce sent for message: ${mail.messageId}`);
        }
        catch (error) {
            console.error(`Error sending bounce for message ${mail.messageId}:`, error);
        }
    }
    /**
     * Extract email domain from address
     */
    static extractDomain(email) {
        return email.split('@')[1]?.toLowerCase() || '';
    }
    /**
     * Check if email is from a trusted domain
     */
    static isTrustedDomain(email, trustedDomains) {
        const domain = this.extractDomain(email);
        return trustedDomains.includes(domain);
    }
}
exports.AWSSESEmailProcessor = AWSSESEmailProcessor;
// Utility functions for Lambda handlers
const createEmailProcessor = (config) => {
    return new AWSSESEmailProcessor(config);
};
exports.createEmailProcessor = createEmailProcessor;
const handleSESEvent = async (event, config) => {
    const processor = (0, exports.createEmailProcessor)(config);
    return await processor.processEmailEvent(event);
};
exports.handleSESEvent = handleSESEvent;
// Utility function for API to retrieve emails from S3
const getEmailFromS3 = async (bucketName, objectKey, config) => {
    const processor = (0, exports.createEmailProcessor)(config);
    return await processor.getEmailFromS3ForAPI(bucketName, objectKey);
};
exports.getEmailFromS3 = getEmailFromS3;
// Utility function for API to get email metadata
const getEmailMetadata = async (bucketName, objectKey, config) => {
    const processor = (0, exports.createEmailProcessor)(config);
    return await processor.getEmailMetadata(bucketName, objectKey);
};
exports.getEmailMetadata = getEmailMetadata;
//# sourceMappingURL=aws-ses.js.map