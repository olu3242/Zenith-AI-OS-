/**
 * AIOS Security Middleware
 * Tenant isolation, RBAC, prompt injection detection, PII controls,
 * sensitive action gates, and comprehensive security event logging.
 */

import { z } from 'zod';

// ─── Schemas ───────────────────────────────────────────────────────────────

export const SecurityEventTypeSchema = z.enum([
  'auth_failure', 'permission_denied', 'prompt_injection_detected',
  'pii_access', 'tenant_isolation_violation', 'rate_limit_exceeded',
  'sensitive_action_blocked', 'anomalous_access', 'data_exfiltration_attempt',
]);

export type SecurityEventType = z.infer<typeof SecurityEventTypeSchema>;

export interface SecurityEvent {
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  organizationId?: string;
  ipAddress?: string;
  userAgent?: string;
  resourceType?: string;
  resourceId?: string;
  details: Record<string, unknown>;
  timestamp: string;
}

// ─── Prompt Injection Detector ─────────────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore\s+(previous|above|all)\s+instructions/gi,
  /you\s+are\s+now\s+(a\s+)?(different|new|another|evil|jailbroken)/gi,
  /pretend\s+(you\s+are|to\s+be)\s+/gi,
  /system\s*:\s*\[/gi,
  /\[INST\]|\[\/INST\]/g,
  /<\|im_start\|>|<\|im_end\|>/g,
  /jailbreak|DAN mode|do anything now/gi,
  /reveal\s+(your|the)\s+(system\s+)?prompt/gi,
  /forget\s+(all\s+)?(your\s+)?(previous\s+)?(instructions|training)/gi,
  /act\s+as\s+if\s+(you\s+have\s+no|without\s+any)\s+(restrictions|limits)/gi,
];

export class PromptInjectionDetector {
  detect(text: string): { detected: boolean; patterns: string[]; riskScore: number } {
    const matches: string[] = [];

    for (const pattern of INJECTION_PATTERNS) {
      const m = text.match(pattern);
      if (m) matches.push(...m.map((s) => s.substring(0, 50)));
    }

    const riskScore = Math.min(100, matches.length * 25);
    return { detected: matches.length > 0, patterns: matches, riskScore };
  }
}

// ─── Security Middleware ───────────────────────────────────────────────────

export interface SecurityMiddlewareDeps {
  db: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> };
  auditLogger: { log: (event: string, data: unknown) => Promise<void> };
  logger: { info: (msg: string, meta?: unknown) => void; error: (msg: string, meta?: unknown) => void };
}

export class SecurityMiddleware {
  private injectionDetector = new PromptInjectionDetector();

  constructor(private deps: SecurityMiddlewareDeps) {}

  /** Verify tenant isolation — ensure user belongs to claimed org */
  async verifyTenantIsolation(userId: string, orgId: string): Promise<void> {
    const { rows } = await this.deps.db.query(
      `SELECT 1 FROM memberships WHERE user_id = $1 AND organization_id = $2 AND status = 'active'`,
      [userId, orgId]
    );

    if (!rows.length) {
      await this.logSecurityEvent({
        type: 'tenant_isolation_violation',
        severity: 'critical',
        userId, organizationId: orgId,
        details: { message: 'User not member of claimed organization' },
        timestamp: new Date().toISOString(),
      });
      throw new Error('Tenant isolation violation: unauthorized access');
    }
  }

  /** Check role-based permission */
  async hasPermission(userId: string, permission: string, orgId: string): Promise<boolean> {
    const { rows } = await this.deps.db.query(
      `SELECT 1 FROM permissions p
       JOIN roles r ON r.id = p.role_id
       JOIN memberships m ON m.role_id = r.id
       WHERE m.user_id = $1 AND m.organization_id = $2 AND p.key = $3 AND m.status = 'active'`,
      [userId, orgId, permission]
    );
    return rows.length > 0;
  }

