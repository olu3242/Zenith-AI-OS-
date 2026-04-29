# @agents/tools — Tool & Action Bus Agent

## Mission
Build the Tool Bus — schema-based, permission-gated, idempotent tool invocation layer.

## Tool Lifecycle
REGISTER → VALIDATE_SCHEMA → CHECK_PERMISSIONS → RISK_SCORE → [APPROVAL?] → DRY_RUN? → EXECUTE → VERIFY → LOG → [ROLLBACK?]

## Default Tools
- send_email, create_task, update_record, search_knowledge
- generate_document, create_workflow_event, call_webhook
- classify_intent, score_risk, run_audit

## Key Files to Build
- `packages/aios-tools/src/tool.bus.ts`
- `packages/aios-tools/src/tool.registry.ts`
- `packages/aios-tools/src/tool.validator.ts`
- `packages/aios-tools/src/tool.executor.ts`
- `packages/aios-tools/src/tool.verifier.ts`
- `packages/aios-tools/src/tools/send-email.tool.ts`

## Rules
- Every tool MUST have a Zod input/output schema
- Every tool call MUST have an idempotency key
- Risk score ≥ 7/10 MUST trigger human approval gate
- All tool invocations MUST be logged
- Rollback hooks MUST be registered for state-mutating tools
