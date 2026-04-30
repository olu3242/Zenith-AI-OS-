import { z } from "zod";
import type { Finding } from "../agent/auditAgent.js";

export type Priority = "critical" | "high" | "medium" | "low";

export interface Gap {
  domain: string;
  control: string;
  currentScore: number;
  targetScore: number;
  gap: number;
  priority: Priority;
  recommendation: string;
}

export interface GapAnalysisResult {
  gaps: Gap[];
  totalGaps: number;
  criticalCount: number;
  highCount: number;
  topPriorities: Gap[];
  estimatedEffortWeeks: number;
}

const DOMAIN_PRIORITY_BOOST: Record<string, number> = {
  "ai-governance": 2,
  "AI Governance": 2,
  security: 1,
  "human-oversight": 1,
  accountability: 1,
};

function resolvePriority(gap: number, domain: string, status: string): Priority {
  const boost = DOMAIN_PRIORITY_BOOST[domain] ?? 0;
  const score = gap + boost * 10 + (status === "fail" ? 15 : 0);
  if (score >= 70) return "critical";
  if (score >= 50) return "high";
  if (score >= 30) return "medium";
  return "low";
}

const EFFORT_BY_PRIORITY: Record<Priority, number> = {
  critical: 4,
  high: 2,
  medium: 1,
  low: 0.5,
};

export const GapAnalysisInputSchema = z.array(
  z.object({
    domain: z.string(),
    control: z.string(),
    status: z.enum(["pass", "fail", "partial", "not_applicable"]),
    score: z.number().min(0).max(100),
    recommendation: z.string().optional(),
  })
);

export function analyzeGaps(
  findings: Finding[],
  targetScore: number = 70
): GapAnalysisResult {
  GapAnalysisInputSchema.parse(findings);

  const gaps: Gap[] = findings
    .filter((f) => f.status !== "not_applicable" && f.score < targetScore)
    .map((f) => {
      const gapSize = targetScore - f.score;
      return {
        domain: f.domain,
        control: f.control,
        currentScore: f.score,
        targetScore,
        gap: gapSize,
        priority: resolvePriority(gapSize, f.domain, f.status),
        recommendation: f.recommendation ?? `Improve ${f.control} to meet ${targetScore}% threshold`,
      };
    })
    .sort((a, b) => {
      const order: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.priority] - order[b.priority] || b.gap - a.gap;
    });

  const criticalCount = gaps.filter((g) => g.priority === "critical").length;
  const highCount = gaps.filter((g) => g.priority === "high").length;

  const estimatedEffortWeeks = Math.ceil(
    gaps.reduce((sum, g) => sum + EFFORT_BY_PRIORITY[g.priority], 0)
  );

  return {
    gaps,
    totalGaps: gaps.length,
    criticalCount,
    highCount,
    topPriorities: gaps.slice(0, 5),
    estimatedEffortWeeks,
  };
}
