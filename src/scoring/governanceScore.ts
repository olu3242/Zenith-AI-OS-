import { z } from "zod";
import { REGION_OVERLAYS } from "./regions/index.js";

const BASE_DOMAIN_WEIGHTS: Record<string, number> = {
  "transparency": 0.09,
  "fairness": 0.09,
  "accountability": 0.09,
  "privacy": 0.09,
  "security": 0.09,
  "reliability": 0.08,
  "human-oversight": 0.08,
  "data-governance": 0.08,
  "model-governance": 0.08,
  "deployment": 0.07,
  "incident-response": 0.07,
  "documentation": 0.07,
  "ai-governance": 0.12,
};

const GRADE_THRESHOLDS: Array<{ min: number; grade: string; label: string }> = [
  { min: 90, grade: "A+", label: "Exceptional" },
  { min: 80, grade: "A",  label: "Strong" },
  { min: 70, grade: "B+", label: "Proficient" },
  { min: 55, grade: "B",  label: "Developing" },
  { min: 38, grade: "C",  label: "Basic" },
  { min: 25, grade: "D",  label: "Minimal" },
  { min: 0,  grade: "F",  label: "Non-compliant" },
];

export const DomainScoreInputSchema = z.record(
  z.string(),
  z.number().min(0).max(100)
);

export interface GovernanceScoreResult {
  raw: number;
  weighted: number;
  regional: number;
  grade: string;
  gradeLabel: string;
  domainBreakdown: Record<string, { score: number; weight: number; contribution: number }>;
  governanceDomainScore: number;
  meetsGovernanceGate: boolean;
  regionDisplayName: string;
  mandatoryGatesStatus: Record<string, boolean>;
}

export function computeGovernanceScore(
  domainScores: Record<string, number>,
  region: string = "GLOBAL"
): GovernanceScoreResult {
  DomainScoreInputSchema.parse(domainScores);

  const overlay = REGION_OVERLAYS[region] ?? REGION_OVERLAYS["GLOBAL"];
  const multiplier = overlay.complianceMultiplier;
  const overlayWeights = overlay.weights;

  let weightedSum = 0;
  let totalWeight = 0;
  const breakdown: GovernanceScoreResult["domainBreakdown"] = {};

  for (const [domain, score] of Object.entries(domainScores)) {
    const key = domain.toLowerCase();
    const weight = overlayWeights[key] ?? BASE_DOMAIN_WEIGHTS[key] ?? 0.07;
    const contribution = score * weight;
    weightedSum += contribution;
    totalWeight += weight;
    breakdown[domain] = { score, weight, contribution: Math.round(contribution * 100) / 100 };
  }

  const rawScore = totalWeight > 0 ? (weightedSum / totalWeight) : 0;
  const weighted = Math.round(rawScore * 10) / 10;
  const regional = Math.round(weighted * multiplier * 10) / 10;

  const gradeEntry = GRADE_THRESHOLDS.find((t) => regional >= t.min) ?? GRADE_THRESHOLDS[GRADE_THRESHOLDS.length - 1];

  const governanceDomainScore = domainScores["ai-governance"] ?? domainScores["AI Governance"] ?? 0;
  // L3 requires ≥40, L4 requires ≥60, L5 requires ≥80
  const meetsGovernanceGate = governanceDomainScore >= 40;

  const mandatoryGatesStatus: Record<string, boolean> = {};
  for (const gate of overlay.mandatoryGates) {
    const gateScore = domainScores[gate] ?? domainScores[gate.toLowerCase()] ?? 0;
    mandatoryGatesStatus[gate] = gateScore >= 40;
  }

  return {
    raw: Math.round(
      Object.values(domainScores).reduce((a, b) => a + b, 0) /
        Math.max(Object.values(domainScores).length, 1) * 10
    ) / 10,
    weighted,
    regional,
    grade: gradeEntry.grade,
    gradeLabel: gradeEntry.label,
    domainBreakdown: breakdown,
    governanceDomainScore,
    meetsGovernanceGate,
    regionDisplayName: overlay.displayName,
    mandatoryGatesStatus,
  };
}
