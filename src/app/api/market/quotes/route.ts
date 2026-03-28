import { NextResponse } from 'next/server';
import { getElonUser, findActiveTracking } from '@/lib/fetcher';
import { fetchPolymarketQuotes } from '@/lib/polymarket';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const marketDate = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  try {
    const user = await getElonUser();
    const tracking = findActiveTracking(user.trackings, marketDate);

    if (!tracking) {
      return NextResponse.json(
        { success: false, error: 'No active tracking found for date' },
        { status: 404 }
      );
    }

    const quotes = await fetchPolymarketQuotes(tracking.marketLink);

    return NextResponse.json({
      success: true,
      marketLink: tracking.marketLink,
      count: quotes.length,
      quotes,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
