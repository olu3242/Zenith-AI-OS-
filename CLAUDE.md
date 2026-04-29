# CLAUDE.md — Zenith AI OS

## Project Overview

This is the **Zenith AI OS** codebase — an open-standard audit and certification framework for production AI systems (AIOS-STANDARD-v1.1). It includes a landing page, scoring engine, regional governance overlays, and a guardrailed AI audit agent.

## Commit Format

All commits must follow:
```
ZA-XXX: Short imperative description
```
Examples:
- `ZA-001: Add EU AI Act mandatory controls to governance overlay`
- `ZA-042: Fix Policy Engine weight calculation in aggregator`
- `ZA-103: Update landing page FAQ section with regional compliance questions`

## Architecture

```
src/
├── agent/          # Guardrailed AI audit agent (Anthropic Claude)
├── scoring/        # AIOS scoring engine + regional overlays
├── reports/        # Gap/risk/roadmap report generators
└── landing/        # Landing page HTML/CSS/JS
```

## Key Conventions

### Scoring Engine
- All control scores are integers 0–5
- Domain scores normalize to 0–100 scale: `(rawScore / maxPossible) * 100`
- Overall score = weighted average across all active domains
- Governance domain (Domain 13) weight = 12% — highest single domain
- Regional overlay applies AFTER base score is calculated
- Never mutate the base score — always return a new object

### AI Agent
- Agent MUST import guardrails before any API call: `import { validateInput, validateOutput } from './guardrails.js'`
- System prompt lives in `src/agent/prompts.js` — do not inline it
- All agent responses must pass output guardrail before returning to user
- Log all guardrail rejections to Winston logger with level `warn`
- Session limit: 20 questions per session
- Daily limit: 100 questions per user (rate-limiter-flexible)

### Regional Compliance
- Region codes are ISO 3166-1 alpha-2: `EU`, `US`, `GB`, `SG`, `CA`
- `GLOBAL` maps to ISO 42001
- Each region module exports: `{ controls, weights, mandatoryGates, displayName, primaryLaw }`
- Compliance multiplier range: 0.85–1.0 (never below 0.85 regardless of failures)

### Frontend (Landing Page)
- CSS variables defined in `:root` — never hardcode colors
- Brand palette: `--black: #080A0C`, `--gold: #E8B84B`, `--cream: #EDE8DC`
- Fonts: Bebas Neue (display), Crimson Pro (body), IBM Plex Mono (mono)
- No external JS frameworks — vanilla JS only for the landing page
- FAQ section uses accordion pattern with `data-faq-index` attributes

## Environment Variables

```
ANTHROPIC_API_KEY=          # Required for AI agent
AIOS_AGENT_MAX_TOKENS=1000  # Default agent response length
AIOS_RATE_LIMIT_DAILY=100   # Questions per user per day
AIOS_RATE_LIMIT_SESSION=20  # Questions per session
AIOS_LOG_LEVEL=info         # Winston log level
PORT=3000                   # Express server port
```

## Testing

```bash
npm test                    # Run all tests
npm run test:coverage       # Coverage report
```

Test files live alongside source: `src/scoring/aios-standard.test.js`

## Skills

See `.claude/skills/SKILL.md` for the master skill index. When working on:
- **Scoring logic** → use `governance-scoring.md`
- **Agent** → use `audit-agent.md`
- **Gap analysis** → use `gap-analysis.md`
# Zenith AI OS — Claude Orchestrator

This repository is a multi-tenant AI Operating System. Use this file to orient yourself.

## Repository Structure

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
  aios-audit/        — 60-control audit engine, certification ladder
  aios-sdk/          — createAIOS() bootstrap
apps/
  web/               — Next.js 14 app with REST API routes
scripts/
  audit/run-audit.js — CLI audit runner
examples/
  crm-aios/          — CRM lead qualification example
```

## Specialized Agent Tasks

### @agents — Agent registry + runner
- Add new agents: `aios.agents.registry.register({ id, systemPrompt, tools, model })`
- Debug runs: check `AgentRunResult.iterations` and `tokenUsage`

### @tools — Tool bus
- Register tools: `aios.tools.bus.register(definition, handler)`
- High-risk tools: set `requiresApproval: true` and wire an `ApprovalGate`

### @audit — Scoring + certification
- Run: `node scripts/audit/run-audit.js`
- To improve score: implement controls listed under `report.gaps`
- Certification ladder: L1 (25) → L2 (38) → L3 (55) → L4 (70) → L5 (90)

### @security — Injection detection + middleware
- `SecurityMiddleware.process(input, context)` returns `{allowed, processed, auditEntry}`
- Tune `maxRiskScore` in config to tighten/loosen threshold

### @policy — Rules engine
- Add rules: `aios.policy.evaluator.addRule({ id, domain, action, effect, conditions, priority })`
- Domain hierarchy: system → legal → org → workspace → workflow → user
- Default deny: any unmatched action is denied

### @obs — Tracing + metrics
- `aios.tracer.startTrace(name, service)` → returns root Span
- `aios.tracer.getMetrics(traceId)` → token cost + error count

### @ux — Dashboard
- App entry: `apps/web/src/app/page.tsx`
- API routes: `apps/web/src/app/api/`

## Key Commands

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages
pnpm dev              # Start all in watch mode
pnpm test             # Run all tests
node scripts/audit/run-audit.js          # Text audit report
node scripts/audit/run-audit.js --format md --output docs/audit/latest.md
```

## Environment

Copy `.env.example` to `.env` and fill in:
- `ANTHROPIC_API_KEY` — required for Anthropic plugin
- `OPENAI_API_KEY` — optional, for OpenAI plugin
- `DATABASE_URL` — Postgres with pgvector
- `REDIS_URL` — Redis for queuing
