import { z } from 'zod';

export const MemoryType = z.enum(['short_term', 'session', 'long_term', 'entity', 'semantic']);
export type MemoryType = z.infer<typeof MemoryType>;

export const MemoryEntrySchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
  type: MemoryType,
  content: z.string(),
  summary: z.string().optional(),
  entityName: z.string().optional(),
  tags: z.array(z.string()).default([]),
  embedding: z.array(z.number()).optional(),
  score: z.number().default(0),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.date().default(() => new Date()),
  expiresAt: z.date().optional(),
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export interface MemorySearchParams {
  query: string;
  organizationId: string;
  sessionId?: string;
  type?: MemoryType;
  limit?: number;
  tags?: string[];
}
