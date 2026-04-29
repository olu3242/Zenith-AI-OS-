import { NextResponse } from 'next/server';
import { getAIOS } from '@/lib/aios';

export async function GET() {
  const aios = await getAIOS();
  const report = aios.audit.run();
  return NextResponse.json(report);
}