  /** Scan input for prompt injection */
  async scanForInjection(params: {
    text: string;
    userId: string;
    orgId: string;
    context: string;
  }): Promise<{ safe: boolean; riskScore: number }> {
    const result = this.injectionDetector.detect(params.text);

    if (result.detected) {
      await this.logSecurityEvent({
        type: 'prompt_injection_detected',
        severity: result.riskScore >= 75 ? 'critical' : 'high',
        userId: params.userId,
        organizationId: params.orgId,
        details: {
          context: params.context,
          patterns: result.patterns,
          riskScore: result.riskScore,
          textSnippet: params.text.substring(0, 200),
        },
        timestamp: new Date().toISOString(),
      });

      await this.deps.db.query(
        `INSERT INTO prompt_injection_events (user_id, organization_id, context, patterns, risk_score, created_at)
         VALUES ($1,$2,$3,$4::jsonb,$5,NOW())`,
        [params.userId, params.orgId, params.context, JSON.stringify(result.patterns), result.riskScore]
      );
    }

    return { safe: !result.detected, riskScore: result.riskScore };
  }

  /** Mask PII in log output */
  maskPII(data: Record<string, unknown>): Record<string, unknown> {
    const PII_KEYS = ['email', 'phone', 'ssn', 'dob', 'address', 'creditCard', 'password', 'token', 'secret'];
    const masked = { ...data };

    for (const key of Object.keys(masked)) {
      const lower = key.toLowerCase();
      if (PII_KEYS.some((k) => lower.includes(k))) {
        const val = masked[key];
        if (typeof val === 'string') {
          masked[key] = val.length > 4 ? `${val.substring(0, 2)}***${val.slice(-2)}` : '***';
        } else {
          masked[key] = '[REDACTED]';
        }
      }
    }

    return masked;
  }

  /** Validate and sanitize API key */
  async validateApiKey(key: string, orgId: string): Promise<{ valid: boolean; serviceAccountId?: string }> {
    const hash = await this.hashKey(key);

    const { rows } = await this.deps.db.query(
      `SELECT service_account_id FROM api_keys
       WHERE key_hash = $1 AND organization_id = $2
         AND (expires_at IS NULL OR expires_at > NOW())
         AND status = 'active'`,
      [hash, orgId]
    );

    if (!rows.length) {
      await this.logSecurityEvent({
        type: 'auth_failure',
        severity: 'medium',
        organizationId: orgId,
        details: { reason: 'Invalid or expired API key' },
        timestamp: new Date().toISOString(),
      });
      return { valid: false };
    }

    return { valid: true, serviceAccountId: (rows[0] as { service_account_id: string }).service_account_id };
  }

  /** Rate limit check */
  async checkRateLimit(params: {
    key: string; orgId: string; limit: number; windowSecs: number;
  }): Promise<{ allowed: boolean; remaining: number }> {
    const windowStart = new Date(Date.now() - params.windowSecs * 1000).toISOString();

    const { rows } = await this.deps.db.query(
      `SELECT COUNT(*) as count FROM audit_logs
       WHERE organization_id = $1 AND metadata->>'rateKey' = $2 AND created_at >= $3`,
      [params.orgId, params.key, windowStart]
    );

    const count = parseInt((rows[0] as { count: string }).count, 10);
    const remaining = Math.max(0, params.limit - count);

    if (remaining === 0) {
      await this.logSecurityEvent({
        type: 'rate_limit_exceeded',
        severity: 'medium',
        organizationId: params.orgId,
        details: { key: params.key, limit: params.limit, windowSecs: params.windowSecs },
        timestamp: new Date().toISOString(),
      });
    }

    return { allowed: remaining > 0, remaining };
  }

  /** Log a security event */
  async logSecurityEvent(event: SecurityEvent): Promise<void> {
    await this.deps.db.query(
      `INSERT INTO security_events (type, severity, user_id, organization_id, ip_address, details, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,NOW())`,
      [
        event.type, event.severity, event.userId ?? null,
        event.organizationId ?? null, event.ipAddress ?? null,
        JSON.stringify(this.maskPII(event.details)),
      ]
    );

    if (event.severity === 'critical') {
      this.deps.logger.error('CRITICAL SECURITY EVENT', { type: event.type, details: event.details });
    }

    await this.deps.auditLogger.log('SECURITY_EVENT', {
      type: event.type, severity: event.severity, orgId: event.organizationId,
    });
  }

  private async hashKey(key: string): Promise<string> {
    // In production: use crypto.subtle or bcrypt
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await (globalThis.crypto?.subtle?.digest('SHA-256', data) ?? Promise.resolve(data));
    return Array.from(new Uint8Array(hashBuffer as ArrayBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
