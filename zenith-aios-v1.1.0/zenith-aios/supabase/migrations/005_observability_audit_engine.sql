-- ZENITH AI OS — Migration 005: Observability & Audit Engine

-- ============================================================
-- OBSERVABILITY / TELEMETRY
-- ============================================================
CREATE TABLE traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trace_id TEXT NOT NULL UNIQUE, parent_trace_id TEXT,
  name TEXT NOT NULL, type TEXT NOT NULL,
  status TEXT DEFAULT 'in_progress',
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(), end_time TIMESTAMPTZ,
  duration_ms INT, tokens_used INT DEFAULT 0, cost_usd FLOAT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX traces_org_idx ON traces(organization_id);
CREATE INDEX traces_trace_id_idx ON traces(trace_id);
CREATE INDEX traces_created_idx ON traces(created_at DESC);
ALTER TABLE traces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "traces_tenant" ON traces FOR ALL USING (organization_id = auth_organization_id());

CREATE TABLE trace_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trace_id TEXT NOT NULL, span_id TEXT NOT NULL UNIQUE,
  parent_span_id TEXT, name TEXT NOT NULL, type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(), end_time TIMESTAMPTZ, duration_ms INT,
  input JSONB DEFAULT '{}', output JSONB DEFAULT '{}',
  error_message TEXT, metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX trace_steps_trace_idx ON trace_steps(trace_id);
CREATE INDEX trace_steps_span_idx ON trace_steps(span_id);
ALTER TABLE trace_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trace_steps_tenant" ON trace_steps FOR ALL USING (organization_id = auth_organization_id());

CREATE TABLE telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, source TEXT NOT NULL,
  value FLOAT, unit TEXT, labels JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX telemetry_org_created_idx ON telemetry_events(organization_id, created_at DESC);
CREATE INDEX telemetry_type_idx ON telemetry_events(event_type);
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "telemetry_tenant" ON telemetry_events FOR ALL USING (organization_id = auth_organization_id());

CREATE TABLE reliability_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL, description TEXT,
  threshold_value FLOAT, actual_value FLOAT,
  is_resolved BOOLEAN DEFAULT FALSE, resolved_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ, metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE reliability_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_tenant" ON reliability_alerts FOR ALL USING (organization_id = auth_organization_id());

CREATE TABLE replay_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  original_trace_id TEXT NOT NULL, replay_trace_id TEXT,
  replay_mode TEXT DEFAULT 'shadow', status TEXT DEFAULT 'pending',
  diff_summary JSONB DEFAULT '{}',
  initiated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE replay_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "replay_sessions_tenant" ON replay_sessions FOR ALL USING (organization_id = auth_organization_id());
CREATE TRIGGER replay_sessions_updated_at BEFORE UPDATE ON replay_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- AI OS AUDIT ENGINE (CORE)
-- ============================================================
CREATE TYPE audit_domain AS ENUM (
  'identity_context','memory_state','agent_orchestration','tool_execution',
  'workflow_automation','knowledge_retrieval','policy_decisioning',
  'interface_experience','security_governance','observability_reliability',
  'interoperability_extensibility','deployment_portability'
);

CREATE TYPE control_severity AS ENUM ('critical','major','moderate','minor','informational');
CREATE TYPE gap_type AS ENUM ('structural','operational','governance','security','data','reliability','experience','portability','standardization');
CREATE TYPE lapse_type AS ENUM ('design','execution','policy','context','memory','tooling','workflow','observability','human_oversight');
CREATE TYPE certification_level AS ENUM ('AIOS_L1','AIOS_L2','AIOS_L3','AIOS_L4','AIOS_L5');
CREATE TYPE maturity_band AS ENUM ('ai_enabled_app','emerging_platform','functional_aios','advanced_aios','standard_ready_aios','open_standard_candidate');

