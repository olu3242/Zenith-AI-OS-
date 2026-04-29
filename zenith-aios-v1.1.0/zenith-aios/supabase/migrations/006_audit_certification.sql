-- ============================================================
-- Zenith AI OS — Migration 006: Audit & Certification Engine
-- ============================================================

CREATE TYPE audit_run_status AS ENUM ('draft','in_progress','completed','exported');
CREATE TYPE finding_severity AS ENUM ('info','low','medium','high','critical');
CREATE TYPE gap_type AS ENUM ('structural','operational','governance','security','data','reliability','experience','portability','standardization');
CREATE TYPE lapse_type AS ENUM ('design','execution','policy','context','memory','tooling','workflow','observability','human_oversight');
CREATE TYPE cert_level AS ENUM ('AIOS-L1','AIOS-L2','AIOS-L3','AIOS-L4','AIOS-L5','uncertified');
CREATE TYPE maturity_band AS ENUM ('ai_enabled_app','emerging_ai_platform','functional_ai_os','advanced_ai_os','standard_ready_ai_os','open_standard_reference');

-- ============================================================
-- AUDIT FRAMEWORKS
-- ============================================================
CREATE TABLE audit_frameworks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  description TEXT,
  is_system BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  domain_count INTEGER DEFAULT 12,
  total_controls INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_audit_frameworks_updated BEFORE UPDATE ON audit_frameworks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- AUDIT DOMAINS
-- ============================================================
CREATE TABLE audit_domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  framework_id UUID NOT NULL REFERENCES audit_frameworks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  weight FLOAT NOT NULL DEFAULT 0.083,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_domains_framework ON audit_domains(framework_id);

-- ============================================================
-- AUDIT CONTROLS (seeded default controls)
-- ============================================================
CREATE TABLE audit_controls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES audit_domains(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  expected_standard TEXT NOT NULL,
  evidence_required TEXT NOT NULL,
  scoring_guidance JSONB NOT NULL DEFAULT '{}',
  risk_if_missing TEXT NOT NULL,
  remediation_guidance TEXT NOT NULL,
  weight FLOAT NOT NULL DEFAULT 1.0,
  severity finding_severity NOT NULL DEFAULT 'medium',
  is_required BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_controls_domain ON audit_controls(domain_id);

-- ============================================================
-- AUDIT RUNS
-- ============================================================
CREATE TABLE audit_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  framework_id UUID NOT NULL REFERENCES audit_frameworks(id),
  name TEXT NOT NULL,
  target_system TEXT NOT NULL DEFAULT 'self',
  status audit_run_status NOT NULL DEFAULT 'draft',
  overall_score FLOAT,
  maturity_band maturity_band,
  certification_level cert_level DEFAULT 'uncertified',
  domain_scores JSONB DEFAULT '{}',
  summary TEXT,
  audited_by UUID REFERENCES users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_runs_org ON audit_runs(organization_id);
CREATE INDEX idx_audit_runs_status ON audit_runs(status);
ALTER TABLE audit_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON audit_runs FOR ALL USING (organization_id = current_org_id());
CREATE TRIGGER trg_audit_runs_updated BEFORE UPDATE ON audit_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- AUDIT FINDINGS (per control)
-- ============================================================
CREATE TABLE audit_findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  control_id UUID NOT NULL REFERENCES audit_controls(id),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 5),
  evidence TEXT,
  notes TEXT,
  gap_type gap_type,
  lapse_type lapse_type,
  severity finding_severity NOT NULL DEFAULT 'medium',
  is_gap BOOLEAN DEFAULT FALSE,
  is_lapse BOOLEAN DEFAULT FALSE,
  remediation_priority INTEGER DEFAULT 3,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_findings_run ON audit_findings(run_id);
CREATE INDEX idx_audit_findings_control ON audit_findings(control_id);
ALTER TABLE audit_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON audit_findings FOR ALL USING (organization_id = current_org_id());
CREATE TRIGGER trg_audit_findings_updated BEFORE UPDATE ON audit_findings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- GAP REGISTER
-- ============================================================
CREATE TABLE audit_gap_register (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES audit_runs(id),
  finding_id UUID REFERENCES audit_findings(id),
  domain_name TEXT NOT NULL,
  control_name TEXT NOT NULL,
  gap_type gap_type NOT NULL,
  severity finding_severity NOT NULL,
  description TEXT NOT NULL,
  impact TEXT,
  risk_score FLOAT DEFAULT 0,
  recommended_action TEXT,
  effort_estimate TEXT,
  timeline TEXT,
  owner UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open',
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_gap_register_org ON audit_gap_register(organization_id);
CREATE INDEX idx_gap_register_run ON audit_gap_register(run_id);
ALTER TABLE audit_gap_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON audit_gap_register FOR ALL USING (organization_id = current_org_id());
CREATE TRIGGER trg_gap_register_updated BEFORE UPDATE ON audit_gap_register FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- LAPSE REGISTER
-- ============================================================
CREATE TABLE audit_lapse_register (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES audit_runs(id),
  finding_id UUID REFERENCES audit_findings(id),
  domain_name TEXT NOT NULL,
  control_name TEXT NOT NULL,
  lapse_type lapse_type NOT NULL,
  severity finding_severity NOT NULL,
  description TEXT NOT NULL,
  root_cause TEXT,
  risk_score FLOAT DEFAULT 0,
  corrective_action TEXT,
  preventive_action TEXT,
  owner UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open',
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_lapse_register_org ON audit_lapse_register(organization_id);
CREATE INDEX idx_lapse_register_run ON audit_lapse_register(run_id);
ALTER TABLE audit_lapse_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON audit_lapse_register FOR ALL USING (organization_id = current_org_id());
CREATE TRIGGER trg_lapse_register_updated BEFORE UPDATE ON audit_lapse_register FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CERTIFICATION RESULTS
-- ============================================================
CREATE TABLE certification_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES audit_runs(id),
  level cert_level NOT NULL,
  score FLOAT NOT NULL,
  maturity_band maturity_band NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  certificate_number TEXT UNIQUE,
  is_self_certified BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cert_results_org ON certification_results(organization_id);
ALTER TABLE certification_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON certification_results FOR ALL USING (organization_id = current_org_id());

-- ============================================================
-- REMEDIATION ITEMS (30/60/90 day roadmap)
-- ============================================================
CREATE TABLE remediation_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES audit_runs(id),
  finding_id UUID REFERENCES audit_findings(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 3,
  phase TEXT NOT NULL DEFAULT '30day',
  effort_days INTEGER,
  impact_score_delta FLOAT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'backlog',
  assigned_to UUID REFERENCES users(id),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_remediation_org ON remediation_items(organization_id);
CREATE INDEX idx_remediation_run ON remediation_items(run_id);
CREATE INDEX idx_remediation_phase ON remediation_items(phase);
ALTER TABLE remediation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON remediation_items FOR ALL USING (organization_id = current_org_id());
CREATE TRIGGER trg_remediation_updated BEFORE UPDATE ON remediation_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
