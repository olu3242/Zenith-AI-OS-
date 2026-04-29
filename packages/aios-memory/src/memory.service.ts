/**
 * AIOS Memory Service
 * Manages short-term, session, long-term, semantic, and entity memory
 * across tenants with permissions, embedding, and audit logging.
 */

import { z } from 'zod';

// ─── Schemas ───────────────────────────────────────────────────────────────

export const MemoryTypeSchema = z.enum([
  'short_term', 'session', 'long_term', 'entity', 'semantic',
  'user_preference', 'tenant', 'agent', 'workflow',
]);

export const MemoryItemSchema = z.object({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  type: MemoryTypeSchema,
  key: z.string().max(255),
  value: z.unknown(),
  summary: z.string().optional(),
  embedding: z.array(z.number()).optional(),
  tags: z.array(z.string()).default([]),
  visibility: z.enum(['private', 'workspace', 'organization']).default('private'),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const MemorySearchSchema = z.object({
  organizationId: z.string().uuid(),
  query: z.string(),
  types: z.array(MemoryTypeSchema).optional(),
  userId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(10),
  similarityThreshold: z.number().min(0).max(1).default(0.7),
});

export type MemoryType = z.infer<typeof MemoryTypeSchema>;
export type MemoryItem = z.infer<typeof MemoryItemSchema>;
export type MemorySearch = z.infer<typeof MemorySearchSchema>;

// ─── Memory Errors ─────────────────────────────────────────────────────────

export class MemoryPermissionError extends Error {
  constructor(memoryId: string, userId: string) {
    super(`User ${userId} lacks permission to access memory ${memoryId}`);
    this.name = 'MemoryPermissionError';
  }
}

// ─── Memory Service ────────────────────────────────────────────────────────

export interface MemoryServiceDeps {
  db: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> };
  embedder: { embed: (text: string) => Promise<number[]> };
  summarizer: { summarize: (text: string, maxTokens?: number) => Promise<string> };
  logger: { info: (msg: string, meta?: unknown) => void };
  auditLogger: { log: (event: string, data: unknown) => Promise<void> };
}

export class MemoryService {
  constructor(private deps: MemoryServiceDeps) {}

  /** Create a new memory item with optional embedding */
  async create(item: MemoryItem): Promise<string> {
    const validated = MemoryItemSchema.parse(item);

    // Generate embedding for semantic search
    let embedding: number[] | undefined;
    const valueStr = typeof validated.value === 'string'
      ? validated.value
      : JSON.stringify(validated.value);

    try {
      embedding = await this.deps.embedder.embed(valueStr);
    } catch {
      this.deps.logger.info('Embedding failed, storing without vector', { key: validated.key });
    }

    // Auto-summarize long text
    let summary = validated.summary;
    if (!summary && valueStr.length > 500) {
      try {
        summary = await this.deps.summarizer.summarize(valueStr, 100);
      } catch {
        // Non-fatal
      }
    }

    const { rows } = await this.deps.db.query(
      `INSERT INTO memory_items
         (organization_id, workspace_id, user_id, agent_id, type, key, value,
          summary, embedding, tags, visibility, expires_at, metadata, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::vector,$10,$11,$12,$13::jsonb,NOW(),NOW())
       RETURNING id`,
      [
        validated.organizationId,
        validated.workspaceId ?? null,
        validated.userId ?? null,
        validated.agentId ?? null,
        validated.type,
        validated.key,
        JSON.stringify(validated.value),
        summary ?? null,
        embedding ? JSON.stringify(embedding) : null,
        validated.tags,
        validated.visibility,
        validated.expiresAt ?? null,
        JSON.stringify(validated.metadata ?? {}),
      ]
    );

    const id = (rows[0] as { id: string }).id;
    await this.deps.auditLogger.log('MEMORY_CREATED', { id, type: validated.type, key: validated.key, orgId: validated.organizationId });
    return id;
  }

  /** Retrieve a memory item with permission check */
  async get(id: string, requesterId: string, orgId: string): Promise<MemoryItem | null> {
    const { rows } = await this.deps.db.query(
      `SELECT * FROM memory_items WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );

    if (!rows.length) return null;

    const raw = rows[0] as Record<string, unknown>;
    await this.checkPermission(raw, requesterId);

    await this.deps.auditLogger.log('MEMORY_READ', { id, requesterId, orgId });
    return this.mapRow(raw);
  }

  /** Semantic search across memory items */
  async search(params: MemorySearch): Promise<Array<MemoryItem & { similarity: number }>> {
    const validated = MemorySearchSchema.parse(params);

    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.deps.embedder.embed(validated.query);
    } catch {
      return this.fallbackSearch(validated);
    }

    const { rows } = await this.deps.db.query(
      `SELECT *, 1 - (embedding <=> $1::vector) as similarity
       FROM memory_items
       WHERE organization_id = $2
         AND (expires_at IS NULL OR expires_at > NOW())
         AND ($3::text[] IS NULL OR type = ANY($3))
         AND ($4::uuid IS NULL OR user_id = $4 OR visibility IN ('workspace','organization'))
         AND 1 - (embedding <=> $1::vector) >= $5
       ORDER BY similarity DESC
       LIMIT $6`,
      [
        JSON.stringify(queryEmbedding),
        validated.organizationId,
        validated.types ?? null,
        validated.userId ?? null,
        validated.similarityThreshold,
        validated.limit,
      ]
    );

    await this.deps.auditLogger.log('MEMORY_SEARCHED', {
      orgId: validated.organizationId,
      query: validated.query.substring(0, 100),
      results: rows.length,
    });

    return (rows as Record<string, unknown>[]).map((r) => ({
      ...this.mapRow(r),
      similarity: r.similarity as number,
    }));
  }

  /** Update memory value and re-embed */
  async update(id: string, orgId: string, value: unknown, requesterId: string): Promise<void> {
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);

    let embedding: number[] | undefined;
    try {
      embedding = await this.deps.embedder.embed(valueStr);
    } catch { /* Non-fatal */ }

    await this.deps.db.query(
      `UPDATE memory_items
       SET value = $1::jsonb,
           embedding = $2::vector,
           updated_at = NOW()
       WHERE id = $3 AND organization_id = $4`,
      [JSON.stringify(value), embedding ? JSON.stringify(embedding) : null, id, orgId]
    );

    await this.deps.auditLogger.log('MEMORY_UPDATED', { id, requesterId, orgId });
  }

  /** Prune expired memories */
  async prune(orgId: string): Promise<number> {
    const { rows } = await this.deps.db.query(
      `DELETE FROM memory_items
       WHERE organization_id = $1 AND expires_at < NOW()
       RETURNING id`,
      [orgId]
    );
    this.deps.logger.info('Memory pruned', { orgId, count: rows.length });
    return rows.length;
  }

  /** Summarize a set of memories for context compression */
  async summarizeSet(ids: string[], orgId: string): Promise<string> {
    const { rows } = await this.deps.db.query(
      `SELECT key, value FROM memory_items WHERE id = ANY($1) AND organization_id = $2`,
      [ids, orgId]
    );

    const text = (rows as Record<string, unknown>[])
      .map((r) => `${r.key}: ${JSON.stringify(r.value)}`)
      .join('\n');

    return this.deps.summarizer.summarize(text, 300);
  }

  private async checkPermission(raw: Record<string, unknown>, requesterId: string): Promise<void> {
    const visibility = raw.visibility as string;
    const ownerId = raw.user_id as string;

    if (visibility === 'private' && ownerId !== requesterId) {
      throw new MemoryPermissionError(raw.id as string, requesterId);
    }
  }

  private async fallbackSearch(params: MemorySearch): Promise<Array<MemoryItem & { similarity: number }>> {
    const { rows } = await this.deps.db.query(
      `SELECT *, 0.5 as similarity FROM memory_items
       WHERE organization_id = $1
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (value::text ILIKE $2 OR key ILIKE $2)
       LIMIT $3`,
      [params.organizationId, `%${params.query}%`, params.limit]
    );
    return (rows as Record<string, unknown>[]).map((r) => ({ ...this.mapRow(r), similarity: 0.5 }));
  }

  private mapRow(r: Record<string, unknown>): MemoryItem {
    return {
      id: r.id as string,
      organizationId: r.organization_id as string,
      workspaceId: r.workspace_id as string | undefined,
      userId: r.user_id as string | undefined,
      agentId: r.agent_id as string | undefined,
      type: r.type as MemoryType,
      key: r.key as string,
      value: typeof r.value === 'string' ? JSON.parse(r.value) : r.value,
      summary: r.summary as string | undefined,
      tags: (r.tags as string[]) ?? [],
      visibility: r.visibility as 'private' | 'workspace' | 'organization',
      expiresAt: r.expires_at as string | undefined,
      metadata: r.metadata as Record<string, unknown> | undefined,
    };
  }
}
