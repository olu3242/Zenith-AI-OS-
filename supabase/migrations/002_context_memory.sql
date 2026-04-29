-- ============================================================
-- Zenith AI OS — Migration 002: Context & Memory
-- ============================================================

CREATE TYPE context_status AS ENUM ('active','stale','expired','conflict','archived');
CREATE TYPE memory_type AS ENUM ('short_term','session','long_term','entity','workflow','semantic','preference','tenant','agent');
CREATE TYPE memory_status AS ENUM ('active','archived','expired','pruned');

-- ============================================================
-- CONTEXT SESSIONS
-- ============================================================
CREATE TABLE context_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  agent_id UUID,
  session_type TEXT NOT NULL DEFAULT 'user',
  status context_status NOT NULL DEFAULT 'active',
  intent TEXT,
  active_workflow_id UUID,
  context_data JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_context_sessions_org ON context_sessions(organization_id);
CREATE INDEX idx_context_sessions_user ON context_sessions(user_id);
CREATE INDEX idx_context_sessions_status ON context_sessions(status);
ALTER TABLE context_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON context_sessions FOR ALL USING (organization_id = current_org_id());
CREATE TRIGGER trg_context_sessions_updated BEFORE UPDATE ON context_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CONTEXT ITEMS (individual context entries)
-- ============================================================
CREATE TABLE context_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES context_sessions(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  source TEXT NOT NULL,
  freshness_score FLOAT DEFAULT 1.0,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_context_items_session ON context_items(session_id);
CREATE INDEX idx_context_items_key ON context_items(key);
ALTER TABLE context_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON context_items FOR ALL USING (organization_id = current_org_id());
CREATE TRIGGER trg_context_items_updated BEFORE UPDATE ON context_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CONTEXT SNAPSHOTS (before critical actions)
-- ============================================================
CREATE TABLE context_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES context_sessions(id) ON DELETE CASCADE,
  snapshot_data JSONB NOT NULL,
  trigger_action TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_context_snapshots_session ON context_snapshots(session_id);
ALTER TABLE context_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON context_snapshots FOR ALL USING (organization_id = current_org_id());

-- ============================================================
-- MEMORY ITEMS
-- ============================================================
CREATE TABLE memory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),
  user_id UUID REFERENCES users(id),
  agent_id UUID,
  type memory_type NOT NULL,
  status memory_status NOT NULL DEFAULT 'active',
  key TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT,
  summary TEXT,
  importance_score FLOAT DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_memory_items_org ON memory_items(organization_id);
CREATE INDEX idx_memory_items_type ON memory_items(type);
CREATE INDEX idx_memory_items_user ON memory_items(user_id);
CREATE INDEX idx_memory_items_status ON memory_items(status);
ALTER TABLE memory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON memory_items FOR ALL USING (organization_id = current_org_id());
CREATE TRIGGER trg_memory_items_updated BEFORE UPDATE ON memory_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- MEMORY EMBEDDINGS (vector search)
-- ============================================================
CREATE TABLE memory_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  memory_item_id UUID NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  embedding vector(1536),
  model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_memory_embeddings_item ON memory_embeddings(memory_item_id);
CREATE INDEX idx_memory_embeddings_vector ON memory_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
ALTER TABLE memory_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON memory_embeddings FOR ALL USING (organization_id = current_org_id());

-- ============================================================
-- MEMORY AUDIT LOGS
-- ============================================================
CREATE TABLE memory_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  memory_item_id UUID REFERENCES memory_items(id),
  action TEXT NOT NULL,
  actor_id UUID REFERENCES users(id),
  actor_type TEXT NOT NULL DEFAULT 'user',
  before_state JSONB,
  after_state JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_memory_audit_org ON memory_audit_logs(organization_id);
CREATE INDEX idx_memory_audit_item ON memory_audit_logs(memory_item_id);
ALTER TABLE memory_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON memory_audit_logs FOR ALL USING (organization_id = current_org_id());
