-- ZENITH AI OS — Migration 004: Knowledge, Policy & Security

-- ============================================================
-- KNOWLEDGE / RETRIEVAL
-- ============================================================
CREATE TABLE knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),
  name TEXT NOT NULL, type TEXT NOT NULL,
  description TEXT, source_url TEXT, file_path TEXT,
  trust_score FLOAT DEFAULT 0.8 CHECK (trust_score >= 0 AND trust_score <= 1),
  is_active BOOLEAN DEFAULT TRUE,
  last_ingested_at TIMESTAMPTZ, document_count INT DEFAULT 0, chunk_count INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX knowledge_sources_org_idx ON knowledge_sources(organization_id);
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_sources_tenant" ON knowledge_sources FOR ALL USING (organization_id = auth_organization_id());
CREATE TRIGGER knowledge_sources_updated_at BEFORE UPDATE ON knowledge_sources FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  content TEXT NOT NULL, chunk_index INT NOT NULL,
  document_title TEXT, document_url TEXT,
  char_count INT, token_count INT,
  freshness_date TIMESTAMPTZ, trust_score FLOAT DEFAULT 0.8,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX knowledge_chunks_source_idx ON knowledge_chunks(source_id);
CREATE INDEX knowledge_chunks_org_idx ON knowledge_chunks(organization_id);
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_chunks_tenant" ON knowledge_chunks FOR ALL USING (organization_id = auth_organization_id());

CREATE TABLE knowledge_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
  embedding vector(1536),
  model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX knowledge_embeddings_chunk_idx ON knowledge_embeddings(chunk_id);
CREATE INDEX knowledge_embeddings_vector_idx ON knowledge_embeddings USING hnsw(embedding vector_cosine_ops);
ALTER TABLE knowledge_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_embeddings_tenant" ON knowledge_embeddings FOR ALL USING (organization_id = auth_organization_id());

CREATE TABLE retrieval_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL, query_embedding vector(1536),
  filter_source_ids UUID[], top_k INT DEFAULT 5,
  results_returned INT DEFAULT 0, min_trust_score FLOAT DEFAULT 0.5,
  agent_run_id UUID, created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX retrieval_queries_org_idx ON retrieval_queries(organization_id);
ALTER TABLE retrieval_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retrieval_queries_tenant" ON retrieval_queries FOR ALL USING (organization_id = auth_organization_id());

-- ============================================================
-- POLICY / DECISIONING
-- ============================================================
CREATE TABLE policy_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, slug TEXT NOT NULL, description TEXT,
  scope TEXT NOT NULL DEFAULT 'organization',
  version TEXT NOT NULL DEFAULT '1.0.0', is_active BOOLEAN DEFAULT TRUE,
  is_system BOOLEAN DEFAULT FALSE, priority INT DEFAULT 100,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE policy_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policy_defs_tenant" ON policy_definitions FOR ALL
  USING (organization_id IS NULL OR organization_id = auth_organization_id());
CREATE TRIGGER policy_defs_updated_at BEFORE UPDATE ON policy_definitions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE policy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES policy_definitions(id) ON DELETE CASCADE,
  name TEXT NOT NULL, condition JSONB NOT NULL DEFAULT '{}',
  action TEXT NOT NULL, priority INT DEFAULT 100,
  risk_modifier FLOAT DEFAULT 0, is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX policy_rules_policy_idx ON policy_rules(policy_id);
ALTER TABLE policy_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policy_rules_tenant" ON policy_rules FOR ALL
  USING (organization_id IS NULL OR organization_id = auth_organization_id());
CREATE TRIGGER policy_rules_updated_at BEFORE UPDATE ON policy_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE decision_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES policy_definitions(id),
  rule_id UUID REFERENCES policy_rules(id),
  action_requested TEXT NOT NULL, context_snapshot JSONB DEFAULT '{}',
  outcome TEXT NOT NULL, risk_score FLOAT DEFAULT 0,
  explanation TEXT, requires_approval BOOLEAN DEFAULT FALSE,
  actor_id UUID REFERENCES users(id), actor_type TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX decision_records_org_idx ON decision_records(organization_id);
CREATE INDEX decision_records_outcome_idx ON decision_records(outcome);
ALTER TABLE decision_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "decision_records_tenant" ON decision_records FOR ALL USING (organization_id = auth_organization_id());

-- ============================================================
-- SECURITY / AUDIT LOGS
-- ============================================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id), actor_type TEXT DEFAULT 'user',
  action TEXT NOT NULL, resource_type TEXT, resource_id UUID,
  outcome TEXT NOT NULL DEFAULT 'success',
  risk_level TEXT DEFAULT 'low',
  ip_address INET, user_agent TEXT,
  request_id TEXT, session_id UUID,
  before_state JSONB DEFAULT '{}', after_state JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_logs_org_idx ON audit_logs(organization_id);
CREATE INDEX audit_logs_actor_idx ON audit_logs(actor_id);
CREATE INDEX audit_logs_action_idx ON audit_logs(action);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at DESC);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_tenant" ON audit_logs FOR ALL USING (organization_id = auth_organization_id());

CREATE TABLE security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'medium',
  source TEXT, actor_id UUID REFERENCES users(id),
  ip_address INET, details JSONB DEFAULT '{}',
  is_resolved BOOLEAN DEFAULT FALSE, resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX security_events_org_idx ON security_events(organization_id);
CREATE INDEX security_events_type_idx ON security_events(event_type);
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "security_events_tenant" ON security_events FOR ALL USING (organization_id = auth_organization_id());

CREATE TABLE prompt_injection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_run_id UUID REFERENCES agent_runs(id),
  raw_input TEXT, sanitized_input TEXT,
  injection_patterns TEXT[] DEFAULT '{}',
  risk_score FLOAT DEFAULT 0, was_blocked BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE prompt_injection_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "injection_events_tenant" ON prompt_injection_events FOR ALL USING (organization_id = auth_organization_id());
