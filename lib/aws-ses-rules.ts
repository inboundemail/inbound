import { 
  SESClient, 
  CreateReceiptRuleSetCommand,
  CreateReceiptRuleCommand,
  UpdateReceiptRuleCommand,
  DeleteReceiptRuleCommand,
  DescribeReceiptRuleSetCommand,
  SetActiveReceiptRuleSetCommand,
  ReceiptRule,
  ReceiptAction
} from '@aws-sdk/client-ses'

export interface EmailReceiptConfig {
  domain: string
  emailAddresses: string[]
  lambdaFunctionArn: string
  s3BucketName: string
  ruleSetName?: string
  // Catch-all configuration
  isCatchAll?: boolean
  catchAllWebhookId?: string
}

export interface ReceiptRuleResult {
  ruleName: string
  domain: string
  emailAddresses: string[]
  status: 'created' | 'updated' | 'failed'
  error?: string
  isCatchAll?: boolean
  catchAllWebhookId?: string
}

export interface CatchAllConfig {
  domain: string
  webhookId: string
  lambdaFunctionArn: string
  s3BucketName: string
  ruleSetName?: string
}

export class AWSSESReceiptRuleManager {
  private sesClient: SESClient
  private region: string

  constructor(region: string = 'us-east-2') {
    this.region = region
    this.sesClient = new SESClient({ region })
  }

  /**
   * Create or update receipt rules for a domain
   */
  async configureEmailReceiving(config: EmailReceiptConfig): Promise<ReceiptRuleResult> {
    const ruleSetName = config.ruleSetName || 'inbound-email-rules'
    const ruleName = `${config.domain}-rule`

    try {
      console.log(`🔧 SES Rules - Configuring email receiving for domain: ${config.domain}`)
      console.log(`📧 SES Rules - Email addresses: ${config.emailAddresses.join(', ')}`)
      
      // Ensure rule set exists
      await this.ensureRuleSetExists(ruleSetName)

      // Check if rule already exists
      const existingRule = await this.getRuleIfExists(ruleSetName, ruleName)
      
      // Merge existing recipients with new ones if rule exists
      let recipients = config.emailAddresses.length > 0 ? config.emailAddresses : [config.domain]
      
      if (existingRule && existingRule.Recipients) {
        // Get existing recipients
        const existingRecipients = existingRule.Recipients || []
        console.log(`📋 SES Rules - Existing recipients: ${existingRecipients.join(', ')}`)
        
        // Merge with new recipients (avoiding duplicates)
        const recipientSet = new Set([...existingRecipients, ...recipients])
        recipients = Array.from(recipientSet)
        console.log(`🔀 SES Rules - Merged recipients: ${recipients.join(', ')}`)
      }
      
      // Create receipt rule for the domain
      const rule: ReceiptRule = {
        Name: ruleName,
        Enabled: true,
        Recipients: recipients,
        Actions: [
          // Store email in S3
          {
            S3Action: {
              BucketName: config.s3BucketName,
              ObjectKeyPrefix: `emails/${config.domain}/`,
              TopicArn: undefined // Optional: SNS topic for notifications
            }
          },
          // Invoke Lambda function
          {
            LambdaAction: {
              FunctionArn: config.lambdaFunctionArn,
              InvocationType: 'Event' // Async invocation
            }
          }
        ]
      }

      let status: 'created' | 'updated' | 'failed' = 'created'

      if (existingRule) {
        console.log(`🔄 SES Rules - Updating existing rule: ${ruleName}`)
        // Update existing rule
        const updateCommand = new UpdateReceiptRuleCommand({
          RuleSetName: ruleSetName,
          Rule: rule
        })
        await this.sesClient.send(updateCommand)
        status = 'updated'
      } else {
        console.log(`➕ SES Rules - Creating new rule: ${ruleName}`)
        // Create new rule
        const createCommand = new CreateReceiptRuleCommand({
          RuleSetName: ruleSetName,
          Rule: rule
        })
        await this.sesClient.send(createCommand)
        status = 'created'
      }

      // Set as active rule set
      await this.setActiveRuleSet(ruleSetName)

      console.log(`✅ SES Rules - Successfully ${status} rule for ${config.domain}`)

      return {
        ruleName,
        domain: config.domain,
        emailAddresses: recipients,
        status,
        isCatchAll: config.isCatchAll,
        catchAllWebhookId: config.catchAllWebhookId
      }
    } catch (error) {
      console.error('💥 SES Rules - Failed to configure email receiving:', error)
      return {
        ruleName,
        domain: config.domain,
        emailAddresses: config.emailAddresses,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        isCatchAll: config.isCatchAll,
        catchAllWebhookId: config.catchAllWebhookId
      }
    }
  }

