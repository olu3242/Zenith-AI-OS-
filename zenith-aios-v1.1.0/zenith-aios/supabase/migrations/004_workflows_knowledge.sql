-- ============================================================
-- Zenith AI OS — Migration 004: Workflows & Knowledge
-- ============================================================

CREATE TYPE workflow_run_status AS ENUM ('queued','running','paused','completed','failed','cancelled','awaiting_approval');
CREATE TYPE workflow_step_status AS ENUM ('pending','running','completed','failed','skipped','awaiting_approval');
CREATE TYPE knowledge_source_type AS ENUM ('file','url','api','database','manual','stream');
CREATE TYPE knowledge_status AS ENUM ('pending','processing','active','failed','archived');

-- ============================================================
-- WORKFLOW DEFINITIONS
-- ============================================================
CREATE TABLE workflow_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  trigger_config JSONB DEFAULT '{}',
  steps JSONB NOT NULL DEFAULT '[]',
  timeout_ms INTEGER DEFAULT 300000,
  max_retries INTEGER DEFAULT 3,
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);
CREATE INDEX idx_workflow_defs_org ON workflow_definitions(organization_id);
ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON workflow_definitions FOR ALL USING (organization_id = current_org_id());
CREATE TRIGGER trg_workflow_defs_updated BEFORE UPDATE ON workflow_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- WORKFLOW RUNS
-- ============================================================
CREATE TABLE workflow_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),
  workflow_id UUID NOT NULL REFERENCES workflow_definitions(id),
  status workflow_run_status NOT NULL DEFAULT 'queued',
  input JSONB DEFAULT '{}',
  output JSONB,
  current_step INTEGER DEFAULT 0,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  idempotency_key TEXT UNIQUE,
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  triggered_by_id UUID,
  sla_deadline TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_workflow_runs_org ON workflow_runs(organization_id);
CREATE INDEX idx_workflow_runs_workflow ON workflow_runs(workflow_id);
CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX idx_workflow_runs_created ON workflow_runs(created_at DESC);
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON workflow_runs FOR ALL USING (organization_id = current_org_id());
CREATE TRIGGER trg_workflow_runs_updated BEFORE UPDATE ON workflow_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- WORKFLOW STEPS (execution trace)
-- ============================================================
CREATE TABLE workflow_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  step_type TEXT NOT NULL,
  status workflow_step_status NOT NULL DEFAULT 'pending',
  input JSONB,
  output JSONB,
  error_message TEXT,
  duration_ms INTEGER,
  retry_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_workflow_steps_run ON workflow_steps(run_id);
ALTER TABLE workflow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON workflow_steps FOR ALL USING (organization_id = current_org_id());

-- ============================================================
-- WORKFLOW QUEUE (event-driven processing)
-- ============================================================
CREATE TABLE workflow_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  workflow_run_id UUID REFERENCES workflow_runs(id),
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER DEFAULT 5,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  visibility_timeout TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wf_queue_org ON workflow_queue(organization_id);
CREATE INDEX idx_wf_queue_status ON workflow_queue(status);
CREATE INDEX idx_wf_queue_priority ON workflow_queue(priority DESC, created_at ASC);
ALTER TABLE workflow_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON workflow_queue FOR ALL USING (organization_id = current_org_id());

-- ============================================================
-- WORKFLOW DEAD LETTERS
-- ============================================================
CREATE TABLE workflow_dead_letters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  original_queue_id UUID,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  failure_reason TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wf_dead_letters_org ON workflow_dead_letters(organization_id);
ALTER TABLE workflow_dead_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON workflow_dead_letters FOR ALL USING (organization_id = current_org_id());

-- ============================================================
-- KNOWLEDGE SOURCES
-- ============================================================
CREATE TABLE knowledge_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  type knowledge_source_type NOT NULL DEFAULT 'file',
  status knowledge_status NOT NULL DEFAULT 'pending',
  config JSONB DEFAULT '{}',
  trust_score FLOAT DEFAULT 0.8,
  freshness_ttl_hours INTEGER DEFAULT 24,
  last_ingested_at TIMESTAMPTZ,
  document_count INTEGER DEFAULT 0,
  chunk_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_knowledge_sources_org ON knowledge_sources(organization_id);
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON knowledge_sources FOR ALL USING (organization_id = current_org_id());
CREATE TRIGGER trg_knowledge_sources_updated BEFORE UPDATE ON knowledge_sources FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- KNOWLEDGE CHUNKS (chunked + embedded content)
-- ============================================================
CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  tokens INTEGER DEFAULT 0,
  embedding vector(1536),
  trust_score FLOAT DEFAULT 0.8,
  freshness_score FLOAT DEFAULT 1.0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_knowledge_chunks_source ON knowledge_chunks(source_id);
CREATE INDEX idx_knowledge_chunks_vector ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_knowledge_chunks_content_fts ON knowledge_chunks USING gin(to_tsvector('english', content));
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON knowledge_chunks FOR ALL USING (organization_id = current_org_id());
