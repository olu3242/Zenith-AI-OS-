import { z } from 'zod';

export const AgentStatus = z.enum(['idle', 'running', 'completed', 'failed', 'cancelled']);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const AgentDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string().default('1.0.0'),
  model: z.string().default('claude-sonnet-4-6'),
  systemPrompt: z.string(),
  tools: z.array(z.string()).default([]),
  maxIterations: z.number().default(20),
  fallbackAgentId: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export interface AgentRunParams {
  agentId: string;
  organizationId: string;
  sessionId: string;
  userId: string;
  input: Record<string, unknown>;
  runId?: string;
}

export interface AgentRunResult {
  runId: string;
  agentId: string;
  status: AgentStatus;
  output?: unknown;
  error?: string;
  iterations: number;
  durationMs: number;
  tokenUsage: { input: number; output: number };
}
