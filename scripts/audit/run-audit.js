#!/usr/bin/env node
/**
 * ZENITH AI OS — Audit Runner CLI
 * Usage: node scripts/audit/run-audit.js [options]
 *
 * Options:
 *   --org-id <uuid>          Organization ID to audit
 *   --framework <id>         Framework ID (default: framework-aios-standard-v1)
 *   --output <path>          Output file path (default: stdout)
 *   --format <json|md|text>  Output format (default: text)
 *   --scores <csv>           Comma-separated domain:score pairs for simulation
 *   --verbose                Show detailed scoring per control
 *   --help                   Show this help
 *
 * Examples:
 *   node scripts/audit/run-audit.js --org-id abc-123 --format md
 *   node scripts/audit/run-audit.js --scores "identity_context:78,memory:65,agent_orchestration:72"
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── CLI Args ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    orgId: null,
    framework: 'framework-aios-standard-v1',
    output: null,
    format: 'text',
    scores: {},
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--org-id':   opts.orgId = args[++i]; break;
      case '--framework': opts.framework = args[++i]; break;
      case '--output':   opts.output = args[++i]; break;
      case '--format':   opts.format = args[++i]; break;
      case '--verbose':  opts.verbose = true; break;
      case '--help':     opts.help = true; break;
      case '--scores':
        const pairs = args[++i].split(',');
        for (const pair of pairs) {
          const [domain, score] = pair.split(':');
          if (domain && score) opts.scores[domain.trim()] = parseFloat(score.trim());
        }
        break;
    }
  }
  return opts;
}

// ─── Scoring Model ─────────────────────────────────────────────────────────

const DOMAIN_WEIGHTS = {
  identity_context:    0.08,
  memory:              0.08,
  agent_orchestration: 0.10,
  tool_execution:      0.09,
  workflow_engine:     0.09,
  knowledge_retrieval: 0.08,
  policy_engine:       0.09,
  interface:           0.07,
  security_trust:      0.10,
  observability:       0.08,
  extensibility:       0.07,
  deployment:          0.07,
};

const MATURITY_BANDS = [
  { min: 0,  max: 25,  label: 'AI-Enabled Application',   color: '\x1b[31m' },
  { min: 25, max: 45,  label: 'Emerging AI Platform',      color: '\x1b[33m' },
  { min: 45, max: 65,  label: 'Functional AI OS',          color: '\x1b[36m' },
  { min: 65, max: 80,  label: 'Advanced AI OS',            color: '\x1b[32m' },
  { min: 80, max: 90,  label: 'Standard-Ready AI OS',      color: '\x1b[92m' },
  { min: 90, max: 101, label: 'Open Standard Candidate',   color: '\x1b[95m' },
];

const CERT_LEVELS = [
  { level: 'AIOS-L1', threshold: 25,  label: 'AI Enabled App' },
  { level: 'AIOS-L2', threshold: 38,  label: 'Workflow AI Platform' },
  { level: 'AIOS-L3', threshold: 55,  label: 'Operational AI OS' },
  { level: 'AIOS-L4', threshold: 70,  label: 'Enterprise AI OS' },
  { level: 'AIOS-L5', threshold: 90,  label: 'Open Standard Reference' },
];

function computeOverallScore(domainScores) {
  let total = 0;
  for (const [domain, weight] of Object.entries(DOMAIN_WEIGHTS)) {
    const score = domainScores[domain] ?? 50;
    total += score * weight;
  }
  return Math.round(total * 10) / 10;
}

function getMaturityBand(score) {
  return MATURITY_BANDS.find(b => score >= b.min && score < b.max) || MATURITY_BANDS[0];
}

function getCertLevel(score) {
  let level = null;
  for (const cert of CERT_LEVELS) {
    if (score >= cert.threshold) level = cert;
  }
  return level || { level: 'UNCERTIFIED', threshold: 0, label: 'Below minimum threshold' };
}

function detectGaps(domainScores) {
  const gaps = [];
  for (const [domain, score] of Object.entries(domainScores)) {
    if (score < 40) {
      gaps.push({ domain, score, severity: score < 20 ? 'critical' : score < 30 ? 'major' : 'moderate' });
    }
  }
  return gaps.sort((a, b) => a.score - b.score);
}

// ─── Default Scores (demo) ─────────────────────────────────────────────────

const DEFAULT_SCORES = {
  identity_context:    62,
  memory:              50,
  agent_orchestration: 58,
  tool_execution:      55,
  workflow_engine:     60,
  knowledge_retrieval: 52,
  policy_engine:       45,
  interface:           48,
  security_trust:      68,
  observability:       35,
  extensibility:       28,
  deployment:          50,
};

// ─── Formatters ────────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

function formatText(result, verbose) {
  const { score, band, cert, domainScores, gaps } = result;
  const lines = [];

  lines.push('');
  lines.push(`${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}`);
  lines.push(`${BOLD}║         ZENITH AI OS — AUDIT REPORT                         ║${RESET}`);
  lines.push(`${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}`);
  lines.push('');
  const col = band.color || '\x1b[36m';
  lines.push(`  ${BOLD}Overall Score:${RESET}    ${col}${BOLD}${score} / 100${RESET}`);
  lines.push(`  ${BOLD}Maturity Band:${RESET}    ${col}${band.label}${RESET}`);
  lines.push(`  ${BOLD}Certification:${RESET}    ${BOLD}${cert.level}${RESET} — ${cert.label}`);
  lines.push(`  ${BOLD}Generated:${RESET}        ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`${DIM}──────────────────────────────────────────────────────────────${RESET}`);
  lines.push(`  ${BOLD}DOMAIN SCORES${RESET}`);
  lines.push('');

  for (const [domain, score] of Object.entries(domainScores)) {
    const weight = DOMAIN_WEIGHTS[domain] * 100;
    const bar = '█'.repeat(Math.round(score / 5)) + '░'.repeat(20 - Math.round(score / 5));
    const color = score >= 70 ? '\x1b[32m' : score >= 50 ? '\x1b[33m' : '\x1b[31m';
    const label = domain.replace(/_/g, ' ').padEnd(22);
    lines.push(`  ${label} ${color}${bar}${RESET} ${color}${String(score).padStart(3)}${RESET} ${DIM}(${weight.toFixed(0)}%)${RESET}`);
  }

  lines.push('');
  lines.push(`${DIM}──────────────────────────────────────────────────────────────${RESET}`);
  lines.push(`  ${BOLD}GAPS IDENTIFIED${RESET} (domains scoring < 40)`);
  lines.push('');

  if (gaps.length === 0) {
    lines.push('  ✅ No critical gaps detected');
  } else {
    for (const gap of gaps) {
      const sev = gap.severity === 'critical' ? '\x1b[31m🚨' : gap.severity === 'major' ? '\x1b[33m⚠️ ' : '\x1b[36mℹ️ ';
      lines.push(`  ${sev} ${RESET}${gap.domain.replace(/_/g, ' ')} — Score: ${gap.score}/100 [${gap.severity.toUpperCase()}]`);
    }
  }

  lines.push('');
  lines.push(`${DIM}──────────────────────────────────────────────────────────────${RESET}`);
  lines.push(`  ${BOLD}CERTIFICATION LADDER${RESET}`);
  lines.push('');

  for (const c of CERT_LEVELS) {
    const achieved = score >= c.threshold;
    const current = cert.level === c.level;
    const icon = current ? '→' : achieved ? '✓' : '○';
    const col = achieved ? '\x1b[32m' : '\x1b[2m';
    lines.push(`  ${col}${icon} ${c.level} (≥${c.threshold}) — ${c.label}${RESET}`);
  }

  lines.push('');
  lines.push(`${DIM}Run with --format md for Markdown output, --format json for structured data${RESET}`);
  lines.push('');

  return lines.join('\n');
}

function formatMarkdown(result) {
  const { score, band, cert, domainScores, gaps } = result;
  const lines = [];

  lines.push('# ZENITH AI OS — AUDIT REPORT');
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **Overall Score** | **${score} / 100** |`);
  lines.push(`| **Maturity Band** | ${band.label} |`);
  lines.push(`| **Certification** | ${cert.level} — ${cert.label} |`);
  lines.push(`| **Generated** | ${new Date().toISOString()} |`);
  lines.push('');
  lines.push('## Domain Scores');
  lines.push('');
  lines.push('| Domain | Score | Weight | Status |');
  lines.push('|--------|-------|--------|--------|');

  for (const [domain, s] of Object.entries(domainScores)) {
    const w = (DOMAIN_WEIGHTS[domain] * 100).toFixed(0) + '%';
    const status = s >= 70 ? '✅ Good' : s >= 50 ? '⚠️ Needs Work' : '❌ Gap';
    lines.push(`| ${domain.replace(/_/g, ' ')} | ${s}/100 | ${w} | ${status} |`);
  }

  lines.push('');
  lines.push('## Gaps Identified');
  lines.push('');

  if (gaps.length === 0) {
    lines.push('No critical gaps detected.');
  } else {
    for (const gap of gaps) {
      lines.push(`- **${gap.domain.replace(/_/g, ' ')}** — ${gap.score}/100 [${gap.severity.toUpperCase()}]`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('*Generated by Zenith AI OS Audit Runner*');
  return lines.join('\n');
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs();

  if (opts.help) {
    console.log(`
ZENITH AI OS — Audit Runner

Usage:
  node scripts/audit/run-audit.js [options]

Options:
  --org-id <uuid>          Organization ID to audit
  --framework <id>         Framework ID (default: framework-aios-standard-v1)
  --output <path>          Save output to file
  --format <json|md|text>  Output format (default: text)
  --scores <csv>           domain:score pairs e.g. "memory:80,policy_engine:45"
  --verbose                Show detailed per-control breakdown
  --help                   Show this help

Examples:
  # Run with default demo scores
  node scripts/audit/run-audit.js

  # Simulate a low-policy scenario
  node scripts/audit/run-audit.js --scores "policy_engine:10,observability:20" --format md

  # Output JSON to file
  node scripts/audit/run-audit.js --format json --output ./audit-results.json
`);
    process.exit(0);
  }

  // Merge provided scores over defaults
  const domainScores = { ...DEFAULT_SCORES, ...opts.scores };
  const score = computeOverallScore(domainScores);
  const band = getMaturityBand(score);
  const cert = getCertLevel(score);
  const gaps = detectGaps(domainScores);

  const result = {
    runId: `audit-cli-${Date.now()}`,
    orgId: opts.orgId ?? 'demo',
    frameworkId: opts.framework,
    score,
    band: { label: band.label },
    cert,
    domainScores,
    gaps,
    generatedAt: new Date().toISOString(),
  };

  let output;
  switch (opts.format) {
    case 'json': output = JSON.stringify(result, null, 2); break;
    case 'md':   output = formatMarkdown(result); break;
    default:     output = formatText(result, opts.verbose); break;
  }

  if (opts.output) {
    const dir = path.dirname(opts.output);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(opts.output, output, 'utf-8');
    console.log(`✅ Audit report saved to ${opts.output}`);
  } else {
    console.log(output);
  }

  // Exit with non-zero if critical gaps
  const criticalCount = gaps.filter(g => g.severity === 'critical').length;
  process.exit(criticalCount > 0 ? 1 : 0);
}

main();
// Run: node scripts/audit/run-audit.js [--format md] [--output path]

import { AuditEngine, AUDIT_CONTROLS } from '../../packages/aios-audit/dist/index.js';

const args = process.argv.slice(2);
const formatIdx = args.indexOf('--format');
const outputIdx = args.indexOf('--output');
const format = formatIdx !== -1 ? args[formatIdx + 1] : 'text';
const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;

// Self-assessment: evaluate which controls this codebase passes
const evaluations = new Map();

const passedControls = new Set([
  // Context
  'CTX-01', 'CTX-02', 'CTX-03', 'CTX-04', 'CTX-05',
  // Memory
  'MEM-01', 'MEM-02', 'MEM-05',
  // Agents
  'AGT-01', 'AGT-02', 'AGT-04',
  // Tools
  'TLS-01', 'TLS-02', 'TLS-03',
  // Workflows
  'WFL-01', 'WFL-02', 'WFL-03', 'WFL-04',
  // Knowledge
  'KNW-01', 'KNW-02', 'KNW-03',
  // Policy
  'POL-01', 'POL-02', 'POL-03', 'POL-04',
  // Security
  'SEC-01', 'SEC-02', 'SEC-04',
  // Observability
  'OBS-01', 'OBS-02', 'OBS-03',
  // Plugins
  'PLG-01', 'PLG-02', 'PLG-03', 'PLG-04',
  // Multi-tenancy
  'TNT-01', 'TNT-02', 'TNT-03',
  // SDK
  'SDK-01', 'SDK-02', 'SDK-03', 'SDK-04',
]);

for (const control of AUDIT_CONTROLS) {
  evaluations.set(control.id, {
    passed: passedControls.has(control.id),
    notes: passedControls.has(control.id) ? 'Implemented in codebase' : 'Not yet implemented',
  });
}

const engine = new AuditEngine();
const report = engine.evaluate(evaluations);

if (format === 'md') {
  const lines = [
    '# Zenith AI OS — Audit Report',
    '',
    `**Date:** ${report.timestamp.toISOString()}`,
    `**Overall Score:** ${report.overallScore} / 100`,
    `**Maturity Band:** ${report.maturityBand}`,
    `**Certification:** ${report.certification}`,
    '',
    '## Domain Scores',
    '',
    '| Domain | Score | Max | % |',
    '|--------|-------|-----|---|',
    ...report.domains.map(d => `| ${d.domain} | ${d.score.toFixed(1)} | ${d.maxScore.toFixed(1)} | ${d.percentage.toFixed(1)}% |`),
    '',
    '## Gaps',
    '',
    ...report.gaps.map(g => `- ${g}`),
    '',
    '## Next Steps',
    '',
    ...report.nextSteps.map(s => `- ${s}`),
  ];
  const output = lines.join('\n');
  if (outputPath) {
    const { writeFileSync, mkdirSync } = await import('fs');
    const { dirname } = await import('path');
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, output, 'utf8');
    console.log(`Audit report written to ${outputPath}`);
  } else {
    console.log(output);
  }
} else {
  console.log(engine.formatReport(report));
}
