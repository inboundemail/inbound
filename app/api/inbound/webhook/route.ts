import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sesEvents, receivedEmails } from '@/lib/db/schema'
import { nanoid } from 'nanoid'

interface SESEvent {
  Records: Array<{
    eventSource: string
    eventVersion: string
    ses: {
      receipt: {
        timestamp: string
        processingTimeMillis: number
        recipients: string[]
        spamVerdict: { status: string }
        virusVerdict: { status: string }
        spfVerdict: { status: string }
        dkimVerdict: { status: string }
        dmarcVerdict: { status: string }
        action: {
          type: string
          bucketName: string
          objectKey: string
        }
      }
      mail: {
        timestamp: string
        messageId: string
        source: string
        destination: string[]
        commonHeaders: {
          from: string[]
          to: string[]
          subject: string
          date?: string
          messageId?: string
        }
      }
    }
  }>
}

interface ProcessedSESRecord {
  eventSource: string
  eventVersion: string
  ses: {
    receipt: {
      timestamp: string
      processingTimeMillis: number
      recipients: string[]
      spamVerdict: { status: string }
      virusVerdict: { status: string }
      spfVerdict: { status: string }
      dkimVerdict: { status: string }
      dmarcVerdict: { status: string }
      action: {
        type: string
        bucketName: string
        objectKey: string
      }
    }
    mail: {
      timestamp: string
      messageId: string
      source: string
      destination: string[]
      commonHeaders: {
        from: string[]
        to: string[]
        subject: string
        date?: string
        messageId?: string
      }
    }
  }
  emailContent?: string | null
  s3Location?: {
    bucket: string
    key: string
    contentFetched: boolean
    contentSize: number
  }
  s3Error?: string
}

