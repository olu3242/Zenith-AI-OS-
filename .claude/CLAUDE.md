# CLAUDE.md — Zenith AI OS

## Project Overview

**Zenith AI OS** is an open-standard audit and certification framework for production AI systems (AIOS-STANDARD-v1.1). It is a TypeScript pnpm monorepo with 12 `@zenith/aios-*` packages, a Next.js dashboard, a guardrailed AI audit agent, and regional compliance overlays for EU/US/UK/SG/CA/ISO 42001.

## Commit Format

```
ZA-XXX: Short imperative description
```

Examples:
- `ZA-001: Add EU AI Act mandatory controls to governance overlay`
- `ZA-042: Fix Policy Engine weight calculation in aggregator`
- `ZA-103: Update landing page FAQ section with regional compliance questions`

## Repository Map

```
packages/
  aios-context/      — SessionContext, tenant isolation
  aios-memory/       — Short/long-term memory, entity memory
  aios-agents/       — AgentRegistry, AgentRunner (tool-calling loop)
  aios-tools/        — ToolBus, approval gates, risk scoring
  aios-workflows/    — WorkflowEngine, step execution, dead-letter
  aios-knowledge/    — RAG ingestion, trust scoring, hallucination guard
  aios-policy/       — Hierarchical rules engine (system→user)
  aios-security/     — Prompt injection detection, PII redaction
  aios-observability/— AIOSTracer (spans), QualityScorer
  aios-plugins/      — LLM provider abstraction (Anthropic, OpenAI)
  aios-audit/        — 65-control audit engine, certification ladder
  aios-sdk/          — createAIOS() bootstrap
apps/
  web/               — Next.js 14 app with REST API routes
src/
  agent/             — Guardrailed AI audit agent (Anthropic Claude)
  scoring/           — AIOS scoring engine + regional overlays
  reports/           — Gap/risk/roadmap report generators
  landing/           — Landing page HTML/CSS/JS
scripts/
  audit/run-audit.js — CLI audit runner
```

## Key Conventions

### Scoring Engine
- All control scores are integers 0–5; domain scores normalize to 0–100: `(rawScore / maxPossible) * 100`
- Overall score = weighted average across all active domains
- Domain 13 (AI Governance) weight = **12%** — highest single domain
- Regional overlay applies AFTER base score; compliance multiplier range: 0.85–1.0
- Never mutate the base score — always return a new object

### Certification Ladder
| Level | Min Score | Governance Gate |
|-------|-----------|-----------------|
| AIOS-L1 | 25 | — |
| AIOS-L2 | 38 | — |
| AIOS-L3 | 55 | Domain 13 ≥ 40 |
| AIOS-L4 | 70 | Domain 13 ≥ 60 |
| AIOS-L5 | 90 | Domain 13 ≥ 80 |

### AI Audit Agent
- Entry point: `src/agent/auditAgent.ts` → `AuditAgent.run(request, sessionId)`
- Session limit: 20 audits per session; daily limit: 100 per day
- System prompt is scope-locked — rejects instructions injected via `systemDescription`
- Model: `claude-opus-4-7` via `@anthropic-ai/sdk`

### Regional Compliance
- Region codes: `EU` `US` `UK` `SG` `CA` `GLOBAL`
- `GLOBAL` maps to ISO 42001
- Each overlay exports: `{ controls, weights, mandatoryGates, displayName, primaryLaw }`

### Frontend (Landing Page)
- CSS variables in `:root` — never hardcode colors
- Brand: `--black: #080A0C` · `--gold: #E8B84B` · `--cream: #EDE8DC`
- Fonts: Bebas Neue (display) · Crimson Pro (body) · IBM Plex Mono (mono)
- Vanilla JS only — no frameworks on the landing page
- Region tabs pass `this` to `showRegion(id, btn)` — do not rely on global `event`

### Package Architecture
- Add agents: `aios.agents.registry.register({ id, systemPrompt, tools, model })`
- Register tools: `aios.tools.bus.register(definition, handler)`; high-risk: `requiresApproval: true`
- Add policy rules: `aios.policy.evaluator.addRule({ id, domain, action, effect, conditions, priority })`
- Domain hierarchy: system → legal → org → workspace → workflow → user (default deny)
- Tracing: `aios.tracer.startTrace(name, service)` → root Span

## Skills

See `skills/SKILL.md` for the master skill index. When working on:
- **Scoring logic** → `SKILL-002: governance-scoring`
- **Agent** → `SKILL-001: audit-agent`
- **Gap analysis** → `SKILL-003: gap-analysis`

## Environment Variables

```
ANTHROPIC_API_KEY=          # Required for AI agent + Anthropic plugin
OPENAI_API_KEY=             # Optional, for OpenAI plugin
AIOS_AGENT_MAX_TOKENS=4096  # Default agent response length
AIOS_RATE_LIMIT_DAILY=100   # Audits per user per day
AIOS_RATE_LIMIT_SESSION=20  # Audits per session
AIOS_LOG_LEVEL=info         # Winston log level
PORT=3000                   # Express server port
DATABASE_URL=               # Postgres with pgvector
REDIS_URL=                  # Redis for queuing
```

## Key Commands

```bash
pnpm install                              # Install all dependencies
pnpm build                                # Build all packages
pnpm dev                                  # Start all in watch mode
pnpm test                                 # Run all tests
node scripts/audit/run-audit.js           # Text audit report
node scripts/audit/run-audit.js --format md --output docs/audit/latest.md
```
