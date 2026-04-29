# @agents/observability — Observability & Reliability Agent

## Mission
Build the AI OS Observability Layer — traces, metrics, cost tracking, failure analytics, replay, and reliability drills.

## Trace Structure
Request → Context → Agent → Tool/Workflow → Response
Each step: span_id, parent_span_id, start_ms, end_ms, status, metadata

## Key Files to Build
- `packages/aios-observability/src/tracer.ts`
- `packages/aios-observability/src/metrics.service.ts`
- `packages/aios-observability/src/cost.tracker.ts`
- `packages/aios-observability/src/replay.service.ts`
- `packages/aios-observability/src/alert.service.ts`

## Metrics to Capture
- p50/p95/p99 latency per agent/tool/workflow
- Token consumption per model per tenant
- Cost per request, per day, per tenant
- Failure rates by category
- Queue depth and throughput
