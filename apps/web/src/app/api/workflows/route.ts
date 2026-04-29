import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAIOS } from '@/lib/aios';

const TriggerSchema = z.object({
  workflowId: z.string(),
  userId: z.string(),
  sessionId: z.string().optional(),
  input: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = TriggerSchema.parse(await req.json());
    const aios = await getAIOS();
    const run = await aios.workflows.trigger({
      ...body,
      organizationId: process.env['ZENITH_ORG_ID'] ?? 'default',
    });
    return NextResponse.json(run);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
