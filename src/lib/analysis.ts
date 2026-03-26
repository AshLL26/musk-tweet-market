import type {
  BucketConfig,
  BucketPricing,
  BucketReachability,
  ConfidenceLevel,
  DayType,
  MarketAnalysisResponse,
  MarketInput,
  MarketQuote,
  MarketState,
  ModelConfig,
  ReachLabel,
  TradingSignal,
  TweetRecord,
} from './types';

function filterCountedTweets(tweets: TweetRecord[]): TweetRecord[] {
  return tweets.filter((t) => t.isCounted && !t.isDeleted);
}

function getDayProgress(nowIso: string, marketDate: string) {
  const start = new Date(`${marketDate}T00:00:00.000Z`);
  const end = new Date(`${marketDate}T23:59:59.999Z`);
  const now = new Date(nowIso);

  const elapsedMs = Math.max(0, now.getTime() - start.getTime());
  const totalMs = end.getTime() - start.getTime();
  const leftMs = Math.max(0, end.getTime() - now.getTime());

  return {
    timeElapsedHours: Math.min(totalMs, elapsedMs) / 3600000,
    timeLeftHours: leftMs / 3600000,
  };
}

function countTweetsInLastMinutes(tweets: TweetRecord[], nowIso: string, minutes: number): number {
  const now = new Date(nowIso).getTime();
  const cutoff = now - minutes * 60 * 1000;
  return tweets.filter((t) => new Date(t.createdAt).getTime() >= cutoff).length;
}

function hourlyRateFromRecentCount(count: number, minutes: number): number {
  if (minutes <= 0) return 0;
  return count * (60 / minutes);
}

function getDynamicRate(rate15m: number, rate30m: number, rate60m: number): number {
  return rate15m * 0.5 + rate30m * 0.3 + rate60m * 0.2;
}

function getBaseRate(dayType: DayType): number {
  switch (dayType) {
    case 'heavy_event':
      return 2.0;
    case 'light_event':
      return 1.4;
    case 'normal':
    default:
      return 1.0;
  }
}

function getMixedRate(baseRate: number, dynamicRate: number, config: ModelConfig): number {
  if (dynamicRate > baseRate) {
    return baseRate * config.baseWeight + dynamicRate * config.dynamicWeight;
  }
  return baseRate;
}

function detectMarketState(rate15m: number, rate60m: number, config: ModelConfig): MarketState {
  if (rate15m >= config.burstThreshold15m || rate60m >= config.burstThreshold60m) {
    return 'burst';
  }
  if (rate60m <= config.idleThreshold60m) {
    return 'idle';
  }
  return 'normal';
}

function defaultTimeBoost(hourUtc: number): number {
  if (hourUtc >= 13 && hourUtc <= 23) return 1.1;
  if (hourUtc >= 0 && hourUtc <= 5) return 0.85;
  return 1.0;
}

function getEffectiveRate(
  mixedRate: number,
  dayType: DayType,
  state: MarketState,
  nowIso: string,
  config: ModelConfig,
) {
  const now = new Date(nowIso);
  const hourUtc = now.getUTCHours();
  const eventBoost = config.eventBoosts[dayType] ?? 1.0;
  const stateBoost = config.stateBoosts[state] ?? 1.0;
  const timeBoost = config.getTimeBoost ? config.getTimeBoost(hourUtc) : defaultTimeBoost(hourUtc);
  const effectiveRate = mixedRate * eventBoost * stateBoost * timeBoost;
  return { effectiveRate, eventBoost, stateBoost, timeBoost };
}

function getRemainingLambda(effectiveRate: number, timeLeftHours: number): number {
  return Math.max(0, effectiveRate * timeLeftHours);
}

function normalizeMarketProbabilities(quotes: MarketQuote[]): Record<string, number> {
  const total = quotes.reduce((sum, q) => sum + q.rawPrice, 0);
  const result: Record<string, number> = {};
  for (const q of quotes) {
    result[q.bucketId] = total > 0 ? q.rawPrice / total : 0;
  }
  return result;
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
}

