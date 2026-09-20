export interface AccelerometerSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Epoch timestamp in milliseconds. */
  readonly timestamp: number;
}

export interface SensorSubscription {
  remove(): void;
}

export interface SensorAdapter<Sample> {
  isAvailable(): Promise<boolean>;
  subscribe(listener: (sample: Sample) => void): SensorSubscription;
}
