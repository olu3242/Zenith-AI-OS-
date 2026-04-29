/**
 * CRM AI OS Example — Lead Qualification + Email Drafting
 * Run: node examples/crm-aios/index.js
 */
import { createAIOS } from '../../packages/aios-sdk/dist/index.js';

async function main() {
  console.log('🚀 Starting CRM AI OS example...\n');

  const aios = await createAIOS({
    organizationId: 'crm-demo-org',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Register tools
  aios.tools.bus.register(
    { id: 'get_lead_score', name: 'get_lead_score', description: 'Score a lead 0-100', riskLevel: 'low', requiresApproval: false, permissions: [], inputSchema: { type: 'object', properties: { leadId: { type: 'string' } }, required: ['leadId'] }, version: '1.0.0', category: 'crm', metadata: {} },
    async ({ leadId }) => ({ leadId, score: Math.floor(Math.random() * 100), tier: 'hot' }),
  );

  aios.tools.bus.register(
    { id: 'send_email', name: 'send_email', description: 'Send an email', riskLevel: 'medium', requiresApproval: false, permissions: ['email:send'], inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'subject', 'body'] }, version: '1.0.0', category: 'communication', metadata: {} },
    async ({ to, subject }) => { console.log(`  📧 Email sent to ${to}: "${subject}"`); return { sent: true }; },
  );

  // Register lead qualifier agent
  aios.agents.registry.register({
    id: 'lead-qualifier',
    name: 'Lead Qualifier',
    description: 'Qualifies inbound leads and drafts follow-up emails',
    version: '1.0.0',
    model: 'claude-sonnet-4-6',
    systemPrompt: 'You are a CRM assistant. Qualify leads using the get_lead_score tool, then send a personalized follow-up email using send_email.',
    tools: ['get_lead_score', 'send_email'],
    maxIterations: 10,
    metadata: {},
  });

  // Store lead context in memory
  await aios.memory.service.remember({
    organizationId: 'crm-demo-org',
    type: 'long_term',
    content: 'Acme Corp is a Fortune 500 manufacturing company interested in AI automation.',
    entityName: 'Acme Corp',
    tags: ['lead', 'enterprise'],
  });

  // Retrieve relevant memories
  const memories = await aios.memory.search({ query: 'Acme Corp deal history', organizationId: 'crm-demo-org', limit: 3 });
  console.log(`📚 Found ${memories.length} relevant memories`);

  // Evaluate policy
  const decision = await aios.policy.evaluate('tool.invoke', {
    action: 'tool.invoke', userId: 'sales-rep-1', orgId: 'crm-demo-org', riskLevel: 'medium', metadata: {},
  });
  console.log(`🔐 Policy decision: ${decision.allowed ? 'ALLOWED' : 'DENIED'} — ${decision.reason}`);

  // Run audit
  const report = aios.audit.run();
  console.log(`\n📊 AI OS Score: ${report.overallScore}/100 — ${report.certification} (${report.maturityBand})`);
  console.log(`   Top gap: ${report.gaps[0] ?? 'None'}\n`);

  // Security check
  const secResult = await aios.security.process(
    'Qualify lead John Smith at john@acme.com, phone 555-123-4567',
    { organizationId: 'crm-demo-org', userId: 'sales-rep-1', action: 'lead.qualify' },
  );
  console.log(`🛡️  Security: ${secResult.allowed ? 'ALLOWED' : 'BLOCKED'} (risk: ${secResult.auditEntry.riskScore.toFixed(2)})`);
  if (secResult.processed !== 'Qualify lead John Smith at john@acme.com, phone 555-123-4567') {
    console.log(`   PII redacted in processed input`);
  }

  console.log('\n✅ CRM AI OS example complete.');
}

main().catch(console.error);