function poissonPmf(k: number, lambda: number): number {
  if (k < 0) return 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function poissonRangeProb(minK: number, maxK: number, lambda: number): number {
  if (maxK < minK) return 0;
  let sum = 0;
  for (let k = minK; k <= maxK; k += 1) sum += poissonPmf(k, lambda);
  return sum;
}

function poissonTailProb(minK: number, lambda: number, cap = 200): number {
  let sum = 0;
  for (let k = minK; k <= cap; k += 1) sum += poissonPmf(k, lambda);
  return sum;
}

function getBucketModelProbability(currentTweetCount: number, bucket: BucketConfig, lambdaRemain: number): number {
  const minAdditional = Math.max(0, bucket.lowerBound - currentTweetCount);
  if (bucket.upperBound === null) {
    return poissonTailProb(minAdditional, lambdaRemain);
  }
  const maxAdditional = bucket.upperBound - currentTweetCount;
  if (maxAdditional < 0) return 0;
  return poissonRangeProb(minAdditional, maxAdditional, lambdaRemain);
}

function getReachability(
  currentTweetCount: number,
  timeLeftHours: number,
  effectiveRate: number,
  bucket: BucketConfig,
): BucketReachability {
  const requiredTweetsToHit = Math.max(0, bucket.lowerBound - currentTweetCount);

  if (requiredTweetsToHit === 0) {
    return {
      bucketId: bucket.bucketId,
      requiredTweetsToHit,
      requiredRate: 0,
      reachScore: null,
      reachLabel: 'easy',
    };
  }

  if (timeLeftHours <= 0) {
    return {
      bucketId: bucket.bucketId,
      requiredTweetsToHit,
      requiredRate: null,
      reachScore: null,
      reachLabel: 'unlikely',
    };
  }

  const requiredRate = requiredTweetsToHit / timeLeftHours;
  const reachScore = requiredRate > 0 ? effectiveRate / requiredRate : null;

  let reachLabel: ReachLabel = 'unlikely';
  if (reachScore !== null) {
    if (reachScore >= 1) reachLabel = 'easy';
    else if (reachScore >= 0.7) reachLabel = 'possible';
    else if (reachScore >= 0.4) reachLabel = 'hard';
  }

  return {
    bucketId: bucket.bucketId,
    requiredTweetsToHit,
    requiredRate,
    reachScore,
    reachLabel,
  };
}

function getConfidence(edge: number, reachLabel: ReachLabel): ConfidenceLevel {
  const absEdge = Math.abs(edge);
  if (absEdge >= 0.12 && (reachLabel === 'easy' || reachLabel === 'possible')) return 'high';
  if (absEdge >= 0.06) return 'medium';
  return 'low';
}

function getActionSignal(edge: number, valueRatio: number | null, reachLabel: ReachLabel, config: ModelConfig) {
  if (
    edge >= config.edgeLongThreshold &&
    valueRatio !== null &&
    valueRatio >= config.valueLongThreshold &&
    (reachLabel === 'easy' || reachLabel === 'possible')
  ) {
    return 'long' as const;
  }

  if (
    edge <= config.edgeShortThreshold &&
    valueRatio !== null &&
    valueRatio <= config.valueShortThreshold
  ) {
    return 'short' as const;
  }

  if (Math.abs(edge) >= 0.05) return 'watch' as const;
  return 'none' as const;
}

export function analyzeMarket(input: MarketInput, config: ModelConfig): MarketAnalysisResponse {
  const countedTweets = filterCountedTweets(input.tweets);
  const { timeElapsedHours, timeLeftHours } = getDayProgress(input.now, input.marketDate);
  const currentTweetCount = countedTweets.length;

  const tweets15m = countTweetsInLastMinutes(countedTweets, input.now, 15);
  const tweets30m = countTweetsInLastMinutes(countedTweets, input.now, 30);
  const tweets60m = countTweetsInLastMinutes(countedTweets, input.now, 60);

  const rate15m = hourlyRateFromRecentCount(tweets15m, 15);
  const rate30m = hourlyRateFromRecentCount(tweets30m, 30);
  const rate60m = hourlyRateFromRecentCount(tweets60m, 60);

  const globalRate = timeElapsedHours > 0 ? currentTweetCount / timeElapsedHours : 0;
  const baseRate = getBaseRate(input.dayType);
  const dynamicRate = getDynamicRate(rate15m, rate30m, rate60m);
  const mixedRate = getMixedRate(Math.max(baseRate, globalRate), dynamicRate, config);
  const currentState = detectMarketState(rate15m, rate60m, config);

  const { effectiveRate, eventBoost, stateBoost, timeBoost } = getEffectiveRate(
    mixedRate,
    input.dayType,
    currentState,
    input.now,
    config,
  );

  const lambdaRemain = getRemainingLambda(effectiveRate, timeLeftHours);
  const normalizedMarketMap = normalizeMarketProbabilities(input.quotes);
  const rawMarketMap = Object.fromEntries(input.quotes.map((q) => [q.bucketId, q.rawPrice]));

  const buckets: BucketPricing[] = input.bucketConfigs.map((bucket) => {
    const modelProbability = getBucketModelProbability(currentTweetCount, bucket, lambdaRemain);
    const marketProbability = rawMarketMap[bucket.bucketId] ?? 0;
    const normalizedMarketProbability = normalizedMarketMap[bucket.bucketId] ?? 0;
    const edge = modelProbability - normalizedMarketProbability;
    const valueRatio = normalizedMarketProbability > 0 ? modelProbability / normalizedMarketProbability : null;
    const reach = getReachability(currentTweetCount, timeLeftHours, effectiveRate, bucket);
    const actionSignal = getActionSignal(edge, valueRatio, reach.reachLabel, config);
    const confidence = getConfidence(edge, reach.reachLabel);

    return {
      bucketId: bucket.bucketId,
      label: bucket.label,
      lowerBound: bucket.lowerBound,
      upperBound: bucket.upperBound,
      modelProbability,
      marketProbability,
      normalizedMarketProbability,
      edge,
      valueRatio,
      requiredTweetsToHit: reach.requiredTweetsToHit,
      requiredRate: reach.requiredRate,
      reachScore: reach.reachScore,
      reachLabel: reach.reachLabel,
      actionSignal,
      confidence,
    };
  });

  const bestLong = buckets.filter((b) => b.actionSignal === 'long').sort((a, b) => b.edge - a.edge)[0] ?? null;
  const bestShort = buckets.filter((b) => b.actionSignal === 'short').sort((a, b) => a.edge - b.edge)[0] ?? null;

  const signal: TradingSignal = {
    recommendation: bestLong && bestShort
      ? `Bias long ${bestLong.label}, fade ${bestShort.label}`
      : bestLong
        ? `Consider long ${bestLong.label}`
        : bestShort
          ? `Consider short ${bestShort.label}`
          : 'No strong edge right now',
    topLongBucketId: bestLong?.bucketId ?? null,
    topShortBucketId: bestShort?.bucketId ?? null,
    topLongReason: bestLong
      ? `Model ${Math.round(bestLong.modelProbability * 100)}% vs market ${Math.round(bestLong.normalizedMarketProbability * 100)}%`
      : '',
    topShortReason: bestShort
      ? `Model ${Math.round(bestShort.modelProbability * 100)}% vs market ${Math.round(bestShort.normalizedMarketProbability * 100)}%`
      : '',
    riskWarning: currentState === 'burst'
      ? 'Current signal depends on burst continuation.'
      : 'Signal may change quickly if posting tempo shifts.',
  };

  return {
    snapshot: {
      marketDate: input.marketDate,
      now: input.now,
      currentTweetCount,
      timeElapsedHours,
      timeLeftHours,
      currentState,
      dayType: input.dayType,
      eventMode: input.eventMode,
      eventBoost,
      stateBoost,
      timeBoost,
      rates: {
        globalRate,
        rate15m,
        rate30m,
        rate60m,
        dynamicRate,
        baseRate,
        mixedRate,
        effectiveRate,
        momentumDirection: dynamicRate > globalRate ? 'up' : dynamicRate < globalRate ? 'down' : 'flat',
      },
    },
    buckets,
    signal,
  };
}
