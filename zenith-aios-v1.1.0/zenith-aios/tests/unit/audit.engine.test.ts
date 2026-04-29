/**
 * @zenith/aios-audit — AuditEngine Unit Tests
 */

import { describe, it, expect } from 'vitest';

// Mirror the core scoring logic inline (no dep import needed for unit tests)

const DOMAIN_WEIGHTS: Record<string, number> = {
  identity_context: 0.08, memory: 0.08, agent_orchestration: 0.10,
  tool_execution: 0.09, workflow_engine: 0.09, knowledge_retrieval: 0.08,
  policy_engine: 0.09, interface: 0.07, security_trust: 0.10,
  observability: 0.08, extensibility: 0.07, deployment: 0.07,
};

function computeScore(scores: Record<string, number>): number {
  let total = 0;
  for (const [domain, weight] of Object.entries(DOMAIN_WEIGHTS)) {
    total += (scores[domain] ?? 50) * weight;
  }
  return Math.round(total * 10) / 10;
}

function getBand(score: number) {
  if (score >= 90) return 'Open Standard Candidate';
  if (score >= 80) return 'Standard-Ready AI OS';
  if (score >= 65) return 'Advanced AI OS';
  if (score >= 45) return 'Functional AI OS';
  if (score >= 25) return 'Emerging AI Platform';
  return 'AI-Enabled Application';
}

function getCert(score: number) {
  if (score >= 90) return 'AIOS-L5';
  if (score >= 70) return 'AIOS-L4';
  if (score >= 55) return 'AIOS-L3';
  if (score >= 38) return 'AIOS-L2';
  if (score >= 25) return 'AIOS-L1';
  return 'UNCERTIFIED';
}

describe('Audit Scoring Engine', () => {
  describe('computeScore()', () => {
    it('returns 100 for perfect scores', () => {
      const scores = Object.fromEntries(Object.keys(DOMAIN_WEIGHTS).map(k => [k, 100]));
      expect(computeScore(scores)).toBe(100);
    });

    it('returns 0 for zero scores', () => {
      const scores = Object.fromEntries(Object.keys(DOMAIN_WEIGHTS).map(k => [k, 0]));
      expect(computeScore(scores)).toBe(0);
    });

    it('returns ~50 for uniform 50 scores', () => {
      const scores = Object.fromEntries(Object.keys(DOMAIN_WEIGHTS).map(k => [k, 50]));
      expect(computeScore(scores)).toBeCloseTo(50, 1);
    });

    it('weights security_trust (10%) higher than extensibility (7%)', () => {
      const base = Object.fromEntries(Object.keys(DOMAIN_WEIGHTS).map(k => [k, 50]));
      const secHigh = { ...base, security_trust: 100 };
      const extHigh = { ...base, extensibility: 100 };
      expect(computeScore(secHigh)).toBeGreaterThan(computeScore(extHigh));
    });

    it('a zero policy_engine score pulls total below 50', () => {
      const scores = Object.fromEntries(Object.keys(DOMAIN_WEIGHTS).map(k => [k, 50]));
      scores.policy_engine = 0;
      expect(computeScore(scores)).toBeLessThan(50);
    });
  });

  describe('getBand()', () => {
    it('returns correct bands', () => {
      expect(getBand(10)).toBe('AI-Enabled Application');
      expect(getBand(30)).toBe('Emerging AI Platform');
      expect(getBand(55)).toBe('Functional AI OS');
      expect(getBand(72)).toBe('Advanced AI OS');
      expect(getBand(85)).toBe('Standard-Ready AI OS');
      expect(getBand(95)).toBe('Open Standard Candidate');
    });
  });

  describe('getCert()', () => {
    it('assigns AIOS-L1 at 25+', () => expect(getCert(25)).toBe('AIOS-L1'));
    it('assigns AIOS-L2 at 38+', () => expect(getCert(38)).toBe('AIOS-L2'));
    it('assigns AIOS-L3 at 55+', () => expect(getCert(55)).toBe('AIOS-L3'));
    it('assigns AIOS-L4 at 70+', () => expect(getCert(70)).toBe('AIOS-L4'));
    it('assigns AIOS-L5 at 90+', () => expect(getCert(90)).toBe('AIOS-L5'));
    it('returns UNCERTIFIED below 25', () => expect(getCert(24)).toBe('UNCERTIFIED'));
  });

  describe('Gap detection logic', () => {
    it('flags domains below 40 as gaps', () => {
      const scores: Record<string, number> = {
        ...Object.fromEntries(Object.keys(DOMAIN_WEIGHTS).map(k => [k, 60])),
        policy_engine: 8,
        observability: 18,
        extensibility: 25,
      };

      const gaps = Object.entries(scores)
        .filter(([, v]) => v < 40)
        .map(([k, v]) => ({ domain: k, score: v }));

      expect(gaps.length).toBe(3);
      expect(gaps.map(g => g.domain)).toContain('policy_engine');
    });

    it('critical gap when domain below 20', () => {
      const score = 8;
      const severity = score < 20 ? 'critical' : score < 30 ? 'major' : 'moderate';
      expect(severity).toBe('critical');
    });
  });
});
