# CLAUDE.md — Zenith AI OS

## Project Overview

This is the **Zenith AI OS** codebase — an open-standard audit and certification framework for production AI systems (AIOS-STANDARD-v1.1). It includes a landing page, scoring engine, regional governance overlays, and a guardrailed AI audit agent.

## Commit Format

All commits must follow:
```
ZA-XXX: Short imperative description
```
Examples:
- `ZA-001: Add EU AI Act mandatory controls to governance overlay`
- `ZA-042: Fix Policy Engine weight calculation in aggregator`
- `ZA-103: Update landing page FAQ section with regional compliance questions`

## Architecture

```
src/
├── agent/          # Guardrailed AI audit agent (Anthropic Claude)
├── scoring/        # AIOS scoring engine + regional overlays
├── reports/        # Gap/risk/roadmap report generators
└── landing/        # Landing page HTML/CSS/JS
```

## Key Conventions

### Scoring Engine
- All control scores are integers 0–5
- Domain scores normalize to 0–100 scale: `(rawScore / maxPossible) * 100`
- Overall score = weighted average across all active domains
- Governance domain (Domain 13) weight = 12% — highest single domain
- Regional overlay applies AFTER base score is calculated
- Never mutate the base score — always return a new object

### AI Agent
- Agent MUST import guardrails before any API call: `import { validateInput, validateOutput } from './guardrails.js'`
- System prompt lives in `src/agent/prompts.js` — do not inline it
- All agent responses must pass output guardrail before returning to user
- Log all guardrail rejections to Winston logger with level `warn`
- Session limit: 20 questions per session
- Daily limit: 100 questions per user (rate-limiter-flexible)

### Regional Compliance
- Region codes are ISO 3166-1 alpha-2: `EU`, `US`, `GB`, `SG`, `CA`
- `GLOBAL` maps to ISO 42001
- Each region module exports: `{ controls, weights, mandatoryGates, displayName, primaryLaw }`
- Compliance multiplier range: 0.85–1.0 (never below 0.85 regardless of failures)

### Frontend (Landing Page)
- CSS variables defined in `:root` — never hardcode colors
- Brand palette: `--black: #080A0C`, `--gold: #E8B84B`, `--cream: #EDE8DC`
- Fonts: Bebas Neue (display), Crimson Pro (body), IBM Plex Mono (mono)
- No external JS frameworks — vanilla JS only for the landing page
- FAQ section uses accordion pattern with `data-faq-index` attributes

## Environment Variables

```
ANTHROPIC_API_KEY=          # Required for AI agent
AIOS_AGENT_MAX_TOKENS=1000  # Default agent response length
AIOS_RATE_LIMIT_DAILY=100   # Questions per user per day
AIOS_RATE_LIMIT_SESSION=20  # Questions per session
AIOS_LOG_LEVEL=info         # Winston log level
PORT=3000                   # Express server port
```

## Testing

```bash
npm test                    # Run all tests
npm run test:coverage       # Coverage report
```

Test files live alongside source: `src/scoring/aios-standard.test.js`

## Skills

See `.claude/skills/SKILL.md` for the master skill index. When working on:
- **Scoring logic** → use `governance-scoring.md`
- **Agent** → use `audit-agent.md`
- **Gap analysis** → use `gap-analysis.md`
