import type { SensorAdapter, SensorSubscription, Vector3SensorSample } from './types';

interface ExpoVector3Measurement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Expo Sensors timestamps are expressed in seconds. */
  readonly timestamp: number;
}

interface ExpoVector3Sensor {
  isAvailableAsync(): Promise<boolean>;
  setUpdateInterval(intervalMs: number): void;
  addListener(listener: (measurement: ExpoVector3Measurement) => void): SensorSubscription;
}

export class Vector3SensorSource implements SensorAdapter<Vector3SensorSample> {
  public constructor(
    private readonly sensor: ExpoVector3Sensor,
    private readonly updateIntervalMs: number,
  ) {}

  public isAvailable(): Promise<boolean> {
    return this.sensor.isAvailableAsync();
  }

  public subscribe(listener: (sample: Vector3SensorSample) => void): SensorSubscription {
    this.sensor.setUpdateInterval(this.updateIntervalMs);

    const subscription = this.sensor.addListener((measurement) => {
      listener({
        x: measurement.x,
        y: measurement.y,
        z: measurement.z,
        timestamp: measurement.timestamp * 1000,
      });
    });

    return {
      remove: () => subscription.remove(),
    };
  }
}