  /**
   * Remove receipt rule for a domain
   */
  async removeEmailReceiving(domain: string, ruleSetName: string = 'inbound-email-rules'): Promise<boolean> {
    try {
      const ruleName = `${domain}-rule`
      
      const command = new DeleteReceiptRuleCommand({
        RuleSetName: ruleSetName,
        RuleName: ruleName
      })

      await this.sesClient.send(command)
      return true
    } catch (error) {
      console.error('Failed to remove receipt rule:', error)
      return false
    }
  }

  /**
   * Check if a rule exists and return it
   */
  private async getRuleIfExists(ruleSetName: string, ruleName: string): Promise<ReceiptRule | null> {
    try {
      const command = new DescribeReceiptRuleSetCommand({
        RuleSetName: ruleSetName
      })
      const response = await this.sesClient.send(command)
      
      const existingRule = response.Rules?.find(rule => rule.Name === ruleName)
      return existingRule || null
    } catch (error) {
      console.log(`📋 SES Rules - Rule set ${ruleSetName} does not exist or rule ${ruleName} not found`)
      return null
    }
  }

  /**
   * Ensure rule set exists, create if it doesn't
   */
  private async ensureRuleSetExists(ruleSetName: string): Promise<void> {
    try {
      // Try to describe the rule set
      await this.sesClient.send(new DescribeReceiptRuleSetCommand({
        RuleSetName: ruleSetName
      }))
    } catch (error) {
      // Rule set doesn't exist, create it
      if (error instanceof Error && error.name === 'RuleSetDoesNotExistException') {
        await this.sesClient.send(new CreateReceiptRuleSetCommand({
          RuleSetName: ruleSetName
        }))
      } else {
        throw error
      }
    }
  }

  /**
   * Set the active rule set
   */
  private async setActiveRuleSet(ruleSetName: string): Promise<void> {
    await this.sesClient.send(new SetActiveReceiptRuleSetCommand({
      RuleSetName: ruleSetName
    }))
  }

  /**
   * Get Lambda function ARN for the current region
   */
  static getLambdaFunctionArn(functionName: string, accountId: string, region: string): string {
    return `arn:aws:lambda:${region}:${accountId}:function:${functionName}`
  }

