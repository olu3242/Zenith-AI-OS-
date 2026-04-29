# ZENITH AI OS

**A reusable, multi-tenant, open-standard-ready AI Operating System.**

Build AI-native products with production-grade infrastructure: 13 modules, 60-control audit engine, built-in certification pathway, and a single `createAIOS(config)` bootstrap.

---

## What is an AI OS?

An AI OS is the infrastructure layer that sits between your product and AI capabilities. It handles:

- **Context:** Every AI request has a session context with tenant isolation, role, intent
- **Memory:** Short-term, session, long-term, entity, and semantic memory — all tenant-scoped
- **Agents:** Registered, versioned, audited agents with retry, fallback, and handoff
- **Tools:** Type-safe, permission-checked, risk-scored, approval-gated tool execution
- **Workflows:** Event-driven, stateful, queue-backed, with dead-letter handling
- **Knowledge:** RAG pipeline with provenance, trust scoring, and hallucination guardrails
- **Policy:** Hierarchical rules engine: system → legal → org → workspace → workflow → user
- **Security:** Prompt injection detection, RLS, PII controls, audit trails
- **Observability:** Distributed tracing, token cost, quality scores, replay
- **Plugins:** LLM provider abstraction, extensible tool ecosystem
- **Audit:** 60-control evaluation across 12 domains, maturity scoring, certification

Zenith AI OS is that infrastructure. Clone it, wire in your DB and LLM provider, and ship.

---

## AI OS Score

The platform includes a built-in audit engine. Run it any time:

```bash
node scripts/audit/run-audit.js
```

Output:
```
╔══════════════════════════════════════════════════════════════╗
║         ZENITH AI OS — AUDIT REPORT                         ║
╚══════════════════════════════════════════════════════════════╝

  Overall Score:    62.4 / 100
  Maturity Band:    Functional AI OS
  Certification:    AIOS-L3 — Operational AI OS
```

Each run scores 12 domains, identifies gaps, and shows the certification ladder.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js App  ·  REST API  ·  Webhooks  ·  n8n Workflows     │
└──────────────────────────────┬───────────────────────────────┘
                               │
              createAIOS(config) → aios.*
                               │
┌──────────┬──────────┬────────┴───┬──────────┬───────────────┐
│ context  │  memory  │   agents   │  tools   │  workflows    │
│ knowledge│  policy  │  security  │  tracer  │  plugins      │
│  audit   │   sdk    │            │          │               │
└──────────┴──────────┴────────────┴──────────┴───────────────┘
                               │
          Postgres (pgvector) + RLS  ·  Redis
```

---

## Quick Start

```bash
git clone https://github.com/your-org/zenith-aios
cd zenith-aios
cp .env.example .env        # Add ANTHROPIC_API_KEY + Supabase creds
docker-compose up -d        # Postgres + Redis + n8n
pnpm install && pnpm dev    # http://localhost:3000
```

---

## SDK Usage

```typescript
import { createAIOS } from '@zenith/aios-sdk';

const aios = await createAIOS({ organizationId, db, embedder, llmProvider });

// Run an agent
const result = await aios.agents.runner.run({
  agentId: 'lead-qualifier', organizationId, sessionId, userId,
  input: { task: 'Qualify this lead', leadData },
});

// Invoke a tool
await aios.tools.invoke({
  toolId: 'send_email', organizationId, sessionId, userId,
  input: { to: 'lead@company.com', subject: 'Follow-up', body: '...' },
});

// Trigger a workflow
await aios.workflows.trigger({
  workflowId: 'lead-intake', organizationId, userId, sessionId,
  input: { leadData },
});

// Semantic memory search
const memories = await aios.memory.search({
  query: 'Acme Corp deal history', organizationId, limit: 5,
});

// Policy evaluation
const decision = await aios.policy.evaluate('tool.invoke', { userId, orgId, riskLevel: 'high' });
if (!decision.allowed) throw new Error(decision.reason);
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Next.js API Routes, TypeScript, Zod |
| Database | Supabase Postgres 16 + pgvector |
| Queue | Redis |
| Automation | n8n |
| LLM Providers | Anthropic Claude, OpenAI (via plugin) |
| Monorepo | pnpm workspaces + Turborepo |
| Tests | Vitest |

---

## Module Reference

| Module | Package | Key Class |
|--------|---------|-----------|
| Context | `@zenith/aios-context` | `ContextService` |
| Memory | `@zenith/aios-memory` | `MemoryService` |
| Agents | `@zenith/aios-agents` | `AgentRunner`, `AgentRegistry` |
| Tools | `@zenith/aios-tools` | `ToolBus` |
| Workflows | `@zenith/aios-workflows` | `WorkflowEngine` |
| Knowledge | `@zenith/aios-knowledge` | `KnowledgeService` |
| Policy | `@zenith/aios-policy` | `PolicyEvaluator` |
| Security | `@zenith/aios-security` | `SecurityMiddleware` |
| Observability | `@zenith/aios-observability` | `AIOSTracer` |
| Plugins | `@zenith/aios-plugins` | `PluginRegistry` |
| Audit | `@zenith/aios-audit` | `AuditEngine` |
| SDK | `@zenith/aios-sdk` | `createAIOS` |

---

## Certification Levels

| Level | Threshold | Label |
|-------|-----------|-------|
| AIOS-L1 | ≥ 25 | AI Enabled App |
| AIOS-L2 | ≥ 38 | Workflow AI Platform |
| AIOS-L3 | ≥ 55 | Operational AI OS |
| AIOS-L4 | ≥ 70 | Enterprise AI OS |
| AIOS-L5 | ≥ 90 | Open Standard Reference |

---

## Examples

```bash
# CRM AI OS (lead qualification + email drafting + workflows)
node examples/crm-aios/index.js

# Run audit CLI
node scripts/audit/run-audit.js --format md --output audit.md
```

---

## Testing

```bash
pnpm test                   # All unit tests
pnpm test:integration       # Tenant isolation + integration tests
pnpm test:coverage          # With coverage report
```

---

## Documentation

| Doc | Path |
|-----|------|
| Architecture | `docs/architecture/ARCHITECTURE.md` |
| Deployment Guide | `docs/deployment/DEPLOYMENT.md` |
| Developer Guide | `docs/developer-guide/DEVELOPER_GUIDE.md` |
| Audit Output (Platform) | `docs/audit/AUDIT_WORKFLOW_OUTPUT.md` |
| Audit Output (CRM eval) | `docs/audit/AUDIT_WORKFLOW_OUTPUT_CRM_EVALUATION.md` |
| Gap Analysis | `docs/audit/GAP_ANALYSIS.md` |

---

## Claude Code Integration

The repo ships with a full CLAUDE.md orchestrator and 12 specialized agent sub-files:

```
@agents   — agent registry + runner tasks
@tools    — tool bus tasks
@audit    — scoring + certification
@security — injection detection + middleware
@policy   — rules engine
@obs      — tracing + metrics
@ux       — dashboard + UI
```

---

## License

MIT — built to be forked, extended, and shipped.

---

*Zenith AI OS — from audit score 38.7 to open-standard candidate, one domain at a time.*
