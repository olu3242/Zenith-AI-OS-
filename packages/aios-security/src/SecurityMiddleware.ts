import { v4 as uuidv4 } from 'uuid';
import type {
  InjectionDetectionResult,
  PIIScanResult,
  SecurityAuditLog,
  SecurityMiddlewareConfig,
  SecurityProcessContext,
  SecurityProcessResult,
} from './types.js';

// ---------------------------------------------------------------------------
// PromptInjectionDetector
// ---------------------------------------------------------------------------

const INJECTION_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /ignore\s+(previous|prior|all)\s+instructions/i, label: 'ignore previous instructions' },
  { pattern: /act\s+as\s+(a|an|the)\s+/i, label: 'act as persona' },
  { pattern: /jailbreak/i, label: 'jailbreak' },
  { pattern: /system\s+prompt\s+override/i, label: 'system prompt override' },
  { pattern: /you\s+are\s+now\s+(a|an|the)\s+/i, label: 'persona reassignment' },
  { pattern: /disregard\s+(all|any|previous)\s+(prior\s+)?(instructions|rules|guidelines)/i, label: 'disregard instructions' },
  { pattern: /forget\s+(everything|all)\s+(you\s+)?(know|were\s+told)/i, label: 'forget instructions' },
  { pattern: /do\s+not\s+follow\s+(your\s+)?(previous\s+)?instructions/i, label: 'do not follow instructions' },
  { pattern: /reveal\s+(your\s+)?(system\s+prompt|instructions|prompt)/i, label: 'reveal system prompt' },
  { pattern: /\bDAN\b/i, label: 'DAN jailbreak' },
  { pattern: /pretend\s+(you\s+are|to\s+be)\s+(a|an|the)\s+/i, label: 'pretend persona' },
  { pattern: /new\s+instructions?\s*:/i, label: 'new instructions injection' },
];

export class PromptInjectionDetector {
  detect(input: string): InjectionDetectionResult {
    const matched: string[] = [];

    for (const { pattern, label } of INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        matched.push(label);
      }
    }

    const riskScore = Math.min(1, matched.length / INJECTION_PATTERNS.length);

    return {
      detected: matched.length > 0,
      patterns: matched,
      riskScore,
    };
  }
}

// ---------------------------------------------------------------------------
// PIIDetector
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/g;
const SSN_REGEX = /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g;
const CREDIT_CARD_REGEX = /\b(?:\d[ \-]?){13,16}\b/g;

export class PIIDetector {
  scan(text: string): PIIScanResult {
    const types: string[] = [];
    let redacted = text;

    // Order matters: run credit card before phone to avoid partial overlaps
    const creditCardMatches = text.match(CREDIT_CARD_REGEX);
    if (creditCardMatches !== null && creditCardMatches.length > 0) {
      types.push('CREDIT_CARD');
      redacted = redacted.replace(CREDIT_CARD_REGEX, '[CREDIT_CARD]');
    }

    const emailMatches = text.match(EMAIL_REGEX);
    if (emailMatches !== null && emailMatches.length > 0) {
      types.push('EMAIL');
      redacted = redacted.replace(EMAIL_REGEX, '[EMAIL]');
    }

    const phoneMatches = text.match(PHONE_REGEX);
    if (phoneMatches !== null && phoneMatches.length > 0) {
      types.push('PHONE');
      redacted = redacted.replace(PHONE_REGEX, '[PHONE]');
    }

    const ssnMatches = text.match(SSN_REGEX);
    if (ssnMatches !== null && ssnMatches.length > 0) {
      types.push('SSN');
      redacted = redacted.replace(SSN_REGEX, '[SSN]');
    }

    return {
      hasPII: types.length > 0,
      types,
      redacted,
    };
  }
}

// ---------------------------------------------------------------------------
// SecurityMiddleware
// ---------------------------------------------------------------------------

export class SecurityMiddleware {
  private readonly config: SecurityMiddlewareConfig;
  private readonly injectionDetector: PromptInjectionDetector;
  private readonly piiDetector: PIIDetector;
  private readonly logs: SecurityAuditLog[] = [];

  constructor(config: SecurityMiddlewareConfig) {
    this.config = config;
    this.injectionDetector = new PromptInjectionDetector();
    this.piiDetector = new PIIDetector();
  }

  async process(
    input: string,
    context: SecurityProcessContext,
  ): Promise<SecurityProcessResult> {
    let processed = input;
    let riskScore = 0;
    let outcome: SecurityAuditLog['outcome'] = 'allowed';
    const details: string[] = [];

    // Injection detection
    if (this.config.enableInjectionDetection) {
      const injectionResult = this.injectionDetector.detect(input);
      if (injectionResult.detected) {
        riskScore = Math.max(riskScore, injectionResult.riskScore);
        details.push(`Injection patterns detected: ${injectionResult.patterns.join(', ')}`);
      }
    }

    // PII detection & redaction
    if (this.config.enablePIIDetection) {
      const piiResult = this.piiDetector.scan(processed);
      if (piiResult.hasPII) {
        processed = piiResult.redacted;
        details.push(`PII types redacted: ${piiResult.types.join(', ')}`);
        if (riskScore < 0.3) {
          riskScore = Math.max(riskScore, 0.3);
        }
      }
    }

    // Determine outcome
    if (riskScore > this.config.maxRiskScore) {
      outcome = 'blocked';
    } else if (riskScore > 0) {
      outcome = 'flagged';
    }

    const auditEntry: SecurityAuditLog = {
      id: uuidv4(),
      timestamp: Date.now(),
      organizationId: context.organizationId,
      userId: context.userId,
      action: context.action,
      resource: 'input',
      outcome,
      riskScore,
      details: details.length > 0 ? details.join('; ') : 'No issues detected',
      metadata: {},
    };

    this.logs.push(auditEntry);

    return {
      allowed: outcome !== 'blocked',
      processed,
      auditEntry,
    };
  }

  getLogs(organizationId: string): SecurityAuditLog[] {
    return this.logs.filter((log) => log.organizationId === organizationId);
  }
}
