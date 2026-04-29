import { z } from 'zod';

export const PolicyConditionOperatorSchema = z.enum(['eq', 'neq', 'in', 'gt', 'lt', 'exists']);
export type PolicyConditionOperator = z.infer<typeof PolicyConditionOperatorSchema>;

export const PolicyConditionSchema = z.object({
  field: z.string(),
  operator: PolicyConditionOperatorSchema,
  value: z.unknown(),
});

export type PolicyCondition = z.infer<typeof PolicyConditionSchema>;

export const PolicyDomainSchema = z.enum([
  'system',
  'legal',
  'org',
  'workspace',
  'workflow',
  'user',
]);
export type PolicyDomain = z.infer<typeof PolicyDomainSchema>;

export const PolicyRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: PolicyDomainSchema,
  action: z.string(),
  effect: z.enum(['allow', 'deny']),
  conditions: z.array(PolicyConditionSchema).default([]),
  priority: z.number().int(),
  metadata: z.record(z.unknown()).default({}),
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const PolicyDecisionSchema = z.object({
  allowed: z.boolean(),
  reason: z.string(),
  matchedRule: PolicyRuleSchema.optional(),
  evaluatedAt: z.date(),
});

export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const EvaluationContextSchema = z.object({
  action: z.string(),
  userId: z.string(),
  orgId: z.string(),
  workspaceId: z.string().optional(),
  riskLevel: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export type EvaluationContext = z.infer<typeof EvaluationContextSchema>;
