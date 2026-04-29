// ============================================================
// ZENITH AI OS — Core Types
// ============================================================

export type UUID = string;
export type Timestamp = string; // ISO 8601
export type JsonObject = Record<string, unknown>;

// ============================================================
// IDENTITY & CONTEXT
// ============================================================

export type UserRole = 'super_admin' | 'org_admin' | 'workspace_admin' | 'developer' | 'analyst' | 'viewer' | 'agent_service';
export type OrgTier = 'free' | 'starter' | 'professional' | 'enterprise' | 'platform';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Organization {
  id: UUID;
  name: string;
  slug: string;
  tier: OrgTier;
  status: string;
  settings: JsonObject;
  metadata: JsonObject;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Workspace {
  id: UUID;
  organizationId: UUID;
  name: string;
  slug: string;
  isDefault: boolean;
  settings: JsonObject;
  createdAt: Timestamp;
}

export interface User {
  id: UUID;
  organizationId: UUID;
  email: string;
  fullName?: string;
  role: UserRole;
  isActive: boolean;
  preferences: JsonObject;
  createdAt: Timestamp;
}

// The primary context bundle passed to every agent/tool/workflow
export interface ContextBundle {
  requestId: UUID;
  timestamp: Timestamp;
  user: Pick<User, 'id' | 'email' | 'role'>;
  organization: Pick<Organization, 'id' | 'name' | 'tier'>;
  workspace: Pick<Workspace, 'id' | 'name'> | null;
  session: {
    id: UUID;
    startedAt: Timestamp;
    intent?: string;
    entityType?: string;
    entityId?: UUID;
  };
  permissions: string[];
  environment: JsonObject;
  freshness: {
    checkedAt: Timestamp;
    isStale: boolean;
    staleSinceMs: number;
  };
  metadata: JsonObject;
}

// ============================================================
// MEMORY
// ============================================================

export type MemoryType = 'short_term' | 'session' | 'long_term' | 'entity' | 'semantic' | 'preference' | 'workflow' | 'agent';
export type MemoryStatus = 'active' | 'archived' | 'expired' | 'pruned';

export interface MemoryItem {
  id: UUID;
  organizationId: UUID;
  workspaceId?: UUID;
  userId?: UUID;
  type: MemoryType;
  status: MemoryStatus;
  key: string;
  content: string;
  contentSummary?: string;
  entityType?: string;
  entityId?: UUID;
  tags: string[];
  importanceScore: number;
  accessCount: number;
  expiresAt?: Timestamp;
  metadata: JsonObject;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MemorySearchResult {
  item: MemoryItem;
  similarity: number;
  relevanceScore: number;
}

// ============================================================
// AGENTS
// ============================================================

export type AgentStatus = 'active' | 'inactive' | 'deprecated' | 'testing';
export type AgentRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';

export interface AgentDefinition {
  id: UUID;
  organizationId?: UUID;
  name: string;
  slug: string;
  description?: string;
  version: string;
  capabilities: string[];
  allowedTools: string[];
  model?: string;
  maxTokens: number;
  isSystem: boolean;
  status: AgentStatus;
  config: JsonObject;
  createdAt: Timestamp;
}

export interface AgentRun {
  id: UUID;
  organizationId: UUID;
  agentId: UUID;
  status: AgentRunStatus;
  input: JsonObject;
  output: JsonObject;
  contextSnapshot: ContextBundle;
  tokensUsed: number;
  costUsd: number;
  errorMessage?: string;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  createdAt: Timestamp;
}

export interface AgentHandoffContract {
  fromRunId: UUID;
  toAgentSlug: string;
  handoffData: JsonObject;
  reason: string;
  priority: number;
  context: ContextBundle;
}

// ============================================================
// TOOLS
// ============================================================

export type ToolCategory = 'communication' | 'data' | 'knowledge' | 'workflow' | 'security' | 'ai' | 'integration' | 'audit';

export interface ToolDefinition {
  id: UUID;
  name: string;
  slug: string;
  description?: string;
  category: ToolCategory;
  version: string;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  requiredPermissions: string[];
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  supportsDryRun: boolean;
  isIdempotent: boolean;
  timeoutMs: number;
  maxRetries: number;
  config: JsonObject;
}

export interface ToolInvocationRequest {
  toolSlug: string;
  input: JsonObject;
  context: ContextBundle;
  idempotencyKey: string;
  isDryRun?: boolean;
  agentRunId?: UUID;
}

export interface ToolInvocationResult {
  invocationId: UUID;
  toolSlug: string;
  status: 'success' | 'failed' | 'pending_approval' | 'rolled_back';
  output: JsonObject;
  durationMs: number;
  requiresApproval: boolean;
  errorMessage?: string;
}

// ============================================================
// WORKFLOWS
// ============================================================

export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'deprecated' | 'archived';
export type WorkflowRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused' | 'waiting_approval';

export interface WorkflowDefinition {
  id: UUID;
  organizationId: UUID;
  name: string;
  slug: string;
  version: string;
  status: WorkflowStatus;
  triggerType: string;
  triggerConfig: JsonObject;
  definition: WorkflowDefinitionSchema;
  slaMinutes?: number;
  retryLimit: number;
  createdAt: Timestamp;
}

export interface WorkflowDefinitionSchema {
  steps: WorkflowStep[];
  errorPath?: string;
  compensationPath?: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'tool' | 'agent' | 'condition' | 'approval' | 'delay' | 'notify' | 'complete';
  config: JsonObject;
  nextStep?: string;
  onError?: string;
  timeout?: number;
}

// ============================================================
// POLICY
// ============================================================

export interface PolicyEvaluationInput {
  action: string;
  context: ContextBundle;
  resourceType?: string;
  resourceId?: UUID;
  additionalData?: JsonObject;
}

export interface PolicyDecision {
  outcome: 'allow' | 'deny' | 'escalate';
  policyId?: UUID;
  ruleId?: UUID;
  riskScore: number;
  explanation: string;
  requiresApproval: boolean;
  decisionRecord: UUID;
}

// ============================================================
// AUDIT
// ============================================================

export type AuditDomain =
  | 'identity_context' | 'memory_state' | 'agent_orchestration'
  | 'tool_execution' | 'workflow_automation' | 'knowledge_retrieval'
  | 'policy_decisioning' | 'interface_experience' | 'security_governance'
  | 'observability_reliability' | 'interoperability_extensibility' | 'deployment_portability';

export type CertificationLevel = 'AIOS_L1' | 'AIOS_L2' | 'AIOS_L3' | 'AIOS_L4' | 'AIOS_L5';
export type MaturityBand = 'ai_enabled_app' | 'emerging_platform' | 'functional_aios' | 'advanced_aios' | 'standard_ready_aios' | 'open_standard_candidate';

export interface AuditControlScore {
  controlId: UUID;
  controlCode: string;
  domain: AuditDomain;
  score: 0 | 1 | 2 | 3 | 4 | 5;
  weight: number;
  weightedScore: number;
  gapDetected: boolean;
  lapseDetected: boolean;
  evidenceProvided?: string;
  scoreRationale?: string;
}

export interface AuditRunResult {
  runId: UUID;
  organizationId: UUID;
  overallScore: number;
  maturityBand: MaturityBand;
  certificationLevel: CertificationLevel;
  isCertified: boolean;
  domainScores: Record<AuditDomain, number>;
  gapCount: number;
  lapseCount: number;
  criticalGapCount: number;
  executiveSummary: string;
  finalVerdict: string;
  standardizationReadinessScore: number;
  isOpenStandardCandidate: boolean;
  completedAt: Timestamp;
}

// ============================================================
// OBSERVABILITY
// ============================================================

export interface TraceEvent {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  type: 'request' | 'agent' | 'tool' | 'workflow' | 'memory' | 'knowledge' | 'policy';
  status: 'success' | 'error' | 'in_progress';
  startTime: Timestamp;
  endTime?: Timestamp;
  durationMs?: number;
  tokensUsed?: number;
  costUsd?: number;
  input?: JsonObject;
  output?: JsonObject;
  errorMessage?: string;
  metadata: JsonObject;
}

// ============================================================
// API RESPONSES
// ============================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: JsonObject;
  };
  meta?: {
    requestId: string;
    timestamp: string;
    version: string;
  };
}

export type PaginatedResponse<T> = ApiResponse<{
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}>;

// ============================================================
// ERRORS
// ============================================================

export class AIOSError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: JsonObject,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AIOSError';
  }
}

export class TenantIsolationError extends AIOSError {
  constructor(action: string) {
    super('TENANT_ISOLATION_VIOLATION', `Tenant isolation violation on action: ${action}`, {}, 403);
  }
}

export class PolicyDeniedError extends AIOSError {
  constructor(action: string, explanation: string) {
    super('POLICY_DENIED', `Action denied by policy: ${action}`, { explanation }, 403);
  }
}

export class ToolApprovalRequiredError extends AIOSError {
  constructor(toolSlug: string, riskScore: number) {
    super('APPROVAL_REQUIRED', `Tool requires approval: ${toolSlug}`, { toolSlug, riskScore }, 202);
  }
}
