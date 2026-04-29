/**
 * AIOS Observability Tracer
 * Distributed tracing for agents, tools, and workflows.
 * Captures latency, token cost, quality scores, and supports replay.
 */

import { z } from 'zod';

// ─── Schemas ───────────────────────────────────────────────────────────────

export const TraceEventTypeSchema = z.enum([
  'agent_run', 'tool_call', 'workflow_step', 'policy_evaluation',
  'memory_access', 'knowledge_retrieval', 'llm_completion', 'security_check',
]);

export type TraceEventType = z.infer<typeof TraceEventTypeSchema>;

export interface TraceSpan {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  type: TraceEventType;
  organizationId: string;
  userId?: string;
  sessionId?: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: 'running' | 'completed' | 'failed' | 'timed_out';
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  tokensUsed?: number;
  costUsd?: number;
  qualityScore?: number;
  error?: string;
  metadata: Record<string, unknown>;
}

export interface TraceMetrics {
  traceId: string;
  totalDurationMs: number;
  totalTokens: number;
  totalCostUsd: number;
  spanCount: number;
  failureCount: number;
  avgQualityScore?: number;
}

// ─── AIOS Tracer ───────────────────────────────────────────────────────────

export interface TracerDeps {
  db: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> };
  logger: { info: (msg: string, meta?: unknown) => void; error: (msg: string, meta?: unknown) => void };
}

export class AIOSTracer {
  private activeSpans = new Map<string, TraceSpan>();

  constructor(private deps: TracerDeps) {}

  /** Start a new trace (root span) */
  startTrace(params: {
    name: string;
    type: TraceEventType;
    organizationId: string;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }): { traceId: string; span: ReturnType<AIOSTracer['startSpan']> } {
    const traceId = this.generateId();
    const span = this.startSpan({ ...params, traceId });
    return { traceId, span };
  }

  /** Start a child span */
  startSpan(params: {
    name: string;
    type?: TraceEventType;
    traceId: string;
    parentSpanId?: string;
    organizationId?: string;
    userId?: string;
    sessionId?: string;
    input?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): {
    spanId: string;
    end: (result?: { output?: Record<string, unknown>; tokensUsed?: number; costUsd?: number; qualityScore?: number; error?: string }) => void;
    addMetadata: (key: string, value: unknown) => void;
  } {
    const spanId = this.generateId();
    const span: TraceSpan = {
      spanId,
      traceId: params.traceId,
      parentSpanId: params.parentSpanId,
      name: params.name,
      type: (params.type ?? 'agent_run') as TraceEventType,
      organizationId: params.organizationId ?? 'unknown',
      userId: params.userId,
      sessionId: params.sessionId,
      startTime: Date.now(),
      status: 'running',
      input: params.input,
      metadata: params.metadata ?? {},
    };

    this.activeSpans.set(spanId, span);

    return {
      spanId,
      end: (result) => this.endSpan(spanId, result),
      addMetadata: (key, value) => {
        const s = this.activeSpans.get(spanId);
        if (s) s.metadata[key] = value;
      },
    };
  }

  /** End a span and persist it */
  private endSpan(
    spanId: string,
    result?: {
      output?: Record<string, unknown>;
      tokensUsed?: number;
      costUsd?: number;
      qualityScore?: number;
      error?: string;
    }
  ): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    span.status = result?.error ? 'failed' : 'completed';
    span.output = result?.output;
    span.tokensUsed = result?.tokensUsed;
    span.costUsd = result?.costUsd;
    span.qualityScore = result?.qualityScore;
    span.error = result?.error;

    this.activeSpans.delete(spanId);
    this.persistSpan(span).catch((err) => this.deps.logger.error('Failed to persist span', { spanId, error: err.message }));
  }

