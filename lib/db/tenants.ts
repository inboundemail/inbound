import { db } from './index';
import { sesTenants } from './schema';
import { eq } from 'drizzle-orm';

/**
 * Get tenant owner information by configuration set name
 * Returns the user details for the tenant owner to send notifications
 */
export async function getTenantOwnerByConfigurationSet(configurationSetName: string): Promise<{
  userId: string;
  userEmail: string;
  userName: string | null;
  tenantId: string;
  tenantName: string;
  awsTenantId: string;
  tenantStatus: string;
} | null> {
  try {
    console.log(`🔍 getTenantOwnerByConfigurationSet - Looking up owner for configuration set: ${configurationSetName}`);

    // Import user table from auth schema
    const { user } = await import('./auth-schema');

    // Try looking up by configurationSetName first (new approach)
    let result = await db
      .select({
        userId: sesTenants.userId,
        userEmail: user.email,
        userName: user.name,
        tenantId: sesTenants.id,
        tenantName: sesTenants.tenantName,
        awsTenantId: sesTenants.awsTenantId,
        tenantStatus: sesTenants.status,
      })
      .from(sesTenants)
      .innerJoin(user, eq(sesTenants.userId, user.id))
      .where(eq(sesTenants.configurationSetName, configurationSetName))
      .limit(1);

    // Fallback: try looking up by awsTenantId (legacy approach)
    if (!result[0]) {
      result = await db
        .select({
          userId: sesTenants.userId,
          userEmail: user.email,
          userName: user.name,
          tenantId: sesTenants.id,
          tenantName: sesTenants.tenantName,
          awsTenantId: sesTenants.awsTenantId,
          tenantStatus: sesTenants.status,
        })
        .from(sesTenants)
        .innerJoin(user, eq(sesTenants.userId, user.id))
        .where(eq(sesTenants.awsTenantId, configurationSetName))
        .limit(1);
    }

    if (!result[0]) {
      console.log(`❌ getTenantOwnerByConfigurationSet - No owner found for configuration set: ${configurationSetName}`);
      return null;
    }

    console.log(`✅ getTenantOwnerByConfigurationSet - Found owner for configuration set ${configurationSetName}: ${result[0].userEmail} (${result[0].tenantName})`);
    return result[0];
  } catch (error) {
    console.error('❌ getTenantOwnerByConfigurationSet - Error looking up tenant owner:', error);
    return null;
  }
}

/**
 * Get tenant information by AWS tenant ID (configuration set name)
 */
export async function getTenantByAwsId(awsTenantId: string): Promise<{
  id: string;
  userId: string;
  awsTenantId: string;
  tenantName: string;
  status: string;
  reputationPolicy: string;
} | null> {
  try {
    console.log(`🔍 getTenantByAwsId - Looking up tenant: ${awsTenantId}`);
    
    const result = await db
      .select({
        id: sesTenants.id,
        userId: sesTenants.userId,
        awsTenantId: sesTenants.awsTenantId,
        tenantName: sesTenants.tenantName,
        status: sesTenants.status,
        reputationPolicy: sesTenants.reputationPolicy,
      })
      .from(sesTenants)
      .where(eq(sesTenants.awsTenantId, awsTenantId))
      .limit(1);

    if (!result[0]) {
      console.log(`❌ getTenantByAwsId - No tenant found: ${awsTenantId}`);
      return null;
    }

    console.log(`✅ getTenantByAwsId - Found tenant: ${result[0].tenantName} (${awsTenantId})`);
    return result[0];
  } catch (error) {
    console.error('❌ getTenantByAwsId - Error looking up tenant:', error);
    return null;
  }
}

/**
 * Get all tenants for a user
 */
export async function getTenantsByUserId(userId: string): Promise<Array<{
  id: string;
  userId: string;
  awsTenantId: string;
  tenantName: string;
  status: string;
  reputationPolicy: string;
}>> {
  try {
    console.log(`🔍 getTenantsByUserId - Looking up tenants for user: ${userId}`);
    
    const results = await db
      .select({
        id: sesTenants.id,
        userId: sesTenants.userId,
        awsTenantId: sesTenants.awsTenantId,
        tenantName: sesTenants.tenantName,
        status: sesTenants.status,
        reputationPolicy: sesTenants.reputationPolicy,
      })
      .from(sesTenants)
      .where(eq(sesTenants.userId, userId));

    console.log(`✅ getTenantsByUserId - Found ${results.length} tenant(s) for user: ${userId}`);
    return results;
  } catch (error) {
    console.error('❌ getTenantsByUserId - Error looking up tenants:', error);
    return [];
  }
}

/**
 * Update tenant status (for pausing sending when reputation is poor)
 */
export async function updateTenantStatus(
  awsTenantId: string, 
  status: 'active' | 'paused' | 'suspended'
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`🔧 updateTenantStatus - Updating tenant ${awsTenantId} status to: ${status}`);
    
    const [updated] = await db
      .update(sesTenants)
      .set({ 
        status: status,
        updatedAt: new Date()
      })
      .where(eq(sesTenants.awsTenantId, awsTenantId))
      .returning();

    if (!updated) {
      console.log(`❌ updateTenantStatus - Tenant not found: ${awsTenantId}`);
      return { success: false, error: 'Tenant not found' };
    }

    console.log(`✅ updateTenantStatus - Updated tenant ${awsTenantId} status to: ${status}`);
    return { success: true };
  } catch (error) {
    console.error('❌ updateTenantStatus - Error updating tenant status:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Check if a tenant exists by AWS tenant ID
 */
export async function tenantExists(awsTenantId: string): Promise<boolean> {
  try {
    const result = await db
      .select({ id: sesTenants.id })
      .from(sesTenants)
      .where(eq(sesTenants.awsTenantId, awsTenantId))
      .limit(1);

    return result.length > 0;
  } catch (error) {
    console.error('❌ tenantExists - Error checking tenant existence:', error);
    return false;
  }
}
