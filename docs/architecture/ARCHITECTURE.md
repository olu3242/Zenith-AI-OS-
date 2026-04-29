# ZENITH AI OS — Architecture Document

## Overview

Zenith AI OS is a **multi-tenant, open-standard-ready AI Operating System** built on Next.js 14+, TypeScript, Supabase (Postgres + pgvector), and Tailwind CSS. It provides a complete, reusable infrastructure layer for building AI-native products with 13 production-grade modules.

---

## Architecture Principles

**1. Tenant-First Isolation**
Every table has `organization_id`. Row-Level Security (RLS) is enforced at the database layer — not the application layer. A bug in the app cannot leak data between tenants.

**2. Modular Monorepo**
Each AI OS module lives in its own package under `/packages`. The SDK (`@zenith/aios-sdk`) re-exports everything with a single `createAIOS(config)` bootstrap function.

**3. Audit-by-Default**
Every mutating operation emits an audit log entry. The audit engine runs independently — it evaluates the platform against 60 controls across 12 domains without modifying data.

**4. Policy Before Execution**
No agent or tool executes without passing through the PolicyEvaluator. This is architectural — callers cannot bypass it without monkey-patching the ToolBus or AgentRunner.

**5. Observable Everything**
Every agent run, tool call, and workflow step produces a trace span. Traces are persisted to Postgres with token cost and quality scores.

---

## System Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  Next.js App (apps/web)  ·  REST API  ·  Webhook Endpoints      │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│                      AIOS SDK SURFACE                            │
│  createAIOS(config) → { context, memory, agents, tools,          │
│                          workflows, knowledge, policy,            │
│                          security, tracer, plugins }             │
└──┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────────────┘
   │    │    │    │    │    │    │    │    │    │    │
   ▼    ▼    ▼    ▼    ▼    ▼    ▼    ▼    ▼    ▼    ▼
  CTX MEM AGT TOOL  WF  KN  POL  IX  SEC OBS PLG
   │    │    │    │    │    │    │    │    │    │    │
└──┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────────────┐
│                      DATA LAYER                                  │
│  Supabase Postgres (pgvector) + RLS  ·  Redis (queue/cache)     │
└──────────────────────────────────────────────────────────────────┘
```

---

## Package Map

| Package | Purpose | Key Export |
|---------|---------|-----------|
| `@zenith/aios-core` | Shared types, error classes | Types |
| `@zenith/aios-context` | Session context management | `ContextService` |
| `@zenith/aios-memory` | Memory fabric (short/long/semantic) | `MemoryService` |
| `@zenith/aios-agents` | Agent registry + execution | `AgentRunner`, `AgentRegistry` |
| `@zenith/aios-tools` | Tool bus + approval gates | `ToolBus` |
| `@zenith/aios-workflows` | Event-driven workflow engine | `WorkflowEngine` |
| `@zenith/aios-knowledge` | RAG + knowledge management | `KnowledgeService` |
| `@zenith/aios-policy` | Policy rules engine | `PolicyEvaluator` |
| `@zenith/aios-security` | Security middleware | `SecurityMiddleware` |
| `@zenith/aios-observability` | Distributed tracing | `AIOSTracer` |
| `@zenith/aios-plugins` | Plugin registry | `PluginRegistry` |
| `@zenith/aios-audit` | 60-control audit engine | `AuditEngine` |
| `@zenith/aios-sdk` | Public API surface | `createAIOS` |

---

## Database Schema Summary

All tables live in the `public` schema. Every table:
- Has `organization_id UUID NOT NULL REFERENCES organizations(id)`
- Has RLS enabled with `CREATE POLICY "tenant_isolation" ON table FOR ALL USING (organization_id = auth_organization_id())`
- Has `created_at TIMESTAMPTZ DEFAULT NOW()`

### Core Tables

| Migration | Tables Created |
|-----------|---------------|
| `001_tenancy_identity` | organizations, workspaces, users, roles, memberships, api_keys, service_accounts |
| `002_context_memory` | context_sessions, context_items, context_snapshots, memory_items, memory_embeddings, memory_summaries |
| `003_agents_tools` | agent_definitions, agent_runs, agent_run_steps, agent_handoffs, tool_definitions, tool_invocations, action_rollback_logs |
| `004_workflows_knowledge` | workflow_definitions, workflow_runs, workflow_queue, workflow_dead_letters, workflow_approvals, knowledge_sources, knowledge_chunks, retrieval_queries |
| `005_policy_security_observability` | policy_definitions, policy_rules, decision_records, human_overrides, security_events, prompt_injection_events, traces, reliability_alerts, replay_sessions |
| `006_audit_certification` | audit_frameworks, audit_controls, audit_runs, audit_findings, audit_gap_register, certification_results, remediation_items, plugin_definitions, plugin_installations |

---

## Request Flow

### Agent Execution

```
Request → SecurityMiddleware.verifyTenantIsolation()
        → SecurityMiddleware.scanForInjection()
        → ContextService.resolve()
        → PolicyEvaluator.evaluate('agent.execute', ctx)
        → [if denied] → throw PolicyDeniedError
        → [if approval required] → pause + notify
        → AgentRunner.run(input)
          → AIOSTracer.startSpan('agent.run')
          → LLMProvider.complete(...)
          → [on success] → AuditLogger.log('AGENT_RUN_COMPLETED')
          → AIOSTracer.end(result)
        → Return AgentRunResult
