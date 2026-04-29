#!/usr/bin/env node
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
