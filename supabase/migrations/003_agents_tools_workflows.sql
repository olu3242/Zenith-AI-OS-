-- ZENITH AI OS — Migration 003: Agents, Tools & Workflows

CREATE TYPE agent_status AS ENUM ('active','inactive','deprecated','testing');
CREATE TYPE agent_run_status AS ENUM ('queued','running','completed','failed','cancelled','paused');
CREATE TYPE tool_category AS ENUM ('communication','data','knowledge','workflow','security','ai','integration','audit');
CREATE TYPE workflow_status AS ENUM ('draft','active','paused','deprecated','archived');
CREATE TYPE workflow_run_status AS ENUM ('queued','running','completed','failed','cancelled','paused','waiting_approval');
CREATE TYPE risk_level AS ENUM ('low','medium','high','critical');

-- ============================================================
-- AGENTS
-- ============================================================
CREATE TABLE agent_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, slug TEXT NOT NULL, description TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  capabilities TEXT[] DEFAULT '{}', allowed_tools TEXT[] DEFAULT '{}',
  model TEXT, max_tokens INT DEFAULT 4000,
  is_system BOOLEAN DEFAULT FALSE, status agent_status DEFAULT 'active',
  config JSONB DEFAULT '{}', metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);
CREATE INDEX agent_defs_org_idx ON agent_definitions(organization_id);
ALTER TABLE agent_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_defs_tenant" ON agent_definitions FOR ALL
  USING (organization_id IS NULL OR organization_id = auth_organization_id());
CREATE TRIGGER agent_defs_updated_at BEFORE UPDATE ON agent_definitions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),
  agent_id UUID NOT NULL REFERENCES agent_definitions(id),
  triggered_by UUID REFERENCES users(id),
  workflow_run_id UUID, parent_run_id UUID,
  status agent_run_status DEFAULT 'queued',
  input JSONB DEFAULT '{}', output JSONB DEFAULT '{}',
  context_snapshot JSONB DEFAULT '{}',
  tokens_used INT DEFAULT 0, cost_usd FLOAT DEFAULT 0,
  error_message TEXT, error_code TEXT,
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX agent_runs_org_idx ON agent_runs(organization_id);
CREATE INDEX agent_runs_agent_idx ON agent_runs(agent_id);
CREATE INDEX agent_runs_status_idx ON agent_runs(status);
CREATE INDEX agent_runs_created_idx ON agent_runs(created_at DESC);
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_runs_tenant" ON agent_runs FOR ALL USING (organization_id = auth_organization_id());
CREATE TRIGGER agent_runs_updated_at BEFORE UPDATE ON agent_runs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE agent_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_number INT NOT NULL, step_type TEXT NOT NULL,
  input JSONB DEFAULT '{}', output JSONB DEFAULT '{}',
  tool_id UUID, tokens_used INT DEFAULT 0,
  duration_ms INT, error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX agent_run_steps_run_idx ON agent_run_steps(run_id);
ALTER TABLE agent_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_run_steps_tenant" ON agent_run_steps FOR ALL USING (organization_id = auth_organization_id());

CREATE TABLE agent_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_run_id UUID NOT NULL REFERENCES agent_runs(id),
  to_agent_id UUID NOT NULL REFERENCES agent_definitions(id),
  handoff_data JSONB DEFAULT '{}', reason TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE agent_handoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_handoffs_tenant" ON agent_handoffs FOR ALL USING (organization_id = auth_organization_id());

-- ============================================================
-- TOOLS
-- ============================================================
CREATE TABLE tool_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, slug TEXT NOT NULL,
  description TEXT, category tool_category DEFAULT 'integration',
  version TEXT NOT NULL DEFAULT '1.0.0',
  input_schema JSONB NOT NULL DEFAULT '{}', output_schema JSONB NOT NULL DEFAULT '{}',
  required_permissions TEXT[] DEFAULT '{}',
  risk_level risk_level DEFAULT 'low',
  requires_approval BOOLEAN DEFAULT FALSE,
  supports_dry_run BOOLEAN DEFAULT FALSE,
  is_idempotent BOOLEAN DEFAULT TRUE,
  is_system BOOLEAN DEFAULT FALSE, is_active BOOLEAN DEFAULT TRUE,
  timeout_ms INT DEFAULT 30000, max_retries INT DEFAULT 3,
  config JSONB DEFAULT '{}', metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE tool_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tool_defs_tenant" ON tool_definitions FOR ALL
  USING (organization_id IS NULL OR organization_id = auth_organization_id());
