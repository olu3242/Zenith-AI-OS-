/**
 * @zenith/aios-context — ContextService Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextService, InMemoryContextStore } from '../../packages/aios-context/src/ContextService.js';

function makeService() {
  return new ContextService(new InMemoryContextStore());
}

describe('ContextService', () => {
  let svc: ContextService;
  beforeEach(() => { svc = makeService(); });

  describe('create()', () => {
    it('creates a session with a generated sessionId', async () => {
      const ctx = await svc.create({ organizationId: 'org-1', userId: 'user-1', role: 'developer' });
      expect(ctx.sessionId).toBeTruthy();
      expect(ctx.organizationId).toBe('org-1');
      expect(ctx.userId).toBe('user-1');
      expect(ctx.role).toBe('developer');
    });

    it('respects a caller-supplied sessionId', async () => {
      const ctx = await svc.create({ sessionId: 'my-id', organizationId: 'org-1', userId: 'u1', role: 'developer' });
      expect(ctx.sessionId).toBe('my-id');
    });
  });

  describe('get()', () => {
    it('returns null for unknown sessionId', async () => {
      const result = await svc.get('nonexistent');
      expect(result).toBeNull();
    });

    it('returns the context after create', async () => {
      const created = await svc.create({ organizationId: 'org-1', userId: 'u1', role: 'developer' });
      const fetched = await svc.get(created.sessionId);
      expect(fetched).not.toBeNull();
      expect(fetched!.sessionId).toBe(created.sessionId);
    });
  });

  describe('getOrCreate()', () => {
    it('creates when session does not exist', async () => {
      const ctx = await svc.getOrCreate({ sessionId: 'new-id', organizationId: 'org-1', userId: 'u1', role: 'developer' });
      expect(ctx.sessionId).toBe('new-id');
    });

    it('returns existing session without overwriting', async () => {
      const first = await svc.create({ sessionId: 'stable', organizationId: 'org-1', userId: 'u1', role: 'developer' });
      const second = await svc.getOrCreate({ sessionId: 'stable', organizationId: 'org-1', userId: 'u1', role: 'analyst' });
      expect(second.role).toBe('developer'); // unchanged
      expect(second.sessionId).toBe(first.sessionId);
    });
  });

  describe('update()', () => {
    it('merges patch into existing session', async () => {
      const ctx = await svc.create({ organizationId: 'org-1', userId: 'u1', role: 'developer' });
      const updated = await svc.update(ctx.sessionId, { role: 'analyst' });
      expect(updated.role).toBe('analyst');
      expect(updated.userId).toBe('u1');
    });

    it('throws when session not found', async () => {
      await expect(svc.update('ghost', { role: 'admin' })).rejects.toThrow('Session not found');
    });
  });

  describe('delete()', () => {
    it('removes the session', async () => {
      const ctx = await svc.create({ organizationId: 'org-1', userId: 'u1', role: 'developer' });
      await svc.delete(ctx.sessionId);
      const result = await svc.get(ctx.sessionId);
      expect(result).toBeNull();
    });
  });

  describe('list()', () => {
    it('returns only sessions for the given org', async () => {
      await svc.create({ organizationId: 'org-A', userId: 'u1', role: 'developer' });
      await svc.create({ organizationId: 'org-A', userId: 'u2', role: 'developer' });
      await svc.create({ organizationId: 'org-B', userId: 'u3', role: 'developer' });

      const orgA = await svc.list('org-A');
      const orgB = await svc.list('org-B');

      expect(orgA).toHaveLength(2);
      expect(orgB).toHaveLength(1);
    });
  });
});
