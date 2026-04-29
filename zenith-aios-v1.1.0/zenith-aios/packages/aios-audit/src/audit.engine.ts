// ============================================================
// ZENITH AI OS — Audit Engine
// Core engine for AI OS self-evaluation and certification
// ============================================================

import type {
  UUID, AuditDomain, AuditControlScore, AuditRunResult,
  CertificationLevel, MaturityBand, ContextBundle, JsonObject
} from '@zenith/aios-core';

// ============================================================
// SCORING MODEL
// 0 = Missing
// 1 = Concept only / ad hoc
// 2 = Partial / fragile
// 3 = Functional
// 4 = Strong / production-grade
// 5 = Standard-grade / reusable / certifiable
// ============================================================

export function scoreToLabel(score: number): string {
  const labels: Record<number, string> = {
    0: 'Missing',
    1: 'Ad-hoc / Concept only',
    2: 'Partial / Fragile',
    3: 'Functional',
    4: 'Production-grade',
    5: 'Standard-ready / Certifiable',
  };
  return labels[score] ?? 'Unknown';
}

export function computeMaturityBand(overallScore: number): MaturityBand {
  if (overallScore >= 90) return 'open_standard_candidate';
  if (overallScore >= 81) return 'standard_ready_aios';
  if (overallScore >= 66) return 'advanced_aios';
  if (overallScore >= 46) return 'functional_aios';
  if (overallScore >= 26) return 'emerging_platform';
  return 'ai_enabled_app';
}

export function computeCertificationLevel(overallScore: number): CertificationLevel {
  if (overallScore >= 90) return 'AIOS_L5';
  if (overallScore >= 75) return 'AIOS_L4';
  if (overallScore >= 55) return 'AIOS_L3';
  if (overallScore >= 35) return 'AIOS_L2';
  return 'AIOS_L1';
}

export function maturityBandLabel(band: MaturityBand): string {
  const labels: Record<MaturityBand, string> = {
    ai_enabled_app: 'AI-Enabled App (0–25)',
    emerging_platform: 'Emerging AI Platform (26–45)',
    functional_aios: 'Functional AI OS (46–65)',
    advanced_aios: 'Advanced AI OS (66–80)',
    standard_ready_aios: 'Standard-Ready AI OS (81–100)',
    open_standard_candidate: 'Open-Standard Reference Candidate (90+)',
  };
  return labels[band];
}

export function certLevelLabel(level: CertificationLevel): string {
  const labels: Record<CertificationLevel, string> = {
    AIOS_L1: 'AIOS-L1: AI Enabled',
    AIOS_L2: 'AIOS-L2: Workflow AI Platform',
    AIOS_L3: 'AIOS-L3: Operational AI OS',
    AIOS_L4: 'AIOS-L4: Enterprise AI OS',
    AIOS_L5: 'AIOS-L5: Open Standard Reference AI OS',
  };
  return labels[level];
}

// ============================================================
// SCORE CALCULATOR
// ============================================================

export interface DomainScore {
  domain: AuditDomain;
  rawScore: number;       // sum of (score * weight)
  maxPossible: number;    // sum of (5 * weight)
  normalizedScore: number; // 0–100
  controlCount: number;
  passCount: number;       // score >= 3
  failCount: number;       // score <= 1
  gapCount: number;
  lapseCount: number;
}

export function computeDomainScores(
  findings: AuditControlScore[]
): Record<AuditDomain, DomainScore> {
  const domains = new Map<AuditDomain, AuditControlScore[]>();

  for (const finding of findings) {
    const existing = domains.get(finding.domain) ?? [];
    existing.push(finding);
    domains.set(finding.domain, existing);
  }

  const result: Partial<Record<AuditDomain, DomainScore>> = {};

  for (const [domain, controls] of domains.entries()) {
    const rawScore = controls.reduce((sum, c) => sum + c.score * c.weight, 0);
    const maxPossible = controls.reduce((sum, c) => sum + 5 * c.weight, 0);
    const normalizedScore = maxPossible > 0 ? (rawScore / maxPossible) * 100 : 0;

    result[domain] = {
      domain,
      rawScore,
      maxPossible,
      normalizedScore: Math.round(normalizedScore * 10) / 10,
      controlCount: controls.length,
      passCount: controls.filter(c => c.score >= 3).length,
      failCount: controls.filter(c => c.score <= 1).length,
      gapCount: controls.filter(c => c.gapDetected).length,
      lapseCount: controls.filter(c => c.lapseDetected).length,
    };
  }

  return result as Record<AuditDomain, DomainScore>;
}

export function computeOverallScore(domainScores: Record<AuditDomain, DomainScore>): number {
  const values = Object.values(domainScores);
  if (values.length === 0) return 0;
  const totalNormalized = values.reduce((sum, d) => sum + d.normalizedScore, 0);
  return Math.round((totalNormalized / values.length) * 10) / 10;
}

// ============================================================
// GAP DETECTOR
// ============================================================

export type GapType = 'structural' | 'operational' | 'governance' | 'security' |
  'data' | 'reliability' | 'experience' | 'portability' | 'standardization';

export type GapSeverity = 'critical' | 'major' | 'moderate' | 'minor';

export interface DetectedGap {
  controlId: UUID;
  controlCode: string;
  domain: AuditDomain;
  gapType: GapType;
  severity: GapSeverity;
  title: string;
  description: string;
  riskImpact: string;
  remediationGuidance: string;
  score: number;
}

export function detectGaps(findings: AuditControlScore[], controls: AuditControlDefinition[]): DetectedGap[] {
  const gaps: DetectedGap[] = [];
  const controlMap = new Map(controls.map(c => [c.id, c]));

  for (const finding of findings) {
    if (!finding.gapDetected && finding.score > 2) continue;
    if (finding.score > 2 && !finding.gapDetected) continue;

    const control = controlMap.get(finding.controlId);
    if (!control) continue;

    const severity: GapSeverity =
      finding.score === 0 ? 'critical' :
      finding.score === 1 ? 'major' :
      finding.score === 2 ? 'moderate' : 'minor';

    const gapType = inferGapType(finding.domain, control);

    gaps.push({
      controlId: finding.controlId,
      controlCode: finding.controlCode,
      domain: finding.domain,
      gapType,
      severity,
      title: `Gap: ${control.name}`,
      description: `Score ${finding.score}/5 — ${scoreToLabel(finding.score)}. ${control.expectedStandard}`,
      riskImpact: control.riskIfMissing,
      remediationGuidance: control.remediationGuidance,
      score: finding.score,
    });
  }

  return gaps.sort((a, b) => {
    const order = { critical: 0, major: 1, moderate: 2, minor: 3 };
    return order[a.severity] - order[b.severity];
  });
}

