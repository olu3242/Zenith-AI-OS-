/**
 * @zenith/aios-sdk
 * Public SDK surface — import everything you need from here.
 * Designed for clean developer experience when building on Zenith AI OS.
 */

// ─── Core Types ────────────────────────────────────────────────────────────
export type {
  Organization, Workspace, User, ServiceAccount, ApiKey,
  ContextBundle, ContextItem, MemoryItem, MemoryType,
  AgentDefinition, AgentRole, AgentRun, ToolDefinition, RiskLevel,
  WorkflowDefinition, WorkflowStep, PolicyDecision,
  AuditControlScore, AuditRunResult, TraceEvent, TraceSpan,
  ApiResponse, AIOSError,
} from '@zenith/aios-core';

// ─── Context ──────────────────────────────────────────────────────────────
export { ContextService } from '@zenith/aios-context';
export type { ContextServiceDeps } from '@zenith/aios-context';

// ─── Memory ───────────────────────────────────────────────────────────────
export { MemoryService } from '@zenith/aios-memory';
export type { MemoryServiceDeps } from '@zenith/aios-memory';

// ─── Agents ───────────────────────────────────────────────────────────────
export { AgentRunner, AgentRegistry } from '@zenith/aios-agents';
export type { AgentRunnerDeps, AgentRunInput, AgentRunResult } from '@zenith/aios-agents';

// ─── Tools ────────────────────────────────────────────────────────────────
export { ToolBus } from '@zenith/aios-tools';
export type { ToolBusDeps, ToolInvocation, ToolResult, ToolHandler } from '@zenith/aios-tools';

// ─── Workflows ────────────────────────────────────────────────────────────
export { WorkflowEngine } from '@zenith/aios-workflows';
export type { WorkflowEngineDeps, WorkflowRunState } from '@zenith/aios-workflows';

// ─── Knowledge ────────────────────────────────────────────────────────────
export { KnowledgeService } from '@zenith/aios-knowledge';
export type { KnowledgeServiceDeps, RetrievalResult } from '@zenith/aios-knowledge';

// ─── Policy ───────────────────────────────────────────────────────────────
export { PolicyEvaluator } from '@zenith/aios-policy';
export type { PolicyEvaluatorDeps, PolicyDefinition, PolicyRule } from '@zenith/aios-policy';

// ─── Security ─────────────────────────────────────────────────────────────
export { SecurityMiddleware, PromptInjectionDetector } from '@zenith/aios-security';
export type { SecurityMiddlewareDeps, SecurityEvent } from '@zenith/aios-security';

// ─── Observability ────────────────────────────────────────────────────────
export { AIOSTracer } from '@zenith/aios-observability';
export type { TracerDeps, TraceMetrics } from '@zenith/aios-observability';

// ─── Audit ────────────────────────────────────────────────────────────────
export { AuditEngine, DEFAULT_AUDIT_CONTROLS } from '@zenith/aios-audit';
export type { AuditControl, AuditDomain, MaturityBand } from '@zenith/aios-audit';

// ─── Plugins ──────────────────────────────────────────────────────────────
export { PluginRegistry } from '@zenith/aios-plugins';
export type { PluginManifest, PluginInstallation, PluginHandler } from '@zenith/aios-plugins';

// ─── AIOS Bootstrap ───────────────────────────────────────────────────────

export interface AIOSConfig {
  organizationId: string;
  workspaceId?: string;
  db: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> };
  embedder: { embed: (text: string) => Promise<number[]> };
  llmProvider: {
    complete: (params: {
      model: string; systemPrompt: string;
      messages: Array<{ role: string; content: string }>;
      maxTokens: number; temperature: number;
    }) => Promise<{ content: string; tokensUsed: number }>;
  };
  logger?: { info: (msg: string, meta?: unknown) => void; error: (msg: string, meta?: unknown) => void };
  auditLogger?: { log: (event: string, data: unknown) => Promise<void> };
}

export interface AIOSInstance {
  context: import('@zenith/aios-context').ContextService;
  memory: import('@zenith/aios-memory').MemoryService;
  agents: { runner: import('@zenith/aios-agents').AgentRunner; registry: import('@zenith/aios-agents').AgentRegistry };
  tools: import('@zenith/aios-tools').ToolBus;
  workflows: import('@zenith/aios-workflows').WorkflowEngine;
  knowledge: import('@zenith/aios-knowledge').KnowledgeService;
  policy: import('@zenith/aios-policy').PolicyEvaluator;
  security: import('@zenith/aios-security').SecurityMiddleware;
  tracer: import('@zenith/aios-observability').AIOSTracer;
  plugins: import('@zenith/aios-plugins').PluginRegistry;
}

