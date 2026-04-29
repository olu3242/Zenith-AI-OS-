/**
 * AIOS Context Service
 * Resolves, maintains, propagates, and validates session context
 * across all agents, tools, and workflows.
 */

import { z } from 'zod';

// ─── Schemas ───────────────────────────────────────────────────────────────

export const ContextItemSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  source: z.enum(['user', 'agent', 'workflow', 'system', 'tool']),
  confidence: z.number().min(0).max(1).default(1),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const ContextBundleSchema = z.object({
  sessionId: z.string().uuid(),
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.string(),
  permissions: z.array(z.string()),
  intent: z.string().optional(),
  workflowId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  items: z.record(ContextItemSchema),
  snapshotId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ContextItem = z.infer<typeof ContextItemSchema>;
export type ContextBundle = z.infer<typeof ContextBundleSchema>;

// ─── Context Errors ────────────────────────────────────────────────────────

export class ContextResolutionError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'ContextResolutionError';
  }
}

export class StaleContextError extends Error {
  constructor(public key: string, public expiredAt: string) {
    super(`Context key "${key}" expired at ${expiredAt}`);
    this.name = 'StaleContextError';
  }
}

// ─── Context Service ───────────────────────────────────────────────────────

export interface ContextServiceDeps {
  db: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> };
  logger: { info: (msg: string, meta?: unknown) => void; error: (msg: string, meta?: unknown) => void };
  auditLogger: { log: (event: string, data: unknown) => Promise<void> };
}

export class ContextService {
  constructor(private deps: ContextServiceDeps) {}

  /** Resolve full context bundle for an authenticated request */
  async resolve(params: {
    sessionId: string;
    organizationId: string;
    userId: string;
  }): Promise<ContextBundle> {
    const { sessionId, organizationId, userId } = params;

    const { rows } = await this.deps.db.query(
      `SELECT cs.*, u.role, array_agg(p.key) as permissions
       FROM context_sessions cs
       JOIN users u ON u.id = $3
       LEFT JOIN permissions p ON p.user_id = $3
       WHERE cs.id = $1 AND cs.organization_id = $2
       GROUP BY cs.id, u.role`,
      [sessionId, organizationId, userId]
    );

    if (!rows.length) {
      throw new ContextResolutionError('Session not found', 'SESSION_NOT_FOUND');
    }

    const raw = rows[0] as Record<string, unknown>;

    const bundle: ContextBundle = {
      sessionId,
      organizationId,
      workspaceId: raw.workspace_id as string,
      userId,
      role: raw.role as string,
      permissions: (raw.permissions as string[]) ?? [],
      intent: raw.active_intent as string | undefined,
      workflowId: raw.workflow_id as string | undefined,
      agentId: raw.agent_id as string | undefined,
      items: (raw.context_items as Record<string, ContextItem>) ?? {},
      createdAt: raw.created_at as string,
      updatedAt: raw.updated_at as string,
    };

    await this.checkFreshness(bundle);
    return bundle;
  }

  /** Add or update a context item in the session */
  async set(sessionId: string, orgId: string, item: ContextItem): Promise<void> {
    const validated = ContextItemSchema.parse(item);

    await this.deps.db.query(
      `UPDATE context_sessions
       SET context_items = context_items || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2 AND organization_id = $3`,
      [JSON.stringify({ [validated.key]: validated }), sessionId, orgId]
    );

    await this.deps.auditLogger.log('CONTEXT_ITEM_SET', { sessionId, key: item.key, source: item.source });
  }

  /** Snapshot context before critical operations */
  async snapshot(sessionId: string, orgId: string, reason: string): Promise<string> {
    const bundle = await this.resolveById(sessionId, orgId);

    const { rows } = await this.deps.db.query(
      `INSERT INTO context_snapshots (session_id, organization_id, snapshot_data, reason, created_at)
       VALUES ($1, $2, $3::jsonb, $4, NOW())
       RETURNING id`,
      [sessionId, orgId, JSON.stringify(bundle), reason]
    );

    const snapshotId = (rows[0] as { id: string }).id;
    this.deps.logger.info('Context snapshot created', { snapshotId, sessionId, reason });
    return snapshotId;
  }

  /** Check for stale or expired context items */
  async checkFreshness(bundle: ContextBundle): Promise<{ stale: string[] }> {
    const now = new Date();
    const stale: string[] = [];

    for (const [key, item] of Object.entries(bundle.items)) {
      if (item.expiresAt && new Date(item.expiresAt) < now) {
        stale.push(key);
        this.deps.logger.info('Stale context item detected', { key, expiredAt: item.expiresAt });
      }
    }

    return { stale };
  }

  /** Detect conflicts between context items from different sources */
  async detectConflicts(bundle: ContextBundle): Promise<Array<{ key: string; conflict: string }>> {
    const conflicts: Array<{ key: string; conflict: string }> = [];

    // Check for items with conflicting values from different sources
    const keysBySource: Record<string, ContextItem[]> = {};
    for (const item of Object.values(bundle.items)) {
      if (!keysBySource[item.key]) keysBySource[item.key] = [];
      keysBySource[item.key].push(item);
    }

    for (const [key, items] of Object.entries(keysBySource)) {
      if (items.length > 1) {
        const sources = items.map((i) => i.source);
        conflicts.push({ key, conflict: `Multiple sources: ${sources.join(', ')}` });
      }
    }

    return conflicts;
  }

  /** Propagate context to an agent or tool invocation */
  propagate(bundle: ContextBundle, target: 'agent' | 'tool' | 'workflow'): Record<string, unknown> {
    const propagated: Record<string, unknown> = {
      _ctx: {
        sessionId: bundle.sessionId,
        organizationId: bundle.organizationId,
        workspaceId: bundle.workspaceId,
        userId: bundle.userId,
        role: bundle.role,
        intent: bundle.intent,
        workflowId: bundle.workflowId,
      },
    };

    // Include non-expired items
    const now = new Date();
    for (const [key, item] of Object.entries(bundle.items)) {
      if (!item.expiresAt || new Date(item.expiresAt) > now) {
        propagated[key] = item.value;
      }
    }

    return propagated;
  }

  private async resolveById(sessionId: string, orgId: string): Promise<ContextBundle> {
    const { rows } = await this.deps.db.query(
      `SELECT * FROM context_sessions WHERE id = $1 AND organization_id = $2`,
      [sessionId, orgId]
    );
    if (!rows.length) throw new ContextResolutionError('Session not found', 'NOT_FOUND');
    return rows[0] as ContextBundle;
  }
}
