export type TweetType = 'tweet' | 'reply' | 'quote' | 'repost';
export type MarketState = 'idle' | 'normal' | 'burst';
export type DayType = 'normal' | 'light_event' | 'heavy_event';
export type EventMode = 'none' | 'tesla' | 'spacex' | 'politics' | 'xai' | 'other';
export type ActionSignal = 'long' | 'short' | 'watch' | 'none';
export type ConfidenceLevel = 'low' | 'medium' | 'high';
export type ReachLabel = 'easy' | 'possible' | 'hard' | 'unlikely';

export interface TweetRecord {
  tweetId: string;
  authorId: string;
  authorUsername: string;
  createdAt: string;
  collectedAt: string;
  type: TweetType;
  text?: string;
  isDeleted: boolean;
  isCounted: boolean;
  source: 'x_api' | 'scraper' | 'manual';
}

export interface BucketConfig {
  bucketId: string;
  label: string;
  lowerBound: number;
  upperBound: number | null;
}

export interface ModelConfig {
  timezone: string;
  baseWeight: number;
  dynamicWeight: number;
  burstThreshold15m: number;
  burstThreshold60m: number;
  idleThreshold60m: number;
  eventBoosts: Record<DayType, number>;
  stateBoosts: Record<MarketState, number>;
  getTimeBoost?: (hourUtc: number) => number;
  edgeLongThreshold: number;
  edgeShortThreshold: number;
  valueLongThreshold: number;
  valueShortThreshold: number;
}

export interface MarketQuote {
  bucketId: string;
  rawPrice: number;
  bid?: number | null;
  ask?: number | null;
  last?: number | null;
  volume?: number | null;
  liquidity?: number | null;
  timestamp: string;
  source: 'manual' | 'polymarket' | 'custom';
}

export interface MarketInput {
  marketDate: string;
  now: string;
  timezone: string;
  tweets: TweetRecord[];
  bucketConfigs: BucketConfig[];
  quotes: MarketQuote[];
  dayType: DayType;
  eventMode: EventMode;
}

export interface RateMetrics {
  globalRate: number;
  rate15m: number;
  rate30m: number;
  rate60m: number;
  dynamicRate: number;
  baseRate: number;
  mixedRate: number;
  effectiveRate: number;
  momentumDirection: 'up' | 'flat' | 'down';
}

export interface MarketSnapshot {
  marketDate: string;
  now: string;
  currentTweetCount: number;
  timeElapsedHours: number;
  timeLeftHours: number;
  currentState: MarketState;
  dayType: DayType;
  eventMode: EventMode;
  eventBoost: number;
  stateBoost: number;
  timeBoost: number;
  rates: RateMetrics;
}

export interface BucketReachability {
  bucketId: string;
  requiredTweetsToHit: number;
  requiredRate: number | null;
  reachScore: number | null;
  reachLabel: ReachLabel;
}

export interface BucketPricing {
  bucketId: string;
  label: string;
  lowerBound: number;
  upperBound: number | null;
  modelProbability: number;
  marketProbability: number;
  normalizedMarketProbability: number;
  edge: number;
  valueRatio: number | null;
  requiredTweetsToHit: number;
  requiredRate: number | null;
  reachScore: number | null;
  reachLabel: ReachLabel;
  actionSignal: ActionSignal;
  confidence: ConfidenceLevel;
}

export interface TradingSignal {
  recommendation: string;
  topLongBucketId: string | null;
  topShortBucketId: string | null;
  topLongReason: string;
  topShortReason: string;
  riskWarning: string;
}

export interface MarketAnalysisResponse {
  snapshot: MarketSnapshot;
  buckets: BucketPricing[];
  signal: TradingSignal;
}
