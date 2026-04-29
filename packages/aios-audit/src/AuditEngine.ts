import { AUDIT_CONTROLS, CERTIFICATION_LEVELS, type AuditControl } from './controls.js';

export interface ControlResult {
  control: AuditControl;
  passed: boolean;
  score: number;
  notes?: string;
}

export interface DomainScore {
  domain: string;
  score: number;
  maxScore: number;
  percentage: number;
  controls: ControlResult[];
}

export interface AuditReport {
  timestamp: Date;
  overallScore: number;
  maxPossibleScore: number;
  percentageScore: number;
  maturityBand: string;
  certification: string;
  domains: DomainScore[];
  gaps: string[];
  nextSteps: string[];
}

export type ControlEvaluationMap = Map<string, { passed: boolean; notes?: string }>;

export class AuditEngine {
  evaluate(evaluations: ControlEvaluationMap): AuditReport {
    const domainMap = new Map<string, ControlResult[]>();

    for (const control of AUDIT_CONTROLS) {
      const eval_ = evaluations.get(control.id);
      const passed = eval_?.passed ?? false;
      const result: ControlResult = {
        control,
        passed,
        score: passed ? control.weight : 0,
        notes: eval_?.notes,
      };
      const list = domainMap.get(control.domain) ?? [];
      list.push(result);
      domainMap.set(control.domain, list);
    }

    const domains: DomainScore[] = [];
    let totalScore = 0;
    let totalMax = 0;

    for (const [domain, controls] of domainMap) {
      const score = controls.reduce((s, c) => s + c.score, 0);
      const maxScore = controls.reduce((s, c) => s + c.control.weight, 0);
      domains.push({ domain, score, maxScore, percentage: (score / maxScore) * 100, controls });
      totalScore += score;
      totalMax += maxScore;
    }

    const percentageScore = (totalScore / totalMax) * 100;
    const overallScore = Math.round(percentageScore * 10) / 10;

    const cert = [...CERTIFICATION_LEVELS].reverse().find(c => overallScore >= c.threshold);
    const gaps = AUDIT_CONTROLS
      .filter(c => !(evaluations.get(c.id)?.passed))
      .slice(0, 10)
      .map(c => `[${c.id}] ${c.name}: ${c.description}`);

    const nextSteps = this._buildNextSteps(overallScore, evaluations);

    return {
      timestamp: new Date(),
      overallScore,
      maxPossibleScore: 100,
      percentageScore,
      maturityBand: cert?.label ?? 'Pre-AI App',
      certification: cert?.level ?? 'AIOS-L0',
      domains,
      gaps,
      nextSteps,
    };
  }

  private _buildNextSteps(score: number, evals: ControlEvaluationMap): string[] {
    const steps: string[] = [];
    if (score < 25) steps.push('Implement basic session context and LLM plugin to reach AIOS-L1');
    if (score < 38) steps.push('Add workflow engine and memory service to reach AIOS-L2');
    if (score < 55) steps.push('Enable policy evaluator, security middleware, and agent registry to reach AIOS-L3');
    if (score < 70) steps.push('Add semantic memory, distributed tracing, and vector RAG to reach AIOS-L4');
    if (score < 90) steps.push('Implement trace replay, streaming support, and tenant billing isolation to reach AIOS-L5');

    const unpassedHigh = AUDIT_CONTROLS
      .filter(c => c.weight >= 2 && !evals.get(c.id)?.passed)
      .slice(0, 3)
      .map(c => `Implement ${c.name} (${c.id}, weight: ${c.weight})`);
    steps.push(...unpassedHigh);
    return steps.slice(0, 5);
  }

  formatReport(report: AuditReport): string {
    const lines: string[] = [
      '╔══════════════════════════════════════════════════════════════╗',
      '║         ZENITH AI OS — AUDIT REPORT                         ║',
      '╚══════════════════════════════════════════════════════════════╝',
      '',
      `  Overall Score:    ${report.overallScore} / 100`,
      `  Maturity Band:    ${report.maturityBand}`,
      `  Certification:    ${report.certification} — ${report.maturityBand}`,
      '',
      '── Domain Scores ──────────────────────────────────────────────',
    ];
    for (const d of report.domains) {
      const bar = '█'.repeat(Math.round(d.percentage / 10)) + '░'.repeat(10 - Math.round(d.percentage / 10));
      lines.push(`  ${d.domain.padEnd(25)} ${bar} ${d.percentage.toFixed(1)}%`);
    }
    lines.push('', '── Top Gaps ───────────────────────────────────────────────────');
    report.gaps.slice(0, 5).forEach(g => lines.push(`  • ${g}`));
    lines.push('', '── Next Steps ─────────────────────────────────────────────────');
    report.nextSteps.forEach(s => lines.push(`  → ${s}`));
    lines.push('');
    return lines.join('\n');
  }
}
