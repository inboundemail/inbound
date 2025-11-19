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

  // Store in database
  const [record] = await db
    .insert(svixApplications)
    .values({
      id: nanoid(),
      userId,
      svixApplicationId: svixApp.id,
      svixApplicationName: appName,
      lastSyncedAt: new Date(),
    })
    .returning();

  console.log(`✅ getOrCreateSvixApplication - Created and stored Svix application: ${record.id}`);
  return record;
}