CREATE TABLE audit_frameworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, version TEXT NOT NULL DEFAULT '1.0.0',
  description TEXT, is_system BOOLEAN DEFAULT FALSE, is_active BOOLEAN DEFAULT TRUE,
  domains TEXT[] DEFAULT '{}', total_controls INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE audit_frameworks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_frameworks_tenant" ON audit_frameworks FOR ALL
  USING (organization_id IS NULL OR organization_id = auth_organization_id());
CREATE TRIGGER audit_frameworks_updated_at BEFORE UPDATE ON audit_frameworks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE audit_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id UUID NOT NULL REFERENCES audit_frameworks(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  domain audit_domain NOT NULL, control_code TEXT NOT NULL,
  name TEXT NOT NULL, description TEXT,
  expected_standard TEXT NOT NULL, evidence_required TEXT,
  scoring_guidance TEXT NOT NULL, risk_if_missing TEXT,
  remediation_guidance TEXT,
  weight FLOAT NOT NULL DEFAULT 1.0, severity control_severity NOT NULL DEFAULT 'moderate',
  is_automated BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_controls_domain_idx ON audit_controls(domain);
CREATE INDEX audit_controls_framework_idx ON audit_controls(framework_id);
ALTER TABLE audit_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_controls_tenant" ON audit_controls FOR ALL
  USING (organization_id IS NULL OR organization_id = auth_organization_id());
CREATE TRIGGER audit_controls_updated_at BEFORE UPDATE ON audit_controls FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  framework_id UUID NOT NULL REFERENCES audit_frameworks(id),
  target_system TEXT NOT NULL DEFAULT 'self',
  status TEXT NOT NULL DEFAULT 'draft',
  overall_score FLOAT, maturity_band maturity_band, certification_level certification_level,
  domain_scores JSONB DEFAULT '{}', gap_count INT DEFAULT 0, lapse_count INT DEFAULT 0,
  critical_gap_count INT DEFAULT 0, critical_lapse_count INT DEFAULT 0,
  executive_summary TEXT, final_verdict TEXT,
  audit_period_start TIMESTAMPTZ, audit_period_end TIMESTAMPTZ,
  conducted_by UUID REFERENCES users(id),
  completed_at TIMESTAMPTZ, metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_runs_org_idx ON audit_runs(organization_id);
CREATE INDEX audit_runs_status_idx ON audit_runs(status);
ALTER TABLE audit_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_runs_tenant" ON audit_runs FOR ALL USING (organization_id = auth_organization_id());
CREATE TRIGGER audit_runs_updated_at BEFORE UPDATE ON audit_runs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE audit_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  audit_run_id UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  control_id UUID NOT NULL REFERENCES audit_controls(id),
  domain audit_domain NOT NULL,
  score INT NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 5),
  evidence_provided TEXT, score_rationale TEXT,
  gap_detected BOOLEAN DEFAULT FALSE, gap_type gap_type,
  gap_description TEXT,
  lapse_detected BOOLEAN DEFAULT FALSE, lapse_type lapse_type,
  lapse_description TEXT,
  remediation_priority TEXT DEFAULT 'medium',
  remediation_notes TEXT,
  reviewed_by UUID REFERENCES users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_findings_run_idx ON audit_findings(audit_run_id);
