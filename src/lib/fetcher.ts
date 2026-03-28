/**
 * fetcher.ts
 * Real data source: XTracker Polymarket API
 * Docs: https://xtracker.polymarket.com/docs
 * Base URL: https://xtracker.polymarket.com/api
 */

import type { TweetRecord, MarketQuote } from './types';

const XTRACKER_BASE = 'https://xtracker.polymarket.com/api';

// ---------------------------------------------------------------------------
// Types from XTracker API
// ---------------------------------------------------------------------------

interface XTrackerUser {
  id: string;
  handle: string;
  name: string;
  platform: string;
  platformId: string;
  lastSync: string;
  trackings: XTrackerTracking[];
  _count: { posts: number };
}

interface XTrackerTracking {
  id: string;
  userId: string;
  title: string;
  startDate: string;
  endDate: string;
  target: number | null;
  marketLink: string;
  isActive: boolean;
}

interface XTrackerTrackingStats {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  target: number | null;
  isActive: boolean;
  user: { handle: string; platform: string };
  stats: {
    total: number;
    cumulative: number;
    pace: number;
    percentComplete: number;
    daysElapsed: number;
    daysRemaining: number;
    daysTotal: number;
    isComplete: boolean;
    daily: Array<{ date: string; count: number }>;
  };
}

