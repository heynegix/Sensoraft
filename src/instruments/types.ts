export type SensorType = 'accelerometer' | 'gyroscope' | 'magnetometer' | 'barometer';

export type TransformType =
  'magnitude' | 'gravityCompensation' | 'highPass' | 'movingAverage' | 'rms';

export type DisplayType = 'line' | 'number' | 'gauge';

export interface PipelineOperation {
  readonly op: TransformType;
  readonly windowSize?: number;
}

export interface InstrumentDisplayDefinition {
  readonly type: DisplayType;
  readonly unit: string;
  readonly decimals?: number;
}

export interface InstrumentDefinition {
  readonly id: string;
  readonly name: string;
  readonly sensor: SensorType;
  readonly pipeline: readonly PipelineOperation[];
  readonly display: InstrumentDisplayDefinition;
}
