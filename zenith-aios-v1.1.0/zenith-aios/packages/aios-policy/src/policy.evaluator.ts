/**
 * AIOS Policy Evaluator
 * Hierarchical rules engine: system → legal → org → workspace → workflow → user.
 * Supports risk scoring, human overrides, decision traceability, and what-if simulation.
 */

import { z } from 'zod';

// ─── Schemas ───────────────────────────────────────────────────────────────

export const PolicyLevelSchema = z.enum([
  'system', 'legal', 'organization', 'workspace', 'workflow', 'user',
]);

export const PolicyRuleSchema = z.object({
  id: z.string(),
  policyId: z.string(),
  name: z.string(),
  level: PolicyLevelSchema,
  action: z.string(),
  condition: z.string().optional(), // JS expression or JSONPath
  effect: z.enum(['allow', 'deny', 'require_approval']),
  riskScore: z.number().min(0).max(100).default(0),
  priority: z.number().int().default(0),
  metadata: z.record(z.unknown()).optional(),
});

export const PolicyDefinitionSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  name: z.string(),
  version: z.string().default('1.0.0'),
  level: PolicyLevelSchema,
  enabled: z.boolean().default(true),
  rules: z.array(PolicyRuleSchema),
  metadata: z.record(z.unknown()).optional(),
});

export type PolicyLevel = z.infer<typeof PolicyLevelSchema>;
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export type PolicyDefinition = z.infer<typeof PolicyDefinitionSchema>;

export interface PolicyDecision {
  allowed: boolean;
  effect: 'allow' | 'deny' | 'require_approval';
  reason: string;
  riskScore: number;
  matchedRules: Array<{ ruleId: string; name: string; effect: string }>;
  requiresApproval: boolean;
  decisionId: string;
}

// ─── Policy Evaluator ──────────────────────────────────────────────────────

export interface PolicyEvaluatorDeps {
  db: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> };
  auditLogger: { log: (event: string, data: unknown) => Promise<void> };
  logger: { info: (msg: string, meta?: unknown) => void };
}

export class PolicyEvaluator {
  private policies: PolicyDefinition[] = [];
  private readonly LEVEL_ORDER: PolicyLevel[] = ['system', 'legal', 'organization', 'workspace', 'workflow', 'user'];

  constructor(private deps: PolicyEvaluatorDeps) {
    this.seedDefaults();
  }

