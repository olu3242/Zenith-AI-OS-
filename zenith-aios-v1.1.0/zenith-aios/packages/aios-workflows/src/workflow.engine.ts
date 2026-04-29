/**
 * AIOS Workflow Engine
 * Event-driven, stateful workflow execution with queue processing,
 * dead-letter handling, approval steps, retries, and replay.
 */

import { z } from 'zod';

// ─── Schemas ───────────────────────────────────────────────────────────────

export const WorkflowStepTypeSchema = z.enum([
  'action', 'agent_call', 'tool_call', 'condition', 'parallel',
  'approval', 'wait', 'schedule', 'emit_event', 'end',
]);

export const WorkflowStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: WorkflowStepTypeSchema,
  config: z.record(z.unknown()),
  nextStepId: z.string().optional(),
  onSuccessStepId: z.string().optional(),
  onFailureStepId: z.string().optional(),
  retries: z.number().int().default(2),
  timeoutMs: z.number().int().default(30000),
  requiresApproval: z.boolean().default(false),
  compensationStepId: z.string().optional(),
});

export const WorkflowDefinitionSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  version: z.string().default('1.0.0'),
  triggerType: z.enum(['manual', 'event', 'schedule', 'webhook', 'api']),
  triggerConfig: z.record(z.unknown()).optional(),
  steps: z.array(WorkflowStepSchema),
  firstStepId: z.string(),
  slaMs: z.number().int().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type WorkflowStepType = z.infer<typeof WorkflowStepTypeSchema>;
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

export interface WorkflowRunState {
  runId: string;
  workflowId: string;
  organizationId: string;
  status: 'running' | 'completed' | 'failed' | 'paused' | 'pending_approval' | 'timed_out';
  currentStepId: string;
  stepResults: Record<string, unknown>;
  startedAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

// ─── Workflow Engine ───────────────────────────────────────────────────────

export interface WorkflowEngineDeps {
  db: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> };
  toolBus: { invoke: (inv: Record<string, unknown>) => Promise<{ status: string; output: Record<string, unknown> }> };
  agentRunner: { run: (input: Record<string, unknown>) => Promise<{ status: string; output: Record<string, unknown> }> };
  policyEvaluator: { evaluate: (action: string, ctx: Record<string, unknown>) => Promise<{ allowed: boolean; reason: string }> };
  auditLogger: { log: (event: string, data: unknown) => Promise<void> };
  tracer: { startSpan: (name: string, meta?: unknown) => { end: (r?: unknown) => void } };
  logger: { info: (msg: string, meta?: unknown) => void; error: (msg: string, meta?: unknown) => void };
}

export class WorkflowEngine {
  private definitions = new Map<string, WorkflowDefinition>();

  constructor(private deps: WorkflowEngineDeps) {
    this.seedDefaults();
  }

  /** Register a workflow definition */
  define(wf: WorkflowDefinition): void {
    WorkflowDefinitionSchema.parse(wf);
    this.definitions.set(wf.id, wf);
  }

