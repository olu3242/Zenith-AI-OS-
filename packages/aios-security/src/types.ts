import { z } from 'zod';

export const SecurityAuditLogSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  organizationId: z.string(),
  userId: z.string(),
  action: z.string(),
  resource: z.string(),
  outcome: z.enum(['allowed', 'blocked', 'flagged']),
  riskScore: z.number().min(0).max(1),
  details: z.string(),
  metadata: z.record(z.unknown()),
});

export type SecurityAuditLog = z.infer<typeof SecurityAuditLogSchema>;

export interface InjectionDetectionResult {
  detected: boolean;
  patterns: string[];
  riskScore: number;
}

export interface PIIScanResult {
  hasPII: boolean;
  types: string[];
  redacted: string;
}

export interface SecurityMiddlewareConfig {
  enableInjectionDetection: boolean;
  enablePIIDetection: boolean;
  maxRiskScore: number;
}

export interface SecurityProcessContext {
  organizationId: string;
  userId: string;
  action: string;
}

export interface SecurityProcessResult {
  allowed: boolean;
  processed: string;
  auditEntry: SecurityAuditLog;
}
