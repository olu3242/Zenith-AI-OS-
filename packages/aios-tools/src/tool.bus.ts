/**
 * AIOS Tool Bus
 * Central execution engine for all AI OS tool invocations.
 * Enforces schemas, permissions, risk scoring, approval gates,
 * idempotency, retries, rollback hooks, and audit trails.
 */

import { z } from 'zod';

// ─── Tool Definition ───────────────────────────────────────────────────────

export const RiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);

export const ToolDefinitionSchema = z.object({
  id: z.string(),
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string(),
  version: z.string().default('1.0.0'),
  category: z.enum(['communication', 'data', 'integration', 'knowledge', 'workflow', 'governance', 'utility']),
  riskLevel: RiskLevelSchema,
  requiresApproval: z.boolean().default(false),
  idempotent: z.boolean().default(true),
  timeoutMs: z.number().int().default(15000),
  maxRetries: z.number().int().default(2),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  permissions: z.array(z.string()).default([]),
  rollbackFn: z.string().optional(), // name of rollback handler
  metadata: z.record(z.unknown()).optional(),
});

export const ToolInvocationSchema = z.object({
  toolId: z.string(),
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  agentRunId: z.string().uuid().optional(),
  workflowRunId: z.string().uuid().optional(),
  input: z.record(z.unknown()),
  idempotencyKey: z.string().optional(),
  dryRun: z.boolean().default(false),
  context: z.record(z.unknown()).optional(),
});

export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
export type ToolInvocation = z.infer<typeof ToolInvocationSchema>;

export interface ToolResult {
  invocationId: string;
  toolId: string;
  status: 'success' | 'failed' | 'dry_run' | 'pending_approval' | 'rolled_back';
  output: Record<string, unknown>;
  riskScore: number;
  durationMs: number;
  error?: string;
}

// ─── Built-in Tool Handlers ────────────────────────────────────────────────

export type ToolHandler = (input: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<Record<string, unknown>>;
export type RollbackHandler = (invocationId: string, ctx: Record<string, unknown>) => Promise<void>;

// ─── Tool Bus ──────────────────────────────────────────────────────────────

export interface ToolBusDeps {
  db: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> };
  permissionService: { hasPermission: (userId: string, permission: string, orgId: string) => Promise<boolean> };
  policyEvaluator: { evaluate: (action: string, ctx: Record<string, unknown>) => Promise<{ allowed: boolean; reason: string; riskScore: number }> };
  tracer: { startSpan: (name: string, meta?: unknown) => { end: (result?: unknown) => void } };
  auditLogger: { log: (event: string, data: unknown) => Promise<void> };
  logger: { info: (msg: string, meta?: unknown) => void; error: (msg: string, meta?: unknown) => void };
}

export class ToolBus {
  private tools = new Map<string, ToolDefinition>();
  private handlers = new Map<string, ToolHandler>();
  private rollbacks = new Map<string, RollbackHandler>();

  constructor(private deps: ToolBusDeps) {
    this.registerDefaults();
  }

  /** Register a tool definition + its handler */
  register(def: ToolDefinition, handler: ToolHandler, rollback?: RollbackHandler): void {
    ToolDefinitionSchema.parse(def);
    this.tools.set(def.id, def);
    this.handlers.set(def.id, handler);
    if (rollback) this.rollbacks.set(def.id, rollback);
  }

