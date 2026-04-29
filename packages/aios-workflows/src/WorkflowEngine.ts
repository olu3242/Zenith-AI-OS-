import { v4 as uuidv4 } from 'uuid';
import {
  WorkflowDefinition,
  WorkflowRun,
  WorkflowStep,
  StepExecutor,
  TriggerInput,
} from './types.js';

export class InMemoryWorkflowStore {
  private definitions = new Map<string, WorkflowDefinition>();
  private runs = new Map<string, WorkflowRun>();

  saveDefinition(def: WorkflowDefinition): void {
    this.definitions.set(def.id, def);
  }

  getDefinition(id: string): WorkflowDefinition | undefined {
    return this.definitions.get(id);
  }

  saveRun(run: WorkflowRun): void {
    this.runs.set(run.runId, run);
  }

  getRun(runId: string): WorkflowRun | undefined {
    return this.runs.get(runId);
  }

  listRunsByOrg(organizationId: string): WorkflowRun[] {
    return Array.from(this.runs.values()).filter(
      (r) => r.organizationId === organizationId,
    );
  }
}

export class NoOpStepExecutor implements StepExecutor {
  async execute(
    _step: WorkflowStep,
    _run: WorkflowRun,
  ): Promise<{ success: boolean; output?: Record<string, unknown>; error?: string }> {
    return { success: true, output: {} };
  }
}

export class WorkflowEngine {
  private store: InMemoryWorkflowStore;
  private executor: StepExecutor;

  constructor(
    store?: InMemoryWorkflowStore,
    executor?: StepExecutor,
  ) {
    this.store = store ?? new InMemoryWorkflowStore();
    this.executor = executor ?? new NoOpStepExecutor();
  }

  register(def: WorkflowDefinition): void {
    this.store.saveDefinition(def);
  }

  async trigger(input: TriggerInput): Promise<WorkflowRun> {
    const def = this.store.getDefinition(input.workflowId);
    if (!def) {
      throw new Error(`WorkflowDefinition not found: ${input.workflowId}`);
    }

    const run: WorkflowRun = {
      runId: uuidv4(),
      workflowId: input.workflowId,
      status: 'pending',
      organizationId: input.organizationId,
      userId: input.userId,
      sessionId: input.sessionId,
      input: input.input ?? {},
      startedAt: new Date(),
    };

    this.store.saveRun(run);

    // Transition to running immediately
    run.status = 'running';
    this.store.saveRun(run);

    // Execute steps sequentially
    await this._executeSteps(def, run);

    return run;
  }

  private async _executeSteps(
    def: WorkflowDefinition,
    run: WorkflowRun,
  ): Promise<void> {
    if (def.steps.length === 0) {
      run.status = 'completed';
      run.completedAt = new Date();
      this.store.saveRun(run);
      return;
    }

    let currentStep: WorkflowStep | undefined = def.steps[0];

    while (currentStep) {
      run.currentStepId = currentStep.id;
      this.store.saveRun(run);

      let result: { success: boolean; output?: Record<string, unknown>; error?: string };
      try {
        result = await this.executor.execute(currentStep, run);
      } catch (err: unknown) {
        result = {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      if (!result.success) {
        // Follow failure path if available
        if (currentStep.failureStepId) {
          const failStep = def.steps.find((s) => s.id === currentStep!.failureStepId);
          currentStep = failStep;
        } else {
          run.status = 'failed';
          run.error = result.error ?? 'Step failed with no error message';
          run.completedAt = new Date();
          this.store.saveRun(run);
          return;
        }
      } else {
        // Merge output
        if (result.output) {
          run.output = { ...(run.output ?? {}), ...result.output };
        }
        // Follow next step
        if (currentStep.nextStepId) {
          const nextStep = def.steps.find((s) => s.id === currentStep!.nextStepId);
          currentStep = nextStep;
        } else {
          // No next step — find the next step in order
          const currentIndex = def.steps.indexOf(currentStep);
          currentStep =
            currentIndex >= 0 && currentIndex < def.steps.length - 1
              ? def.steps[currentIndex + 1]
              : undefined;
        }
      }
    }

    run.status = 'completed';
    run.completedAt = new Date();
    this.store.saveRun(run);
  }

  getStatus(runId: string): WorkflowRun | null {
    return this.store.getRun(runId) ?? null;
  }

  list(orgId: string): WorkflowRun[] {
    return this.store.listRunsByOrg(orgId);
  }
}
