import type { SensorType } from '../../sensors/types';

export type { SensorType } from '../../sensors/types';

export type PipelineValueType = 'vector3' | 'scalar';

export type TransformType = 'gravityCompensation' | 'magnitude' | 'movingAverage' | 'rms' | 'scale';

export interface InstrumentSensorDefinition {
  readonly type: SensorType;
  readonly sampleRateHz: number;
}

export interface GravityCompensationOperation {
  readonly op: 'gravityCompensation';
  readonly alpha: number;
}

export interface MagnitudeOperation {
  readonly op: 'magnitude';
}

export interface MovingAverageOperation {
  readonly op: 'movingAverage';
  readonly windowSize: number;
}

export interface RmsOperation {
  readonly op: 'rms';
  readonly windowSize: number;
}

export interface ScaleOperation {
  readonly op: 'scale';
  readonly factor: number;
}

export type PipelineOperation =
  | GravityCompensationOperation
  | MagnitudeOperation
  | MovingAverageOperation
  | RmsOperation
  | ScaleOperation;

export type DisplayType = 'line' | 'number';

export interface InstrumentDisplayDefinition {
  readonly type: DisplayType;
  readonly label: string;
  readonly unit: string;
  readonly precision: number;
}

export interface InstrumentDefinition {
  readonly version: 1;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sensor: InstrumentSensorDefinition;
  readonly pipeline: readonly PipelineOperation[];
  readonly display: InstrumentDisplayDefinition;
}
