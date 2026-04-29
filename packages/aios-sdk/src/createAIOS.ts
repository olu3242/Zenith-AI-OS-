import { AgentRegistry, AgentRunner } from '@zenith/aios-agents';
import { ContextService, InMemoryContextStore } from '@zenith/aios-context';
import { InMemoryKnowledgeStore, KnowledgeService, HallucinationGuard } from '@zenith/aios-knowledge';
import { InMemoryMemoryStore, MemoryService } from '@zenith/aios-memory';
import { AIOSTracer, QualityScorer } from '@zenith/aios-observability';
import { AnthropicPlugin, OpenAIPlugin, PluginRegistry } from '@zenith/aios-plugins';
import { PolicyEvaluator } from '@zenith/aios-policy';
import { SecurityMiddleware } from '@zenith/aios-security';
import { ToolBus } from '@zenith/aios-tools';
import { InMemoryWorkflowStore, WorkflowEngine } from '@zenith/aios-workflows';
import { AuditEngine } from '@zenith/aios-audit';
import type { AgentRunParams } from '@zenith/aios-agents';
import type { ToolInvokeParams } from '@zenith/aios-tools';
import type { MemorySearchParams } from '@zenith/aios-memory';
import type { EvaluationContext } from '@zenith/aios-policy';
import type { TriggerInput } from '@zenith/aios-workflows';
import type { ControlEvaluationMap } from '@zenith/aios-audit';

export interface AIOSConfig {
  organizationId: string;
  anthropicApiKey?: string;
  openAiApiKey?: string;
}

export interface AIOS {
  context: ContextService;
  memory: { service: MemoryService; search(params: MemorySearchParams): Promise<ReturnType<MemoryService['search']>> };
  agents: { registry: AgentRegistry; runner: AgentRunner; run(params: AgentRunParams): ReturnType<AgentRunner['run']> };
  tools: { bus: ToolBus; invoke(params: ToolInvokeParams): ReturnType<ToolBus['invoke']> };
  workflows: { engine: WorkflowEngine; trigger(params: TriggerInput): ReturnType<WorkflowEngine['trigger']> };
  knowledge: { service: KnowledgeService; guard: HallucinationGuard };
  policy: { evaluator: PolicyEvaluator; evaluate(action: string, ctx: EvaluationContext): ReturnType<PolicyEvaluator['evaluate']> };
  security: SecurityMiddleware;
  tracer: AIOSTracer;
  quality: QualityScorer;
  plugins: PluginRegistry;
  audit: { engine: AuditEngine; run(evals?: ControlEvaluationMap): ReturnType<AuditEngine['evaluate']> };
}

export async function createAIOS(config: AIOSConfig): Promise<AIOS> {
  // Stores
  const contextStore = new InMemoryContextStore();
  const memoryStore = new InMemoryMemoryStore();
  const knowledgeStore = new InMemoryKnowledgeStore();
  const workflowStore = new InMemoryWorkflowStore();

  // Services
  const context = new ContextService(contextStore);
  const memoryService = new MemoryService(memoryStore);
  const knowledgeService = new KnowledgeService(knowledgeStore);
  const hallucinationGuard = new HallucinationGuard();
  const policyEvaluator = new PolicyEvaluator();
  const securityMiddleware = new SecurityMiddleware({ enableInjectionDetection: true, enablePIIDetection: true, maxRiskScore: 0.7 });
  const tracer = new AIOSTracer();
  const qualityScorer = new QualityScorer();

  // Plugins
  const plugins = new PluginRegistry();
  if (config.anthropicApiKey) plugins.register(new AnthropicPlugin(config.anthropicApiKey));
  if (config.openAiApiKey) plugins.register(new OpenAIPlugin(config.openAiApiKey));

  // Tools
  const toolBus = new ToolBus();

  // Agents
  const agentRegistry = new AgentRegistry();
  const agentRunner = new AgentRunner(agentRegistry, {
    async complete(params) {
      const plugin = plugins.resolveByModel(params.model) ?? plugins.get('anthropic');
      if (!plugin) throw new Error('No LLM plugin registered. Provide anthropicApiKey or openAiApiKey.');
      return plugin.complete(params);
    },
  }, {
    async invoke(params) {
      const result = await toolBus.invoke(params);
      return { success: result.success, output: result.output, error: result.error };
    },
  });

  // Workflows
  const workflowEngine = new WorkflowEngine(workflowStore);

  // Audit
  const auditEngine = new AuditEngine();

  return {
    context,
    memory: {
      service: memoryService,
      search: (params) => memoryService.search(params),
    },
    agents: {
      registry: agentRegistry,
      runner: agentRunner,
      run: (params) => agentRunner.run(params),
    },
    tools: {
      bus: toolBus,
      invoke: (params) => toolBus.invoke(params),
    },
    workflows: {
      engine: workflowEngine,
      trigger: (params) => workflowEngine.trigger(params),
    },
    knowledge: { service: knowledgeService, guard: hallucinationGuard },
    policy: {
      evaluator: policyEvaluator,
      evaluate: (action, ctx) => policyEvaluator.evaluate(action, ctx),
    },
    security: securityMiddleware,
    tracer,
    quality: qualityScorer,
    plugins,
    audit: {
      engine: auditEngine,
      run: (evals = new Map()) => auditEngine.evaluate(evals),
    },
  };
}
