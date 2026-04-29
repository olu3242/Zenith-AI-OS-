import { v4 as uuidv4 } from 'uuid';
import { type CreateContextInput, type SessionContext, SessionContextSchema } from './types.js';

export interface ContextStore {
  get(sessionId: string): Promise<SessionContext | null>;
  set(sessionId: string, ctx: SessionContext, ttlSeconds?: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
  list(organizationId: string): Promise<SessionContext[]>;
}

export class InMemoryContextStore implements ContextStore {
  private store = new Map<string, { ctx: SessionContext; expiresAt?: number }>();

  async get(sessionId: string): Promise<SessionContext | null> {
    const entry = this.store.get(sessionId);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(sessionId);
      return null;
    }
    return entry.ctx;
  }

  async set(sessionId: string, ctx: SessionContext, ttlSeconds?: number): Promise<void> {
    this.store.set(sessionId, {
      ctx,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async delete(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  async list(organizationId: string): Promise<SessionContext[]> {
    const now = Date.now();
    return [...this.store.values()]
      .filter(e => (!e.expiresAt || now < e.expiresAt) && e.ctx.organizationId === organizationId)
      .map(e => e.ctx);
  }
}

export class ContextService {
  constructor(private readonly store: ContextStore) {}

  async create(input: CreateContextInput): Promise<SessionContext> {
    const ctx = SessionContextSchema.parse({
      ...input,
      sessionId: input.sessionId ?? uuidv4(),
    });
    await this.store.set(ctx.sessionId, ctx);
    return ctx;
  }

  async get(sessionId: string): Promise<SessionContext | null> {
    return this.store.get(sessionId);
  }

  async getOrCreate(input: CreateContextInput): Promise<SessionContext> {
    const existing = await this.store.get(input.sessionId);
    if (existing) return existing;
    return this.create(input);
  }

  async update(sessionId: string, patch: Partial<CreateContextInput>): Promise<SessionContext> {
    const existing = await this.store.get(sessionId);
    if (!existing) throw new Error(`Session not found: ${sessionId}`);
    const updated = SessionContextSchema.parse({ ...existing, ...patch, updatedAt: new Date() });
    await this.store.set(sessionId, updated);
    return updated;
  }

  async delete(sessionId: string): Promise<void> {
    await this.store.delete(sessionId);
  }

  async list(organizationId: string): Promise<SessionContext[]> {
    return this.store.list(organizationId);
  }
}
