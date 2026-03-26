/**
 * fetcher.ts
 * Real data source adapters.
 * Replace the mock implementations below with live data when ready.
 */

import type { TweetRecord, MarketQuote } from './types';

// ---------------------------------------------------------------------------
// Tweet source
// ---------------------------------------------------------------------------

/**
 * Fetch counted tweets for a given UTC date from your data source.
 *
 * TODO: Replace this stub with a real implementation, e.g.:
 *   - A Twitter/X API v2 timeline call
 *   - A database query to your tweet store
 *   - A call to a third-party tweet archive
 *
 * Rules applied here (adjust to match your market definition):
 *   - Include: original tweets + quote tweets
 *   - Exclude: replies, reposts, deleted posts
 */
export async function fetchTweetsForDate(marketDate: string): Promise<TweetRecord[]> {
  // --- STUB: load from mock file ---
  // Replace the lines below with your actual fetch logic.
  const mockTweets = await import('../mocks/tweets.mock.json');
  const all = mockTweets.default as TweetRecord[];

  // Filter to only tweets that belong to the marketDate (UTC)
  return all.filter((t) => t.createdAt.startsWith(marketDate));
}

// ---------------------------------------------------------------------------
// Market quote source
// ---------------------------------------------------------------------------

/**
 * Fetch current market quotes for each bucket from your prediction market source.
 *
 * TODO: Replace this stub with a real implementation, e.g.:
 *   - A Polymarket API call
 *   - A Kalshi API call
 *   - Your own manual input endpoint
 *
 * Each quote.rawPrice should be the market's last / mid price for that bucket
 * (0.0 – 1.0 scale, or 0–100 cents scale — just be consistent).
 */
export async function fetchMarketQuotes(marketDate: string): Promise<MarketQuote[]> {
  // --- STUB: load from mock file ---
  // Replace the lines below with your actual fetch logic.
  void marketDate;
  const mockQuotes = await import('../mocks/quotes.mock.json');
  return mockQuotes.default as MarketQuote[];
}

// ---------------------------------------------------------------------------
// Combined input builder
// ---------------------------------------------------------------------------

/**
 * Build the full MarketInput object for analyzeMarket().
 * Pulls tweets + quotes from real (or mock) sources.
 */
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