```

### Tool Invocation

```
ToolBus.invoke(invocation)
  → Check idempotency key (if provided)
  → PermissionService.hasPermission() for each required permission
  → PolicyEvaluator.evaluate('tool.invoke', ctx) → riskScore
  → [if critical risk] → pause for approval
  → [if dry run] → return dry_run result
  → Execute handler with timeout + retries
  → Persist result + save idempotency key
  → AuditLogger.log('TOOL_INVOKED')
```

---

## Audit Engine

The `AuditEngine` runs independently — it never modifies data, only reads and scores.

**Scoring model:**
- Each control scored 0–5: `0=Missing, 1=Ad-hoc, 2=Partial, 3=Functional, 4=Production-grade, 5=Standard-ready`
- Domain score = average of 5 controls × 20 (normalized to 0–100)
- Overall score = Σ(domain_score × domain_weight)

**Maturity bands:**
```
0–25    AI-Enabled Application
25–45   Emerging AI Platform
45–65   Functional AI OS
65–80   Advanced AI OS
80–90   Standard-Ready AI OS
90–100  Open Standard Candidate
```

**Certification levels:**
```
AIOS-L1  ≥25   AI Enabled App
AIOS-L2  ≥38   Workflow AI Platform
AIOS-L3  ≥55   Operational AI OS
AIOS-L4  ≥70   Enterprise AI OS
AIOS-L5  ≥90   Open Standard Reference Implementation
```

---

## Security Model

1. **Authentication:** Supabase Auth (JWT). All requests carry a valid JWT.
2. **Authorization:** RBAC via `roles` + `memberships` tables. Checked in SecurityMiddleware.
3. **Tenant Isolation:** Postgres RLS — no application-level workaround possible.
4. **Prompt Injection:** Pattern-matched before every LLM call. Blocked and logged.
5. **PII Controls:** `SecurityMiddleware.maskPII()` called before all logging.
6. **API Keys:** Hashed with SHA-256. Only hash stored in DB.
7. **Audit Trail:** Immutable `audit_logs` table — no UPDATE or DELETE permitted by RLS.

---

## Extensibility

**Adding a new tool:**
```typescript
const aios = await createAIOS(config);
aios.tools.register(
  { id: 'my-tool', name: 'My Tool', category: 'utility', riskLevel: 'low', ... },
  async (input, ctx) => ({ result: 'done' })
);
```

**Adding an LLM provider:**
```typescript
const aios = await createAIOS(config);
aios.plugins.register(
  { id: 'groq-provider', category: 'llm_provider', ... },
  async (input, config) => ({ response: await groq.complete(input) })
);
await aios.plugins.install({ pluginId: 'groq-provider', organizationId: orgId, ... });
```

**Adding a workflow:**
```typescript
aios.workflows.define({
  id: 'my-workflow', organizationId: orgId, triggerType: 'event',
  firstStepId: 'step-1',
  steps: [
    { id: 'step-1', type: 'tool_call', config: { toolId: 'my-tool' }, nextStepId: 'step-end', ... },
    { id: 'step-end', type: 'end', config: {}, ... },
  ],
});
```
