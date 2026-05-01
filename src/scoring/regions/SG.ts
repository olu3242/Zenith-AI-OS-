import type { RegionOverlay } from './types.js';

export const SG: RegionOverlay = {
  region: 'SG',
  displayName: 'Singapore — MAS FEAT / Model AI Governance Framework',
  primaryLaw: 'MAS FEAT Principles (2019) + Model AI Governance Framework v2 (2020)',
  effectiveDate: '2020-01-21',
  complianceMultiplier: 0.98,
  mandatoryGates: [
    'fairness',
    'ethics',
    'accountability',
    'transparency',
  ],
  weights: {
    'fairness': 0.13,
    'ethics': 0.12,
    'accountability': 0.12,
    'transparency': 0.11,
    'ai-governance': 0.11,
    'human-oversight': 0.09,
    'security': 0.09,
    'privacy': 0.08,
    'reliability': 0.08,
    'data-governance': 0.07,
  },
  controls: [
    { id: 'sg-001', name: 'Fairness in AI Decisions (FEAT)', domain: 'fairness', mandatory: true, reference: 'MAS FEAT — Fairness' },
    { id: 'sg-002', name: 'Ethics by Design', domain: 'ai-governance', mandatory: true, reference: 'MAS FEAT — Ethics' },
    { id: 'sg-003', name: 'Accountability Framework', domain: 'accountability', mandatory: true, reference: 'MAS FEAT — Accountability' },
    { id: 'sg-004', name: 'Transparency to Customers', domain: 'transparency', mandatory: true, reference: 'MAS FEAT — Transparency' },
    { id: 'sg-005', name: 'Human Decision-Maker in the Loop', domain: 'human-oversight', mandatory: true, reference: 'MAIGF v2 §3.2' },
    { id: 'sg-006', name: 'AI Risk Owner Designation', domain: 'accountability', mandatory: true, reference: 'MAIGF v2 §2.1' },
    { id: 'sg-007', name: 'Operations Risk Management', domain: 'reliability', mandatory: true, reference: 'MAS Guidelines on Operational Risk' },
    { id: 'sg-008', name: 'Data Management Policy', domain: 'data-governance', mandatory: true, reference: 'MAIGF v2 §4' },
    { id: 'sg-009', name: 'Explainable AI for Adverse Decisions', domain: 'transparency', mandatory: true, reference: 'MAS FEAT — Transparency §3' },
    { id: 'sg-010', name: 'AI Model Validation', domain: 'model-governance', mandatory: true, reference: 'MAIGF v2 §5.2' },
  ],
};
