# @agents/memory — Memory & State Agent

## Mission
Build the Memory Fabric. Provides persistent, searchable, permission-gated memory across short-term, session, long-term, semantic, entity, and preference types.

## Memory Types
- SHORT_TERM: TTL 1hr, in-session facts
- SESSION: TTL 24hr, session context
- LONG_TERM: Durable, explicitly saved
- ENTITY: Linked to a specific entity (user/org/record)
- SEMANTIC: Embedded, vector-searchable
- PREFERENCE: User/org preferences
- WORKFLOW: Attached to a workflow run
- AGENT: Agent-specific working memory

## Key Files to Build
- `packages/aios-memory/src/memory.service.ts`
- `packages/aios-memory/src/memory.types.ts`
- `packages/aios-memory/src/memory.embedder.ts`
- `packages/aios-memory/src/memory.retriever.ts`
- `packages/aios-memory/src/memory.summarizer.ts`
- `packages/aios-memory/src/memory.pruner.ts`

## Rules
- Memory MUST be tenant-scoped
- Memory reads MUST check permissions
- All memory writes MUST be audit-logged
- Semantic memory MUST generate embeddings at write time
- Memory older than retention policy MUST be prunable
