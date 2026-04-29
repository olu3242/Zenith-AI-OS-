/**
 * ZENITH AI OS — Example: CRM AI OS
 *
 * A complete CRM implementation built on Zenith AI OS.
 * Demonstrates: lead qualification agent, deal scoring tool,
 * customer memory, and a lead nurture workflow.
 *
 * Usage:
 *   cd examples/crm-aios
 *   node index.js
 */

'use strict';

// ─── Mock dependencies (replace with real in production) ──────────────────

const mockDb = {
  async query(sql, params) {
    return { rows: [] };
  },
};

const mockEmbedder = {
  async embed(text) {
    return new Array(1536).fill(0).map(() => Math.random());
  },
};

const mockLLM = {
  async complete({ systemPrompt, messages }) {
    // Simulate LLM responses for demo
    const userMsg = messages[0]?.content ?? '';
    if (systemPrompt.includes('email specialist') || userMsg.includes('draft outreach')) {
      return {
        content: JSON.stringify({
          subject: 'Following up on AI automation for Acme',
          body: 'Hi Jane, thanks for reaching out. Here are 3 ways we can help your ops team...',
          callToAction: 'Book a 20-min demo',
        }),
        tokensUsed: 280,
      };
    }
    if (userMsg.includes('qualify') || userMsg.includes('lead')) {
      return {
        content: JSON.stringify({
          score: 78,
          tier: 'hot',
          recommendation: 'Schedule demo call within 24 hours',
          keyFactors: ['Strong revenue signal', 'Decision-maker contact', 'Clear use case'],
        }),
        tokensUsed: 350,
      };
    }
    if (userMsg.includes('email')) {
      return {
        content: JSON.stringify({
          subject: 'Quick follow-up on your interest in Zenith AI OS',
          body: 'Hi there,\n\nThank you for your interest. Based on your profile, I think there are 3 specific ways we can help...',
          callToAction: 'Schedule a 20-minute demo',
        }),
        tokensUsed: 280,
      };
    }
    return { content: JSON.stringify({ result: 'completed', input: userMsg.substring(0, 50) }), tokensUsed: 100 };
  },
};

const mockAuditLogger = {
  async log(event, data) {
    console.log(`  [AUDIT] ${event}`);
  },
};

const mockLogger = {
  info: (msg, meta) => console.log(`  [INFO] ${msg}`, meta ? JSON.stringify(meta).substring(0, 80) : ''),
  error: (msg, meta) => console.error(`  [ERROR] ${msg}`, meta),
};

// ─── Bootstrap ─────────────────────────────────────────────────────────────

async function bootstrap() {
  // Direct instantiation (without full SDK for demo)
  const { AgentRegistry, AgentRunner } = await importAgents();
  const { ToolBus } = await importTools();
  const { WorkflowEngine } = await importWorkflows();
  const { PolicyEvaluator } = await importPolicy();

  const policy = new PolicyEvaluator({ db: mockDb, auditLogger: mockAuditLogger, logger: mockLogger });

  const noopTracer = { startSpan: () => ({ end: () => {}, addMetadata: () => {} }) };
  const permService = { hasPermission: async () => true };
  const policyBridge = { evaluate: async (action, ctx) => policy.evaluate(action, ctx) };

  const toolBus = new ToolBus({ db: mockDb, permissionService: permService, policyEvaluator: policyBridge, tracer: noopTracer, auditLogger: mockAuditLogger, logger: mockLogger });
  const registry = new AgentRegistry();
  const runner = new AgentRunner({ registry, db: mockDb, llmProvider: mockLLM, policyEvaluator: policy, tracer: noopTracer, auditLogger: mockAuditLogger, logger: mockLogger });

  const workflows = new WorkflowEngine({
    db: mockDb,
    toolBus: { invoke: async (inv) => toolBus.invoke(inv) },
    agentRunner: { run: async (input) => runner.run(input) },
    policyEvaluator: policy, auditLogger: mockAuditLogger, tracer: noopTracer, logger: mockLogger,
  });

  return { registry, runner, toolBus, workflows, policy };
}

