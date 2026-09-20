export function rootMeanSquare(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const meanSquare = values.reduce((sum, value) => sum + value ** 2, 0) / values.length;
  return Math.sqrt(meanSquare);
}

export class RmsFilter {
  private readonly values: number[] = [];

  public constructor(private readonly windowSize: number) {
    if (!Number.isInteger(windowSize) || windowSize <= 0) {
      throw new Error('RMS window size must be a positive integer.');
    }
  }

  public add(value: number): number {
    this.values.push(value);
    if (this.values.length > this.windowSize) {
      this.values.shift();
    }

    return rootMeanSquare(this.values);
  }

  public reset(): void {
    this.values.length = 0;
  }
}