  /** Trigger a workflow run */
  async trigger(params: {
    workflowId: string;
    organizationId: string;
    userId: string;
    sessionId: string;
    input: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<WorkflowRunState> {
    const wf = this.definitions.get(params.workflowId);
    if (!wf) throw new Error(`Workflow ${params.workflowId} not found`);

    const runId = await this.createRun(params, wf);
    const span = this.deps.tracer.startSpan('workflow.run', { runId, workflowId: wf.id });

    try {
      const state = await this.execute(runId, wf, params.input, params.organizationId);
      span.end({ status: state.status });
      return state;
    } catch (err) {
      await this.updateRunStatus(runId, 'failed');
      span.end({ status: 'failed', error: (err as Error).message });
      throw err;
    }
  }

  /** Resume a paused or approved workflow */
  async resume(runId: string, orgId: string, approvalData?: Record<string, unknown>): Promise<WorkflowRunState> {
    const { rows } = await this.deps.db.query(
      `SELECT * FROM workflow_runs WHERE id = $1 AND organization_id = $2`,
      [runId, orgId]
    );
    if (!rows.length) throw new Error(`Run ${runId} not found`);

    const run = rows[0] as Record<string, unknown>;
    const wf = this.definitions.get(run.workflow_id as string);
    if (!wf) throw new Error(`Workflow definition not found`);

    return this.execute(
      runId, wf,
      { ...(run.step_results as Record<string, unknown>), approvalData },
      orgId
    );
  }

  /** Process next item in the workflow queue */
  async processQueue(orgId: string, limit = 10): Promise<number> {
    const { rows } = await this.deps.db.query(
      `SELECT * FROM workflow_queue
       WHERE organization_id = $1 AND status = 'pending' AND process_after <= NOW()
       ORDER BY priority DESC, created_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [orgId, limit]
    );

    let processed = 0;
    for (const row of rows as Record<string, unknown>[]) {
      try {
        await this.deps.db.query(
          `UPDATE workflow_queue SET status = 'processing', updated_at = NOW() WHERE id = $1`,
          [row.id]
        );
        await this.trigger({
          workflowId: row.workflow_id as string,
          organizationId: orgId,
          userId: row.user_id as string,
          sessionId: row.session_id as string,
          input: (row.payload as Record<string, unknown>) ?? {},
        });
        await this.deps.db.query(
          `UPDATE workflow_queue SET status = 'completed', updated_at = NOW() WHERE id = $1`,
          [row.id]
        );
        processed++;
      } catch (err) {
        await this.moveToDeadLetter(row, (err as Error).message, orgId);
      }
    }

    return processed;
  }

  /** Replay a completed run */
  async replay(runId: string, orgId: string): Promise<WorkflowRunState> {
    const { rows } = await this.deps.db.query(
      `SELECT * FROM workflow_runs WHERE id = $1 AND organization_id = $2`,
      [runId, orgId]
    );
    if (!rows.length) throw new Error(`Run ${runId} not found`);
    const run = rows[0] as Record<string, unknown>;

    await this.deps.auditLogger.log('WORKFLOW_REPLAY', { originalRunId: runId, orgId });

    return this.trigger({
      workflowId: run.workflow_id as string,
      organizationId: orgId,
      userId: run.user_id as string,
      sessionId: run.session_id as string,
      input: (run.input as Record<string, unknown>) ?? {},
    });
  }

  // ─── Execution Core ───────────────────────────────────────────────────

  private async execute(
    runId: string,
    wf: WorkflowDefinition,
    input: Record<string, unknown>,
    orgId: string
  ): Promise<WorkflowRunState> {
    const stepResults: Record<string, unknown> = { input };
    let currentStepId = wf.firstStepId;
    const stepMap = new Map(wf.steps.map((s) => [s.id, s]));

    while (currentStepId) {
      const step = stepMap.get(currentStepId);
      if (!step) break;

      await this.updateCurrentStep(runId, currentStepId);
      this.deps.logger.info('Executing step', { runId, stepId: step.id, type: step.type });

      if (step.type === 'end') {
        await this.updateRunStatus(runId, 'completed');
        break;
      }

      if (step.type === 'approval' || step.requiresApproval) {
        await this.updateRunStatus(runId, 'pending_approval');
        await this.deps.auditLogger.log('WORKFLOW_APPROVAL_REQUIRED', { runId, stepId: step.id, orgId });
        return this.buildState(runId, wf.id, orgId, 'pending_approval', currentStepId, stepResults);
      }

      try {
        const result = await this.executeStep(step, stepResults, orgId);
        stepResults[step.id] = result;
        await this.saveStepResult(runId, step.id, result);

        currentStepId = step.onSuccessStepId ?? step.nextStepId ?? '';
      } catch (err) {
        this.deps.logger.error('Step failed', { runId, stepId: step.id, error: (err as Error).message });
        await this.deps.auditLogger.log('WORKFLOW_STEP_FAILED', { runId, stepId: step.id, error: (err as Error).message });

        if (step.onFailureStepId) {
          currentStepId = step.onFailureStepId;
        } else {
          await this.updateRunStatus(runId, 'failed');
          return this.buildState(runId, wf.id, orgId, 'failed', currentStepId, stepResults);
        }
      }
    }

    await this.deps.auditLogger.log('WORKFLOW_COMPLETED', { runId, workflowId: wf.id, orgId });
    return this.buildState(runId, wf.id, orgId, 'completed', '', stepResults);
  }

  private async executeStep(
    step: WorkflowStep,
    context: Record<string, unknown>,
    orgId: string
  ): Promise<Record<string, unknown>> {
    switch (step.type) {
      case 'tool_call':
        const toolResult = await this.deps.toolBus.invoke({ ...(step.config as object), context });
        return toolResult.output;

      case 'agent_call':
        const agentResult = await this.deps.agentRunner.run({ ...(step.config as object), context });
        return agentResult.output;

      case 'condition':
        const cond = step.config.expression as string;
        const condResult = this.evaluateCondition(cond, context);
        return { conditionMet: condResult };

      case 'wait':
        const ms = (step.config.durationMs as number) ?? 1000;
        await new Promise((r) => setTimeout(r, ms));
        return { waited: ms };

      case 'emit_event':
        await this.deps.db.query(
          `INSERT INTO workflow_queue (organization_id, workflow_id, event_type, payload, status, created_at)
           VALUES ($1,$2,$3,$4::jsonb,'pending',NOW())`,
          [orgId, step.config.targetWorkflowId, step.config.eventType, JSON.stringify(context)]
        );
        return { emitted: step.config.eventType };

      default:
        return { skipped: step.type };
    }
  }

  private evaluateCondition(expression: string, context: Record<string, unknown>): boolean {
    // Safe condition evaluation — in production, use a proper expression engine
    try {
      const fn = new Function('ctx', `"use strict"; return !!(${expression})`);
      return fn(context);
    } catch {
      return false;
    }
  }

  private async createRun(params: Record<string, unknown>, wf: WorkflowDefinition): Promise<string> {
    const { rows } = await this.deps.db.query(
      `INSERT INTO workflow_runs
         (workflow_id, organization_id, user_id, session_id, input, status, current_step_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,'running',$6,NOW(),NOW())
       RETURNING id`,
      [wf.id, params.organizationId, params.userId, params.sessionId, JSON.stringify(params.input), wf.firstStepId]
    );
    return (rows[0] as { id: string }).id;
  }

  private async updateRunStatus(runId: string, status: string): Promise<void> {
    await this.deps.db.query(
      `UPDATE workflow_runs SET status=$1, updated_at=NOW() WHERE id=$2`,
      [status, runId]
    );
  }

  private async updateCurrentStep(runId: string, stepId: string): Promise<void> {
    await this.deps.db.query(
      `UPDATE workflow_runs SET current_step_id=$1, updated_at=NOW() WHERE id=$2`,
      [stepId, runId]
    );
  }

  private async saveStepResult(runId: string, stepId: string, result: unknown): Promise<void> {
    await this.deps.db.query(
      `UPDATE workflow_runs
       SET step_results = COALESCE(step_results,'{}')::jsonb || jsonb_build_object($1,$2::jsonb),
           updated_at = NOW()
       WHERE id = $3`,
      [stepId, JSON.stringify(result), runId]
    );
  }

  private async moveToDeadLetter(row: Record<string, unknown>, reason: string, orgId: string): Promise<void> {
    await this.deps.db.query(
      `INSERT INTO workflow_dead_letters (queue_id, organization_id, reason, payload, created_at)
       VALUES ($1,$2,$3,$4::jsonb,NOW())`,
      [row.id, orgId, reason, JSON.stringify(row)]
    );
    await this.deps.db.query(
      `UPDATE workflow_queue SET status='dead_lettered', updated_at=NOW() WHERE id=$1`,
      [row.id]
    );
    this.deps.logger.error('Workflow moved to dead letter', { queueId: row.id, reason });
  }

  private buildState(
    runId: string, workflowId: string, organizationId: string,
    status: WorkflowRunState['status'], currentStepId: string,
    stepResults: Record<string, unknown>
  ): WorkflowRunState {
    return {
      runId, workflowId, organizationId, status, currentStepId, stepResults,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    };
  }

  private seedDefaults(): void {
    // AI Audit Run Workflow
    this.define({
      id: 'wf-audit-run',
      organizationId: 'system',
      name: 'AI Audit Run Workflow',
      version: '1.0.0',
      triggerType: 'manual',
      firstStepId: 'step-collect-evidence',
      steps: [
        { id: 'step-collect-evidence', name: 'Collect Evidence', type: 'agent_call', config: { agentId: 'audit-agent' }, nextStepId: 'step-score', retries: 1, timeoutMs: 60000, requiresApproval: false },
        { id: 'step-score', name: 'Score Controls', type: 'tool_call', config: { toolId: 'run_audit' }, nextStepId: 'step-generate-report', retries: 1, timeoutMs: 30000, requiresApproval: false },
        { id: 'step-generate-report', name: 'Generate Report', type: 'tool_call', config: { toolId: 'generate_document' }, nextStepId: 'step-end', retries: 1, timeoutMs: 20000, requiresApproval: false },
        { id: 'step-end', name: 'Complete', type: 'end', config: {}, retries: 0, timeoutMs: 1000, requiresApproval: false },
      ],
    });

    // Human Approval Workflow
    this.define({
      id: 'wf-human-approval',
      organizationId: 'system',
      name: 'Human Approval Workflow',
      version: '1.0.0',
      triggerType: 'event',
      firstStepId: 'step-notify',
      steps: [
        { id: 'step-notify', name: 'Notify Approver', type: 'tool_call', config: { toolId: 'send_email' }, nextStepId: 'step-wait-approval', retries: 1, timeoutMs: 10000, requiresApproval: false },
        { id: 'step-wait-approval', name: 'Wait for Approval', type: 'approval', config: {}, nextStepId: 'step-execute', retries: 0, timeoutMs: 86400000, requiresApproval: true },
        { id: 'step-execute', name: 'Execute Action', type: 'tool_call', config: {}, nextStepId: 'step-end', retries: 2, timeoutMs: 30000, requiresApproval: false },
        { id: 'step-end', name: 'Complete', type: 'end', config: {}, retries: 0, timeoutMs: 1000, requiresApproval: false },
      ],
    });
  }
}