function inferGapType(domain: AuditDomain, control: AuditControlDefinition): GapType {
  const map: Partial<Record<AuditDomain, GapType>> = {
    security_governance: 'security',
    deployment_portability: 'portability',
    observability_reliability: 'reliability',
    identity_context: 'structural',
    memory_state: 'data',
    interoperability_extensibility: 'standardization',
  };
  return map[domain] ?? 'operational';
}

// ============================================================
// LAPSE DETECTOR
// ============================================================

export type LapseType = 'design' | 'execution' | 'policy' | 'context' | 'memory' |
  'tooling' | 'workflow' | 'observability' | 'human_oversight';

export interface DetectedLapse {
  controlId: UUID;
  domain: AuditDomain;
  lapseType: LapseType;
  severity: GapSeverity;
  title: string;
  description: string;
}

export function detectLapses(findings: AuditControlScore[], controls: AuditControlDefinition[]): DetectedLapse[] {
  const lapses: DetectedLapse[] = [];
  const controlMap = new Map(controls.map(c => [c.id, c]));

  for (const finding of findings) {
    if (!finding.lapseDetected) continue;
    const control = controlMap.get(finding.controlId);
    if (!control) continue;

    const lapseType = inferLapseType(finding.domain);
    const severity: GapSeverity = finding.score <= 1 ? 'critical' : finding.score <= 2 ? 'major' : 'moderate';

    lapses.push({
      controlId: finding.controlId,
      domain: finding.domain,
      lapseType,
      severity,
      title: `Lapse: ${control.name}`,
      description: `Implementation lapse detected in ${control.name}. Score: ${finding.score}/5.`,
    });
  }

  return lapses;
}

function inferLapseType(domain: AuditDomain): LapseType {
  const map: Partial<Record<AuditDomain, LapseType>> = {
    identity_context: 'context',
    memory_state: 'memory',
    tool_execution: 'tooling',
    workflow_automation: 'workflow',
    policy_decisioning: 'policy',
    observability_reliability: 'observability',
    interface_experience: 'design',
    security_governance: 'human_oversight',
  };
  return map[domain] ?? 'execution';
}

// ============================================================
// ROADMAP GENERATOR
// ============================================================

export interface RoadmapItem {
  phase: '30-day' | '60-day' | '90-day';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  domain: AuditDomain;
  estimatedEffort: 'small' | 'medium' | 'large';
  expectedScoreGain: number;
}

export function generateRemedationRoadmap(
  gaps: DetectedGap[],
  lapses: DetectedLapse[]
): RoadmapItem[] {
  const items: RoadmapItem[] = [];

  // 30-day: Critical gaps and lapses
  const criticalGaps = gaps.filter(g => g.severity === 'critical');
  for (const gap of criticalGaps.slice(0, 5)) {
    items.push({
      phase: '30-day',
      priority: 'critical',
      title: gap.title,
      description: gap.remediationGuidance,
      domain: gap.domain,
      estimatedEffort: 'large',
      expectedScoreGain: 4 - gap.score,
    });
  }

  // 30-day: Critical lapses
  const criticalLapses = lapses.filter(l => l.severity === 'critical');
  for (const lapse of criticalLapses.slice(0, 3)) {
    items.push({
      phase: '30-day',
      priority: 'critical',
      title: lapse.title,
      description: lapse.description,
      domain: lapse.domain,
      estimatedEffort: 'medium',
      expectedScoreGain: 2,
    });
  }

  // 60-day: Major gaps
  const majorGaps = gaps.filter(g => g.severity === 'major');
  for (const gap of majorGaps.slice(0, 6)) {
    items.push({
      phase: '60-day',
      priority: 'high',
      title: gap.title,
      description: gap.remediationGuidance,
      domain: gap.domain,
      estimatedEffort: 'medium',
      expectedScoreGain: 3 - gap.score,
    });
  }

  // 90-day: Moderate gaps and standardization
  const moderateGaps = gaps.filter(g => g.severity === 'moderate');
  for (const gap of moderateGaps.slice(0, 8)) {
    items.push({
      phase: '90-day',
      priority: 'medium',
      title: gap.title,
      description: gap.remediationGuidance,
      domain: gap.domain,
      estimatedEffort: 'small',
      expectedScoreGain: 1,
    });
  }

  return items;
}

// ============================================================
// REPORT GENERATOR
// ============================================================

export interface AuditReport {
  executiveSummary: string;
  overallScore: number;
  maturityBand: MaturityBand;
  maturityBandLabel: string;
  certificationLevel: CertificationLevel;
  certificationLevelLabel: string;
  isCertified: boolean;
  facetCoverageMatrix: Record<AuditDomain, DomainScore>;
  topCriticalGaps: DetectedGap[];
  topMajorLapses: DetectedLapse[];
  riskRegister: RiskRegisterItem[];
  remediationBacklog: RoadmapItem[];
  roadmap30: RoadmapItem[];
  roadmap60: RoadmapItem[];
  roadmap90: RoadmapItem[];
  standardizationReadinessScore: number;
  isOpenStandardCandidate: boolean;
  finalVerdict: string;
  generatedAt: string;
}

export interface RiskRegisterItem {
  domain: AuditDomain;
  riskTitle: string;
  riskDescription: string;
  likelihood: 'high' | 'medium' | 'low';
  impact: 'critical' | 'high' | 'medium' | 'low';
  mitigationStatus: 'unmitigated' | 'partial' | 'mitigated';
}

export function generateAuditReport(
  findings: AuditControlScore[],
  controls: AuditControlDefinition[],
  organizationName: string
): AuditReport {
  const domainScores = computeDomainScores(findings);
  const overallScore = computeOverallScore(domainScores);
  const band = computeMaturityBand(overallScore);
  const certLevel = computeCertificationLevel(overallScore);
  const gaps = detectGaps(findings, controls);
  const lapses = detectLapses(findings, controls);
  const roadmap = generateRemedationRoadmap(gaps, lapses);
  const standardizationScore = computeStandardizationScore(domainScores, overallScore);
  const isCertified = overallScore >= 46; // L3+
  const isOpenStandardCandidate = overallScore >= 90;

  const executiveSummary = generateExecutiveSummary(
    organizationName, overallScore, band, certLevel,
    gaps.filter(g => g.severity === 'critical').length,
    lapses.filter(l => l.severity === 'critical').length
  );

  const finalVerdict = generateFinalVerdict(overallScore, band, certLevel, gaps, lapses);
  const riskRegister = generateRiskRegister(gaps, domainScores);

  return {
    executiveSummary,
    overallScore,
    maturityBand: band,
    maturityBandLabel: maturityBandLabel(band),
    certificationLevel: certLevel,
    certificationLevelLabel: certLevelLabel(certLevel),
    isCertified,
    facetCoverageMatrix: domainScores,
    topCriticalGaps: gaps.filter(g => g.severity === 'critical').slice(0, 5),
    topMajorLapses: lapses.filter(l => l.severity === 'major').slice(0, 5),
    riskRegister,
    remediationBacklog: roadmap,
    roadmap30: roadmap.filter(r => r.phase === '30-day'),
    roadmap60: roadmap.filter(r => r.phase === '60-day'),
    roadmap90: roadmap.filter(r => r.phase === '90-day'),
    standardizationReadinessScore: standardizationScore,
    isOpenStandardCandidate,
    finalVerdict,
    generatedAt: new Date().toISOString(),
  };
}

