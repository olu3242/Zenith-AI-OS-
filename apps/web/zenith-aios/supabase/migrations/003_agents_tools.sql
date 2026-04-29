-- ============================================================
-- Zenith AI OS — Migration 003: Agents & Tools
-- ============================================================

CREATE TYPE agent_status AS ENUM ('active','inactive','deprecated','testing');
CREATE TYPE agent_run_status AS ENUM ('queued','running','completed','failed','cancelled','paused','awaiting_approval');
CREATE TYPE tool_status AS ENUM ('active','inactive','deprecated','testing');
CREATE TYPE tool_invocation_status AS ENUM ('pending','running','completed','failed','rolled_back','approval_required');
CREATE TYPE risk_level AS ENUM ('low','medium','high','critical');

-- ============================================================
-- AGENT DEFINITIONS
-- ============================================================
CREATE TABLE agent_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  role TEXT NOT NULL,
  model_provider TEXT NOT NULL DEFAULT 'anthropic',
  model_name TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  system_prompt TEXT,
  capabilities TEXT[] DEFAULT '{}',
  allowed_tools TEXT[] DEFAULT '{}',
  max_tokens INTEGER DEFAULT 4096,
  temperature FLOAT DEFAULT 0.7,
  risk_level risk_level NOT NULL DEFAULT 'low',
  requires_approval BOOLEAN DEFAULT FALSE,
  is_system BOOLEAN DEFAULT FALSE,
  status agent_status NOT NULL DEFAULT 'active',
  config JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);
CREATE INDEX idx_agent_defs_org ON agent_definitions(organization_id);
CREATE INDEX idx_agent_defs_status ON agent_definitions(status);
ALTER TABLE agent_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON agent_definitions FOR ALL USING (organization_id = current_org_id());
CREATE POLICY "system_agents_global" ON agent_definitions FOR SELECT USING (is_system = TRUE);
CREATE TRIGGER trg_agent_defs_updated BEFORE UPDATE ON agent_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- AGENT RUNS
-- ============================================================
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),
  agent_id UUID NOT NULL REFERENCES agent_definitions(id),
  context_session_id UUID REFERENCES context_sessions(id),
  workflow_run_id UUID,
  status agent_run_status NOT NULL DEFAULT 'queued',
  input JSONB NOT NULL DEFAULT '{}',
  output JSONB,
  error_message TEXT,
  error_code TEXT,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  cost_usd DECIMAL(10,6) DEFAULT 0,
  duration_ms INTEGER,
  retry_count INTEGER DEFAULT 0,
  parent_run_id UUID REFERENCES agent_runs(id),
  triggered_by TEXT NOT NULL DEFAULT 'user',
  triggered_by_id UUID,
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agent_runs_org ON agent_runs(organization_id);
CREATE INDEX idx_agent_runs_agent ON agent_runs(agent_id);
CREATE INDEX idx_agent_runs_status ON agent_runs(status);
CREATE INDEX idx_agent_runs_created ON agent_runs(created_at DESC);
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON agent_runs FOR ALL USING (organization_id = current_org_id());
CREATE TRIGGER trg_agent_runs_updated BEFORE UPDATE ON agent_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- AGENT RUN STEPS (detailed trace)
-- ============================================================
CREATE TABLE agent_run_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  input JSONB,
  output JSONB,
  tool_name TEXT,
  tool_call_id TEXT,
  tokens_used INTEGER DEFAULT 0,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agent_steps_run ON agent_run_steps(agent_run_id);
ALTER TABLE agent_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON agent_run_steps FOR ALL USING (organization_id = current_org_id());

-- ============================================================
-- AGENT HANDOFFS
-- ============================================================
CREATE TABLE agent_handoffs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_run_id UUID NOT NULL REFERENCES agent_runs(id),
  to_agent_id UUID NOT NULL REFERENCES agent_definitions(id),
  reason TEXT NOT NULL,
  context_transfer JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agent_handoffs_org ON agent_handoffs(organization_id);
ALTER TABLE agent_handoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON agent_handoffs FOR ALL USING (organization_id = current_org_id());

-- ============================================================
-- TOOL DEFINITIONS
-- ============================================================
CREATE TABLE tool_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  input_schema JSONB NOT NULL DEFAULT '{}',
  output_schema JSONB NOT NULL DEFAULT '{}',
  risk_level risk_level NOT NULL DEFAULT 'low',
  requires_approval BOOLEAN DEFAULT FALSE,
  is_idempotent BOOLEAN DEFAULT TRUE,
  supports_dry_run BOOLEAN DEFAULT FALSE,
  supports_rollback BOOLEAN DEFAULT FALSE,
  timeout_ms INTEGER DEFAULT 30000,
  max_retries INTEGER DEFAULT 3,
  is_system BOOLEAN DEFAULT FALSE,
  status tool_status NOT NULL DEFAULT 'active',
  config JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);
CREATE INDEX idx_tool_defs_org ON tool_definitions(organization_id);
CREATE INDEX idx_tool_defs_category ON tool_definitions(category);
ALTER TABLE tool_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON tool_definitions FOR ALL USING (organization_id = current_org_id());
CREATE POLICY "system_tools_global" ON tool_definitions FOR SELECT USING (is_system = TRUE);
CREATE TRIGGER trg_tool_defs_updated BEFORE UPDATE ON tool_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TOOL INVOCATIONS
-- ============================================================
CREATE TABLE tool_invocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),
  tool_id UUID NOT NULL REFERENCES tool_definitions(id),
  agent_run_id UUID REFERENCES agent_runs(id),
  idempotency_key TEXT UNIQUE,
  status tool_invocation_status NOT NULL DEFAULT 'pending',
  input JSONB NOT NULL DEFAULT '{}',
  output JSONB,
  error_message TEXT,
  risk_score FLOAT DEFAULT 0,
  is_dry_run BOOLEAN DEFAULT FALSE,
  retry_count INTEGER DEFAULT 0,
  duration_ms INTEGER,
  invoked_by TEXT NOT NULL DEFAULT 'agent',
  invoked_by_id UUID,
  rolled_back_at TIMESTAMPTZ,
  rollback_reason TEXT,
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tool_invocations_org ON tool_invocations(organization_id);
CREATE INDEX idx_tool_invocations_tool ON tool_invocations(tool_id);
CREATE INDEX idx_tool_invocations_status ON tool_invocations(status);
CREATE INDEX idx_tool_invocations_idempotency ON tool_invocations(idempotency_key);
ALTER TABLE tool_invocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON tool_invocations FOR ALL USING (organization_id = current_org_id());
CREATE TRIGGER trg_tool_invocations_updated BEFORE UPDATE ON tool_invocations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ACTION APPROVALS (human-in-the-loop gates)
-- ============================================================
CREATE TABLE action_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  action_id UUID NOT NULL,
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  decision_note TEXT,
  expires_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_action_approvals_org ON action_approvals(organization_id);
CREATE INDEX idx_action_approvals_status ON action_approvals(status);
ALTER TABLE action_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON action_approvals FOR ALL USING (organization_id = current_org_id());
CREATE TRIGGER trg_action_approvals_updated BEFORE UPDATE ON action_approvals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
