/**
 * AIOS Agent Runner
 * Executes agents with full lifecycle management: registration, dispatch,
 * handoffs, retries, fallbacks, cost tracking, and audit logging.
 */

import { z } from 'zod';

// ─── Schemas ───────────────────────────────────────────────────────────────

export const AgentRoleSchema = z.enum([
  'orchestrator', 'context', 'memory', 'tool_executor', 'workflow',
  'knowledge_retrieval', 'policy', 'security', 'audit', 'qa_verification',
  'human_escalation', 'custom',
]);

export const AgentCapabilitySchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
});

export const AgentDefinitionSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(100),
  role: AgentRoleSchema,
  version: z.string().default('1.0.0'),
  capabilities: z.array(AgentCapabilitySchema),
  systemPrompt: z.string(),
  model: z.string().default('claude-sonnet-4-20250514'),
  maxTokens: z.number().int().default(4096),
  temperature: z.number().min(0).max(2).default(0.3),
  maxRetries: z.number().int().default(3),
  timeoutMs: z.number().int().default(30000),
  requiresApproval: z.boolean().default(false),
  sandboxed: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

export const AgentRunInputSchema = z.object({
  agentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  input: z.record(z.unknown()),
  context: z.record(z.unknown()).optional(),
  parentRunId: z.string().uuid().optional(),
  workflowRunId: z.string().uuid().optional(),
  dryRun: z.boolean().default(false),
});

export type AgentRole = z.infer<typeof AgentRoleSchema>;
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;
export type AgentRunInput = z.infer<typeof AgentRunInputSchema>;

export interface AgentRunResult {
  runId: string;
  agentId: string;
  status: 'completed' | 'failed' | 'pending_approval' | 'timed_out';
  output: Record<string, unknown>;
  tokensUsed: number;
  costUsd: number;
  durationMs: number;
  steps: AgentRunStep[];
  error?: string;
}

export interface AgentRunStep {
  stepNumber: number;
  action: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  tokensUsed: number;
  durationMs: number;
  timestamp: string;
}

// ─── Agent Errors ──────────────────────────────────────────────────────────

export class AgentNotFoundError extends Error {
  constructor(id: string) { super(`Agent ${id} not found`); this.name = 'AgentNotFoundError'; }
}

export class AgentApprovalRequiredError extends Error {
  constructor(public agentId: string, public runId: string) {
    super(`Agent ${agentId} requires human approval`);
    this.name = 'AgentApprovalRequiredError';
  }
}

export class AgentTimeoutError extends Error {
  constructor(agentId: string, ms: number) {
    super(`Agent ${agentId} timed out after ${ms}ms`);
    this.name = 'AgentTimeoutError';
  }
}

// ─── Agent Registry ────────────────────────────────────────────────────────

export class AgentRegistry {
  private agents = new Map<string, AgentDefinition>();

  register(agent: AgentDefinition): void {
    AgentDefinitionSchema.parse(agent);
    this.agents.set(agent.id, agent);
  }

  get(id: string): AgentDefinition {
    const agent = this.agents.get(id);
    if (!agent) throw new AgentNotFoundError(id);
    return agent;
  }

  list(orgId: string): AgentDefinition[] {
    return [...this.agents.values()].filter((a) => a.organizationId === orgId);
  }

  byRole(orgId: string, role: AgentRole): AgentDefinition[] {
    return this.list(orgId).filter((a) => a.role === role);
  }
}

// ─── Agent Runner ──────────────────────────────────────────────────────────

export interface AgentRunnerDeps {
  registry: AgentRegistry;
  db: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> };
  llmProvider: {
    complete: (params: {
      model: string;
      systemPrompt: string;
      messages: Array<{ role: string; content: string }>;
      maxTokens: number;
      temperature: number;
    }) => Promise<{ content: string; tokensUsed: number }>;
  };
  policyEvaluator: { evaluate: (action: string, context: Record<string, unknown>) => Promise<{ allowed: boolean; reason: string }> };
  tracer: { startSpan: (name: string, meta?: unknown) => { end: (result?: unknown) => void } };
  auditLogger: { log: (event: string, data: unknown) => Promise<void> };
  logger: { info: (msg: string, meta?: unknown) => void; error: (msg: string, meta?: unknown) => void };
}

export class AgentRunner {
  constructor(private deps: AgentRunnerDeps) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const validated = AgentRunInputSchema.parse(input);
    const agent = this.deps.registry.get(validated.agentId);
    const span = this.deps.tracer.startSpan('agent.run', { agentId: agent.id, role: agent.role });
    const startTime = Date.now();

    // Policy check
    const policy = await this.deps.policyEvaluator.evaluate('agent.execute', {
      agentId: agent.id,
      orgId: validated.organizationId,
      userId: validated.userId,
      role: agent.role,
    });

    if (!policy.allowed) {
      await this.deps.auditLogger.log('AGENT_BLOCKED_BY_POLICY', {
        agentId: agent.id, reason: policy.reason, orgId: validated.organizationId,
      });
      throw new Error(`Agent execution blocked: ${policy.reason}`);
    }

