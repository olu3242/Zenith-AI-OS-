/**
 * @zenith/aios-sdk — Public surface.
 * Import everything you need from here.
 */

// ─── Bootstrap ────────────────────────────────────────────────────────────────
export { createAIOS } from './createAIOS.js';
export type { AIOS, AIOSConfig } from './createAIOS.js';

// ─── Core Types ───────────────────────────────────────────────────────────────
export type {
  UUID, JsonObject, Timestamp,
  Organization, Workspace, User, UserRole,
  ContextBundle, MemoryItem, MemoryType,
  AgentDefinition, AgentRun, AgentStatus,
  ToolDefinition, ToolInvocationRequest, ToolInvocationResult, RiskLevel,
  WorkflowDefinition, WorkflowStep, PolicyDecision,
  AuditRunResult,
} from '@zenith/aios-core';

export type { AuditDomain, MaturityBand, CertificationLevel, AuditFinding } from '@zenith/aios-core';

// ─── Context ──────────────────────────────────────────────────────────────────
export { ContextService, InMemoryContextStore } from '@zenith/aios-context';
export type { ContextStore, CreateContextInput, SessionContext } from '@zenith/aios-context';

// ─── Memory ───────────────────────────────────────────────────────────────────
export { MemoryService, InMemoryMemoryStore } from '@zenith/aios-memory';
export type { MemoryStore, MemorySearchParams } from '@zenith/aios-memory';

// ─── Agents ───────────────────────────────────────────────────────────────────
export { AgentRunner, AgentRegistry } from '@zenith/aios-agents';
export type { AgentRunResult, LLMProvider, ToolExecutor } from '@zenith/aios-agents';

// ─── Tools ────────────────────────────────────────────────────────────────────
export { ToolBus } from '@zenith/aios-tools';
export type { ApprovalGate, ToolResult } from '@zenith/aios-tools';

// ─── Workflows ────────────────────────────────────────────────────────────────
export { WorkflowEngine, InMemoryWorkflowStore } from '@zenith/aios-workflows';
export type { WorkflowRun, WorkflowRunStatus, TriggerInput } from '@zenith/aios-workflows';

// ─── Knowledge ────────────────────────────────────────────────────────────────
export { KnowledgeService, HallucinationGuard, InMemoryKnowledgeStore } from '@zenith/aios-knowledge';
export type { KnowledgeChunk, KnowledgeSource, HallucinationAssessment } from '@zenith/aios-knowledge';

// ─── Policy ───────────────────────────────────────────────────────────────────
export { PolicyEvaluator } from '@zenith/aios-policy';
export type { PolicyRule, PolicyDecision, EvaluationContext } from '@zenith/aios-policy';

// ─── Security ─────────────────────────────────────────────────────────────────
export { SecurityMiddleware, PromptInjectionDetector } from '@zenith/aios-security';
export type { SecurityAuditLog, InjectionDetectionResult } from '@zenith/aios-security';

// ─── Observability ────────────────────────────────────────────────────────────
export { AIOSTracer, QualityScorer } from '@zenith/aios-observability';
export type { Span, SpanEvent, TraceMetrics } from '@zenith/aios-observability';

// ─── Audit ────────────────────────────────────────────────────────────────────
export { AuditEngine, AUDIT_CONTROLS, DEFAULT_AUDIT_CONTROLS, CERTIFICATION_LEVELS } from '@zenith/aios-audit';
export type { AuditControl, AuditReport, ControlResult, ControlEvaluationMap } from '@zenith/aios-audit';

// ─── Plugins ──────────────────────────────────────────────────────────────────
export { PluginRegistry, AnthropicPlugin, OpenAIPlugin } from '@zenith/aios-plugins';
export type { LLMPlugin, LLMCompleteParams, LLMResponse } from '@zenith/aios-plugins';
