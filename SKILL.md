# SKILL.md — Zenith AI OS Skill Index

> Master index of all Claude Code skills for the Zenith AI OS project. Read this file first, then open the specific skill that applies to your task.

---

## Skill Directory

| Skill File | When to Use |
|------------|-------------|
| `audit-agent.md` | Building or modifying the guardrailed AI audit agent |
| `governance-scoring.md` | Adding/updating regional compliance overlays or Domain 13 controls |
| `gap-analysis.md` | Generating or updating gap register, risk register, or roadmap logic |

---

## Global Rules (Apply to All Skills)

### Code Quality
- All JavaScript uses ES modules (`import`/`export`)
- Use `zod` for all external input validation
- No `any` types — define schemas explicitly
- Functions must be pure where possible — no side effects in scoring logic
- All async functions must use `try/catch` with structured error logging

### Security
- Never log PII, company names, or product URLs to stdout
- All user-supplied strings must be sanitised before passing to AI APIs
- Environment variables via `process.env` — never hardcode secrets
- Input to the audit agent must pass `validateInput()` before hitting the API

### Scoring Invariants
- Control scores: integer, 0–5 inclusive — throw `RangeError` outside this range
- Domain scores: float, 0–100 — normalised from raw scores
- Overall score: float, 0–100 — weighted average of domain scores
- Regional score: float, 0–100 — % of mandatory regional controls passed
- Final score: `baseScore × complianceMultiplier` — never modify base score in place

### Commit Format
```
ZA-XXX: Imperative description (max 72 chars)
```

---

## Skill: audit-agent.md

**Purpose:** Guardrailed AI agent that answers questions about AIOS audits and governance.

### Agent Architecture

```
User Input
  → validateInput() [guardrails.js]
  → buildMessages() [prompts.js]
  → Anthropic API call [claude-sonnet-4-20250514]
  → validateOutput() [guardrails.js]
  → Response to user
```

### System Prompt Template

The system prompt is defined in `src/agent/prompts.js`. It must include all five sections:

```
1. IDENTITY      — Who the agent is and what it does
2. SCOPE         — What topics it will and won't answer
3. GUARDRAILS    — Explicit refusal rules
4. CONTEXT       — AIOS framework knowledge injected here
5. FORMAT        — How to structure responses
```

### Input Guardrail Rules

`validateInput(userMessage)` must reject if:
- Message length > 1000 characters → `GUARDRAIL_TOO_LONG`
- Contains prompt injection patterns (e.g., `ignore previous`, `system:`, `<|im_start|>`) → `GUARDRAIL_INJECTION`
- Requests legal advice → `GUARDRAIL_LEGAL`
- Requests specific vendor recommendations → `GUARDRAIL_VENDOR`
- Off-topic (not related to AI audit, governance, AIOS) → `GUARDRAIL_SCOPE`
- Session limit exceeded → `GUARDRAIL_RATE_SESSION`
- Daily limit exceeded → `GUARDRAIL_RATE_DAILY`

### Output Guardrail Rules

`validateOutput(agentResponse)` must reject if:
- Contains fabricated control scores not present in context → `GUARDRAIL_FABRICATION`
- Makes definitive legal claims → `GUARDRAIL_LEGAL_OUTPUT`
- Recommends specific commercial vendors → `GUARDRAIL_VENDOR_OUTPUT`
- Response length > 2000 characters → truncate with summary

### Agent Implementation Pattern

```javascript
import Anthropic from '@anthropic-ai/sdk';
import { validateInput, validateOutput, GuardrailError } from './guardrails.js';
import { buildSystemPrompt } from './prompts.js';
import logger from '../utils/logger.js';

export class AuditAgent {
  constructor({ region = 'GLOBAL', auditContext = null, sessionId = null }) {
    this.client = new Anthropic();
    this.region = region;
    this.auditContext = auditContext;
    this.sessionId = sessionId;
    this.history = [];
  }

  async ask(userMessage) {
    // 1. Validate input
    const inputResult = await validateInput(userMessage, this.sessionId);
    if (!inputResult.valid) {
      logger.warn('Guardrail rejection (input)', { code: inputResult.code, sessionId: this.sessionId });
      return this._guardrailResponse(inputResult.code);
    }

    // 2. Build messages
    const messages = [...this.history, { role: 'user', content: userMessage }];

    // 3. Call API
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: parseInt(process.env.AIOS_AGENT_MAX_TOKENS || '1000'),
      system: buildSystemPrompt({ region: this.region, auditContext: this.auditContext }),
      messages,
    });

    const raw = response.content[0]?.text || '';

    // 4. Validate output
    const outputResult = await validateOutput(raw);
    if (!outputResult.valid) {
      logger.warn('Guardrail rejection (output)', { code: outputResult.code, sessionId: this.sessionId });
      return this._guardrailResponse(outputResult.code);
    }

    // 5. Update history and return
    this.history.push({ role: 'user', content: userMessage });
    this.history.push({ role: 'assistant', content: outputResult.content });

    return { success: true, content: outputResult.content };
  }

  _guardrailResponse(code) {
    const messages = {
      GUARDRAIL_SCOPE: "I can only answer questions about AI audits, the AIOS framework, and governance. Could you rephrase your question within that scope?",
      GUARDRAIL_LEGAL: "I'm not able to provide legal advice. For legal interpretation of regulations like the EU AI Act, please consult qualified legal counsel.",
      GUARDRAIL_VENDOR: "I provide framework-neutral guidance and don't recommend specific vendors or products.",
      GUARDRAIL_INJECTION: "I noticed something unusual in your message. Could you rephrase your audit question?",
      GUARDRAIL_TOO_LONG: "Your question is quite long. Could you focus it to the most specific thing you'd like to understand?",
      GUARDRAIL_RATE_SESSION: "You've reached the session question limit (20). Please start a new session to continue.",
      GUARDRAIL_RATE_DAILY: "You've reached the daily question limit. Please try again tomorrow.",
      GUARDRAIL_FABRICATION: "I encountered an issue generating a reliable response. Please rephrase or try again.",
    };
    return { success: false, code, content: messages[code] || "I'm unable to answer that question." };
  }
}
```

