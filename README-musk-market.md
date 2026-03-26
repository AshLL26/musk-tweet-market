# Musk Tweet Market Prototype

This is a local prototype for a prediction-market dashboard focused on Elon Musk tweet-count interval markets.

## Included

- `src/lib/types.ts` — core types
- `src/lib/config.ts` — model config
- `src/lib/analysis.ts` — pricing and signal engine
- `src/mocks/*.json` — mock tweets / quotes / market input
- `src/app/api/market/full/route.ts` — full analysis endpoint
- `src/app/page.tsx` — minimal dashboard

## Suggested next steps

1. Add a real Next.js project scaffold if not already present
2. Replace mock tweet source with a live collector
3. Replace mock quotes with live market data
4. Calibrate base rates and state thresholds with historical data

## Notes

- Current model uses a simple Poisson approximation
- Good enough for MVP, not final production pricing
