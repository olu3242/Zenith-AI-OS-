// Zenith AI OS — Audit Scoring Engine
// Computes weighted scores, maturity bands, certification levels

import type {
  AuditDomain, AuditFinding, AuditRunResult, DomainScore,
  GapItem, LapseItem, RemediationPhase, MaturityBand, CertificationLevel
} from '../../aios-core/src/types/audit.types';
import { scoreToMaturityBand, scoreToCertLevel } from '../../aios-core/src/types/audit.types';

// Domain weights — must sum to 1.0
export const DOMAIN_WEIGHTS: Record<string, number> = {
  'identity-context':      0.10,
  'memory-state':          0.08,
  'agent-orchestration':   0.12,
  'tool-execution':        0.10,
  'workflow-engine':       0.10,
  'knowledge-layer':       0.08,
  'policy-engine':         0.10,
  'interface-layer':       0.06,
  'security-governance':   0.14,
  'observability':         0.08,
  'extensibility':         0.08,
  'deployment-portability':0.06,
};

export interface ScoringInput {
  run_id: string;
  organization_id: string;
  domains: AuditDomain[];
  findings: AuditFinding[];
}

export function computeAuditScore(input: ScoringInput): AuditRunResult {
  const { run_id, organization_id, domains, findings } = input;
  
  const findingsByDomain = groupFindingsByDomain(findings, domains);
  const domainScores: Record<string, DomainScore> = {};
  
  let totalWeightedScore = 0;
  
  for (const domain of domains) {
    const domainFindings = findingsByDomain[domain.slug] ?? [];
    const weight = DOMAIN_WEIGHTS[domain.slug] ?? domain.weight;
    const ds = computeDomainScore(domain, domainFindings, weight);
    domainScores[domain.slug] = ds;
    totalWeightedScore += ds.weighted_score;
  }
  
  // Normalize to 0-100
  const overallScore = Math.round(totalWeightedScore * 20 * 10) / 10; // 5.0 max raw → 100
  const maturityBand = scoreToMaturityBand(overallScore);
  const certLevel = scoreToCertLevel(overallScore);
  
  const gaps = extractGaps(findings);
  const lapses = extractLapses(findings);
  const roadmap = buildRemediationRoadmap(findings, domainScores);
  
  return {
    run_id,
    organization_id,
    overall_score: overallScore,
    maturity_band: maturityBand,
    certification_level: certLevel,
    domain_scores: domainScores,
    findings,
    gaps,
    lapses,
    remediation_roadmap: roadmap,
    executive_summary: buildExecutiveSummary(overallScore, maturityBand, certLevel, gaps.length, lapses.length),
    final_verdict: buildFinalVerdict(overallScore, certLevel, domainScores),
    completed_at: new Date().toISOString(),
  };
}

function computeDomainScore(domain: AuditDomain, findings: AuditFinding[], weight: number): DomainScore {
  const controls = domain.controls;
  if (controls.length === 0) return { domain_name: domain.name, raw_score: 0, weighted_score: 0, weight, controls_passed: 0, controls_total: 0, coverage_pct: 0 };
  
  let totalScore = 0;
  let totalWeight = 0;
  let controlsPassed = 0;
  
  for (const control of controls) {
    const finding = findings.find(f => f.control_id === control.id);
    const score = finding?.score ?? 0;
    totalScore += score * control.weight;
    totalWeight += control.weight;
    if (score >= 3) controlsPassed++;
  }
  
  const rawScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  const weightedScore = rawScore * weight;
  const coveragePct = Math.round((controlsPassed / controls.length) * 100);
  
  return {
    domain_name: domain.name,
    raw_score: Math.round(rawScore * 10) / 10,
    weighted_score: Math.round(weightedScore * 100) / 100,
    weight,
    controls_passed: controlsPassed,
    controls_total: controls.length,
    coverage_pct: coveragePct,
  };
}

function groupFindingsByDomain(findings: AuditFinding[], domains: AuditDomain[]): Record<string, AuditFinding[]> {
  const controlToDomain: Record<string, string> = {};
  for (const domain of domains) {
    for (const control of domain.controls) {
      controlToDomain[control.id] = domain.slug;
    }
  }
  
  const grouped: Record<string, AuditFinding[]> = {};
  for (const finding of findings) {
    const domainSlug = controlToDomain[finding.control_id];
    if (domainSlug) {
      if (!grouped[domainSlug]) grouped[domainSlug] = [];
      grouped[domainSlug].push(finding);
    }
  }
  return grouped;
}

