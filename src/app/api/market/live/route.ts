/**
 * /api/market/live
 * Full live analysis: XTracker tweet count + Polymarket quotes + pricing engine.
 * This is the "Bloomberg terminal" endpoint — one call, full picture.
 */
import { NextResponse } from 'next/server';
import { analyzeMarket } from '@/lib/analysis';
import { defaultModelConfig } from '@/lib/config';
import { getElonUser, findActiveTracking, getTrackingStats, synthesizeTweetRecordsPublic } from '@/lib/fetcher';
import { fetchPolymarketQuotes } from '@/lib/polymarket';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const marketDate = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const now = searchParams.get('now') ?? new Date().toISOString();
  const dayType = (searchParams.get('dayType') ?? 'normal') as 'normal' | 'light_event' | 'heavy_event';
  const eventMode = (searchParams.get('eventMode') ?? 'none') as 'none' | 'tesla' | 'spacex' | 'politics' | 'xai' | 'other';

  try {
    const user = await getElonUser();
    const tracking = findActiveTracking(user.trackings, marketDate);

    if (!tracking) {
      return NextResponse.json(
        { success: false, error: `No active Polymarket tracking found for ${marketDate}` },
        { status: 404 }
      );
    }

    // Fetch both in parallel
    const [stats, quotes] = await Promise.all([
      getTrackingStats(tracking.id),
      fetchPolymarketQuotes(tracking.marketLink),
    ]);

    const tweetCount = stats.stats.total ?? 0;
    const tweets = synthesizeTweetRecordsPublic(tweetCount, marketDate, user.platformId);

    // Build bucket configs from Polymarket market structure
    const bucketConfigs = quotes.map((q, idx) => {
      const label = (q as Record<string, unknown>).label as string ?? q.bucketId;
      const range = parseRangeFromLabel(label);
      return {
        bucketId: q.bucketId,
        label,
        lowerBound: range.lower,
        upperBound: range.upper,
      };
    });

    const input = {
      marketDate,
      now,
      timezone: 'UTC',
      dayType,
      eventMode,
      tweets,
      quotes,
      bucketConfigs: bucketConfigs.length > 0 ? bucketConfigs : defaultBucketConfigs(),
    };

    const analysis = analyzeMarket(input, defaultModelConfig);

    return NextResponse.json({
      success: true,
      tracking: {
        id: tracking.id,
        title: tracking.title,
        startDate: tracking.startDate,
        endDate: tracking.endDate,
        marketLink: tracking.marketLink,
        stats: stats.stats,
      },
      ...analysis,
    });
  } catch (err) {
    console.error('[live]', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

function parseRangeFromLabel(label: string): { lower: number; upper: number | null } {
  // Formats: "60-79", "100+", "100-plus", "0-19"
  const plusMatch = label.match(/^(\d+)\+$/) ?? label.match(/^(\d+)-plus$/i);
  if (plusMatch) return { lower: parseInt(plusMatch[1]), upper: null };

  const rangeMatch = label.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) return { lower: parseInt(rangeMatch[1]), upper: parseInt(rangeMatch[2]) };

  return { lower: 0, upper: null };
}

function defaultBucketConfigs() {
  return [
    { bucketId: 'b1', label: '0-19', lowerBound: 0, upperBound: 19 },
    { bucketId: 'b2', label: '20-39', lowerBound: 20, upperBound: 39 },
    { bucketId: 'b3', label: '40-59', lowerBound: 40, upperBound: 59 },
    { bucketId: 'b4', label: '60-79', lowerBound: 60, upperBound: 79 },
    { bucketId: 'b5', label: '80-99', lowerBound: 80, upperBound: 99 },
    { bucketId: 'b6', label: '100+', lowerBound: 100, upperBound: null },
  ];
}
