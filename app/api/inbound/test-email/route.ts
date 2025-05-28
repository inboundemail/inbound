import { NextRequest, NextResponse } from 'next/server'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

// Check if AWS credentials are available
const awsRegion = process.env.AWS_REGION || 'us-east-2'
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

let sesClient: SESClient | null = null

if (awsAccessKeyId && awsSecretAccessKey) {
  sesClient = new SESClient({ 
    region: awsRegion,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    }
  })
} else {
  console.warn('AWS credentials not configured. Email sending will not work.')
}

export async function POST(request: NextRequest) {
  try {
    const { to, subject, body } = await request.json()

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, body' },
        { status: 400 }
      )
    }

    // Check if AWS credentials are configured
    if (!sesClient) {
      return NextResponse.json(
        { 
          messageId: 'failed',
          status: 'failed' as const,
          timestamp: new Date(),
          error: 'AWS SES not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.'
        },
        { status: 500 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(to)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Use a verified sender email (you'll need to verify this in SES)
    const fromEmail = process.env.SES_FROM_EMAIL || 'noreply@exon.dev'

    const sendCommand = new SendEmailCommand({
      Source: fromEmail,
      Destination: {
        ToAddresses: [to]
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8'
        },
        Body: {
          Text: {
            Data: body,
            Charset: 'UTF-8'
          },
          Html: {
            Data: `
              <html>
                <body>
                  <h2>AWS SES Email Workflow Test</h2>
                  <p>${body.replace(/\n/g, '<br>')}</p>
                  <hr>
                  <p><small>This email was sent via AWS SES for testing the inbound email workflow.</small></p>
                  <p><small>Timestamp: ${new Date().toISOString()}</small></p>
                </body>
              </html>
            `,
            Charset: 'UTF-8'
          }
        }
      }
    })

    const response = await sesClient.send(sendCommand)
    const messageId = response.MessageId

    const result = {
      messageId: messageId || 'unknown',
      status: 'sent' as const,
      timestamp: new Date(),
      to,
      subject
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Email send error:', error)
    
    // Handle specific AWS SES errors
    if (error instanceof Error) {
      if (error.name === 'MessageRejected') {
        return NextResponse.json(
          { 
            messageId: 'failed',
            status: 'failed' as const,
            timestamp: new Date(),
            error: 'Email was rejected by AWS SES'
          },
          { status: 400 }
        )
      }
      if (error.name === 'SendingPausedException') {
        return NextResponse.json(
          { 
            messageId: 'failed',
            status: 'failed' as const,
            timestamp: new Date(),
            error: 'Email sending is paused for this account'
          },
          { status: 429 }
        )
      }
      if (error.name === 'MailFromDomainNotVerifiedException') {
        return NextResponse.json(
          { 
            messageId: 'failed',
            status: 'failed' as const,
            timestamp: new Date(),
            error: 'Sender domain is not verified in AWS SES'
          },
          { status: 400 }
        )
      }
    }

    return NextResponse.json(
      { 
        messageId: 'failed',
        status: 'failed' as const,
        timestamp: new Date(),
        error: 'Failed to send test email'
      },
      { status: 500 }
    )
  }
} 