export interface AuditControl {
  id: string;
  domain: string;
  name: string;
  description: string;
  weight: number;
  maturityLevels: string[];
}

export const AUDIT_CONTROLS: AuditControl[] = [
  // 1. Context Management (5 controls)
  { id: 'CTX-01', domain: 'Context Management', name: 'Session Isolation', description: 'Each session is isolated per tenant', weight: 2, maturityLevels: ['L1','L2','L3','L4','L5'] },
  { id: 'CTX-02', domain: 'Context Management', name: 'Role-Based Context', description: 'Context includes user role and intent', weight: 1.5, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'CTX-03', domain: 'Context Management', name: 'Context Expiry', description: 'Sessions expire after configurable TTL', weight: 1, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'CTX-04', domain: 'Context Management', name: 'Workspace Scoping', description: 'Contexts scoped to workspaces', weight: 1.5, maturityLevels: ['L3','L4','L5'] },
  { id: 'CTX-05', domain: 'Context Management', name: 'Metadata Propagation', description: 'Custom metadata propagated through context', weight: 1, maturityLevels: ['L3','L4','L5'] },

  // 2. Memory (5 controls)
  { id: 'MEM-01', domain: 'Memory', name: 'Short-Term Memory', description: 'Conversation history stored per session', weight: 2, maturityLevels: ['L1','L2','L3','L4','L5'] },
  { id: 'MEM-02', domain: 'Memory', name: 'Long-Term Memory', description: 'Persistent facts stored across sessions', weight: 2, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'MEM-03', domain: 'Memory', name: 'Entity Memory', description: 'Named entity tracking across sessions', weight: 1.5, maturityLevels: ['L3','L4','L5'] },
  { id: 'MEM-04', domain: 'Memory', name: 'Semantic Memory', description: 'Vector-based semantic search of memories', weight: 2, maturityLevels: ['L4','L5'] },
  { id: 'MEM-05', domain: 'Memory', name: 'Tenant Isolation', description: 'Memory scoped to organization', weight: 2, maturityLevels: ['L2','L3','L4','L5'] },

  // 3. Agents (5 controls)
  { id: 'AGT-01', domain: 'Agents', name: 'Agent Registry', description: 'Agents are registered and versioned', weight: 2, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'AGT-02', domain: 'Agents', name: 'Iteration Limits', description: 'Agents have configurable max iterations', weight: 1.5, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'AGT-03', domain: 'Agents', name: 'Fallback Agents', description: 'Agents define fallback on failure', weight: 1.5, maturityLevels: ['L3','L4','L5'] },
  { id: 'AGT-04', domain: 'Agents', name: 'Tool Integration', description: 'Agents can invoke registered tools', weight: 2, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'AGT-05', domain: 'Agents', name: 'Run Auditing', description: 'Every agent run is logged with token usage', weight: 1.5, maturityLevels: ['L3','L4','L5'] },

  // 4. Tools (5 controls)
  { id: 'TLS-01', domain: 'Tools', name: 'Tool Registry', description: 'Tools registered with schema validation', weight: 2, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'TLS-02', domain: 'Tools', name: 'Risk Scoring', description: 'Tools have risk level assigned', weight: 1.5, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'TLS-03', domain: 'Tools', name: 'Approval Gate', description: 'High-risk tools require approval', weight: 2, maturityLevels: ['L3','L4','L5'] },
  { id: 'TLS-04', domain: 'Tools', name: 'Permission Checks', description: 'Tools check caller permissions', weight: 2, maturityLevels: ['L3','L4','L5'] },
  { id: 'TLS-05', domain: 'Tools', name: 'Invocation Logging', description: 'Every tool call is logged', weight: 1.5, maturityLevels: ['L3','L4','L5'] },

  // 5. Workflows (5 controls)
  { id: 'WFL-01', domain: 'Workflows', name: 'Workflow Definition', description: 'Workflows defined as declarative steps', weight: 2, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'WFL-02', domain: 'Workflows', name: 'Event-Driven Triggers', description: 'Workflows triggered by events', weight: 1.5, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'WFL-03', domain: 'Workflows', name: 'Dead-Letter Handling', description: 'Failed workflows moved to dead-letter queue', weight: 1.5, maturityLevels: ['L3','L4','L5'] },
  { id: 'WFL-04', domain: 'Workflows', name: 'State Persistence', description: 'Workflow run state persisted', weight: 2, maturityLevels: ['L3','L4','L5'] },
  { id: 'WFL-05', domain: 'Workflows', name: 'Step-Level Logging', description: 'Each step execution logged', weight: 1, maturityLevels: ['L3','L4','L5'] },

  // 6. Knowledge (5 controls)
  { id: 'KNW-01', domain: 'Knowledge', name: 'Ingestion Pipeline', description: 'Documents ingested with provenance tracking', weight: 2, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'KNW-02', domain: 'Knowledge', name: 'Trust Scoring', description: 'Knowledge chunks have trust scores', weight: 2, maturityLevels: ['L3','L4','L5'] },
  { id: 'KNW-03', domain: 'Knowledge', name: 'Hallucination Guardrails', description: 'Claims grounded in retrieved chunks', weight: 2, maturityLevels: ['L3','L4','L5'] },
  { id: 'KNW-04', domain: 'Knowledge', name: 'Semantic Retrieval', description: 'Vector similarity search for RAG', weight: 2, maturityLevels: ['L4','L5'] },
  { id: 'KNW-05', domain: 'Knowledge', name: 'Source Attribution', description: 'Responses cite knowledge sources', weight: 1.5, maturityLevels: ['L4','L5'] },

  // 7. Policy (5 controls)
  { id: 'POL-01', domain: 'Policy', name: 'Hierarchical Rules', description: 'Policy rules span system to user domains', weight: 2, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'POL-02', domain: 'Policy', name: 'Default Deny', description: 'Unmatched actions denied by default', weight: 2, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'POL-03', domain: 'Policy', name: 'Condition Evaluation', description: 'Rules support attribute-based conditions', weight: 1.5, maturityLevels: ['L3','L4','L5'] },
  { id: 'POL-04', domain: 'Policy', name: 'Priority Ordering', description: 'Rules evaluated by priority', weight: 1, maturityLevels: ['L3','L4','L5'] },
  { id: 'POL-05', domain: 'Policy', name: 'Audit Trail', description: 'Every policy decision logged', weight: 1.5, maturityLevels: ['L3','L4','L5'] },

  // 8. Security (5 controls)
  { id: 'SEC-01', domain: 'Security', name: 'Prompt Injection Detection', description: 'Inputs scanned for injection patterns', weight: 2.5, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'SEC-02', domain: 'Security', name: 'PII Detection', description: 'PII detected and redacted from inputs', weight: 2, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'SEC-03', domain: 'Security', name: 'Row-Level Security', description: 'DB enforces tenant data isolation via RLS', weight: 2.5, maturityLevels: ['L3','L4','L5'] },
  { id: 'SEC-04', domain: 'Security', name: 'Audit Logs', description: 'Security events logged immutably', weight: 2, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'SEC-05', domain: 'Security', name: 'Risk Thresholds', description: 'Requests blocked above configurable risk threshold', weight: 2, maturityLevels: ['L3','L4','L5'] },

  // 9. Observability (5 controls)
  { id: 'OBS-01', domain: 'Observability', name: 'Distributed Tracing', description: 'All requests traced with span hierarchy', weight: 2, maturityLevels: ['L3','L4','L5'] },
  { id: 'OBS-02', domain: 'Observability', name: 'Token Cost Tracking', description: 'Token usage and cost tracked per trace', weight: 1.5, maturityLevels: ['L3','L4','L5'] },
  { id: 'OBS-03', domain: 'Observability', name: 'Quality Scoring', description: 'Response quality scored automatically', weight: 1.5, maturityLevels: ['L4','L5'] },
  { id: 'OBS-04', domain: 'Observability', name: 'Error Rate Monitoring', description: 'Error rates tracked per service', weight: 2, maturityLevels: ['L3','L4','L5'] },
  { id: 'OBS-05', domain: 'Observability', name: 'Trace Replay', description: 'Traces can be replayed for debugging', weight: 1, maturityLevels: ['L5'] },

  // 10. Plugins (5 controls)
  { id: 'PLG-01', domain: 'Plugins', name: 'Provider Abstraction', description: 'LLM provider swappable via plugin interface', weight: 2, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'PLG-02', domain: 'Plugins', name: 'Anthropic Support', description: 'Anthropic Claude models supported', weight: 1.5, maturityLevels: ['L1','L2','L3','L4','L5'] },
  { id: 'PLG-03', domain: 'Plugins', name: 'OpenAI Support', description: 'OpenAI models supported via plugin', weight: 1.5, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'PLG-04', domain: 'Plugins', name: 'Model Routing', description: 'Requests routed to provider by model name', weight: 1.5, maturityLevels: ['L3','L4','L5'] },
  { id: 'PLG-05', domain: 'Plugins', name: 'Streaming Support', description: 'Providers support streaming responses', weight: 1, maturityLevels: ['L4','L5'] },

  // 11. Multi-Tenancy (5 controls)
  { id: 'TNT-01', domain: 'Multi-Tenancy', name: 'Org Isolation', description: 'All data scoped to organizationId', weight: 2.5, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'TNT-02', domain: 'Multi-Tenancy', name: 'Tenant-Scoped Memory', description: 'Memory queries filter by org', weight: 2, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'TNT-03', domain: 'Multi-Tenancy', name: 'Tenant-Scoped Agents', description: 'Agent runs isolated per org', weight: 2, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'TNT-04', domain: 'Multi-Tenancy', name: 'Cross-Tenant Prevention', description: 'No data leakage between tenants', weight: 2.5, maturityLevels: ['L3','L4','L5'] },
  { id: 'TNT-05', domain: 'Multi-Tenancy', name: 'Tenant Billing Isolation', description: 'Token costs tracked per tenant', weight: 1, maturityLevels: ['L4','L5'] },

  // 12. SDK & Developer Experience (5 controls)
  { id: 'SDK-01', domain: 'SDK & DX', name: 'Single Bootstrap', description: 'createAIOS() bootstraps entire platform', weight: 2, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'SDK-02', domain: 'SDK & DX', name: 'TypeScript Types', description: 'Full TypeScript types exported', weight: 1.5, maturityLevels: ['L2','L3','L4','L5'] },
  { id: 'SDK-03', domain: 'SDK & DX', name: 'REST API', description: 'HTTP API available for all modules', weight: 2, maturityLevels: ['L3','L4','L5'] },
  { id: 'SDK-04', domain: 'SDK & DX', name: 'Example Applications', description: 'Working example apps provided', weight: 1, maturityLevels: ['L3','L4','L5'] },
  { id: 'SDK-05', domain: 'SDK & DX', name: 'Test Coverage', description: 'Unit and integration tests provided', weight: 1.5, maturityLevels: ['L3','L4','L5'] },
];

export const CERTIFICATION_LEVELS = [
  { level: 'AIOS-L1', threshold: 25, label: 'AI Enabled App' },
  { level: 'AIOS-L2', threshold: 38, label: 'Workflow AI Platform' },
  { level: 'AIOS-L3', threshold: 55, label: 'Operational AI OS' },
  { level: 'AIOS-L4', threshold: 70, label: 'Enterprise AI OS' },
  { level: 'AIOS-L5', threshold: 90, label: 'Open Standard Reference' },
];
