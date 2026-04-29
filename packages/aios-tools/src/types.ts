import { z } from 'zod';

export const RiskLevel = z.enum(['low', 'medium', 'high', 'critical']);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const ToolDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string().default('1.0.0'),
  category: z.string().default('general'),
  riskLevel: RiskLevel.default('low'),
  requiresApproval: z.boolean().default(false),
  permissions: z.array(z.string()).default([]),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).default({}),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export interface ToolInvokeParams {
  toolId: string;
  organizationId: string;
  sessionId: string;
  userId: string;
  input: Record<string, unknown>;
  callId?: string;
}

export interface ToolResult {
  toolId: string;
  callId: string;
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
  riskLevel: RiskLevel;
}
