import { describe, it, expect } from 'vitest';
import { computeGovernanceScore } from '../../src/scoring/governanceScore.js';
import { REGION_OVERLAYS, SUPPORTED_REGIONS } from '../../src/scoring/regions/index.js';

const ALL_DOMAINS = [
  'ai-governance', 'transparency', 'fairness', 'accountability', 'privacy',
  'security', 'reliability', 'human-oversight', 'data-governance',
  'model-governance', 'deployment', 'incident-response', 'documentation',
];

function uniformScores(value: number): Record<string, number> {
  return Object.fromEntries(ALL_DOMAINS.map((d) => [d, value]));
}

describe('computeGovernanceScore()', () => {
  describe('basic scoring', () => {
    it('returns regional score of 100 for perfect scores (US, multiplier=1.0)', () => {
      const result = computeGovernanceScore(uniformScores(100), 'US');
      expect(result.weighted).toBe(100);
      expect(result.regional).toBe(100);
    });

    it('returns 0 for zero scores', () => {
      const result = computeGovernanceScore(uniformScores(0), 'GLOBAL');
      expect(result.weighted).toBe(0);
      expect(result.regional).toBe(0);
    });

    it('returns ~50 weighted for uniform 50 scores', () => {
      const result = computeGovernanceScore(uniformScores(50), 'US');
      expect(result.weighted).toBeCloseTo(50, 0);
    });

    it('ai-governance (12%) has highest weight — boosting it raises score more than any other domain', () => {
      const base = uniformScores(50);
      const govHigh = { ...base, 'ai-governance': 100 };
      const incHigh = { ...base, 'incident-response': 100 };
      const govResult = computeGovernanceScore(govHigh, 'US');
      const incResult = computeGovernanceScore(incHigh, 'US');
      expect(govResult.weighted).toBeGreaterThan(incResult.weighted);
    });

    it('populates domainBreakdown for each supplied domain', () => {
      const scores = { 'ai-governance': 80, 'transparency': 60, 'security': 70 };
      const result = computeGovernanceScore(scores, 'US');
      expect(result.domainBreakdown['ai-governance']).toBeDefined();
      expect(result.domainBreakdown['transparency']).toBeDefined();
      expect(result.domainBreakdown['security']).toBeDefined();
    });

    it('contribution = score × weight for each domain', () => {
      const scores = { 'security': 80 };
      const result = computeGovernanceScore(scores, 'US');
      const entry = result.domainBreakdown['security'];
      expect(entry.contribution).toBeCloseTo(entry.score * entry.weight, 1);
    });
  });

  describe('regional multipliers', () => {
    it('EU multiplier (0.95) reduces score below US (1.0)', () => {
      const scores = uniformScores(80);
      const eu = computeGovernanceScore(scores, 'EU');
      const us = computeGovernanceScore(scores, 'US');
      expect(eu.regional).toBeLessThan(us.regional);
    });

    it('GLOBAL multiplier (0.90) is the lowest', () => {
      const scores = uniformScores(80);
      const global = computeGovernanceScore(scores, 'GLOBAL');
      const sg = computeGovernanceScore(scores, 'SG');
      expect(global.regional).toBeLessThan(sg.regional);
    });

    it('unknown region falls back to GLOBAL (0.90)', () => {
      const scores = uniformScores(80);
      const unknown = computeGovernanceScore(scores, 'ZZ');
      const global = computeGovernanceScore(scores, 'GLOBAL');
      expect(unknown.regional).toBe(global.regional);
    });

    it('regionDisplayName reflects the selected overlay', () => {
      const result = computeGovernanceScore(uniformScores(70), 'EU');
      expect(result.regionDisplayName).toContain('EU');
    });
  });

  describe('grade thresholds', () => {
    it('grades F below 25 (US)', () => {
      expect(computeGovernanceScore(uniformScores(20), 'US').grade).toBe('F');
    });
    it('grades D at 25', () => {
      expect(computeGovernanceScore(uniformScores(25), 'US').grade).toBe('D');
    });
    it('grades C at 38', () => {
      expect(computeGovernanceScore(uniformScores(38), 'US').grade).toBe('C');
    });
    it('grades B at 55', () => {
      expect(computeGovernanceScore(uniformScores(55), 'US').grade).toBe('B');
    });
    it('grades B+ at 70', () => {
      expect(computeGovernanceScore(uniformScores(70), 'US').grade).toBe('B+');
    });
    it('grades A at 80', () => {
      expect(computeGovernanceScore(uniformScores(80), 'US').grade).toBe('A');
    });
    it('grades A+ at 90', () => {
      expect(computeGovernanceScore(uniformScores(90), 'US').grade).toBe('A+');
    });
  });

  describe('governance gate (Domain 13)', () => {
    it('meetsGovernanceGate is true when ai-governance ≥ 40', () => {
      const result = computeGovernanceScore({ 'ai-governance': 40 }, 'US');
      expect(result.meetsGovernanceGate).toBe(true);
      expect(result.governanceDomainScore).toBe(40);
    });

    it('meetsGovernanceGate is false when ai-governance < 40', () => {
      const result = computeGovernanceScore({ 'ai-governance': 39 }, 'US');
      expect(result.meetsGovernanceGate).toBe(false);
    });

    it('governanceDomainScore is 0 when domain not provided', () => {
      const result = computeGovernanceScore({ 'transparency': 70 }, 'US');
      expect(result.governanceDomainScore).toBe(0);
      expect(result.meetsGovernanceGate).toBe(false);
    });
  });

  describe('mandatory gates per region', () => {
    it('EU mandatory gates include transparency, human-oversight, security', () => {
      const overlay = REGION_OVERLAYS['EU'];
      expect(overlay.mandatoryGates).toContain('transparency');
      expect(overlay.mandatoryGates).toContain('human-oversight');
      expect(overlay.mandatoryGates).toContain('security');
    });

    it('mandatoryGatesStatus true when gate score ≥ 40', () => {
      const scores = { 'transparency': 60, 'human-oversight': 50, 'accountability': 70, 'ai-governance': 45, 'security': 55 };
      const result = computeGovernanceScore(scores, 'EU');
      expect(result.mandatoryGatesStatus['transparency']).toBe(true);
      expect(result.mandatoryGatesStatus['security']).toBe(true);
    });

    it('mandatoryGatesStatus false when gate score < 40', () => {
      const scores = { 'transparency': 30, 'human-oversight': 20 };
      const result = computeGovernanceScore(scores, 'EU');
      expect(result.mandatoryGatesStatus['transparency']).toBe(false);
      expect(result.mandatoryGatesStatus['human-oversight']).toBe(false);
    });

    it('GLOBAL mandatory gates include ai-governance, risk-management', () => {
      const overlay = REGION_OVERLAYS['GLOBAL'];
      expect(overlay.mandatoryGates).toContain('ai-governance');
      expect(overlay.mandatoryGates).toContain('risk-management');
    });
  });
});

