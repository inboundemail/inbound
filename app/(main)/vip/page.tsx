import { getCurrentSession } from '@/lib/auth/auth-utils'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { emailAddresses, vipConfigs, vipPaymentSessions, vipAllowedSenders, emailDomains, userAccounts } from '@/lib/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { Autumn as autumn } from 'autumn-js'
import VipPageClient from './vip-page-client'
import { getVipEmailAttempts, getUserAccountStripeKey } from '@/app/actions/vip'

async function getVipData(userId: string) {
  // Get all email addresses with their VIP configs
  const addresses = await db
    .select({
      emailAddress: emailAddresses,
      domain: emailDomains,
      vipConfig: vipConfigs,
    })
    .from(emailAddresses)
    .leftJoin(vipConfigs, eq(emailAddresses.id, vipConfigs.emailAddressId))
    .leftJoin(emailDomains, eq(emailAddresses.domainId, emailDomains.id))
    .where(eq(emailAddresses.userId, userId))

  // Get recent payment sessions
  const recentSessions = await db
    .select({
      session: vipPaymentSessions,
      config: vipConfigs,
      emailAddress: emailAddresses,
    })
    .from(vipPaymentSessions)
    .innerJoin(vipConfigs, eq(vipPaymentSessions.vipConfigId, vipConfigs.id))
    .innerJoin(emailAddresses, eq(vipConfigs.emailAddressId, emailAddresses.id))
    .where(eq(vipConfigs.userId, userId))
    .orderBy(desc(vipPaymentSessions.createdAt))
    .limit(10)

  // Get allowed senders count per VIP config
  const allowedSendersCount = await db
    .select({
      vipConfigId: vipAllowedSenders.vipConfigId,
      count: sql<number>`count(${vipAllowedSenders.id})::int`,
    })
    .from(vipAllowedSenders)
    .innerJoin(vipConfigs, eq(vipAllowedSenders.vipConfigId, vipConfigs.id))
    .where(eq(vipConfigs.userId, userId))
    .groupBy(vipAllowedSenders.vipConfigId)

  return { addresses, recentSessions, allowedSendersCount }
}

async function checkVipByokAccess(userId: string): Promise<boolean> {
  try {
    const { data: featureCheck, error } = await autumn.check({
      customer_id: userId,
      feature_id: "vip-byok",
    })
    
    if (error) {
      console.error('Error checking VIP BYOK access:', error)
      return false
    }
    
    return featureCheck?.allowed === true
  } catch (error) {
    console.error('Error checking VIP BYOK access:', error)
    return false
  }
}

export default async function VipPage() {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const { addresses, recentSessions, allowedSendersCount } = await getVipData(session.user.id)
  const hasVipByok = await checkVipByokAccess(session.user.id)
  const accountStripeKey = await getUserAccountStripeKey()
  const emailAttemptsResult = await getVipEmailAttempts({ limit: 20 })
  
  const allowedCountMap = allowedSendersCount.reduce((acc: Record<string, number>, item) => {
    acc[item.vipConfigId] = Number(item.count)
    return acc
  }, {} as Record<string, number>)

  return (
    <VipPageClient
      addresses={addresses}
      recentSessions={recentSessions}
      allowedCountMap={allowedCountMap}
      hasVipByok={hasVipByok}
      accountStripeKey={accountStripeKey}
      emailAttempts={emailAttemptsResult.success ? emailAttemptsResult.data.attempts : []}
    />
  )
} 