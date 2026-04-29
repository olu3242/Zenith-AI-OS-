# CHANGELOG

## [1.0.0] — 2025-Q2

### Added
- 13-module AI OS architecture
- 60-control audit engine across 12 domains
- AIOS-L1 through AIOS-L5 certification pathway
- Multi-tenant Postgres with pgvector and full RLS
- ContextService with session management and conflict detection
- MemoryService with semantic search and permission model
- AgentRunner with registry, retry, fallback, and handoff
- ToolBus with schema validation, approval gates, idempotency, and rollback
- WorkflowEngine with event queue, DLQ, pause/resume, and approval steps
- KnowledgeService with RAG, provenance tracking, and hallucination guardrails
- PolicyEvaluator with hierarchical rules (system → org → user)
- SecurityMiddleware with prompt injection detection and PII masking
- AIOSTracer with distributed spans, cost tracking, and replay sessions
- PluginRegistry with Anthropic, OpenAI, Slack, and audit exporter plugins
- Dashboard UI with module status, score rings, and certification panel
- CLI audit runner with text, Markdown, and JSON output
- CRM example demonstrating full AIOS workflow
- Docker Compose local stack
- Comprehensive README, architecture, deployment, and developer docs
- Supabase seed with 60 audit controls, default policies, and built-in tools

### Security
- Prompt injection detection with 10 pattern categories
- Tenant isolation verified in all modules
- PII masking in audit logs
- API key hashing (SHA-256)

### Initial Score
- Overall: 62.4 / 100 (Functional AI OS, AIOS-L3)
- Strongest: Security (82), Identity/Context (78)
- Gaps identified: Extensibility (28), Observability (35)
