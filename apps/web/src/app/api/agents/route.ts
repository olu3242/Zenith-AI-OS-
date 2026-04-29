import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAIOS } from '@/lib/aios';

const RunSchema = z.object({
  agentId: z.string(),
  sessionId: z.string(),
  userId: z.string(),
  input: z.record(z.unknown()),
});

export async function POST(req: NextRequest) {
  try {
    const body = RunSchema.parse(await req.json());
    const aios = await getAIOS();
    const result = await aios.agents.run({
      ...body,
      organizationId: process.env['ZENITH_ORG_ID'] ?? 'default',
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function GET() {
  const aios = await getAIOS();
  return NextResponse.json({ agents: aios.agents.registry.list() });
}
