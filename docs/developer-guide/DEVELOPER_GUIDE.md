# ZENITH AI OS — Developer Guide

## Getting Started

### Install

```bash
pnpm install
cp .env.example .env
# fill in DB and API keys
docker-compose up -d postgres redis
pnpm run dev
```

### Monorepo Structure

```
zenith-aios/
├── apps/
│   └── web/                    # Next.js 14 dashboard + API
├── packages/
│   ├── aios-core/              # Shared types and errors
│   ├── aios-context/           # Context session management
│   ├── aios-memory/            # Memory fabric
│   ├── aios-agents/            # Agent runner + registry
│   ├── aios-tools/             # Tool bus + approval gates
│   ├── aios-workflows/         # Workflow engine
│   ├── aios-knowledge/         # Knowledge + RAG
│   ├── aios-policy/            # Policy rules engine
│   ├── aios-security/          # Security middleware
│   ├── aios-observability/     # Distributed tracing
│   ├── aios-plugins/           # Plugin registry
│   ├── aios-audit/             # 60-control audit engine
│   └── aios-sdk/               # Public SDK surface
├── supabase/
│   ├── migrations/             # Ordered SQL migrations
│   └── seed/                   # Seed data
├── tests/
│   ├── unit/                   # Vitest unit tests
│   ├── integration/            # DB integration tests
│   ├── security/               # Security-specific tests
│   └── audit/                  # Audit engine tests
├── docs/
│   ├── architecture/
│   ├── deployment/
│   └── developer-guide/
├── examples/                   # Sample AI OS implementations
├── scripts/
│   └── audit/                  # CLI audit runner
├── .claude/agents/             # CLAUDE.md agent sub-files
├── CLAUDE.md                   # Claude Code orchestrator
├── docker-compose.yml
└── turbo.json
```

---

## Quick SDK Usage

```typescript
import { createAIOS } from '@zenith/aios-sdk';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

const aios = await createAIOS({
  organizationId: 'your-org-id',
  db: {
    query: (sql, params) => supabase.rpc('raw_query', { sql, params }),
  },
  embedder: {
    embed: async (text) => {
      // Use OpenAI embeddings, local model, etc.
      const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text });
      return res.data[0].embedding;
    },
  },
  llmProvider: {
    complete: async ({ model, systemPrompt, messages, maxTokens, temperature }) => {
      const res = await anthropic.messages.create({
        model, max_tokens: maxTokens,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role as 'user', content: m.content })),
      });
      return { content: res.content[0].type === 'text' ? res.content[0].text : '', tokensUsed: res.usage.input_tokens + res.usage.output_tokens };
    },
  },
});

// Run an agent
const result = await aios.agents.runner.run({
  agentId: 'my-agent-id',
  organizationId: 'your-org-id',
  sessionId: 'session-uuid',
  userId: 'user-uuid',
  input: { task: 'Qualify this lead', leadData: { name: 'Acme Corp', revenue: '$5M' } },
});

// Invoke a tool
const toolResult = await aios.tools.invoke({
  toolId: 'send_email',
  organizationId: 'your-org-id',
  sessionId: 'session-uuid',
  userId: 'user-uuid',
  input: { to: 'lead@acme.com', subject: 'Follow-up', body: 'Hi there...' },
});

// Search memory
const memories = await aios.memory.search({
  query: 'Acme Corp deal history',
  organizationId: 'your-org-id',
  limit: 5,
});

// Evaluate a policy
const decision = await aios.policy.evaluate('tool.invoke', { userId: 'u1', orgId: 'o1', riskLevel: 'high' });
if (!decision.allowed) throw new Error(decision.reason);
```

---

## Adding a New Agent

1. Define the agent in the registry:

```typescript
aios.agents.registry.register({
  id: 'lead-qualifier',
  organizationId: 'your-org-id',
  name: 'Lead Qualifier',
  role: 'orchestrator',
  version: '1.0.0',
  capabilities: [{
    name: 'qualify_lead',
    description: 'Score and qualify a sales lead',
    inputSchema: { leadData: 'object' },
    outputSchema: { score: 'number', recommendation: 'string' },
  }],
  systemPrompt: `You are a lead qualification specialist. Analyze the provided lead data
    and return a JSON object with: score (0-100), tier (hot/warm/cold), and recommendation.`,
  model: 'claude-sonnet-4-20250514',
  maxTokens: 1024,
  temperature: 0.2,
  maxRetries: 3,
  timeoutMs: 30000,
  requiresApproval: false,
  sandboxed: true,
});
```

2. Run it:

```typescript
const result = await aios.agents.runner.run({
  agentId: 'lead-qualifier',
  organizationId: orgId,
  sessionId, userId,
  input: { leadData: { company: 'Acme', revenue: '$5M', employees: 50 } },
});
```

---

## Adding a New Tool

