# Zenith AI OS — Audit System Workflow

## Audit Workflow Architecture

The Zenith AI OS Audit System is a built-in, self-evaluating certification engine. Unlike external audits, it can evaluate both the system itself and any product built on top of it.

---

## Audit Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ZENITH AI OS AUDIT WORKFLOW                      │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│   1. AUDIT INITIATION│
│   ─────────────────  │
│   • Select Framework │
│   • Choose Target    │
│   • Assign Auditor   │
│   • Set Run Name     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐    ┌─────────────────────────────────────┐
│  2. DOMAIN LOADING   │    │    audit_frameworks                 │
│  ─────────────────   │◄───│    ├── audit_domains                │
│  • Load 12 domains   │    │    │   └── audit_controls (60)      │
│  • Load 60 controls  │    │    └── [Zenith AI OS Standard v1.0] │
│  • Compute weights   │    └─────────────────────────────────────┘
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│  3. EVIDENCE COLLECTION  (per domain, per control)               │
│  ─────────────────────────────────────────────                   │
│                                                                  │
│  For each of 12 domains:                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  AUTOMATED CHECKS (where possible)                        │   │
│  │  • Check if table exists in Supabase schema               │   │
│  │  • Check if RLS policy exists on table                    │   │
│  │  • Check if service file exists in codebase               │   │
│  │  • Check if API route is registered                       │   │
│  │  • Check if test file covers the control                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  MANUAL SCORING (human auditor)                           │   │
│  │  • Review evidence provided                               │   │
│  │  • Assign score 0-5 per control                          │   │
│  │  • Note gaps and lapses                                   │   │
│  │  • Classify gap_type and lapse_type                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  4. SCORING ENGINE  (packages/aios-audit/src/scoring.engine.ts)  │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│  For each domain:                                                │
│  raw_score = Σ(control.score × control.weight) / Σ(weights)     │
│  weighted_score = raw_score × domain.weight                      │
│                                                                  │
│  overall = Σ(weighted_score) × 20    [scale 0-5 → 0-100]        │
│                                                                  │
│  Domain weights:                                                 │
│  Identity & Context     10%   Tool Execution       10%          │
│  Memory & State          8%   Workflow Engine       10%          │
│  Agent Orchestration    12%   Knowledge Layer        8%          │
│  Policy Engine          10%   Interface Layer        6%          │
│  Security & Gov         14%   Observability          8%          │
│  Extensibility           8%   Deployment             6%          │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  5. MATURITY BAND CLASSIFICATION                                 │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│   Score     Band                        Certification            │
│   ─────     ────                        ─────────────            │
│    0-25  →  AI-Enabled App           →  Uncertified              │
│   26-45  →  Emerging AI Platform     →  AIOS-L1: AI Enabled      │
│   46-65  →  Functional AI OS         →  AIOS-L2: Workflow AI     │
│   66-80  →  Advanced AI OS           →  AIOS-L3: Operational     │
│   81-89  →  Standard-Ready AI OS     →  AIOS-L4: Enterprise      │
│   90-100 →  Open-Standard Candidate  →  AIOS-L5: Reference       │
│                                                                  │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  6. GAP & LAPSE DETECTION                                        │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│  GAP DETECTION (what is missing):                                │
│  • Any control with score < 3 → potential gap                    │
│  • Score 0 = Missing → Structural Gap (auto-flag)                │
│  • Score 1 = Concept only → Structural or Operational Gap        │
│  • Score 2 = Partial → Operational or Design Gap                 │
│                                                                  │
│  Gap Types: structural, operational, governance, security,        │
│             data, reliability, experience, portability,           │
│             standardization                                       │
│                                                                  │
│  LAPSE DETECTION (what broke down):                              │
│  • Evidence inconsistent with claimed score → Execution Lapse    │
│  • Feature exists but not tested → Tooling Lapse                 │
│  • Policy documented but not enforced → Policy Lapse             │
│  • Human oversight not wired into workflow → Human Oversight Lapse│
│                                                                  │
│  Lapse Types: design, execution, policy, context, memory,        │
│               tooling, workflow, observability, human_oversight   │
│                                                                  │
│  → Written to: audit_gap_register, audit_lapse_register          │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  7. RISK REGISTER GENERATION                                     │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│  risk_score = (5 - control_score) / 5 × severity_multiplier     │
│                                                                  │
│  Severity multipliers:                                           │
│  critical = 1.0  |  high = 0.8  |  medium = 0.5  |  low = 0.2  │
│                                                                  │
│  Risk bands:                                                     │
│  0.8-1.0 = Critical Risk (immediate action)                      │
│  0.6-0.8 = High Risk (30-day remediation)                        │
│  0.4-0.6 = Medium Risk (60-day remediation)                      │
│  0.0-0.4 = Low Risk (90-day remediation)                         │
│                                                                  │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  8. REMEDIATION ROADMAP (30/60/90 Day)                          │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│  30-DAY PHASE: Critical gaps (score=0) and critical security     │
│  60-DAY PHASE: Major gaps (score<=2) and high severity           │
│  90-DAY PHASE: Improvement gaps (score=3) and medium severity    │
│                                                                  │
│  Each item includes:                                             │
│  • Title and description                                         │
│  • Priority (1-5)                                                │
│  • Effort estimate (days)                                        │
│  • Projected score delta                                         │
│  • Assigned owner                                                │
│  • Due date                                                      │
│                                                                  │
│  → Written to: remediation_items                                 │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  9. CERTIFICATION RESULT                                         │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│  certification_results record created with:                      │
│  • level: AIOS-L1 through AIOS-L5                                │
│  • score: 0-100                                                  │
│  • maturity_band                                                 │
│  • certificate_number: ZENITH-{ORG_SLUG}-{DATE}-{SCORE}         │
│  • valid_until: +12 months (or next audit run)                   │
│  • is_self_certified: true (until external validation)           │
│                                                                  │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  10. REPORT GENERATION & EXPORT                                  │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│  Report Sections:                                                │
│  1. Executive Summary                                            │
│  2. Overall AI OS Score                                          │
│  3. Maturity Band                                                │
│  4. Certification Level                                          │
│  5. Facet Coverage Matrix (12 domains × score)                   │
│  6. Domain-by-Domain Evaluation                                  │
│  7. Top Critical Gaps                                            │
│  8. Top Major Lapses                                             │
│  9. Risk Register                                                │
│  10. Remediation Backlog                                         │
│  11. 30/60/90 Day Roadmap                                        │
│  12. Standardization Readiness Review                            │
│  13. Final Verdict                                               │
│                                                                  │
│  Export formats:                                                 │
│  • JSON (machine-readable)                                       │
│  • Markdown (human-readable)                                     │
│  • PDF-ready HTML                                                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Audit Database Flow

