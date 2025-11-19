import { db } from '@/lib/db';
import { svixApplications } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createSvixApplication } from './client';

/**
 * Get or create Svix Application for a user
 * Creates a new Svix Application if one doesn't exist for the user
 * @param userId - The user ID
 * @returns Svix application record with database ID and Svix application ID
 */
export async function getOrCreateSvixApplication(userId: string): Promise<{
  id: string;
  svixApplicationId: string;
  svixApplicationName: string;
}> {
  // Check if application exists
  const existing = await db
    .select()
    .from(svixApplications)
    .where(eq(svixApplications.userId, userId))
    .limit(1);

  if (existing[0]) {
    console.log(`✅ getOrCreateSvixApplication - Found existing Svix application for user: ${userId}`);
    return existing[0];
  }

  // Create new Svix Application
  const appName = `user-${userId.slice(0, 8)}`;
  console.log(`🆕 getOrCreateSvixApplication - Creating new Svix application: ${appName} for user: ${userId}`);
  
  const svixApp = await createSvixApplication(userId, appName);

  try {
    // Store in database with conflict handling
    const [record] = await db
      .insert(svixApplications)
      .values({
        id: nanoid(),
        userId,
        svixApplicationId: svixApp.id,
        svixApplicationName: appName,
        lastSyncedAt: new Date(),
      })
      .onConflictDoNothing({ target: svixApplications.userId })
      .returning();

    if (record) {
      console.log(`✅ getOrCreateSvixApplication - Created and stored Svix application: ${record.id}`);
      return record;
    }

    // Another concurrent request created it, fetch the existing record
    console.log(`⚠️ getOrCreateSvixApplication - Concurrent creation detected, fetching existing record for user: ${userId}`);
    const [existingRecord] = await db
      .select()
      .from(svixApplications)
      .where(eq(svixApplications.userId, userId))
      .limit(1);

    if (!existingRecord) {
      throw new Error(`Failed to create or retrieve Svix application for user: ${userId}`);
    }

    return existingRecord;
  } catch (error) {
    // If we get a unique constraint error despite onConflictDoNothing,
    // try to fetch the existing record
    console.error('⚠️ getOrCreateSvixApplication - Error during insert:', error);
    
    const [existingRecord] = await db
      .select()
      .from(svixApplications)
      .where(eq(svixApplications.userId, userId))
      .limit(1);

    if (existingRecord) {
      console.log(`✅ getOrCreateSvixApplication - Recovered existing record after conflict for user: ${userId}`);
      return existingRecord;
    }

    // If we still can't find it, throw the original error
    throw error;
  }
}