/**
 * Bootstrap a complete AIOS instance from a config object.
 * All modules are wired together with shared dependencies.
 */
export async function createAIOS(config: AIOSConfig): Promise<AIOSInstance> {
  const { ContextService } = await import('@zenith/aios-context');
  const { MemoryService } = await import('@zenith/aios-memory');
  const { AgentRunner, AgentRegistry } = await import('@zenith/aios-agents');
  const { ToolBus } = await import('@zenith/aios-tools');
  const { WorkflowEngine } = await import('@zenith/aios-workflows');
  const { KnowledgeService } = await import('@zenith/aios-knowledge');
  const { PolicyEvaluator } = await import('@zenith/aios-policy');
  const { SecurityMiddleware } = await import('@zenith/aios-security');
  const { AIOSTracer } = await import('@zenith/aios-observability');
  const { PluginRegistry } = await import('@zenith/aios-plugins');

  const noop = { info: () => {}, error: () => {} };
  const noopAudit = { log: async () => {} };

  const logger = config.logger ?? noop;
  const auditLogger = config.auditLogger ?? noopAudit;

  const chunker = {
    chunk: (text: string, maxTokens = 512): string[] => {
      const words = text.split(/\s+/);
      const chunks: string[] = [];
      let current: string[] = [];
      for (const word of words) {
        current.push(word);
        if (current.length >= maxTokens * 0.75) {
          chunks.push(current.join(' '));
          current = [];
        }
      }
      if (current.length) chunks.push(current.join(' '));
      return chunks;
    },
  };

  const summarizer = {
    summarize: async (text: string): Promise<string> => {
      const r = await config.llmProvider.complete({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'Summarize the following in 2-3 sentences.',
        messages: [{ role: 'user', content: text.substring(0, 3000) }],
        maxTokens: 200, temperature: 0.1,
      });
      return r.content;
    },
  };

  const tracer = new AIOSTracer({ db: config.db, logger });
  const noopTracer = {
    startSpan: (_name: string) => ({ end: () => {}, addMetadata: () => {} }),
    startTrace: (_params: unknown) => ({ traceId: 'noop', span: { end: () => {}, addMetadata: () => {} } }),
  };

  const security = new SecurityMiddleware({ db: config.db, auditLogger, logger });
  const policy = new PolicyEvaluator({ db: config.db, auditLogger, logger });

  const context = new ContextService({ db: config.db, logger, auditLogger });
  const memory = new MemoryService({ db: config.db, embedder: config.embedder, summarizer, logger, auditLogger });
  const knowledge = new KnowledgeService({ db: config.db, embedder: config.embedder, chunker, auditLogger, logger });

  const registry = new AgentRegistry();
  const runner = new AgentRunner({
    registry, db: config.db, llmProvider: config.llmProvider,
    policyEvaluator: policy, tracer: noopTracer, auditLogger, logger,
  });

  const permissionService = {
    hasPermission: async (userId: string, permission: string, orgId: string) =>
      security.hasPermission(userId, permission, orgId),
  };

  const toolBus = new ToolBus({
    db: config.db, permissionService,
    policyEvaluator: { evaluate: async (action, ctx) => { const d = await policy.evaluate(action, ctx); return { ...d, riskScore: d.riskScore }; } },
    tracer: noopTracer, auditLogger, logger,
  });

  const workflows = new WorkflowEngine({
    db: config.db,
    toolBus: { invoke: async (inv) => toolBus.invoke(inv as Parameters<typeof toolBus.invoke>[0]) },
    agentRunner: { run: async (input) => runner.run(input as Parameters<typeof runner.run>[0]) },
    policyEvaluator: policy, auditLogger, tracer: noopTracer, logger,
  });

  const plugins = new PluginRegistry({ db: config.db, auditLogger, logger });

  await policy.load(config.organizationId);

  return { context, memory, agents: { runner, registry }, tools: toolBus, workflows, knowledge, policy, security, tracer, plugins };
}
