import { db } from '@/lib/db';
import { guardRules, structuredEmails } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { 
  CheckRuleMatchResponse, 
  ExplicitRuleConfig, 
  AiPromptRuleConfig,
  GuardRule,
  RuleActionConfig 
} from '@/features/guard/types';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getModel } from '@/lib/ai/provider';

export interface GuardEvaluationResult {
  shouldBlock: boolean;
  routeToEndpointId?: string;
  matchedRule?: GuardRule;
  action?: 'allow' | 'block' | 'route' | 'flag' | 'label';
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * Check if a guard rule matches a structured email
 * @param ruleId - The ID of the guard rule to check
 * @param structuredEmailId - The ID of the structured email to check against
 * @param userId - The user ID for authorization
 * @returns Match result with details
 */
export async function checkRuleMatch(
  ruleId: string,
  structuredEmailId: string,
  userId: string
): Promise<CheckRuleMatchResponse> {
  try {
    // Fetch the rule
    const [rule] = await db
      .select()
      .from(guardRules)
      .where(and(
        eq(guardRules.id, ruleId),
        eq(guardRules.userId, userId)
      ))
      .limit(1);

    if (!rule) {
      return {
        matched: false,
        error: 'Rule not found',
      };
    }

    // Fetch the email
    const [email] = await db
      .select()
      .from(structuredEmails)
      .where(and(
        eq(structuredEmails.id, structuredEmailId),
        eq(structuredEmails.userId, userId)
      ))
      .limit(1);

    if (!email) {
      return {
        matched: false,
        error: 'Email not found',
      };
    }

    // Parse the rule config
    let config: ExplicitRuleConfig | AiPromptRuleConfig;
    try {
      config = JSON.parse(rule.config);
    } catch (error) {
      return {
        matched: false,
        error: 'Invalid rule configuration',
      };
    }

    // Check based on rule type
    if (rule.type === 'explicit') {
      return await checkExplicitRule(config as ExplicitRuleConfig, email);
    } else if (rule.type === 'ai_prompt') {
      return await checkAiPromptRule(config as AiPromptRuleConfig, email);
    }

    return {
      matched: false,
      error: 'Unknown rule type',
    };
  } catch (error) {
    console.error('Error checking rule match:', error);
    return {
      matched: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if an explicit rule matches an email
 */
async function checkExplicitRule(
  config: ExplicitRuleConfig,
  email: typeof structuredEmails.$inferSelect
): Promise<CheckRuleMatchResponse> {
  const matchDetails: Array<{ criteria: string; value: string }> = [];
  let allCriteriaMatch = true;

  // Check subject criteria
  if (config.subject) {
    const emailSubject = email.subject?.toLowerCase() || '';
    const subjectMatches = checkStringCriteria(
      emailSubject,
      config.subject.values,
      config.subject.operator
    );
    
    if (subjectMatches) {
      matchDetails.push({
        criteria: 'subject',
        value: `Matched with ${config.subject.operator} logic`,
      });
    } else {
      allCriteriaMatch = false;
    }
  }

  // Check from criteria
  if (config.from) {
    try {
      const fromData = email.fromData ? JSON.parse(email.fromData) : null;
      const fromAddresses = fromData?.addresses?.map((addr: any) => 
        addr.address?.toLowerCase() || ''
      ) || [];
      
      const fromMatches = checkEmailCriteria(
        fromAddresses,
        config.from.values,
        config.from.operator
      );
      
      if (fromMatches) {
        matchDetails.push({
          criteria: 'from',
          value: `Matched with ${config.from.operator} logic`,
        });
      } else {
        allCriteriaMatch = false;
      }
    } catch (error) {
      console.error('Failed to parse fromData:', error);
      allCriteriaMatch = false;
    }
  }

  // Check attachment criteria
  if (config.hasAttachment !== undefined) {
    try {
      const attachments = email.attachments ? JSON.parse(email.attachments) : [];
      const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
      
      if (hasAttachments === config.hasAttachment) {
        matchDetails.push({
          criteria: 'hasAttachment',
          value: `Email ${hasAttachments ? 'has' : 'does not have'} attachments`,
        });
      } else {
        allCriteriaMatch = false;
      }
    } catch (error) {
      console.error('Failed to parse attachments:', error);
      allCriteriaMatch = false;
    }
  }

  // Check hasWords criteria (searches in text and HTML body)
  if (config.hasWords) {
    const textBody = email.textBody?.toLowerCase() || '';
    const htmlBody = email.htmlBody?.toLowerCase() || '';
    const combinedContent = `${textBody} ${htmlBody}`;
    
    const wordsMatch = checkStringCriteria(
      combinedContent,
      config.hasWords.values,
      config.hasWords.operator
    );
    
    if (wordsMatch) {
      matchDetails.push({
        criteria: 'hasWords',
        value: `Matched with ${config.hasWords.operator} logic`,
      });
    } else {
      allCriteriaMatch = false;
    }
  }

  // Check if any criteria were configured
  const hasCriteria = 
    config.subject !== undefined ||
    config.from !== undefined ||
    config.hasAttachment !== undefined ||
    config.hasWords !== undefined;

  // If no criteria configured, rule should not match
  if (!hasCriteria) {
    return {
      matched: false,
      error: 'Rule has no criteria configured',
    };
  }

  return {
    matched: allCriteriaMatch && matchDetails.length > 0,
    matchDetails: allCriteriaMatch ? matchDetails : undefined,
  };
}

/**
 * Check string-based criteria (subject, hasWords)
 */
export function checkStringCriteria(
  content: string,
  values: string[],
  operator: 'OR' | 'AND'
): boolean {
  if (operator === 'OR') {
    return values.some(value => content.includes(value.toLowerCase()));
  } else {
    return values.every(value => content.includes(value.toLowerCase()));
  }
}

/**
 * Check email-based criteria (from) with wildcard support
 */
export function checkEmailCriteria(
  emailAddresses: string[],
  patterns: string[],
  operator: 'OR' | 'AND'
): boolean {
  const matches = patterns.map(pattern => {
    const lowerPattern = pattern.toLowerCase();
    
    // Handle wildcard patterns like *@domain.com
    if (lowerPattern.startsWith('*@')) {
      const domain = lowerPattern.substring(2);
      return emailAddresses.some(email => email.endsWith(`@${domain}`));
    }
    
    // Exact match
    return emailAddresses.some(email => email === lowerPattern);
  });

  if (operator === 'OR') {
    return matches.some(match => match);
  } else {
    return matches.every(match => match);
  }
}

/**
 * Check if an AI prompt rule matches an email
 * TODO: Implement AI-based matching using AI gateway
 */
async function checkAiPromptRule(
  config: AiPromptRuleConfig,
  email: typeof structuredEmails.$inferSelect
): Promise<CheckRuleMatchResponse> {
  if (!config || typeof config.prompt !== 'string' || !config.prompt.trim()) {
    return { matched: false, error: 'Invalid AI prompt configuration' };
  }

  // Prepare email context (truncate to keep token usage reasonable)
  const subject = email.subject || '';
  const textBody = (email.textBody || '').toString();
  const htmlBody = (email.htmlBody || '').toString();
  const plainHtml = htmlBody.replace(/<[^>]*>/g, ' ');
  const combinedBody = `${textBody}\n\n${plainHtml}`.trim();
  const bodySnippet = combinedBody.slice(0, 6000);

  let fromAddresses: Array<{ name?: string | null; address?: string | null }> = [];
  try {
    if (email.fromData) {
      const parsed = JSON.parse(email.fromData as string);
      fromAddresses = Array.isArray(parsed?.addresses) ? parsed.addresses : [];
    }
  } catch {
    // ignore parse errors, treat as empty
  }

  let hasAttachments = false;
  try {
    const attachments = email.attachments ? JSON.parse(email.attachments) : [];
    hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  } catch {
    // ignore
  }

  const model = getModel();

  // Ask the LLM for a structured yes/no match with rationale
  try {
    const matchSchema = z.object({
      matched: z.boolean(),
      reason: z.string().optional(),
      matches: z
        .array(
          z.object({
            criteria: z.string().describe('subject | from | body | attachments | other'),
            value: z.string().describe('what content or pattern matched'),
          })
        )
        .optional(),
    });

    const prompt = `You are an email guard. Decide if this email satisfies the following rule and return structured JSON only.

Rule (user-provided):\n${config.prompt}\n
Email:
- Subject: ${subject}
- From: ${fromAddresses
        .map((a) => (a.name ? `${a.name} <${a.address || ''}>` : a.address || ''))
        .filter(Boolean)
        .join(', ')}
- Has attachments: ${hasAttachments ? 'yes' : 'no'}
- Body (snippet):\n${bodySnippet}

Instructions:
- Respond with matched=true only if the rule clearly applies.
- If uncertain, set matched=false.
- Provide concise reason and any matches that justify the decision.`;

    const { object } = await generateObject({
      model,
      schema: matchSchema,
      schemaName: 'GuardAIMatch',
      schemaDescription: 'Determines whether an email matches a user-provided rule',
      prompt,
      temperature: 0,
    });

    // Log AI structured response for debugging
    try {
      console.log('🧠 Guard AI match response:', {
        model,
        matched: object.matched,
        reason: object.reason,
        matches: object.matches,
      });
    } catch (e) {
      // ignore logging errors
    }

  return {
      matched: object.matched,
      reason: object.reason,
      matchDetails: object.matches?.map((m) => ({ criteria: m.criteria, value: m.value })),
    };
  } catch (error) {
    console.error('AI prompt matching failed:', error);
    return { matched: false, error: 'AI prompt evaluation failed' };
  }
}

/**
 * Evaluate all active guard rules for a user against a structured email
 * Returns the action to take based on the highest priority matching rule
 */
export async function evaluateGuardRules(
  structuredEmailId: string,
  userId: string
): Promise<GuardEvaluationResult> {
  try {
    console.log(`🛡️ Guard - Evaluating rules for email ${structuredEmailId}`)

    // Fetch all active guard rules for this user, ordered by priority (highest first)
    const activeRules = await db
      .select()
      .from(guardRules)
      .where(and(
        eq(guardRules.userId, userId),
        eq(guardRules.isActive, true)
      ))
      .orderBy(desc(guardRules.priority));

    if (activeRules.length === 0) {
      console.log(`🛡️ Guard - No active rules found, allowing email`)
      return { shouldBlock: false, action: 'allow' };
    }

    console.log(`🛡️ Guard - Found ${activeRules.length} active rules to evaluate`)

    // Fetch the email
    const [email] = await db
      .select()
      .from(structuredEmails)
      .where(and(
        eq(structuredEmails.id, structuredEmailId),
        eq(structuredEmails.userId, userId)
      ))
      .limit(1);

    if (!email) {
      console.error(`🛡️ Guard - Email ${structuredEmailId} not found`)
      return { shouldBlock: false, action: 'allow' };
    }

    // Evaluate rules in priority order (highest first)
    for (const rule of activeRules) {
      try {
        let config: ExplicitRuleConfig | AiPromptRuleConfig;
        try {
          config = JSON.parse(rule.config);
        } catch (error) {
          console.error(`🛡️ Guard - Invalid config for rule ${rule.id}, skipping`)
          continue;
        }

        // Check if rule matches
        let matchResult: CheckRuleMatchResponse;
        if (rule.type === 'explicit') {
          matchResult = await checkExplicitRule(config as ExplicitRuleConfig, email);
        } else if (rule.type === 'ai_prompt') {
          matchResult = await checkAiPromptRule(config as AiPromptRuleConfig, email);
        } else {
          continue;
        }

        if (matchResult.matched) {
          console.log(`🛡️ Guard - Rule "${rule.name}" (${rule.id}) matched!`)

          // Parse action config before updating stats to ensure it's valid
          let actionConfig: RuleActionConfig;
          try {
            actionConfig = JSON.parse(rule.actions || '{"action":"allow"}');
          } catch (error) {
            console.error(`🛡️ Guard - Invalid action config for rule ${rule.id}, defaulting to allow`)
            actionConfig = { action: 'allow' };
          }

          // Update rule trigger stats (non-blocking, fire and forget to avoid race conditions)
          // Use Drizzle ORM with parameterized query to prevent SQL injection
          void db.update(guardRules)
            .set({
              triggerCount: sql`COALESCE(${guardRules.triggerCount}, 0) + 1`,
              lastTriggeredAt: new Date(),
              updatedAt: new Date()
            })
            .where(eq(guardRules.id, rule.id))
            .then(() => {})
            .catch(error => {
              console.error(`🛡️ Guard - Failed to update trigger stats for rule ${rule.id}:`, error);
            });

          const result: GuardEvaluationResult = {
            shouldBlock: actionConfig.action === 'block',
            action: actionConfig.action,
            matchedRule: rule,
            routeToEndpointId: actionConfig.action === 'route' ? actionConfig.endpointId : undefined,
            reason: ('reason' in matchResult ? matchResult.reason : undefined) || rule.description || `Matched rule: ${rule.name}`,
            metadata: {
              ruleName: rule.name,
              ruleType: rule.type,
              matchDetails: 'matchDetails' in matchResult ? matchResult.matchDetails : undefined,
              evaluatedAt: new Date().toISOString(),
            },
          };

          console.log(`🛡️ Guard - Action: ${actionConfig.action}${actionConfig.action === 'route' ? ` to endpoint ${actionConfig.endpointId}` : ''}`)
          return result;
        }
      } catch (error) {
        console.error(`🛡️ Guard - Error evaluating rule ${rule.id}:`, error)
        continue;
      }
    }

    // No rules matched - allow by default
    console.log(`🛡️ Guard - No rules matched, allowing email`)
    return { shouldBlock: false, action: 'allow' };

  } catch (error) {
    console.error(`🛡️ Guard - Error evaluating guard rules:`, error)
    // On error, fail open (allow) to prevent blocking legitimate emails
    return { shouldBlock: false, action: 'allow' };
  }
}

