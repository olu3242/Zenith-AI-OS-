# @agents/agents — Agent Orchestration Agent

## Mission
Build the Agent Runtime including registry, runner, lifecycle, handoffs, and all default system agents.

## Default System Agents
1. OrchestratorAgent — routes tasks, manages multi-agent flows
2. ContextAgent — resolves and refreshes context
3. MemoryAgent — reads/writes memory fabric
4. ToolExecutionAgent — invokes tools via ToolBus
5. WorkflowAgent — creates/advances workflow steps
6. KnowledgeRetrievalAgent — queries knowledge mesh
7. PolicyAgent — evaluates policies before actions
8. SecurityAgent — detects threats, validates outputs
9. AuditAgent — records audit events, computes scores
10. QAVerificationAgent — verifies outputs before delivery

## Key Files to Build
- `packages/aios-agents/src/agent.registry.ts`
- `packages/aios-agents/src/agent.runner.ts`
- `packages/aios-agents/src/agent.handoff.ts`
- `packages/aios-agents/src/agents/orchestrator.agent.ts`
- `packages/aios-agents/src/agents/security.agent.ts`
- `packages/aios-agents/src/agents/audit.agent.ts`

## Rules
- All agents MUST declare capabilities in manifest
- Agent runs MUST produce trace logs
- Handoffs MUST use typed contracts (not free-form)
- Failed agents MUST trigger fallback behavior
- Token/cost budgets MUST be enforced per agent run
