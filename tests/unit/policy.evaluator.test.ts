/**
 * @zenith/aios-policy — PolicyEvaluator Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEvaluator } from '../../packages/aios-policy/src/PolicyEvaluator.js';
import type { PolicyRule, EvaluationContext } from '../../packages/aios-policy/src/types.js';

function makeEvaluator() {
  return new PolicyEvaluator();
}

function ctx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return { userId: 'u1', orgId: 'org1', metadata: {}, ...overrides };
}

describe('PolicyEvaluator', () => {
  let evaluator: PolicyEvaluator;
  beforeEach(() => { evaluator = makeEvaluator(); });

  describe('default deny', () => {
    it('denies when no rules are registered', () => {
      const decision = evaluator.evaluate('agent.execute', ctx());
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toMatch(/default deny/i);
    });
  });

  describe('addRule() + evaluate()', () => {
    it('allows an action when a matching allow rule exists', () => {
      const rule: PolicyRule = {
        id: 'r1', name: 'Allow reads', domain: 'agent',
        action: 'knowledge.read', effect: 'allow',
        conditions: [], priority: 10,
      };
      evaluator.addRule(rule);
      const d = evaluator.evaluate('knowledge.read', ctx());
      expect(d.allowed).toBe(true);
      expect(d.matchedRule?.id).toBe('r1');
    });

    it('denies an action when a matching deny rule exists', () => {
      const rule: PolicyRule = {
        id: 'r2', name: 'Deny exports', domain: 'data',
        action: 'data.export', effect: 'deny',
        conditions: [], priority: 10,
      };
      evaluator.addRule(rule);
      const d = evaluator.evaluate('data.export', ctx());
      expect(d.allowed).toBe(false);
    });

    it('wildcard action * matches any action', () => {
      evaluator.addRule({
        id: 'r3', name: 'Allow all', domain: 'agent',
        action: '*', effect: 'allow',
        conditions: [], priority: 100,
      });
      expect(evaluator.evaluate('anything.goes', ctx()).allowed).toBe(true);
      expect(evaluator.evaluate('tool.invoke', ctx()).allowed).toBe(true);
    });

    it('higher priority (lower number) rule wins', () => {
      evaluator.addRule({ id: 'low', name: 'Low priority allow', domain: 'agent', action: 'tool.invoke', effect: 'allow', conditions: [], priority: 100 });
      evaluator.addRule({ id: 'high', name: 'High priority deny', domain: 'agent', action: 'tool.invoke', effect: 'deny', conditions: [], priority: 1 });
      const d = evaluator.evaluate('tool.invoke', ctx());
      expect(d.allowed).toBe(false);
      expect(d.matchedRule?.id).toBe('high');
    });
  });

  describe('conditions', () => {
    it('applies eq condition correctly', () => {
      evaluator.addRule({
        id: 'r-eq', name: 'Admin only', domain: 'agent', action: 'admin.action', effect: 'allow',
        conditions: [{ field: 'role', operator: 'eq', value: 'admin' }],
        priority: 10,
      });
      expect(evaluator.evaluate('admin.action', ctx({ metadata: { role: 'admin' } })).allowed).toBe(true);
      expect(evaluator.evaluate('admin.action', ctx({ metadata: { role: 'viewer' } })).allowed).toBe(false);
    });

    it('applies in condition correctly', () => {
      evaluator.addRule({
        id: 'r-in', name: 'Roles in list', domain: 'agent', action: 'tool.read', effect: 'allow',
        conditions: [{ field: 'role', operator: 'in', value: ['admin', 'developer'] }],
        priority: 10,
      });
      expect(evaluator.evaluate('tool.read', ctx({ metadata: { role: 'developer' } })).allowed).toBe(true);
      expect(evaluator.evaluate('tool.read', ctx({ metadata: { role: 'viewer' } })).allowed).toBe(false);
    });
  });

  describe('removeRule()', () => {
    it('removes the rule so it no longer applies', () => {
      evaluator.addRule({ id: 'r-remove', name: 'Temp', domain: 'agent', action: 'tool.invoke', effect: 'allow', conditions: [], priority: 10 });
      expect(evaluator.evaluate('tool.invoke', ctx()).allowed).toBe(true);
      evaluator.removeRule('r-remove');
      expect(evaluator.evaluate('tool.invoke', ctx()).allowed).toBe(false);
    });
  });

  describe('prefix wildcard', () => {
    it('matches read:* prefix to read:anything', () => {
      evaluator.addRule({ id: 'r-prefix', name: 'Allow reads', domain: 'data', action: 'read:*', effect: 'allow', conditions: [], priority: 10 });
      expect(evaluator.evaluate('read:knowledge', ctx()).allowed).toBe(true);
      expect(evaluator.evaluate('read:memory', ctx()).allowed).toBe(true);
      expect(evaluator.evaluate('write:knowledge', ctx()).allowed).toBe(false);
    });
  });
});
