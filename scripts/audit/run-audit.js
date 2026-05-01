#!/usr/bin/env node
/**
 * ZENITH AI OS — Audit Runner CLI  (AIOS-STANDARD-v1.1)
 *
 * Usage:
 *   node scripts/audit/run-audit.js [options]
 *
 * Options:
 *   --region <EU|US|UK|SG|CA|GLOBAL>  Regional compliance overlay (default: GLOBAL)
 *   --scores <csv>                     domain:score pairs e.g. "ai-governance:65,security:72"
 *   --target <number>                  Target score for gap analysis (default: 70)
 *   --format <text|md|json>            Output format (default: text)
 *   --output <path>                    Save output to file instead of stdout
 *   --org-id <string>                  Organisation identifier (default: demo)
 *   --verbose                          Show per-domain contribution breakdown
 *   --help                             Show this help
 *
 * Examples:
 *   node scripts/audit/run-audit.js
 *   node scripts/audit/run-audit.js --region EU --format md
 *   node scripts/audit/run-audit.js --scores "ai-governance:75,security:80" --region US
 *   node scripts/audit/run-audit.js --format json --output docs/audit/latest.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    region:  'GLOBAL',
    scores:  {},
    target:  70,
    format:  'text',
    output:  null,
    orgId:   'demo',
    verbose: false,
    help:    false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--region':  opts.region  = args[++i].toUpperCase(); break;
      case '--format':  opts.format  = args[++i]; break;
      case '--output':  opts.output  = args[++i]; break;
      case '--org-id':  opts.orgId   = args[++i]; break;
      case '--target':  opts.target  = parseFloat(args[++i]); break;
      case '--verbose': opts.verbose = true; break;
      case '--help':    opts.help    = true; break;
      case '--scores': {
        const pairs = args[++i].split(',');
        for (const pair of pairs) {
          const [domain, score] = pair.split(':');
          if (domain && score) opts.scores[domain.trim()] = parseFloat(score.trim());
        }
        break;
      }
    }
  }
  return opts;
}

// ─── Scoring Model (mirrors governanceScore.ts) ───────────────────────────────

const BASE_WEIGHTS = {
  'ai-governance':    0.12,   // Domain 13 — highest single weight
  'transparency':     0.09,
  'fairness':         0.09,
  'accountability':   0.09,
  'privacy':          0.09,
  'security':         0.09,
  'reliability':      0.08,
  'human-oversight':  0.08,
  'data-governance':  0.08,
  'model-governance': 0.08,
  'deployment':       0.07,
  'incident-response':0.07,
  'documentation':    0.07,
};

// Regional multipliers (mirrors regions/*.ts complianceMultiplier)
const REGIONAL_OVERLAYS = {
  EU:     { multiplier: 0.95, law: 'EU AI Act (Regulation 2024/1689)',         gates: ['transparency','human-oversight','accountability','ai-governance','security'] },
  US:     { multiplier: 1.00, law: 'NIST AI RMF 1.0 + EO 14110 (2023)',        gates: ['security','accountability','transparency'] },
  UK:     { multiplier: 0.97, law: 'UK AI Framework + Data Protection Act 2018',gates: ['safety','transparency','fairness','accountability','human-oversight'] },
  SG:     { multiplier: 0.98, law: 'MAS FEAT + Model AI Governance Framework', gates: ['fairness','ethics','accountability','transparency'] },
  CA:     { multiplier: 0.97, law: 'AIDA (Bill C-27) + Directive on Automated Decision-Making', gates: ['transparency','accountability','human-oversight','privacy'] },
  GLOBAL: { multiplier: 0.90, law: 'ISO/IEC 42001:2023 (AI Management System)', gates: ['ai-governance','accountability','transparency','risk-management'] },
};

const GRADE_THRESHOLDS = [
  { min: 90, grade: 'A+', label: 'Exceptional' },
  { min: 80, grade: 'A',  label: 'Strong' },
  { min: 70, grade: 'B+', label: 'Proficient' },
  { min: 55, grade: 'B',  label: 'Developing' },
  { min: 38, grade: 'C',  label: 'Basic' },
  { min: 25, grade: 'D',  label: 'Minimal' },
  { min: 0,  grade: 'F',  label: 'Non-compliant' },
];

const CERT_LEVELS = [
  { level: 'AIOS-L5', min: 90, govGate: 80, label: 'Open Standard Reference' },
  { level: 'AIOS-L4', min: 70, govGate: 60, label: 'Enterprise AI OS' },
  { level: 'AIOS-L3', min: 55, govGate: 40, label: 'Operational AI OS' },
  { level: 'AIOS-L2', min: 38, govGate: 0,  label: 'Workflow AI Platform' },
  { level: 'AIOS-L1', min: 25, govGate: 0,  label: 'AI-Enabled Application' },
];

const MATURITY_BANDS = [
  { min: 90, label: 'Open Standard Candidate',  color: '\x1b[95m' },
  { min: 80, label: 'Standard-Ready AI OS',      color: '\x1b[92m' },
  { min: 65, label: 'Advanced AI OS',            color: '\x1b[32m' },
  { min: 45, label: 'Functional AI OS',          color: '\x1b[36m' },
  { min: 25, label: 'Emerging AI Platform',      color: '\x1b[33m' },
  { min: 0,  label: 'AI-Enabled Application',    color: '\x1b[31m' },
];

function score(domainScores, region) {
  const overlay = REGIONAL_OVERLAYS[region] || REGIONAL_OVERLAYS.GLOBAL;
  let weightedSum = 0;
  let totalWeight = 0;
  const breakdown = {};

  for (const [domain, weight] of Object.entries(BASE_WEIGHTS)) {
    const s = domainScores[domain] ?? 50;
    const contribution = s * weight;
    weightedSum += contribution;
    totalWeight += weight;
    breakdown[domain] = { score: s, weight, contribution: Math.round(contribution * 100) / 100 };
  }

  const weighted  = Math.round((weightedSum / totalWeight) * 10) / 10;
  const regional  = Math.round(weighted * overlay.multiplier * 10) / 10;
  const raw       = Math.round(Object.values(domainScores).reduce((a, b) => a + b, 0) / Math.max(Object.values(domainScores).length, 1) * 10) / 10;
  const grade     = GRADE_THRESHOLDS.find(t => regional >= t.min) || GRADE_THRESHOLDS[GRADE_THRESHOLDS.length - 1];
  const band      = MATURITY_BANDS.find(b => regional >= b.min) || MATURITY_BANDS[MATURITY_BANDS.length - 1];
  const govScore  = domainScores['ai-governance'] ?? 50;

  const certEligible = CERT_LEVELS.filter(c => regional >= c.min && govScore >= c.govGate).map(c => c.level);
  const topCert = certEligible[0] || 'UNCERTIFIED';

  const gateStatus = {};
  for (const gate of overlay.gates) {
    gateStatus[gate] = (domainScores[gate] ?? 50) >= 40;
  }

  return { raw, weighted, regional, grade, band, govScore, certEligible, topCert, breakdown, overlay, gateStatus };
}

function gaps(domainScores, targetScore) {
  const BOOSTS = { 'ai-governance': 20, 'security': 10, 'human-oversight': 10 };
  return Object.entries(domainScores)
    .filter(([, s]) => s < targetScore)
    .map(([domain, s]) => {
      const gapSize = targetScore - s;
      const boosted = gapSize + (BOOSTS[domain] || 0);
      const priority = boosted >= 70 ? 'critical' : boosted >= 50 ? 'high' : boosted >= 30 ? 'medium' : 'low';
      return { domain, score: s, gap: gapSize, priority };
    })
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.priority] - order[b.priority] || b.gap - a.gap;
    });
}

// ─── Default Scores (demo — representative "mid-tier" AI product) ──────────

const DEFAULT_SCORES = {
  'ai-governance':    22,   // typical: no governance policy, no ethics board
  'transparency':     58,
  'fairness':         48,
  'accountability':   55,
  'privacy':          62,
  'security':         68,
  'reliability':      60,
  'human-oversight':  45,
  'data-governance':  52,
  'model-governance': 38,
  'deployment':       50,
  'incident-response':35,
  'documentation':    44,
};

// ─── Formatters ───────────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const DIM   = '\x1b[2m';
const BOLD  = '\x1b[1m';
const GREEN = '\x1b[32m';
const AMBER = '\x1b[33m';
const RED   = '\x1b[31m';

function domainColor(s) { return s >= 70 ? GREEN : s >= 50 ? AMBER : RED; }
function priorityColor(p) { return p === 'critical' ? RED : p === 'high' ? AMBER : p === 'medium' ? '\x1b[36m' : DIM; }

function formatText(result, gapList, opts) {
  const { regional, weighted, grade, band, govScore, certEligible, topCert, breakdown, overlay, gateStatus } = result;
  const lines = [];

  lines.push('');
  lines.push(`${BOLD}╔════════════════════════════════════════════════════════════════╗${RESET}`);
  lines.push(`${BOLD}║       ZENITH AI OS — AUDIT REPORT  (AIOS-STANDARD v1.1)       ║${RESET}`);
  lines.push(`${BOLD}╚════════════════════════════════════════════════════════════════╝${RESET}`);
  lines.push('');
  const col = band.color;
  lines.push(`  ${BOLD}Regional Score:${RESET}   ${col}${BOLD}${regional} / 100${RESET}   ${DIM}(weighted ${weighted}, ×${overlay.multiplier} ${opts.region})${RESET}`);
  lines.push(`  ${BOLD}Grade:${RESET}            ${col}${grade.grade} — ${grade.label}${RESET}`);
  lines.push(`  ${BOLD}Maturity Band:${RESET}    ${col}${band.label}${RESET}`);
  lines.push(`  ${BOLD}Certification:${RESET}    ${BOLD}${topCert}${RESET}  ${DIM}eligible: [${certEligible.join(', ') || 'none'}]${RESET}`);
  lines.push(`  ${BOLD}AI Governance:${RESET}    ${domainColor(govScore)}${govScore}/100${RESET}  ${govScore >= 40 ? `${GREEN}✓ gate met${RESET}` : `${RED}✗ gate not met (need 40+)${RESET}`}`);
  lines.push(`  ${BOLD}Region Law:${RESET}       ${DIM}${overlay.law}${RESET}`);
  lines.push(`  ${BOLD}Generated:${RESET}        ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`${DIM}────────────────────────────────────────────────────────────────${RESET}`);
  lines.push(`  ${BOLD}DOMAIN SCORES${RESET}${opts.verbose ? '  (score / weight / contribution)' : ''}`);
  lines.push('');

  for (const [domain, data] of Object.entries(breakdown)) {
    const { score: s, weight, contribution } = data;
    const bar   = '█'.repeat(Math.round(s / 5)) + '░'.repeat(20 - Math.round(s / 5));
    const label = domain.padEnd(20);
    const wPct  = `${(weight * 100).toFixed(0)}%`.padStart(4);
    const extra = opts.verbose ? `  ${DIM}contrib: ${contribution.toFixed(1)}${RESET}` : '';
    lines.push(`  ${label} ${domainColor(s)}${bar}${RESET} ${domainColor(s)}${String(s).padStart(3)}${RESET} ${DIM}${wPct}${RESET}${extra}`);
  }

  lines.push('');
  lines.push(`${DIM}────────────────────────────────────────────────────────────────${RESET}`);
  lines.push(`  ${BOLD}MANDATORY GATES (${opts.region})${RESET}`);
  lines.push('');
  for (const [gate, met] of Object.entries(gateStatus)) {
    lines.push(`  ${met ? `${GREEN}✓` : `${RED}✗`}${RESET} ${gate}`);
  }

  lines.push('');
  lines.push(`${DIM}────────────────────────────────────────────────────────────────${RESET}`);
  lines.push(`  ${BOLD}GAPS  (target: ${opts.target}+)${RESET}`);
  lines.push('');

  if (gapList.length === 0) {
    lines.push(`  ${GREEN}✓ All domains meet target score${RESET}`);
  } else {
    for (const g of gapList) {
      const pc = priorityColor(g.priority);
      lines.push(`  ${pc}[${g.priority.toUpperCase().padEnd(8)}]${RESET} ${g.domain.padEnd(20)} ${domainColor(g.score)}${g.score}/100${RESET}  ${DIM}gap: ${g.gap}${RESET}`);
    }
  }

  lines.push('');
  lines.push(`${DIM}────────────────────────────────────────────────────────────────${RESET}`);
  lines.push(`  ${BOLD}CERTIFICATION LADDER${RESET}`);
  lines.push('');
  for (const c of CERT_LEVELS) {
    const achieved = regional >= c.min && govScore >= c.govGate;
    const current  = topCert === c.level;
    const icon     = current ? '→' : achieved ? '✓' : '○';
    const col2     = achieved ? GREEN : DIM;
    const gate     = c.govGate > 0 ? `  ${DIM}[Domain 13 ≥ ${c.govGate}]${RESET}` : '';
    lines.push(`  ${col2}${icon} ${c.level} (≥${c.min}) — ${c.label}${gate}${RESET}`);
  }

  lines.push('');
  lines.push(`${DIM}Run with --format md or --format json for other output formats${RESET}`);
  lines.push('');
  return lines.join('\n');
}

function formatMarkdown(result, gapList, opts) {
  const { regional, weighted, grade, band, govScore, certEligible, topCert, breakdown, overlay, gateStatus } = result;
  const lines = [];

  lines.push('# ZENITH AI OS — Audit Report');
  lines.push('');
  lines.push(`> **AIOS-STANDARD v1.1** · Region: **${opts.region}** · ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Regional Score | **${regional} / 100** |`);
  lines.push(`| Weighted Score | ${weighted} / 100 |`);
  lines.push(`| Grade | **${grade.grade}** — ${grade.label} |`);
  lines.push(`| Maturity Band | ${band.label} |`);
  lines.push(`| Certification | **${topCert}** (eligible: ${certEligible.join(', ') || 'none'}) |`);
  lines.push(`| AI Governance (Domain 13) | ${govScore}/100 ${govScore >= 40 ? '✓' : '✗ (need 40+)'} |`);
  lines.push(`| Compliance Multiplier | ×${overlay.multiplier} |`);
  lines.push(`| Primary Law | ${overlay.law} |`);
  lines.push(`| Org | ${opts.orgId} |`);
  lines.push('');
  lines.push('## Domain Scores');
  lines.push('');
  lines.push('| Domain | Score | Weight | Status |');
  lines.push('|--------|-------|--------|--------|');
  for (const [domain, data] of Object.entries(breakdown)) {
    const { score: s, weight } = data;
    const status = s >= 70 ? '✅ Good' : s >= 50 ? '⚠️ Needs Work' : '❌ Gap';
    lines.push(`| ${domain} | ${s}/100 | ${(weight * 100).toFixed(0)}% | ${status} |`);
  }

  lines.push('');
  lines.push(`## Mandatory Gates (${opts.region})`);
  lines.push('');
  lines.push('| Gate | Status |');
  lines.push('|------|--------|');
  for (const [gate, met] of Object.entries(gateStatus)) {
    lines.push(`| ${gate} | ${met ? '✅ Met' : '❌ Not Met'} |`);
  }

  lines.push('');
  lines.push(`## Gaps  (target: ${opts.target}+)`);
  lines.push('');
  if (gapList.length === 0) {
    lines.push('All domains meet the target score.');
  } else {
    lines.push('| Domain | Score | Gap | Priority |');
    lines.push('|--------|-------|-----|----------|');
    for (const g of gapList) {
      lines.push(`| ${g.domain} | ${g.score}/100 | ${g.gap} | ${g.priority.toUpperCase()} |`);
    }
  }

  lines.push('');
  lines.push('## Certification Ladder');
  lines.push('');
  lines.push('| Level | Min Score | Gov Gate | Label | Status |');
  lines.push('|-------|-----------|----------|-------|--------|');
  for (const c of CERT_LEVELS) {
    const achieved = regional >= c.min && govScore >= c.govGate;
    const current  = topCert === c.level;
    const flag     = current ? '**→ Current**' : achieved ? '✓' : '—';
    const gateStr  = c.govGate > 0 ? `Domain 13 ≥ ${c.govGate}` : '—';
    lines.push(`| ${c.level} | ${c.min} | ${gateStr} | ${c.label} | ${flag} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('*Generated by Zenith AI OS Audit Runner · AIOS-STANDARD-v1.1*');
  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs();

  if (opts.help) {
    console.log(`
ZENITH AI OS — Audit Runner  (AIOS-STANDARD v1.1)

Usage:
  node scripts/audit/run-audit.js [options]

Options:
  --region <EU|US|UK|SG|CA|GLOBAL>  Regional compliance overlay (default: GLOBAL)
  --scores <csv>                     domain:score pairs
  --target <number>                  Gap threshold (default: 70)
  --format <text|md|json>            Output format (default: text)
  --output <path>                    Save to file
  --org-id <string>                  Organisation ID
  --verbose                          Show per-domain contributions
  --help                             Show this help

Domains: ai-governance (12%), transparency, fairness, accountability, privacy,
         security (9% each), reliability, human-oversight, data-governance,
         model-governance (8% each), deployment, incident-response, documentation (7% each)

Regional multipliers: US=1.0  SG=0.98  UK=0.97  CA=0.97  EU=0.95  GLOBAL=0.90

Examples:
  node scripts/audit/run-audit.js
  node scripts/audit/run-audit.js --region EU --format md
  node scripts/audit/run-audit.js --scores "ai-governance:75,security:80" --region US --format json
`);
    process.exit(0);
  }

  if (!REGIONAL_OVERLAYS[opts.region]) {
    console.error(`Unknown region: ${opts.region}. Use EU, US, UK, SG, CA, or GLOBAL.`);
    process.exit(1);
  }

  const domainScores = { ...DEFAULT_SCORES, ...opts.scores };
  const result  = score(domainScores, opts.region);
  const gapList = gaps(domainScores, opts.target);

  let output;
  switch (opts.format) {
    case 'json': output = JSON.stringify({ ...result, gaps: gapList, orgId: opts.orgId, generatedAt: new Date().toISOString() }, null, 2); break;
    case 'md':   output = formatMarkdown(result, gapList, opts); break;
    default:     output = formatText(result, gapList, opts); break;
  }

  if (opts.output) {
    const dir = path.dirname(path.resolve(opts.output));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(opts.output, output, 'utf-8');
    console.log(`✅  Audit report saved to ${opts.output}`);
  } else {
    process.stdout.write(output + '\n');
  }

  const criticalGaps = gapList.filter(g => g.priority === 'critical').length;
  process.exit(criticalGaps > 0 ? 1 : 0);
}

main();
