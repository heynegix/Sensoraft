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

export function getChartSampleIntervalMs(samples: readonly ChartSample[]): number {
  if (samples.length < 2) {
    return 0;
  }

  let intervalTotalMs = 0;
  let intervalCount = 0;

  for (let index = 1; index < samples.length; index += 1) {
    const previousSample = samples[index - 1];
    const currentSample = samples[index];

    if (previousSample === undefined || currentSample === undefined) {
      continue;
    }

    const intervalMs = currentSample.timestamp - previousSample.timestamp;
    if (Number.isFinite(intervalMs) && intervalMs > 0) {
      intervalTotalMs += intervalMs;
      intervalCount += 1;
    }
  }

  return intervalCount === 0 ? 0 : intervalTotalMs / intervalCount;
}

export function getChartDurationMs(samples: readonly ChartSample[]): number {
  const elapsedMs = getChartElapsedMs(samples);
  // Keep the existing N-sample chart window while deriving the interval from UI history.
  return elapsedMs === 0 ? 0 : elapsedMs + getChartSampleIntervalMs(samples);
}
