import { z } from 'zod';

export const WorkflowStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['agent', 'tool', 'condition', 'delay']),
  config: z.record(z.unknown()).default({}),
  nextStepId: z.string().optional(),
  failureStepId: z.string().optional(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  steps: z.array(WorkflowStepSchema),
  triggerEvents: z.array(z.string()).default([]),
  organizationId: z.string(),
  metadata: z.record(z.unknown()).default({}),
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

export const WorkflowRunStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'dead_letter',
]);

export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>;

export const WorkflowRunSchema = z.object({
  runId: z.string(),
  workflowId: z.string(),
  status: WorkflowRunStatusSchema,
  currentStepId: z.string().optional(),
  organizationId: z.string(),
  sessionId: z.string().optional(),
  userId: z.string(),
  input: z.record(z.unknown()).default({}),
  output: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  startedAt: z.date(),
  completedAt: z.date().optional(),
});

export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

export interface StepExecutorResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

export interface StepExecutor {
  execute(step: WorkflowStep, run: WorkflowRun): Promise<StepExecutorResult>;
}

export interface TriggerInput {
  workflowId: string;
  organizationId: string;
  userId: string;
  sessionId?: string;
  input?: Record<string, unknown>;
}
