import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAIOS } from '@/lib/aios';

const SearchSchema = z.object({ query: z.string(), sessionId: z.string().optional(), limit: z.number().optional() });
const RememberSchema = z.object({ sessionId: z.string(), userId: z.string(), type: z.string(), content: z.string(), tags: z.array(z.string()).optional() });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query') ?? '';
    const aios = await getAIOS();
    const results = await aios.memory.search({
      query,
      organizationId: process.env['ZENITH_ORG_ID'] ?? 'default',
      limit: Number(searchParams.get('limit') ?? 10),
    });
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = RememberSchema.parse(await req.json());
    const aios = await getAIOS();
    const entry = await aios.memory.service.remember({
      organizationId: process.env['ZENITH_ORG_ID'] ?? 'default',
      type: body.type as never,
      content: body.content,
      sessionId: body.sessionId,
      userId: body.userId,
      tags: body.tags,
    });
    return NextResponse.json(entry);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