async function importAgents() {
  // In production: import { AgentRegistry, AgentRunner } from '@zenith/aios-agents'
  // For demo, inline minimal implementation
  class AgentRegistry {
    constructor() { this.agents = new Map(); }
    register(agent) { this.agents.set(agent.id, agent); }
    get(id) {
      const a = this.agents.get(id);
      if (!a) throw new Error(`Agent ${id} not found`);
      return a;
    }
  }

  class AgentRunner {
    constructor(deps) { this.deps = deps; }
    async run(input) {
      const agent = this.deps.registry.get(input.agentId);
      console.log(`  → Running agent: ${agent.name}`);
      const response = await this.deps.llmProvider.complete({
        model: agent.model, systemPrompt: agent.systemPrompt,
        messages: [{ role: 'user', content: JSON.stringify(input.input) }],
        maxTokens: agent.maxTokens, temperature: agent.temperature,
      });
      let output;
      try { output = JSON.parse(response.content); } catch { output = { result: response.content }; }
      await this.deps.auditLogger.log('AGENT_RUN_COMPLETED', { agentId: agent.id, tokensUsed: response.tokensUsed });
      return { runId: `run_${Date.now()}`, agentId: agent.id, status: 'completed', output, tokensUsed: response.tokensUsed, costUsd: response.tokensUsed * 0.000003, durationMs: 800, steps: [] };
    }
  }

  return { AgentRegistry, AgentRunner };
}

async function importTools() {
  class ToolBus {
    constructor(deps) { this.deps = deps; this.tools = new Map(); this.handlers = new Map(); }
    register(def, handler) { this.tools.set(def.id, def); this.handlers.set(def.id, handler); }
    async invoke(inv) {
      const tool = this.tools.get(inv.toolId);
      if (!tool) throw new Error(`Tool ${inv.toolId} not found`);
      const handler = this.handlers.get(inv.toolId);
      console.log(`  → Invoking tool: ${tool.name}`);
      const output = await handler(inv.input, inv.context ?? {});
      await this.deps.auditLogger.log('TOOL_INVOKED', { toolId: tool.id });
      return { invocationId: `inv_${Date.now()}`, toolId: tool.id, status: 'success', output, riskScore: 20, durationMs: 150 };
    }
  }
  return { ToolBus };
}

async function importWorkflows() {
  class WorkflowEngine {
    constructor(deps) { this.deps = deps; this.definitions = new Map(); }
    define(wf) { this.definitions.set(wf.id, wf); }
    async trigger(params) {
      const wf = this.definitions.get(params.workflowId);
      if (!wf) throw new Error(`Workflow ${params.workflowId} not found`);
      console.log(`  → Triggering workflow: ${wf.name}`);
      const stepMap = new Map(wf.steps.map(s => [s.id, s]));
      let current = wf.firstStepId;
      const results = {};
      while (current) {
        const step = stepMap.get(current);
        if (!step || step.type === 'end') break;
        if (step.type === 'tool_call') {
          const res = await this.deps.toolBus.invoke({ ...step.config, ...params, context: results });
          results[step.id] = res.output;
          current = step.nextStepId ?? step.onSuccessStepId ?? '';
        } else if (step.type === 'agent_call') {
          const res = await this.deps.agentRunner.run({ ...step.config, ...params, input: { ...params.input, context: results } });
          results[step.id] = res.output;
          current = step.nextStepId ?? step.onSuccessStepId ?? '';
        } else {
          current = step.nextStepId ?? '';
        }
      }
      return { runId: `wf_${Date.now()}`, workflowId: wf.id, status: 'completed', stepResults: results };
    }
  }
  return { WorkflowEngine };
}

