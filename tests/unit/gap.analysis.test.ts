import { describe, it, expect } from 'vitest';
import { analyzeGaps } from '../../src/scoring/gapAnalysis.js';
import type { Finding } from '../../src/agent/auditAgent.js';

function finding(domain: string, score: number, status: Finding['status'] = 'partial', recommendation?: string): Finding {
  return { domain, control: `${domain}-control`, status, score, recommendation };
}

describe('analyzeGaps()', () => {
  describe('basic filtering', () => {
    it('excludes not_applicable findings', () => {
      const findings = [finding('security', 30, 'not_applicable'), finding('transparency', 50)];
      const result = analyzeGaps(findings, 70);
      expect(result.gaps.every(g => g.domain !== 'security')).toBe(true);
    });

    it('excludes findings that already meet target', () => {
      const findings = [finding('security', 80), finding('transparency', 40)];
      const result = analyzeGaps(findings, 70);
      expect(result.totalGaps).toBe(1);
      expect(result.gaps[0].domain).toBe('transparency');
    });

    it('includes all findings below target', () => {
      const findings = Array.from({ length: 5 }, (_, i) => finding(`domain-${i}`, i * 10));
      const result = analyzeGaps(findings, 70);
      expect(result.totalGaps).toBe(5);
    });
  });

  describe('gap size', () => {
    it('gap = targetScore − currentScore', () => {
      const result = analyzeGaps([finding('transparency', 40)], 70);
      expect(result.gaps[0].gap).toBe(30);
      expect(result.gaps[0].currentScore).toBe(40);
      expect(result.gaps[0].targetScore).toBe(70);
    });

    it('default targetScore is 70', () => {
      const result = analyzeGaps([finding('security', 50)]);
      expect(result.gaps[0].targetScore).toBe(70);
    });
  });

  describe('priority classification', () => {
    it('ai-governance at score 0 (fail) → critical (boost +20 +15)', () => {
      const result = analyzeGaps([finding('ai-governance', 0, 'fail')], 70);
      expect(result.gaps[0].priority).toBe('critical');
    });

    it('security at score 0 (fail) → critical (boost +10 +15)', () => {
      const result = analyzeGaps([finding('security', 0, 'fail')], 70);
      expect(result.gaps[0].priority).toBe('critical');
    });

    it('human-oversight at score 0 → critical', () => {
      const result = analyzeGaps([finding('human-oversight', 0, 'fail')], 70);
      expect(result.gaps[0].priority).toBe('critical');
    });

    it('regular domain at score 69 (gap=1) → low', () => {
      const result = analyzeGaps([finding('documentation', 69)], 70);
      expect(result.gaps[0].priority).toBe('low');
    });

    it('fail status raises priority vs partial', () => {
      const failResult    = analyzeGaps([finding('documentation', 45, 'fail')], 70);
      const partialResult = analyzeGaps([finding('documentation', 45, 'partial')], 70);
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      expect(order[failResult.gaps[0].priority]).toBeLessThanOrEqual(order[partialResult.gaps[0].priority]);
    });
  });

  describe('sorting', () => {
    it('critical gaps come before high, high before medium, medium before low', () => {
      const findings = [
        finding('documentation', 65),           // low/medium gap
        finding('ai-governance', 0, 'fail'),     // critical
        finding('transparency', 50),             // medium gap
      ];
      const result = analyzeGaps(findings, 70);
      const priorities = result.gaps.map(g => g.priority);
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      for (let i = 1; i < priorities.length; i++) {
        expect(order[priorities[i]]).toBeGreaterThanOrEqual(order[priorities[i - 1]]);
      }
    });

    it('within same priority, larger gap comes first', () => {
      const findings = [
        finding('transparency', 60),   // gap 10
        finding('privacy', 40),        // gap 30
      ];
      const result = analyzeGaps(findings, 70);
      expect(result.gaps[0].gap).toBeGreaterThanOrEqual(result.gaps[1].gap);
    });
  });

  describe('topPriorities', () => {
    it('returns at most 5 top gaps', () => {
      const findings = Array.from({ length: 10 }, (_, i) => finding(`domain-${i}`, i * 5));
      const result = analyzeGaps(findings, 70);
      expect(result.topPriorities.length).toBeLessThanOrEqual(5);
    });

    it('topPriorities are the first 5 items of gaps (already sorted)', () => {
      const findings = Array.from({ length: 8 }, (_, i) => finding(`domain-${i}`, i * 7));
      const result = analyzeGaps(findings, 70);
      expect(result.topPriorities).toEqual(result.gaps.slice(0, 5));
    });
  });

  describe('effort estimation', () => {
    it('critical gap = 4 weeks, high = 2, medium = 1, low = 0.5', () => {
      const findings = [
        finding('ai-governance', 0, 'fail'),   // critical → 4w
        finding('documentation', 65),          // low → 0.5w
      ];
      const result = analyzeGaps(findings, 70);
      // critical gets +20 boost → 70+20+15=105 ≥ 70 → critical (4w)
      // documentation gap=5, no boost → low (0.5w)
      expect(result.estimatedEffortWeeks).toBe(Math.ceil(4 + 0.5));
    });

    it('returns 0 effort when no gaps', () => {
      const result = analyzeGaps([finding('security', 90)], 70);
      expect(result.estimatedEffortWeeks).toBe(0);
    });
  });

  describe('counts', () => {
    it('criticalCount and highCount match filtered gaps', () => {
      const findings = [
        finding('ai-governance', 0, 'fail'),
        finding('security', 0, 'fail'),
        finding('transparency', 50),
      ];
      const result = analyzeGaps(findings, 70);
      const actualCritical = result.gaps.filter(g => g.priority === 'critical').length;
      const actualHigh     = result.gaps.filter(g => g.priority === 'high').length;
      expect(result.criticalCount).toBe(actualCritical);
      expect(result.highCount).toBe(actualHigh);
    });
  });

  describe('recommendation fallback', () => {
    it('uses provided recommendation when available', () => {
      const result = analyzeGaps([finding('security', 40, 'fail', 'Add RBAC controls')], 70);
      expect(result.gaps[0].recommendation).toBe('Add RBAC controls');
    });

    it('generates fallback recommendation when none provided', () => {
      const result = analyzeGaps([finding('security', 40, 'fail')], 70);
      expect(result.gaps[0].recommendation).toBeTruthy();
      expect(typeof result.gaps[0].recommendation).toBe('string');
    });
  });
});
