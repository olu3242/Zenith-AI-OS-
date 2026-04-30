import type { AuditAgentResult } from "../agent/auditAgent.js";
import type { GovernanceScoreResult } from "../scoring/governanceScore.js";
import type { GapAnalysisResult } from "../scoring/gapAnalysis.js";

export interface AIOSReport {
  meta: {
    reportId: string;
    generatedAt: string;
    frameworkVersion: string;
    region: string;
  };
  summary: {
    overallScore: number;
    grade: string;
    gradeLabel: string;
    certificationEligible: string[];
    meetsGovernanceGate: boolean;
    totalFindings: number;
    totalGaps: number;
    criticalGaps: number;
  };
  scoring: GovernanceScoreResult;
  audit: AuditAgentResult;
  gaps: GapAnalysisResult;
  recommendations: string[];
}

function generateRecommendations(
  gaps: GapAnalysisResult,
  scoring: GovernanceScoreResult
): string[] {
  const recs: string[] = [];

  if (!scoring.meetsGovernanceGate) {
    recs.push(
      `Domain 13 (AI Governance) score is ${scoring.governanceDomainScore}/100. ` +
      "Reach 40+ to unlock L3 certification."
    );
  }

  if (gaps.criticalCount > 0) {
    recs.push(
      `${gaps.criticalCount} critical gap(s) identified — address before submitting for certification.`
    );
  }

  for (const g of gaps.topPriorities.slice(0, 3)) {
    recs.push(`[${g.priority.toUpperCase()}] ${g.domain} / ${g.control}: ${g.recommendation}`);
  }

  if (gaps.estimatedEffortWeeks > 0) {
    recs.push(
      `Estimated remediation effort: ~${gaps.estimatedEffortWeeks} week(s) to reach target score.`
    );
  }

  return recs;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export function generateReport(
  audit: AuditAgentResult,
  scoring: GovernanceScoreResult,
  gaps: GapAnalysisResult
): AIOSReport {
  const recommendations = generateRecommendations(gaps, scoring);

  return {
    meta: {
      reportId: `AIOS-${randomId()}`,
      generatedAt: new Date().toISOString(),
      frameworkVersion: "1.1.0",
      region: audit.region,
    },
    summary: {
      overallScore: scoring.regional,
      grade: scoring.grade,
      gradeLabel: scoring.gradeLabel,
      certificationEligible: audit.certificationEligible,
      meetsGovernanceGate: scoring.meetsGovernanceGate,
      totalFindings: audit.findings.length,
      totalGaps: gaps.totalGaps,
      criticalGaps: gaps.criticalCount,
    },
    scoring,
    audit,
    gaps,
    recommendations,
  };
}

export function formatReportMarkdown(report: AIOSReport): string {
  const { meta, summary, recommendations } = report;

  const certList =
    summary.certificationEligible.length > 0
      ? summary.certificationEligible.join(", ")
      : "None (below L1 threshold)";

  const gateStatus = summary.meetsGovernanceGate ? "✓ Met" : "✗ Not Met";

  const recList = recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n");

  const topGaps = report.gaps.topPriorities
    .map(
      (g) =>
        `| ${g.domain} | ${g.control} | ${g.currentScore} | ${g.priority.toUpperCase()} |`
    )
    .join("\n");

  return `# AIOS Audit Report — ${meta.reportId}

**Generated:** ${meta.generatedAt}
**Region:** ${meta.region}
**Framework:** AIOS-STANDARD v${meta.frameworkVersion}

## Summary

| Metric | Value |
|--------|-------|
| Overall Score | **${summary.overallScore}/100** |
| Grade | ${summary.grade} — ${summary.gradeLabel} |
| Certification Eligible | ${certList} |
| Governance Gate | ${gateStatus} |
| Total Findings | ${summary.totalFindings} |
| Gaps to Remediate | ${summary.totalGaps} (${summary.criticalGaps} critical) |

## Top Gaps

| Domain | Control | Score | Priority |
|--------|---------|-------|----------|
${topGaps}

## Recommendations

${recList}
`;
}
