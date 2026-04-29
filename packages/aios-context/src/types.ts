import { z } from 'zod';

export const SessionContextSchema = z.object({
  sessionId: z.string().uuid(),
  organizationId: z.string(),
  tenantId: z.string(),
  userId: z.string(),
  role: z.string().default('user'),
  intent: z.string().optional(),
  workspaceId: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
  expiresAt: z.date().optional(),
  tags: z.array(z.string()).default([]),
});

export type SessionContext = z.infer<typeof SessionContextSchema>;

export const CreateContextInput = SessionContextSchema.omit({
  createdAt: true,
  updatedAt: true,
});
export type CreateContextInput = z.infer<typeof CreateContextInput>;