function computeStandardizationScore(
  domainScores: Record<AuditDomain, DomainScore>,
  overallScore: number
): number {
  const keyDomains: AuditDomain[] = [
    'security_governance', 'observability_reliability',
    'interoperability_extensibility', 'deployment_portability'
  ];
  const keyScores = keyDomains
    .map(d => domainScores[d]?.normalizedScore ?? 0)
    .reduce((sum, s) => sum + s, 0) / keyDomains.length;
  return Math.round((overallScore * 0.6 + keyScores * 0.4) * 10) / 10;
}

function generateExecutiveSummary(
  orgName: string, score: number, band: MaturityBand,
  criticalGaps: number, criticalLapses: number,
  certLevel: CertificationLevel
): string {
  return `## Executive Summary — Zenith AI OS Audit

**Organization:** ${orgName}
**Audit Date:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
**Conducted By:** Zenith AI OS Certification Engine v1.0

### Overall Assessment

This AI OS audit evaluated the system across 12 core domains encompassing 60+ controls against the Zenith AI OS Standard Framework. The system achieved an overall score of **${score}/100**, placing it in the **${maturityBandLabel(band)}** maturity band, with a certification level of **${certLevelLabel(certLevel)}**.

### Key Findings

The audit identified **${criticalGaps} critical gaps** and **${criticalLapses} critical lapses** requiring immediate remediation. ${
  criticalGaps === 0
    ? 'No critical architectural gaps were found — a strong indicator of foundational AI OS maturity.'
    : `These critical gaps represent fundamental missing capabilities that must be addressed within 30 days to achieve operational AI OS status.`
}

### Strategic Recommendation

${
  score >= 80
    ? 'The system demonstrates strong AI OS maturity. Focus on standardization and open-standard readiness to achieve L5 certification.'
    : score >= 55
    ? 'The system has a solid functional foundation. Prioritize governance, observability, and extensibility to advance to Enterprise AI OS status.'
    : score >= 35
    ? 'Core AI workflows are operational, but significant gaps exist in memory management, policy governance, and auditability. A structured 90-day remediation plan is recommended.'
    : 'The system is in early-stage AI OS maturity. Immediate priority should be establishing foundational context management, memory fabric, and audit trail capabilities.'
}`;
}

function generateFinalVerdict(
  score: number, band: MaturityBand, certLevel: CertificationLevel,
  gaps: DetectedGap[], lapses: DetectedLapse[]
): string {
  const criticalCount = gaps.filter(g => g.severity === 'critical').length;

  if (score >= 90) {
    return `VERDICT: OPEN STANDARD REFERENCE CANDIDATE — This system meets the criteria for ${certLevelLabel(certLevel)}. It demonstrates comprehensive AI OS architecture across all 12 domains and is recommended as an open-standard reference implementation.`;
  }
  if (score >= 75) {
    return `VERDICT: ENTERPRISE AI OS CERTIFIED — ${certLevelLabel(certLevel)}. The system is production-grade across most domains. ${criticalCount} domain(s) require hardening for L5 candidacy.`;
  }
  if (score >= 55) {
    return `VERDICT: OPERATIONAL AI OS — ${certLevelLabel(certLevel)}. Core runtime capabilities are functional. Governance, observability, and extensibility gaps must be closed for Enterprise certification.`;
  }
  if (score >= 35) {
    return `VERDICT: WORKFLOW AI PLATFORM — ${certLevelLabel(certLevel)}. AI workflows are operational but the system lacks the foundational architecture required for true AI OS classification. Structural remediation required.`;
  }
  return `VERDICT: AI-ENABLED APP — ${certLevelLabel(certLevel)}. The system has AI features but does not yet meet AI OS architectural standards. A comprehensive build-out across all 12 domains is required.`;
}

function generateRiskRegister(
  gaps: DetectedGap[], domainScores: Record<AuditDomain, DomainScore>
): RiskRegisterItem[] {
  return gaps.filter(g => g.severity === 'critical' || g.severity === 'major').map(gap => ({
    domain: gap.domain,
    riskTitle: gap.title.replace('Gap: ', 'Risk: '),
    riskDescription: gap.riskImpact,
    likelihood: gap.severity === 'critical' ? 'high' : 'medium',
    impact: gap.severity === 'critical' ? 'critical' : 'high',
    mitigationStatus: gap.score > 0 ? 'partial' : 'unmitigated',
  }));
}

// ============================================================
// DEFAULT AUDIT CONTROLS (seeded into DB)
// ============================================================

export interface AuditControlDefinition {
  id: UUID;
  domain: AuditDomain;
  controlCode: string;
  name: string;
  expectedStandard: string;
  evidenceRequired: string;
  scoringGuidance: string;
  riskIfMissing: string;
  remediationGuidance: string;
  weight: number;
  severity: 'critical' | 'major' | 'moderate' | 'minor' | 'informational';
}