```
audit_frameworks
    └── audit_domains (12 per framework)
            └── audit_controls (5 per domain, 60 total)

audit_runs
    ├── audit_findings (1 per control per run)
    ├── audit_gap_register (gaps detected from findings)
    ├── audit_lapse_register (lapses detected from findings)
    ├── remediation_items (roadmap items generated)
    └── certification_results (final cert issued)
```

---

## Scoring Formula

```
For each control:
  control_weighted_score = finding.score × control.weight

For each domain:
  domain_raw_score = Σ(control_weighted_score) / Σ(control.weight)
  domain_weighted_score = domain_raw_score × domain.weight

Overall (0-100):
  overall_score = Σ(domain_weighted_score) × 20
```

---

## Audit API Routes (Planned — Batch 3)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/audit/runs` | Create new audit run |
| GET | `/api/audit/runs` | List audit runs |
| GET | `/api/audit/runs/:id` | Get audit run detail |
| PUT | `/api/audit/runs/:id/findings` | Submit findings |
| POST | `/api/audit/runs/:id/score` | Compute score |
| POST | `/api/audit/runs/:id/certify` | Issue certification |
| GET | `/api/audit/runs/:id/report` | Export report |
| GET | `/api/audit/frameworks` | List frameworks |
| GET | `/api/audit/frameworks/:id/domains` | Get domains + controls |
| GET | `/api/audit/gaps` | List gap register |
| GET | `/api/audit/lapses` | List lapse register |
| GET | `/api/audit/remediation` | List remediation items |
| GET | `/api/audit/certification` | Get current certification |
