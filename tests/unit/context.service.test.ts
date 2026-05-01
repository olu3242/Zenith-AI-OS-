/**
 * @zenith/aios-context — ContextService Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextService, InMemoryContextStore } from '../../packages/aios-context/src/ContextService.js';

function makeService() {
  return new ContextService(new InMemoryContextStore());
}

const BASE = { organizationId: 'org-1', tenantId: 'tenant-1', userId: 'user-1', role: 'developer' } as const;

describe('ContextService', () => {
  let svc: ContextService;
  beforeEach(() => { svc = makeService(); });

  describe('create()', () => {
    it('creates a session with a generated sessionId', async () => {
      const ctx = await svc.create(BASE);
      expect(ctx.sessionId).toBeTruthy();
      expect(ctx.organizationId).toBe('org-1');
      expect(ctx.tenantId).toBe('tenant-1');
      expect(ctx.userId).toBe('user-1');
      expect(ctx.role).toBe('developer');
    });

    it('respects a caller-supplied UUID sessionId', async () => {
      const id = '11111111-1111-4111-8111-111111111111';
      const ctx = await svc.create({ ...BASE, sessionId: id });
      expect(ctx.sessionId).toBe(id);
    });

    it('rejects a non-UUID sessionId', async () => {
      await expect(svc.create({ ...BASE, sessionId: 'not-a-uuid' })).rejects.toThrow();
    });
  });

  describe('get()', () => {
    it('returns null for unknown sessionId', async () => {
      const result = await svc.get('nonexistent');
      expect(result).toBeNull();
    });

    it('returns the context after create', async () => {
      const created = await svc.create(BASE);
      const fetched = await svc.get(created.sessionId);
      expect(fetched).not.toBeNull();
      expect(fetched!.sessionId).toBe(created.sessionId);
    });
  });

  describe('getOrCreate()', () => {
    it('creates when session does not exist', async () => {
      const id = '22222222-2222-4222-8222-222222222222';
      const ctx = await svc.getOrCreate({ ...BASE, sessionId: id });
      expect(ctx.sessionId).toBe(id);
    });

    it('returns existing session without overwriting', async () => {
      const id = '33333333-3333-4333-8333-333333333333';
      const first = await svc.create({ ...BASE, sessionId: id });
      const second = await svc.getOrCreate({ ...BASE, sessionId: id, role: 'analyst' });
      expect(second.role).toBe('developer'); // unchanged
      expect(second.sessionId).toBe(first.sessionId);
    });
  });

  describe('update()', () => {
    it('merges patch into existing session', async () => {
      const ctx = await svc.create(BASE);
      const updated = await svc.update(ctx.sessionId, { role: 'analyst' });
      expect(updated.role).toBe('analyst');
      expect(updated.userId).toBe('user-1');
    });

    it('throws when session not found', async () => {
      await expect(svc.update('ghost', { role: 'admin' })).rejects.toThrow('Session not found');
    });
  });

  describe('delete()', () => {
    it('removes the session', async () => {
      const ctx = await svc.create(BASE);
      await svc.delete(ctx.sessionId);
      const result = await svc.get(ctx.sessionId);
      expect(result).toBeNull();
    });
  });

  describe('list()', () => {
    it('returns only sessions for the given org', async () => {
      await svc.create({ ...BASE, organizationId: 'org-A', userId: 'u1' });
      await svc.create({ ...BASE, organizationId: 'org-A', userId: 'u2' });
      await svc.create({ ...BASE, organizationId: 'org-B', userId: 'u3' });

      const orgA = await svc.list('org-A');
      const orgB = await svc.list('org-B');

      expect(orgA).toHaveLength(2);
      expect(orgB).toHaveLength(1);
    });
  });
});
