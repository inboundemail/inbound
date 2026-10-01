import { db } from '@/lib/db'
import { sesReceiptRules } from '@/lib/db/schema'
import { eq, and, lt, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export class BatchRuleManager {
  private ruleSetName: string
  
  constructor(ruleSetName: string = 'inbound-catchall-domain-default') {
    this.ruleSetName = ruleSetName
  }
  
  /**
   * Find or create a rule with available capacity for new domains
   * Returns rule that can fit the requested number of domains
   */
  async findOrCreateRuleWithCapacity(domainsNeeded: number = 1): Promise<{
    id: string
    ruleName: string
    currentCapacity: number
    availableSlots: number
  }> {
    // Find existing rule with capacity
    const availableRules = await db
      .select()
      .from(sesReceiptRules)
      .where(and(
        eq(sesReceiptRules.ruleSetName, this.ruleSetName),
        eq(sesReceiptRules.isActive, true),
        lt(sesReceiptRules.domainCount, sesReceiptRules.maxCapacity)
      ))
      .orderBy(sesReceiptRules.ruleName)  // Sequential fill
      .limit(1)
    
    if (availableRules.length > 0) {
      const rule = availableRules[0]
      const availableSlots = rule.maxCapacity - rule.domainCount
      
      if (availableSlots >= domainsNeeded) {
        return {
          id: rule.id,
          ruleName: rule.ruleName,
          currentCapacity: rule.domainCount,
          availableSlots
        }
      }
    }
    
    // No rule with enough capacity, create new one
    const ruleCount = await this.getRuleCount()
    const newRuleNumber = ruleCount + 1
    const newRuleName = `batch-rule-${String(newRuleNumber).padStart(3, '0')}`
    
    const [newRule] = await db
      .insert(sesReceiptRules)
      .values({
        id: nanoid(),
        ruleName: newRuleName,
        ruleSetName: this.ruleSetName,
        domainCount: 0,
        maxCapacity: 500,
        isActive: true
      })
      .returning()
    
    console.log(`✅ Created new batch rule: ${newRuleName}`)
    
    return {
      id: newRule.id,
      ruleName: newRule.ruleName,
      currentCapacity: 0,
      availableSlots: 500
    }
  }
  
  /**
   * Increment domain count for a rule
   */
  async incrementRuleCapacity(ruleId: string, count: number = 1): Promise<void> {
    await db
      .update(sesReceiptRules)
      .set({
        domainCount: sql`${sesReceiptRules.domainCount} + ${count}`,
        updatedAt: new Date()
      })
      .where(eq(sesReceiptRules.id, ruleId))
  }
  
  /**
   * Decrement domain count for a rule
   */
  async decrementRuleCapacity(ruleId: string, count: number = 1): Promise<void> {
    await db
      .update(sesReceiptRules)
      .set({
        domainCount: sql`GREATEST(${sesReceiptRules.domainCount} - ${count}, 0)`,
        updatedAt: new Date()
      })
      .where(eq(sesReceiptRules.id, ruleId))
  }
  
  /**
   * Decrement domain count for a rule by rule name
   */
  async decrementRuleCapacityByName(ruleName: string, count: number = 1): Promise<void> {
    await db
      .update(sesReceiptRules)
      .set({
        domainCount: sql`GREATEST(${sesReceiptRules.domainCount} - ${count}, 0)`,
        updatedAt: new Date()
      })
      .where(and(
        eq(sesReceiptRules.ruleName, ruleName),
        eq(sesReceiptRules.ruleSetName, this.ruleSetName)
      ))
  }
  
  /**
   * Get rule by name
   */
  async getRuleByName(ruleName: string): Promise<{
    id: string
    ruleName: string
    domainCount: number
    maxCapacity: number
  } | null> {
    const result = await db
      .select()
      .from(sesReceiptRules)
      .where(and(
        eq(sesReceiptRules.ruleName, ruleName),
        eq(sesReceiptRules.ruleSetName, this.ruleSetName)
      ))
      .limit(1)
    
    return result[0] || null
  }
  
  /**
   * Get total rule count for this rule set
   */
  async getRuleCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(sesReceiptRules)
      .where(eq(sesReceiptRules.ruleSetName, this.ruleSetName))
    
    return result[0]?.count || 0
  }
  
  /**
   * Rebuild domain counts from emailDomains table (for validation/recovery)
   */
  async rebuildDomainCounts(): Promise<void> {
    const { emailDomains } = await import('@/lib/db/schema')
    
    // Get all rules
    const rules = await db
      .select()
      .from(sesReceiptRules)
      .where(eq(sesReceiptRules.ruleSetName, this.ruleSetName))
    
    // For each rule, count domains and update
    for (const rule of rules) {
      const domainCount = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(emailDomains)
        .where(eq(emailDomains.catchAllReceiptRuleName, rule.ruleName))
      
      const subdomainCount = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(emailDomains)
        .where(eq(emailDomains.subdomainReceiptRuleName, rule.ruleName))
      
      const actualCount = (domainCount[0]?.count || 0) + (subdomainCount[0]?.count || 0)
      
      await db
        .update(sesReceiptRules)
        .set({
          domainCount: actualCount,
          updatedAt: new Date()
        })
        .where(eq(sesReceiptRules.id, rule.id))
      
      console.log(`Updated ${rule.ruleName}: ${actualCount} domains`)
    }
  }
}
