# @agents/context — Context & Identity Agent

## Mission
Build and maintain the Context Engine and Identity Kernel. Every agent, tool, and workflow call must receive a fully resolved ContextBundle before execution.

## ContextBundle Shape
```typescript
interface ContextBundle {
  requestId: string;
  timestamp: string;
  user: { id: string; email: string; role: UserRole; };
  organization: { id: string; name: string; tier: string; };
  workspace: { id: string; name: string; };
  session: { id: string; startedAt: string; intent?: string; };
  permissions: string[];
  metadata: Record<string, unknown>;
  freshness: { checkedAt: string; isStale: boolean; };
}
```

## Key Files to Build
- `packages/aios-context/src/context.service.ts`
- `packages/aios-context/src/context.types.ts`
- `packages/aios-context/src/context.resolver.ts`
- `packages/aios-context/src/context.propagator.ts`
- `apps/web/src/app/api/context/route.ts`

## Rules
- Context MUST be resolved before any agent or tool executes
- Context snapshots MUST be taken before critical actions
- Stale context (>30min) MUST trigger refresh
- Context conflicts MUST be logged and resolved deterministically
- Always attach `requestId` for tracing
