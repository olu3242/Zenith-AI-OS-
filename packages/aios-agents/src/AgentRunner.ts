import { v4 as uuidv4 } from 'uuid';
import { AgentRegistry } from './AgentRegistry.js';
import { type AgentRunParams, type AgentRunResult } from './types.js';

export interface LLMProvider {
  complete(params: {
    model: string;
    systemPrompt: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    tools?: Array<{ id: string; name: string; description: string; inputSchema: Record<string, unknown> }>;
  }): Promise<{
    content: string;
    toolCalls?: Array<{ toolId: string; callId: string; input: Record<string, unknown> }>;
    usage: { inputTokens: number; outputTokens: number };
    stopReason: 'stop' | 'tool_use' | 'max_tokens';
  }>;
}

export interface ToolExecutor {
  invoke(params: { toolId: string; organizationId: string; sessionId: string; userId: string; input: Record<string, unknown>; callId: string }): Promise<{ success: boolean; output?: unknown; error?: string }>;
}

export class AgentRunner {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly llm: LLMProvider,
    private readonly toolExecutor: ToolExecutor,
  ) {}

  async run(params: AgentRunParams): Promise<AgentRunResult> {
    const runId = params.runId ?? uuidv4();
    const start = Date.now();

    const agent = this.registry.get(params.agentId);
    if (!agent) {
      return {
        runId, agentId: params.agentId, status: 'failed',
        error: `Agent not found: ${params.agentId}`,
        iterations: 0, durationMs: 0, tokenUsage: { input: 0, output: 0 },
      };
    }

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: JSON.stringify(params.input) },
    ];
    let totalInput = 0;
    let totalOutput = 0;
    let iterations = 0;

    try {
      while (iterations < agent.maxIterations) {
        iterations++;

        const response = await this.llm.complete({
          model: agent.model,
          systemPrompt: agent.systemPrompt,
          messages,
          tools: agent.tools.map(id => ({ id, name: id, description: '', inputSchema: {} })),
        });

        totalInput += response.usage.inputTokens;
        totalOutput += response.usage.outputTokens;

        if (response.stopReason === 'stop' || !response.toolCalls?.length) {
          return {
            runId, agentId: params.agentId, status: 'completed',
            output: response.content,
            iterations, durationMs: Date.now() - start,
            tokenUsage: { input: totalInput, output: totalOutput },
          };
        }

        messages.push({ role: 'assistant', content: response.content });

        const toolResults: string[] = [];
        for (const tc of response.toolCalls) {
          const result = await this.toolExecutor.invoke({
            toolId: tc.toolId, callId: tc.callId,
            organizationId: params.organizationId,
            sessionId: params.sessionId, userId: params.userId,
            input: tc.input,
          });
          toolResults.push(
            `Tool ${tc.toolId}: ${result.success ? JSON.stringify(result.output) : `Error: ${result.error}`}`,
          );
        }
        messages.push({ role: 'user', content: toolResults.join('\n') });
      }

      return {
        runId, agentId: params.agentId, status: 'failed',
        error: `Max iterations (${agent.maxIterations}) reached`,
        iterations, durationMs: Date.now() - start,
        tokenUsage: { input: totalInput, output: totalOutput },
      };
    } catch (err) {
      return {
        runId, agentId: params.agentId, status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        iterations, durationMs: Date.now() - start,
        tokenUsage: { input: totalInput, output: totalOutput },
      };
    }
  }
}