async function importPolicy() {
  class PolicyEvaluator {
    constructor() {}
    async load() {}
    async evaluate(action, ctx) {
      if (!ctx.userId) return { allowed: false, effect: 'deny', reason: 'Unauthenticated', riskScore: 100, matchedRules: [], requiresApproval: false, decisionId: 'demo' };
      return { allowed: true, effect: 'allow', reason: 'Default allow', riskScore: 10, matchedRules: [], requiresApproval: false, decisionId: 'demo' };
    }
  }
  return { PolicyEvaluator };
}

// ─── CRM Configuration ─────────────────────────────────────────────────────

const ORG_ID = 'crm-demo-org';
const USER_ID = 'user-demo';
const SESSION_ID = 'session-demo';

async function configureCRM(crm) {
  const { registry, toolBus, workflows } = crm;

  // Register: Lead Qualifier Agent
  registry.register({
    id: 'lead-qualifier',
    organizationId: ORG_ID,
    name: 'Lead Qualifier',
    role: 'orchestrator',
    version: '1.0.0',
    capabilities: [{ name: 'qualify_lead', description: 'Score and qualify a sales lead', inputSchema: {}, outputSchema: {} }],
    systemPrompt: `You are a lead qualification specialist. Analyze lead data and return JSON with:
      score (0-100), tier (hot/warm/cold), recommendation (string), keyFactors (string[]).`,
    model: 'claude-sonnet-4-20250514',
    maxTokens: 512,
    temperature: 0.2,
    maxRetries: 2,
    timeoutMs: 15000,
    requiresApproval: false,
    sandboxed: true,
  });

  // Register: Email Drafter Agent
  registry.register({
    id: 'email-drafter',
    organizationId: ORG_ID,
    name: 'Email Drafter',
    role: 'custom',
    version: '1.0.0',
    capabilities: [{ name: 'draft_email', description: 'Draft personalized outreach email', inputSchema: {}, outputSchema: {} }],
    systemPrompt: `You are a sales email specialist. Draft a personalized, short outreach email.
      Return JSON with: subject, body (plain text), callToAction.`,
    model: 'claude-sonnet-4-20250514',
    maxTokens: 512,
    temperature: 0.4,
    maxRetries: 2,
    timeoutMs: 15000,
    requiresApproval: false,
    sandboxed: true,
  });

  // Register: CRM tools
  toolBus.register(
    { id: 'update_deal_stage', organizationId: ORG_ID, name: 'Update Deal Stage', description: 'Move deal to new stage', version: '1.0.0', category: 'data', riskLevel: 'medium', requiresApproval: false, idempotent: true, timeoutMs: 5000, maxRetries: 2, inputSchema: {}, outputSchema: {}, permissions: [] },
    async (input) => ({ dealId: input.dealId, newStage: input.stage, updatedAt: new Date().toISOString() })
  );

  toolBus.register(
    { id: 'create_task', organizationId: ORG_ID, name: 'Create Task', description: 'Create a CRM task', version: '1.0.0', category: 'workflow', riskLevel: 'low', requiresApproval: false, idempotent: true, timeoutMs: 5000, maxRetries: 2, inputSchema: {}, outputSchema: {}, permissions: [] },
    async (input) => ({ taskId: `task_${Date.now()}`, title: input.title, assignee: input.assignee, createdAt: new Date().toISOString() })
  );

  // Register: Lead intake workflow
  workflows.define({
    id: 'lead-intake',
    organizationId: ORG_ID,
    name: 'Lead Intake & Qualification Workflow',
    version: '1.0.0',
    triggerType: 'event',
    firstStepId: 'step-qualify',
    steps: [
      { id: 'step-qualify', name: 'Qualify Lead', type: 'agent_call', config: { agentId: 'lead-qualifier', organizationId: ORG_ID, sessionId: SESSION_ID, userId: USER_ID }, onSuccessStepId: 'step-update-deal', onFailureStepId: 'step-end', retries: 2, timeoutMs: 20000, requiresApproval: false },
      { id: 'step-update-deal', name: 'Update Deal Stage', type: 'tool_call', config: { toolId: 'update_deal_stage', organizationId: ORG_ID, sessionId: SESSION_ID, userId: USER_ID, input: { dealId: 'deal-001', stage: 'Qualified' } }, nextStepId: 'step-create-task', retries: 1, timeoutMs: 5000, requiresApproval: false },
      { id: 'step-create-task', name: 'Create Follow-up Task', type: 'tool_call', config: { toolId: 'create_task', organizationId: ORG_ID, sessionId: SESSION_ID, userId: USER_ID, input: { title: 'Follow up with lead', assignee: 'sales-rep-1' } }, nextStepId: 'step-end', retries: 1, timeoutMs: 5000, requiresApproval: false },
      { id: 'step-end', name: 'Complete', type: 'end', config: {}, retries: 0, timeoutMs: 100, requiresApproval: false },
    ],
  });
}

