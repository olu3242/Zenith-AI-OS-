import { v4 as uuidv4 } from 'uuid';
import {
  KnowledgeChunk,
  IngestInput,
  SearchInput,
  HallucinationAssessment,
} from './types.js';

export class InMemoryKnowledgeStore {
  private chunks = new Map<string, KnowledgeChunk>();

  save(chunk: KnowledgeChunk): void {
    this.chunks.set(chunk.id, chunk);
  }

  get(id: string): KnowledgeChunk | undefined {
    return this.chunks.get(id);
  }

  delete(id: string): boolean {
    return this.chunks.delete(id);
  }

  listByOrg(organizationId: string): KnowledgeChunk[] {
    return Array.from(this.chunks.values()).filter(
      (c) => c.organizationId === organizationId,
    );
  }

  listBySource(sourceId: string, organizationId: string): KnowledgeChunk[] {
    return Array.from(this.chunks.values()).filter(
      (c) => c.sourceId === sourceId && c.organizationId === organizationId,
    );
  }
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );
}

function keywordOverlapScore(query: string, content: string): number {
  const queryTokens = tokenize(query);
  const contentTokens = tokenize(content);
  if (queryTokens.size === 0) return 0;

  let matches = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) matches++;
  }
  return matches / queryTokens.size;
}

export class KnowledgeService {
  private store: InMemoryKnowledgeStore;

  constructor(store?: InMemoryKnowledgeStore) {
    this.store = store ?? new InMemoryKnowledgeStore();
  }

  ingest(input: IngestInput): KnowledgeChunk {
    const chunk: KnowledgeChunk = {
      id: uuidv4(),
      organizationId: input.organizationId,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
      content: input.content,
      summary: undefined,
      embedding: undefined,
      trustScore: 1.0,
      provenance: input.provenance,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    };
    this.store.save(chunk);
    return chunk;
  }

  search(input: SearchInput): KnowledgeChunk[] {
    const { query, organizationId, limit = 10, trustThreshold = 0 } = input;

    const candidates = this.store
      .listByOrg(organizationId)
      .filter((c) => c.trustScore >= trustThreshold);

    const scored = candidates.map((chunk) => {
      const overlap = keywordOverlapScore(query, chunk.content);
      // Combined score: 70% keyword overlap + 30% trust score
      const score = overlap * 0.7 + chunk.trustScore * 0.3;
      return { chunk, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.chunk);
  }

  getBySource(sourceId: string, orgId: string): KnowledgeChunk[] {
    return this.store.listBySource(sourceId, orgId);
  }

  delete(id: string, orgId: string): void {
    const chunk = this.store.get(id);
    if (!chunk) {
      throw new Error(`KnowledgeChunk not found: ${id}`);
    }
    if (chunk.organizationId !== orgId) {
      throw new Error(`KnowledgeChunk ${id} does not belong to org ${orgId}`);
    }
    this.store.delete(id);
  }
}

export class HallucinationGuard {
  assess(claim: string, chunks: KnowledgeChunk[]): HallucinationAssessment {
    if (chunks.length === 0) {
      return { grounded: false, supportingChunks: [], confidence: 0 };
    }

    const claimTokens = tokenize(claim);
    if (claimTokens.size === 0) {
      return { grounded: false, supportingChunks: [], confidence: 0 };
    }

    const supporting: KnowledgeChunk[] = [];
    let bestOverlap = 0;

    for (const chunk of chunks) {
      const contentTokens = tokenize(chunk.content);
      let matches = 0;
      for (const token of claimTokens) {
        if (contentTokens.has(token)) matches++;
      }
      const overlap = matches / claimTokens.size;

      if (overlap > 0) {
        supporting.push(chunk);
        if (overlap > bestOverlap) bestOverlap = overlap;
      }
    }

    // Confidence incorporates overlap quality and average trust of supporting chunks
    let confidence = 0;
    if (supporting.length > 0) {
      const avgTrust =
        supporting.reduce((sum, c) => sum + c.trustScore, 0) / supporting.length;
      confidence = bestOverlap * 0.6 + avgTrust * 0.4;
    }

    return {
      grounded: confidence > 0.3,
      supportingChunks: supporting,
      confidence,
    };
  }
}
