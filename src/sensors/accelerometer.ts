import { Accelerometer } from 'expo-sensors';

import type { AccelerometerSample, SensorAdapter, SensorSubscription } from './types';

export class AccelerometerSource implements SensorAdapter<AccelerometerSample> {
  public constructor(private readonly updateIntervalMs: number) {}

  public isAvailable(): Promise<boolean> {
    return Accelerometer.isAvailableAsync();
  }

  public subscribe(listener: (sample: AccelerometerSample) => void): SensorSubscription {
    Accelerometer.setUpdateInterval(this.updateIntervalMs);

    const subscription = Accelerometer.addListener((measurement) => {
      listener({
        x: measurement.x,
        y: measurement.y,
        z: measurement.z,
        // expo-sensors reports this timestamp in seconds.
        timestamp: measurement.timestamp * 1000,
      });
    });

    return {
      remove: () => subscription.remove(),
    };
  }
}
