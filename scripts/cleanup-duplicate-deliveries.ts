/**
 * Cleanup script to remove duplicate endpoint deliveries
 * Keeps the oldest delivery for each (email_id, endpoint_id) pair
 * Run this before adding the unique constraint
 */

import { db } from '@/lib/db'
import { endpointDeliveries } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'

async function cleanupDuplicateDeliveries() {
  console.log('🔍 Finding duplicate deliveries...')

  // Find duplicates and count them
  const duplicatesCount = await db.execute(sql`
    SELECT 
      email_id, 
      endpoint_id, 
      MIN(created_at) as created_at,
      COUNT(*) as count
    FROM endpoint_deliveries
    WHERE email_id IS NOT NULL 
      AND endpoint_id IS NOT NULL
    GROUP BY email_id, endpoint_id
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `)

  console.log(`📊 Found ${duplicatesCount.rows.length} duplicate (email_id, endpoint_id) pairs`)

  if (duplicatesCount.rows.length === 0) {
    console.log('✅ No duplicates found! You can safely add the unique constraint.')
    return
  }

  // Show some examples
  console.log('\n📋 Sample duplicates:')
  duplicatesCount.rows.map((row: any) => {
    console.log(`  - email_id: ${row.email_id}, endpoint_id: ${row.endpoint_id}, created_at: ${row.created_at}, count: ${row.count}`)
  })

  console.log('\n🧹 Deleting duplicate deliveries (keeping oldest for each pair)...')

  // Delete duplicates, keeping only the oldest record for each (email_id, endpoint_id) pair
  const deleteResult = await db.execute(sql`
    DELETE FROM endpoint_deliveries
    WHERE id IN (
      SELECT id
      FROM (
        SELECT 
          id,
          ROW_NUMBER() OVER (
            PARTITION BY email_id, endpoint_id 
            ORDER BY created_at ASC, id ASC
          ) as rn
        FROM endpoint_deliveries
        WHERE email_id IS NOT NULL 
          AND endpoint_id IS NOT NULL
      ) t
      WHERE rn > 1
    )
  `)

  console.log(`✅ Deleted ${deleteResult.rowCount || 0} duplicate delivery records`)


  // Verify no duplicates remain
  const remainingDuplicates = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM (
      SELECT email_id, endpoint_id
      FROM endpoint_deliveries
      WHERE email_id IS NOT NULL 
        AND endpoint_id IS NOT NULL
      GROUP BY email_id, endpoint_id
      HAVING COUNT(*) > 1
    ) t
  `)

  const remaining = (remainingDuplicates.rows[0] as any).count
  
  if (remaining === '0') {
    console.log('✅ All duplicates cleaned up! You can now safely add the unique constraint.')
    console.log('\nAdd the constraint with a migration: bun run db:generate --name <change>')
  } else {
    console.log(`⚠️  Warning: ${remaining} duplicates still remain. Please investigate.`)
  }
}

// Run the cleanup
cleanupDuplicateDeliveries()
  .then(() => {
    console.log('\n✅ Cleanup complete!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Cleanup failed:', error)
    process.exit(1)
  })

