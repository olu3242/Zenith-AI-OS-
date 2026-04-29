import { v4 as uuidv4 } from 'uuid';

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes: Record<string, unknown>;
}

export interface Span {
  id: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  service: string;
  startTime: number;
  endTime?: number;
  status: 'ok' | 'error';
  attributes: Record<string, unknown>;
  events: SpanEvent[];
}

export interface TraceMetrics {
  traceId: string;
  totalDurationMs: number;
  spanCount: number;
  errorCount: number;
  tokenUsage: { input: number; output: number };
  estimatedCostUsd: number;
}

export class AIOSTracer {
  private spans = new Map<string, Span>();

  startTrace(name: string, service: string): Span {
    const span: Span = {
      id: uuidv4(), traceId: uuidv4(), name, service,
      startTime: Date.now(), status: 'ok', attributes: {}, events: [],
    };
    this.spans.set(span.id, span);
    return span;
  }

  startSpan(name: string, service: string, traceId: string, parentSpanId?: string): Span {
    const span: Span = {
      id: uuidv4(), traceId, parentSpanId, name, service,
      startTime: Date.now(), status: 'ok', attributes: {}, events: [],
    };
    this.spans.set(span.id, span);
    return span;
  }

  endSpan(spanId: string, status: 'ok' | 'error' = 'ok', attributes?: Record<string, unknown>): void {
    const span = this.spans.get(spanId);
    if (!span) return;
    span.endTime = Date.now();
    span.status = status;
    if (attributes) Object.assign(span.attributes, attributes);
  }

  addEvent(spanId: string, name: string, attributes?: Record<string, unknown>): void {
    const span = this.spans.get(spanId);
    if (!span) return;
    span.events.push({ name, timestamp: Date.now(), attributes: attributes ?? {} });
  }

  getTrace(traceId: string): Span[] {
    return [...this.spans.values()].filter(s => s.traceId === traceId);
  }

  getMetrics(traceId: string): TraceMetrics {
    const spans = this.getTrace(traceId);
    const root = spans.find(s => !s.parentSpanId);
    const totalDurationMs = root?.endTime ? root.endTime - root.startTime : 0;
    const errorCount = spans.filter(s => s.status === 'error').length;
    const inputTokens = spans.reduce((sum, s) => sum + ((s.attributes['inputTokens'] as number) ?? 0), 0);
    const outputTokens = spans.reduce((sum, s) => sum + ((s.attributes['outputTokens'] as number) ?? 0), 0);
    return {
      traceId, totalDurationMs, spanCount: spans.length, errorCount,
      tokenUsage: { input: inputTokens, output: outputTokens },
      estimatedCostUsd: inputTokens * 0.000003 + outputTokens * 0.000015,
    };
  }
}

export class QualityScorer {
  score(response: string, expectedKeywords?: string[]): { score: number; feedback: string } {
    let score = 0;
    const feedback: string[] = [];
    const words = response.trim().split(/\s+/);
    if (words.length >= 50) { score += 30; } else { feedback.push('Response is short'); }
    if (response.includes('\n')) { score += 20; feedback.push('Has structure'); }
    if (expectedKeywords?.length) {
      const lower = response.toLowerCase();
      const covered = expectedKeywords.filter(k => lower.includes(k.toLowerCase()));
      score += Math.round((covered.length / expectedKeywords.length) * 50);
    } else {
      score += 50;
    }
    return { score: Math.min(score, 100), feedback: feedback.join(', ') || 'OK' };
  }
}
