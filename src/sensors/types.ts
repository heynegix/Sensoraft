export const SUPPORTED_SENSOR_TYPES = ['accelerometer', 'gyroscope', 'magnetometer'] as const;

export type SensorType = (typeof SUPPORTED_SENSOR_TYPES)[number];

export interface SensorMetadata {
  readonly label: string;
  readonly axisUnit: string;
}

export const SENSOR_METADATA: Readonly<Record<SensorType, SensorMetadata>> = {
  accelerometer: {
    label: 'Accelerometer',
    axisUnit: 'g',
  },
  gyroscope: {
    label: 'Gyroscope',
    axisUnit: 'rad/s',
  },
  magnetometer: {
    label: 'Magnetometer',
    axisUnit: 'μT',
  },
};

export function isSupportedSensorType(value: unknown): value is SensorType {
  return typeof value === 'string' && (SUPPORTED_SENSOR_TYPES as readonly string[]).includes(value);
}

export interface Vector3SensorSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Normalized timestamp in milliseconds. */
  readonly timestamp: number;
}

export type SensorSample = Vector3SensorSample;
export type AccelerometerSample = Vector3SensorSample;
export type GyroscopeSample = Vector3SensorSample;
export type MagnetometerSample = Vector3SensorSample;

export interface SensorSubscription {
  remove(): void;
}

export interface SensorAdapter<Sample> {
  isAvailable(): Promise<boolean>;
  subscribe(listener: (sample: Sample) => void): SensorSubscription;
}

export interface SensorController<Sample> {
  readonly isRunning: boolean;
  start(listener: (sample: Sample) => void): Promise<boolean>;
  stop(): void;
}
