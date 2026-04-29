export type AuditScore = 0 | 1 | 2 | 3 | 4 | 5;
export type MaturityBand = 'ai_enabled_app' | 'emerging_ai_platform' | 'functional_ai_os' | 'advanced_ai_os' | 'standard_ready_ai_os' | 'open_standard_reference';
export type CertificationLevel = 'uncertified' | 'AIOS-L1' | 'AIOS-L2' | 'AIOS-L3' | 'AIOS-L4' | 'AIOS-L5';
export type GapType = 'structural' | 'operational' | 'governance' | 'security' | 'data' | 'reliability' | 'experience' | 'portability' | 'standardization';
export type LapseType = 'design' | 'execution' | 'policy' | 'context' | 'memory' | 'tooling' | 'workflow' | 'observability' | 'human_oversight';

export interface AuditControl { id: string; domain_id: string; name: string; description: string; expected_standard: string; evidence_required: string; scoring_guidance: Record<string, string>; risk_if_missing: string; remediation_guidance: string; weight: number; severity: 'info' | 'low' | 'medium' | 'high' | 'critical'; is_required: boolean; }
export interface AuditDomain { id: string; name: string; slug: string; description: string; weight: number; controls: AuditControl[]; }
export interface AuditFinding { control_id: string; control_name: string; domain_name: string; score: AuditScore; evidence?: string; notes?: string; gap_type?: GapType; lapse_type?: LapseType; severity: 'info' | 'low' | 'medium' | 'high' | 'critical'; is_gap: boolean; is_lapse: boolean; }
export interface DomainScore { domain_name: string; raw_score: number; weighted_score: number; weight: number; controls_passed: number; controls_total: number; coverage_pct: number; }
export interface GapItem { id: string; domain_name: string; control_name: string; gap_type: GapType; severity: string; description: string; impact: string; recommended_action: string; effort_estimate: string; risk_score: number; }
export interface LapseItem { id: string; domain_name: string; control_name: string; lapse_type: LapseType; severity: string; description: string; root_cause: string; corrective_action: string; preventive_action: string; risk_score: number; }
export interface RemediationItem { title: string; description: string; priority: number; effort_days: number; impact_score_delta: number; domain: string; control: string; }
export interface RemediationPhase { phase: '30day' | '60day' | '90day'; items: RemediationItem[]; estimated_score_delta: number; }

export interface AuditRunResult {
  run_id: string; organization_id: string; overall_score: number;
  maturity_band: MaturityBand; certification_level: CertificationLevel;
  domain_scores: Record<string, DomainScore>; findings: AuditFinding[];
  gaps: GapItem[]; lapses: LapseItem[];
  remediation_roadmap: RemediationPhase[];
  executive_summary: string; final_verdict: string; completed_at: string;
}

export const scoreToMaturityBand = (s: number): MaturityBand =>
  s >= 90 ? 'open_standard_reference' : s >= 81 ? 'standard_ready_ai_os' : s >= 66 ? 'advanced_ai_os' : s >= 46 ? 'functional_ai_os' : s >= 26 ? 'emerging_ai_platform' : 'ai_enabled_app';

export const scoreToCertLevel = (s: number): CertificationLevel =>
  s >= 90 ? 'AIOS-L5' : s >= 80 ? 'AIOS-L4' : s >= 65 ? 'AIOS-L3' : s >= 45 ? 'AIOS-L2' : s >= 25 ? 'AIOS-L1' : 'uncertified';

export const MATURITY_LABELS: Record<MaturityBand, string> = {
  ai_enabled_app: 'AI-Enabled App (0–25)',
  emerging_ai_platform: 'Emerging AI Platform (26–45)',
  functional_ai_os: 'Functional AI OS (46–65)',
  advanced_ai_os: 'Advanced AI OS (66–80)',
  standard_ready_ai_os: 'Standard-Ready AI OS (81–100)',
  open_standard_reference: 'Open-Standard Reference Candidate (90+)',
};

export const CERT_LABELS: Record<CertificationLevel, string> = {
  uncertified: 'Uncertified',
  'AIOS-L1': 'AIOS-L1: AI Enabled',
  'AIOS-L2': 'AIOS-L2: Workflow AI Platform',
  'AIOS-L3': 'AIOS-L3: Operational AI OS',
  'AIOS-L4': 'AIOS-L4: Enterprise AI OS',
  'AIOS-L5': 'AIOS-L5: Open Standard Reference AI OS',
};