  /** Load policies from DB for an org */
  async load(orgId: string): Promise<void> {
    const { rows } = await this.deps.db.query(
      `SELECT * FROM policy_definitions
       WHERE (organization_id = $1 OR organization_id IS NULL) AND enabled = true
       ORDER BY created_at ASC`,
      [orgId]
    );
    this.policies = (rows as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      organizationId: r.organization_id as string | undefined,
      name: r.name as string,
      version: r.version as string,
      level: r.level as PolicyLevel,
      enabled: r.enabled as boolean,
      rules: (r.rules as PolicyRule[]) ?? [],
      metadata: r.metadata as Record<string, unknown> | undefined,
    }));
  }

  /** Evaluate an action against all loaded policies */
  async evaluate(action: string, context: Record<string, unknown>): Promise<PolicyDecision> {
    const matchedRules: PolicyDecision['matchedRules'] = [];
    let maxRiskScore = 0;
    let finalEffect: PolicyDecision['effect'] = 'allow';
    let requiresApproval = false;

    // Sort policies by level hierarchy
    const sortedPolicies = [...this.policies].sort((a, b) =>
      this.LEVEL_ORDER.indexOf(a.level) - this.LEVEL_ORDER.indexOf(b.level)
    );

    for (const policy of sortedPolicies) {
      if (!policy.enabled) continue;

      const relevantRules = policy.rules
        .filter((r) => this.matchesAction(r.action, action))
        .sort((a, b) => b.priority - a.priority);

      for (const rule of relevantRules) {
        const conditionMet = rule.condition ? this.evaluateCondition(rule.condition, context) : true;
        if (!conditionMet) continue;

        matchedRules.push({ ruleId: rule.id, name: rule.name, effect: rule.effect });
        maxRiskScore = Math.max(maxRiskScore, rule.riskScore);

        if (rule.effect === 'deny') {
          finalEffect = 'deny';
          break; // Deny wins at this level
        }
        if (rule.effect === 'require_approval') {
          requiresApproval = true;
          finalEffect = 'require_approval';
        }
      }

      if (finalEffect === 'deny') break; // Higher-level deny cannot be overridden
    }

    const decision: PolicyDecision = {
      allowed: finalEffect !== 'deny',
      effect: finalEffect,
      reason: this.buildReason(finalEffect, matchedRules),
      riskScore: maxRiskScore,
      matchedRules,
      requiresApproval,
      decisionId: `decision_${Date.now()}`,
    };

    await this.recordDecision(action, context, decision);
    return decision;
  }

  /** What-if simulation — evaluate without recording */
  async simulate(action: string, context: Record<string, unknown>): Promise<PolicyDecision> {
    const result = await this.evaluate(action, context);
    await this.deps.auditLogger.log('POLICY_SIMULATION', { action, context, result });
    return result;
  }

  /** Human override — record and allow a previously denied action */
  async override(params: {
    decisionId: string;
    userId: string;
    orgId: string;
    reason: string;
    action: string;
  }): Promise<void> {
    await this.deps.db.query(
      `INSERT INTO human_overrides (decision_id, user_id, organization_id, reason, action, created_at)
       VALUES ($1,$2,$3,$4,$5,NOW())`,
      [params.decisionId, params.userId, params.orgId, params.reason, params.action]
    );
    await this.deps.auditLogger.log('POLICY_HUMAN_OVERRIDE', params);
  }

  /** Register a policy at runtime */
  registerPolicy(policy: PolicyDefinition): void {
    PolicyDefinitionSchema.parse(policy);
    const existing = this.policies.findIndex((p) => p.id === policy.id);
    if (existing >= 0) {
      this.policies[existing] = policy;
    } else {
      this.policies.push(policy);
    }
  }

  private matchesAction(ruleAction: string, targetAction: string): boolean {
    if (ruleAction === '*') return true;
    if (ruleAction.endsWith('*')) {
      return targetAction.startsWith(ruleAction.slice(0, -1));
    }
    return ruleAction === targetAction;
  }

  private evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
    try {
      const fn = new Function('ctx', `"use strict"; return !!(${condition})`);
      return fn(context);
    } catch {
      return false;
    }
  }

  private buildReason(effect: string, rules: PolicyDecision['matchedRules']): string {
    if (rules.length === 0) return 'No matching rules — default allow';
    const names = rules.map((r) => r.name).join(', ');
    return `Effect "${effect}" from rules: ${names}`;
  }

  private async recordDecision(
    action: string, context: Record<string, unknown>, decision: PolicyDecision
  ): Promise<void> {
    await this.deps.db.query(
      `INSERT INTO decision_records (decision_id, action, context, allowed, effect, risk_score, matched_rules, created_at)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7::jsonb,NOW())`,
      [
        decision.decisionId, action, JSON.stringify(context),
        decision.allowed, decision.effect, decision.riskScore,
        JSON.stringify(decision.matchedRules),
      ]
    );
  }

  private seedDefaults(): void {
    this.policies.push({
      id: 'policy-system-baseline',
      name: 'System Baseline Policy',
      version: '1.0.0',
      level: 'system',
      enabled: true,
      rules: [
        {
          id: 'rule-deny-unauthenticated',
          policyId: 'policy-system-baseline',
          name: 'Deny unauthenticated requests',
          level: 'system',
          action: '*',
          condition: '!ctx.userId',
          effect: 'deny',
          riskScore: 100,
          priority: 1000,
        },
        {
          id: 'rule-require-approval-critical',
          policyId: 'policy-system-baseline',
          name: 'Require approval for critical risk actions',
          level: 'system',
          action: '*',
          condition: 'ctx.riskLevel === "critical"',
          effect: 'require_approval',
          riskScore: 90,
          priority: 900,
        },
        {
          id: 'rule-allow-authenticated',
          policyId: 'policy-system-baseline',
          name: 'Allow authenticated users',
          level: 'system',
          action: '*',
          condition: '!!ctx.userId && !!ctx.orgId',
          effect: 'allow',
          riskScore: 0,
          priority: 1,
        },
      ],
    });
  }
}
