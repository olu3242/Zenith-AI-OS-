import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// ── Rate limiting (in-memory, per IP) ─────────────────────────────────────
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 20;
const ipCounters = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipCounters.get(ip);
  if (!entry || now > entry.resetAt) {
    ipCounters.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX_REQUESTS) return false;
  entry.count++;
  return true;
}

// ── Input validation ───────────────────────────────────────────────────────
const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
});

const RequestSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(20),
  region: z.enum(['EU', 'US', 'UK', 'SG', 'CA', 'GLOBAL']).default('EU'),
});

// ── Server-side guardrails ─────────────────────────────────────────────────
const TOPICS = [
  'aios', 'audit', 'control', 'domain', 'score', 'governance', 'compliance',
  'eu ai act', 'nist', 'iso 42001', 'certification', 'certif', 'l1', 'l2',
  'l3', 'l4', 'l5', 'policy', 'bias', 'fairness', 'oversight', 'security',
  'gap', 'remediat', 'framework', 'responsible ai', 'explainab', 'ethics',
  'liz', 'maturity', 'multiplier', 'weight', 'domain 1', 'domain 13',
  'human oversight', 'bias testing', 'governance policy', 'mas feat', 'aida',
  'what is', 'how does', 'how do', 'what does', 'what are', 'help me', 'explain',
];

const LEGAL_TRIGGERS = [
  'you must comply', 'you are legally required', 'you will be fined',
  'legally obligated', 'you are required by law',
];

function isOffTopic(msg: string): boolean {
  const lower = msg.toLowerCase();
  return !TOPICS.some(t => lower.includes(t));
}

function needsLegalDisclaimer(text: string): boolean {
  const lower = text.toLowerCase();
  return LEGAL_TRIGGERS.some(t => lower.includes(t));
}

function buildSystemPrompt(region: string): string {
  return `You are Liz — the Zenith AI OS governance advisor, an AI assistant for the AIOS-STANDARD-v1.1 framework.

PERSONA: Friendly, knowledgeable, precise. You give direct answers. You acknowledge uncertainty honestly. You never over-apologise.

SCOPE — Answer ONLY questions about:
- AIOS-STANDARD-v1.1 framework: 13 domains, 65 controls, scoring model, certification ladder
- AI governance, responsible AI, Domain 13 controls (13.1–13.5)
- Regional compliance: EU AI Act (Reg 2024/1689), NIST AI RMF + EO 14110, UK AI Framework, Singapore MAS FEAT / MAIGF v2, Canada AIDA (Bill C-27), ISO/IEC 42001:2023
- Audit gap analysis, gap prioritisation, remediation guidance, certification path
- AI product maturity, production AI architecture, AI OS design

GUARDRAILS — You MUST:
- Refuse off-topic questions politely and redirect to AIOS scope
- Never provide specific legal advice. When legal-adjacent: answer the framework question, then add "⚠️ This is not legal advice — consult qualified legal counsel for your specific regulatory obligations."
- Never recommend specific commercial vendors or products by name
- Never fabricate scores, control results, or audit outcomes
- When a question requires review of their actual product/code, acknowledge it and suggest the free audit

ESCALATION — Say "I'd recommend connecting with our specialist team for this" when:
- User asks about their specific legal obligations for their product
- User wants their actual implementation reviewed
- Question involves pricing, contracts, or enterprise engagements

CURRENT REGION: ${region}

FRAMEWORK KNOWLEDGE:
13 domains, 65 controls. Domain 13 (AI Governance) = 12% weight (highest).
Domain 13 controls: 13.1 Governance Policy, 13.2 Bias Testing, 13.3 Human Oversight, 13.4 Explainability, 13.5 Ethics Review.
Certification: L1(≥25), L2(≥38), L3(≥55, D13≥40), L4(≥70, D13≥60), L5(≥90, D13≥80).
Regional multipliers: EU×0.95, UK×0.97, CA×0.97, SG×0.98, US×1.0, GLOBAL(ISO)×0.90.
Mandatory gates per region vary — EU requires transparency, human-oversight, accountability, ai-governance, security.

FORMAT: Clear, structured. Bullet points for lists. Under 280 words unless more is genuinely needed. Never start with "Great question!"`;
}

// ── Singleton Anthropic client ─────────────────────────────────────────────
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
  return _client;
}

// ── Route handler ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before sending more messages.' },
      { status: 429 }
    );
  }

  // Validate request body
  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { messages, region } = body;

  // Server-side off-topic guard on the last user message
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (lastUserMsg && isOffTopic(lastUserMsg.content)) {
    return NextResponse.json({
      reply: "I'm scoped to AIOS framework questions — AI governance, scoring, controls, regional compliance, and certification. Could you rephrase within that scope?",
    });
  }

  // No API key → graceful fallback
  if (!process.env['ANTHROPIC_API_KEY']) {
    return NextResponse.json({
      reply: "Liz's AI backend isn't configured yet (missing ANTHROPIC_API_KEY). Ask about AIOS-STANDARD domains, the certification ladder, or regional compliance and I'll answer from my knowledge base.",
    });
  }

  try {
    const client = getClient();

    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 512,
      system: buildSystemPrompt(region),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      thinking: { type: 'adaptive' },
      cache_control: { type: 'ephemeral' },
    });

    const textBlock = response.content.find(b => b.type === 'text');
    let reply = textBlock?.type === 'text' ? textBlock.text : "I couldn't generate a response. Please try again.";

    // Legal disclaimer injection
    if (needsLegalDisclaimer(reply)) {
      reply += '\n\n⚠️ *This is not legal advice — consult qualified legal counsel for your specific regulatory obligations.*';
    }

    return NextResponse.json({ reply });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: 'The AI service is busy. Please try again in a moment.' },
        { status: 429 }
      );
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: 'AI service authentication failed. Contact support.' },
        { status: 503 }
      );
    }
    console.error('[liz-api]', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