    // Approval gate
    if (agent.requiresApproval && !validated.dryRun) {
      const runId = await this.createRunRecord(validated, agent, 'pending_approval');
      throw new AgentApprovalRequiredError(agent.id, runId);
    }

    const runId = await this.createRunRecord(validated, agent, 'running');
    const steps: AgentRunStep[] = [];
    let totalTokens = 0;
    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt < agent.maxRetries) {
      attempt++;
      try {
        const stepStart = Date.now();

        const messages = [
          {
            role: 'user',
            content: JSON.stringify({ input: validated.input, context: validated.context ?? {} }),
          },
        ];

        // Timeout wrapper
        const response = await Promise.race([
          this.deps.llmProvider.complete({
            model: agent.model,
            systemPrompt: agent.systemPrompt,
            messages,
            maxTokens: agent.maxTokens,
            temperature: agent.temperature,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new AgentTimeoutError(agent.id, agent.timeoutMs)), agent.timeoutMs)
          ),
        ]);

        totalTokens += response.tokensUsed;
        let output: Record<string, unknown>;
        try {
          output = JSON.parse(response.content);
        } catch {
          output = { result: response.content };
        }

        steps.push({
          stepNumber: attempt,
          action: 'llm_completion',
          input: { messages },
          output,
          tokensUsed: response.tokensUsed,
          durationMs: Date.now() - stepStart,
          timestamp: new Date().toISOString(),
        });

        const costUsd = this.estimateCost(agent.model, totalTokens);
        const durationMs = Date.now() - startTime;

        await this.updateRunRecord(runId, 'completed', output, totalTokens, costUsd);
        await this.saveSteps(runId, steps);
        await this.deps.auditLogger.log('AGENT_RUN_COMPLETED', {
          runId, agentId: agent.id, orgId: validated.organizationId,
          tokensUsed: totalTokens, costUsd, durationMs, attempt,
        });

        span.end({ status: 'completed' });
        return { runId, agentId: agent.id, status: 'completed', output, tokensUsed: totalTokens, costUsd, durationMs, steps };

      } catch (err) {
        lastError = err as Error;
        this.deps.logger.error(`Agent run attempt ${attempt} failed`, { runId, error: lastError.message });

        if (lastError instanceof AgentTimeoutError) break;
        if (attempt < agent.maxRetries) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
        }
      }
    }

    await this.updateRunRecord(runId, 'failed', {}, totalTokens, 0);
    await this.deps.auditLogger.log('AGENT_RUN_FAILED', {
      runId, agentId: agent.id, orgId: validated.organizationId, error: lastError?.message, attempts: attempt,
    });
    span.end({ status: 'failed' });

    return {
      runId, agentId: agent.id, status: 'failed',
      output: {}, tokensUsed: totalTokens, costUsd: 0,
      durationMs: Date.now() - startTime, steps,
      error: lastError?.message,
    };
  }

  /** Orchestrate a handoff from one agent to another */
  async handoff(fromRunId: string, toAgentId: string, handoffData: Record<string, unknown>, orgId: string): Promise<void> {
    await this.deps.db.query(
      `INSERT INTO agent_handoffs (from_run_id, to_agent_id, organization_id, handoff_data, created_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [fromRunId, toAgentId, orgId, JSON.stringify(handoffData)]
    );
    await this.deps.auditLogger.log('AGENT_HANDOFF', { fromRunId, toAgentId, orgId });
  }

  private async createRunRecord(input: AgentRunInput, agent: AgentDefinition, status: string): Promise<string> {
    const { rows } = await this.deps.db.query(
      `INSERT INTO agent_runs
         (agent_id, organization_id, workspace_id, session_id, user_id, status,
          input, parent_run_id, workflow_run_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,NOW(),NOW())
       RETURNING id`,
      [
        agent.id, input.organizationId, input.workspaceId ?? null,
        input.sessionId, input.userId, status,
        JSON.stringify(input.input), input.parentRunId ?? null, input.workflowRunId ?? null,
      ]
    );
    return (rows[0] as { id: string }).id;
  }

  private async updateRunRecord(runId: string, status: string, output: unknown, tokens: number, cost: number): Promise<void> {
    await this.deps.db.query(
      `UPDATE agent_runs SET status=$1, output=$2::jsonb, tokens_used=$3, cost_usd=$4, updated_at=NOW() WHERE id=$5`,
      [status, JSON.stringify(output), tokens, cost, runId]
    );
  }

  private async saveSteps(runId: string, steps: AgentRunStep[]): Promise<void> {
    for (const step of steps) {
      await this.deps.db.query(
        `INSERT INTO agent_run_steps (run_id, step_number, action, input, output, tokens_used, duration_ms, created_at)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,NOW())`,
        [runId, step.stepNumber, step.action, JSON.stringify(step.input), JSON.stringify(step.output), step.tokensUsed, step.durationMs]
      );
    }
  }

  private estimateCost(model: string, tokens: number): number {
    const rates: Record<string, number> = {
      'claude-sonnet-4-20250514': 0.000003,
      'claude-opus-4-20250514': 0.000015,
      'gpt-4o': 0.000005,
    };
    return (rates[model] ?? 0.000005) * tokens;
  }
}
