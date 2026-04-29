export type OrgTier = 'free' | 'starter' | 'professional' | 'enterprise' | 'partner';
export type UserRole = 'super_admin' | 'org_admin' | 'workspace_admin' | 'developer' | 'analyst' | 'viewer';
export type WorkspaceType = 'production' | 'staging' | 'development' | 'sandbox';

export interface Organization { id: string; name: string; slug: string; tier: OrgTier; settings: Record<string, unknown>; is_active: boolean; created_at: string; updated_at: string; }
export interface Workspace { id: string; organization_id: string; name: string; slug: string; type: WorkspaceType; settings: Record<string, unknown>; is_active: boolean; }
export interface User { id: string; organization_id: string; email: string; full_name?: string; role: UserRole; is_active: boolean; }
export interface TenantContext { organization: Organization; workspace?: Workspace; user: User; permissions: string[]; }
