import { guardRules } from '@/lib/db/schema';

// Infer types from schema
export type GuardRule = typeof guardRules.$inferSelect;
export type NewGuardRule = typeof guardRules.$inferInsert;

// Rule type
export type RuleType = 'explicit' | 'ai_prompt';

// Logic operators for explicit rules
export type LogicOperator = 'OR' | 'AND';

// Explicit rule mode
export type ExplicitRuleMode = 'simple' | 'advanced';

// Rule actions
export type RuleAction = 'allow' | 'block' | 'junk' | 'route';

// Rule action configuration with discriminated union for type safety
export type RuleActionConfig =
  | { action: 'allow' }
  | { action: 'block' }
  | { action: 'junk' }
  | { action: 'route'; endpointId: string };

// Explicit rule configuration
export interface ExplicitRuleConfig {
  mode?: ExplicitRuleMode;
  subject?: {
    operator: LogicOperator;
    values: string[];
  };
  from?: {
    operator: LogicOperator;
    values: string[]; // Supports wildcards like *@domain.com
  };
  to?: {
    operator: LogicOperator;
    values: string[]; // Supports wildcards like *@domain.com
  };
  hasAttachment?: boolean;
  hasWords?: {
    operator: LogicOperator;
    values: string[];
  };
}

// AI prompt rule configuration
export interface AiPromptRuleConfig {
  mode: 'simple' | 'advanced';
  prompt: string;
}

// Union type for all rule configurations
export type RuleConfig = ExplicitRuleConfig | AiPromptRuleConfig;

// API Request/Response types
export interface CreateGuardRuleRequest {
  name: string;
  description?: string;
  type: RuleType;
  config: RuleConfig;
  priority?: number;
  action: RuleActionConfig;
}

export interface UpdateGuardRuleRequest {
  name?: string;
  description?: string;
  config?: RuleConfig;
  isActive?: boolean;
  priority?: number;
  action?: RuleActionConfig;
}

export interface CheckRuleMatchRequest {
  structuredEmailId: string;
}

// Separate success and error response types
export interface CheckRuleMatchSuccess {
  matched: boolean;
  matchDetails?: Array<{
    criteria: string;
    value: string;
  }>;
  reason?: string;
}

export interface CheckRuleMatchError {
  matched: false;
  error: string;
}

export type CheckRuleMatchResponse = CheckRuleMatchSuccess | CheckRuleMatchError;

export interface GuardRuleWithStats extends GuardRule {
  // Future: Add computed stats if needed
}

// AI Generation types
export interface GenerateExplicitRulesRequest {
  prompt: string;
}

// Separate success and error response types
export interface GenerateExplicitRulesSuccess {
  config: ExplicitRuleConfig;
}

export interface GenerateExplicitRulesError {
  config: Record<string, never>; // Empty object
  error: string;
}

export type GenerateExplicitRulesResponse = GenerateExplicitRulesSuccess | GenerateExplicitRulesError;

