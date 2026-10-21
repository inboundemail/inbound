import { db } from '@/lib/db';
import { guardRules, structuredEmails } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { askJev, JevError, type JevNoulQuestion } from '@/lib/ai/jev';
import type { 
  CheckRuleMatchResponse, 
  CheckRuleMatchSuccess,
  ExplicitRuleConfig, 
  AiPromptRuleConfig,
  GuardRule,
  RuleActionConfig 
} from '@/features/guard/types';

export interface GuardEvaluationResult {
  shouldBlock: boolean;
  routeToEndpointId?: string;
  matchedRule?: GuardRule;
  action?: 'allow' | 'block' | 'route' | 'flag' | 'label';
  reason?: string;
  metadata?: Record<string, unknown>;
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
    } catch {
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
export async function checkExplicitRule(
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
      const fromAddresses = getParsedHeaderAddresses(email.fromData);
      
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

  // Check to criteria against the delivered recipient address
  if (config.to) {
    try {
      const toAddresses = getRecipientAddresses(email);

      const toMatches = checkEmailCriteria(
        toAddresses,
        config.to.values,
        config.to.operator
      );

      if (toMatches) {
        matchDetails.push({
          criteria: 'to',
          value: `Matched with ${config.to.operator} logic`,
        });
      } else {
        allCriteriaMatch = false;
      }
    } catch (error) {
      console.error('Failed to parse toData:', error);
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
    config.to !== undefined ||
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
function checkStringCriteria(
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
 * Collect recipient addresses for an email from the delivered-to row recipient.
 */
function getRecipientAddresses(
  email: typeof structuredEmails.$inferSelect
): string[] {
  const recipient = email.recipient?.trim().toLowerCase();
  if (recipient) {
    return [recipient];
  }

  return getParsedHeaderAddresses(email.toData);
}

function getParsedHeaderAddresses(addressData: string | null): string[] {
  if (!addressData) {
    return [];
  }

  const parsed: unknown = JSON.parse(addressData);
  if (!isRecord(parsed) || !Array.isArray(parsed.addresses)) {
    return [];
  }

  return parsed.addresses.flatMap((addr) => {
    if (!isRecord(addr) || typeof addr.address !== "string") {
      return [];
    }

    const address = addr.address.trim().toLowerCase();
    return address ? [address] : [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Check email-based criteria (from, to) with wildcard support
 */
function checkEmailCriteria(
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
 * Jev returns the probability (0..1) that a rule applies. The old LLM prompt only
 * matched when the rule "clearly applies", so a rule matches at 0.6 or above
 * rather than at a coin flip.
 */
export const AI_RULE_THRESHOLD = 0.6;
const AI_BODY_LIMIT = 6000;
const AI_PROMPT_LIMIT = 20000;
const AI_EVALUATION_FAILED = 'AI prompt evaluation failed';

interface AiRuleAnswer {
  probability: number;
  model: string;
}

function normalizeAiPrompt(config: AiPromptRuleConfig | null | undefined): string | null {
  if (!config || typeof config.prompt !== 'string') {
    return null;
  }
  const prompt = config.prompt
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, AI_PROMPT_LIMIT);
  return prompt || null;
}

function aiRuleQuestion(prompt: string): JevNoulQuestion {
  return {
    type: 'noul',
    instructions: {
      question: 'Should this rule trigger for `email`?',
      rule: prompt,
    },
    criteria: {
      true: 'The rule clearly says to trigger for this email',
      false: 'The rule does not trigger for this email, or it is unclear whether it does',
    },
  };
}

function buildJevEmailState(email: typeof structuredEmails.$inferSelect): Record<string, unknown> {
  let from: string[] = [];
  try {
    const parsed: unknown = email.fromData ? JSON.parse(email.fromData) : null;
    if (isRecord(parsed) && Array.isArray(parsed.addresses)) {
      from = parsed.addresses.flatMap((addr) => {
        if (!isRecord(addr) || typeof addr.address !== 'string' || !addr.address.trim()) {
          return [];
        }
        const name = typeof addr.name === 'string' ? addr.name.trim() : '';
        return [name ? `${name} <${addr.address.trim()}>` : addr.address.trim()];
      });
    }
  } catch {
    // ignore parse errors, treat as empty
  }

  let to: string[] = [];
  try {
    to = getRecipientAddresses(email);
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

  const textBody = (email.textBody || '').trim();
  const body = (textBody
    || (email.htmlBody || '')
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AI_BODY_LIMIT);

  return {
    email: {
      from: from.join(', '),
      to,
      subject: email.subject || '',
      has_attachments: hasAttachments,
      body,
    },
  };
}

/**
 * Ask Jev about several AI prompt rules for one email in a single request.
 * Throws on any Jev failure; a rule with no answer is absent from the result.
 */
async function askJevAboutRules(
  prompts: Map<string, string>,
  email: typeof structuredEmails.$inferSelect
): Promise<Map<string, AiRuleAnswer>> {
  const ids = [...prompts.keys()];
  const questions: Record<string, JevNoulQuestion> = {};
  ids.forEach((id, index) => {
    questions[`rule_${index}`] = aiRuleQuestion(prompts.get(id) as string);
  });

  const result = await askJev(buildJevEmailState(email), questions);
  const answers = new Map<string, AiRuleAnswer>();
  ids.forEach((id, index) => {
    const answer = result.answers[`rule_${index}`];
    if (answer) {
      answers.set(id, { probability: answer.noul, model: result.model });
    }
  });
  return answers;
}

function aiRuleMatch(answer: AiRuleAnswer, ruleName?: string): CheckRuleMatchSuccess {
  const percent = Math.round(answer.probability * 100);
  const matched = answer.probability >= AI_RULE_THRESHOLD;
  return {
    matched,
    reason: ruleName && matched
      ? `Matched rule "${ruleName}" (Jev ${percent}%)`
      : `Jev: ${percent}% match`,
    matchDetails: [{ criteria: 'ai_prompt', value: String(Math.round(answer.probability * 1000) / 1000) }],
  };
}

function logJevFailure(error: unknown) {
  if (error instanceof JevError) {
    console.error(
      error.code === 'missing_api_key'
        ? '🛡️ Guard - TYPESAFE_API_KEY is not set, AI prompt rules cannot match'
        : `🛡️ Guard - Jev evaluation failed (${error.status ?? error.code})`
    );
  } else {
    console.error('🛡️ Guard - Jev evaluation failed:', error instanceof Error ? error.name : 'unknown');
  }
}

/**
 * Check if an AI prompt rule matches an email using Jev
 */
async function checkAiPromptRule(
  config: AiPromptRuleConfig,
  email: typeof structuredEmails.$inferSelect
): Promise<CheckRuleMatchResponse> {
  const prompt = normalizeAiPrompt(config);
  if (!prompt) {
    return { matched: false, error: 'Invalid AI prompt configuration' };
  }

  try {
    const answer = (await askJevAboutRules(new Map([['rule', prompt]]), email)).get('rule');
    if (!answer) {
      return { matched: false, error: AI_EVALUATION_FAILED };
    }
    return aiRuleMatch(answer);
  } catch (error) {
    logJevFailure(error);
    return { matched: false, error: AI_EVALUATION_FAILED };
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

    // Jev answers for every AI prompt rule, fetched in one request when the first one is reached
    let aiAnswers: Map<string, AiRuleAnswer> | null | undefined;
    const getAiAnswers = async () => {
      if (aiAnswers !== undefined) {
        return aiAnswers;
      }
      const prompts = new Map<string, string>();
      for (const candidate of activeRules) {
        if (candidate.type !== 'ai_prompt') continue;
        try {
          const prompt = normalizeAiPrompt(JSON.parse(candidate.config));
          if (prompt) prompts.set(candidate.id, prompt);
        } catch {
          // invalid config, skipped below
        }
      }
      try {
        aiAnswers = prompts.size > 0 ? await askJevAboutRules(prompts, email) : new Map();
      } catch (error) {
        logJevFailure(error);
        aiAnswers = null;
      }
      return aiAnswers;
    };

    // Evaluate rules in priority order (highest first)
    for (const rule of activeRules) {
      try {
        let config: ExplicitRuleConfig | AiPromptRuleConfig;
        try {
          config = JSON.parse(rule.config);
        } catch {
          console.error(`🛡️ Guard - Invalid config for rule ${rule.id}, skipping`)
          continue;
        }

        // Check if rule matches
        let matchResult: CheckRuleMatchResponse;
        let aiAnswer: AiRuleAnswer | undefined;
        if (rule.type === 'explicit') {
          matchResult = await checkExplicitRule(config as ExplicitRuleConfig, email);
        } else if (rule.type === 'ai_prompt') {
          if (!normalizeAiPrompt(config as AiPromptRuleConfig)) {
            matchResult = { matched: false, error: 'Invalid AI prompt configuration' };
          } else {
            aiAnswer = (await getAiAnswers())?.get(rule.id);
            matchResult = aiAnswer ? aiRuleMatch(aiAnswer, rule.name) : { matched: false, error: AI_EVALUATION_FAILED };
          }
        } else {
          continue;
        }

        if (matchResult.matched) {
          console.log(`🛡️ Guard - Rule "${rule.name}" (${rule.id}) matched!`)

          // Parse action config before updating stats to ensure it's valid
          let actionConfig: RuleActionConfig;
          try {
            actionConfig = JSON.parse(rule.actions || '{"action":"allow"}');
          } catch {
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
              ...(aiAnswer ? { jevModel: aiAnswer.model, jevProbability: aiAnswer.probability } : {}),
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