interface WebhookPayload {
  type: 'ses_event_with_content'
  timestamp: string
  originalEvent: SESEvent
  processedRecords: ProcessedSESRecord[]
  context: {
    functionName: string
    functionVersion: string
    requestId: string
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('📧 Webhook - Received email event from Lambda');
    
    // Verify the request is from our Lambda function
    const authHeader = request.headers.get('authorization')
    const expectedApiKey = process.env.SERVICE_API_KEY
    
    if (!authHeader || !expectedApiKey) {
      console.error('❌ Webhook - Missing authentication');
      return NextResponse.json(
        { error: 'Missing authentication' },
        { status: 401 }
      )
    }

    const providedKey = authHeader.replace('Bearer ', '')
    if (providedKey !== expectedApiKey) {
      console.error('❌ Webhook - Invalid authentication');
      return NextResponse.json(
        { error: 'Invalid authentication' },
        { status: 401 }
      )
    }

    const payload: WebhookPayload = await request.json()
    console.log('🔍 Webhook - Payload type:', payload.type);

    // Validate payload structure
    if (payload.type !== 'ses_event_with_content' || !payload.processedRecords) {
      console.error('❌ Webhook - Invalid payload structure');
      return NextResponse.json(
        { error: 'Invalid payload structure' },
        { status: 400 }
      )
    }

    const processedEmails = []

    // Process each enhanced SES record
    for (const record of payload.processedRecords) {
      try {
        const sesData = record.ses
        const mail = sesData.mail
        const receipt = sesData.receipt

        console.log(`📨 Webhook - Processing email: ${mail.messageId}`);
        console.log(`👥 Webhook - Recipients: ${receipt.recipients.join(', ')}`);

        // First, store the SES event
        const sesEventId = nanoid()
        const sesEventRecord = {
          id: sesEventId,
          eventSource: record.eventSource,
          eventVersion: record.eventVersion,
          messageId: mail.messageId,
          source: mail.source,
          destination: JSON.stringify(mail.destination),
          subject: mail.commonHeaders.subject || null,
          timestamp: new Date(mail.timestamp),
          receiptTimestamp: new Date(receipt.timestamp),
          processingTimeMillis: receipt.processingTimeMillis,
          recipients: JSON.stringify(receipt.recipients),
          spamVerdict: receipt.spamVerdict.status,
          virusVerdict: receipt.virusVerdict.status,
          spfVerdict: receipt.spfVerdict.status,
          dkimVerdict: receipt.dkimVerdict.status,
          dmarcVerdict: receipt.dmarcVerdict.status,
          actionType: receipt.action.type,
          s3BucketName: receipt.action.bucketName,
          s3ObjectKey: receipt.action.objectKey,
          emailContent: record.emailContent || null,
          s3ContentFetched: record.s3Location?.contentFetched || false,
          s3ContentSize: record.s3Location?.contentSize || null,
          s3Error: record.s3Error || null,
          commonHeaders: JSON.stringify(mail.commonHeaders),
          rawSesEvent: JSON.stringify(record.ses),
          lambdaContext: JSON.stringify(payload.context),
          webhookPayload: JSON.stringify(payload),
          updatedAt: new Date(),
        }

        await db.insert(sesEvents).values(sesEventRecord)
        console.log(`✅ Webhook - Stored SES event ${sesEventId} for message ${mail.messageId}`);

        // Then, create a receivedEmail record for each recipient
        for (const recipient of receipt.recipients) {
          const emailRecord = {
            id: nanoid(),
            sesEventId: sesEventId,
            messageId: mail.messageId,
            from: mail.source,
            to: JSON.stringify(mail.destination),
            recipient: recipient,
            subject: mail.commonHeaders.subject || 'No Subject',
            receivedAt: new Date(mail.timestamp),
            processedAt: new Date(),
            status: 'received' as const,
            metadata: JSON.stringify({
              recipient: recipient,
              authResults: {
                spf: receipt.spfVerdict.status,
                dkim: receipt.dkimVerdict.status,
                dmarc: receipt.dmarcVerdict.status,
                spam: receipt.spamVerdict.status,
                virus: receipt.virusVerdict.status,
              },
              s3Location: record.s3Location || {
                bucket: receipt.action.bucketName,
                key: receipt.action.objectKey,
              },
              headers: mail.commonHeaders,
              lambdaContext: payload.context,
              processingTimeMillis: receipt.processingTimeMillis,
              emailContent: record.emailContent ? {
                hasContent: true,
                contentSize: record.emailContent.length,
                contentPreview: record.emailContent.substring(0, 500) + (record.emailContent.length > 500 ? '...' : '')
              } : {
                hasContent: false,
                s3Error: record.s3Error
              },
            }),
            userId: 'system', // TODO: Map to actual user based on recipient
            updatedAt: new Date(),
          }

          await db.insert(receivedEmails).values(emailRecord)
          processedEmails.push({
            emailId: emailRecord.id,
            sesEventId: sesEventId,
            messageId: mail.messageId,
            recipient: recipient,
            subject: mail.commonHeaders.subject,
          })

          console.log(`✅ Webhook - Stored email ${mail.messageId} for ${recipient}`);
        }
      } catch (recordError) {
        console.error('❌ Webhook - Error processing SES record:', recordError);
        // Continue processing other records
      }
    }

    const response = {
      success: true,
      processedEmails: processedEmails.length,
      emails: processedEmails,
      timestamp: new Date(),
      lambdaContext: payload.context,
    }

    console.log(`✅ Webhook - Successfully processed ${processedEmails.length} emails`);

    return NextResponse.json(response)
  } catch (error) {
    console.error('💥 Webhook - Processing error:', error)
    
    // Return success even on error to prevent Lambda retries
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to process email webhook',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      },
      { status: 200 } // Return 200 to prevent retries
    )
  }
}

// GET endpoint for webhook health check
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'inbound-email-webhook',
    timestamp: new Date(),
    version: '3.0.0',
    description: 'Receives SES events with email content from Lambda forwarder',
    features: [
      'Raw SES event processing',
      'S3 email content fetching',
      'Full email content storage',
      'Enhanced metadata tracking',
      'SES event storage in dedicated table'
    ]
  })
} 