  private async persistSpan(span: TraceSpan): Promise<void> {
    await this.deps.db.query(
      `INSERT INTO traces
         (span_id, trace_id, parent_span_id, name, type, organization_id, user_id, session_id,
          start_time, end_time, duration_ms, status, input, output, tokens_used, cost_usd,
          quality_score, error, metadata, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
               to_timestamp($9/1000.0), to_timestamp($10/1000.0), $11,$12,
               $13::jsonb,$14::jsonb,$15,$16,$17,$18,$19::jsonb,NOW())
       ON CONFLICT (span_id) DO NOTHING`,
      [
        span.spanId, span.traceId, span.parentSpanId ?? null,
        span.name, span.type, span.organizationId, span.userId ?? null, span.sessionId ?? null,
        span.startTime, span.endTime ?? span.startTime, span.durationMs ?? 0, span.status,
        JSON.stringify(span.input ?? {}), JSON.stringify(span.output ?? {}),
        span.tokensUsed ?? null, span.costUsd ?? null, span.qualityScore ?? null,
        span.error ?? null, JSON.stringify(span.metadata),
      ]
    );
  }

  /** Get all spans for a trace */
  async getTrace(traceId: string, orgId: string): Promise<TraceSpan[]> {
    const { rows } = await this.deps.db.query(
      `SELECT * FROM traces WHERE trace_id = $1 AND organization_id = $2 ORDER BY start_time ASC`,
      [traceId, orgId]
    );
    return rows as TraceSpan[];
  }

  /** Compute aggregate metrics for a trace */
  async getMetrics(traceId: string, orgId: string): Promise<TraceMetrics> {
    const { rows } = await this.deps.db.query(
      `SELECT
         COUNT(*) as span_count,
         SUM(duration_ms) as total_duration_ms,
         SUM(tokens_used) as total_tokens,
         SUM(cost_usd) as total_cost_usd,
         COUNT(*) FILTER (WHERE status = 'failed') as failure_count,
         AVG(quality_score) FILTER (WHERE quality_score IS NOT NULL) as avg_quality
       FROM traces WHERE trace_id = $1 AND organization_id = $2`,
      [traceId, orgId]
    );

    const r = rows[0] as Record<string, unknown>;
    return {
      traceId,
      totalDurationMs: parseFloat(r.total_duration_ms as string) || 0,
      totalTokens: parseInt(r.total_tokens as string, 10) || 0,
      totalCostUsd: parseFloat(r.total_cost_usd as string) || 0,
      spanCount: parseInt(r.span_count as string, 10) || 0,
      failureCount: parseInt(r.failure_count as string, 10) || 0,
      avgQualityScore: r.avg_quality ? parseFloat(r.avg_quality as string) : undefined,
    };
  }

  /** Record a reliability alert */
  async alert(params: {
    orgId: string; traceId?: string; alertType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string; threshold?: number; actual?: number;
  }): Promise<void> {
    await this.deps.db.query(
      `INSERT INTO reliability_alerts (organization_id, trace_id, alert_type, severity, message, threshold, actual, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [params.orgId, params.traceId ?? null, params.alertType, params.severity, params.message, params.threshold ?? null, params.actual ?? null]
    );

    if (params.severity === 'critical') {
      this.deps.logger.error('CRITICAL RELIABILITY ALERT', params);
    }
  }

  /** Save a replay session for a trace */
  async saveReplaySession(traceId: string, orgId: string, userId: string): Promise<string> {
    const { rows } = await this.deps.db.query(
      `INSERT INTO replay_sessions (trace_id, organization_id, created_by, status, created_at)
       VALUES ($1,$2,$3,'ready',NOW())
       RETURNING id`,
      [traceId, orgId, userId]
    );
    return (rows[0] as { id: string }).id;
  }

  /** Retrieve recent failed traces for a given org (for alerting) */
  async getRecentFailures(orgId: string, windowMinutes = 60, limit = 20): Promise<TraceSpan[]> {
    const { rows } = await this.deps.db.query(
      `SELECT * FROM traces
       WHERE organization_id = $1 AND status = 'failed'
         AND created_at >= NOW() - INTERVAL '${windowMinutes} minutes'
       ORDER BY created_at DESC
       LIMIT $2`,
      [orgId, limit]
    );
    return rows as TraceSpan[];
  }

  private generateId(): string {
    return `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
