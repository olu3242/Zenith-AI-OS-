/**
 * @zenith/aios-context — ContextService Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextService, ContextResolutionError } from '../../packages/aios-context/src/context.service';

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockDb = {
  query: vi.fn(),
};

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
};

const mockAuditLogger = {
  log: vi.fn().mockResolvedValue(undefined),
};

function makeService() {
  return new ContextService({
    db: mockDb,
    logger: mockLogger,
    auditLogger: mockAuditLogger,
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('ContextService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('resolve()', () => {
    it('returns a valid context bundle when session exists', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          workspace_id: 'ws-1',
          role: 'admin',
          permissions: ['agent:run', 'tool:invoke'],
          active_intent: 'lead-qualification',
          workflow_id: null,
          agent_id: null,
          context_items: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      });

      const svc = makeService();
      const bundle = await svc.resolve({
        sessionId: 'session-uuid',
        organizationId: 'org-uuid',
        userId: 'user-uuid',
      });

      expect(bundle.role).toBe('admin');
      expect(bundle.permissions).toContain('agent:run');
      expect(bundle.intent).toBe('lead-qualification');
    });

    it('throws ContextResolutionError when session not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const svc = makeService();
      await expect(
        svc.resolve({ sessionId: 'bad', organizationId: 'org', userId: 'user' })
      ).rejects.toBeInstanceOf(ContextResolutionError);
    });
  });

  describe('set()', () => {
    it('calls db.query with correct update statement', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const svc = makeService();
      await svc.set('session-1', 'org-1', {
        key: 'customer_id',
        value: 'cust_abc',
        source: 'user',
        confidence: 1,
      });

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(mockAuditLogger.log).toHaveBeenCalledWith('CONTEXT_ITEM_SET', expect.objectContaining({ key: 'customer_id' }));
    });
  });

  describe('checkFreshness()', () => {
    it('detects expired context items', async () => {
      const svc = makeService();
      const bundle = {
        sessionId: 's1',
        organizationId: 'o1',
        workspaceId: 'w1',
        userId: 'u1',
        role: 'admin',
        permissions: [],
        items: {
          stale_item: {
            key: 'stale_item',
            value: 'old',
            source: 'user' as const,
            confidence: 1,
            expiresAt: new Date(Date.now() - 60_000).toISOString(), // 1 minute ago
          },
          fresh_item: {
            key: 'fresh_item',
            value: 'new',
            source: 'user' as const,
            confidence: 1,
            expiresAt: new Date(Date.now() + 60_000).toISOString(), // 1 minute from now
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { stale } = await svc.checkFreshness(bundle);
      expect(stale).toContain('stale_item');
      expect(stale).not.toContain('fresh_item');
    });
  });

  describe('propagate()', () => {
    it('propagates non-expired context items', () => {
      const svc = makeService();
      const bundle = {
        sessionId: 's1',
        organizationId: 'o1',
        workspaceId: 'w1',
        userId: 'u1',
        role: 'admin',
        permissions: [],
        items: {
          active_key: {
            key: 'active_key',
            value: 'val',
            source: 'agent' as const,
            confidence: 0.9,
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const propagated = svc.propagate(bundle, 'agent');
      expect(propagated.active_key).toBe('val');
      expect((propagated._ctx as Record<string, unknown>).organizationId).toBe('o1');
    });
  });
});
