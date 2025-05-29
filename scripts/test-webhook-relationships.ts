#!/usr/bin/env bun

import { db } from '../lib/db'
import { emailAddresses, webhooks } from '../lib/db/schema'
import { eq, isNotNull, isNull } from 'drizzle-orm'

async function testWebhookRelationships() {
  console.log('🔍 Testing webhook-email relationships...\n')

  try {
    // Test 1: Check if webhooks exist
    const allWebhooks = await db.select().from(webhooks)
    console.log(`📊 Total webhooks in database: ${allWebhooks.length}`)
    
    if (allWebhooks.length > 0) {
      console.log('✅ Sample webhook:', {
        id: allWebhooks[0].id,
        name: allWebhooks[0].name,
        url: allWebhooks[0].url.substring(0, 50) + '...',
        isActive: allWebhooks[0].isActive
      })
    }

    // Test 2: Check email addresses with webhook assignments
    const emailsWithWebhooks = await db
      .select({
        emailId: emailAddresses.id,
        emailAddress: emailAddresses.address,
        webhookId: emailAddresses.webhookId,
        webhookName: webhooks.name,
        webhookUrl: webhooks.url
      })
      .from(emailAddresses)
      .leftJoin(webhooks, eq(emailAddresses.webhookId, webhooks.id))
      .where(isNotNull(emailAddresses.webhookId))

    console.log(`\n📧 Email addresses with webhook assignments: ${emailsWithWebhooks.length}`)
    
    emailsWithWebhooks.forEach((email) => {
      console.log(`✅ ${email.emailAddress} -> ${email.webhookName} (${email.webhookUrl?.substring(0, 30)}...)`)
    })

    // Test 3: Check emails without webhooks
    const emailsWithoutWebhooks = await db
      .select({
        emailAddress: emailAddresses.address,
        webhookId: emailAddresses.webhookId
      })
      .from(emailAddresses)
      .where(isNull(emailAddresses.webhookId))

    console.log(`\n📭 Email addresses without webhooks: ${emailsWithoutWebhooks.length}`)
    
    // Test 4: Verify many-to-one relationship
    if (allWebhooks.length > 0) {
      const webhookUsage = await db
        .select({
          webhookId: emailAddresses.webhookId,
          webhookName: webhooks.name,
          emailCount: db.$count(emailAddresses, eq(emailAddresses.webhookId, webhooks.id))
        })
        .from(webhooks)
        .leftJoin(emailAddresses, eq(webhooks.id, emailAddresses.webhookId))
        .groupBy(webhooks.id, webhooks.name)

      console.log('\n🔗 Webhook usage statistics:')
      webhookUsage.forEach((usage) => {
        console.log(`   ${usage.webhookName}: used by ${usage.emailCount} email address(es)`)
      })
    }

    console.log('\n✅ Webhook relationship test completed successfully!')

  } catch (error) {
    console.error('❌ Error testing webhook relationships:', error)
  }
}

// Run the test
testWebhookRelationships().then(() => {
  console.log('\n🏁 Test completed')
  process.exit(0)
}).catch((error) => {
  console.error('💥 Test failed:', error)
  process.exit(1)
}) 