function extractGaps(findings: AuditFinding[]): GapItem[] {
  return findings
    .filter(f => f.is_gap && f.gap_type)
    .map((f, i) => ({
      id: `gap-${i + 1}`,
      domain_name: f.domain_name,
      control_name: f.control_name,
      gap_type: f.gap_type!,
      severity: f.severity,
      description: `Gap detected in: ${f.control_name}. Current score: ${f.score}/5`,
      impact: `Risk of non-compliance in ${f.domain_name} domain`,
      recommended_action: `Implement ${f.control_name} to standard level (score 4+)`,
      effort_estimate: f.score <= 1 ? 'High (>30 days)' : f.score <= 2 ? 'Medium (15-30 days)' : 'Low (<15 days)',
      risk_score: (5 - f.score) / 5,
    }));
}

function extractLapses(findings: AuditFinding[]): LapseItem[] {
  return findings
    .filter(f => f.is_lapse && f.lapse_type)
    .map((f, i) => ({
      id: `lapse-${i + 1}`,
      domain_name: f.domain_name,
      control_name: f.control_name,
      lapse_type: f.lapse_type!,
      severity: f.severity,
      description: `Lapse in: ${f.control_name}. Evidence incomplete or fragile.`,
      root_cause: `Partial implementation of ${f.domain_name} controls`,
      corrective_action: `Complete implementation and testing of ${f.control_name}`,
      preventive_action: `Add ${f.control_name} to continuous audit monitoring`,
      risk_score: (5 - f.score) / 5,
    }));
}

function buildRemediationRoadmap(findings: AuditFinding[], domainScores: Record<string, DomainScore>): RemediationPhase[] {
  const critical = findings.filter(f => f.score === 0 && f.is_gap);
  const major = findings.filter(f => f.score <= 2 && !f.is_gap);
  const minor = findings.filter(f => f.score === 3);
  
  const toItem = (f: AuditFinding, days: number, delta: number) => ({
    title: `Implement: ${f.control_name}`,
    description: `Bring ${f.control_name} from score ${f.score} to 4+ in the ${f.domain_name} domain`,
    priority: 5 - f.score,
    effort_days: days,
    impact_score_delta: delta,
    domain: f.domain_name,
    control: f.control_name,
  });
  
  return [
    {
      phase: '30day',
      items: critical.slice(0, 5).map(f => toItem(f, 14, 3.0)),
      estimated_score_delta: critical.slice(0, 5).length * 1.5,
    },
    {
      phase: '60day',
      items: major.slice(0, 8).map(f => toItem(f, 21, 2.0)),
      estimated_score_delta: major.slice(0, 8).length * 1.0,
    },
    {
      phase: '90day',
      items: minor.slice(0, 10).map(f => toItem(f, 30, 1.0)),
      estimated_score_delta: minor.slice(0, 10).length * 0.5,
    },
  ];
}

function buildExecutiveSummary(
  score: number,
  band: MaturityBand,
  cert: CertificationLevel,
  gapCount: number,
  lapseCount: number
): string {
  return `This Zenith AI OS audit evaluated 12 core domains across the AI Operating System standard framework. 
The system achieved an overall score of ${score}/100, placing it in the "${band.replace(/_/g, ' ')}" maturity band.
Certification level achieved: ${cert}.
${gapCount} structural gaps and ${lapseCount} operational lapses were identified.
${score >= 66 ? 'The platform demonstrates strong AI OS foundations suitable for enterprise deployment.' : 
  score >= 46 ? 'The platform shows functional AI OS capabilities with targeted improvements needed.' :
  'The platform requires significant architectural investment to reach AI OS standards.'}`;
}

function buildFinalVerdict(
  score: number,
  cert: CertificationLevel,
  domainScores: Record<string, DomainScore>
): string {
  const weakDomains = Object.values(domainScores)
    .filter(d => d.raw_score < 3)
    .map(d => d.domain_name)
    .join(', ');
  
  const strongDomains = Object.values(domainScores)
    .filter(d => d.raw_score >= 4)
    .map(d => d.domain_name)
    .join(', ');
  
  return `VERDICT: ${cert} — Score ${score}/100.
${strongDomains ? `Strengths: ${strongDomains}.` : 'No domains reached production-grade standard.'}
${weakDomains ? `Requires attention: ${weakDomains}.` : 'All domains meet minimum functional standard.'}
${score >= 80 ? 'This system is ready for enterprise AI OS certification.' : 
  score >= 50 ? 'This system needs targeted hardening before enterprise certification.' :
  'Significant architecture gaps prevent AI OS certification at this time.'}`;
}