---

## Skill: governance-scoring.md

**Purpose:** Regional compliance overlays and Domain 13 scoring.

### Domain 13 Control Definitions

| ID | Control | Score 0 | Score 3 | Score 5 |
|----|---------|---------|---------|---------|
| 13.1 | Governance policy document | None exists | Internal doc, not published | Public policy, versioned, linked from product |
| 13.2 | Bias & fairness testing | No testing | Ad-hoc manual checks | Automated in CI/CD pipeline with pass/fail gates |
| 13.3 | Human oversight for high-risk decisions | No override mechanism | Manual review process exists | Automated escalation + documented override log |
| 13.4 | Explainability of outputs | No explanation available | Summary explanations on request | Full trace, confidence scores, model card published |
| 13.5 | Ethics review process | No process | Informal review by engineering | Formal ethics board or structured review gate |

### Regional Overlay Pattern

```javascript
// Each region module must export this shape:
export const EU_AI_ACT = {
  displayName: 'European Union',
  primaryLaw: 'EU AI Act (Regulation 2024/1689)',
  effectiveDate: '2024-08-01',
  controls: [
    { id: 'EU-001', name: 'Risk classification documented', domain: 13, mandatory: true },
    { id: 'EU-002', name: 'Prohibited use assessment completed', domain: 13, mandatory: true },
    { id: 'EU-003', name: 'Conformity assessment (high-risk systems)', domain: 13, mandatory: true },
    { id: 'EU-004', name: 'Human oversight for high-risk AI', domain: 3, mandatory: true },
    { id: 'EU-005', name: 'Technical documentation maintained', domain: 10, mandatory: true },
    { id: 'EU-006', name: 'Transparency obligations met (GPAI)', domain: 8, mandatory: false },
    // ... up to 15 controls per region
  ],
  weights: {
    // Optional domain weight overrides for this region
    13: 0.15,  // Governance weighted higher under EU law
    7: 0.10,   // Policy Engine also elevated
  },
  mandatoryGateThreshold: 0.75,  // 75% of mandatory controls must pass for L3+
};
```

### Score Calculation with Overlay

```javascript
export function calculateFinalScore(baseScore, region, mandatoryControlResults) {
  const overlay = getOverlay(region);
  if (!overlay) return { finalScore: baseScore, regionalScore: null };

  const mandatoryControls = overlay.controls.filter(c => c.mandatory);
  const passed = mandatoryControlResults.filter(r => r.passed).length;
  const regionalScore = (passed / mandatoryControls.length) * 100;

  // Compliance multiplier: 1.0 if all pass, 0.85 floor if none pass
  const multiplier = 0.85 + (0.15 * (passed / mandatoryControls.length));

  return {
    finalScore: Math.round(baseScore * multiplier * 10) / 10,
    regionalScore: Math.round(regionalScore * 10) / 10,
    complianceMultiplier: Math.round(multiplier * 1000) / 1000,
    passedMandatory: passed,
    totalMandatory: mandatoryControls.length,
  };
}
```

---

## Skill: gap-analysis.md

**Purpose:** Generating gap registers, risk registers, and 90-day roadmaps.

### Gap Register Schema

```javascript
// Each gap entry must conform to:
{
  id: 'GAP-001',                    // Sequential, unique
  domain: 13,                        // Domain number
  control: '13.2',                   // Control ID
  controlName: 'Bias & fairness testing',
  currentScore: 1,                   // 0–5
  targetScore: 4,                    // Required for next cert level
  gap: 3,                            // targetScore - currentScore
  severity: 'CRITICAL',              // CRITICAL | MAJOR | MODERATE | MINOR
  scoreImpact: 4.2,                  // Estimated overall score impact of fixing
  remediation: 'Integrate fairness evaluation into CI/CD pipeline using a tool like Fairlearn or AI Fairness 360. Define demographic parity thresholds per model.',
  effort: 'HIGH',                    // HIGH | MEDIUM | LOW
  timeline: 'P1',                    // P0 (0-30d) | P1 (30-60d) | P2 (60-90d)
  owner: 'ML Engineering',
  regionallyMandated: ['EU', 'UK'],  // Regions where this is legally required
}
```

### Severity Classification

| Current Score | Target Score | Gap | Severity |
|---------------|-------------|-----|---------|
| 0 | any | — | CRITICAL |
| 1–2 | 4–5 | ≥3 | CRITICAL |
| 1–2 | 3 | 2 | MAJOR |
| 3 | 5 | 2 | MAJOR |
| 3 | 4 | 1 | MODERATE |
| 4 | 5 | 1 | MINOR |

### Roadmap Structure

```
P0 (Days 0–30): Pre-launch blockers
  → All CRITICAL severity gaps
  → All mandatory regional controls that are failing
  → Any Domain 9 (Security) or Domain 13 (Governance) scores of 0

P1 (Days 30–60): L3 path
  → All MAJOR severity gaps
  → Bring all domains above 40
  → Establish governance policy document (Control 13.1)

P2 (Days 60–90): Maturity hardening
  → All MODERATE severity gaps
  → Target overall score +15 points
  → Begin ethics review process (Control 13.5)
```
