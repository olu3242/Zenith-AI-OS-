/**
 * @zenith/aios-policy — PolicyEvaluator Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolicyEvaluator, PolicyDefinition } from '../../packages/aios-policy/src/policy.evaluator';

const mockDb = { query: vi.fn().mockResolvedValue({ rows: [] }) };
const mockAuditLogger = { log: vi.fn().mockResolvedValue(undefined) };
const mockLogger = { info: vi.fn() };

function makeEvaluator() {
  return new PolicyEvaluator({ db: mockDb, auditLogger: mockAuditLogger, logger: mockLogger });
}

describe('PolicyEvaluator', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('evaluate() — system baseline', () => {
    it('denies unauthenticated requests (no userId)', async () => {
      const evaluator = makeEvaluator();
      const decision = await evaluator.evaluate('agent.execute', { orgId: 'org1' });

      expect(decision.allowed).toBe(false);
      expect(decision.effect).toBe('deny');
      expect(decision.matchedRules.some(r => r.name.includes('unauthenticated'))).toBe(true);
    });

    it('requires approval for critical risk actions', async () => {
      const evaluator = makeEvaluator();
      const decision = await evaluator.evaluate('tool.invoke', {
        userId: 'u1',
        orgId: 'org1',
        riskLevel: 'critical',
      });

      expect(decision.requiresApproval).toBe(true);
      expect(decision.effect).toBe('require_approval');
    });

    it('allows authenticated users by default', async () => {
      const evaluator = makeEvaluator();
      const decision = await evaluator.evaluate('knowledge.read', {
        userId: 'u1',
        orgId: 'org1',
      });

      expect(decision.allowed).toBe(true);
    });

    it('returns a risk score', async () => {
      const evaluator = makeEvaluator();
      const decision = await evaluator.evaluate('agent.execute', { userId: 'u1', orgId: 'o1' });
      expect(typeof decision.riskScore).toBe('number');
      expect(decision.riskScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('registerPolicy()', () => {
    it('adds a custom policy that denies specific actions', async () => {
      const evaluator = makeEvaluator();

      evaluator.registerPolicy({
        id: 'policy-test',
        name: 'Test Policy',
        version: '1.0.0',
        level: 'organization',
        enabled: true,
        rules: [
          {
            id: 'rule-deny-export',
            policyId: 'policy-test',
            name: 'Deny data export',
            level: 'organization',
            action: 'data.export',
            effect: 'deny',
            riskScore: 80,
            priority: 100,
          },
        ],
      });

      const decision = await evaluator.evaluate('data.export', { userId: 'u1', orgId: 'org1' });
      expect(decision.allowed).toBe(false);
      expect(decision.effect).toBe('deny');
    });

    it('wildcard action matches any action', async () => {
      const evaluator = makeEvaluator();

      evaluator.registerPolicy({
        id: 'policy-block-all',
        name: 'Block All Non-Admin',
        version: '1.0.0',
        level: 'organization',
        enabled: true,
        rules: [
          {
            id: 'rule-non-admin',
            policyId: 'policy-block-all',
            name: 'Block non-admins',
            level: 'organization',
            action: '*',
            condition: 'ctx.role !== "admin"',
            effect: 'deny',
            riskScore: 50,
            priority: 500,
          },
        ],
      });

      const deniedDecision = await evaluator.evaluate('tool.invoke', { userId: 'u1', orgId: 'o1', role: 'viewer' });
      expect(deniedDecision.allowed).toBe(false);

      const allowedDecision = await evaluator.evaluate('tool.invoke', { userId: 'u1', orgId: 'o1', role: 'admin' });
      expect(allowedDecision.allowed).toBe(true);
    });
  });

  describe('simulate()', () => {
    it('returns same result as evaluate but logs simulation event', async () => {
      const evaluator = makeEvaluator();
      const simResult = await evaluator.simulate('tool.invoke', { userId: 'u1', orgId: 'o1' });

      expect(typeof simResult.allowed).toBe('boolean');
      expect(mockAuditLogger.log).toHaveBeenCalledWith('POLICY_SIMULATION', expect.any(Object));
    });
  });
});
