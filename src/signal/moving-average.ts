export function movingAverage(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export class MovingAverageFilter {
  private readonly values: number[] = [];

  public constructor(private readonly windowSize: number) {
    if (!Number.isInteger(windowSize) || windowSize <= 0) {
      throw new Error('Moving average window size must be a positive integer.');
    }
  }

  public add(value: number): number {
    this.values.push(value);
    if (this.values.length > this.windowSize) {
      this.values.shift();
    }

    return movingAverage(this.values);
  }

  public reset(): void {
    this.values.length = 0;
  }
}
