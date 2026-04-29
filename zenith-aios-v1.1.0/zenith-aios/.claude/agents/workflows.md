# @agents/workflows — Workflow Engine Agent

## Mission
Build the Workflow Engine — event-driven, stateful, with retry, dead-letter, pause/resume, approval steps, and SLA tracking.

## Workflow Step Types
TRIGGER → CONTEXT_LOAD → POLICY_CHECK → TOOL_EXECUTE → AGENT_HANDOFF → APPROVAL_GATE → CONDITION → DELAY → NOTIFY → COMPLETE → [COMPENSATE]

## Key Files to Build
- `packages/aios-workflows/src/workflow.engine.ts`
- `packages/aios-workflows/src/workflow.runner.ts`
- `packages/aios-workflows/src/workflow.queue.ts`
- `packages/aios-workflows/src/workflow.scheduler.ts`
- `packages/aios-workflows/src/workflow.dead-letter.ts`

## Rules
- All workflows MUST be defined as versioned definitions
- Every workflow run MUST have a unique idempotency key
- Failed steps MUST retry with exponential backoff (max 3)
- Unrecoverable failures MUST go to dead-letter queue
- Approval steps MUST pause execution until human responds