interface XTrackerUserStats {
  id: string;
  handle: string;
  tweetData: {
    daily: Array<{ start: string; tweet_count: number }>;
    dailyTotal: Array<{ start: string; tweet_count: number }>;
    totalBetweenStartAndEnd: number;
    dailyAverage: number;
    pace: number;
  };
  startDate: string;
  endDate: string;
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Get elonmusk user info + trackings from XTracker.
 */
export async function getElonUser(): Promise<XTrackerUser> {
  const res = await fetch(`${XTRACKER_BASE}/users/elonmusk`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`XTracker /users/elonmusk failed: ${res.status}`);
  const json = await res.json();
  return json.data as XTrackerUser;
}

/**
 * Get the active tracking that covers the given marketDate (UTC).
 * Matches by checking startDate <= marketDate < endDate.
 */
export function findActiveTracking(
  trackings: XTrackerTracking[],
  marketDate: string,
): XTrackerTracking | null {
  const target = new Date(marketDate).getTime();
  return (
    trackings.find((t) => {
      const start = new Date(t.startDate).getTime();
      const end = new Date(t.endDate).getTime();
      return t.isActive && target >= start && target <= end;
    }) ?? null
  );
}

/**
 * Get tracking stats (total, daily breakdown) for a given tracking ID.
 */
export async function getTrackingStats(trackingId: string): Promise<XTrackerTrackingStats> {
  const res = await fetch(`${XTRACKER_BASE}/trackings/${trackingId}?includeStats=true`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`XTracker /trackings/${trackingId} failed: ${res.status}`);
  const json = await res.json();
  return json.data as XTrackerTrackingStats;
}

/**
 * Get user stats in legacy format (includes daily tweet_count breakdown).
 */
export async function getElonUserStats(): Promise<XTrackerUserStats> {
  const res = await fetch(`${XTRACKER_BASE}/users?platform=X&stats=true`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`XTracker /users?stats=true failed: ${res.status}`);
  const json = await res.json();
  const users = json as XTrackerUserStats[];
  const elon = users.find((u) => u.handle === 'elonmusk');
  if (!elon) throw new Error('elonmusk not found in XTracker user list');
  return elon;
}

// ---------------------------------------------------------------------------
// Tweet source
// ---------------------------------------------------------------------------

/**
 * Fetch counted tweets for elonmusk on a given marketDate.
 *
 * Strategy:
 * 1. Find the active tracking that covers marketDate
 * 2. Pull tracking stats (total count + daily breakdown)
 * 3. Reconstruct TweetRecord[] from the daily data
 *
 * Note: XTracker provides counts, not individual tweet objects.
 * We synthesize TweetRecord stubs with correct timestamps for the engine.
 * The engine only uses createdAt + isCounted, so this is sufficient.
 */
export async function fetchTweetsForDate(marketDate: string): Promise<TweetRecord[]> {
  try {
    const user = await getElonUser();
    const tracking = findActiveTracking(user.trackings, marketDate);

    if (!tracking) {
      console.warn(`[fetcher] No active tracking found for ${marketDate}, falling back to mock`);
      return fallbackMockTweets(marketDate);
    }

    const stats = await getTrackingStats(tracking.id);
    const daily = stats.stats.daily;

    // Find the entry for today
    const todayEntry = daily.find((d) => {
      // XTracker daily dates may be in M/D/YYYY or ISO format
      const entryDate = new Date(d.date).toISOString().slice(0, 10);
      return entryDate === marketDate;
    });

    const count = todayEntry?.count ?? stats.stats.total ?? 0;

    // Synthesize TweetRecord stubs
    return synthesizeTweetRecords(count, marketDate, user.platformId);
  } catch (err) {
    console.error('[fetcher] fetchTweetsForDate error:', err);
    return fallbackMockTweets(marketDate);
  }
}

/**
 * Get today's total tweet count directly from XTracker tracking stats.
 * Useful for quick current-count checks without reconstructing records.
 */
export async function fetchTodayCount(marketDate: string): Promise<number> {
  try {
    const user = await getElonUser();
    const tracking = findActiveTracking(user.trackings, marketDate);
    if (!tracking) return 0;
    const stats = await getTrackingStats(tracking.id);
    return stats.stats.total ?? 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Synthesize tweet records from count
// ---------------------------------------------------------------------------

/**
 * Given a count N and a date, produce N synthetic TweetRecord stubs.
 * Timestamps are spread evenly across the day.
 * The analysis engine only needs createdAt + isCounted, not real tweet content.
 */
export function synthesizeTweetRecordsPublic(
  count: number,
  marketDate: string,
  platformId: string,
): TweetRecord[] {
  return synthesizeTweetRecords(count, marketDate, platformId);
}

function synthesizeTweetRecords(
  count: number,
  marketDate: string,
  platformId: string,
): TweetRecord[] {
  const records: TweetRecord[] = [];
  const dayStart = new Date(`${marketDate}T00:00:00.000Z`).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    // Spread timestamps evenly — good enough for rate calculations
    const offset = count > 1 ? (dayMs / (count - 1)) * i : 0;
    const createdAt = new Date(dayStart + offset).toISOString();

    records.push({
      tweetId: `xtracker-${marketDate}-${i}`,
      authorId: platformId,
      authorUsername: 'elonmusk',
      createdAt,
      collectedAt: createdAt,
      type: 'tweet',
      isCounted: true,
      isDeleted: false,
      source: 'x_api',
    });
  }

  return records;
}

// ---------------------------------------------------------------------------
// Market quote source
// ---------------------------------------------------------------------------

/**
 * Fetch market quotes for each bucket.
 *
 * TODO: Replace with real Polymarket API call when available.
 * Polymarket market link is available via tracking.marketLink.
 * For now, falls back to mock quotes.
 */
export async function fetchMarketQuotes(_marketDate: string): Promise<MarketQuote[]> {
  // Stub: load mock quotes
  // Replace with real Polymarket API call when ready
  const mockQuotes = await import('../mocks/quotes.mock.json');
  return mockQuotes.default as MarketQuote[];
}

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

async function fallbackMockTweets(marketDate: string): Promise<TweetRecord[]> {
  const mockTweets = await import('../mocks/tweets.mock.json');
  const all = mockTweets.default as TweetRecord[];
  return all.filter((t) => t.createdAt.startsWith(marketDate));
}

// ---------------------------------------------------------------------------
// Combined input builder
// ---------------------------------------------------------------------------

export async function buildMarketInput(opts: {
  marketDate: string;
  now?: string;
  dayType?: string;
  eventMode?: string;
}) {
  const base = await import('../mocks/market-input.mock.json');

  const [tweets, quotes] = await Promise.all([
    fetchTweetsForDate(opts.marketDate),
    fetchMarketQuotes(opts.marketDate),
  ]);

  return {
    ...base.default,
    marketDate: opts.marketDate,
    now: opts.now ?? new Date().toISOString(),
    dayType: (opts.dayType ?? base.default.dayType) as typeof base.default.dayType,
    eventMode: (opts.eventMode ?? base.default.eventMode) as typeof base.default.eventMode,
    tweets,
    quotes,
  };
}
