import type { ModelConfig } from './types';

export const defaultModelConfig: ModelConfig = {
  timezone: 'UTC',
  baseWeight: 0.7,
  dynamicWeight: 0.3,
  burstThreshold15m: 8,
  burstThreshold60m: 4,
  idleThreshold60m: 0.5,
  eventBoosts: {
    normal: 1.0,
    light_event: 1.2,
    heavy_event: 1.45,
  },
  stateBoosts: {
    idle: 0.9,
    normal: 1.0,
    burst: 1.35,
  },
  getTimeBoost: (hourUtc: number) => {
    if (hourUtc >= 13 && hourUtc <= 23) return 1.1;
    if (hourUtc >= 0 && hourUtc <= 5) return 0.85;
    return 1.0;
  },
  edgeLongThreshold: 0.08,
  edgeShortThreshold: -0.08,
  valueLongThreshold: 1.2,
  valueShortThreshold: 0.85,
};