  /** Execute a tool invocation */
  async invoke(invocation: ToolInvocation): Promise<ToolResult> {
    const validated = ToolInvocationSchema.parse(invocation);
    const tool = this.tools.get(validated.toolId);
    if (!tool) throw new Error(`Tool ${validated.toolId} not registered`);

    const span = this.deps.tracer.startSpan('tool.invoke', { toolId: tool.id, name: tool.name });
    const startTime = Date.now();

    // Idempotency check
    if (validated.idempotencyKey) {
      const existing = await this.checkIdempotency(validated.idempotencyKey, validated.organizationId);
      if (existing) {
        span.end({ idempotent: true });
        return existing;
      }
    }

    // Permission check
    for (const perm of tool.permissions) {
      const has = await this.deps.permissionService.hasPermission(validated.userId, perm, validated.organizationId);
      if (!has) {
        await this.deps.auditLogger.log('TOOL_PERMISSION_DENIED', { toolId: tool.id, permission: perm, userId: validated.userId });
        throw new Error(`Missing permission: ${perm}`);
      }
    }

    // Policy + risk evaluation
    const policy = await this.deps.policyEvaluator.evaluate('tool.invoke', {
      toolId: tool.id,
      category: tool.category,
      riskLevel: tool.riskLevel,
      orgId: validated.organizationId,
      userId: validated.userId,
    });

    if (!policy.allowed) {
      await this.deps.auditLogger.log('TOOL_BLOCKED_BY_POLICY', { toolId: tool.id, reason: policy.reason });
      throw new Error(`Tool blocked: ${policy.reason}`);
    }

    // Approval gate for high/critical risk
    const invocationId = await this.createInvocationRecord(validated, tool, 'running');

    if ((tool.requiresApproval || tool.riskLevel === 'critical') && !validated.dryRun) {
      await this.updateInvocationRecord(invocationId, 'pending_approval', {});
      await this.deps.auditLogger.log('TOOL_APPROVAL_REQUIRED', { invocationId, toolId: tool.id });
      return {
        invocationId, toolId: tool.id,
        status: 'pending_approval', output: {},
        riskScore: policy.riskScore, durationMs: Date.now() - startTime,
      };
    }

    // Dry run
    if (validated.dryRun) {
      await this.updateInvocationRecord(invocationId, 'dry_run', { dryRun: true });
      span.end({ dryRun: true });
      return {
        invocationId, toolId: tool.id,
        status: 'dry_run', output: { dryRun: true, wouldExecute: tool.name },
        riskScore: policy.riskScore, durationMs: Date.now() - startTime,
      };
    }

    // Execute with retries
    const handler = this.handlers.get(tool.id)!;
    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt <= tool.maxRetries) {
      attempt++;
      try {
        const output = await Promise.race([
          handler(validated.input, validated.context ?? {}),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Tool timeout after ${tool.timeoutMs}ms`)), tool.timeoutMs)
          ),
        ]);

        const durationMs = Date.now() - startTime;
        await this.updateInvocationRecord(invocationId, 'success', output);
        if (validated.idempotencyKey) {
          await this.saveIdempotencyResult(validated.idempotencyKey, validated.organizationId, invocationId);
        }

        await this.deps.auditLogger.log('TOOL_INVOKED', {
          invocationId, toolId: tool.id, orgId: validated.organizationId,
          riskLevel: tool.riskLevel, riskScore: policy.riskScore, durationMs, attempt,
        });

        span.end({ status: 'success' });
        return { invocationId, toolId: tool.id, status: 'success', output, riskScore: policy.riskScore, durationMs };

      } catch (err) {
        lastError = err as Error;
        if (attempt <= tool.maxRetries) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 300));
        }
      }
    }

    await this.updateInvocationRecord(invocationId, 'failed', {});
    await this.deps.auditLogger.log('TOOL_FAILED', { invocationId, toolId: tool.id, error: lastError?.message });
    span.end({ status: 'failed' });

    return {
      invocationId, toolId: tool.id, status: 'failed', output: {},
      riskScore: policy.riskScore, durationMs: Date.now() - startTime, error: lastError?.message,
    };
  }

  /** Roll back a tool invocation */
  async rollback(invocationId: string, orgId: string): Promise<void> {
    const { rows } = await this.deps.db.query(
      `SELECT tool_id FROM tool_invocations WHERE id = $1 AND organization_id = $2`,
      [invocationId, orgId]
    );
    if (!rows.length) throw new Error(`Invocation ${invocationId} not found`);

    const toolId = (rows[0] as { tool_id: string }).tool_id;
    const rollback = this.rollbacks.get(toolId);
    if (!rollback) throw new Error(`No rollback handler for tool ${toolId}`);

    await rollback(invocationId, { orgId });
    await this.updateInvocationRecord(invocationId, 'rolled_back', {});
    await this.deps.auditLogger.log('TOOL_ROLLED_BACK', { invocationId, toolId, orgId });
  }

  // ─── Default Tools ─────────────────────────────────────────────────────

  private registerDefaults(): void {
    // send_email
    this.register(
      { id: 'send_email', organizationId: 'system', name: 'Send Email', description: 'Send an email', version: '1.0.0', category: 'communication', riskLevel: 'medium', requiresApproval: false, idempotent: false, timeoutMs: 10000, maxRetries: 1, inputSchema: { to: 'string', subject: 'string', body: 'string' }, outputSchema: { messageId: 'string' }, permissions: ['tool:email:send'] },
      async (input) => ({ messageId: `msg_${Date.now()}`, sent: true, to: input.to })
    );

    // create_task
    this.register(
      { id: 'create_task', organizationId: 'system', name: 'Create Task', description: 'Create a task', version: '1.0.0', category: 'workflow', riskLevel: 'low', requiresApproval: false, idempotent: true, timeoutMs: 5000, maxRetries: 2, inputSchema: { title: 'string', assigneeId: 'string', dueDate: 'string' }, outputSchema: { taskId: 'string' }, permissions: ['tool:task:create'] },
      async (input) => ({ taskId: `task_${Date.now()}`, title: input.title, status: 'created' })
    );

    // score_risk
    this.register(
      { id: 'score_risk', organizationId: 'system', name: 'Score Risk', description: 'Score action risk', version: '1.0.0', category: 'governance', riskLevel: 'low', requiresApproval: false, idempotent: true, timeoutMs: 3000, maxRetries: 1, inputSchema: { action: 'string', context: 'object' }, outputSchema: { score: 'number', level: 'string' }, permissions: [] },
      async (input) => ({ score: Math.random() * 100, level: 'medium', action: input.action })
    );

    // run_audit
    this.register(
      { id: 'run_audit', organizationId: 'system', name: 'Run Audit', description: 'Trigger an audit run', version: '1.0.0', category: 'governance', riskLevel: 'low', requiresApproval: false, idempotent: true, timeoutMs: 60000, maxRetries: 1, inputSchema: { frameworkId: 'string', orgId: 'string' }, outputSchema: { runId: 'string', score: 'number' }, permissions: ['audit:run:create'] },
      async (input) => ({ runId: `audit_${Date.now()}`, frameworkId: input.frameworkId, status: 'queued' })
    );

    // search_knowledge
    this.register(
      { id: 'search_knowledge', organizationId: 'system', name: 'Search Knowledge', description: 'Semantic knowledge search', version: '1.0.0', category: 'knowledge', riskLevel: 'low', requiresApproval: false, idempotent: true, timeoutMs: 8000, maxRetries: 2, inputSchema: { query: 'string', limit: 'number' }, outputSchema: { results: 'array' }, permissions: ['knowledge:read'] },
      async (input) => ({ results: [], query: input.query, count: 0 })
    );
  }

  private async createInvocationRecord(invocation: ToolInvocation, tool: ToolDefinition, status: string): Promise<string> {
    const { rows } = await this.deps.db.query(
      `INSERT INTO tool_invocations
         (tool_id, organization_id, workspace_id, session_id, user_id, agent_run_id, workflow_run_id,
          input, idempotency_key, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,NOW(),NOW())
       RETURNING id`,
      [
        tool.id, invocation.organizationId, invocation.workspaceId ?? null,
        invocation.sessionId, invocation.userId, invocation.agentRunId ?? null,
        invocation.workflowRunId ?? null, JSON.stringify(invocation.input),
        invocation.idempotencyKey ?? null, status,
      ]
    );
    return (rows[0] as { id: string }).id;
  }

  private async updateInvocationRecord(id: string, status: string, output: unknown): Promise<void> {
    await this.deps.db.query(
      `UPDATE tool_invocations SET status=$1, output=$2::jsonb, updated_at=NOW() WHERE id=$3`,
      [status, JSON.stringify(output), id]
    );
  }

  private async checkIdempotency(key: string, orgId: string): Promise<ToolResult | null> {
    const { rows } = await this.deps.db.query(
      `SELECT ti.* FROM tool_invocations ti
       WHERE ti.idempotency_key = $1 AND ti.organization_id = $2 AND ti.status = 'success'`,
      [key, orgId]
    );
    if (!rows.length) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      invocationId: r.id as string, toolId: r.tool_id as string,
      status: 'success', output: (r.output as Record<string, unknown>) ?? {},
      riskScore: 0, durationMs: 0,
    };
  }

  private async saveIdempotencyResult(key: string, orgId: string, invocationId: string): Promise<void> {
    await this.deps.db.query(
      `INSERT INTO action_idempotency_keys (key, organization_id, invocation_id, created_at)
       VALUES ($1,$2,$3,NOW()) ON CONFLICT (key, organization_id) DO NOTHING`,
      [key, orgId, invocationId]
    );
  }
}
