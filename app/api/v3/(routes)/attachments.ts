import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validateRequest } from '../lib/helper'
import { db } from '@/lib/db'
import { structuredEmails, sesEvents } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

const router = new Hono().basePath('/attachments')

/**
 * GET /attachments/:id/:filename
 * Download an email attachment by email ID and filename
 */
router.get(
  '/:id/:filename',
  describeRoute({
    summary: 'Download email attachment',
    description: 'Download a specific attachment from an email by email ID and filename',
    responses: {
      200: {
        description: 'Attachment file',
        content: {
          'application/octet-stream': {
            schema: {
              type: 'string',
              format: 'binary'
            }
          }
        }
      },
      400: { description: 'Bad request - missing required parameters' },
      401: { description: 'Unauthorized' },
      404: { description: 'Email or attachment not found' },
      429: { description: 'Rate limit exceeded' },
      500: { description: 'Internal server error' }
    }
  }),
  async (c) => {
    try {
      const emailId = c.req.param('id')
      const attachmentFilename = c.req.param('filename')

      console.log(`📎 GET /api/v3/attachments/${emailId}/${attachmentFilename} - Downloading attachment`)

      // Validate auth and rate limiting
      const auth = await validateRequest(c.req.raw)

      if (!('userId' in auth)) {
        return c.json({ error: auth.error || 'Unauthorized' }, 401)
      }

      if (auth.error === 'Rate limit exceeded') {
        c.header('X-RateLimit-Limit', String(auth.rateLimit?.limit || 0))
        c.header('X-RateLimit-Remaining', String(auth.rateLimit?.remaining || 0))
        c.header('X-RateLimit-Reset', auth.rateLimit?.reset || '')
        return c.json({ error: 'Rate limit exceeded', rateLimit: auth.rateLimit }, 429)
      }

      const userId = auth.userId

      if (!emailId || !attachmentFilename) {
        return c.json(
          { error: 'Email ID and attachment filename are required' },
          { status: 400 }
        )
      }

      // Get the structured email to verify ownership and find SES event
      const structuredEmail = await db
        .select({
          sesEventId: structuredEmails.sesEventId,
          userId: structuredEmails.userId,
        })
        .from(structuredEmails)
        .where(
          and(
            eq(structuredEmails.id, emailId),
            eq(structuredEmails.userId, userId!)
          )
        )
        .limit(1)

      if (!structuredEmail.length) {
        return c.json(
          { error: 'Email not found or access denied' },
          { status: 404 }
        )
      }

      const sesEventId = structuredEmail[0].sesEventId
      if (!sesEventId) {
        return c.json(
          { error: 'Email event information not found' },
          { status: 404 }
        )
      }

      // Get the SES event to find email content
      const sesEvent = await db
        .select({
          s3BucketName: sesEvents.s3BucketName,
          s3ObjectKey: sesEvents.s3ObjectKey,
          emailContent: sesEvents.emailContent,
        })
        .from(sesEvents)
        .where(eq(sesEvents.id, sesEventId))
        .limit(1)

      if (!sesEvent.length) {
        return c.json(
          { error: 'Email content not found' },
          { status: 404 }
        )
      }

      const { s3BucketName, s3ObjectKey, emailContent } = sesEvent[0]

      // Parse email to extract attachments
      let rawEmailContent: string | null = null

      // Try S3 first, then fallback to direct email content
      if (s3BucketName && s3ObjectKey) {
        try {
          // Import S3 client to fetch raw email content
          const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3')
          
          const s3Client = new S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
          })
          
          const command = new GetObjectCommand({
            Bucket: s3BucketName,
            Key: s3ObjectKey,
          })
          
          const response = await s3Client.send(command)
          
          if (response.Body) {
            // Convert stream to string
            const chunks: Uint8Array[] = []
            const reader = response.Body.transformToWebStream().getReader()
            
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              chunks.push(value)
            }
            
            const buffer = Buffer.concat(chunks)
            rawEmailContent = buffer.toString('utf-8')
          } else {
            throw new Error('No email content in S3')
          }
        } catch (s3Error) {
          console.error(`Failed to fetch from S3:`, s3Error)
          // Fallback to direct content
          rawEmailContent = emailContent
        }
      } else {
        rawEmailContent = emailContent
      }

      if (!rawEmailContent) {
        return c.json(
          { error: 'Email content not available' },
          { status: 404 }
        )
      }

      // Parse the email to find the attachment
      const { simpleParser } = await import('mailparser')
      const parsed = await simpleParser(rawEmailContent)

      if (!parsed.attachments || parsed.attachments.length === 0) {
        return c.json(
          { error: 'No attachments found in this email' },
          { status: 404 }
        )
      }

      // Find the specific attachment by filename
      const attachment = parsed.attachments.find(
        (att) => att.filename === decodeURIComponent(attachmentFilename)
      )

      if (!attachment) {
        return c.json(
          { error: 'Attachment not found' },
          { status: 404 }
        )
      }

      console.log(`✅ Attachment found: ${attachment.filename} (${attachment.size} bytes)`)

      // Return the attachment with appropriate headers
      // Convert Buffer to Uint8Array for Hono compatibility
      const uint8Array = new Uint8Array(attachment.content)
      
      return new Response(uint8Array, {
        status: 200,
        headers: {
          'Content-Type': attachment.contentType || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${attachment.filename}"`,
          'Content-Length': attachment.size?.toString() || '0',
          'Cache-Control': 'private, max-age=3600',
          'X-RateLimit-Limit': String(auth.rateLimit?.limit || 0),
          'X-RateLimit-Remaining': String(auth.rateLimit?.remaining || 0),
          'X-RateLimit-Reset': auth.rateLimit?.reset || '',
        },
      })
    } catch (error) {
      console.error('❌ Error downloading attachment:', error)
      return c.json(
        {
          error: 'Failed to download attachment',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      )
    }
  }
)

export default router
