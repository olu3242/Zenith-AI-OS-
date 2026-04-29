/**
 * AIOS Knowledge Service
 * Manages knowledge sources, chunking, embedding, semantic retrieval,
 * provenance tracking, freshness validation, and hallucination guardrails.
 */

import { z } from 'zod';

// ─── Schemas ───────────────────────────────────────────────────────────────

export const SourceTypeSchema = z.enum([
  'pdf', 'markdown', 'webpage', 'database', 'api', 'transcript', 'manual', 'code',
]);

export const KnowledgeSourceSchema = z.object({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  name: z.string(),
  sourceType: SourceTypeSchema,
  uri: z.string().optional(),
  trustScore: z.number().min(0).max(1).default(0.8),
  tags: z.array(z.string()).default([]),
  isPublic: z.boolean().default(false),
  refreshIntervalHours: z.number().int().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const KnowledgeChunkSchema = z.object({
  id: z.string().uuid().optional(),
  sourceId: z.string().uuid(),
  organizationId: z.string().uuid(),
  content: z.string(),
  chunkIndex: z.number().int(),
  tokenCount: z.number().int(),
  heading: z.string().optional(),
  pageNumber: z.number().int().optional(),
  embedding: z.array(z.number()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type SourceType = z.infer<typeof SourceTypeSchema>;
export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>;
export type KnowledgeChunk = z.infer<typeof KnowledgeChunkSchema>;

export interface RetrievalResult {
  chunk: KnowledgeChunk;
  source: KnowledgeSource;
  similarity: number;
  provenance: string;
}

export interface HallucinationCheckResult {
  grounded: boolean;
  confidence: number;
  supportingChunks: string[];
  ungroundedClaims: string[];
}

// ─── Knowledge Service ─────────────────────────────────────────────────────

export interface KnowledgeServiceDeps {
  db: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> };
  embedder: { embed: (text: string) => Promise<number[]> };
  chunker: { chunk: (text: string, maxTokens?: number) => string[] };
  auditLogger: { log: (event: string, data: unknown) => Promise<void> };
  logger: { info: (msg: string, meta?: unknown) => void; error: (msg: string, meta?: unknown) => void };
}

export class KnowledgeService {
  constructor(private deps: KnowledgeServiceDeps) {}

  /** Register a knowledge source */
  async registerSource(source: KnowledgeSource): Promise<string> {
    const v = KnowledgeSourceSchema.parse(source);
    const { rows } = await this.deps.db.query(
      `INSERT INTO knowledge_sources
         (organization_id, workspace_id, name, source_type, uri, trust_score,
          tags, is_public, refresh_interval_hours, metadata, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW(),NOW())
       RETURNING id`,
      [
        v.organizationId, v.workspaceId ?? null, v.name, v.sourceType,
        v.uri ?? null, v.trustScore, v.tags, v.isPublic,
        v.refreshIntervalHours ?? null, JSON.stringify(v.metadata ?? {}),
      ]
    );
    const id = (rows[0] as { id: string }).id;
    await this.deps.auditLogger.log('KNOWLEDGE_SOURCE_REGISTERED', { id, name: v.name, orgId: v.organizationId });
    return id;
  }

  /** Ingest text: chunk → embed → store */
  async ingest(params: {
    sourceId: string;
    organizationId: string;
    text: string;
    chunkMaxTokens?: number;
  }): Promise<{ chunksCreated: number }> {
    const chunks = this.deps.chunker.chunk(params.text, params.chunkMaxTokens ?? 512);
    let created = 0;

    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];
      let embedding: number[] | null = null;

      try {
        embedding = await this.deps.embedder.embed(content);
      } catch {
        this.deps.logger.error('Embedding failed for chunk', { sourceId: params.sourceId, chunkIndex: i });
      }

      await this.deps.db.query(
        `INSERT INTO knowledge_chunks
           (source_id, organization_id, content, chunk_index, token_count, embedding, created_at)
         VALUES ($1,$2,$3,$4,$5,$6::vector,NOW())`,
        [
          params.sourceId, params.organizationId, content, i,
          Math.ceil(content.length / 4), // rough token estimate
          embedding ? JSON.stringify(embedding) : null,
        ]
      );
      created++;
    }

    await this.deps.db.query(
      `UPDATE knowledge_sources SET chunk_count = $1, last_indexed_at = NOW() WHERE id = $2`,
      [created, params.sourceId]
    );

    await this.deps.auditLogger.log('KNOWLEDGE_INGESTED', {
      sourceId: params.sourceId, orgId: params.organizationId, chunksCreated: created,
    });

    return { chunksCreated: created };
  }

  /** Semantic retrieval with provenance */
  async retrieve(params: {
    query: string;
    organizationId: string;
    workspaceId?: string;
    limit?: number;
    trustThreshold?: number;
    similarityThreshold?: number;
  }): Promise<RetrievalResult[]> {
    const limit = params.limit ?? 5;
    const trustThreshold = params.trustThreshold ?? 0.5;
    const similarityThreshold = params.similarityThreshold ?? 0.65;

    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.deps.embedder.embed(params.query);
    } catch {
      return this.fallbackRetrieve(params);
    }

    const { rows } = await this.deps.db.query(
      `SELECT
         kc.*, ks.name as source_name, ks.source_type, ks.uri, ks.trust_score,
         1 - (kc.embedding <=> $1::vector) as similarity
       FROM knowledge_chunks kc
       JOIN knowledge_sources ks ON ks.id = kc.source_id
       WHERE kc.organization_id = $2
         AND ($3::uuid IS NULL OR ks.workspace_id = $3)
         AND ks.trust_score >= $4
         AND 1 - (kc.embedding <=> $1::vector) >= $5
       ORDER BY similarity DESC
       LIMIT $6`,
      [
        JSON.stringify(queryEmbedding),
        params.organizationId,
        params.workspaceId ?? null,
        trustThreshold,
        similarityThreshold,
        limit,
      ]
    );

    await this.logRetrieval(params.query, params.organizationId, rows.length);

    return (rows as Record<string, unknown>[]).map((r) => ({
      chunk: {
        id: r.id as string,
        sourceId: r.source_id as string,
        organizationId: r.organization_id as string,
        content: r.content as string,
        chunkIndex: r.chunk_index as number,
        tokenCount: r.token_count as number,
      },
      source: {
        id: r.source_id as string,
        organizationId: r.organization_id as string,
        name: r.source_name as string,
        sourceType: r.source_type as SourceType,
        uri: r.uri as string | undefined,
        trustScore: r.trust_score as number,
        tags: [],
        isPublic: false,
      },
      similarity: r.similarity as number,
      provenance: `${r.source_name} (${r.source_type}) — chunk ${r.chunk_index}, trust: ${r.trust_score}`,
    }));
  }

  /** Check if an LLM response is grounded in retrieved context */
  async checkGrounding(params: {
    response: string;
    retrievedChunks: RetrievalResult[];
    organizationId: string;
  }): Promise<HallucinationCheckResult> {
    const claims = this.extractClaims(params.response);
    const supportingChunks: string[] = [];
    const ungroundedClaims: string[] = [];

    for (const claim of claims) {
      const isSupported = params.retrievedChunks.some((r) =>
        r.chunk.content.toLowerCase().includes(claim.toLowerCase().substring(0, 30))
      );
      if (isSupported) {
        supportingChunks.push(claim.substring(0, 100));
      } else {
        ungroundedClaims.push(claim.substring(0, 100));
      }
    }

    const confidence = claims.length > 0
      ? supportingChunks.length / claims.length
      : 1;

    const grounded = ungroundedClaims.length === 0 || confidence >= 0.8;

    if (!grounded) {
      await this.deps.auditLogger.log('HALLUCINATION_DETECTED', {
        orgId: params.organizationId,
        ungroundedCount: ungroundedClaims.length,
        confidence,
      });
    }

    return { grounded, confidence, supportingChunks, ungroundedClaims };
  }

  /** Check if sources need refresh */
  async checkFreshness(organizationId: string): Promise<Array<{ sourceId: string; name: string; lastIndexedAt: string }>> {
    const { rows } = await this.deps.db.query(
      `SELECT id, name, last_indexed_at, refresh_interval_hours
       FROM knowledge_sources
       WHERE organization_id = $1
         AND refresh_interval_hours IS NOT NULL
         AND (
           last_indexed_at IS NULL OR
           last_indexed_at < NOW() - INTERVAL '1 hour' * refresh_interval_hours
         )`,
      [organizationId]
    );
    return (rows as Record<string, unknown>[]).map((r) => ({
      sourceId: r.id as string,
      name: r.name as string,
      lastIndexedAt: r.last_indexed_at as string,
    }));
  }

  private extractClaims(text: string): string[] {
    // Split on sentence boundaries — simple heuristic
    return text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20).slice(0, 10);
  }

  private async fallbackRetrieve(params: { query: string; organizationId: string; limit?: number }): Promise<RetrievalResult[]> {
    const { rows } = await this.deps.db.query(
      `SELECT kc.*, ks.name as source_name, ks.source_type, ks.uri, ks.trust_score, 0.5 as similarity
       FROM knowledge_chunks kc
       JOIN knowledge_sources ks ON ks.id = kc.source_id
       WHERE kc.organization_id = $1 AND kc.content ILIKE $2
       LIMIT $3`,
      [params.organizationId, `%${params.query.substring(0, 30)}%`, params.limit ?? 5]
    );
    return (rows as Record<string, unknown>[]).map((r) => ({
      chunk: { id: r.id as string, sourceId: r.source_id as string, organizationId: r.organization_id as string, content: r.content as string, chunkIndex: r.chunk_index as number, tokenCount: r.token_count as number },
      source: { id: r.source_id as string, organizationId: r.organization_id as string, name: r.source_name as string, sourceType: r.source_type as SourceType, trustScore: r.trust_score as number, tags: [], isPublic: false },
      similarity: 0.5,
      provenance: `${r.source_name} (fallback text search)`,
    }));
  }

  private async logRetrieval(query: string, orgId: string, resultCount: number): Promise<void> {
    await this.deps.db.query(
      `INSERT INTO retrieval_queries (organization_id, query_text, result_count, created_at)
       VALUES ($1,$2,$3,NOW())`,
      [orgId, query.substring(0, 500), resultCount]
    );
  }
}