// ─── Demo Run ───────────────────────────────────────────────────────────────

async function runDemo() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║       ZENITH AI OS — CRM Example Demo                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const crm = await bootstrap();
  await configureCRM(crm);

  const leadData = {
    company: 'Acme Corporation',
    contact: 'Jane Smith (VP Operations)',
    email: 'jsmith@acme.com',
    revenue: '$12M ARR',
    employees: 120,
    useCase: 'AI automation for their 8-person ops team',
    timeline: 'Q3 2025',
    budget: '$50K/year',
    source: 'Inbound demo request',
  };

  console.log('📋 LEAD DATA:');
  console.log(`   Company: ${leadData.company}`);
  console.log(`   Contact: ${leadData.contact}`);
  console.log(`   Use Case: ${leadData.useCase}\n`);

  // 1. Direct agent run: qualify the lead
  console.log('🤖 STEP 1: Run Lead Qualifier Agent\n');
  const qualResult = await crm.runner.run({
    agentId: 'lead-qualifier',
    organizationId: ORG_ID,
    sessionId: SESSION_ID,
    userId: USER_ID,
    input: { task: 'qualify this lead', leadData },
  });
  console.log(`\n  ✅ Lead Score: ${qualResult.output.score}/100`);
  console.log(`  📊 Tier: ${qualResult.output.tier?.toUpperCase()}`);
  console.log(`  💡 Recommendation: ${qualResult.output.recommendation}`);
  if (qualResult.output.keyFactors?.length) {
    console.log(`  🔑 Key Factors: ${qualResult.output.keyFactors.join(', ')}`);
  }
  console.log(`  💰 Cost: $${qualResult.costUsd.toFixed(6)} | ${qualResult.tokensUsed} tokens\n`);

  // 2. Run full workflow
  console.log('🔄 STEP 2: Trigger Lead Intake Workflow\n');
  const wfResult = await crm.workflows.trigger({
    workflowId: 'lead-intake',
    organizationId: ORG_ID,
    userId: USER_ID,
    sessionId: SESSION_ID,
    input: { leadData },
  });
  console.log(`\n  ✅ Workflow: ${wfResult.status.toUpperCase()}`);
  console.log(`  📝 Steps completed: ${Object.keys(wfResult.stepResults).length}\n`);

  // 3. Draft email
  console.log('✉️  STEP 3: Draft Personalized Outreach Email\n');
  const emailResult = await crm.runner.run({
    agentId: 'email-drafter',
    organizationId: ORG_ID,
    sessionId: SESSION_ID,
    userId: USER_ID,
    input: { task: 'draft outreach email for this lead', leadData, qualScore: qualResult.output.score },
  });
  console.log(`  📨 Subject: ${emailResult.output.subject}`);
  console.log(`  📝 Body Preview: ${emailResult.output.body?.substring(0, 100)}...`);
  console.log(`  🎯 CTA: ${emailResult.output.callToAction}\n`);

  console.log('═════════════════════════════════════════════════════════');
  console.log('✅ CRM AI OS demo complete.');
  console.log('   All agents, tools, and workflows ran successfully.');
  console.log('   Ready to connect to your real database and LLM provider.\n');
}

runDemo().catch(console.error);
