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
}

export interface ReceiptRuleResult {
  ruleName: string
  domain: string
  emailAddresses: string[]
  status: 'created' | 'updated' | 'failed'
  error?: string
}

export class AWSSESReceiptRuleManager {
  private sesClient: SESClient
  private region: string

  constructor(region: string = 'us-west-2') {
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
      let recipients = config.emailAddresses.length > 0 ? config.emailAddresses : [`*@${config.domain}`]
      
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
        status
      }
    } catch (error) {
      console.error('💥 SES Rules - Failed to configure email receiving:', error)
      return {
        ruleName,
        domain: config.domain,
        emailAddresses: config.emailAddresses,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
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
} 