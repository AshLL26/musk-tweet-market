import { NextResponse } from 'next/server';
import { analyzeMarket } from '@/lib/analysis';
import { defaultModelConfig } from '@/lib/config';
import { buildMarketInput } from '@/lib/fetcher';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const marketDate = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const now = searchParams.get('now') ?? undefined;
  const dayType = searchParams.get('dayType') ?? undefined;
  const eventMode = searchParams.get('eventMode') ?? undefined;

  const input = await buildMarketInput({ marketDate, now, dayType, eventMode });
  const result = analyzeMarket(input, defaultModelConfig);

  return NextResponse.json(result);
}
