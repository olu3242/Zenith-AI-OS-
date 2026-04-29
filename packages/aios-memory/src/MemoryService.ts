import { v4 as uuidv4 } from 'uuid';
import { type MemoryEntry, MemoryEntrySchema, type MemorySearchParams, type MemoryType } from './types.js';

export interface MemoryStore {
  save(entry: MemoryEntry): Promise<void>;
  getById(id: string, organizationId: string): Promise<MemoryEntry | null>;
  search(params: MemorySearchParams): Promise<MemoryEntry[]>;
  delete(id: string, organizationId: string): Promise<void>;
  clearSession(sessionId: string, organizationId: string): Promise<void>;
}

export class InMemoryMemoryStore implements MemoryStore {
  private entries = new Map<string, MemoryEntry>();

  async save(entry: MemoryEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async getById(id: string, organizationId: string): Promise<MemoryEntry | null> {
    const e = this.entries.get(id);
    return e?.organizationId === organizationId ? e : null;
  }

  async search({ query, organizationId, sessionId, type, limit = 10, tags }: MemorySearchParams): Promise<MemoryEntry[]> {
    const now = new Date();
    const queryWords = new Set(query.toLowerCase().split(/\s+/));

    let results = [...this.entries.values()].filter(e => {
      if (e.organizationId !== organizationId) return false;
      if (e.expiresAt && e.expiresAt < now) return false;
      if (sessionId && e.sessionId !== sessionId) return false;
      if (type && e.type !== type) return false;
      if (tags?.length && !tags.some(t => e.tags.includes(t))) return false;
      return true;
    });

    const scored = results.map(e => {
      const words = new Set(e.content.toLowerCase().split(/\s+/));
      const overlap = [...queryWords].filter(w => words.has(w)).length;
      return { ...e, score: overlap };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async delete(id: string, organizationId: string): Promise<void> {
    const e = this.entries.get(id);
    if (e?.organizationId === organizationId) this.entries.delete(id);
  }

  async clearSession(sessionId: string, organizationId: string): Promise<void> {
    for (const [id, e] of this.entries) {
      if (e.sessionId === sessionId && e.organizationId === organizationId) {
        this.entries.delete(id);
      }
    }
  }
}

export class MemoryService {
  constructor(private readonly store: MemoryStore) {}

  async remember(params: {
    organizationId: string;
    sessionId?: string;
    userId?: string;
    type: MemoryType;
    content: string;
    tags?: string[];
    entityName?: string;
    expiresAt?: Date;
    metadata?: Record<string, unknown>;
  }): Promise<MemoryEntry> {
    const entry = MemoryEntrySchema.parse({ id: uuidv4(), ...params });
    await this.store.save(entry);
    return entry;
  }

  async search(params: MemorySearchParams): Promise<MemoryEntry[]> {
    return this.store.search(params);
  }

  async get(id: string, organizationId: string): Promise<MemoryEntry | null> {
    return this.store.getById(id, organizationId);
  }

  async forget(id: string, organizationId: string): Promise<void> {
    return this.store.delete(id, organizationId);
  }

  async clearSession(sessionId: string, organizationId: string): Promise<void> {
    return this.store.clearSession(sessionId, organizationId);
  }

  async getConversationHistory(
    sessionId: string,
    organizationId: string,
    limit = 20,
  ): Promise<MemoryEntry[]> {
    return this.store.search({
      query: '',
      organizationId,
      sessionId,
      type: 'short_term',
      limit,
    });
  }
}
