import { v4 as uuidv4 } from 'uuid';
import { type ToolDefinition, ToolDefinitionSchema, type ToolInvokeParams, type ToolResult } from './types.js';

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

export interface ApprovalGate {
  requestApproval(params: ToolInvokeParams, tool: ToolDefinition): Promise<boolean>;
}

export class ToolBus {
  private tools = new Map<string, { definition: ToolDefinition; handler: ToolHandler }>();
  private approvalGate?: ApprovalGate;

  setApprovalGate(gate: ApprovalGate): void {
    this.approvalGate = gate;
  }

  register(definition: ToolDefinition, handler: ToolHandler): void {
    const parsed = ToolDefinitionSchema.parse(definition);
    this.tools.set(parsed.id, { definition: parsed, handler });
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()].map(t => t.definition);
  }

  get(toolId: string): ToolDefinition | null {
    return this.tools.get(toolId)?.definition ?? null;
  }

  async invoke(params: ToolInvokeParams): Promise<ToolResult> {
    const callId = params.callId ?? uuidv4();
    const start = Date.now();

    const entry = this.tools.get(params.toolId);
    if (!entry) {
      return {
        toolId: params.toolId,
        callId,
        success: false,
        error: `Tool not found: ${params.toolId}`,
        durationMs: 0,
        riskLevel: 'low',
      };
    }

    const { definition, handler } = entry;

    if (definition.requiresApproval && this.approvalGate) {
      const approved = await this.approvalGate.requestApproval(params, definition);
      if (!approved) {
        return {
          toolId: params.toolId,
          callId,
          success: false,
          error: 'Tool invocation denied by approval gate',
          durationMs: Date.now() - start,
          riskLevel: definition.riskLevel,
        };
      }
    }

    try {
      const output = await handler(params.input);
      return {
        toolId: params.toolId,
        callId,
        success: true,
        output,
        durationMs: Date.now() - start,
        riskLevel: definition.riskLevel,
      };
    } catch (err) {
      return {
        toolId: params.toolId,
        callId,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        riskLevel: definition.riskLevel,
      };
    }
  }
}
