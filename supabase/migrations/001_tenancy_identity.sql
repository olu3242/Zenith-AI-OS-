-- ZENITH AI OS — Migration 001: Tenancy & Identity
-- Run: supabase db push

CREATE OR REPLACE FUNCTION auth_organization_id() RETURNS UUID AS $$
  SELECT (auth.jwt() ->> 'organization_id')::UUID;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION has_role(required_role TEXT) RETURNS BOOLEAN AS $$
  SELECT (auth.jwt() ->> 'role') = required_role;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TYPE org_tier AS ENUM ('free','starter','professional','enterprise','platform');
CREATE TYPE org_status AS ENUM ('active','suspended','churned','pending_verification');
CREATE TYPE user_role AS ENUM ('super_admin','org_admin','workspace_admin','developer','analyst','viewer','agent_service');
CREATE TYPE api_key_scope AS ENUM ('read','write','admin','agent','audit');

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  tier org_tier NOT NULL DEFAULT 'free', status org_status NOT NULL DEFAULT 'pending_verification',
  domain TEXT, logo_url TEXT, settings JSONB NOT NULL DEFAULT '{}',
  billing_customer_id TEXT, max_workspaces INT DEFAULT 3, max_users INT DEFAULT 10,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_self" ON organizations FOR SELECT USING (id = auth_organization_id());
CREATE POLICY "super_admin_orgs" ON organizations FOR ALL USING (has_role('super_admin'));
CREATE TRIGGER orgs_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, slug TEXT NOT NULL, description TEXT,
  settings JSONB NOT NULL DEFAULT '{}', is_default BOOLEAN DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ,
  UNIQUE(organization_id, slug)
);
CREATE INDEX workspaces_org_idx ON workspaces(organization_id);
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_tenant" ON workspaces FOR ALL USING (organization_id = auth_organization_id());
CREATE TRIGGER ws_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL, full_name TEXT, avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'viewer', is_active BOOLEAN DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ, preferences JSONB DEFAULT '{}', metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX users_org_idx ON users(organization_id);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_tenant" ON users FOR ALL USING (organization_id = auth_organization_id());
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, key_prefix TEXT NOT NULL,
  scopes api_key_scope[] DEFAULT '{}', last_used_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE, metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX api_keys_org_idx ON api_keys(organization_id);
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_keys_tenant" ON api_keys FOR ALL USING (organization_id = auth_organization_id());
CREATE TRIGGER api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION set_updated_at();
