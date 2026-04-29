import { type AgentDefinition, AgentDefinitionSchema } from './types.js';

export class AgentRegistry {
  private agents = new Map<string, AgentDefinition>();

  register(definition: AgentDefinition): void {
    const parsed = AgentDefinitionSchema.parse(definition);
    this.agents.set(parsed.id, parsed);
  }

  get(agentId: string): AgentDefinition | null {
    return this.agents.get(agentId) ?? null;
  }

  list(): AgentDefinition[] {
    return [...this.agents.values()];
  }

  unregister(agentId: string): void {
    this.agents.delete(agentId);
  }
}