CREATE TRIGGER tool_defs_updated_at BEFORE UPDATE ON tool_definitions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tool_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tool_definitions(id),
  agent_run_id UUID REFERENCES agent_runs(id),
  invoked_by UUID REFERENCES users(id),
  idempotency_key TEXT UNIQUE,
  input JSONB DEFAULT '{}', output JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  risk_score FLOAT DEFAULT 0, approval_required BOOLEAN DEFAULT FALSE,
  approved_by UUID REFERENCES users(id), approved_at TIMESTAMPTZ,
  is_dry_run BOOLEAN DEFAULT FALSE,
  error_message TEXT, duration_ms INT,
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX tool_invocations_org_idx ON tool_invocations(organization_id);
CREATE INDEX tool_invocations_tool_idx ON tool_invocations(tool_id);
CREATE INDEX tool_invocations_idempotency_idx ON tool_invocations(idempotency_key);
ALTER TABLE tool_invocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tool_invocations_tenant" ON tool_invocations FOR ALL USING (organization_id = auth_organization_id());
CREATE TRIGGER tool_invocations_updated_at BEFORE UPDATE ON tool_invocations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE action_rollback_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invocation_id UUID NOT NULL REFERENCES tool_invocations(id),
  rollback_action TEXT NOT NULL, rollback_data JSONB DEFAULT '{}',
  initiated_by UUID REFERENCES users(id),
  status TEXT DEFAULT 'pending', completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE action_rollback_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rollback_logs_tenant" ON action_rollback_logs FOR ALL USING (organization_id = auth_organization_id());

-- ============================================================
-- WORKFLOWS
-- ============================================================
CREATE TABLE workflow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),
  name TEXT NOT NULL, slug TEXT NOT NULL,
  description TEXT, version TEXT NOT NULL DEFAULT '1.0.0',
  status workflow_status DEFAULT 'draft',
  trigger_type TEXT NOT NULL, trigger_config JSONB DEFAULT '{}',
  definition JSONB NOT NULL DEFAULT '{}',
  sla_minutes INT, retry_limit INT DEFAULT 3,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);
CREATE INDEX workflow_defs_org_idx ON workflow_definitions(organization_id);
ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_defs_tenant" ON workflow_definitions FOR ALL USING (organization_id = auth_organization_id());
CREATE TRIGGER workflow_defs_updated_at BEFORE UPDATE ON workflow_definitions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflow_definitions(id),
  idempotency_key TEXT UNIQUE,
  status workflow_run_status DEFAULT 'queued',
  input JSONB DEFAULT '{}', output JSONB DEFAULT '{}',
  current_step TEXT, retry_count INT DEFAULT 0,
  triggered_by UUID REFERENCES users(id), triggered_by_event TEXT,
  sla_deadline_at TIMESTAMPTZ, sla_breached BOOLEAN DEFAULT FALSE,
  error_message TEXT, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX workflow_runs_org_idx ON workflow_runs(organization_id);
CREATE INDEX workflow_runs_status_idx ON workflow_runs(status);
CREATE INDEX workflow_runs_idempotency_idx ON workflow_runs(idempotency_key);
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_runs_tenant" ON workflow_runs FOR ALL USING (organization_id = auth_organization_id());
CREATE TRIGGER workflow_runs_updated_at BEFORE UPDATE ON workflow_runs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE workflow_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_run_id UUID REFERENCES workflow_runs(id),
  event_type TEXT NOT NULL, payload JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending', priority INT DEFAULT 5,
  retry_count INT DEFAULT 0, max_retries INT DEFAULT 3,
  next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  locked_by TEXT, locked_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX workflow_queue_status_priority_idx ON workflow_queue(status, priority, next_attempt_at);
CREATE INDEX workflow_queue_org_idx ON workflow_queue(organization_id);
ALTER TABLE workflow_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_queue_tenant" ON workflow_queue FOR ALL USING (organization_id = auth_organization_id());
CREATE TRIGGER workflow_queue_updated_at BEFORE UPDATE ON workflow_queue FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE workflow_dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  original_queue_id UUID, event_type TEXT, payload JSONB DEFAULT '{}',
  failure_reason TEXT, retry_history JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE workflow_dead_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_dead_letters_tenant" ON workflow_dead_letters FOR ALL USING (organization_id = auth_organization_id());

CREATE TABLE workflow_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id),
  step_id TEXT NOT NULL, requested_by UUID REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  decision TEXT, decision_reason TEXT,
  decided_by UUID REFERENCES users(id), decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE workflow_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_approvals_tenant" ON workflow_approvals FOR ALL USING (organization_id = auth_organization_id());
CREATE TRIGGER workflow_approvals_updated_at BEFORE UPDATE ON workflow_approvals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
