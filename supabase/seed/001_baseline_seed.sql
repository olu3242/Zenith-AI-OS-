-- =============================================================================
-- ZENITH AI OS — Supabase Seed File
-- Seeds: Audit frameworks, default policy definitions, system-level roles
-- Run: psql < supabase/seed/001_baseline_seed.sql
-- =============================================================================

-- ─── System Organization ───────────────────────────────────────────────────

INSERT INTO organizations (id, name, slug, plan, status, metadata, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Zenith AI OS System',
  'system',
  'enterprise',
  'active',
  '{"type": "system", "internal": true}'::jsonb,
  NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- ─── System Roles ──────────────────────────────────────────────────────────

INSERT INTO roles (id, organization_id, name, description, permissions, created_at) VALUES
  ('role-owner', '00000000-0000-0000-0000-000000000001', 'owner', 'Full organization access', ARRAY['*'], NOW()),
  ('role-admin', '00000000-0000-0000-0000-000000000001', 'admin', 'Administrative access', ARRAY['org:manage','audit:*','agent:*','tool:*','workflow:*','knowledge:*','policy:*'], NOW()),
  ('role-developer', '00000000-0000-0000-0000-000000000001', 'developer', 'Developer access', ARRAY['agent:run','tool:invoke','workflow:trigger','knowledge:read','audit:read'], NOW()),
  ('role-auditor', '00000000-0000-0000-0000-000000000001', 'auditor', 'Audit-only access', ARRAY['audit:*','knowledge:read'], NOW()),
  ('role-viewer', '00000000-0000-0000-0000-000000000001', 'viewer', 'Read-only access', ARRAY['*:read'], NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── Audit Framework: AIOS-STANDARD-v1.0 ──────────────────────────────────

INSERT INTO audit_frameworks (id, name, version, description, is_default, created_at, updated_at) VALUES
  (
    'framework-aios-standard-v1',
    'AIOS-STANDARD',
    '1.0.0',
    'Zenith AI OS Standard Certification Framework — 12 domains, 60 controls',
    true,
    NOW(), NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ─── Audit Controls (60 across 12 domains) ────────────────────────────────

INSERT INTO audit_controls (id, framework_id, domain, name, description, weight, criticality, evaluation_guide, created_at) VALUES

-- Domain: Identity & Context (IC)
('ctrl-ic-01','framework-aios-standard-v1','identity_context','Tenant Identity Resolution','Organization and workspace correctly resolved per request with no cross-tenant bleed',1.0,'critical','Verify RLS policies. Run cross-tenant test: attempt to access org B data from org A session. Must return 0 rows.',NOW()),
('ctrl-ic-02','framework-aios-standard-v1','identity_context','User Role Resolution','User role resolved before every action; least privilege enforced',1.0,'high','Inspect RBAC middleware. Test with under-privileged role. Should return 403.',NOW()),
('ctrl-ic-03','framework-aios-standard-v1','identity_context','Context Propagation to AI','Context bundle propagated to all agent/tool/workflow calls; not re-fetched ad hoc',1.0,'high','Trace a single agent run. Verify context_bundle present in all downstream calls.',NOW()),
('ctrl-ic-04','framework-aios-standard-v1','identity_context','Context Snapshot Before Critical Actions','Context snapshotted before destructive or irreversible operations',0.8,'medium','Trigger a delete/update workflow. Check context_snapshots table for entry.',NOW()),
('ctrl-ic-05','framework-aios-standard-v1','identity_context','Context Freshness Validation','Stale or expired context items detected and flagged before use',0.8,'medium','Set a context item with expiry 10s ago. Run agent. Should detect staleness.',NOW()),

-- Domain: Memory (MEM)
('ctrl-mem-01','framework-aios-standard-v1','memory','Memory Types Implemented','Short-term, session, long-term, entity, and semantic memory types exist',1.0,'high','Check memory_items table for all 5 types. Create one of each. Verify storage.',NOW()),
('ctrl-mem-02','framework-aios-standard-v1','memory','Memory Permission Model','Memory items have visibility controls (private/workspace/org); enforced on retrieval',1.0,'critical','As user B, attempt to retrieve a private memory item owned by user A. Must fail.',NOW()),
('ctrl-mem-03','framework-aios-standard-v1','memory','Memory Audit Trail','All memory create/read/update/delete ops logged with user and timestamp',0.8,'high','Create a memory item. Check memory_audit_logs table for entry.',NOW()),
('ctrl-mem-04','framework-aios-standard-v1','memory','Semantic Search Over Memory','Vector similarity search works across memory items; results are tenant-scoped',1.0,'high','Embed a query. Confirm results from other orgs do not appear.',NOW()),
('ctrl-mem-05','framework-aios-standard-v1','memory','Memory Expiry and Pruning','Memory items can be set to expire; expired items pruned on schedule',0.6,'medium','Create item with 1min expiry. Run pruner. Item should be deleted.',NOW()),

-- Domain: Agent Orchestration (AGT)
('ctrl-agt-01','framework-aios-standard-v1','agent_orchestration','Agent Registry','All agents registered with explicit role, version, and capability declarations',1.0,'critical','List agents from registry. Every active agent must have role + capabilities defined.',NOW()),
('ctrl-agt-02','framework-aios-standard-v1','agent_orchestration','Agent Run Logging','Every agent run creates a logged record with input, output, status, tokens, cost',1.0,'critical','Trigger agent run. Check agent_runs table. Input, output, cost must be present.',NOW()),
('ctrl-agt-03','framework-aios-standard-v1','agent_orchestration','Agent Handoff Protocol','Agent-to-agent handoffs are explicit, logged, and use a defined data contract',0.8,'high','Trigger multi-agent workflow. Check agent_handoffs table for entries.',NOW()),
('ctrl-agt-04','framework-aios-standard-v1','agent_orchestration','Agent Retry and Fallback','Failing agents retry with backoff; fallback agent or user escalation exists',1.0,'high','Force agent failure. Confirm retry attempts logged. Confirm fallback triggered.',NOW()),
('ctrl-agt-05','framework-aios-standard-v1','agent_orchestration','Agent Cost Tracking','Token usage and USD cost tracked per run and aggregated per org/workspace',0.8,'medium','Run 10 agent calls. Query cost aggregation view. Sum must be non-zero.',NOW()),

-- Domain: Tool/Action Execution (TOOL)
('ctrl-tool-01','framework-aios-standard-v1','tool_execution','Tool Registry','All tools registered with schema, risk level, and required permissions',1.0,'critical','List tool definitions. Each must have inputSchema, riskLevel, permissions.',NOW()),
('ctrl-tool-02','framework-aios-standard-v1','tool_execution','Tool Input Validation','Tool inputs validated against schema before execution; invalid inputs rejected',1.0,'critical','Submit tool call with invalid input. Must return validation error, not execute.',NOW()),
('ctrl-tool-03','framework-aios-standard-v1','tool_execution','Tool Permission Check','Tool executions permission-checked against calling user role',0.8,'high','Call tool with unpermissioned user. Must return 403.',NOW()),
('ctrl-tool-04','framework-aios-standard-v1','tool_execution','Idempotency Support','Idempotent tools produce same result for same idempotency key within window',0.8,'medium','Call same tool twice with same idempotency key. Second call returns cached result.',NOW()),
('ctrl-tool-05','framework-aios-standard-v1','tool_execution','Tool Rollback Capability','High-risk tools have rollback handlers registered; rollback invocable post-execution',0.8,'high','Execute reversible tool. Call rollback. State must be restored.',NOW()),

-- Domain: Workflow Engine (WF)
('ctrl-wf-01','framework-aios-standard-v1','workflow_engine','Event-Driven Triggers','Workflows triggered by events, schedules, webhooks, and API calls',1.0,'high','Create event-triggered workflow. Fire event. Confirm run created.',NOW()),
('ctrl-wf-02','framework-aios-standard-v1','workflow_engine','Stateful Execution','Workflow state persisted between steps; resumable after pause or failure',1.0,'high','Pause workflow mid-run. Resume. Confirm state preserved across steps.',NOW()),
('ctrl-wf-03','framework-aios-standard-v1','workflow_engine','Dead-Letter Queue','Failed jobs sent to dead-letter queue; manual retry possible',0.8,'high','Force workflow failure. Check workflow_dead_letters table.',NOW()),
('ctrl-wf-04','framework-aios-standard-v1','workflow_engine','Retry Logic','Step-level retry with configurable backoff strategy',0.8,'medium','Configure 3-retry step. Force failure. Confirm 3 attempts logged.',NOW()),
('ctrl-wf-05','framework-aios-standard-v1','workflow_engine','Human Approval Step','Workflows can pause for human approval; approval logged with user and reason',1.0,'high','Trigger workflow with approval step. Approve/reject. Check workflow_approvals.',NOW()),

-- Domain: Knowledge Retrieval (KN)
('ctrl-kn-01','framework-aios-standard-v1','knowledge_retrieval','Source Registration and Trust','Knowledge sources registered with type, URI, and trust score',0.8,'medium','List knowledge_sources. Each must have trust_score and source_type.',NOW()),
('ctrl-kn-02','framework-aios-standard-v1','knowledge_retrieval','Tenant-Scoped Retrieval','Semantic retrieval returns only results belonging to requesting organization',1.0,'critical','As org A, query with a term known to exist only in org B knowledge. Must return 0.',NOW()),
('ctrl-kn-03','framework-aios-standard-v1','knowledge_retrieval','Provenance Tracking','Retrieved chunks include source name, type, trust score, and chunk index',0.8,'medium','Run retrieval. Confirm each result includes provenance metadata.',NOW()),
('ctrl-kn-04','framework-aios-standard-v1','knowledge_retrieval','Freshness Metadata','Sources have last_indexed_at; stale sources flagged for re-indexing',0.6,'low','Check knowledge_sources for last_indexed_at. Run freshness check.',NOW()),
('ctrl-kn-05','framework-aios-standard-v1','knowledge_retrieval','Hallucination Guardrails','LLM responses checked for grounding against retrieved context',1.0,'high','Pass response with invented fact. Grounding check must flag it.',NOW()),

-- Domain: Policy Engine (POL)
('ctrl-pol-01','framework-aios-standard-v1','policy_engine','Policy Definitions Exist','At least system-level baseline policy defined with explicit allow/deny rules',1.0,'critical','Check policy_definitions. System policy must exist and be enabled.',NOW()),
('ctrl-pol-02','framework-aios-standard-v1','policy_engine','Policy Evaluated Before Tool Execution','Policy check runs before every tool invocation; denied actions blocked',1.0,'critical','Set deny rule for a tool. Call tool. Must be blocked with reason.',NOW()),
('ctrl-pol-03','framework-aios-standard-v1','policy_engine','Decision Logging','All policy decisions logged with action, context, effect, and rule matches',1.0,'high','Trigger policy evaluation. Check decision_records table for entry.',NOW()),
('ctrl-pol-04','framework-aios-standard-v1','policy_engine','Human Override Mechanism','Humans can override denied decisions; overrides are logged with user and reason',0.8,'high','Trigger denial. Apply override. Check human_overrides table.',NOW()),
('ctrl-pol-05','framework-aios-standard-v1','policy_engine','Risk Scoring','Every policy decision includes a risk score 0–100',0.8,'medium','Evaluate a high-risk action. Confirm risk_score >= 75 in decision record.',NOW()),

-- Domain: Interface (IX)
('ctrl-ix-01','framework-aios-standard-v1','interface','AI Action Transparency','AI-triggered actions shown to user with clear attribution and status',0.8,'medium','Trigger AI action via UI. User must see action description and status.',NOW()),
('ctrl-ix-02','framework-aios-standard-v1','interface','Approval Modals for Risky Actions','High-risk actions require user confirmation before execution',0.8,'high','Trigger high-risk tool from UI. Confirmation modal must appear.',NOW()),
('ctrl-ix-03','framework-aios-standard-v1','interface','AI Error Visibility','AI failures surfaced to user with actionable message; not silent',0.8,'medium','Force agent failure. Confirm error shown in UI with description.',NOW()),
('ctrl-ix-04','framework-aios-standard-v1','interface','Progress Visibility','Long-running operations show progress; not indefinite spinners',0.6,'low','Trigger 10s workflow. Confirm progress indicator visible.',NOW()),
('ctrl-ix-05','framework-aios-standard-v1','interface','AI OS Scorecard View','Operators can view AI OS score and gap register from within the platform',0.8,'medium','Open audit dashboard. Score, band, and gap list must be visible.',NOW()),

-- Domain: Security (SEC)
('ctrl-sec-01','framework-aios-standard-v1','security_trust','RLS Enforced','Row-level security enforced on all tables; no cross-tenant row access',1.0,'critical','Run cross-tenant read test. Must return 0 rows.',NOW()),
('ctrl-sec-02','framework-aios-standard-v1','security_trust','Prompt Injection Detection','All user inputs scanned for injection patterns before LLM call',1.0,'critical','Submit known injection string. Must be blocked before LLM call.',NOW()),
('ctrl-sec-03','framework-aios-standard-v1','security_trust','Security Event Logging','Auth failures, permission denials, and anomalies logged to security_events',1.0,'high','Trigger failed login. Check security_events table for entry.',NOW()),
('ctrl-sec-04','framework-aios-standard-v1','security_trust','PII Controls in AI Pipeline','Sensitive fields masked before sent to LLM; PII not logged in plain text',1.0,'high','Submit record with SSN/email. Confirm logs show masked values.',NOW()),
('ctrl-sec-05','framework-aios-standard-v1','security_trust','API Key Rotation Support','API keys can be rotated; old keys invalidated immediately',0.8,'medium','Rotate API key. Old key must return 401 within 60 seconds.',NOW()),

-- Domain: Observability (OBS)
('ctrl-obs-01','framework-aios-standard-v1','observability','Distributed Tracing','Every agent/tool/workflow produces trace spans with timing and status',1.0,'critical','Run agent. Check traces table for span with duration_ms and status.',NOW()),
('ctrl-obs-02','framework-aios-standard-v1','observability','Token and Cost Metrics','Token usage and USD cost captured per trace and aggregable per org',0.8,'high','Run 5 LLM calls. Query cost aggregation. Non-zero total.',NOW()),
('ctrl-obs-03','framework-aios-standard-v1','observability','Failure Classification','AI failures classified by type (timeout, policy_denied, validation_error, etc.)',0.8,'high','Trigger 3 different failure types. Confirm different status values in traces.',NOW()),
('ctrl-obs-04','framework-aios-standard-v1','observability','Replay Capability','Failed runs can be replayed from stored state',0.8,'medium','Fail a workflow. Replay it. Confirm second run creates new run ID.',NOW()),
('ctrl-obs-05','framework-aios-standard-v1','observability','Alerting on Critical Failures','Critical AI failures trigger alerts to operators',0.8,'high','Trigger critical failure. Check reliability_alerts table for entry.',NOW()),

-- Domain: Extensibility (EXT)
('ctrl-ext-01','framework-aios-standard-v1','extensibility','Plugin System Exists','Plugin registry implemented; plugins can be registered and installed per org',0.8,'medium','List plugin_definitions. Install one. Invoke it.',NOW()),
('ctrl-ext-02','framework-aios-standard-v1','extensibility','Provider Abstraction','LLM provider abstracted behind interface; swap without codebase changes',1.0,'high','Switch from OpenAI plugin to Anthropic plugin. No code changes required.',NOW()),
('ctrl-ext-03','framework-aios-standard-v1','extensibility','SDK Available','Public SDK package exists with typed exports for all core modules',0.8,'medium','Import from @zenith/aios-sdk. All listed exports must resolve.',NOW()),
('ctrl-ext-04','framework-aios-standard-v1','extensibility','API Versioned','External APIs versioned (v1, v2); breaking changes do not affect older versions',0.6,'low','Call /api/v1 endpoint. Confirm version prefix in all routes.',NOW()),
('ctrl-ext-05','framework-aios-standard-v1','extensibility','Extension Points Documented','All extension points listed with schemas and examples in developer docs',0.6,'low','Check /docs/developer-guide. Plugin, tool, agent extension points documented.',NOW()),

-- Domain: Deployment (DEPLOY)
('ctrl-deploy-01','framework-aios-standard-v1','deployment','Local Dev Works','Platform runnable locally via docker-compose in under 10 minutes',0.8,'high','Run docker-compose up. App must be accessible at localhost:3000.',NOW()),
('ctrl-deploy-02','framework-aios-standard-v1','deployment','Deployment Docs Exist','Production deployment guide written for target platform',0.8,'medium','Check docs/deployment. Guide must cover DB migration, env vars, first run.',NOW()),
('ctrl-deploy-03','framework-aios-standard-v1','deployment','Env Template Exists','.env.example covers all required variables with descriptions',0.6,'medium','Check .env.example. All vars in use in codebase must be listed.',NOW()),
('ctrl-deploy-04','framework-aios-standard-v1','deployment','Self-Host Path Exists','Platform deployable on infrastructure other than default (Vercel/Supabase)',0.6,'low','Follow self-host guide. Deploy on VPS. App must be operational.',NOW()),
('ctrl-deploy-05','framework-aios-standard-v1','deployment','Standard Manifests Exist','AIOS manifest (aios.json), changelog, and contribution guide present',0.6,'low','Check root for aios.json, CHANGELOG.md, CONTRIBUTING.md.',NOW())

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ─── Default Policy: System Baseline ──────────────────────────────────────

INSERT INTO policy_definitions (id, organization_id, name, version, level, enabled, rules, created_at, updated_at) VALUES
(
  'policy-system-baseline-seed',
  NULL,
  'System Baseline Policy',
  '1.0.0',
  'system',
  true,
  '[
    {"id":"rule-deny-unauthenticated","name":"Deny unauthenticated","action":"*","condition":"!ctx.userId","effect":"deny","riskScore":100,"priority":1000},
    {"id":"rule-require-approval-critical","name":"Require approval for critical risk","action":"*","condition":"ctx.riskLevel === \"critical\"","effect":"require_approval","riskScore":90,"priority":900},
    {"id":"rule-block-injection","name":"Block injection-flagged inputs","action":"agent.execute","condition":"ctx.injectionDetected === true","effect":"deny","riskScore":100,"priority":950},
    {"id":"rule-allow-authenticated","name":"Allow authenticated users","action":"*","condition":"!!ctx.userId && !!ctx.orgId","effect":"allow","riskScore":0,"priority":1}
  ]'::jsonb,
  NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- ─── Built-in Tool Definitions ─────────────────────────────────────────────

INSERT INTO tool_definitions (id, organization_id, name, description, category, risk_level, input_schema, output_schema, permissions, created_at) VALUES
  ('tool-send-email', NULL, 'Send Email', 'Send an email to one or more recipients', 'communication', 'medium', '{"to":"string","subject":"string","body":"string"}'::jsonb, '{"messageId":"string"}'::jsonb, ARRAY['tool:email:send'], NOW()),
  ('tool-create-task', NULL, 'Create Task', 'Create a task and optionally assign it', 'workflow', 'low', '{"title":"string","assigneeId":"string"}'::jsonb, '{"taskId":"string"}'::jsonb, ARRAY['tool:task:create'], NOW()),
  ('tool-search-knowledge', NULL, 'Search Knowledge', 'Semantic knowledge base search', 'knowledge', 'low', '{"query":"string","limit":"number"}'::jsonb, '{"results":"array"}'::jsonb, ARRAY['knowledge:read'], NOW()),
  ('tool-run-audit', NULL, 'Run Audit', 'Trigger an AI OS audit run', 'governance', 'low', '{"frameworkId":"string"}'::jsonb, '{"runId":"string","score":"number"}'::jsonb, ARRAY['audit:run:create'], NOW()),
  ('tool-score-risk', NULL, 'Score Risk', 'Score the risk level of a proposed action', 'governance', 'low', '{"action":"string","context":"object"}'::jsonb, '{"score":"number","level":"string"}'::jsonb, ARRAY[], NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── Built-in Plugin Definitions ──────────────────────────────────────────

INSERT INTO plugin_definitions (id, name, description, version, category, entry_point, permissions, verified, created_at) VALUES
  ('openai-provider', 'OpenAI LLM Provider', 'Access OpenAI GPT models', '1.0.0', 'llm_provider', 'openai', ARRAY['llm:complete'], true, NOW()),
  ('anthropic-provider', 'Anthropic Claude Provider', 'Access Claude models', '1.0.0', 'llm_provider', 'anthropic', ARRAY['llm:complete'], true, NOW()),
  ('slack-notify', 'Slack Notification', 'Send Slack messages via webhook', '1.0.0', 'tool_extension', 'slack', ARRAY['tool:slack:send'], true, NOW()),
  ('audit-pdf-exporter', 'Audit PDF Exporter', 'Export audit reports as PDF', '1.0.0', 'audit_reporter', 'audit-pdf', ARRAY['audit:read'], true, NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── Done ──────────────────────────────────────────────────────────────────
SELECT 'Zenith AI OS seed complete — audit controls: ' || COUNT(*)::text FROM audit_controls;
