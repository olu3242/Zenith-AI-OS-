# Zenith AI OS — AIOS-STANDARD-v1.1

> **Free AI OS Audit Platform** · 60 controls · 12 domains · Regional governance alignment · AI-powered audit agent

---

## Overview

Zenith AI OS is an open-standard audit and certification framework for production AI systems. It evaluates AI products across **60 controls in 12 domains**, assigns a certification level (AIOS-L1 through AIOS-L5), and produces a full gap register, lapse register, risk register, and 90-day remediation roadmap.

**v1.1 introduces:**
- Domain 13: **AI Governance & Responsible AI** (new, 10% weight)
- Regional compliance scoring overlays: **EU AI Act**, **NIST AI RMF**, **ISO 42001**, **UK AI Framework**, **US Executive Order 14110**, **Singapore MAS**, **Canada AIDA**
- An AI-powered audit agent (guardrailed) for answering audit questions

---

## Quick Start

```bash
# Clone
git clone https://github.com/zenith-ai/zenith-aios.git
cd zenith-aios

# Install dependencies
npm install

# Run development server
npm run dev

# Run audit agent locally
npm run agent
```

---

## Project Structure

```
zenith-aios/
├── .claude/
│   ├── CLAUDE.md                  # Claude Code instructions
│   └── skills/
│       ├── SKILL.md               # Master skill index
│       ├── audit-agent.md         # AI audit agent skill
│       ├── governance-scoring.md  # Regional governance scoring
│       └── gap-analysis.md        # Gap register generation
├── src/
│   ├── agent/
│   │   ├── audit-agent.js         # Guardrailed AI audit agent
│   │   ├── guardrails.js          # Input/output guardrails
│   │   └── prompts.js             # System prompts
│   ├── scoring/
│   │   ├── aios-standard.js       # Core 60-control scoring
│   │   ├── governance-overlay.js  # Regional compliance overlay
│   │   └── regions.js             # Region definitions & laws
│   ├── reports/
│   │   ├── gap-register.js        # Gap register generator
│   │   ├── risk-register.js       # Risk register generator
│   │   └── roadmap.js             # 90-day roadmap generator
│   └── landing/
│       └── index.html             # Landing page (updated v1.1)
├── docs/
│   ├── AIOS-STANDARD-v1.1.md      # Full framework specification
│   ├── GOVERNANCE-CONTROLS.md     # Domain 13 control definitions
│   └── REGIONAL-COMPLIANCE.md     # Region-by-region mapping
├── README.md
└── package.json
```

---

## The AIOS-STANDARD Framework

### Scoring Model

Each control is scored **0–5**:

| Score | Maturity Level |
|-------|---------------|
| 0 | Missing |
| 1 | Ad-hoc |
| 2 | Partial |
| 3 | Functional |
| 4 | Production-grade |
| 5 | Standard-ready |

Domain score = `(sum of control scores / max possible) × 100`

Overall score = `weighted average across 13 domains`

---

### Domain Weights (v1.1)

| # | Domain | Controls | Weight |
|---|--------|----------|--------|
| 01 | Identity & Context | 5 | 7% |
| 02 | Memory & State | 5 | 7% |
| 03 | Agent Orchestration | 5 | 9% |
| 04 | Tool / Action Execution | 5 | 8% |
| 05 | Workflow Engine | 5 | 8% |
| 06 | Knowledge Retrieval | 5 | 7% |
| 07 | Policy Engine | 5 | 8% |
| 08 | Interface & Experience | 5 | 6% |
| 09 | Security & Trust | 5 | 9% |
| 10 | Observability | 5 | 7% |
| 11 | Extensibility | 5 | 6% |
| 12 | Deployment & Portability | 5 | 6% |
| **13** | **AI Governance & Responsible AI** | **5** | **12%** |

> Domain 13 carries the highest single weight (12%) in v1.1. A zero here costs 12 points overall.

---

### Domain 13: AI Governance & Responsible AI

| Control | Description | Severity if Missing |
|---------|-------------|---------------------|
| 13.1 | Governance policy document exists and is accessible | Critical |
| 13.2 | Bias & fairness testing integrated into release pipeline | Critical |
| 13.3 | Human oversight mechanism for high-risk decisions | Critical |
| 13.4 | Explainability / auditability of AI outputs | Major |
| 13.5 | Ethics review process for new AI capabilities | Major |

