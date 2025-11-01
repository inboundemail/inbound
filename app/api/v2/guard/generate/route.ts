import { NextRequest, NextResponse } from 'next/server';
import { validateRequest } from '../../helper/main';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { GenerateExplicitRulesRequest, GenerateExplicitRulesResponse } from '@/features/guard/types';

// Configure the AI model - easy to swap providers by changing this string
// Uses Vercel AI Gateway for unified provider access
// Reference: https://ai-sdk.dev/docs/ai-sdk-core/provider-management
const MODEL = process.env.GUARD_AI_MODEL || 'openai/gpt-5-mini';

// To use different providers, just change the MODEL string:
// - OpenAI: 'openai/gpt-4o'
// - Anthropic: 'anthropic/claude-3-5-sonnet-20241022'
// - Groq: 'groq/llama-3.3-70b-versatile'
// - Google: 'google/gemini-1.5-pro'

// Zod schema for the explicit rule config
const explicitRuleConfigSchema = z.object({
  subject: z.object({
    operator: z.enum(['OR', 'AND']),
    values: z.array(z.string()),
  }).optional(),
  from: z.object({
    operator: z.enum(['OR', 'AND']),
    values: z.array(z.string()),
  }).optional(),
  hasAttachment: z.boolean().optional(),
  hasWords: z.object({
    operator: z.enum(['OR', 'AND']),
    values: z.array(z.string()),
  }).optional(),
});

// POST /api/v2/guard/generate - Generate explicit rules from natural language
export async function POST(request: NextRequest) {
  try {
    const result = await validateRequest(request)

    if ('error' in result) {

      const status = result.status || 401

      const headers: Record<string, string> = {}

      if (status === 429 && result.retryAfter) {

        headers['Retry-After'] = result.retryAfter.toString()

        headers['X-RateLimit-Limit'] = (result.limit || 0).toString()

        headers['X-RateLimit-Remaining'] = (result.remaining || 0).toString()

      }

      return NextResponse.json({ error: result.error }, { status, headers })

    }

    const { userId } = result

    const body: GenerateExplicitRulesRequest = await request.json();

    if (!body.prompt || !body.prompt.trim()) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Use AI SDK's generateObject for type-safe structured output
    // Reference: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
    const { object: config } = await generateObject({
      model: MODEL,
      schema: explicitRuleConfigSchema,
      schemaName: 'ExplicitRuleConfig',
      schemaDescription: 'Email filtering rule configuration with criteria',
      prompt: `Convert this natural language email filtering description into a structured configuration:

"${body.prompt}"

Extract filtering criteria:
- subject: keywords in email subject line
- from: sender addresses (use *@domain.com for entire domains)
- hasAttachment: whether email must/must not have attachments
- hasWords: keywords in email body

Rules:
- Only include fields explicitly mentioned in the description
- Use OR operator by default unless "and" or "all" is specified
- Keep values lowercase
- For domain filtering, use wildcard format: *@example.com

Examples:
"Block emails from spam@example.com with subject containing urgent or important"
→ {"from":{"operator":"OR","values":["spam@example.com"]},"subject":{"operator":"OR","values":["urgent","important"]}}

"Filter emails from any Gmail address"
→ {"from":{"operator":"OR","values":["*@gmail.com"]}}

"Emails with attachments from support and containing both refund and order"
→ {"from":{"operator":"OR","values":["*@support"]},"hasAttachment":true,"hasWords":{"operator":"AND","values":["refund","order"]}}`,
      temperature: 0.2,
    });

    // Validate the generated config has at least one criterion
    const hasValidCriteria = 
      config.subject?.values?.length ||
      config.from?.values?.length ||
      config.hasAttachment !== undefined ||
      config.hasWords?.values?.length;

    if (!hasValidCriteria) {
      return NextResponse.json(
        { 
          error: 'Could not extract clear filtering criteria. Please be more specific.',
          config: {} 
        } as GenerateExplicitRulesResponse,
        { status: 400 }
      );
    }

    return NextResponse.json({ config } as GenerateExplicitRulesResponse);
  } catch (error) {
    console.error('Error generating rules:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to generate rules',
        config: {} 
      } as GenerateExplicitRulesResponse,
      { status: 500 }
    );
  }
}