describe('REGION_OVERLAYS registry', () => {
  it('contains all 6 supported regions', () => {
    expect(SUPPORTED_REGIONS).toHaveLength(6);
    expect(SUPPORTED_REGIONS).toContain('EU');
    expect(SUPPORTED_REGIONS).toContain('US');
    expect(SUPPORTED_REGIONS).toContain('UK');
    expect(SUPPORTED_REGIONS).toContain('SG');
    expect(SUPPORTED_REGIONS).toContain('CA');
    expect(SUPPORTED_REGIONS).toContain('GLOBAL');
  });

  it('every overlay has a complianceMultiplier between 0.85 and 1.0', () => {
    for (const overlay of Object.values(REGION_OVERLAYS)) {
      expect(overlay.complianceMultiplier).toBeGreaterThanOrEqual(0.85);
      expect(overlay.complianceMultiplier).toBeLessThanOrEqual(1.0);
    }
  });

  it('every overlay has at least one control', () => {
    for (const overlay of Object.values(REGION_OVERLAYS)) {
      expect(overlay.controls.length).toBeGreaterThan(0);
    }
  });

  it('every overlay has at least one mandatory gate', () => {
    for (const overlay of Object.values(REGION_OVERLAYS)) {
      expect(overlay.mandatoryGates.length).toBeGreaterThan(0);
    }
  });

  it('every control has required fields: id, name, domain, mandatory, reference', () => {
    for (const overlay of Object.values(REGION_OVERLAYS)) {
      for (const control of overlay.controls) {
        expect(control.id).toBeTruthy();
        expect(control.name).toBeTruthy();
        expect(control.domain).toBeTruthy();
        expect(typeof control.mandatory).toBe('boolean');
        expect(control.reference).toBeTruthy();
      }
    }
  });

  it('weight values in every overlay are all positive and sum between 0.9 and 1.15', () => {
    for (const overlay of Object.values(REGION_OVERLAYS)) {
      const weights = Object.values(overlay.weights);
      const sum = weights.reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThanOrEqual(0.9);
      expect(sum).toBeLessThanOrEqual(1.15);
      for (const w of weights) {
        expect(w).toBeGreaterThan(0);
        expect(w).toBeLessThanOrEqual(0.15);
      }
    }
  });
});
