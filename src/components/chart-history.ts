export interface ChartSample {
  readonly timestamp: number;
  readonly value: number;
}

export function getChartElapsedMs(samples: readonly ChartSample[]): number {
  if (samples.length < 2) {
    return 0;
  }

  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];

  if (firstSample === undefined || lastSample === undefined) {
    return 0;
  }

  const elapsedMs = lastSample.timestamp - firstSample.timestamp;
  return Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
}
