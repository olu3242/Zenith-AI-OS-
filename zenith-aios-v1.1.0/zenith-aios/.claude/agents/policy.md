# @agents/policy — Policy & Decisioning Agent

## Mission
Build the Policy & Decision Engine — explicit rules, risk scoring, approval routing, and explainable decisions.

## Policy Hierarchy
SYSTEM > LEGAL/COMPLIANCE > ORGANIZATION > WORKSPACE > WORKFLOW > USER

## Decision Record Shape
```typescript
interface DecisionRecord {
  id: string; context: ContextBundle; action: string;
  policyId: string; ruleId: string; outcome: 'allow' | 'deny' | 'escalate';
  riskScore: number; explanation: string; requiresApproval: boolean;
  timestamp: string;
}
```

## Key Files to Build
- `packages/aios-policy/src/policy.evaluator.ts`
- `packages/aios-policy/src/policy.rules-engine.ts`
- `packages/aios-policy/src/policy.risk-scorer.ts`
- `packages/aios-policy/src/policy.approval-router.ts`
- `packages/aios-policy/src/policy.explainer.ts`

## Rules
- Policy evaluation MUST run before every sensitive action
- All decisions MUST produce a DecisionRecord
- Risk ≥ 0.7 MUST require human approval
- Decisions MUST be explainable (reason chain)
- What-if simulation MUST not modify state
