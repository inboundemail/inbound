import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { emailDomains, domainDnsRecords, emailAddresses, sesEvents, webhooks } from '@/lib/db/schema'
import { eq, and, gte, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { initiateDomainVerification, deleteDomainFromSES } from '@/lib/domain-verification'
import { detectDomainProvider } from '@/lib/dns'
import { DOMAIN_STATUS } from '@/lib/db/schema'
import { deleteDomainFromDatabase } from '@/lib/db/domains'
import { AWSSESReceiptRuleManager } from '@/lib/aws-ses-rules'
import { SESClient, GetIdentityVerificationAttributesCommand } from '@aws-sdk/client-ses'

// AWS SES Client setup
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
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get user session
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: domainId } = await params
    const { searchParams } = new URL(request.url)
    const refreshProvider = searchParams.get('refreshProvider') === 'true'

    if (!domainId) {
      return NextResponse.json(
        { error: 'Domain ID is required' },
        { status: 400 }
      )
    }

    // Get domain record
    const domainRecord = await db
      .select()
      .from(emailDomains)
      .where(and(eq(emailDomains.id, domainId), eq(emailDomains.userId, session.user.id)))
      .limit(1)

    if (!domainRecord[0]) {
      return NextResponse.json(
        { error: 'Domain not found' },
        { status: 404 }
      )
    }

    let domain = domainRecord[0]

    // Refresh domain provider if requested
    if (refreshProvider) {
      try {
        console.log(`🔍 Refreshing domain provider for: ${domain.domain}`)
        
        // Detect provider for the domain (this function already handles subdomains correctly)
        const providerInfo = await detectDomainProvider(domain.domain)
        
        if (providerInfo) {
          console.log(`✅ Provider detected: ${providerInfo.name} (${providerInfo.confidence} confidence)`)
          
          // Update domain record with new provider information
          const [updatedDomain] = await db
            .update(emailDomains)
            .set({
              domainProvider: providerInfo.name,
              providerConfidence: providerInfo.confidence,
              lastDnsCheck: new Date(),
              updatedAt: new Date()
            })
            .where(eq(emailDomains.id, domainId))
            .returning()
          
          if (updatedDomain) {
            domain = updatedDomain
            console.log(`💾 Updated domain provider: ${providerInfo.name}`)
          }
        } else {
          console.log(`⚠️ No provider detected for domain: ${domain.domain}`)
        }
      } catch (error) {
        console.error('Error refreshing domain provider:', error)
        // Continue with existing domain data if provider refresh fails
      }
    }

    // Perform comprehensive SES verification check if refreshProvider=true
    let updatedDomain = domain
    if (refreshProvider && sesClient) {
      try {
        console.log(`🔍 Performing comprehensive SES verification check for domain: ${domain.domain}`)
        
        // Get current verification status from AWS SES
        const getAttributesCommand = new GetIdentityVerificationAttributesCommand({
          Identities: [domain.domain]
        })

        const attributesResponse = await sesClient.send(getAttributesCommand)
        const attributes = attributesResponse.VerificationAttributes?.[domain.domain]

        if (attributes) {
          const sesStatus = attributes.VerificationStatus || 'Pending'
          console.log(`📊 AWS SES verification status for ${domain.domain}: ${sesStatus}`)
          
          // Determine new domain status based on SES response
          let newStatus = domain.status
          if (sesStatus === 'Success') {
            newStatus = DOMAIN_STATUS.VERIFIED
          } else if (sesStatus === 'Failed') {
            newStatus = DOMAIN_STATUS.FAILED
          }
          
          // Update domain record if status changed
          if (newStatus !== domain.status) {
            console.log(`📝 Updating domain status from ${domain.status} to ${newStatus}, SES status: ${sesStatus}`)
            
            const [updated] = await db
              .update(emailDomains)
              .set({
                status: newStatus,
                lastSesCheck: new Date(),
                updatedAt: new Date()
              })
              .where(eq(emailDomains.id, domainId))
              .returning()
            
            if (updated) {
              updatedDomain = updated
              console.log(`✅ Updated domain status successfully`)
            }
          } else {
            console.log(`ℹ️ Domain status unchanged, updating last check time`)
            
            // Still update the last check time
            const [updated] = await db
              .update(emailDomains)
              .set({
                lastSesCheck: new Date(),
                updatedAt: new Date()
              })
              .where(eq(emailDomains.id, domainId))
              .returning()
              
            if (updated) {
              updatedDomain = updated
            }
          }
        } else {
          console.log(`⚠️ No verification attributes found for domain: ${domain.domain}`)
        }
      } catch (error) {
        console.error('Error performing comprehensive SES verification check:', error)
        // Continue with existing domain data if SES check fails
      }
    } else if (refreshProvider && !sesClient) {
      console.log(`⚠️ SES client not available for comprehensive verification check`)
    } else {
      // Auto-check SES verification if domain is in dns_verified status
      if (domain.status === DOMAIN_STATUS.VERIFIED) {
        try {
          console.log(`Auto-checking SES verification for domain: ${domain.domain}`)
          const verificationResult = await initiateDomainVerification(domain.domain, session.user.id)
          
          // If status changed, get the updated domain record
          if (verificationResult.status === DOMAIN_STATUS.VERIFIED) {
            const updatedDomainRecord = await db
              .select()
              .from(emailDomains)
              .where(and(eq(emailDomains.id, domainId), eq(emailDomains.userId, session.user.id)))
              .limit(1)
            
            if (updatedDomainRecord[0]) {
              updatedDomain = updatedDomainRecord[0]
              console.log(`Domain status updated from ${domain.status} to ${updatedDomain.status}`)
            }
          }
        } catch (error) {
          console.error('Error auto-checking SES verification:', error)
          // Continue with original domain data if verification check fails
        }
      }
    }

    // Get DNS records
    const dnsRecords = await db
      .select()
      .from(domainDnsRecords)
      .where(eq(domainDnsRecords.domainId, domainId))

    // Calculate 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // Get email addresses with their statistics and webhook information
    const emailAddressesWithStats = await db
      .select({
        id: emailAddresses.id,
        address: emailAddresses.address,
        webhookId: emailAddresses.webhookId,
        webhookName: webhooks.name,
        isActive: emailAddresses.isActive,
        isReceiptRuleConfigured: emailAddresses.isReceiptRuleConfigured,
        receiptRuleName: emailAddresses.receiptRuleName,
        createdAt: emailAddresses.createdAt,
        updatedAt: emailAddresses.updatedAt,
        emailsLast24h: sql<number>`COALESCE(${sql`(
          SELECT COUNT(*)::int 
          FROM ${sesEvents} 
          WHERE EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(${sesEvents.destination}::jsonb) AS dest_email
            WHERE dest_email = ${emailAddresses.address}
          )
          AND ${sesEvents.timestamp} >= ${twentyFourHoursAgo}
        )`}, 0)`
      })
      .from(emailAddresses)
      .leftJoin(webhooks, eq(emailAddresses.webhookId, webhooks.id))
      .where(eq(emailAddresses.domainId, domainId))
      .orderBy(emailAddresses.createdAt)

    // Transform DNS records for frontend
    const transformedDnsRecords = dnsRecords.map(record => ({
      type: record.recordType,
      name: record.name,
      value: record.value,
      isVerified: record.isVerified,
      isRequired: record.isRequired,
      lastChecked: record.lastChecked
    }))

    // Calculate verification status
    const allRequiredDnsVerified = dnsRecords
      .filter(record => record.isRequired)
      .every(record => record.isVerified)

    const canProceed = updatedDomain.status === DOMAIN_STATUS.VERIFIED || 
      (updatedDomain.status === DOMAIN_STATUS.VERIFIED && allRequiredDnsVerified)

    return NextResponse.json({
      domain: {
        id: updatedDomain.id,
        domain: updatedDomain.domain,
        status: updatedDomain.status,
        verificationToken: updatedDomain.verificationToken,
        canReceiveEmails: updatedDomain.canReceiveEmails,
        hasMxRecords: updatedDomain.hasMxRecords,
        domainProvider: updatedDomain.domainProvider,
        providerConfidence: updatedDomain.providerConfidence,
        lastDnsCheck: updatedDomain.lastDnsCheck,
        lastSesCheck: updatedDomain.lastSesCheck,
        createdAt: updatedDomain.createdAt,
        updatedAt: updatedDomain.updatedAt,
        canProceed
      },
      dnsRecords: transformedDnsRecords,
      emailAddresses: emailAddressesWithStats,
      stats: {
        totalEmailAddresses: emailAddressesWithStats.length,
        activeEmailAddresses: emailAddressesWithStats.filter(email => email.isActive).length,
        configuredEmailAddresses: emailAddressesWithStats.filter(email => email.isReceiptRuleConfigured).length,
        totalEmailsLast24h: emailAddressesWithStats.reduce((sum, email) => sum + email.emailsLast24h, 0)
      }
    })

  } catch (error) {
    console.error('Error fetching domain details:', error)
    return NextResponse.json(
      { error: 'Failed to fetch domain details' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get user session
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: domainId } = await params

    if (!domainId) {
      return NextResponse.json(
        { error: 'Domain ID is required' },
        { status: 400 }
      )
    }

    // Get domain record to verify ownership and get domain name
    const domainRecord = await db
      .select()
      .from(emailDomains)
      .where(and(eq(emailDomains.id, domainId), eq(emailDomains.userId, session.user.id)))
      .limit(1)

    if (!domainRecord[0]) {
      return NextResponse.json(
        { error: 'Domain not found' },
        { status: 404 }
      )
    }

    const domain = domainRecord[0]

    console.log(`🗑️ Starting domain deletion process for: ${domain.domain}`)

    // Step 1: Remove SES receipt rules first (if domain is verified)
    if (domain.status === DOMAIN_STATUS.VERIFIED) {
      try {
        const sesRuleManager = new AWSSESReceiptRuleManager()
        const ruleRemoved = await sesRuleManager.removeEmailReceiving(domain.domain)
        
        if (ruleRemoved) {
          console.log(`✅ SES receipt rules removed for: ${domain.domain}`)
        } else {
          console.log(`⚠️ Failed to remove SES receipt rules for: ${domain.domain}`)
        }
      } catch (error) {
        console.error('Error removing SES receipt rules:', error)
        // Continue with deletion even if receipt rule removal fails
      }
    }

    // Step 2: Delete domain identity from SES
    const sesDeleteResult = await deleteDomainFromSES(domain.domain)
    
    if (!sesDeleteResult.success) {
      console.error(`❌ Failed to delete domain from SES: ${sesDeleteResult.error}`)
      return NextResponse.json(
        { 
          error: 'Failed to delete domain from AWS SES',
          details: sesDeleteResult.error,
          domain: domain.domain
        },
        { status: 500 }
      )
    }

    console.log(`✅ Domain deleted from SES: ${domain.domain}`)

    // Step 3: Delete domain and related records from database
    const dbDeleteResult = await deleteDomainFromDatabase(domainId, session.user.id)
    
    if (!dbDeleteResult.success) {
      console.error(`❌ Failed to delete domain from database: ${dbDeleteResult.error}`)
      return NextResponse.json(
        { 
          error: 'Failed to delete domain from database',
          details: dbDeleteResult.error,
          domain: domain.domain
        },
        { status: 500 }
      )
    }

    console.log(`✅ Domain deletion completed successfully: ${domain.domain}`)

    return NextResponse.json({
      success: true,
      message: 'Domain deleted successfully',
      domain: domain.domain
    })

  } catch (error) {
    console.error('Error deleting domain:', error)
    return NextResponse.json(
      { error: 'Failed to delete domain' },
      { status: 500 }
    )
  }
} 