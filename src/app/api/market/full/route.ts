import { NextResponse } from 'next/server';
import tweets from '@/mocks/tweets.mock.json';
import quotes from '@/mocks/quotes.mock.json';
import marketInputBase from '@/mocks/market-input.mock.json';
import { analyzeMarket } from '@/lib/analysis';
import { defaultModelConfig } from '@/lib/config';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const now = searchParams.get('now') ?? marketInputBase.now;
  const dayType = (searchParams.get('dayType') as typeof marketInputBase.dayType | null) ?? marketInputBase.dayType;
  const eventMode = (searchParams.get('eventMode') as typeof marketInputBase.eventMode | null) ?? marketInputBase.eventMode;

  const input = {
    ...marketInputBase,
    now,
    dayType,
    eventMode,
    tweets,
    quotes,
  };

  const result = analyzeMarket(input, defaultModelConfig);
  return NextResponse.json(result);
}