---

### Certification Levels

| Level | Title | Score Threshold |
|-------|-------|----------------|
| AIOS-L1 | AI Enabled Application | 25+ |
| AIOS-L2 | Workflow AI Platform | 38+ |
| AIOS-L3 | Operational AI OS | 55+ |
| AIOS-L4 | Enterprise AI OS | 70+ |
| AIOS-L5 | Open Standard Reference | 90+ |

---

## Regional Governance Scoring

AIOS-STANDARD-v1.1 applies **regional compliance overlays** to the base score. Each overlay adjusts weights and adds mandatory controls based on the user's operating jurisdiction.

### Supported Regions

| Region | Primary Law | Key Requirements Added |
|--------|-------------|------------------------|
| 🇪🇺 EU | EU AI Act (2024) | Risk classification, conformity assessment, prohibited use checks |
| 🇺🇸 USA | NIST AI RMF + EO 14110 | Govern/Map/Measure/Manage functions, safety reporting |
| 🇬🇧 UK | UK AI Framework (2023) | 5-principle compliance (Safety, Transparency, Fairness, Accountability, Contestability) |
| 🇸🇬 Singapore | MAS FEAT + PDPA | Fairness, Ethics, Accountability, Transparency scoring |
| 🇨🇦 Canada | AIDA (Bill C-27) | High-impact system designation, human oversight mandates |
| 🌏 Global | ISO 42001 | AI management system certification alignment |

### How Overlays Work

The base score (0–100) is calculated first. The regional overlay then:
1. Adds up to **15 mandatory compliance controls** (pass/fail)
2. Applies a **compliance multiplier** (0.85–1.0) based on mandatory control pass rate
3. Produces a **Regional Compliance Score** alongside the base score

```
Final Score = Base Score × Compliance Multiplier
Regional Score = Pass Rate of mandatory regional controls (%)
```

---

## AI Audit Agent

An AI-powered agent answers questions about the AIOS framework, audit results, and remediation guidance. The agent is **guardrailed** to prevent misuse.

### Capabilities

- Answer questions about AIOS controls, domains, and scoring
- Explain gaps in a submitted audit report
- Suggest remediation steps for specific controls
- Explain regional compliance requirements
- Clarify certification criteria

### Guardrails

The agent enforces the following:

| Guardrail | Rule |
|-----------|------|
| **Scope lock** | Only responds to questions about AI audits, governance, and AIOS framework. Off-topic requests are declined. |
| **No legal advice** | Redirects legal interpretation questions to qualified counsel. |
| **No specific vendor recommendations** | Neutral on tooling choices. |
| **No fabrication** | Will not invent control scores or audit results. |
| **Rate limiting** | 20 questions per session, 100 per day per user. |
| **PII protection** | Strips company-identifying information from logs. |

### Usage

```javascript
import { AuditAgent } from './src/agent/audit-agent.js';

const agent = new AuditAgent({
  region: 'EU',
  auditContext: myAuditReport, // optional
});

const response = await agent.ask("What does a zero in Policy Engine mean for my score?");
```

---

## Database Support

Zenith AI OS ships nine database adapters and is database-agnostic by design:

- **Postgres** (node-postgres) — pgvector ✓
- **Supabase** — pgvector ✓
- **Neon Serverless** — pgvector ✓
- **CockroachDB** — pgvector ✓
- **PlanetScale** — keyword fallback
- **Turso / LibSQL** — keyword fallback
- **Prisma ORM** — depends on DB
- **Drizzle ORM** — depends on DB
- **Custom Adapter** — implement `DatabaseAdapter` interface

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-change`
3. Commit using format: `ZA-XXX: Description`
4. Open a pull request against `main`

See `docs/CONTRIBUTING.md` for full guidelines.

---

## License

MIT License — © 2025 Zenith AI OS

The AIOS-STANDARD-v1.1 framework specification is separately licensed under CC BY 4.0.

---

## Links

- [Framework Docs](./docs/AIOS-STANDARD-v1.1.md)
- [Governance Controls](./docs/GOVERNANCE-CONTROLS.md)
- [Regional Compliance](./docs/REGIONAL-COMPLIANCE.md)
- [Audit Landing Page](./src/landing/index.html)
