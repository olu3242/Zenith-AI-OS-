import {
  PolicyRule,
  PolicyDecision,
  EvaluationContext,
  PolicyCondition,
} from './types.js';

function getContextField(
  context: EvaluationContext,
  field: string,
): unknown {
  // Support top-level fields and metadata fields
  const topLevel = context as unknown as Record<string, unknown>;
  if (field in topLevel) {
    return topLevel[field];
  }
  if (field in context.metadata) {
    return context.metadata[field];
  }
  return undefined;
}

function evaluateCondition(
  condition: PolicyCondition,
  context: EvaluationContext,
): boolean {
  const fieldValue = getContextField(context, condition.field);

  switch (condition.operator) {
    case 'eq':
      return fieldValue === condition.value;

    case 'neq':
      return fieldValue !== condition.value;

    case 'in': {
      if (!Array.isArray(condition.value)) return false;
      return (condition.value as unknown[]).includes(fieldValue);
    }

    case 'gt':
      if (typeof fieldValue !== 'number' || typeof condition.value !== 'number') {
        return false;
      }
      return fieldValue > condition.value;

    case 'lt':
      if (typeof fieldValue !== 'number' || typeof condition.value !== 'number') {
        return false;
      }
      return fieldValue < condition.value;

    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;

    default:
      return false;
  }
}

function ruleMatchesAction(rule: PolicyRule, action: string): boolean {
  // Support wildcard '*' in rule action
  if (rule.action === '*') return true;
  if (rule.action === action) return true;
  // Support prefix wildcard like 'read:*'
  if (rule.action.endsWith(':*')) {
    const prefix = rule.action.slice(0, -1); // e.g. 'read:'
    return action.startsWith(prefix);
  }
  return false;
}

export class PolicyEvaluator {
  private rules: Map<string, PolicyRule> = new Map();

  addRule(rule: PolicyRule): void {
    this.rules.set(rule.id, rule);
  }

  removeRule(id: string): void {
    this.rules.delete(id);
  }

  evaluate(action: string, context: EvaluationContext): PolicyDecision {
    const evaluatedAt = new Date();

    // Sort rules by priority ascending (lower number = higher priority)
    const sortedRules = Array.from(this.rules.values()).sort(
      (a, b) => a.priority - b.priority,
    );

    for (const rule of sortedRules) {
      // Check if rule applies to this action
      if (!ruleMatchesAction(rule, action)) continue;

      // Evaluate all conditions — all must pass (AND semantics)
      const allConditionsMet = rule.conditions.every((cond) =>
        evaluateCondition(cond, context),
      );

      if (allConditionsMet) {
        const allowed = rule.effect === 'allow';
        return {
          allowed,
          reason: `Matched rule "${rule.name}" (${rule.id}) with effect "${rule.effect}"`,
          matchedRule: rule,
          evaluatedAt,
        };
      }
    }

    // Default deny — no rule matched
    return {
      allowed: false,
      reason: 'No matching policy rule found; default deny applied',
      matchedRule: undefined,
      evaluatedAt,
    };
  }
}