```typescript
import type { ToolDefinition, ToolHandler } from '@zenith/aios-sdk';

const def: ToolDefinition = {
  id: 'update-crm-record',
  organizationId: 'your-org-id',
  name: 'Update CRM Record',
  description: 'Update a CRM deal or contact record',
  version: '1.0.0',
  category: 'data',
  riskLevel: 'high',
  requiresApproval: true,          // Always ask before writing
  idempotent: false,
  timeoutMs: 10000,
  maxRetries: 1,
  inputSchema: { recordId: 'string', fields: 'object' },
  outputSchema: { updated: 'boolean', record: 'object' },
  permissions: ['crm:record:write'],
};

const handler: ToolHandler = async (input, ctx) => {
  // Your implementation here
  return { updated: true, record: { id: input.recordId, ...input.fields } };
};

const rollback: RollbackHandler = async (invocationId, ctx) => {
  // Restore previous state from invocation log
};

aios.tools.register(def, handler, rollback);
```

---

## Writing a Workflow

```typescript
aios.workflows.define({
  id: 'lead-nurture-workflow',
  organizationId: orgId,
  name: 'Lead Nurture Workflow',
  version: '1.0.0',
  triggerType: 'event',
  triggerConfig: { event: 'lead.created' },
  firstStepId: 'step-qualify',
  steps: [
    {
      id: 'step-qualify',
      name: 'Qualify Lead',
      type: 'agent_call',
      config: { agentId: 'lead-qualifier' },
      onSuccessStepId: 'step-check-score',
      onFailureStepId: 'step-escalate',
      retries: 2, timeoutMs: 30000, requiresApproval: false,
    },
    {
      id: 'step-check-score',
      name: 'Check Lead Score',
      type: 'condition',
      config: { expression: 'ctx["step-qualify"]?.score >= 70' },
      onSuccessStepId: 'step-send-hot-email',
      onFailureStepId: 'step-send-nurture-email',
      retries: 0, timeoutMs: 1000, requiresApproval: false,
    },
    {
      id: 'step-send-hot-email',
      name: 'Send Hot Lead Email',
      type: 'tool_call',
      config: { toolId: 'send_email' },
      nextStepId: 'step-end',
      retries: 2, timeoutMs: 10000, requiresApproval: false,
    },
    {
      id: 'step-send-nurture-email',
      name: 'Send Nurture Email',
      type: 'tool_call',
      config: { toolId: 'send_email' },
      nextStepId: 'step-end',
      retries: 2, timeoutMs: 10000, requiresApproval: false,
    },
    {
      id: 'step-escalate',
      name: 'Escalate to Human',
      type: 'approval',
      config: {},
      nextStepId: 'step-end',
      retries: 0, timeoutMs: 86400000, requiresApproval: true,
    },
    { id: 'step-end', name: 'Complete', type: 'end', config: {}, retries: 0, timeoutMs: 1000, requiresApproval: false },
  ],
});

// Trigger it
await aios.workflows.trigger({
  workflowId: 'lead-nurture-workflow',
  organizationId: orgId, userId, sessionId,
  input: { leadId: 'lead_abc', leadData: { company: 'Acme', email: 'ceo@acme.com' } },
});
```

---

## Running Tests

```bash
pnpm run test              # All unit tests
pnpm run test:unit         # Unit tests only
pnpm run test:integration  # Integration tests (requires DB)
pnpm run test:security     # Security-focused tests
pnpm run test:audit        # Audit engine tests
pnpm run test:coverage     # With coverage report
```

---

## Running the Audit CLI

```bash
# Default demo run
node scripts/audit/run-audit.js

# With custom domain scores
node scripts/audit/run-audit.js --scores "policy_engine:10,observability:20"

# Save as Markdown
node scripts/audit/run-audit.js --format md --output ./my-audit.md

# Full JSON output
node scripts/audit/run-audit.js --format json --output ./audit.json
```

---

## Extension Points

| Extension Point | How to Extend |
|----------------|--------------|
| New AI agent | `aios.agents.registry.register(def)` |
| New tool | `aios.tools.register(def, handler, rollback?)` |
| New workflow | `aios.workflows.define(workflow)` |
| New knowledge source | `aios.knowledge.registerSource(source)` |
| New policy | `aios.policy.registerPolicy(policy)` |
| New plugin | `aios.plugins.register(manifest, handler)` |
| New LLM provider | Register as `llm_provider` plugin |
| New audit control | Seed via `audit_controls` table |

---

## Claude Code Integration

This repo is optimized for Claude Code. The `CLAUDE.md` orchestrator at the root routes tasks to specialized agent sub-files:

- `@context` — Context system tasks
- `@agents` — Agent registry + runner tasks
- `@tools` — Tool bus tasks
- `@workflows` — Workflow engine tasks
- `@audit` — Audit engine + scoring tasks
- `@security` — Security middleware + injection detection
- `@observability` — Tracing + metrics tasks
- `@policy` — Policy rules engine tasks
- `@knowledge` — Knowledge management tasks
- `@plugins` — Plugin registry tasks
- `@ux` — Dashboard + UI tasks
- `@arch` — Architecture + DB schema tasks

Usage in Claude Code:
```
@audit run the audit CLI and show me gaps for the staging org
@security add rate limiting to the /api/agents/run endpoint
@workflows build a customer onboarding workflow with approval step
```
