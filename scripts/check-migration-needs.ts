#!/usr/bin/env bun

import { db } from '@/lib/db'
import { webhooks, endpoints, emailAddresses, emailDomains } from '@/lib/db/schema'
import { eq, and, isNull, isNotNull } from 'drizzle-orm'

async function checkMigrationNeeds() {
  console.log('🔍 Checking if data migration is needed...\n')

  try {
    // Check webhooks
    const totalWebhooks = await db.select({ count: webhooks.id }).from(webhooks)
    console.log(`📊 Total webhooks in database: ${totalWebhooks.length}`)

    // Check endpoints
    const totalEndpoints = await db.select({ count: endpoints.id }).from(endpoints)
    console.log(`📊 Total endpoints in database: ${totalEndpoints.length}`)

    // Check email addresses with webhookId
    const emailsWithWebhooks = await db
      .select({ count: emailAddresses.id })
      .from(emailAddresses)
      .where(isNotNull(emailAddresses.webhookId))
    console.log(`📧 Email addresses with webhookId: ${emailsWithWebhooks.length}`)

    // Check email addresses with endpointId
    const emailsWithEndpoints = await db
      .select({ count: emailAddresses.id })
      .from(emailAddresses)
      .where(isNotNull(emailAddresses.endpointId))
    console.log(`📧 Email addresses with endpointId: ${emailsWithEndpoints.length}`)

    // Check domains with catch-all webhooks
    const domainsWithCatchAllWebhooks = await db
      .select({ count: emailDomains.id })
      .from(emailDomains)
      .where(isNotNull(emailDomains.catchAllWebhookId))
    console.log(`🌐 Domains with catch-all webhooks: ${domainsWithCatchAllWebhooks.length}`)

    // Check domains with catch-all endpoints
    const domainsWithCatchAllEndpoints = await db
      .select({ count: emailDomains.id })
      .from(emailDomains)
      .where(isNotNull(emailDomains.catchAllEndpointId))
    console.log(`🌐 Domains with catch-all endpoints: ${domainsWithCatchAllEndpoints.length}`)

    console.log('\n📋 Migration Assessment:')
    
    if (totalWebhooks.length === 0) {
      console.log('✅ No webhooks found - no migration needed')
    } else if (totalEndpoints.length === 0) {
      console.log('⚠️  Webhooks exist but no endpoints - migration recommended')
    } else {
      console.log('ℹ️  Both webhooks and endpoints exist - mixed state (migration optional)')
    }

    if (emailsWithWebhooks.length > 0 && emailsWithEndpoints.length === 0) {
      console.log('⚠️  Email addresses only use webhooks - migration could be beneficial')
    }

    if (domainsWithCatchAllWebhooks.length > 0 && domainsWithCatchAllEndpoints.length === 0) {
      console.log('⚠️  Catch-all domains only use webhooks - migration could be beneficial')
    }

    if (totalWebhooks.length === 0 && 
        emailsWithWebhooks.length === 0 && 
        domainsWithCatchAllWebhooks.length === 0) {
      console.log('🎉 System is clean - no legacy webhook data to migrate!')
    }

  } catch (error) {
    console.error('❌ Error checking migration needs:', error)
    process.exit(1)
  }
}

checkMigrationNeeds()
  .then(() => {
    console.log('\n✅ Migration check completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Migration check failed:', error)
    process.exit(1)
  }) 