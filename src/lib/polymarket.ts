/**
 * polymarket.ts
 * Fetch real-time market quotes from Polymarket Gamma API.
 *
 * Strategy:
 * 1. Get the active event slug from XTracker marketLink
 * 2. Fetch the event to discover all bucket sub-markets
 * 3. Pull lastTradePrice / bestBid / bestAsk for each bucket
 * 4. Return as MarketQuote[] for the analysis engine
 */

import type { MarketQuote } from './types';

const GAMMA_BASE = 'https://gamma-api.polymarket.com';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PolymarketBucket {
  bucketId: string;      // e.g. "b1"
  label: string;         // e.g. "0-19"
  slug: string;          // e.g. "elon-musk-of-tweets-march-24-march-31-0-19"
  conditionId: string;
  question: string;
  lastTradePrice: number;
  bestBid: number | null;
  bestAsk: number | null;
  volume: number;
  liquidity: number;
  endDate: string;
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
}

interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
  volume?: string;
  liquidity?: string;
  outcomePrices?: string;
  groupItemTitle?: string;
  groupItemThreshold?: string;
  negRisk?: boolean;
  negRiskMarketID?: string;
}

// ---------------------------------------------------------------------------
// Extract event slug from Polymarket event URL
// ---------------------------------------------------------------------------

export function extractEventSlug(marketLink: string): string | null {
  try {
    const url = new URL(marketLink);
    // e.g. /event/elon-musk-of-tweets-march-24-march-31
    const parts = url.pathname.split('/');
    const eventIdx = parts.indexOf('event');
    return eventIdx >= 0 ? parts[eventIdx + 1] : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetch event and its sub-markets by event slug
// ---------------------------------------------------------------------------

export async function fetchEventMarkets(eventSlug: string): Promise<GammaMarket[]> {
  // Fetch the event to get all sub-market slugs
  const eventRes = await fetch(
    `${GAMMA_BASE}/events?slug=${encodeURIComponent(eventSlug)}&limit=1`,
    { next: { revalidate: 30 } }
  );
  if (!eventRes.ok) throw new Error(`Gamma events fetch failed: ${eventRes.status}`);
  const events = await eventRes.json();

  if (!events || events.length === 0) {
    throw new Error(`No event found for slug: ${eventSlug}`);
  }

  const event = events[0];
  const markets: GammaMarket[] = event.markets ?? [];

  if (markets.length > 0) return markets;

  // If markets not embedded, fetch them by negRiskMarketID if available
  if (event.negRiskMarketID) {
    const mRes = await fetch(
      `${GAMMA_BASE}/markets?neg_risk_market_id=${event.negRiskMarketID}&limit=30`,
      { next: { revalidate: 30 } }
    );
    if (mRes.ok) {
      const data = await mRes.json();
      if (Array.isArray(data) && data.length > 0 && data[0].conditionId) return data;
    }
  }

  // Fallback: fetch individual bucket slugs by convention
  // Slug convention: {eventSlug}-{lower}-{upper}
  return [];
}

// ---------------------------------------------------------------------------
// Parse bucket range from market slug or groupItemTitle
// ---------------------------------------------------------------------------

function parseBucketLabel(market: GammaMarket, eventSlug: string): string {
  // Try groupItemTitle first (most reliable)
  if (market.groupItemTitle) return market.groupItemTitle;

  // Try to parse from slug: remove event slug prefix and trailing -yes/-no
  const suffix = market.slug
    .replace(`${eventSlug}-`, '')
    .replace(/-yes$/, '')
    .replace(/-no$/, '');

  // Convert "60-79" or "100-plus" etc
  return suffix.replace('-plus', '+').replace('-or-more', '+');
}

// ---------------------------------------------------------------------------
// Main: fetch Polymarket quotes for a given XTracker marketLink
// ---------------------------------------------------------------------------

export async function fetchPolymarketQuotes(
  marketLink: string
): Promise<MarketQuote[]> {
  const eventSlug = extractEventSlug(marketLink);
  if (!eventSlug) {
    console.warn('[polymarket] Could not extract event slug from:', marketLink);
    return [];
  }

  let markets: GammaMarket[];
  try {
    markets = await fetchEventMarkets(eventSlug);
  } catch (err) {
    console.error('[polymarket] fetchEventMarkets error:', err);
    return [];
  }

  if (markets.length === 0) {
    console.warn('[polymarket] No markets found for event:', eventSlug);
    return [];
  }

  const now = new Date().toISOString();

  return markets
    .filter((m) => {
      // Only include bucket markets (neg_risk = true means it's a multi-outcome bucket)
      // Filter out any clearly unrelated markets
      return m.slug.startsWith(eventSlug);
    })
    .map((m, idx) => {
      const label = parseBucketLabel(m, eventSlug);

      // outcomePrices is JSON string: ["0.3", "0.7"] — first is Yes price
      let yesPrice = m.lastTradePrice ?? 0;
      if (!yesPrice && m.outcomePrices) {
        try {
          const prices = JSON.parse(m.outcomePrices) as string[];
          yesPrice = parseFloat(prices[0]) || 0;
        } catch { /* ignore */ }
      }

      return {
        bucketId: `poly-${idx}`,
        rawPrice: yesPrice,
        bid: m.bestBid ?? null,
        ask: m.bestAsk ?? null,
        last: m.lastTradePrice ?? null,
        volume: m.volume ? parseFloat(m.volume) : null,
        liquidity: m.liquidity ? parseFloat(m.liquidity) : null,
        timestamp: now,
        source: 'polymarket' as const,
        // Extra metadata for display
        label,
        slug: m.slug,
        conditionId: m.conditionId,
        active: m.active,
        closed: m.closed,
        acceptingOrders: m.acceptingOrders,
        endDate: m.endDate,
      } as MarketQuote & Record<string, unknown>;
    });
}

// ---------------------------------------------------------------------------
// Fetch a single bucket by slug (useful for targeted price checks)
// ---------------------------------------------------------------------------

export async function fetchBucketBySlug(slug: string): Promise<GammaMarket | null> {
  const res = await fetch(
    `${GAMMA_BASE}/markets?slug=${encodeURIComponent(slug)}&limit=1`,
    { next: { revalidate: 30 } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

// ---------------------------------------------------------------------------
// Fetch all active Elon tweet markets from Polymarket
// ---------------------------------------------------------------------------

export async function fetchActiveElonMarkets(): Promise<{
  slug: string;
  title: string;
  endDate: string;
  marketLink: string;
  totalVolume: number;
  markets: GammaMarket[];
}[]> {
  // Search for active elon tweet markets via keyword
  const res = await fetch(
    `${GAMMA_BASE}/events?active=true&closed=false&limit=10&keyword=elon+musk+tweets`,
    { next: { revalidate: 60 } }
  );
  if (!res.ok) return [];
  const events = await res.json();
  if (!Array.isArray(events)) return [];

  return events
    .filter((e: Record<string, unknown>) =>
      typeof e.slug === 'string' &&
      (e.slug as string).includes('elon-musk-of-tweets')
    )
    .map((e: Record<string, unknown>) => ({
      slug: e.slug as string,
      title: e.title as string,
      endDate: e.endDate as string,
      marketLink: `https://polymarket.com/event/${e.slug}`,
      totalVolume: (e.volume as number) ?? 0,
      markets: (e.markets as GammaMarket[]) ?? [],
    }));
}
