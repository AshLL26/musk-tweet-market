import { NextResponse } from 'next/server';
import { getElonUser, findActiveTracking, getTrackingStats } from '@/lib/fetcher';

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

    const stats = await getTrackingStats(tracking.id);

    return NextResponse.json({
      success: true,
      data: {
        trackingId: tracking.id,
        title: tracking.title,
        startDate: tracking.startDate,
        endDate: tracking.endDate,
        marketLink: tracking.marketLink,
        stats: stats.stats,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