CREATE INDEX audit_findings_domain_idx ON audit_findings(domain);
CREATE INDEX audit_findings_gap_idx ON audit_findings(gap_detected);
ALTER TABLE audit_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_findings_tenant" ON audit_findings FOR ALL USING (organization_id = auth_organization_id());
CREATE TRIGGER audit_findings_updated_at BEFORE UPDATE ON audit_findings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE audit_gap_register (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  audit_run_id UUID NOT NULL REFERENCES audit_runs(id),
  finding_id UUID REFERENCES audit_findings(id),
  gap_type gap_type NOT NULL, domain audit_domain NOT NULL,
  title TEXT NOT NULL, description TEXT,
  severity control_severity NOT NULL, risk_impact TEXT,
  status TEXT DEFAULT 'open',
  target_resolution_date DATE, resolved_at TIMESTAMPTZ,
  owner_id UUID REFERENCES users(id),
  remediation_plan TEXT, metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX gap_register_org_idx ON audit_gap_register(organization_id);
CREATE INDEX gap_register_run_idx ON audit_gap_register(audit_run_id);
ALTER TABLE audit_gap_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gap_register_tenant" ON audit_gap_register FOR ALL USING (organization_id = auth_organization_id());
CREATE TRIGGER gap_register_updated_at BEFORE UPDATE ON audit_gap_register FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE audit_lapse_register (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  audit_run_id UUID NOT NULL REFERENCES audit_runs(id),
  finding_id UUID REFERENCES audit_findings(id),
  lapse_type lapse_type NOT NULL, domain audit_domain NOT NULL,
  title TEXT NOT NULL, description TEXT,
  severity control_severity NOT NULL,
  status TEXT DEFAULT 'open',
  detected_at TIMESTAMPTZ DEFAULT NOW(), resolved_at TIMESTAMPTZ,
  owner_id UUID REFERENCES users(id),
  remediation_notes TEXT, metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE audit_lapse_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lapse_register_tenant" ON audit_lapse_register FOR ALL USING (organization_id = auth_organization_id());
CREATE TRIGGER lapse_register_updated_at BEFORE UPDATE ON audit_lapse_register FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE certification_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  audit_run_id UUID NOT NULL REFERENCES audit_runs(id),
  certification_level certification_level NOT NULL,
  overall_score FLOAT NOT NULL, maturity_band maturity_band NOT NULL,
  is_certified BOOLEAN NOT NULL DEFAULT FALSE,
  certification_date TIMESTAMPTZ, expiry_date TIMESTAMPTZ,
  standardization_readiness_score FLOAT,
  open_standard_candidate BOOLEAN DEFAULT FALSE,
  report_url TEXT, metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE certification_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cert_results_tenant" ON certification_results FOR ALL USING (organization_id = auth_organization_id());

CREATE TABLE remediation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  audit_run_id UUID REFERENCES audit_runs(id),
  gap_id UUID REFERENCES audit_gap_register(id), lapse_id UUID REFERENCES audit_lapse_register(id),
  title TEXT NOT NULL, description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium', effort TEXT,
  phase TEXT, roadmap_slot TEXT,
  status TEXT DEFAULT 'backlog',
  assigned_to UUID REFERENCES users(id), due_date DATE, completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX remediation_items_org_idx ON remediation_items(organization_id);
ALTER TABLE remediation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "remediation_items_tenant" ON remediation_items FOR ALL USING (organization_id = auth_organization_id());
CREATE TRIGGER remediation_items_updated_at BEFORE UPDATE ON remediation_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- PLUGINS
-- ============================================================
CREATE TABLE plugin_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0', author TEXT,
  manifest JSONB NOT NULL DEFAULT '{}',
  required_permissions TEXT[] DEFAULT '{}',
  extension_points TEXT[] DEFAULT '{}',
  is_verified BOOLEAN DEFAULT FALSE, is_active BOOLEAN DEFAULT TRUE,
  install_count INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX plugin_defs_slug_idx ON plugin_definitions(slug);
ALTER TABLE plugin_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plugin_defs_tenant" ON plugin_definitions FOR ALL
  USING (organization_id IS NULL OR organization_id = auth_organization_id());
CREATE TRIGGER plugin_defs_updated_at BEFORE UPDATE ON plugin_definitions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE plugin_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plugin_id UUID NOT NULL REFERENCES plugin_definitions(id),
  installed_by UUID REFERENCES users(id),
  granted_permissions TEXT[] DEFAULT '{}', config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE plugin_installations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plugin_installations_tenant" ON plugin_installations FOR ALL USING (organization_id = auth_organization_id());
CREATE TRIGGER plugin_installations_updated_at BEFORE UPDATE ON plugin_installations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
