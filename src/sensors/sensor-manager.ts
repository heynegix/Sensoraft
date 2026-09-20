import type { SensorAdapter, SensorSubscription } from './types';

export class SensorUnavailableError extends Error {
  public constructor(sensorName: string) {
    super(`${sensorName} is not available on this device.`);
    this.name = 'SensorUnavailableError';
  }
}

export class SensorManager<Sample> {
  private subscription: SensorSubscription | null = null;
  private startRequestId = 0;

  public constructor(
    private readonly adapter: SensorAdapter<Sample>,
    private readonly sensorName: string,
  ) {}

  public get isRunning(): boolean {
    return this.subscription !== null;
  }

  /**
   * Starts the adapter after checking availability. The boolean is false when
   * a pending start was cancelled by stop(), which prevents late subscriptions
   * after a screen has already unmounted.
   */
  public async start(listener: (sample: Sample) => void): Promise<boolean> {
    const requestId = ++this.startRequestId;
    this.removeSubscription();

    let isAvailable: boolean;
    try {
      isAvailable = await this.adapter.isAvailable();
    } catch (error) {
      // A stopped or superseded request must not surface an obsolete error to
      // the caller, where it could cancel a newer start attempt.
      if (requestId !== this.startRequestId) {
        return false;
      }

      throw error;
    }

    if (requestId !== this.startRequestId) {
      return false;
    }

    if (!isAvailable) {
      throw new SensorUnavailableError(this.sensorName);
    }

    this.subscription = this.adapter.subscribe(listener);
    return true;
  }

  public stop(): void {
    this.startRequestId += 1;
    this.removeSubscription();
  }

  private removeSubscription(): void {
    this.subscription?.remove();
    this.subscription = null;
  }
}
