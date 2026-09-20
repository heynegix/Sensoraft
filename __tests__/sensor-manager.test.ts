import { SensorManager } from '../src/sensors/sensor-manager';
import type { SensorAdapter, SensorSubscription } from '../src/sensors/types';

class FakeSensorAdapter implements SensorAdapter<number> {
  public available = true;
  public subscribeCalls = 0;
  public readonly remove = jest.fn();
  private listener: ((sample: number) => void) | null = null;

  public isAvailable(): Promise<boolean> {
    return Promise.resolve(this.available);
  }

  public subscribe(listener: (sample: number) => void): SensorSubscription {
    this.subscribeCalls += 1;
    this.listener = listener;
    return { remove: this.remove };
  }

  public emit(sample: number): void {
    this.listener?.(sample);
  }
}

describe('SensorManager', () => {
  it('removes an active subscription when stopped', async () => {
    const adapter = new FakeSensorAdapter();
    const manager = new SensorManager(adapter, 'Fake sensor');
    const listener = jest.fn();

    await expect(manager.start(listener)).resolves.toBe(true);
    expect(manager.isRunning).toBe(true);

    adapter.emit(42);
    expect(listener).toHaveBeenCalledWith(42);

    manager.stop();
    expect(adapter.remove).toHaveBeenCalledTimes(1);
    expect(manager.isRunning).toBe(false);
  });

  it('cancels a pending start before subscribing', async () => {
    const adapter = new FakeSensorAdapter();
    let resolveAvailability: (available: boolean) => void = () => undefined;
    adapter.isAvailable = () =>
      new Promise((resolve) => {
        resolveAvailability = resolve;
      });
    const manager = new SensorManager(adapter, 'Fake sensor');

    const startPromise = manager.start(jest.fn());
    manager.stop();
    resolveAvailability(true);

    await expect(startPromise).resolves.toBe(false);
    expect(adapter.subscribeCalls).toBe(0);
    expect(manager.isRunning).toBe(false);
  });

  it('ignores an availability rejection from a superseded start', async () => {
    const adapter = new FakeSensorAdapter();
    let rejectFirst: (reason?: unknown) => void = () => undefined;
    const firstAvailability = new Promise<boolean>((_, reject) => {
      rejectFirst = reject;
    });
    adapter.isAvailable = jest
      .fn<Promise<boolean>, []>()
      .mockReturnValueOnce(firstAvailability)
      .mockResolvedValueOnce(true);
    const manager = new SensorManager(adapter, 'Fake sensor');

    const firstStart = manager.start(jest.fn());
    const secondStart = manager.start(jest.fn());
    rejectFirst(new Error('late availability failure'));

    await expect(firstStart).resolves.toBe(false);
    await expect(secondStart).resolves.toBe(true);
    expect(adapter.subscribeCalls).toBe(1);

    manager.stop();
  });
});