  /**
   * Validate email address format
   */
  static isValidEmailAddress(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  /**
   * Extract domain from email address
   */
  static extractDomain(email: string): string {
    return email.split('@')[1] || ''
  }

  /**
   * Configure catch-all email receiving for a domain
   * This creates a receipt rule that captures ALL emails sent to the domain
   */
  async configureCatchAllDomain(config: CatchAllConfig): Promise<ReceiptRuleResult> {
    const ruleSetName = config.ruleSetName || 'inbound-email-rules'
    const ruleName = `${config.domain}-catchall-rule`
    const individualRuleName = `${config.domain}-rule`

    try {
      console.log(`🌐 SES Rules - Configuring catch-all for domain: ${config.domain}`)
      console.log(`🪝 SES Rules - Webhook ID: ${config.webhookId}`)
      
      // Ensure rule set exists
      await this.ensureRuleSetExists(ruleSetName)

      // CRITICAL: Remove individual email rule if it exists
      // This prevents rule precedence conflicts
      const existingIndividualRule = await this.getRuleIfExists(ruleSetName, individualRuleName)
      if (existingIndividualRule) {
        console.log(`🗑️ SES Rules - Removing individual email rule to prevent conflicts: ${individualRuleName}`)
        await this.sesClient.send(new DeleteReceiptRuleCommand({
          RuleSetName: ruleSetName,
          RuleName: individualRuleName
        }))
      }

      // Create receipt rule for catch-all
      // According to AWS SES docs, use just the domain name (not *@domain) for catch-all
      const rule: ReceiptRule = {
        Name: ruleName,
        Enabled: true,
        Recipients: [config.domain], // Just the domain name catches all emails to this domain
        Actions: [
          // Store email in S3
          {
            S3Action: {
              BucketName: config.s3BucketName,
              ObjectKeyPrefix: `emails/${config.domain}/catchall/`,
              TopicArn: undefined
            }
          },
          // Invoke Lambda function with catch-all metadata
          {
            LambdaAction: {
              FunctionArn: config.lambdaFunctionArn,
              InvocationType: 'Event'
            }
          }
        ]
      }

      // Check if catch-all rule already exists
      const existingCatchAllRule = await this.getRuleIfExists(ruleSetName, ruleName)
      let status: 'created' | 'updated' | 'failed' = 'created'

      if (existingCatchAllRule) {
        console.log(`🔄 SES Rules - Updating existing catch-all rule: ${ruleName}`)
        const updateCommand = new UpdateReceiptRuleCommand({
          RuleSetName: ruleSetName,
          Rule: rule
        })
        await this.sesClient.send(updateCommand)
        status = 'updated'
      } else {
        console.log(`➕ SES Rules - Creating new catch-all rule: ${ruleName}`)
        const createCommand = new CreateReceiptRuleCommand({
          RuleSetName: ruleSetName,
          Rule: rule
        })
        await this.sesClient.send(createCommand)
        status = 'created'
      }

      // Set as active rule set
      await this.setActiveRuleSet(ruleSetName)

      console.log(`✅ SES Rules - Successfully ${status} catch-all rule for ${config.domain}`)

      return {
        ruleName,
        domain: config.domain,
        emailAddresses: [config.domain], // Just the domain name for catch-all
        status,
        isCatchAll: true,
        catchAllWebhookId: config.webhookId
      }
    } catch (error) {
      console.error('💥 SES Rules - Failed to configure catch-all:', error)
      return {
        ruleName,
        domain: config.domain,
        emailAddresses: [config.domain], // Just the domain name for catch-all
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        isCatchAll: true,
        catchAllWebhookId: config.webhookId
      }
    }
  }

  /**
   * Remove catch-all receipt rule for a domain
   */
  async removeCatchAllDomain(domain: string, ruleSetName: string = 'inbound-email-rules'): Promise<boolean> {
    try {
      const ruleName = `${domain}-catchall-rule`
      
      const command = new DeleteReceiptRuleCommand({
        RuleSetName: ruleSetName,
        RuleName: ruleName
      })

      await this.sesClient.send(command)
      console.log(`✅ SES Rules - Successfully removed catch-all rule for ${domain}`)
      return true
    } catch (error) {
      console.error('Failed to remove catch-all receipt rule:', error)
      return false
    }
  }

  /**
   * Check if a domain has catch-all configured
   */
  async isCatchAllConfigured(domain: string, ruleSetName: string = 'inbound-email-rules'): Promise<boolean> {
    const ruleName = `${domain}-catchall-rule`
    const existingRule = await this.getRuleIfExists(ruleSetName, ruleName)
    return existingRule !== null
  }

  /**
   * Get all rules for a domain (both individual and catch-all)
   */
  async getDomainRules(domain: string, ruleSetName: string = 'inbound-email-rules'): Promise<{
    individualRule: ReceiptRule | null
    catchAllRule: ReceiptRule | null
  }> {
    const individualRuleName = `${domain}-rule`
    const catchAllRuleName = `${domain}-catchall-rule`
    
    const individualRule = await this.getRuleIfExists(ruleSetName, individualRuleName)
    const catchAllRule = await this.getRuleIfExists(ruleSetName, catchAllRuleName)
    
    return {
      individualRule,
      catchAllRule
    }
  }

  /**
   * Restore individual email rules when disabling catch-all
   * This recreates the individual email rule with existing email addresses
   */
  async restoreIndividualEmailRules(
    domain: string, 
    emailAddresses: string[], 
    lambdaFunctionArn: string, 
    s3BucketName: string,
    ruleSetName: string = 'inbound-email-rules'
  ): Promise<ReceiptRuleResult> {
    const ruleName = `${domain}-rule`

    try {
      console.log(`🔄 SES Rules - Restoring individual email rules for domain: ${domain}`)
      console.log(`📧 SES Rules - Email addresses: ${emailAddresses.join(', ')}`)
      
      // Only restore if there are email addresses to restore
      if (emailAddresses.length === 0) {
        console.log(`⚠️ SES Rules - No email addresses to restore for ${domain}`)
        return {
          ruleName,
          domain,
          emailAddresses: [],
          status: 'created',
          isCatchAll: false
        }
      }

      // Create receipt rule for individual emails
      const rule: ReceiptRule = {
        Name: ruleName,
        Enabled: true,
        Recipients: emailAddresses,
        Actions: [
          // Store email in S3
          {
            S3Action: {
              BucketName: s3BucketName,
              ObjectKeyPrefix: `emails/${domain}/`,
              TopicArn: undefined
            }
          },
          // Invoke Lambda function
          {
            LambdaAction: {
              FunctionArn: lambdaFunctionArn,
              InvocationType: 'Event'
            }
          }
        ]
      }

      console.log(`➕ SES Rules - Creating individual email rule: ${ruleName}`)
      const createCommand = new CreateReceiptRuleCommand({
        RuleSetName: ruleSetName,
        Rule: rule
      })
      await this.sesClient.send(createCommand)

      // Set as active rule set
      await this.setActiveRuleSet(ruleSetName)

      console.log(`✅ SES Rules - Successfully restored individual email rules for ${domain}`)

      return {
        ruleName,
        domain,
        emailAddresses,
        status: 'created',
        isCatchAll: false
      }
    } catch (error) {
      console.error('💥 SES Rules - Failed to restore individual email rules:', error)
      return {
        ruleName,
        domain,
        emailAddresses,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        isCatchAll: false
      }
    }
  }
} 