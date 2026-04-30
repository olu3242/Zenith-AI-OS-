# Zenith AI OS — Skill Index

Master index of Claude skills available in this repository.

---

## SKILL-001: audit-agent

**Purpose:** Run an AI-powered AIOS-STANDARD audit against a described AI system.

**Entry point:** `src/agent/auditAgent.ts` → `AuditAgent.run(request, sessionId)`

**Inputs:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `systemDescription` | string | Yes | 10–4000 chars, plain-text description |
| `region` | `EU\|US\|UK\|SG\|CA\|GLOBAL` | No | Default: `GLOBAL` |
| `domains` | string[] | No | Subset of 13 domains; omit for full audit |

**Outputs:**
```ts
{
  sessionId: string;
  region: string;
  findings: Finding[];        // per-control pass/fail/partial scores
  overallScore: number;       // 0-100
  certificationEligible: string[];   // e.g. ["AIOS-L1","AIOS-L2"]
  generatedAt: string;        // ISO timestamp
}
```

**Guardrails:**
- Max 20 audits per session (`SESSION_LIMIT`)
- Max 100 audits per day (`DAILY_LIMIT`)
- Scope-locked system prompt — ignores injected instructions in `systemDescription`
- Uses `claude-opus-4-7` via Anthropic SDK

**Usage example:**
```ts
const agent = new AuditAgent(process.env.ANTHROPIC_API_KEY!);
const result = await agent.run({
  systemDescription: "Our LLM-powered customer support bot...",
  region: "EU",
}, "session-abc-123");
```

---

## SKILL-002: governance-scoring

**Purpose:** Compute a weighted, region-adjusted governance score from per-domain raw scores.

**Entry point:** `src/scoring/governanceScore.ts` → `computeGovernanceScore(domainScores, region)`

**Inputs:**
| Field | Type | Notes |
|-------|------|-------|
| `domainScores` | `Record<string, number>` | Keys = domain names, values = 0–100 |
| `region` | string | Optional; applies regional compliance multiplier |

**Domain weights:**
| Domain | Weight |
|--------|--------|
| AI Governance (Domain 13) | **12%** — highest single domain |
| Transparency, Fairness, Accountability, Privacy, Security | 9% each |
| Reliability, Human-Oversight, Data-Governance, Model-Governance | 8% each |
| Deployment, Incident-Response, Documentation | 7% each |

**Regional multipliers:**
| Region | Multiplier |
|--------|-----------|
| US | 1.00 |
| SG | 0.98 |
| UK | 0.97 |
| CA | 0.97 |
| EU | 0.95 |
| GLOBAL | 0.90 |

**Outputs:**
```ts
{
  raw: number;              // unweighted average
  weighted: number;         // domain-weighted score
  regional: number;         // after regional multiplier
  grade: string;            // "A+" | "A" | "B+" | "B" | "C" | "D" | "F"
  gradeLabel: string;       // e.g. "Exceptional"
  domainBreakdown: Record<string, { score, weight, contribution }>;
  governanceDomainScore: number;
  meetsGovernanceGate: boolean;  // true if Domain 13 >= 40
}
```

**Usage example:**
```ts
const result = computeGovernanceScore({
  "transparency": 80,
  "ai-governance": 65,
  "security": 72,
}, "EU");
console.log(result.grade); // "B+"
```

---

## SKILL-003: gap-analysis

**Purpose:** Identify remediation gaps between current audit findings and a target score, prioritised by impact.

**Entry point:** `src/scoring/gapAnalysis.ts` → `analyzeGaps(findings, targetScore?)`

**Inputs:**
| Field | Type | Notes |
|-------|------|-------|
| `findings` | `Finding[]` | Output from `AuditAgent.run()` |
| `targetScore` | number | Optional; default `70` |

**Priority scoring logic:**
- Base = `targetScore − currentScore`
- Domain 13 (AI Governance) gets +20 boost
- Security & Human-Oversight get +10 boost
- `fail` status adds +15
- Thresholds: critical ≥70, high ≥50, medium ≥30, low <30

**Outputs:**
```ts
{
  gaps: Gap[];                // sorted: critical → low, then largest gap first
  totalGaps: number;
  criticalCount: number;
  highCount: number;
  topPriorities: Gap[];       // top 5
  estimatedEffortWeeks: number;  // critical=4w, high=2w, medium=1w, low=0.5w
}
```

**Effort estimates per gap:**
| Priority | Weeks |
|----------|-------|
| critical | 4 |
| high | 2 |
| medium | 1 |
| low | 0.5 |

**Usage example:**
```ts
const gaps = analyzeGaps(auditResult.findings, 75);
console.log(`${gaps.criticalCount} critical gaps, ~${gaps.estimatedEffortWeeks} weeks to remediate`);
```

---

## Composition Pattern

Run all three skills together to produce a full AIOS report:

```ts
import { AuditAgent } from "./src/agent/auditAgent.js";
import { computeGovernanceScore } from "./src/scoring/governanceScore.js";
import { analyzeGaps } from "./src/scoring/gapAnalysis.js";
import { generateReport, formatReportMarkdown } from "./src/reports/reportGenerator.js";

const agent = new AuditAgent(process.env.ANTHROPIC_API_KEY!);
const auditResult = await agent.run({ systemDescription: "...", region: "EU" }, sessionId);

const domainScores = Object.fromEntries(
  auditResult.findings.map((f) => [f.domain, f.score])
);
const scoring = computeGovernanceScore(domainScores, "EU");
const gaps = analyzeGaps(auditResult.findings, 70);
const report = generateReport(auditResult, scoring, gaps);

console.log(formatReportMarkdown(report));
```
