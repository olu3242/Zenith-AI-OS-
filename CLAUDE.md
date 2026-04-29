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
