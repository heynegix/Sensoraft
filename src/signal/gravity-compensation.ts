/**
 * Tracks the slow-changing magnitude baseline (including gravity) and keeps
 * only the absolute short-term deviation as the vibration amplitude.
 */
export class BaselineCompensator {
  private baseline: number | undefined;

  public constructor(private readonly alpha: number) {
    if (alpha <= 0 || alpha > 1) {
      throw new Error('Baseline compensation alpha must be greater than 0 and at most 1.');
    }
  }

  public process(value: number): number {
    if (this.baseline === undefined) {
      this.baseline = value;
      return 0;
    }

    const deviation = value - this.baseline;
    this.baseline += this.alpha * deviation;
    return Math.abs(deviation);
  }

  public reset(): void {
    this.baseline = undefined;
  }
}