export const DEFAULT_AUDIT_CONTROLS: Omit<AuditControlDefinition, 'id'>[] = [
  // IDENTITY & CONTEXT
  { domain: 'identity_context', controlCode: 'IC-01', name: 'Tenant Identity Resolution', expectedStandard: 'Every request resolves organization_id before any processing', evidenceRequired: 'Middleware code, RLS policies, test coverage', scoringGuidance: '5=enforced at edge+DB, 4=enforced in middleware, 3=enforced in service, 2=partial, 1=ad-hoc, 0=missing', riskIfMissing: 'Cross-tenant data exposure, compliance violations', remediationGuidance: 'Implement auth middleware that resolves and injects organization_id from JWT on every request, with RLS as fallback enforcement.', weight: 2.0, severity: 'critical' },
  { domain: 'identity_context', controlCode: 'IC-02', name: 'User Role Resolution', expectedStandard: 'User role and permissions resolved before any action', evidenceRequired: 'RBAC implementation, permission service', scoringGuidance: '5=fine-grained RBAC with audit, 4=role-based with logging, 3=basic role check, 2=partial, 1=ad-hoc, 0=missing', riskIfMissing: 'Privilege escalation, unauthorized access', remediationGuidance: 'Build PermissionService that resolves effective permissions from role + workspace membership before every action.', weight: 2.0, severity: 'critical' },
  { domain: 'identity_context', controlCode: 'IC-03', name: 'Context Propagation to Agents/Tools', expectedStandard: 'ContextBundle passed to every agent and tool invocation', evidenceRequired: 'ContextBundle type definition, propagation middleware', scoringGuidance: '5=typed bundle with freshness check, 4=bundle passed consistently, 3=partial context, 2=ad-hoc, 1=concept, 0=missing', riskIfMissing: 'Agents/tools operating without tenant isolation or user context', remediationGuidance: 'Implement ContextBundle as mandatory parameter on all agent and tool interfaces. Enforce via TypeScript typing.', weight: 1.5, severity: 'critical' },
  { domain: 'identity_context', controlCode: 'IC-04', name: 'Context Snapshots Before Critical Actions', expectedStandard: 'Context state captured before sensitive/irreversible actions', evidenceRequired: 'Snapshot service, context_snapshots table', scoringGuidance: '5=automated at action gates, 4=implemented with rollback, 3=basic snapshots, 2=partial, 1=planned, 0=missing', riskIfMissing: 'Inability to audit or replay decisions; loss of context for debugging', remediationGuidance: 'Auto-snapshot context before tool invocations with risk_score >= 5, workflow approval steps, and state-mutating agent actions.', weight: 1.0, severity: 'major' },
  { domain: 'identity_context', controlCode: 'IC-05', name: 'Context Freshness Checks', expectedStandard: 'Stale context (>30min) triggers refresh before agent execution', evidenceRequired: 'Freshness check logic, staleness threshold config', scoringGuidance: '5=automated refresh with conflict detection, 4=staleness check implemented, 3=basic TTL, 2=manual, 1=concept, 0=missing', riskIfMissing: 'Agents acting on outdated user/org state', remediationGuidance: 'Add freshness field to ContextBundle. Middleware checks and refreshes context if older than configured threshold.', weight: 0.8, severity: 'moderate' },

  // MEMORY & STATE
  { domain: 'memory_state', controlCode: 'MS-01', name: 'Durable Memory Store', expectedStandard: 'Long-term persistent memory with CRUD operations', evidenceRequired: 'memory_items table, MemoryService implementation', scoringGuidance: '5=typed memory with all lifecycle ops, 4=durable store operational, 3=basic persistence, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Loss of learned context between sessions; agents unable to personalize', remediationGuidance: 'Implement MemoryService backed by memory_items table with create/read/update/expire/prune operations.', weight: 1.5, severity: 'critical' },
  { domain: 'memory_state', controlCode: 'MS-02', name: 'Memory Permission Controls', expectedStandard: 'Memory reads/writes gated by user and tenant permissions', evidenceRequired: 'Permission checks in MemoryService, RLS on memory tables', scoringGuidance: '5=field-level permissions with audit, 4=read/write gating implemented, 3=basic tenant isolation, 2=partial, 1=planned, 0=missing', riskIfMissing: 'Unauthorized cross-user memory access, PII exposure', remediationGuidance: 'Add permission_check() before every memory read/write. Implement memory_permissions table for fine-grained control.', weight: 1.5, severity: 'critical' },
  { domain: 'memory_state', controlCode: 'MS-03', name: 'Semantic Memory Search', expectedStandard: 'Vector embedding and similarity search on memory items', evidenceRequired: 'Embedding pipeline, pgvector index, retrieval function', scoringGuidance: '5=hybrid search with ranking, 4=vector search operational, 3=basic embedding, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Agents unable to recall relevant past context; poor personalization', remediationGuidance: 'Implement embedding pipeline that embeds new memory items. Add vector search function for semantic recall.', weight: 1.2, severity: 'major' },
  { domain: 'memory_state', controlCode: 'MS-04', name: 'Memory Audit Trail', expectedStandard: 'All memory operations logged with actor, action, timestamp', evidenceRequired: 'memory_audit_logs table, logging in MemoryService', scoringGuidance: '5=immutable audit trail with tamper detection, 4=full audit implemented, 3=basic logging, 2=partial, 1=planned, 0=missing', riskIfMissing: 'Inability to trace data provenance or compliance violations', remediationGuidance: 'Log every memory create/update/delete/access to memory_audit_logs. Include actor_id, action, before/after state.', weight: 1.0, severity: 'major' },
  { domain: 'memory_state', controlCode: 'MS-05', name: 'Memory Expiration & Pruning', expectedStandard: 'Retention policies enforced; expired memory pruned automatically', evidenceRequired: 'expires_at field, scheduled pruning job', scoringGuidance: '5=policy-driven retention with compliance mapping, 4=automated expiry, 3=manual TTL, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Unbounded storage growth; stale context pollution; compliance risk', remediationGuidance: 'Add scheduled job to prune expired memory items. Implement retention_policies table for configurable retention rules.', weight: 0.8, severity: 'moderate' },

  // AGENT ORCHESTRATION
  { domain: 'agent_orchestration', controlCode: 'AO-01', name: 'Agent Registry', expectedStandard: 'All agents registered with capabilities, versions, and allowed tools', evidenceRequired: 'agent_definitions table, registry UI', scoringGuidance: '5=versioned registry with capability discovery, 4=full registry, 3=basic registration, 2=partial, 1=list, 0=missing', riskIfMissing: 'Ungoverned agent proliferation; no capability audit trail', remediationGuidance: 'Build AgentRegistry with manifest-based registration. Every agent declares capabilities, allowed_tools, model constraints.', weight: 1.5, severity: 'critical' },
  { domain: 'agent_orchestration', controlCode: 'AO-02', name: 'Agent Run Tracing', expectedStandard: 'Every agent run produces trace with steps, tokens, cost, outcome', evidenceRequired: 'agent_runs table, agent_run_steps, trace UI', scoringGuidance: '5=full trace with replay, 4=complete run logging, 3=basic run log, 2=partial, 1=concept, 0=missing', riskIfMissing: 'No observability into agent behavior; debugging impossible', remediationGuidance: 'Implement AgentTracer that creates agent_runs + agent_run_steps records. Include token counts, cost, and step details.', weight: 1.5, severity: 'critical' },
  { domain: 'agent_orchestration', controlCode: 'AO-03', name: 'Deterministic Agent Handoffs', expectedStandard: 'Handoffs use typed contracts, not free-form data passing', evidenceRequired: 'AgentHandoffContract type, handoff validation', scoringGuidance: '5=typed contract with policy check, 4=structured handoffs, 3=basic data passing, 2=ad-hoc, 1=concept, 0=missing', riskIfMissing: 'Broken agent chains; lost context in multi-agent flows', remediationGuidance: 'Implement AgentHandoffContract interface. Handoffs must validate schema before transfer.', weight: 1.2, severity: 'major' },
  { domain: 'agent_orchestration', controlCode: 'AO-04', name: 'Agent Failure Fallbacks', expectedStandard: 'Failed agent runs trigger defined fallback behavior', evidenceRequired: 'Fallback configuration, failure handling code', scoringGuidance: '5=cascading fallbacks with human escalation, 4=fallback implemented, 3=basic retry, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Silent failures; broken workflows with no recovery path', remediationGuidance: 'Define fallback_agent and escalation_policy per agent. Auto-escalate to HumanEscalationAgent after N retries.', weight: 1.0, severity: 'major' },
  { domain: 'agent_orchestration', controlCode: 'AO-05', name: 'Token & Cost Governance', expectedStandard: 'Token budgets enforced per agent run; cost tracked per tenant', evidenceRequired: 'max_tokens config, cost tracking in agent_runs', scoringGuidance: '5=real-time cost limits with alerts, 4=budget enforcement, 3=basic tracking, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Unbounded AI costs; no cost accountability per tenant', remediationGuidance: 'Set max_tokens on AgentDefinition. Track tokens_used and cost_usd in agent_runs. Alert when tenant exceeds daily budget.', weight: 1.0, severity: 'moderate' },

  // TOOL EXECUTION
  { domain: 'tool_execution', controlCode: 'TE-01', name: 'Typed Tool Registry', expectedStandard: 'All tools registered with Zod-validated input/output schemas', evidenceRequired: 'tool_definitions table, schema validation code', scoringGuidance: '5=versioned registry with health checks, 4=typed registry, 3=basic registry, 2=partial, 1=list, 0=missing', riskIfMissing: 'Unvalidated tool calls; runtime errors; security gaps', remediationGuidance: 'Build ToolRegistry with mandatory Zod schemas per tool. Auto-validate all inputs before execution.', weight: 1.5, severity: 'critical' },
  { domain: 'tool_execution', controlCode: 'TE-02', name: 'Tool Permission Checks', expectedStandard: 'Every tool call checks caller permissions against tool requirements', evidenceRequired: 'required_permissions field, permission middleware', scoringGuidance: '5=fine-grained RBAC with audit, 4=permission gates implemented, 3=basic auth check, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Unauthorized tool access; privilege escalation via tools', remediationGuidance: 'Implement ToolPermissionMiddleware that checks context.permissions against tool.required_permissions before execution.', weight: 1.5, severity: 'critical' },
  { domain: 'tool_execution', controlCode: 'TE-03', name: 'Tool Idempotency', expectedStandard: 'All state-mutating tools use idempotency keys to prevent duplicate execution', evidenceRequired: 'idempotency_key field, duplicate detection logic', scoringGuidance: '5=guaranteed exactly-once with rollback, 4=idempotency keys enforced, 3=basic dedup, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Duplicate actions (double-sends, double-charges); data corruption', remediationGuidance: 'Require idempotency_key on all tool invocation requests. Check action_idempotency_keys table before execution.', weight: 1.2, severity: 'major' },
  { domain: 'tool_execution', controlCode: 'TE-04', name: 'Human Approval Gates', expectedStandard: 'High-risk tool invocations require explicit human approval', evidenceRequired: 'risk_score field, approval workflow, action_approvals table', scoringGuidance: '5=configurable risk thresholds with approval audit, 4=approval gates for high-risk, 3=basic approval, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Autonomous execution of high-risk actions without human review', remediationGuidance: 'Auto-pause tools with risk_score >= 7. Route to approval workflow. Block execution until approved or rejected.', weight: 1.5, severity: 'critical' },
  { domain: 'tool_execution', controlCode: 'TE-05', name: 'Tool Result Verification', expectedStandard: 'Tool outputs verified against expected schema before use', evidenceRequired: 'ToolVerifier implementation, output schema validation', scoringGuidance: '5=QA agent verification + schema check, 4=output schema validated, 3=basic result check, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Malformed tool outputs propagated; hallucinated results acted upon', remediationGuidance: 'Implement ToolVerifier that validates tool output against output_schema. Route failed verifications to QA agent.', weight: 1.0, severity: 'major' },

  // WORKFLOW AUTOMATION
  { domain: 'workflow_automation', controlCode: 'WA-01', name: 'Event-Driven Workflow Triggers', expectedStandard: 'Workflows triggered by typed events from event queue', evidenceRequired: 'workflow_queue table, event types, trigger config', scoringGuidance: '5=typed event contracts with at-least-once delivery, 4=event-driven, 3=basic triggers, 2=partial, 1=scheduled only, 0=missing', riskIfMissing: 'Tight coupling; unreliable workflow execution; no event history', remediationGuidance: 'Implement typed event system with workflow_queue table. Workflows subscribe to event_type patterns.', weight: 1.5, severity: 'critical' },
  { domain: 'workflow_automation', controlCode: 'WA-02', name: 'Workflow State Machine', expectedStandard: 'Workflows are stateful with explicit step progression and idempotency', evidenceRequired: 'workflow_runs table, step progression logic, idempotency keys', scoringGuidance: '5=formal state machine with replay, 4=stateful with idempotency, 3=basic state tracking, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Lost workflow state on failure; no resume capability', remediationGuidance: 'Build WorkflowEngine as a state machine. Each step transition is atomic with idempotency key. State persisted to workflow_runs.', weight: 1.5, severity: 'critical' },
  { domain: 'workflow_automation', controlCode: 'WA-03', name: 'Dead-Letter Queue', expectedStandard: 'Failed workflow events routed to DLQ for manual review', evidenceRequired: 'workflow_dead_letters table, DLQ processor', scoringGuidance: '5=DLQ with alerting and replay, 4=DLQ operational, 3=basic error capture, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Silent workflow failures; lost events; no recovery mechanism', remediationGuidance: 'Route events that exhaust retries to workflow_dead_letters. Build DLQ dashboard with replay capability.', weight: 1.2, severity: 'major' },
  { domain: 'workflow_automation', controlCode: 'WA-04', name: 'Retry with Exponential Backoff', expectedStandard: 'Failed workflow steps retry with configurable backoff and max attempts', evidenceRequired: 'retry_count field, backoff logic, max_retries config', scoringGuidance: '5=jitter + backoff + circuit breaker, 4=exponential backoff, 3=basic retry, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Cascading failures; no recovery from transient errors', remediationGuidance: 'Implement retry_count tracking in workflow_queue. Apply exponential backoff (base 5s, max 300s) with jitter.', weight: 1.0, severity: 'major' },
  { domain: 'workflow_automation', controlCode: 'WA-05', name: 'Pause/Resume Capability', expectedStandard: 'Workflows can be paused at any step and resumed without data loss', evidenceRequired: 'pause/resume operations, workflow_approvals table', scoringGuidance: '5=pause/resume with audit trail, 4=pause/resume operational, 3=basic pause, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Inability to handle approval gates; workflows block or abort', remediationGuidance: 'Implement PAUSED status in workflow_runs. Approval steps set status=waiting_approval. Resume on approval.', weight: 1.0, severity: 'major' },

  // KNOWLEDGE RETRIEVAL
  { domain: 'knowledge_retrieval', controlCode: 'KR-01', name: 'Tenant-Aware Retrieval', expectedStandard: 'All knowledge retrieval scoped to requesting tenant', evidenceRequired: 'organization_id filter in retrieval queries, RLS on knowledge tables', scoringGuidance: '5=tenant isolation + permission filter, 4=tenant-scoped retrieval, 3=basic isolation, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Cross-tenant knowledge leakage; confidential data exposure', remediationGuidance: 'Always filter knowledge_chunks by organization_id in retrieval queries. Enforce via RLS as secondary control.', weight: 2.0, severity: 'critical' },
  { domain: 'knowledge_retrieval', controlCode: 'KR-02', name: 'Source Trust Scoring', expectedStandard: 'Every knowledge source has a trust score; low-trust sources flagged', evidenceRequired: 'trust_score field, flagging logic, UI indicators', scoringGuidance: '5=dynamic trust with provenance chain, 4=trust scores enforced, 3=basic scoring, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Agents citing unreliable sources; hallucination amplification', remediationGuidance: 'Assign trust_score (0–1) to each knowledge_source. Filter out chunks below min_trust_score in retrieval. Show trust in UI.', weight: 1.2, severity: 'major' },
  { domain: 'knowledge_retrieval', controlCode: 'KR-03', name: 'Citation & Provenance', expectedStandard: 'Retrieval results include source, chunk, freshness date', evidenceRequired: 'Citation metadata in retrieval results, UI display', scoringGuidance: '5=full provenance chain, 4=citations in all responses, 3=basic sourcing, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Hallucinated facts; inability to verify AI-generated content', remediationGuidance: 'Include source_id, document_title, freshness_date in every retrieval result. Surface citations in agent responses.', weight: 1.0, severity: 'major' },
  { domain: 'knowledge_retrieval', controlCode: 'KR-04', name: 'Hallucination Guardrails', expectedStandard: 'Mechanisms exist to detect and limit hallucinated knowledge claims', evidenceRequired: 'Confidence threshold, citation requirement, verification agent', scoringGuidance: '5=multi-layer detection with verification agent, 4=confidence thresholds + citations required, 3=basic guardrails, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Agents presenting false information as fact; reputational and legal risk', remediationGuidance: 'Require citations for factual claims. Run QAVerificationAgent on high-stakes knowledge outputs. Flag low-confidence results.', weight: 1.5, severity: 'critical' },
  { domain: 'knowledge_retrieval', controlCode: 'KR-05', name: 'Freshness Tracking', expectedStandard: 'Knowledge freshness dates tracked; stale content flagged', evidenceRequired: 'freshness_date field, staleness threshold config', scoringGuidance: '5=auto-staleness detection with re-ingestion triggers, 4=freshness tracked and surfaced, 3=basic date tracking, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Agents acting on outdated information; policy/regulatory compliance risk', remediationGuidance: 'Track freshness_date per chunk. Flag chunks older than configured threshold. Surface staleness warnings in UI.', weight: 0.8, severity: 'moderate' },

  // POLICY & DECISIONING
  { domain: 'policy_decisioning', controlCode: 'PD-01', name: 'Explicit Policy Rules', expectedStandard: 'All governance rules defined as explicit, versioned policies', evidenceRequired: 'policy_definitions table, policy_rules table', scoringGuidance: '5=hierarchical policies with versioning and simulation, 4=explicit policies, 3=basic rules, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Implicit/inconsistent governance; no audit trail for decisions', remediationGuidance: 'Define all governance rules in policy_definitions + policy_rules. Implement policy hierarchy: system > org > workspace > user.', weight: 1.5, severity: 'critical' },
  { domain: 'policy_decisioning', controlCode: 'PD-02', name: 'Decision Traceability', expectedStandard: 'Every policy evaluation produces a logged decision record', evidenceRequired: 'decision_records table, PolicyEvaluator implementation', scoringGuidance: '5=full decision trace with explanation, 4=logged decisions, 3=basic logging, 2=partial, 1=concept, 0=missing', riskIfMissing: 'No audit trail for automated decisions; compliance violations', remediationGuidance: 'PolicyEvaluator must write to decision_records on every evaluation, including policy_id, rule_id, outcome, and explanation.', weight: 1.5, severity: 'critical' },
  { domain: 'policy_decisioning', controlCode: 'PD-03', name: 'Risk Scoring', expectedStandard: 'Risk scores computed for all significant actions', evidenceRequired: 'Risk scoring service, risk_score field on invocations/decisions', scoringGuidance: '5=ML-informed risk scoring, 4=rule-based scoring, 3=basic risk levels, 2=partial, 1=concept, 0=missing', riskIfMissing: 'High-risk actions executed without risk awareness', remediationGuidance: 'Implement RiskScorer service. Score tool invocations, agent runs, and workflow steps. Surface risk in UI.', weight: 1.2, severity: 'major' },
  { domain: 'policy_decisioning', controlCode: 'PD-04', name: 'Human Override', expectedStandard: 'Humans can override any automated decision with audit log', evidenceRequired: 'Override UI, human_overrides audit record', scoringGuidance: '5=override with reason tracking and time-limit, 4=override capability with audit, 3=basic override, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Fully autonomous system with no human control path', remediationGuidance: 'Build human override interface for any decision_record. Log override with actor, reason, timestamp, and expiry.', weight: 1.2, severity: 'critical' },
  { domain: 'policy_decisioning', controlCode: 'PD-05', name: 'Explainable Decisions', expectedStandard: 'Every decision includes human-readable explanation', evidenceRequired: 'explanation field in decision_records, decision UI', scoringGuidance: '5=decision explanation with rule chain, 4=explanation in all decisions, 3=basic reason, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Opaque automation; user/operator cannot understand AI behavior', remediationGuidance: 'PolicyExplainer generates human-readable explanation for every decision. Display in Decision Center UI.', weight: 1.0, severity: 'major' },

  // INTERFACE & EXPERIENCE
  { domain: 'interface_experience', controlCode: 'IE-01', name: 'AI Action Transparency', expectedStandard: 'Users see what AI is doing, why, and with what confidence', evidenceRequired: 'Transparency indicators in UI, agent action disclosure', scoringGuidance: '5=real-time transparency with full provenance, 4=action transparency implemented, 3=basic disclosure, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Users making decisions based on opaque AI actions; loss of trust', remediationGuidance: 'Add AI action disclosure component to every agent-initiated action. Show: what, why, confidence, source.', weight: 1.5, severity: 'critical' },
  { domain: 'interface_experience', controlCode: 'IE-02', name: 'Approval/Rejection UI', expectedStandard: 'Users can approve or reject risky AI actions from UI', evidenceRequired: 'Approval modal component, approval API route', scoringGuidance: '5=approval with detailed context and time-limit, 4=approval UI implemented, 3=basic approve/reject, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Human-in-the-loop broken; high-risk actions execute without review', remediationGuidance: 'Build ApprovalModal that surfaces risk score, action details, and approve/reject controls. Link to action_approvals table.', weight: 1.5, severity: 'critical' },
  { domain: 'interface_experience', controlCode: 'IE-03', name: 'Audit Results UI', expectedStandard: 'Audit scores, gaps, lapses, and certification visible in dashboard', evidenceRequired: 'Audit Center UI, certification dashboard', scoringGuidance: '5=interactive audit drill-down with export, 4=full audit UI, 3=basic score display, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Audit results not actionable by non-technical stakeholders', remediationGuidance: 'Build Audit Center with: overall score, domain scores, gap register, lapse register, roadmap, certification card.', weight: 1.0, severity: 'major' },
  { domain: 'interface_experience', controlCode: 'IE-04', name: 'Error Visibility', expectedStandard: 'All errors are visible, classified, and actionable in UI', evidenceRequired: 'Error boundary components, error classification UI', scoringGuidance: '5=classified errors with suggested actions, 4=errors visible and classified, 3=basic error display, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Silent failures; users unaware of system issues', remediationGuidance: 'Implement ErrorBoundary components. Classify errors (system/user/policy/tool). Surface with appropriate remediation steps.', weight: 0.8, severity: 'moderate' },
  { domain: 'interface_experience', controlCode: 'IE-05', name: 'Execution Timelines', expectedStandard: 'Agent, tool, and workflow executions visible as timelines', evidenceRequired: 'Timeline component, trace_steps visualization', scoringGuidance: '5=interactive timeline with drill-down, 4=timelines implemented, 3=basic log list, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Operators cannot diagnose slow or failed executions', remediationGuidance: 'Build ExecutionTimeline component that renders trace_steps as a visual timeline with duration, status, and input/output drill-down.', weight: 0.8, severity: 'moderate' },

  // SECURITY & GOVERNANCE
  { domain: 'security_governance', controlCode: 'SG-01', name: 'Row-Level Security (RLS)', expectedStandard: 'RLS enforced on all tenant-scoped tables in database', evidenceRequired: 'RLS policies in migrations, security test coverage', scoringGuidance: '5=RLS + app-level + audit, 4=RLS on all tables, 3=partial RLS, 2=some tables, 1=concept, 0=missing', riskIfMissing: 'Database-level cross-tenant access; catastrophic data breach', remediationGuidance: 'Enable RLS on every tenant-scoped table. Implement tenant_isolation policy using auth_organization_id() helper. Test with cross-tenant accounts.', weight: 2.5, severity: 'critical' },
  { domain: 'security_governance', controlCode: 'SG-02', name: 'Prompt Injection Detection', expectedStandard: 'All user inputs screened for prompt injection patterns', evidenceRequired: 'InjectionDetector implementation, prompt_injection_events table', scoringGuidance: '5=ML-based detection with adaptive patterns, 4=pattern-based detection, 3=basic sanitization, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Agents hijacked via malicious inputs; unauthorized actions executed', remediationGuidance: 'Build InjectionDetector service. Screen all user inputs before passing to agents. Block and log injection attempts.', weight: 2.0, severity: 'critical' },
  { domain: 'security_governance', controlCode: 'SG-03', name: 'Audit Log Immutability', expectedStandard: 'Audit logs cannot be modified or deleted post-creation', evidenceRequired: 'Insert-only policy on audit_logs, no UPDATE/DELETE permissions', scoringGuidance: '5=cryptographic integrity verification, 4=immutable logs with WORM policy, 3=append-only, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Audit trail tampering; compliance violations; legal exposure', remediationGuidance: 'Remove UPDATE and DELETE permissions from audit_logs for all roles. Implement RLS to enforce insert-only access pattern.', weight: 2.0, severity: 'critical' },
  { domain: 'security_governance', controlCode: 'SG-04', name: 'Least Privilege Enforcement', expectedStandard: 'Every component has minimum permissions needed for its function', evidenceRequired: 'Permission definitions, service account scopes', scoringGuidance: '5=automated privilege analysis, 4=least privilege by design, 3=basic scoping, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Over-privileged components amplify blast radius of any compromise', remediationGuidance: 'Define minimum permission sets per service account. Audit agent and tool permissions quarterly. Remove unused permissions.', weight: 1.5, severity: 'critical' },
  { domain: 'security_governance', controlCode: 'SG-05', name: 'PII Controls', expectedStandard: 'PII identified, classified, and protected throughout the system', evidenceRequired: 'PII scrubber, data classification, retention policies', scoringGuidance: '5=automated PII detection + field-level encryption, 4=PII controls implemented, 3=basic masking, 2=partial, 1=concept, 0=missing', riskIfMissing: 'PII exposed in logs, traces, and agent outputs; GDPR/CCPA violations', remediationGuidance: 'Implement PII scrubber that redacts sensitive fields in logs and traces. Add data classification to memory and knowledge items.', weight: 1.5, severity: 'critical' },

  // OBSERVABILITY & RELIABILITY
  { domain: 'observability_reliability', controlCode: 'OR-01', name: 'Distributed Tracing', expectedStandard: 'All agent, tool, and workflow calls produce linked trace spans', evidenceRequired: 'traces and trace_steps tables, trace viewer UI', scoringGuidance: '5=distributed tracing with correlation IDs across services, 4=full traces implemented, 3=basic logging, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Inability to diagnose failures or latency issues in multi-agent flows', remediationGuidance: 'Implement Tracer service that creates trace_id and span_id for every request. Pass trace context through all agents and tools.', weight: 1.5, severity: 'critical' },
  { domain: 'observability_reliability', controlCode: 'OR-02', name: 'Cost & Token Metrics', expectedStandard: 'AI token consumption and cost tracked per request, agent, tenant', evidenceRequired: 'cost_usd and tokens_used fields, cost dashboard', scoringGuidance: '5=real-time cost alerts + billing integration, 4=cost tracking operational, 3=basic token counting, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Runaway AI costs; no accountability or budget enforcement', remediationGuidance: 'Track tokens_used and cost_usd on every agent_run and tool_invocation. Build cost dashboard per tenant per day.', weight: 1.2, severity: 'major' },
  { domain: 'observability_reliability', controlCode: 'OR-03', name: 'Failure Classification', expectedStandard: 'All failures classified by type with structured error codes', evidenceRequired: 'Error type taxonomy, error_code field, failure analytics', scoringGuidance: '5=ML failure classification + pattern detection, 4=structured failure classification, 3=basic error codes, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Inability to distinguish system vs. user vs. policy failures; poor MTTR', remediationGuidance: 'Define error code taxonomy (SYSTEM_*, POLICY_*, TOOL_*, USER_*). Classify all failures. Build failure analytics dashboard.', weight: 1.0, severity: 'major' },
  { domain: 'observability_reliability', controlCode: 'OR-04', name: 'Replay Capability', expectedStandard: 'Any agent run or workflow can be replayed for debugging', evidenceRequired: 'replay_sessions table, replay utility', scoringGuidance: '5=shadow mode replay with diff analysis, 4=replay implemented, 3=basic rerun capability, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Cannot reproduce or debug production failures', remediationGuidance: 'Build ReplayService that re-executes agent runs with original input and context. Compare output diff. Support shadow and canary modes.', weight: 1.0, severity: 'major' },
  { domain: 'observability_reliability', controlCode: 'OR-05', name: 'Reliability Alerts', expectedStandard: 'Alerts fire on SLA breaches, error rate spikes, and cost anomalies', evidenceRequired: 'reliability_alerts table, alert service', scoringGuidance: '5=predictive alerting with PagerDuty/webhook integration, 4=threshold-based alerts, 3=basic alerting, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Production issues go undetected; SLA breaches without notification', remediationGuidance: 'Implement AlertService with configurable thresholds. Alert on: p95 latency > 5s, error rate > 5%, workflow SLA breach, cost anomaly > 2x baseline.', weight: 1.0, severity: 'major' },

  // INTEROPERABILITY & EXTENSIBILITY
  { domain: 'interoperability_extensibility', controlCode: 'IX-01', name: 'Plugin Architecture', expectedStandard: 'System has discoverable, sandboxed plugin system with manifest spec', evidenceRequired: 'Plugin manifest schema, plugin_definitions table, registry UI', scoringGuidance: '5=marketplace with versioned plugins + sandboxing, 4=plugin system operational, 3=basic extension points, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Cannot extend platform without core code changes; no ecosystem path', remediationGuidance: 'Build Plugin Registry with manifest validation. Define extension_points as typed hooks. Implement install/uninstall flow.', weight: 1.5, severity: 'critical' },
  { domain: 'interoperability_extensibility', controlCode: 'IX-02', name: 'Provider Abstraction', expectedStandard: 'AI model, embedding, and storage providers are swappable', evidenceRequired: 'ProviderAdapter interface, multiple adapter implementations', scoringGuidance: '5=hot-swap with fallback chain, 4=abstracted providers, 3=basic config-driven selection, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Vendor lock-in to single AI provider; no fallback on outage', remediationGuidance: 'Implement ProviderAdapter interface. Build AnthropicAdapter, OpenAIAdapter, LocalAdapter. Select via AI_PROVIDER env var.', weight: 1.5, severity: 'major' },
  { domain: 'interoperability_extensibility', controlCode: 'IX-03', name: 'Public SDK', expectedStandard: 'Versioned SDK available for third-party integration', evidenceRequired: 'aios-sdk package, SDK documentation', scoringGuidance: '5=typed SDK with full coverage, 4=SDK published, 3=basic SDK, 2=partial, 1=concept, 0=missing', riskIfMissing: 'No developer ecosystem; platform cannot be integrated externally', remediationGuidance: 'Build @zenith/aios-sdk with typed client for all public APIs. Include auth, context, memory, agent, and tool APIs.', weight: 1.2, severity: 'major' },
  { domain: 'interoperability_extensibility', controlCode: 'IX-04', name: 'Versioned API Contracts', expectedStandard: 'All public APIs are versioned with backward compatibility policy', evidenceRequired: 'API version headers, versioning documentation', scoringGuidance: '5=semantic versioning with deprecation policy, 4=versioned APIs, 3=basic versioning, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Breaking changes without notice; third-party integrations break unexpectedly', remediationGuidance: 'Version all API routes at /api/v1/. Define deprecation policy: 6-month support for deprecated versions. Document breaking changes.', weight: 1.0, severity: 'moderate' },
  { domain: 'interoperability_extensibility', controlCode: 'IX-05', name: 'Extension Point Documentation', expectedStandard: 'All extension points documented with examples', evidenceRequired: 'Developer guide, extension point registry', scoringGuidance: '5=interactive documentation with code examples, 4=full documentation, 3=basic docs, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Developers cannot build plugins or integrations without help', remediationGuidance: 'Document all extension points (tool-bus, workflow-trigger, knowledge-source, memory-hook) with code examples in /docs/developer-guide.', weight: 0.8, severity: 'moderate' },

  // DEPLOYMENT & PORTABILITY
  { domain: 'deployment_portability', controlCode: 'DP-01', name: 'Local Development Setup', expectedStandard: 'Docker-based local dev environment with one-command setup', evidenceRequired: 'docker-compose.yml, setup script, README', scoringGuidance: '5=one-command setup with seeded data, 4=local dev works, 3=basic setup instructions, 2=partial, 1=concept, 0=missing', riskIfMissing: 'High contributor friction; slow onboarding; no reproducible environment', remediationGuidance: 'Create docker-compose.yml with all services. Add setup.sh script. Document in README with prerequisites.', weight: 1.2, severity: 'major' },
  { domain: 'deployment_portability', controlCode: 'DP-02', name: 'Environment Configuration Template', expectedStandard: 'All required env vars documented in .env.example', evidenceRequired: '.env.example file with descriptions', scoringGuidance: '5=validated env vars with defaults and descriptions, 4=complete .env.example, 3=partial .env.example, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Missing configuration causes runtime failures; production vs dev config drift', remediationGuidance: 'Maintain .env.example with every required variable, a description, and an example value. Validate at startup with Zod.', weight: 1.0, severity: 'major' },
  { domain: 'deployment_portability', controlCode: 'DP-03', name: 'Self-Host Option', expectedStandard: 'System can be deployed on self-hosted infrastructure', evidenceRequired: 'Deployment guide for self-host, Docker images', scoringGuidance: '5=automated self-host with Terraform/Helm, 4=self-host documented and tested, 3=basic deployment docs, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Cloud vendor lock-in; enterprise customers cannot self-host', remediationGuidance: 'Document self-host deployment for Supabase + Next.js on VPS/k8s. Provide Docker images for each service.', weight: 1.5, severity: 'critical' },
  { domain: 'deployment_portability', controlCode: 'DP-04', name: 'Database Migration Strategy', expectedStandard: 'Versioned migrations with rollback capability', evidenceRequired: 'Numbered migration files, rollback scripts', scoringGuidance: '5=automated migration with CI/CD integration, 4=versioned migrations with rollback, 3=basic migrations, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Schema drift between environments; painful upgrades', remediationGuidance: 'Use numbered SQL migration files (001_, 002_). Add down migration for each. Integrate with CI: run migrations on merge to main.', weight: 1.2, severity: 'major' },
  { domain: 'deployment_portability', controlCode: 'DP-05', name: 'Open Standard Manifests', expectedStandard: 'Architecture and APIs documented as reusable open standards', evidenceRequired: 'Architecture docs, standard spec files', scoringGuidance: '5=published open standard with community governance, 4=standard manifests published, 3=internal docs, 2=partial, 1=concept, 0=missing', riskIfMissing: 'Cannot position as open standard; no ecosystem alignment', remediationGuidance: 'Write architecture spec documents in /docs/standards. Define agent, tool, workflow, and plugin manifest schemas as open formats.', weight: 2.0, severity: 'critical' },
];
