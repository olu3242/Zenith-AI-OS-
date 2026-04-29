-- ============================================================
-- Zenith AI OS — Migration 005: Policy, Security & Observability
-- ============================================================

CREATE TYPE decision_status AS ENUM ('approved','denied','escalated','expired','overridden');
CREATE TYPE security_event_severity AS ENUM ('info','low','medium','high','critical');

-- ============================================================
-- POLICY DEFINITIONS
-- ============================================================
CREATE TABLE policy_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  scope TEXT NOT NULL DEFAULT 'organization',
  priority INTEGER DEFAULT 100,
  rules JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT TRUE,
  version INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);
CREATE INDEX idx_policy_defs_org ON policy_definitions(organization_id);
ALTER TABLE policy_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON policy_definitions FOR ALL USING (organization_id = current_org_id());
CREATE TRIGGER trg_policy_defs_updated BEFORE UPDATE ON policy_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- DECISION RECORDS
-- ============================================================
CREATE TABLE decision_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES policy_definitions(id),
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  action TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  status decision_status NOT NULL,
  risk_score FLOAT DEFAULT 0,
  reasoning TEXT,
  overridden_by UUID REFERENCES users(id),
  override_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_decision_records_org ON decision_records(organization_id);
CREATE INDEX idx_decision_records_subject ON decision_records(subject_type, subject_id);
CREATE INDEX idx_decision_records_created ON decision_records(created_at DESC);
ALTER TABLE decision_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON decision_records FOR ALL USING (organization_id = current_org_id());

-- ============================================================
-- AUDIT LOGS (immutable append-only)
-- ============================================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),
  actor_id UUID,
  actor_type TEXT NOT NULL DEFAULT 'user',
  actor_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  ip_address INET,
  user_agent TEXT,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
-- No UPDATE/DELETE policies — audit logs are immutable
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON audit_logs FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY "tenant_insert" ON audit_logs FOR INSERT WITH CHECK (organization_id = current_org_id());

-- ============================================================
-- SECURITY EVENTS
-- ============================================================
CREATE TABLE security_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  severity security_event_severity NOT NULL DEFAULT 'info',
  description TEXT NOT NULL,
  actor_id UUID REFERENCES users(id),
  resource_type TEXT,
  resource_id TEXT,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  context JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_security_events_org ON security_events(organization_id);
CREATE INDEX idx_security_events_severity ON security_events(severity);
CREATE INDEX idx_security_events_created ON security_events(created_at DESC);
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON security_events FOR ALL USING (organization_id = current_org_id());

-- ============================================================
-- PROMPT INJECTION EVENTS
-- ============================================================
CREATE TABLE prompt_injection_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_run_id UUID REFERENCES agent_runs(id),
  tool_invocation_id UUID REFERENCES tool_invocations(id),
  input_text TEXT NOT NULL,
  detected_patterns TEXT[] DEFAULT '{}',
  confidence_score FLOAT DEFAULT 0,
  action_taken TEXT NOT NULL DEFAULT 'blocked',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_prompt_injection_org ON prompt_injection_events(organization_id);
ALTER TABLE prompt_injection_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON prompt_injection_events FOR ALL USING (organization_id = current_org_id());

-- ============================================================
-- TELEMETRY / TRACES
-- ============================================================
CREATE TABLE telemetry_traces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trace_id UUID NOT NULL,
  span_id UUID NOT NULL DEFAULT uuid_generate_v4(),
  parent_span_id UUID,
  trace_type TEXT NOT NULL,
  name TEXT NOT NULL,
  actor_type TEXT,
  actor_id UUID,
  status TEXT NOT NULL DEFAULT 'success',
  duration_ms INTEGER,
  model_provider TEXT,
  model_name TEXT,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  cost_usd DECIMAL(10,8) DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX idx_traces_org ON telemetry_traces(organization_id);
CREATE INDEX idx_traces_trace_id ON telemetry_traces(trace_id);
CREATE INDEX idx_traces_type ON telemetry_traces(trace_type);
CREATE INDEX idx_traces_started ON telemetry_traces(started_at DESC);
ALTER TABLE telemetry_traces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON telemetry_traces FOR ALL USING (organization_id = current_org_id());

-- ============================================================
-- COST METRICS
-- ============================================================
CREATE TABLE cost_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),
  period_date DATE NOT NULL,
  model_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  tokens_input BIGINT DEFAULT 0,
  tokens_output BIGINT DEFAULT 0,
  total_requests INTEGER DEFAULT 0,
  total_cost_usd DECIMAL(12,6) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, workspace_id, period_date, model_provider, model_name)
);
CREATE INDEX idx_cost_metrics_org ON cost_metrics(organization_id);
CREATE INDEX idx_cost_metrics_date ON cost_metrics(period_date DESC);
ALTER TABLE cost_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON cost_metrics FOR ALL USING (organization_id = current_org_id());
